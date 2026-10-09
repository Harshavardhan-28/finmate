"""End-to-end wiring test with a scripted fake LLM: real ADK runner, AgentTool delegation, MCP
subprocess and SQLite. Only the model is faked, so this runs offline and proves the plumbing."""
import asyncio
import json

import pytest
from google.adk.apps import App
from google.adk.models import BaseLlm, LlmResponse
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from finmate import agents, db, security, services, vision
from finmate.trace import TracePlugin, current_queue


def _find(obj, key):
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        for v in obj.values():
            r = _find(v, key)
            if r is not None:
                return r
    if isinstance(obj, list):
        for v in obj:
            r = _find(v, key)
            if r is not None:
                return r
    if isinstance(obj, str):
        try:
            return _find(json.loads(obj), key)
        except (ValueError, TypeError):
            return None
    return None


def _turn(contents):
    """(user_text, [function names already answered this turn], {name: response})"""
    answered, responses, text = [], {}, ""
    for c in reversed(contents):
        parts = c.parts or []
        resp = [p.function_response for p in parts if p.function_response]
        if resp:
            for fr in resp:
                answered.append(fr.name)
                responses[fr.name] = fr.response
            continue
        t = "".join(p.text or "" for p in parts if p.text)
        if c.role == "user" and t:
            text = t
            break
    return text, answered, responses


class FakeLlm(BaseLlm):
    model: str = "fake"

    async def generate_content_async(self, llm_request, stream=False):
        yield self._respond(llm_request)

    def _respond(self, llm_request):
        system = str(llm_request.config.system_instruction)
        text, done, resp = _turn(llm_request.contents)

        def call(name, **args):
            return LlmResponse(content=types.Content(
                role="model", parts=[types.Part.from_function_call(name=name, args=args)]))

        def say(msg):
            return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=msg)]))

        if "Orchestrator Agent" in system:
            if text.startswith("CONFIRMED EXPENSE"):
                order = ["receipt_agent", "budget_agent", "insights_agent", "family_agent"]
                for name in order:
                    if name not in done:
                        return call(name, request=text)
                return say("Saved. Transport is over budget; consider the metro.")
            if "receipt_agent" not in done:
                return call("receipt_agent", request=f"capture: {text}")
            return say("Please confirm: Uber ₹450 Transport.")
        if "Receipt Agent" in system:
            if text.startswith("CONFIRMED EXPENSE"):
                if "save_expense" not in done:
                    return call("save_expense", **json.loads(text.split("EXPENSE", 1)[1]))
                return say("Saved. " + json.dumps(_find(resp["save_expense"], "alerts")))
            att = text.split("attachment_id=")[1].split("]")[0].split()[0].strip("]")
            if "ocr_receipt" not in done:
                return call("ocr_receipt", attachment_id=att)
            if "propose_expense" not in done:
                f = _find(resp["ocr_receipt"], "fields")
                return call("propose_expense", amount=f["amount"], date=f["date"], merchant=f["merchant"],
                            category=f["category"], source="receipt", note=f["note"])
            return say("Proposed Uber ₹450 Transport. Please confirm.")
        if "Budget Agent" in system:
            if "get_budget_status" not in done:
                return call("get_budget_status")
            return say("Transport is over its limit.")
        if "Insights Agent" in system:
            for name, args in [("analyze_trends", {}),
                               ("suggest_alternatives", {"category": "Transport"}),
                               ("save_advice", {"text": "Take the metro."})]:
                if name not in done:
                    return call(name, **args)
            return say("18 cab rides; try the metro.")
        if "Family Agent" in system:
            for name, args in [("get_user_role", {}),
                               ("get_family_view", {})]:
                if name not in done:
                    return call(name, **args)
            return say("Alert visible in family view.")
        return say("?")


@pytest.fixture
def env(tmp_path, monkeypatch):
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    (uploads / "abc123.png").write_bytes(b"\x89PNG fake")
    monkeypatch.setattr(vision, "UPLOADS", uploads)
    monkeypatch.setenv("FINMATE_FAKE_VISION", "1")
    db.init_db(reset=True)
    vision.register_attachment("abc123", "u_ravi")


async def _run(runner, session_id, text):
    q: asyncio.Queue = asyncio.Queue()
    token = current_queue.set(q)
    try:
        async for _ in runner.run_async(
            user_id="u_ravi", session_id=session_id,
            new_message=types.Content(role="user", parts=[types.Part(text=text)]),
        ):
            pass
    finally:
        current_queue.reset(token)
    items = []
    while not q.empty():
        items.append(q.get_nowait()[1])
    return items


