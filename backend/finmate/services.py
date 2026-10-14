"""Business logic behind every agent tool. Pure functions over the shared Postgres memory."""
from datetime import timedelta

from . import db

WARN_PCT = 80
EXCEED_PCT = 100
_LEVEL_RANK = {"ok": 0, "warning": 1, "exceeded": 2}

_ALTERNATIVES = {
    "Transport": [
        "Take the metro or bus for the daily commute; a typical metro ride costs about ₹60 versus ₹400+ for a cab.",
        "Share a cab or use a monthly metro pass for routes you repeat.",
    ],
    "Food": [
        "Cook at home 2-3 more times a week instead of ordering in; delivery fees and markups add 30-40%.",
        "Skip delivery apps for lunch and carry a tiffin on office days.",
    ],
    "Groceries": [
        "Buy staples in bulk from a wholesale store once a month and shop weekly for fresh produce only.",
    ],
    "Entertainment": [
        "Share one family subscription instead of several individual ones and cancel unused services.",
    ],
    "Shopping": [
        "Wait 48 hours before non-essential purchases and compare prices on two sites.",
    ],
    "Utilities": [
        "Switch to LED bulbs and 5-star appliances and run heavy loads outside peak hours.",
    ],
}


def _level(pct: float, warn: int = WARN_PCT) -> str:
    if pct >= EXCEED_PCT:
        return "exceeded"
    if pct >= warn:
        return "warning"
    return "ok"


def _month() -> str:
    return db.today().strftime("%Y-%m")


def _row(r) -> dict:
    return dict(r) if r is not None else {}


_USER_COLS = "id, name, role, family_id, email, currency, warn_pct"  # never select password_hash / google_sub here


def list_users() -> list[dict]:
    with db.connect() as c:
        return [dict(r) for r in c.execute(f"SELECT {_USER_COLS} FROM users ORDER BY role, name")]


def _user(c, user_id: str) -> dict:
    r = c.execute(f"SELECT {_USER_COLS} FROM users WHERE id=%s", (user_id,)).fetchone()
    if r is None:
        raise ValueError(f"unknown user_id {user_id!r}")
    return dict(r)


def _spent(c, owner_type: str, owner_id: str, category: str, month: str) -> float:
    if owner_type == "user":
        q = ("SELECT COALESCE(SUM(amount),0) FROM expenses"
             " WHERE user_id=%s AND category=%s AND substr(date,1,7)=%s")
    else:
        q = ("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE category=%s"
             " AND substr(date,1,7)=%s AND user_id IN (SELECT id FROM users WHERE family_id=%s)")
        return c.execute(q, (category, month, owner_id)).fetchone()[0]
    return c.execute(q, (owner_id, category, month)).fetchone()[0]


def _status_rows(c, owner_type: str, owner_id: str, month: str, warn: int = WARN_PCT) -> list[dict]:
    out = []
    for b in c.execute(
        "SELECT category, monthly_limit FROM budgets WHERE owner_type=%s AND owner_id=%s"
        " ORDER BY category", (owner_type, owner_id)):
        spent = _spent(c, owner_type, owner_id, b["category"], month)
        pct = round(spent / b["monthly_limit"] * 100, 1) if b["monthly_limit"] else 0.0
        out.append({"category": b["category"], "limit": b["monthly_limit"],
                    "spent": round(spent, 2), "pct": pct, "level": _level(pct, warn)})
    return out


def budget_status(user_id: str) -> dict:
    """Month-to-date spend vs limit for the user's personal budgets and their family's budgets."""
    with db.connect() as c:
        u = _user(c, user_id)
        m = _month()
        w = u["warn_pct"]
        return {"month": m, "warn_pct": w,
                "personal": _status_rows(c, "user", user_id, m, w),
                "family": _status_rows(c, "family", u["family_id"], m, w)}


