"""The MCP server must be reachable over stdio, exactly how the ADK agents reach it."""
import os
import sys

import anyio
import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

EXPECTED = {
    "save_expense", "get_budget_status", "set_budget", "get_alerts", "get_user_role",
    "get_family_view", "add_family_member", "get_expenses", "analyze_trends",
    "suggest_alternatives", "get_advice_history", "save_advice",
}


@pytest.fixture
def params(tmp_path):
    env = {**os.environ, "FINMATE_DB": str(tmp_path / "m.db"), "FINMATE_TODAY": "2026-10-08"}
    return StdioServerParameters(command=sys.executable, args=["-m", "finmate.mcp_server"], env=env)


def test_server_lists_all_tools_and_serves_calls(params):
    async def run():
        async with stdio_client(params) as (r, w):
            async with ClientSession(r, w) as s:
                await s.initialize()
                tools = {t.name for t in (await s.list_tools()).tools}
                assert EXPECTED <= tools
                res = await s.call_tool("get_budget_status", {"user_id": "u_ravi"})
                assert not res.is_error
                assert "Transport" in str(res.content)
    anyio.run(run)
