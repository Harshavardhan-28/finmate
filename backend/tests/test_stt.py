"""Speech-to-text for the assistant's mic: local faster-whisper by default, Groq Whisper by switch."""
import json
from pathlib import Path

import httpx
import pytest

from finmate import db, stt


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for k in ("FINMATE_STT_PROVIDER", "GROQ_API_KEY", "FINMATE_GROQ_STT_MODEL", "FINMATE_WHISPER_MODEL"):
        monkeypatch.delenv(k, raising=False)


# ---- provider switch --------------------------------------------------------------------------
def test_local_is_the_default(monkeypatch):
    assert stt.provider() == "local"


def test_groq_can_be_selected(monkeypatch):
    monkeypatch.setenv("FINMATE_STT_PROVIDER", " Groq ")
    assert stt.provider() == "groq"


def test_unknown_provider_is_rejected(monkeypatch):
    monkeypatch.setenv("FINMATE_STT_PROVIDER", "azure")
    with pytest.raises(ValueError, match="FINMATE_STT_PROVIDER"):
        stt.provider()


def test_status_local_reports_privacy_and_readiness(monkeypatch):
    s = stt.status()
    assert s["provider"] == "local" and s["cloud"] is False and s["ready"] is True


def test_status_groq_needs_a_key(monkeypatch):
    monkeypatch.setenv("FINMATE_STT_PROVIDER", "groq")
    s = stt.status()
    assert s["cloud"] is True and s["ready"] is False and "GROQ_API_KEY" in s["problem"]
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test")
    assert stt.status()["ready"] is True


# ---- local ------------------------------------------------------------------------------------
class FakeSegment:
    def __init__(self, text):
        self.text = text


class FakeWhisper:
    def __init__(self, segments):
        self.segments, self.calls = segments, []

    def transcribe(self, path, **kw):
        self.calls.append((path, kw))
        return iter([FakeSegment(t) for t in self.segments]), object()


def test_local_joins_segments_and_passes_language(monkeypatch, tmp_path):
    fake = FakeWhisper([" how are ", " my budgets "])
    monkeypatch.setattr(stt, "_load_whisper", lambda: fake)
    audio = tmp_path / "a.wav"
    audio.write_bytes(b"RIFF")
    assert stt.transcribe(audio, language="hi") == "how are my budgets"
    assert fake.calls[0][1]["language"] == "hi"


def test_local_auto_detects_language_when_none_given(monkeypatch, tmp_path):
    fake = FakeWhisper(["hello"])
    monkeypatch.setattr(stt, "_load_whisper", lambda: fake)
    audio = tmp_path / "a.wav"
    audio.write_bytes(b"RIFF")
    stt.transcribe(audio)
    assert fake.calls[0][1]["language"] is None


def test_local_missing_package_gives_a_clear_error(monkeypatch, tmp_path):
    def boom():
        raise ImportError("faster_whisper")

    monkeypatch.setattr(stt, "_load_whisper", boom)
    audio = tmp_path / "a.wav"
    audio.write_bytes(b"RIFF")
    with pytest.raises(stt.SttError, match="faster-whisper"):
        stt.transcribe(audio)


def test_local_unexpected_failure_is_wrapped_not_leaked(monkeypatch, tmp_path):
    def boom():
        raise RuntimeError("CUDA exploded: secret path C:\\x")

    monkeypatch.setattr(stt, "_load_whisper", boom)
    audio = tmp_path / "a.wav"
    audio.write_bytes(b"RIFF")
    with pytest.raises(stt.SttError) as e:
        stt.transcribe(audio)
    assert "secret path" not in str(e.value)


# ---- groq -------------------------------------------------------------------------------------
class Resp:
    def __init__(self, status=200, body=None):
        self.status_code, self._body = status, body if body is not None else {"text": " how are my budgets? "}

    def json(self):
        return self._body


