"""FinMate supervisor architecture on Google ADK.

One Orchestrator Agent talks to the user and delegates to four specialist agents (wrapped as
AgentTools so the Orchestrator stays in control and combines their answers). Every specialist
reaches its tools through the FinMate MCP server and sees only its own subset.

Identity is never delegated to the model. Each MCP call carries a short-lived signed tool token minted from the
Runner's authenticated user id (`McpToolset(header_provider=...)`), and the tool server derives the user from that
token alone (identity.py). The prompts therefore do not mention user ids at all.
"""
import os
from pathlib import Path

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools import AgentTool
from google.adk.tools.mcp_tool import McpToolset, StreamableHTTPConnectionParams
from google.genai import types

from . import db, identity, llm
from .mcp_server import mcp_url

BACKEND_DIR = Path(__file__).resolve().parent.parent

RECEIPT_TOOLS = ["ocr_receipt", "propose_bill", "save_bill", "transcribe_voice", "propose_expense", "save_expense"]
BUDGET_TOOLS = ["get_budget_status", "set_budget", "get_alerts"]
FAMILY_TOOLS = ["get_user_role", "get_family_view", "add_family_member"]
INSIGHTS_TOOLS = ["get_expenses", "analyze_trends", "suggest_alternatives",
                  "get_advice_history", "save_advice"]


def _tool_headers(ctx: ReadonlyContext) -> dict[str, str]:
    """Called by ADK on every tool call/listing. `ctx.user_id` is the Runner's user, i.e. the verified login."""
    return {"Authorization": f"Bearer {identity.mint_tool_token(ctx.user_id)}"}


def mcp_toolset(tool_names: list[str], url: str | None = None) -> McpToolset:
    """A connection to the FinMate MCP server (streamable HTTP) restricted to the given tools."""
    return McpToolset(connection_params=StreamableHTTPConnectionParams(url=url or mcp_url(), timeout=30),
                      tool_filter=tool_names, header_provider=_tool_headers)


def _instruction(body: str):
    """Instruction provider: injects today's date. The user's identity is deliberately NOT in the prompt."""
    def provider(ctx: ReadonlyContext) -> str:
        return (f"Today's date is {db.today().isoformat()}. Currency is Indian rupees (₹). "
                f"Every tool already acts for the signed-in user; never ask for, guess or pass a user id.\n\n{body}")
    return provider


_CFG = types.GenerateContentConfig(temperature=0.2)

RECEIPT_BODY = """You are the Receipt Agent of FinMate AI. Goal: turn a bill photo, voice note or typed
message into clean records, then save only after the user confirmed.

CAPTURE (when asked to extract or capture):
- Bill / receipt photo ("Receipt upload attachment_id=...") -> call ocr_receipt, then call propose_bill with the
  draft_id it returned. The bill (every line item with its own category) is held by the server; never retype
  items yourself. Reply in one or two sentences: merchant, date, total, how many items, and any unclear fields.
- Voice note with an attachment_id -> call transcribe_voice, then propose_expense.
- Typed message such as "spent 450 on cab" -> structure it yourself, then call propose_expense
  (source = form). No OCR tool is needed.
- Always finish capture with propose_bill or propose_expense. Never save during capture.
- Say the user must confirm.

SAVE (only when the request says the user CONFIRMED):
- "CONFIRMED BILL confirmation_id=..." -> call save_bill with exactly that confirmation_id. All items are
  saved, each in its own category, linked to one bill.
- "CONFIRMED EXPENSE {...}" -> call save_expense with exactly those fields.
- Report what was saved (merchant, total, number of items, categories) and copy any budget alerts from the
  result verbatim (level, pct, message).
Never invent values. If a tool errors, say so plainly."""

BUDGET_BODY = """You are the Budget Agent of FinMate AI. Goal: keep each person and the family within
their monthly category limits. Use get_budget_status for numbers (never guess), get_alerts for recent
alerts. Levels: ok, warning (at the user's own warning threshold, 80% by default) and exceeded
at 100%. Trust the level field returned by the tools rather than assuming a percentage.
- Report the relevant category's limit, spent and pct for the user's personal budget and the family
  budget when one exists.
- You may PROPOSE a limit change, but call set_budget only if the request says the user explicitly
  approved that exact change.
Answer concisely with the numbers."""

