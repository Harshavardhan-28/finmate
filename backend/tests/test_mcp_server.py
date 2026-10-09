"""The real MCP server over a real HTTP socket is the trust boundary: no valid tool token, no tool call; identity comes only from the token."""
import json

import httpx2
import pytest

from finmate import db, identity, services

EXPECTED = {
    "save_expense", "get_budget_status", "set_budget", "get_alerts", "get_user_role",
    "get_family_view", "add_family_member", "get_expenses", "analyze_trends",
    "suggest_alternatives", "get_advice_history", "save_advice", "ocr_receipt", "transcribe_voice", "propose_expense",
}
HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


@pytest.fixture
def url(mcp_server):
    db.init_db(reset=True)
    return mcp_server


async def rpc(url, method, params=None, *, token=None, rid=1):
    headers = dict(HEADERS)
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx2.AsyncClient() as c:
        return await c.post(url, headers=headers, json={"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}})


async def call(url, tool, args, user):
    r = await rpc(url, "tools/call", {"name": tool, "arguments": args}, token=identity.mint_tool_token(user))
    assert r.status_code == 200, r.text
    return r.json()["result"]


def body(result):
    return json.loads(result["content"][0]["text"]) if result.get("content") else result["structuredContent"]


@pytest.mark.anyio
async def test_requests_without_a_valid_token_are_rejected(url):
    assert (await rpc(url, "tools/list")).status_code == 401
    assert (await rpc(url, "tools/list", token="garbage")).status_code == 401
    # A login-session JWT is not a tool token.
    from finmate import auth
    assert (await rpc(url, "tools/list", token=auth.create_token("u_ravi"))).status_code == 401


@pytest.mark.anyio
async def test_server_lists_all_tools_and_none_take_identity_arguments(url):
    r = await rpc(url, "tools/list", token=identity.mint_tool_token("u_ravi"))
    tools = r.json()["result"]["tools"]
    assert EXPECTED <= {t["name"] for t in tools}
    for t in tools:
        props = set(t["inputSchema"].get("properties", {}))
        assert not props & {"user_id", "admin_id", "owner_id", "family_id"}, t["name"]


@pytest.mark.anyio
async def test_each_call_acts_only_for_the_token_subject(url):
    ravi = body(await call(url, "get_expenses", {"days": 90}, "u_ravi"))["expenses"]
    priya = body(await call(url, "get_expenses", {"days": 90}, "u_priya"))["expenses"]
    assert ravi and {e["user_id"] for e in ravi} == {"u_ravi"}
    assert {e["user_id"] for e in priya} <= {"u_priya"}
    assert ravi != priya


@pytest.mark.anyio
async def test_a_smuggled_user_id_cannot_redirect_a_call(url):
    """Even if a client sends user_id anyway, the tool ignores or rejects it; Priya's data never leaks to Ravi."""
    r = await rpc(url, "tools/call", {"name": "get_expenses", "arguments": {"user_id": "u_priya", "days": 90}},
                  token=identity.mint_tool_token("u_ravi"))
    result = r.json().get("result") or {}
    text = json.dumps(r.json())
    assert "u_priya" not in text or result.get("isError")
    priya_ids = {e["id"] for e in services.get_expenses("u_priya", 90)}
    if result and not result.get("isError"):
        assert not priya_ids & {e["id"] for e in body(result)["expenses"]}


@pytest.mark.anyio
async def test_members_cannot_use_admin_tools(url):
    denied = body(await call(url, "get_family_view", {}, "u_priya"))
    assert denied.get("error") == "permission_denied"
    ok = body(await call(url, "get_family_view", {}, "u_ravi"))
    assert "members" in ok
