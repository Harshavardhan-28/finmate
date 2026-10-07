"""FinMate MCP server: every tool the agents can call, over the shared SQLite memory.

Run standalone (stdio):  python -m finmate.mcp_server
Each ADK agent connects to this server and sees only its own subset of tools.
"""
from mcp.server.mcpserver import MCPServer

from . import db, services, vision

mcp = MCPServer("finmate-tools")


# ---- Receipt Agent tools -------------------------------------------------------------
@mcp.tool()
def ocr_receipt(attachment_id: str) -> dict:
    """OCR + field extraction for an uploaded receipt image. Returns PROPOSED fields (amount, date,
    merchant, category, note, unclear_fields). Does not save anything."""
    return vision.extract(attachment_id, "receipt image")


@mcp.tool()
def transcribe_voice(attachment_id: str) -> dict:
    """Speech-to-text + field extraction for an uploaded voice note such as 'spent 450 on cab'.
    Returns PROPOSED fields plus the transcript. Does not save anything."""
    return vision.extract(attachment_id, "voice note")


@mcp.tool()
def propose_expense(amount: float, date: str, merchant: str, category: str, source: str,
                    note: str = "", unclear_fields: list[str] | None = None) -> dict:
    """Normalise a draft expense and hand it to the user for confirmation (human in the loop).
    ALWAYS call this as the last step of capturing an expense, whatever the input mode. It does not
    save. source is receipt, voice or form. List in unclear_fields anything you are unsure about."""
    if amount is None or float(amount) <= 0:
        return {"error": "invalid_amount", "message": "Amount must be greater than zero."}
    return {"proposal": {"amount": float(amount), "date": date, "merchant": merchant,
                         "category": services.normalize_category(category), "source": source,
                         "note": note, "unclear_fields": unclear_fields or []},
            "status": "awaiting_user_confirmation"}


@mcp.tool()
def save_expense(user_id: str, amount: float, date: str, merchant: str, category: str,
                 source: str = "form", note: str = "") -> dict:
    """Save a CONFIRMED expense for a user. Only call after the user confirmed the fields.
    date is YYYY-MM-DD. category is one of Transport, Food, Groceries, Shopping, Entertainment,
    Utilities, Health, Other. source is receipt, voice or form. note is a short description such as
    the route ('Home to Office') or item. Returns the saved expense plus any budget alerts triggered."""
    return services.save_expense(user_id, amount, date, merchant, category, source, note)


# ---- Budget Agent tools --------------------------------------------------------------
@mcp.tool()
def get_budget_status(user_id: str) -> dict:
    """Month-to-date spend versus limit for the user's personal budgets and their family's shared
    budgets. Each row has category, limit, spent, pct and level (ok, warning at 80%, exceeded at 100%)."""
    return services.budget_status(user_id)


@mcp.tool()
def set_budget(user_id: str, owner_type: str, owner_id: str, category: str, monthly_limit: float) -> dict:
    """Create or change a monthly budget limit. owner_type is 'user' (owner_id = the user's own id) or
    'family' (owner_id = family id, admin only). Only call after the user explicitly approved the change."""
    return services.set_budget(user_id, owner_type, owner_id, category, monthly_limit)


@mcp.tool()
def get_alerts(user_id: str, limit: int = 10) -> dict:
    """Recent budget alerts raised for this user (newest first)."""
    return {"alerts": services.list_alerts(user_id, limit)}


# ---- Family Agent tools --------------------------------------------------------------
@mcp.tool()
def get_user_role(user_id: str) -> dict:
    """Return the user's name, role (admin or member) and family_id."""
    return services.get_user_role(user_id)


@mcp.tool()
def get_family_view(user_id: str) -> dict:
    """Household view: every member's spend, household total, family budgets and recent alerts.
    Allowed for the family admin only; members get a permission_denied error."""
    return services.family_view(user_id)


@mcp.tool()
def add_family_member(admin_id: str, name: str) -> dict:
    """Add a new member to the admin's family. Admin only."""
    return services.add_family_member(admin_id, name)


# ---- Insights Agent tools ------------------------------------------------------------
@mcp.tool()
def get_expenses(user_id: str, days: int = 30, category: str = "") -> dict:
    """List a user's expenses for the last N days, newest first; optionally filter by category."""
    return {"expenses": services.get_expenses(user_id, days, category or None)}


@mcp.tool()
def analyze_trends(user_id: str, days: int = 30, category: str = "") -> dict:
    """Facts about recent spending: total, totals by category, top merchants and recurring_patterns
    (the same purchase repeated 3+ times, with count, total and average). Use these numbers in advice."""
    return services.trend_analysis(user_id, days, category or None)


@mcp.tool()
def suggest_alternatives(category: str) -> dict:
    """Cheaper local alternatives for a spending category (e.g. metro instead of cab in Transport)."""
    return {"category": category, "alternatives": services.suggest_alternatives(category)}


@mcp.tool()
def get_advice_history(user_id: str, limit: int = 5) -> dict:
    """Advice already given to this user, so suggestions are not repeated."""
    return {"advice": services.get_advice_history(user_id, limit)}


@mcp.tool()
def save_advice(user_id: str, text: str) -> dict:
    """Remember a piece of advice that was given to the user (shared memory)."""
    return services.save_advice(user_id, text)


if __name__ == "__main__":
    db.init_db()
    mcp.run("stdio")
