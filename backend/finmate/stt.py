"""Speech-to-text: what the assistant's mic button and voice notes use to hear the user.

    FINMATE_STT_PROVIDER=local   (default)  faster-whisper on this machine. Audio never leaves it.
    FINMATE_STT_PROVIDER=groq               Groq-hosted Whisper. Faster and more accurate, but the audio goes to
                                            Groq's cloud and needs GROQ_API_KEY.

Independent of FINMATE_LLM_PROVIDER, so Gemini or Ollama agents can use either speech engine.

    FINMATE_WHISPER_MODEL     local model size: tiny / base / small (default) / medium
    FINMATE_GROQ_STT_MODEL    whisper-large-v3-turbo (default) or whisper-large-v3
"""
import logging
import mimetypes
import os
from pathlib import Path

import httpx

log = logging.getLogger("finmate.stt")

PROVIDERS = ("local", "groq")
GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
DEFAULT_GROQ_MODEL = "whisper-large-v3-turbo"


class SttError(Exception):
    """A failure whose message is safe and useful to show the user."""


def provider() -> str:
    p = os.environ.get("FINMATE_STT_PROVIDER", "local").strip().lower()
    if p not in PROVIDERS:
        raise ValueError(f"FINMATE_STT_PROVIDER must be one of {', '.join(PROVIDERS)}, got {p!r}")
    return p


def _groq_key() -> str | None:
    return os.environ.get("GROQ_API_KEY") or None


def status() -> dict:
    """For /api/health: which engine is active, whether audio leaves the machine, and if it can work right now."""
    p = provider()
    if p == "groq":
        ready = _groq_key() is not None
        return {"provider": "groq", "model": os.environ.get("FINMATE_GROQ_STT_MODEL", DEFAULT_GROQ_MODEL),
                "cloud": True, "ready": ready, "problem": None if ready else "GROQ_API_KEY is not set"}
    return {"provider": "local", "model": os.environ.get("FINMATE_WHISPER_MODEL", "small"),
            "cloud": False, "ready": True, "problem": None}


# ---- local: faster-whisper ----------------------------------------------------------------------
_whisper = None


def _load_whisper():
    """Load the model once. The first call downloads it (about 500 MB for `small`)."""
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel

        _whisper = WhisperModel(os.environ.get("FINMATE_WHISPER_MODEL", "small"), device="cpu", compute_type="int8")
    return _whisper


def transcribe_local(path: Path, language: str | None = None) -> str:
    """int8 on CPU. Handles Hindi and English; language=None lets Whisper detect it."""
    segments, _info = _load_whisper().transcribe(str(path), beam_size=1, vad_filter=True, language=language)
    return " ".join(s.text.strip() for s in segments).strip()


# ---- cloud: Groq Whisper ------------------------------------------------------------------------
def transcribe_groq(path: Path, language: str | None = None) -> str:
    key = _groq_key()
    if key is None:
        raise SttError("Groq speech-to-text needs GROQ_API_KEY in backend/.env.")
    data = {"model": os.environ.get("FINMATE_GROQ_STT_MODEL", DEFAULT_GROQ_MODEL),
            "response_format": "json", "temperature": "0"}
    if language:
        data["language"] = language
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    try:
        resp = httpx.post(GROQ_URL, headers={"Authorization": f"Bearer {key}"}, data=data,
                          files={"file": (path.name, path.read_bytes(), mime)}, timeout=30.0)
    except httpx.HTTPError as exc:
        log.warning("Groq transcription request failed: %s", type(exc).__name__)
        raise SttError("Could not reach Groq. Check the internet connection, or switch FINMATE_STT_PROVIDER=local.") from exc
    if resp.status_code == 401:
        raise SttError("Groq rejected the API key. Check GROQ_API_KEY.")
    if resp.status_code == 429:
        raise SttError("Groq rate limit reached. Try again in a moment.")
    if resp.status_code >= 400:
        raise SttError(f"Groq could not transcribe this audio (error {resp.status_code}).")
    return str(resp.json().get("text", "")).strip()


# ---- entry point --------------------------------------------------------------------------------
def transcribe(path: Path, language: str | None = None) -> str:
    """Transcribe an audio file with the configured engine. Raises SttError with a user-safe message."""
    try:
        return transcribe_groq(path, language) if provider() == "groq" else transcribe_local(path, language)
    except SttError:
        raise
    except ImportError as exc:
        raise SttError("Local speech-to-text is not installed. Run `pip install faster-whisper` in the backend.") from exc
    except Exception as exc:  # noqa: BLE001 - never leak paths or internals to the client
        log.exception("speech-to-text failed")
        raise SttError(f"Speech-to-text failed ({type(exc).__name__}). Check the backend log.") from exc