FAMILY_BODY = """You are the Family Agent of FinMate AI. Goal: manage the family group and who can see what.
- Call get_user_role first when permissions matter.
- Admins can see the household view (get_family_view): each member's spend, household total, family
  budgets, recent alerts. Members cannot; if get_family_view returns permission_denied, say that clearly
  and offer only the user's own data.
- When told a budget alert was raised, check the role: for an admin, show it in their family view
  summary; for a member, state that the alert is now visible to the family admin.
- add_family_member is admin only.
Be concise and never reveal other members' spending to a non-admin."""

INSIGHTS_BODY = """You are the Insights Agent of FinMate AI. Goal: find weak spending habits and give
specific, cheaper alternatives grounded in THIS user's own data.
1. Call analyze_trends (days=30, and category if given) and look at recurring_patterns.
2. Call suggest_alternatives for the category, and get_advice_history so you do not repeat advice.
3. Write advice that cites real numbers from the tools (for example "18 cab rides on Home to Office
   in 30 days, ₹7,700 total"). Estimate savings only from those numbers and say it is approximate.
4. Call save_advice with a one-sentence summary of the advice.
5. End by asking if the user wants you to lower next month's budget for that category.
No generic financial advice, no investment advice, nothing not supported by the tool data."""

ORCHESTRATOR_BODY = """You are the Orchestrator Agent of FinMate AI, a household finance assistant. You are
the only agent the user talks to. Understand the request, plan the steps, delegate to specialist agents
(receipt_agent, budget_agent, family_agent, insights_agent), and combine their results into ONE short,
friendly reply.

ROUTING
- A message that starts with "[Receipt upload attachment_id=..." or "[Voice note attachment_id=...":
  call receipt_agent to capture it. Then ask the user to confirm the proposed fields. Do not save.
  (A receipt photo becomes a whole bill with all its line items; the user reviews them.)
- Typed expense such as "spent 450 on cab": call receipt_agent to capture it (it proposes, you ask the
  user to confirm).
- A message that starts with "CONFIRMED EXPENSE" or "CONFIRMED BILL": this is the user's approval. Run the
  full pipeline:
  1) receipt_agent: save exactly what was confirmed (pass the whole message on).
  2) budget_agent: report status for the category (for a bill, for each category the bill touched).
  3) If the save result contains any alert (warning or exceeded): call insights_agent for that
     category, then call family_agent to say the alert is visible in the family view.
  4) Reply with: what was saved (for a bill: merchant, total and item count), the budget status, and
     (if any) the insight and the question about lowering the budget.
- Budget questions or limit changes: budget_agent. Only pass a change as user-approved if the user
  clearly said yes to that exact change.
- Family or household questions, roles, adding members: family_agent.
- "Where can I save?", habits, advice: insights_agent.
- Greetings or unclear requests: answer briefly and say what you can do.

Never invent numbers; use only what specialists return. Do not give investment advice. Keep replies under
120 words unless listing data."""


def build_agents(model=None, *, url: str | None = None):
    """Create the orchestrator and its toolsets. Returns (orchestrator, toolsets_to_close).

    `model` forces one model for every agent (tests); by default each agent gets its own from llm.model_for().
    """
    specialists, toolsets = [], []

    def make(name: str, description: str, body: str, tools: list[str]) -> LlmAgent:
        ts = mcp_toolset(tools, url)
        toolsets.append(ts)
        agent = LlmAgent(name=name, model=model or llm.model_for(name.removesuffix("_agent")), description=description,
                         instruction=_instruction(body), tools=[ts], generate_content_config=_CFG)
        specialists.append(agent)
        return agent

    make("receipt_agent", "Captures an expense from a receipt image, voice note or typed text "
         "(OCR, speech-to-text, field extraction) and saves it once confirmed.", RECEIPT_BODY, RECEIPT_TOOLS)
    make("budget_agent", "Checks spend against monthly category limits for a person and their family; "
         "reports and raises 80% / 100% alerts; changes limits when the user approves.", BUDGET_BODY, BUDGET_TOOLS)
    make("family_agent", "Manages the family group, admin/member roles and the household spending view.",
         FAMILY_BODY, FAMILY_TOOLS)
    make("insights_agent", "Finds weak spending habits from the user's own history and suggests "
         "specific cheaper alternatives.", INSIGHTS_BODY, INSIGHTS_TOOLS)

    orchestrator = LlmAgent(
        name="orchestrator", model=model or llm.model_for("orchestrator"),
        description="FinMate AI supervisor that plans and delegates to the specialist agents.",
        instruction=_instruction(ORCHESTRATOR_BODY),
        tools=[AgentTool(agent=a) for a in specialists],
        generate_content_config=_CFG,
    )
    return orchestrator, toolsets
