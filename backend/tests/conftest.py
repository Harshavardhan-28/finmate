"""Tests run against a dedicated Postgres database (finmate_test) in the docker-compose db."""
import os
import socket
import threading
import time

import psycopg
import pytest

TEST_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://finmate:finmate@localhost:5432/finmate_test")
os.environ["DATABASE_URL"] = TEST_URL
os.environ.setdefault("BCRYPT_ROUNDS", "4")
os.environ["JWT_SECRET"] = "test-secret"
for _k in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"):
    os.environ.pop(_k, None)


def pytest_sessionstart(session):
    try:
        psycopg.connect(TEST_URL, connect_timeout=3).close()
    except psycopg.OperationalError as exc:
        pytest.exit(f"Postgres test database unreachable ({exc}). Run `docker compose up -d db` first.", 1)


@pytest.fixture(autouse=True)
def _test_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", TEST_URL)
    monkeypatch.setenv("FINMATE_TODAY", "2026-10-08")


@pytest.fixture(scope="session", autouse=True)
def mcp_server():
    """Run the real FinMate MCP server (uvicorn, real socket) for the whole test session."""
    import uvicorn

    from finmate import mcp_server as ms

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(ms.build_app("127.0.0.1", port), host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    assert server.started, "MCP server failed to start"
    url = f"http://127.0.0.1:{port}/mcp"
    os.environ["FINMATE_MCP_URL"] = url
    os.environ["FINMATE_MCP_AUTOSTART"] = "0"
    yield url
    server.should_exit = True
    thread.join(timeout=5)
