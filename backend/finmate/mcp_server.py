"""FinMate MCP server: every tool the agents can call, over the shared Postgres memory.

Security model (see identity.py): tools take NO identity arguments. The user is the principal proven by
the bearer tool token on the request, set by ToolAuthMiddleware. A tool therefore cannot be pointed at
someone else's data by anything the model says. The services layer still enforces roles on top.

A real, standalone MCP server: stateless streamable HTTP, one authenticated request = one tool call.
Run it with `python -m finmate.mcp_server` (host/port: FINMATE_MCP_HOST / FINMATE_MCP_PORT, default 127.0.0.1:8001).
The API starts it for you in development; in production run it as its own service.
"""
import json
import logging
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

from pydantic import ValidationError

from . import db, identity, services, vision
from .schemas import BillProposal, ExpenseProposal

log = logging.getLogger("finmate.tools")
mcp = MCPServer("finmate-tools")


def _me() -> str:
    return identity.current_user_id()


# ---- Receipt Agent tools -------------------------------------------------------------
@mcp.tool()
def ocr_receipt(attachment_id: str) -> dict:
    """Read a bill / receipt photo the signed-in user uploaded: merchant, date, total and EVERY line item with its
    own category. The full bill is held server-side as a draft; you get a short summary and the draft_id. Pass that
    draft_id to propose_bill. Does not save anything."""
    me = _me()
    out = vision.extract(attachment_id, "receipt image", me)
    try:
        bill = BillProposal(**out["bill"], source="receipt", attachment_id=attachment_id)
    except ValidationError as exc:
        return {"error": "invalid_bill", "message": "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())}
    services.put_draft(me, attachment_id, "proposed", bill.as_json())
    by_cat: dict[str, float] = {}
    for i in bill.items:
        by_cat[i.category] = round(by_cat.get(i.category, 0) + i.amount, 2)
    return {"draft_id": attachment_id, "merchant": bill.merchant, "date": bill.date.isoformat(), "total": bill.total,
            "item_count": len(bill.items), "by_category": by_cat, "unclear_fields": bill.unclear_fields}


@mcp.tool()
def propose_bill(draft_id: str, unclear_fields: list[str] | None = None) -> dict:
    """Hand a bill read by ocr_receipt to the user for review and confirmation (human in the loop). ALWAYS call this
    as the last step of capturing a photographed bill. It does not save. Pass only the draft_id from ocr_receipt;
    list in unclear_fields anything you are unsure about."""
    me = _me()
    draft = services.get_draft(me, draft_id, "proposed")
    if draft is None:
        return {"error": "unknown_draft", "message": "No such bill draft. Run ocr_receipt on the receipt first."}
    if unclear_fields:
        draft["unclear_fields"] = sorted(set(draft.get("unclear_fields", [])) | {u for u in unclear_fields if u in ("merchant", "date", "total", "items")})
    return {"bill_proposal": {**draft, "draft_id": draft_id}, "status": "awaiting_user_confirmation"}


@mcp.tool()
def save_bill(confirmation_id: str) -> dict:
    """Save a bill the user CONFIRMED (the request gives a confirmation_id). Every line item is saved as its own
    expense in its own category, all linked to one bill. Returns the saved bill with its items plus any budget alerts."""
    me = _me()
    bill = services.get_draft(me, confirmation_id, "confirmed")
    if bill is None:
        return {"error": "unknown_confirmation", "message": "No confirmed bill with that id. Do not retry; tell the user."}
    saved = services.save_bill(me, bill["merchant"], bill["date"], bill["items"], bill.get("note", ""), bill.get("source", "receipt"),
                               bill_number=bill.get("bill_number", ""), payment_method=bill.get("payment_method", ""),
                               tax_fees=bill.get("tax_fees", 0), discount=bill.get("discount", 0),
                               attachment_id=bill.get("attachment_id"))
    services.drop_draft(me, confirmation_id)
    return saved


@mcp.tool()
def transcribe_voice(attachment_id: str) -> dict:
    """Speech-to-text + field extraction for a voice note the signed-in user uploaded, such as
    'spent 450 on cab'. Returns PROPOSED fields plus the transcript. Does not save anything."""
    return vision.extract(attachment_id, "voice note", _me())


@mcp.tool()
def propose_expense(amount: float, date: str, merchant: str, category: str, source: str,
                    note: str = "", unclear_fields: list[str] | None = None) -> dict:
    """Normalise a draft expense and hand it to the user for confirmation (human in the loop).
    ALWAYS call this as the last step of capturing an expense, whatever the input mode. It does not
    save. source is receipt, voice or form. List in unclear_fields anything you are unsure about."""
    try:
        proposal = ExpenseProposal(amount=amount, date=date, merchant=merchant, category=category, source=source,
                                   note=note, unclear_fields=unclear_fields or [])
    except ValidationError as exc:
        return {"error": "invalid_expense", "message": "; ".join(f"{e['loc'][0]}: {e['msg']}" for e in exc.errors())}
    return {"proposal": proposal.as_json(), "status": "awaiting_user_confirmation"}


@mcp.tool()
def save_expense(amount: float, date: str, merchant: str, category: str,
                 source: str = "form", note: str = "") -> dict:
    """Save a CONFIRMED expense for the signed-in user. Only call after the user confirmed the fields.
    date is YYYY-MM-DD. category is one of Transport, Food, Groceries, Shopping, Entertainment,
    Utilities, Health, Other. source is receipt, voice or form. note is a short description such as
    the route ('Home to Office') or item. Returns the saved expense plus any budget alerts triggered."""
    return services.save_expense(_me(), amount, date, merchant, category, source, note)


# ---- Budget Agent tools --------------------------------------------------------------
@mcp.tool()
def get_budget_status() -> dict:
    """Month-to-date spend versus limit for the signed-in user's personal budgets and their family's shared
    budgets. Each row has category, limit, spent, pct and level (ok, warning at the user's threshold, exceeded at 100%)."""
    return services.budget_status(_me())


@mcp.tool()
def set_budget(owner_type: str, category: str, monthly_limit: float) -> dict:
    """Create or change a monthly budget limit for the signed-in user. owner_type is 'user' (their own
    personal budget) or 'family' (their family's shared budget, admin only). Only call after the user
    explicitly approved the change."""
    uid = _me()
    if owner_type == "user":
        owner_id = uid
    elif owner_type == "family":
        owner_id = services.get_user_role(uid)["family_id"]
    else:
        return {"error": "invalid_owner_type", "message": "owner_type must be 'user' or 'family'."}
    return services.set_budget(uid, owner_type, owner_id, category, monthly_limit)


@mcp.tool()
def get_alerts(limit: int = 10) -> dict:
    """Recent budget alerts raised for the signed-in user (newest first)."""
    return {"alerts": services.list_alerts(_me(), limit)}


# ---- Family Agent tools --------------------------------------------------------------
@mcp.tool()
def get_user_role() -> dict:
    """Return the signed-in user's name, role (admin or member) and family_id."""
    return services.get_user_role(_me())


@mcp.tool()
def get_family_view() -> dict:
    """Household view: every member's spend, household total, family budgets and recent alerts.
    Allowed for the family admin only; members get a permission_denied error."""
    return services.family_view(_me())


@mcp.tool()
def add_family_member(name: str) -> dict:
    """Add a new member to the signed-in admin's family. Admin only."""
    return services.add_family_member(_me(), name)


# ---- Insights Agent tools ------------------------------------------------------------
@mcp.tool()
def get_expenses(days: int = 30, category: str = "") -> dict:
    """List the signed-in user's expenses for the last N days, newest first; optionally filter by category."""
    return {"expenses": services.get_expenses(_me(), days, category or None)}


@mcp.tool()
def analyze_trends(days: int = 30, category: str = "") -> dict:
    """Facts about the signed-in user's recent spending: total, totals by category, top merchants and
    recurring_patterns (the same purchase repeated 3+ times, with count, total and average). Use these numbers in advice."""
    return services.trend_analysis(_me(), days, category or None)


@mcp.tool()
def suggest_alternatives(category: str) -> dict:
    """Cheaper local alternatives for a spending category (e.g. metro instead of cab in Transport)."""
    return {"category": category, "alternatives": services.suggest_alternatives(category)}


@mcp.tool()
def get_advice_history(limit: int = 5) -> dict:
    """Advice already given to the signed-in user, so suggestions are not repeated."""
    return {"advice": services.get_advice_history(_me(), limit)}


@mcp.tool()
def save_advice(text: str) -> dict:
    """Remember a piece of advice that was given to the signed-in user (shared memory)."""
    return services.save_advice(_me(), text)


# ---- Transport: stateless streamable HTTP behind bearer-token auth -----------------------
class ToolAuthMiddleware:
    """Pure-ASGI gate: no valid tool token, no tool call. Sets the principal for the request's task tree."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        auth = dict(scope["headers"]).get(b"authorization", b"").decode()
        scheme, _, token = auth.partition(" ")
        try:
            if scheme.lower() != "bearer" or not token:
                raise identity.ToolAuthError("missing bearer token")
            user_id = identity.verify_tool_token(token)
        except identity.ToolAuthError as exc:
            log.warning("tool auth rejected: %s", exc)
            body = json.dumps({"error": "unauthorized"}).encode()
            await send({"type": "http.response.start", "status": 401, "headers": [
                (b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()),
                (b"www-authenticate", b'Bearer realm="finmate-tools"')]})
            await send({"type": "http.response.body", "body": body})
            return
        marker = identity.set_principal(user_id)
        try:
            await self.app(scope, receive, send)
        finally:
            identity.reset_principal(marker)


DEFAULT_HOST, DEFAULT_PORT = "127.0.0.1", 8001


def mcp_url() -> str:
    """Where agents reach the tool server."""
    import os
    return os.environ.get("FINMATE_MCP_URL") or f"http://{DEFAULT_HOST}:{DEFAULT_PORT}/mcp"


def build_app(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT):
    """The authenticated ASGI app (middleware in front of the MCP streamable-HTTP app)."""
    inner = mcp.streamable_http_app(
        stateless_http=True, json_response=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=[host, f"{host}:*", "127.0.0.1", "127.0.0.1:*", "localhost", "localhost:*"],
            allowed_origins=[]))
    return ToolAuthMiddleware(inner)


def main() -> None:
    import os

    import uvicorn

    host = os.environ.get("FINMATE_MCP_HOST", DEFAULT_HOST)
    port = int(os.environ.get("FINMATE_MCP_PORT", DEFAULT_PORT))
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    db.init_db()
    uvicorn.run(build_app(host, port), host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
