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
                                              │ MCP over authenticated HTTP, each agent sees only its own tools
                                      FinMate MCP server ── Postgres (shared memory)
```

* **Agents:** Google ADK 2.x. The Orchestrator wraps the four specialists as `AgentTool`s (supervisor pattern).
* **Tools:** one MCP server (`backend/finmate/mcp_server.py`). Each agent connects with `McpToolset(tool_filter=...)`.
* **Identity (agents only ever act as the signed-in user):** the model is never the source of "who". The API verifies
  the login, the ADK `Runner` carries that user id, and `McpToolset(header_provider=...)` attaches a short-lived signed
  tool token (`identity.py`, own key/issuer/audience) to every MCP call. The tool server (`mcp_server.py`, a real standalone MCP server on streamable HTTP, port 8001) rejects calls
  without a valid token and derives the user from it; tools take **no** `user_id` parameters and the prompts never
  contain one. A runner-wide `ToolGuardPlugin` (`security.py`) refuses and logs any identity argument a model tries to
  pass, uploaded files are bound to their uploader, and role checks stay in `services.py`. Details in `tests/test_identity.py`,
  `tests/test_mcp_server.py` and the prompt-injection test in `tests/test_agents_e2e.py`.
* **OCR / speech-to-text:** Gemini multimodal or local Ollama vision + Whisper, called from MCP tools `ocr_receipt` and
  `transcribe_voice`.
* **Bills with line items:** a receipt photo becomes one *bill* (merchant, date, total, bill number, payment method) with
  every purchased item, each in its own category. Each item is saved as an expense linked to the bill (`expenses.bill_id`,
  plus `quantity` / `unit_price`), so budgets, alerts and trends need no special handling; the receipt photo is linked to
  the bill (`bills.attachment_id`). The model's output is validated by pydantic (`BillFields` in `schemas.py`) and
  *reconciled* so the items always add up to the printed total: rounding is absorbed, taxes/fees become one explicit
  line, a discount scales the lines, and a rate copied into the amount column is repaired when the total proves it.
  The model never re-types items: `ocr_receipt` parks the bill in `bill_drafts` and returns a summary plus an id,
  `propose_bill(draft_id)` shows it to you, your edited bill is re-validated by `POST /api/confirm_bill` and stored as a
  *confirmed* draft, and `save_bill(confirmation_id)` saves exactly that. Drafts are private to their owner.
* **Human in the loop:** the Receipt Agent only *proposes* (`propose_bill`, `propose_expense`); nothing is saved until you
  press *Save* on the review screen. Budget changes are applied only after you approve them in chat.

## Run it

You need Python 3.12+ and Node 20+. Get a free Gemini API key at https://aistudio.google.com/apikey.

**Database** (repo root; dev-only Postgres in Docker, also creates `finmate_test` for the tests):
```
docker compose up -d db
```

**Backend** (PowerShell, from `backend/`):
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env        # then paste your key after GOOGLE_API_KEY=
uvicorn finmate.api:app --port 8000
```
The API starts the MCP tool server for you (`python -m finmate.mcp_server`, port 8001). In production run it as its own
service and set `FINMATE_MCP_URL` and `FINMATE_MCP_AUTOSTART=0`.

**Frontend** (second terminal, from `frontend/`):
```powershell
npm install
npm run dev
```
Open http://localhost:3000 and sign in with the demo logins `ravi@finmate.dev` (admin) or `priya@finmate.dev`
(member), password `demo1234`, or create an account. Set `JWT_SECRET` in `.env`; add `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` (redirect URI `http://localhost:8000/api/auth/google/callback`) to enable Google sign-in.
The header chip shows the model, or "No Gemini key" if `.env` is missing.
The default model is `gemini-3.8-flash`; change it with `FINMATE_MODEL` in `.env`.

## Demo script (about 4 minutes)

Sign in as **Ravi (admin)**. His Transport budget starts at about 92%.

1. Click **Try sample receipt** (or upload any receipt photo). Watch the **Agent activity** tape: the Orchestrator
   delegates to the Receipt Agent, which calls `ocr_receipt` then `propose_expense` over MCP.
2. A **Confirm this expense** card appears (Uber, ₹450, Transport). Edit a field if you like, then **Confirm and save**.
3. The pipeline runs: Receipt Agent saves, Budget Agent reports Transport at **112%**, Insights Agent finds the
   repeated *Home to Office* cab rides and suggests the metro, Family Agent surfaces the alert in the admin view.
4. Point at the dashboard: red Transport bar, alert, saved advice, household view.
5. Sign out and sign in as **Priya (member)**: the household view is restricted (role check in the Family Agent).
6. Try **Voice note** ("spent 450 on cab"), typing `spent 120 on chai`, or **Add by form**.
7. **Reset demo** re-seeds everything for another run.


## Tests

```powershell
cd backend
pytest -q          # services, tool-server auth, identity isolation, full agent chain with a scripted model, HTTP flow
cd ..\frontend
npm run lint ; npm run build
```

## Known limits (prototype)

* Not built yet: email verification, password reset by email and two-factor sign-in.
* Agent behavior with live Gemini depends on the model following the instructions in `backend/finmate/agents.py`.
* Out of scope per the problem definition: bank/UPI linking, payments, investment advice.