def _groq(monkeypatch, tmp_path, resp):
    monkeypatch.setenv("FINMATE_STT_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test")
    seen = {}

    def fake_post(url, **kw):
        seen["url"], seen["kw"] = url, kw
        if isinstance(resp, Exception):
            raise resp
        return resp

    monkeypatch.setattr(stt.httpx, "post", fake_post)
    audio = tmp_path / "voice.wav"
    audio.write_bytes(b"RIFFdata")
    return audio, seen


def test_groq_sends_audio_with_key_and_model(monkeypatch, tmp_path):
    audio, seen = _groq(monkeypatch, tmp_path, Resp())
    assert stt.transcribe(audio, language="en") == "how are my budgets?"
    assert seen["url"] == "https://api.groq.com/openai/v1/audio/transcriptions"
    assert seen["kw"]["headers"]["Authorization"] == "Bearer gsk_test"
    assert seen["kw"]["data"]["model"] == "whisper-large-v3-turbo"
    assert seen["kw"]["data"]["language"] == "en"
    assert seen["kw"]["files"]["file"][0] == "voice.wav"


def test_groq_model_is_configurable_and_language_optional(monkeypatch, tmp_path):
    audio, seen = _groq(monkeypatch, tmp_path, Resp())
    monkeypatch.setenv("FINMATE_GROQ_STT_MODEL", "whisper-large-v3")
    stt.transcribe(audio)
    assert seen["kw"]["data"]["model"] == "whisper-large-v3"
    assert "language" not in seen["kw"]["data"]


def test_groq_without_key_fails_before_any_network_call(monkeypatch, tmp_path):
    audio, seen = _groq(monkeypatch, tmp_path, Resp())
    monkeypatch.delenv("GROQ_API_KEY")
    with pytest.raises(stt.SttError, match="GROQ_API_KEY"):
        stt.transcribe(audio)
    assert "url" not in seen


@pytest.mark.parametrize("status,needle", [(401, "API key"), (429, "rate limit"), (500, "500")])
def test_groq_http_errors_become_readable(monkeypatch, tmp_path, status, needle):
    audio, _ = _groq(monkeypatch, tmp_path, Resp(status, {"error": {"message": "x"}}))
    with pytest.raises(stt.SttError, match=needle):
        stt.transcribe(audio)


def test_groq_network_failure_is_readable(monkeypatch, tmp_path):
    audio, _ = _groq(monkeypatch, tmp_path, httpx.ConnectError("down"))
    with pytest.raises(stt.SttError, match="reach Groq"):
        stt.transcribe(audio)


def test_the_groq_key_never_appears_in_errors(monkeypatch, tmp_path):
    audio, _ = _groq(monkeypatch, tmp_path, Resp(401, {}))
    with pytest.raises(stt.SttError) as e:
        stt.transcribe(audio)
    assert "gsk_test" not in str(e.value)


# ---- the existing voice-note path must share the same local engine ----------------------------
def test_vision_voice_note_transcription_uses_the_shared_local_engine(monkeypatch, tmp_path):
    from finmate import vision

    fake = FakeWhisper(["spent 450 on cab"])
    monkeypatch.setattr(stt, "_load_whisper", lambda: fake)
    audio = tmp_path / "a.wav"
    audio.write_bytes(b"RIFF")
    assert vision._transcribe(audio) == "spent 450 on cab"


