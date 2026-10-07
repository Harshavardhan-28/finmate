"""FinMate supervisor architecture on Google ADK.

One Orchestrator Agent talks to the user and delegates to four specialist agents (wrapped as
AgentTools so the Orchestrator stays in control and combines their answers). Every specialist
reaches its tools through the FinMate MCP server and sees only its own subset.
"""
import os
import sys
from pathlib import Path

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools import AgentTool
from google.adk.tools.mcp_tool import McpToolset, StdioConnectionParams
from google.genai import types
from mcp import StdioServerParameters

from . import db

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL = os.environ.get("FINMATE_MODEL", "gemini-3.8-flash")

RECEIPT_TOOLS = ["ocr_receipt", "transcribe_voice", "propose_expense", "save_expense"]
BUDGET_TOOLS = ["get_budget_status", "set_budget", "get_alerts"]
FAMILY_TOOLS = ["get_user_role", "get_family_view", "add_family_member"]
INSIGHTS_TOOLS = ["get_expenses", "analyze_trends", "suggest_alternatives",
                  "get_advice_history", "save_advice"]


def mcp_toolset(tool_names: list[str]) -> McpToolset:
    """A connection to the FinMate MCP server restricted to the given tools."""
    server = StdioServerParameters(
        command=sys.executable, args=["-m", "finmate.mcp_server"],
        env={**os.environ}, cwd=str(BACKEND_DIR),
    )
    return McpToolset(connection_params=StdioConnectionParams(server_params=server, timeout=30),
                      tool_filter=tool_names)


def _instruction(body: str):
    """Instruction provider: injects today's date and the signed-in user from session state."""
    def provider(ctx: ReadonlyContext) -> str:
        uid = ctx.state.get("user_id", "u_ravi")
        return (f"Today's date is {db.today().isoformat()}. The signed-in user_id is {uid}. "
                f"Currency is Indian rupees (₹).\n\n{body}")
    return provider


_CFG = types.GenerateContentConfig(temperature=0.2)

RECEIPT_BODY = """You are the Receipt Agent of FinMate AI. Goal: turn an image, voice note or typed
message into one clean expense record, then save it only after the user confirmed.

CAPTURE (when asked to extract or capture an expense):
- Receipt image with an attachment_id -> call ocr_receipt.
- Voice note with an attachment_id -> call transcribe_voice.
- Typed message such as "spent 450 on cab" -> structure it yourself (no OCR tool needed).
- ALWAYS finish capture by calling propose_expense with the fields (source = receipt, voice or form),
  listing anything uncertain in unclear_fields. Never save during capture.
- Reply briefly with the proposed amount, merchant, category and date, and any unclear fields,
  and say the user must confirm.

SAVE (only when the request says the user CONFIRMED and gives exact fields):
- Call save_expense with exactly those fields and the user_id.
- Report the saved expense and copy any budget alerts from the result verbatim (level, pct, message).
Never invent values. If a tool errors, say so plainly."""

BUDGET_BODY = """You are the Budget Agent of FinMate AI. Goal: keep each person and the family within
their monthly category limits. Use get_budget_status for numbers (never guess), get_alerts for recent
alerts. Levels: warning at 80%, exceeded at 100%.
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
friendly reply. Always include "user_id=<id>" in every request you send to a specialist.

ROUTING
- A message that starts with "[Receipt upload attachment_id=..." or "[Voice note attachment_id=...":
  call receipt_agent to capture it. Then ask the user to confirm the proposed fields. Do not save.
- Typed expense such as "spent 450 on cab": call receipt_agent to capture it (it proposes, you ask the
  user to confirm).
- A message that starts with "CONFIRMED EXPENSE": this is the user's approval. Run the full pipeline:
  1) receipt_agent: save exactly those fields.
  2) budget_agent: report status for that category.
  3) If the save result contains any alert (warning or exceeded): call insights_agent for that
     category, then call family_agent to say the alert is visible in the family view.
  4) Reply with: what was saved, the budget status, and (if any) the insight and the question about
     lowering the budget.
- Budget questions or limit changes: budget_agent. Only pass a change as user-approved if the user
  clearly said yes to that exact change.
- Family or household questions, roles, adding members: family_agent.
- "Where can I save?", habits, advice: insights_agent.
- Greetings or unclear requests: answer briefly and say what you can do.

Never invent numbers; use only what specialists return. Do not give investment advice. Keep replies under
120 words unless listing data."""


def build_agents(model=DEFAULT_MODEL):
    """Create the orchestrator and its toolsets. Returns (orchestrator, toolsets_to_close)."""
    specialists, toolsets = [], []

    def make(name: str, description: str, body: str, tools: list[str]) -> LlmAgent:
        ts = mcp_toolset(tools)
        toolsets.append(ts)
        agent = LlmAgent(name=name, model=model, description=description,
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
        name="orchestrator", model=model,
        description="FinMate AI supervisor that plans and delegates to the specialist agents.",
        instruction=_instruction(ORCHESTRATOR_BODY),
        tools=[AgentTool(agent=a) for a in specialists],
        generate_content_config=_CFG,
    )
    return orchestrator, toolsets
