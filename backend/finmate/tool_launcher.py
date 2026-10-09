"""Starts the real FinMate MCP server as its own process for local development.

In production run `python -m finmate.mcp_server` as a separate service and set FINMATE_MCP_URL (and
FINMATE_MCP_AUTOSTART=0). In development the API calls ensure_running() so one command still brings up everything.
"""
import asyncio
import logging
import os
import socket
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

from .mcp_server import mcp_url

log = logging.getLogger("finmate.tools")
BACKEND_DIR = Path(__file__).resolve().parent.parent
# The tool server needs the database and the model key, but never the Google OAuth client secrets.
_WITHHELD = {"GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"}


def _open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False


async def ensure_running() -> subprocess.Popen | None:
    """Return the spawned process, or None if autostart is off or a server is already listening."""
    if os.environ.get("FINMATE_MCP_AUTOSTART", "1") != "1":
        return None
    u = urlparse(mcp_url())
    host, port = u.hostname or "127.0.0.1", u.port or 8001
    if _open(host, port):
        log.info("MCP tool server already listening on %s:%s", host, port)
        return None
    env = {k: v for k, v in os.environ.items() if k not in _WITHHELD}
    env.update(FINMATE_MCP_HOST=host, FINMATE_MCP_PORT=str(port))
    proc = subprocess.Popen([sys.executable, "-m", "finmate.mcp_server"], cwd=str(BACKEND_DIR), env=env)
    for _ in range(100):
        if proc.poll() is not None:
            raise RuntimeError(f"FinMate MCP server exited with code {proc.returncode} on startup")
        if _open(host, port):
            log.info("started MCP tool server pid=%s on %s:%s", proc.pid, host, port)
            return proc
        await asyncio.sleep(0.2)
    proc.terminate()
    raise RuntimeError(f"FinMate MCP server did not open {host}:{port} within 20s")


def stop(proc: subprocess.Popen | None) -> None:
    if proc is not None and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