# ---- HTTP endpoint ----------------------------------------------------------------------------
@pytest.fixture
def client(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from finmate import agents, api, vision
    from tests.test_agents_e2e import FakeLlm

    monkeypatch.setenv("FINMATE_UPLOADS", str(tmp_path / "up"))
    monkeypatch.setattr(vision, "UPLOADS", tmp_path / "up")
    real = agents.build_agents
    monkeypatch.setattr(agents, "build_agents", lambda **kw: real(model=FakeLlm(), **kw))
    db.init_db(reset=True)
    with TestClient(api.app) as c:
        yield c


def login(client):
    r = client.post("/api/auth/login", json={"email": "ravi@finmate.dev", "password": "demo1234"})
    assert r.status_code == 200, r.text


def post_audio(client, name="v.wav", data=b"RIFFxxxx", **form):
    return client.post("/api/stt", files={"file": (name, data)}, data=form)


def test_stt_requires_login(client):
    assert post_audio(client).status_code == 401


def test_stt_returns_text_and_provider(client, monkeypatch):
    login(client)
    seen = {}

    def fake(path, language=None):
        seen["lang"], seen["suffix"], seen["existed"] = language, Path(path).suffix, Path(path).exists()
        return "how are my budgets"

    monkeypatch.setattr(stt, "transcribe", fake)
    r = post_audio(client, language="hi")
    assert r.status_code == 200, r.text
    assert r.json() == {"text": "how are my budgets", "provider": "local"}
    assert seen == {"lang": "hi", "suffix": ".wav", "existed": True}


def test_stt_does_not_keep_the_recording(client, monkeypatch, tmp_path):
    login(client)
    paths = []
    monkeypatch.setattr(stt, "transcribe", lambda p, language=None: paths.append(Path(p)) or "hi")
    post_audio(client)
    assert paths and not paths[0].exists()
    assert not list((tmp_path / "up").glob("*")) if (tmp_path / "up").exists() else True


def test_stt_blank_language_means_auto_detect(client, monkeypatch):
    login(client)
    seen = {}
    monkeypatch.setattr(stt, "transcribe", lambda p, language=None: seen.setdefault("lang", language) or "x")
    post_audio(client, language="")
    assert seen["lang"] is None


@pytest.mark.parametrize("lang", ["english", "en-US", "../x", "h1"])
def test_stt_rejects_malformed_language(client, monkeypatch, lang):
    login(client)
    monkeypatch.setattr(stt, "transcribe", lambda p, language=None: "x")
    assert post_audio(client, language=lang).status_code == 400


def test_stt_rejects_non_audio_files(client, monkeypatch):
    login(client)
    monkeypatch.setattr(stt, "transcribe", lambda p, language=None: "x")
    assert post_audio(client, name="r.png").status_code == 400
    assert post_audio(client, name="x.exe").status_code == 400


def test_stt_accepts_browser_and_phone_formats(client, monkeypatch):
    login(client)
    monkeypatch.setattr(stt, "transcribe", lambda p, language=None: "x")
    for name in ("a.wav", "a.m4a", "a.webm", "a.mp3", "a.ogg", "a.flac", "a.aac"):
        assert post_audio(client, name=name).status_code == 200, name


def test_stt_rejects_empty_and_oversized_audio(client, monkeypatch):
    login(client)
    monkeypatch.setattr(stt, "transcribe", lambda p, language=None: "x")
    assert post_audio(client, data=b"").status_code == 400
    assert post_audio(client, data=b"0" * (10 * 1024 * 1024 + 1)).status_code == 413


def test_stt_silence_is_a_clear_422(client, monkeypatch):
    login(client)
    monkeypatch.setattr(stt, "transcribe", lambda p, language=None: "   ")
    r = post_audio(client)
    assert r.status_code == 422 and "hear" in r.json()["detail"]


def test_stt_provider_failure_is_a_503_with_the_readable_message(client, monkeypatch):
    login(client)

    def fail(p, language=None):
        raise stt.SttError("Groq rate limit reached. Try again in a moment.")

    monkeypatch.setattr(stt, "transcribe", fail)
    r = post_audio(client)
    assert r.status_code == 503 and "rate limit" in r.json()["detail"]


def test_health_reports_the_speech_provider(client, monkeypatch):
    monkeypatch.setenv("FINMATE_STT_PROVIDER", "groq")
    s = client.get("/api/health").json()["stt"]
    assert s["provider"] == "groq" and s["cloud"] is True