def set_budget(user_id: str, owner_type: str, owner_id: str, category: str, monthly_limit: float) -> dict:
    """Create or change a limit. Family budgets can only be set by the family admin."""
    if monthly_limit <= 0:
        raise ValueError("monthly_limit must be positive")
    category = normalize_category(category)
    with db.connect() as c:
        u = _user(c, user_id)
        if owner_type == "family":
            if u["role"] != "admin" or owner_id != u["family_id"]:
                return {"error": "permission_denied", "message": "Only the family admin can set family budgets."}
        elif owner_id != user_id:
            return {"error": "permission_denied", "message": "You can only set your own personal budgets."}
        c.execute("INSERT INTO budgets VALUES (%s,%s,%s,%s)"
                  " ON CONFLICT (owner_type, owner_id, category)"
                  " DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit",
                  (owner_type, owner_id, category, monthly_limit))
    return {"ok": True, "owner_type": owner_type, "owner_id": owner_id,
            "category": category, "monthly_limit": monthly_limit}


def delete_budget(user_id: str, owner_type: str, owner_id: str, category: str) -> dict:
    with db.connect() as c:
        u = _user(c, user_id)
        if owner_type == "family":
            if u["role"] != "admin" or owner_id != u["family_id"]:
                return {"error": "permission_denied", "message": "Only the family admin can remove family budgets."}
        elif owner_id != user_id:
            return {"error": "permission_denied", "message": "You can only remove your own budgets."}
        n = c.execute("DELETE FROM budgets WHERE owner_type=%s AND owner_id=%s AND category=%s",
                      (owner_type, owner_id, normalize_category(category))).rowcount
    return {"ok": n > 0}


def delete_expense(user_id: str, expense_id: int) -> bool:
    """Delete one of the user's own expenses. Returns False if it does not exist or is not theirs."""
    with db.connect() as c:
        return c.execute("DELETE FROM expenses WHERE id=%s AND user_id=%s", (expense_id, user_id)).rowcount > 0


def normalize_category(category: str) -> str:
    for known in db.CATEGORIES:
        if known.lower() == (category or "").strip().lower():
            return known
    return "Other"


def _alerts_for(c, u: dict, category: str, month: str, before: dict) -> list[dict]:
    """Alerts for crossing a warning/limit line in one category, given the percentages before the write."""
    alerts = []
    w = u["warn_pct"]
    for s in [("user", u["id"]), ("family", u["family_id"])]:
        after = _pct(c, s, category, month)
        if after is None:
            continue
        if _LEVEL_RANK[_level(after, w)] > _LEVEL_RANK[_level(before[s] or 0, w)]:
            lvl = _level(after, w)
            who = "Your" if s[0] == "user" else f"{u['name']}'s family"
            msg = (f"{who} {category} budget is at {after:.0f}% of its monthly limit"
                   + (" - limit exceeded." if lvl == "exceeded" else "."))
            c.execute("INSERT INTO alerts (user_id, family_id, scope, category, level, pct, message)"
                      " VALUES (%s,%s,%s,%s,%s,%s,%s)",
                      (u["id"], u["family_id"], s[0], category, lvl, after, msg))
            alerts.append({"scope": s[0], "category": category, "level": lvl, "pct": after, "message": msg})
    return alerts


def _before(c, u: dict, category: str, month: str) -> dict:
    return {s: _pct(c, s, category, month) for s in [("user", u["id"]), ("family", u["family_id"])]}


