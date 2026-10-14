"""HTTP-level smoke test: upload -> chat (proposal) -> confirm (saved + alert + final), offline."""
import json

import pytest
from fastapi.testclient import TestClient

from finmate import agents, db
from tests.test_agents_e2e import FakeLlm


@pytest.fixture
def client(tmp_path, monkeypatch):
    uploads = tmp_path / "uploads"
    monkeypatch.setenv("FINMATE_UPLOADS", str(uploads))
    monkeypatch.setenv("FINMATE_FAKE_VISION", "1")
    from finmate import api, vision
    monkeypatch.setattr(vision, "UPLOADS", uploads)
    real = agents.build_agents
    monkeypatch.setattr(agents, "build_agents", lambda **kw: real(model=FakeLlm(), **kw))
    db.init_db(reset=True)
    with TestClient(api.app) as c:
        yield c


def events(resp):
    return [json.loads(line[6:]) for line in resp.text.splitlines() if line.startswith("data: ")]


def login(client, email="ravi@finmate.dev", password="demo1234"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r


def test_dashboard_uses_logged_in_user(client):
    assert client.get("/api/dashboard").status_code == 401
    login(client)
    d = client.get("/api/dashboard").json()
    assert d["user"]["role"] == "admin" and d["family"]["members"]
    assert "password_hash" not in d["user"]
    client.post("/api/auth/logout")
    login(client, "priya@finmate.dev")
    d = client.get("/api/dashboard").json()
    assert d["user"]["id"] == "u_priya" and d["family"]["error"] == "permission_denied"


def test_upload_rejects_bad_type(client):
    login(client)
    r = client.post("/api/upload", files={"file": ("x.exe", b"MZ")}, data={"kind": "receipt"})
    assert r.status_code == 400


def test_full_receipt_flow_over_http(client):
    login(client)
    up = client.post("/api/upload", files={"file": ("r.png", b"\x89PNG fake")}, data={"kind": "receipt"}).json()
    ev = events(client.post("/api/chat", json={"attachment_id": up["attachment_id"],
                                                "kind": "receipt", "message": "my cab receipt"}))
    proposal = next(e for e in ev if e["type"] == "proposal")["proposal"]
    assert proposal["merchant"] == "Uber" and proposal["amount"] == 450
    assert any(e["type"] == "trace" and e.get("tool") == "ocr_receipt" for e in ev)
    assert ev[-1]["type"] == "done"

    ev = events(client.post("/api/confirm", json={**{k: proposal[k] for k in
                ("amount", "date", "merchant", "category", "source", "note")}}))
    saved = next(e for e in ev if e["type"] == "saved")
    assert any(a["level"] == "exceeded" for a in saved["alerts"])
    started = {e["agent"] for e in ev if e["type"] == "trace" and e["kind"] == "agent_start"}
    assert {"receipt_agent", "budget_agent", "insights_agent", "family_agent"} <= started
    assert next(e for e in ev if e["type"] == "final")["text"]


def test_missing_key_gives_clear_error(client, monkeypatch):
    monkeypatch.delenv("FINMATE_FAKE_VISION")
    monkeypatch.setenv("FINMATE_LLM_PROVIDER", "gemini")
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    login(client)
    ev = events(client.post("/api/chat", json={"message": "hi"}))
    assert "GOOGLE_API_KEY" in ev[0]["message"]


def test_unreachable_ollama_gives_clear_error(client, monkeypatch):
    from finmate import llm
    monkeypatch.delenv("FINMATE_FAKE_VISION")
    monkeypatch.setenv("FINMATE_LLM_PROVIDER", "ollama")
    monkeypatch.setattr(llm, "_ollama_models", lambda: None)
    login(client)
    ev = events(client.post("/api/chat", json={"message": "hi"}))
    assert "Ollama is not reachable" in ev[0]["message"]