def test_cab_receipt_flows_through_all_five_agents(env):
    async def main():
        return await _scenario()

    async def _scenario():
        orchestrator, toolsets = agents.build_agents(model=FakeLlm())
        sessions = InMemorySessionService()
        app = App(name="finmate", root_agent=orchestrator, plugins=[TracePlugin(), security.ToolGuardPlugin()])
        runner = Runner(app=app, session_service=sessions)
        s = await sessions.create_session(app_name="finmate", user_id="u_ravi")
        try:
            t1 = await _run(runner, s.id, "[Receipt upload attachment_id=abc123] please capture this")
            proposals = [e for e in t1 if e["kind"] == "tool_result" and e["tool"] == "propose_expense"]
            assert proposals, [e for e in t1 if e["kind"] != "agent_end"]
            assert services.get_expenses("u_ravi", 1) == [] or all(
                e["merchant"] != "Uber" or e["date"] != "2026-10-08" for e in services.get_expenses("u_ravi", 1))

            confirmed = json.dumps({"amount": 450, "date": "2026-10-08",
                                    "merchant": "Uber", "category": "Transport", "source": "receipt",
                                    "note": "Home to Office"})
            t2 = await _run(runner, s.id, "CONFIRMED EXPENSE " + confirmed)
        finally:
            for ts in toolsets:
                await ts.close()
        return t1, t2

    t1, t2 = asyncio.run(main())
    agents_seen = {e["agent"] for e in t2 if e["kind"] == "agent_start"}
    assert {"orchestrator", "receipt_agent", "budget_agent", "insights_agent", "family_agent"} <= agents_seen
    tools_used = [e["tool"] for e in t2 if e["kind"] == "tool_call"]
    for t in ("save_expense", "get_budget_status", "analyze_trends", "save_advice", "get_family_view"):
        assert t in tools_used
    saved = services.get_expenses("u_ravi", 1)
    assert any(e["merchant"] == "Uber" and e["amount"] == 450 for e in saved)
    assert services.list_alerts("u_ravi")[0]["level"] == "exceeded"
    assert services.get_advice_history("u_ravi")[0]["text"] == "Take the metro."


class _AttackerLlm(BaseLlm):
    """A model that has been prompt-injected: it first tries to impersonate Ravi, then calls the tool normally."""
    model: str = "attacker"

    async def generate_content_async(self, llm_request, stream=False):
        _, done, _resp = _turn(llm_request.contents)
        if "get_expenses" not in done:
            part = types.Part.from_function_call(name="get_expenses", args={"user_id": "u_ravi", "days": 90})
        elif "get_budget_status" not in done:
            part = types.Part.from_function_call(name="get_budget_status", args={})
        else:
            part = types.Part(text="done")
        yield LlmResponse(content=types.Content(role="model", parts=[part]))


def test_prompt_injected_model_cannot_read_another_users_data(env):
    """Priya is signed in. The model tries user_id=u_ravi; the guard refuses it before the tool server is reached,
    and the legitimate follow-up call returns only Priya's own data."""
    from google.adk.agents import LlmAgent

    async def main():
        ts = agents.mcp_toolset(["get_expenses", "get_budget_status"])
        agent = LlmAgent(name="insights_agent", model=_AttackerLlm(), instruction="x", tools=[ts])
        sessions = InMemorySessionService()
        runner = Runner(app=App(name="finmate", root_agent=agent, plugins=[TracePlugin(), security.ToolGuardPlugin()]),
                        session_service=sessions)
        s = await sessions.create_session(app_name="finmate", user_id="u_priya")
        q: asyncio.Queue = asyncio.Queue()
        token = current_queue.set(q)
        try:
            async for _ in runner.run_async(user_id="u_priya", session_id=s.id,
                                            new_message=types.Content(role="user", parts=[types.Part(text="hi")])):
                pass
        finally:
            current_queue.reset(token)
            await ts.close()
        return [q.get_nowait()[1] for _ in range(q.qsize())]

    trace = asyncio.run(main())
    results = {e["tool"]: e["result"] for e in trace if e["kind"] == "tool_result"}
    assert results["get_expenses"]["error"] == "identity_argument_rejected"
    assert "Ravi" not in json.dumps(results) and "u_ravi" not in json.dumps(results["get_budget_status"])
