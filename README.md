# FinMate AI: first-review demo

A team of AI agents that captures expenses (receipt photo, voice note, typed text or form), tracks them
against personal and family budgets, and warns you and suggests cheaper options before you overspend.

```
                     ┌──────────────────────── Next.js UI ────────────────────────┐
                     │ chat · receipt/voice/form input · confirm card · dashboard │
                     │ live agent-activity tape                                   │
                     └──────────────────────────┬─────────────────────────────────┘
                                                │ SSE
                                   FastAPI  (hosts the ADK Runner)
                                                │
                                      Orchestrator Agent  (Google ADK)
                      ┌───────────────┬─────────┴───────┬────────────────┐
                 Receipt Agent   Budget Agent      Family Agent    Insights Agent
                      └───────────────┴───────┬─────────┴────────────────┘
                                              │ MCP (stdio), each agent sees only its own tools
                                      FinMate MCP server ── SQLite (shared memory)
```

* **Agents:** Google ADK 2.x. The Orchestrator wraps the four specialists as `AgentTool`s (supervisor pattern).
* **Tools:** one MCP server (`backend/finmate/mcp_server.py`). Each agent connects with `McpToolset(tool_filter=...)`.
* **OCR / speech-to-text:** Gemini multimodal, called from MCP tools `ocr_receipt` and `transcribe_voice`.
* **Human in the loop:** the Receipt Agent only *proposes* fields (`propose_expense`); nothing is saved until you press
  *Confirm and save*. Budget changes are applied only after you approve them in chat.

## Run it

You need Python 3.12+ and Node 20+. Get a free Gemini API key at https://aistudio.google.com/apikey.

**Backend** (PowerShell, from `backend/`):
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env        # then paste your key after GOOGLE_API_KEY=
uvicorn finmate.api:app --port 8000
```

**Frontend** (second terminal, from `frontend/`):
```powershell
npm install
npm run dev
```
Open http://localhost:3000. The header chip shows the model, or "No Gemini key" if `.env` is missing.
The default model is `gemini-3.8-flash`; change it with `FINMATE_MODEL` in `.env`.

## Demo script (about 4 minutes)

Signed in as **Ravi (admin)**. His Transport budget starts at about 92%.

1. Click **Try sample receipt** (or upload any receipt photo). Watch the **Agent activity** tape: the Orchestrator
   delegates to the Receipt Agent, which calls `ocr_receipt` then `propose_expense` over MCP.
2. A **Confirm this expense** card appears (Uber, ₹450, Transport). Edit a field if you like, then **Confirm and save**.
3. The pipeline runs: Receipt Agent saves, Budget Agent reports Transport at **112%**, Insights Agent finds the
   repeated *Home to Office* cab rides and suggests the metro, Family Agent surfaces the alert in the admin view.
4. Point at the dashboard: red Transport bar, alert, saved advice, household view.
5. Switch to **Priya (member)**: the household view is restricted (role check in the Family Agent).
6. Try **Voice note** ("spent 450 on cab"), typing `spent 120 on chai`, or **Add by form**.
7. **Reset demo** re-seeds everything for another run.

## Offline fallback

`python dev_fake_server.py` (from `backend/`) starts the same API, MCP server and database with a **scripted** model
and canned receipt OCR instead of Gemini. It is only for checking the UI without a key; replies are not real AI.

## Tests

```powershell
cd backend
pytest -q          # services, MCP server over stdio, full agent chain with a scripted model, HTTP flow
cd ..\frontend
npm run lint ; npm run build
```

## Known limits (prototype)

* Users are switched from a dropdown; there is no real authentication.
* Agent behavior with live Gemini depends on the model following the instructions in `backend/finmate/agents.py`.
* Out of scope per the problem definition: bank/UPI linking, payments, investment advice, native mobile apps.
