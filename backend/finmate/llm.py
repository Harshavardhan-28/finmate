"""One switch for every model the backend uses: Gemini in the cloud, or small quantized models on Ollama.

    FINMATE_LLM_PROVIDER=gemini   (default)  agents, receipt OCR and voice use Gemini (needs GOOGLE_API_KEY)
    FINMATE_LLM_PROVIDER=ollama               agents via ADK LiteLlm -> Ollama, OCR via an Ollama vision model,
                                              voice via local Whisper. Nothing leaves the machine.

Ollama models are chosen per agent, so each job gets the smallest model that does it well:
    FINMATE_OLLAMA_MODEL                 fallback for any agent
    FINMATE_OLLAMA_{ORCHESTRATOR,RECEIPT,BUDGET,FAMILY,INSIGHTS}_MODEL   per-agent override
    FINMATE_OLLAMA_VISION_MODEL          receipt photos
    FINMATE_WHISPER_MODEL                voice notes (faster-whisper size: tiny/base/small)
Tags are Ollama defaults, which are 4-bit quantized (Q4_K_M).
"""
import os
import urllib.error
import urllib.request

AGENT_NAMES = ("orchestrator", "receipt", "budget", "family", "insights")
DEFAULT_GEMINI = "gemini-2.5-flash"
DEFAULT_OLLAMA = "qwen3:8b"
DEFAULT_VISION = "qwen2.5vl:3b"


def provider() -> str:
    p = os.environ.get("FINMATE_LLM_PROVIDER", "gemini").strip().lower()
    if p not in ("gemini", "ollama"):
        raise ValueError(f"FINMATE_LLM_PROVIDER must be 'gemini' or 'ollama', got {p!r}")
    return p


def gemini_model() -> str:
    return os.environ.get("FINMATE_MODEL", DEFAULT_GEMINI)


def ollama_base() -> str:
    return os.environ.get("OLLAMA_API_BASE", "http://localhost:11434").rstrip("/")


def ollama_tag(agent: str) -> str:
    return (os.environ.get(f"FINMATE_OLLAMA_{agent.upper()}_MODEL")
            or os.environ.get("FINMATE_OLLAMA_MODEL") or DEFAULT_OLLAMA)


def ollama_vision_tag() -> str:
    return os.environ.get("FINMATE_OLLAMA_VISION_MODEL", DEFAULT_VISION)


def ollama_options() -> dict:
    """Generation options sent with every Ollama request. num_ctx matters: Ollama's default context is far
    smaller than FinMate's agent prompts plus tool schemas, and silently truncates them."""
    return {"num_ctx": int(os.environ.get("FINMATE_OLLAMA_NUM_CTX", "8192"))}


def model_for(agent: str):
    """The `model=` value for an ADK LlmAgent: a Gemini model id, or a LiteLlm bound to the agent's Ollama tag."""
    if provider() == "gemini":
        return gemini_model()
    from google.adk.models.lite_llm import LiteLlm  # imported lazily: only needed for local models

    # think=False: Qwen3 otherwise "thinks" for hundreds of tokens before every tool call (~25x slower) and can leak
    # that reasoning into replies. Set FINMATE_OLLAMA_THINK=1 to turn it back on for models that benefit.
    think = os.environ.get("FINMATE_OLLAMA_THINK", "0") == "1"
    return LiteLlm(model=f"ollama_chat/{ollama_tag(agent)}", api_base=ollama_base(), think=think,
                   keep_alive=os.environ.get("FINMATE_OLLAMA_KEEP_ALIVE", "30m"), **ollama_options())


def _ollama_models() -> set[str] | None:
    try:
        import json
        with urllib.request.urlopen(f"{ollama_base()}/api/tags", timeout=2) as r:
            return {m["name"] for m in json.load(r).get("models", [])}
    except (urllib.error.URLError, OSError, ValueError):
        return None


def status() -> dict:
    """What /api/health reports: provider, models, and whether it can actually answer right now."""
    if provider() == "gemini":
        ready = bool(os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY"))
        return {"provider": "gemini", "model": gemini_model(), "ready": ready,
                "problem": None if ready else "GOOGLE_API_KEY is not set"}
    wanted = {ollama_tag(a) for a in AGENT_NAMES} | {ollama_vision_tag()}
    have = _ollama_models()
    if have is None:
        return {"provider": "ollama", "model": ollama_tag("orchestrator"), "ready": False,
                "problem": f"Ollama is not reachable at {ollama_base()}. Start it with `ollama serve`."}

    def present(tag: str) -> bool:
        return tag in have or (":" not in tag and f"{tag}:latest" in have)

    missing = sorted(t for t in wanted if not present(t))
    return {"provider": "ollama", "model": ollama_tag("orchestrator"), "ready": not missing,
            "problem": f"Missing Ollama models: {', '.join(missing)}. Run `ollama pull <name>`." if missing else None}
