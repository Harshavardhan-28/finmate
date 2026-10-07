# FinMate AI Demo Implementation Plan (spec + plan combined)

> **For agentic workers:** use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** A working demo of the FinMate AI supervisor architecture (1 Orchestrator + 4 specialist agents over shared memory) with a Next.js frontend, for the first project review.

**Architecture:** Google ADK agents run inside a FastAPI process. All tools are served by a separate FastMCP server (stdio) over one SQLite database (the shared memory); each agent gets only its own tools via ADK `McpToolset(tool_filter=...)`. The Orchestrator wraps the four specialists as `AgentTool`s (supervisor pattern, it stays in control and combines answers). Next.js talks to FastAPI; chat is streamed over SSE together with an agent-activity trace.

**Tech Stack:** google-adk 2.x, mcp (FastMCP), FastAPI, SQLite, Gemini (`gemini-3.8-flash` default, env `FINMATE_MODEL`), Next.js (App Router) + Tailwind.

**Spec:** the approved design in chat (2026-10-07); source architecture in `FinMate AI – Problem Definition and Solution.docx`.

## Global Constraints
- Inputs: receipt image, voice note, text/form. Gemini multimodal does OCR + speech-to-text (no Tesseract/Whisper).
- Receipt Agent only *proposes* fields; nothing is saved until the user confirms (human in the loop). Budget changes also need user approval.
- Budget alerts at 80% and 100% of a category limit.
- Roles: `admin` and `member`; admin sees every member's spend and the household total, member sees only own.
- Out of scope: bank/UPI linking, payments, investment advice, real auth (user switcher only), deployment.
- Secrets only in `backend/.env` (`GOOGLE_API_KEY`), never committed or echoed.

## File Structure
```
backend/
  finmate/db.py            SQLite schema, connection, seed data
  finmate/mcp_server.py    FastMCP server: all tools (thin wrappers over services.py)
  finmate/services.py      Pure business logic (budget status, trends, family view) - unit tested
  finmate/agents.py        ADK agents + McpToolset wiring + trace callbacks
  finmate/trace.py         ContextVar queue for agent-activity events
  finmate/api.py           FastAPI app: /chat (SSE), /receipt, /voice, /confirm, /dashboard, /users
  tests/test_services.py   budget thresholds, trends, family visibility
  tests/test_api_smoke.py  endpoints w/o LLM
  requirements.txt, .env.example
frontend/                  Next.js app: chat + upload + mic + confirm card + trace + dashboard
```

## Tasks
1. **services + db + tests (TDD)**: schema (users, families, expenses, budgets, advice), seed (family "Sharma": Ravi admin, Priya member; Transport budget ₹4000 at ~100% with 18 cab rides to the same route), `budget_status`, `trend_analysis`, `family_view`, threshold alerts. Pass: `pytest`.
2. **MCP server**: expose tools from services; verify with an MCP client list_tools/call.
3. **ADK agents**: 4 specialists + orchestrator, McpToolset per agent with filters, trace callbacks.
4. **FastAPI**: endpoints + SSE streaming + receipt/voice extraction via Receipt Agent (multimodal Content), confirm endpoint.
5. **Frontend**: Next.js UI per design.
6. **Verify**: tests, boot both servers, run cab scenario in browser, README with run steps.
