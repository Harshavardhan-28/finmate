"""Offline dev server: the real API, MCP tools and database, but a SCRIPTED model instead of Gemini.

For checking the UI/plumbing without an API key. The agent replies are canned and the receipt
"OCR" always returns the sample Uber receipt. Use `uvicorn finmate.api:app` for the real thing.
"""
import os

os.environ["FINMATE_FAKE_VISION"] = "1"
os.environ.setdefault("FINMATE_DB", os.path.join(os.path.dirname(__file__), "finmate_fake.db"))

import uvicorn  # noqa: E402

from finmate import agents  # noqa: E402
from tests.test_agents_e2e import FakeLlm  # noqa: E402

_real = agents.build_agents
agents.build_agents = lambda: _real(model=FakeLlm())

if __name__ == "__main__":
    uvicorn.run("finmate.api:app", host="127.0.0.1", port=8000)