def save_expense(user_id: str, amount: float, date: str, merchant: str, category: str,
                 source: str = "form", note: str = "", receipt_path: str | None = None) -> dict:
    """Persist a confirmed expense and return any budget threshold alerts it triggered."""
    if amount is None or float(amount) <= 0:
        raise ValueError("amount must be positive")
    category = normalize_category(category)
    month = str(date)[:7]
    with db.connect() as c:
        u = _user(c, user_id)
        before = _before(c, u, category, month)
        expense = _row(c.execute(
            "INSERT INTO expenses (user_id, amount, date, merchant, category, source, note, receipt_path)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (user_id, float(amount), date, merchant, category, source, note, receipt_path)).fetchone())
        alerts = _alerts_for(c, u, category, month, before)
    return {"expense": expense, "alerts": alerts}


def save_bill(user_id: str, merchant: str, date: str, items: list[dict], note: str = "",
              source: str = "form") -> dict:
    """Save one bill with several items. Each item becomes an expense linked to the bill, so budgets
    still work per category. A category that crosses a line raises one alert for the whole bill."""
    if not items:
        raise ValueError("a bill needs at least one item")
    rows = []
    for it in items:
        amount = float(it.get("amount") or 0)
        if amount <= 0:
            raise ValueError("every item needs an amount greater than zero")
        rows.append((str(it.get("name") or "").strip(), amount, normalize_category(it.get("category") or "")))
    month = str(date)[:7]
    with db.connect() as c:
        u = _user(c, user_id)
        before = {cat: _before(c, u, cat, month) for cat in {r[2] for r in rows}}
        bill = _row(c.execute(
            "INSERT INTO bills (user_id, merchant, date, note, source) VALUES (%s,%s,%s,%s,%s) RETURNING *",
            (user_id, merchant, date, note, source)).fetchone())
        saved = [_row(c.execute(
            "INSERT INTO expenses (user_id, amount, date, merchant, category, source, note, bill_id)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (user_id, amount, date, merchant, cat, source, name, bill["id"])).fetchone())
            for name, amount, cat in rows]
        alerts = [a for cat in before for a in _alerts_for(c, u, cat, month, before[cat])]
    bill["items"] = saved
    bill["total"] = round(sum(i["amount"] for i in saved), 2)
    return {"bill": bill, "alerts": alerts}


def delete_bill(user_id: str, bill_id: int) -> bool:
    """Delete one of the user's bills together with all its items."""
    with db.connect() as c:
        if c.execute("SELECT 1 FROM bills WHERE id=%s AND user_id=%s", (bill_id, user_id)).fetchone() is None:
            return False
        c.execute("DELETE FROM expenses WHERE bill_id=%s", (bill_id,))
        c.execute("DELETE FROM bills WHERE id=%s", (bill_id,))
    return True


def _pct(c, scope: tuple[str, str], category: str, month: str):
    b = c.execute("SELECT monthly_limit FROM budgets WHERE owner_type=%s AND owner_id=%s AND category=%s",
                  (scope[0], scope[1], category)).fetchone()
    if b is None:
        return None
    return round(_spent(c, scope[0], scope[1], category, month) / b["monthly_limit"] * 100, 1)


def get_expenses(user_id: str, days: int = 30, category: str | None = None) -> list[dict]:
    since = (db.today() - timedelta(days=days)).isoformat()
    q = "SELECT * FROM expenses WHERE user_id=%s AND date>=%s"
    args: list = [user_id, since]
    if category:
        q += " AND category=%s"
        args.append(normalize_category(category))
    with db.connect() as c:
        return [dict(r) for r in c.execute(q + " ORDER BY date DESC, id DESC", args)]


def trend_analysis(user_id: str, days: int = 30, category: str | None = None) -> dict:
    """Facts about recent spending: totals by category, top merchants, repeated purchases."""
    rows = get_expenses(user_id, days, category)
    by_cat: dict[str, float] = {}
    merchants: dict[str, float] = {}
    patterns: dict[tuple[str, str], list[float]] = {}
    for r in rows:
        by_cat[r["category"]] = by_cat.get(r["category"], 0) + r["amount"]
        merchants[r["merchant"]] = merchants.get(r["merchant"], 0) + r["amount"]
        if r["note"]:
            patterns.setdefault((r["category"], r["note"]), []).append(r["amount"])
    recurring = [
        {"category": k[0], "note": k[1], "count": len(v), "total": round(sum(v), 2),
         "avg": round(sum(v) / len(v), 2)}
        for k, v in patterns.items() if len(v) >= 3
    ]
    recurring.sort(key=lambda p: p["total"], reverse=True)
    return {
        "days": days, "total": round(sum(by_cat.values()), 2),
        "by_category": {k: round(v, 2) for k, v in sorted(by_cat.items(), key=lambda kv: -kv[1])},
        "top_merchants": [{"merchant": m, "total": round(t, 2)}
                          for m, t in sorted(merchants.items(), key=lambda kv: -kv[1])[:5]],
        "recurring_patterns": recurring,
    }


def suggest_alternatives(category: str) -> list[str]:
    return _ALTERNATIVES.get(normalize_category(category), [])


def save_advice(user_id: str, text: str) -> dict:
    with db.connect() as c:
        _user(c, user_id)
        c.execute("INSERT INTO advice (user_id, text) VALUES (%s,%s)", (user_id, text))
    return {"ok": True}


def get_advice_history(user_id: str, limit: int = 5) -> list[dict]:
    with db.connect() as c:
        return [dict(r) for r in c.execute(
            "SELECT text, created_at FROM advice WHERE user_id=%s ORDER BY id DESC LIMIT %s",
            (user_id, limit))]


def get_user_role(user_id: str) -> dict:
    with db.connect() as c:
        u = _user(c, user_id)
        return {"user_id": u["id"], "name": u["name"], "role": u["role"], "family_id": u["family_id"]}


def family_view(user_id: str) -> dict:
    """Household view. Admins see every member; members are denied."""
    with db.connect() as c:
        u = _user(c, user_id)
        if u["role"] != "admin":
            return {"error": "permission_denied",
                    "message": "Only the family admin can see the household view."}
        m = _month()
        members = []
        for r in c.execute("SELECT id, name, role FROM users WHERE family_id=%s ORDER BY role, name",
                           (u["family_id"],)):
            spent = c.execute(
                "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE user_id=%s AND substr(date,1,7)=%s",
                (r["id"], m)).fetchone()[0]
            members.append({"user_id": r["id"], "name": r["name"], "role": r["role"],
                            "spent": round(spent, 2),
                            "budgets": _status_rows(c, "user", r["id"], m, u["warn_pct"])})
        alerts = [dict(r) for r in c.execute(
            "SELECT a.category, a.level, a.pct, a.message, a.scope, a.created_at, u.name AS user"
            " FROM alerts a JOIN users u ON u.id=a.user_id WHERE a.family_id=%s"
            " ORDER BY a.id DESC LIMIT 10", (u["family_id"],))]
        return {"month": m, "household_total": round(sum(x["spent"] for x in members), 2),
                "members": members, "family_budgets": _status_rows(c, "family", u["family_id"], m, u["warn_pct"]),
                "recent_alerts": alerts}


def add_family_member(admin_id: str, name: str) -> dict:
    with db.connect() as c:
        u = _user(c, admin_id)
        if u["role"] != "admin":
            return {"error": "permission_denied", "message": "Only the family admin can add members."}
        uid = "u_" + "".join(ch for ch in name.lower() if ch.isalnum())
        c.execute("INSERT INTO users (id, name, role, family_id) VALUES (%s,%s,%s,%s)"
                  " ON CONFLICT DO NOTHING", (uid, name, "member", u["family_id"]))
        return {"ok": True, "user_id": uid, "name": name, "role": "member"}


def list_alerts(user_id: str, limit: int = 10) -> list[dict]:
    with db.connect() as c:
        return [dict(r) for r in c.execute(
            "SELECT category, level, pct, message, scope, created_at FROM alerts"
            " WHERE user_id=%s ORDER BY id DESC LIMIT %s", (user_id, limit))]


def dashboard(user_id: str) -> dict:
    with db.connect() as c:
        u = _user(c, user_id)
    return {"user": u, "budgets": budget_status(user_id),
            "recent_expenses": get_expenses(user_id, 30)[:8],
            "alerts": list_alerts(user_id),
            "advice": get_advice_history(user_id, 3),
            "family": family_view(user_id)}
