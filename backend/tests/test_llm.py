"""Provider switch (Gemini vs Ollama), per-agent model routing and the local OCR/voice paths. No network needed."""
import pytest

from finmate import db, llm, vision


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for k in ("FINMATE_LLM_PROVIDER", "FINMATE_MODEL", "FINMATE_OLLAMA_MODEL", "FINMATE_OLLAMA_VISION_MODEL",
              "GOOGLE_API_KEY", "GEMINI_API_KEY") + tuple(f"FINMATE_OLLAMA_{a.upper()}_MODEL" for a in llm.AGENT_NAMES):
        monkeypatch.delenv(k, raising=False)


def test_default_provider_is_gemini_and_per_agent_model_is_the_gemini_id(monkeypatch):
    assert llm.provider() == "gemini"
    assert llm.model_for("budget") == llm.DEFAULT_GEMINI
    monkeypatch.setenv("FINMATE_MODEL", "gemini-custom")
    assert llm.model_for("orchestrator") == "gemini-custom"


def test_invalid_provider_is_rejected(monkeypatch):
    monkeypatch.setenv("FINMATE_LLM_PROVIDER", "openai")
    with pytest.raises(ValueError):
        llm.provider()


def test_ollama_tags_fall_back_then_override_per_agent(monkeypatch):
    monkeypatch.setenv("FINMATE_LLM_PROVIDER", "ollama")
    assert llm.ollama_tag("budget") == llm.DEFAULT_OLLAMA
    monkeypatch.setenv("FINMATE_OLLAMA_MODEL", "qwen3:8b")
    monkeypatch.setenv("FINMATE_OLLAMA_BUDGET_MODEL", "qwen3:4b")
    assert llm.ollama_tag("orchestrator") == "qwen3:8b"
    assert llm.ollama_tag("budget") == "qwen3:4b"


def test_ollama_model_is_a_litellm_bound_to_the_agents_tag(monkeypatch):
    pytest.importorskip("litellm")
    monkeypatch.setenv("FINMATE_LLM_PROVIDER", "ollama")
    monkeypatch.setenv("FINMATE_OLLAMA_FAMILY_MODEL", "qwen3:4b")
    m = llm.model_for("family")
    assert m.model == "ollama_chat/qwen3:4b"  # ollama_chat, not ollama: the plain provider loops on tool calls
    assert llm.ollama_options()["num_ctx"] >= 8192


def test_status_reports_missing_key_unreachable_ollama_and_missing_models(monkeypatch):
    assert llm.status()["ready"] is False and "GOOGLE_API_KEY" in llm.status()["problem"]
    monkeypatch.setenv("GOOGLE_API_KEY", "x")
    assert llm.status()["ready"] is True

    monkeypatch.setenv("FINMATE_LLM_PROVIDER", "ollama")
    monkeypatch.setattr(llm, "_ollama_models", lambda: None)
    assert "not reachable" in llm.status()["problem"]
    monkeypatch.setattr(llm, "_ollama_models", lambda: {"qwen3:8b"})
    s = llm.status()
    assert not s["ready"] and "qwen2.5vl:3b" in s["problem"]
    monkeypatch.setattr(llm, "_ollama_models", lambda: {"qwen3:8b", "qwen2.5vl:3b"})
    assert llm.status()["ready"] is True


def test_parse_fields_tolerates_fences_and_think_blocks():
    raw = '<think>hmm</think>\n```json\n{"amount": 450, "merchant": "Uber", "category": "Transport", "date": "2026-10-08"}\n```'
    f = vision._parse_fields(raw)
    assert f["amount"] == 450 and f["unclear_fields"] == [] and f["transcript"] == ""
    with pytest.raises(ValueError):
        vision._parse_fields("[1, 2]")


def test_ollama_receipt_and_voice_paths(tmp_path, monkeypatch):
    monkeypatch.setattr(vision, "UPLOADS", tmp_path)
    monkeypatch.setenv("FINMATE_LLM_PROVIDER", "ollama")
    db.init_db(reset=True)
    (tmp_path / "r1.png").write_bytes(b"\x89PNG")
    (tmp_path / "v1.m4a").write_bytes(b"audio")
    vision.register_attachment("r1", "u_ravi")
    vision.register_attachment("v1", "u_ravi")
    calls = []

    def fake_chat(model, prompt, images=None):
        calls.append((model, bool(images), "spent 450 on cab" in prompt))
        return '{"amount": 450, "date": "2026-10-08", "merchant": "Uber", "category": "Transport", "note": "cab"}'

    monkeypatch.setattr(vision, "_ollama_chat", fake_chat)
    monkeypatch.setattr(vision, "_transcribe", lambda p: "spent 450 on cab")
    r = vision.extract("r1", "receipt image", "u_ravi")["fields"]
    v = vision.extract("v1", "voice note", "u_ravi")["fields"]
    assert r["merchant"] == "Uber" and v["transcript"] == "spent 450 on cab"
    assert calls[0] == (llm.ollama_vision_tag(), True, False)        # photo goes to the vision model with the image
    assert calls[1] == (llm.ollama_tag("receipt"), False, True)      # voice: transcript goes to the small text model
