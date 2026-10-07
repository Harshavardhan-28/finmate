"""FastAPI backend: hosts the ADK agents and streams chat + agent trace to the Next.js UI."""
import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from google.adk.apps import App  # noqa: E402
from google.adk.runners import Runner  # noqa: E402
from google.adk.sessions import InMemorySessionService  # noqa: E402
from google.genai import types  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from . import agents, db, services, vision  # noqa: E402
from .trace import TracePlugin, current_queue  # noqa: E402

APP_NAME = "finmate"
MAX_UPLOAD = 10 * 1024 * 1024
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".wav", ".mp3", ".ogg", ".flac", ".aac", ".m4a"}


class State:
    runner: Runner
    sessions: InMemorySessionService
    toolsets: list


state = State()


async def _start_agents():
    orchestrator, toolsets = agents.build_agents()
    state.sessions = InMemorySessionService()
    state.runner = Runner(app=App(name=APP_NAME, root_agent=orchestrator, plugins=[TracePlugin()]),
                          session_service=state.sessions)
    state.toolsets = toolsets


async def _stop_agents():
    for ts in getattr(state, "toolsets", []):
        try:
            await ts.close()
        except Exception:  # noqa: BLE001 - best effort on shutdown
            pass


@asynccontextmanager
async def lifespan(_: FastAPI):
    vision.UPLOADS.mkdir(parents=True, exist_ok=True)
    db.init_db()
    await _start_agents()
    yield
    await _stop_agents()


app = FastAPI(title="FinMate AI", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"], allow_headers=["*"],
)


def _has_llm() -> bool:
    return bool(os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY"))


def parse_mcp(result):
    """Unwrap an MCP tool result as ADK returns it: {content:[{type:text,text:<json>}]}."""
    if not isinstance(result, dict):
        return result
    if isinstance(result.get("structuredContent"), dict):
        return result["structuredContent"]
    for part in result.get("content", []) or []:
        if part.get("type") == "text":
            try:
                return json.loads(part["text"])
            except (ValueError, KeyError):
                return {"text": part.get("text")}
    return result


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, default=str, ensure_ascii=False)}\n\n"


async def _session_id(user_id: str) -> str:
    sid = f"s-{user_id}"
    existing = await state.sessions.get_session(app_name=APP_NAME, user_id=user_id, session_id=sid)
    if existing is None:
        await state.sessions.create_session(app_name=APP_NAME, user_id=user_id, session_id=sid,
                                            state={"user_id": user_id})
    return sid


async def run_turn(user_id: str, text: str):
    """Run one orchestrator turn and yield SSE strings: trace, proposal, saved, final, done/error."""
    if not _has_llm() and os.environ.get("FINMATE_FAKE_VISION") != "1":
        yield sse({"type": "error", "message": "GOOGLE_API_KEY is not set. Copy backend/.env.example to "
                   "backend/.env, add your Gemini API key and restart the backend."})
        return
    try:
        services.get_user_role(user_id)
    except ValueError:
        yield sse({"type": "error", "message": f"Unknown user {user_id!r}"})
        return

    sid = await _session_id(user_id)
    q: asyncio.Queue = asyncio.Queue()

    async def produce():
        current_queue.set(q)
        try:
            async for ev in state.runner.run_async(
                user_id=user_id, session_id=sid,
                new_message=types.Content(role="user", parts=[types.Part(text=text)]),
            ):
                q.put_nowait(("event", ev))
        except Exception as exc:  # noqa: BLE001 - surfaced to the UI
            q.put_nowait(("error", f"{type(exc).__name__}: {exc}"))
        finally:
            q.put_nowait(("done", None))

    task = asyncio.create_task(produce())
    final_text = ""
    try:
        while True:
            kind, item = await q.get()
            if kind == "done":
                break
            if kind == "error":
                yield sse({"type": "error", "message": item})
                continue
            if kind == "trace":
                raw = item.pop("raw", None)
                yield sse({"type": "trace", **item})
                if item["kind"] == "tool_result" and raw is not None:
                    data = parse_mcp(raw)
                    if item["tool"] == "propose_expense" and isinstance(data, dict) and "proposal" in data:
                        yield sse({"type": "proposal", "proposal": data["proposal"]})
                    if item["tool"] == "save_expense" and isinstance(data, dict) and "expense" in data:
                        yield sse({"type": "saved", "expense": data["expense"], "alerts": data.get("alerts", [])})
                continue
            ev = item
            if ev.author == "orchestrator" and ev.is_final_response() and ev.content and ev.content.parts:
                final_text = "".join(p.text or "" for p in ev.content.parts if p.text)
        yield sse({"type": "final", "text": final_text or "(no reply)"})
    finally:
        task.cancel()
        yield sse({"type": "done"})


def stream(gen):
    return StreamingResponse(gen, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class ChatIn(BaseModel):
    user_id: str
    message: str = ""
    attachment_id: str | None = None
    kind: str | None = None  # "receipt" | "voice"


class ConfirmIn(BaseModel):
    user_id: str
    amount: float
    date: str
    merchant: str
    category: str
    source: str = "form"
    note: str = ""


@app.get("/api/health")
def health():
    if os.environ.get("FINMATE_FAKE_VISION") == "1":
        return {"ok": True, "llm_configured": True, "model": "offline scripted demo"}
    return {"ok": True, "llm_configured": _has_llm(), "model": agents.DEFAULT_MODEL}


@app.get("/api/users")
def users():
    return services.list_users()


@app.get("/api/dashboard")
def dashboard(user_id: str):
    try:
        return services.dashboard(user_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/api/upload")
async def upload(file: UploadFile = File(...), kind: str = Form("receipt")):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported file type {ext or '(none)'}. Use an image or wav/mp3/ogg/flac audio.")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "File too large (max 10 MB).")
    attachment_id = uuid.uuid4().hex[:12]
    (vision.UPLOADS / f"{attachment_id}{ext}").write_bytes(data)
    return {"attachment_id": attachment_id, "kind": kind}


@app.post("/api/chat")
async def chat(body: ChatIn):
    text = body.message.strip()
    if body.attachment_id:
        tag = "Voice note" if body.kind == "voice" else "Receipt upload"
        text = f"[{tag} attachment_id={body.attachment_id}] {text}".strip()
    if not text:
        raise HTTPException(400, "Empty message")
    return stream(run_turn(body.user_id, text))


@app.post("/api/confirm")
async def confirm(body: ConfirmIn):
    payload = body.model_dump()
    return stream(run_turn(body.user_id, "CONFIRMED EXPENSE " + json.dumps(payload)))


@app.post("/api/reset")
async def reset():
    """Re-seed the demo data and start fresh conversations."""
    db.init_db(reset=True)
    await _stop_agents()
    await _start_agents()
    return {"ok": True}
