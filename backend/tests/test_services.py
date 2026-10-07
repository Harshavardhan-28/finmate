import pytest

from finmate import db, services


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setenv("FINMATE_DB", str(tmp_path / "t.db"))
    monkeypatch.setenv("FINMATE_TODAY", "2026-10-08")
    db.init_db(reset=True)


def test_seed_creates_family_with_roles():
    users = {u["id"]: u for u in services.list_users()}
    assert users["u_ravi"]["role"] == "admin"
    assert users["u_priya"]["role"] == "member"
    assert users["u_ravi"]["family_id"] == users["u_priya"]["family_id"]


def test_seed_transport_is_near_limit_but_not_over():
    status = services.budget_status("u_ravi")
    transport = next(b for b in status["personal"] if b["category"] == "Transport")
    assert 85 <= transport["pct"] < 100


def test_demo_receipt_pushes_transport_over_limit_and_raises_alert():
    result = services.save_expense(
        user_id="u_ravi", amount=450, date="2026-10-08",
        merchant="Uber", category="Transport", source="receipt",
        note="Home to Office",
    )
    assert result["expense"]["amount"] == 450
    alerts = [a for a in result["alerts"] if a["category"] == "Transport"]
    assert alerts and alerts[0]["level"] == "exceeded"
    assert alerts[0]["pct"] >= 100


def test_crossing_80_percent_gives_warning_not_exceeded():
    services.set_budget("u_priya", "user", "u_priya", "Shopping", 1000)
    result = services.save_expense("u_priya", 850, "2026-10-08", "Myntra", "Shopping", "form")
    levels = [a["level"] for a in result["alerts"]]
    assert levels == ["warning"]


def test_no_duplicate_alert_when_already_exceeded():
    services.set_budget("u_priya", "user", "u_priya", "Shopping", 1000)
    services.save_expense("u_priya", 1100, "2026-10-08", "Myntra", "Shopping", "form")
    again = services.save_expense("u_priya", 50, "2026-10-08", "Myntra", "Shopping", "form")
    assert again["alerts"] == []


def test_unknown_category_falls_back_to_other():
    result = services.save_expense("u_ravi", 10, "2026-10-08", "Kiosk", "gadgets", "form")
    assert result["expense"]["category"] == "Other"


def test_invalid_amount_rejected():
    with pytest.raises(ValueError):
        services.save_expense("u_ravi", 0, "2026-10-08", "X", "Food", "form")


def test_trend_analysis_finds_recurring_cab_route():
    trend = services.trend_analysis("u_ravi", days=30)
    cab = [p for p in trend["recurring_patterns"] if p["category"] == "Transport"]
    assert cab and cab[0]["count"] >= 15
    assert "Home" in cab[0]["note"]


def test_family_view_admin_sees_all_members():
    view = services.family_view("u_ravi")
    names = {m["name"] for m in view["members"]}
    assert {"Ravi", "Priya"} <= names
    assert view["household_total"] == pytest.approx(sum(m["spent"] for m in view["members"]))


def test_family_view_denied_for_member():
    view = services.family_view("u_priya")
    assert view["error"] == "permission_denied"


def test_family_alert_visible_in_admin_view_after_member_overspend():
    services.set_budget("u_priya", "user", "u_priya", "Shopping", 500)
    services.save_expense("u_priya", 600, "2026-10-08", "Myntra", "Shopping", "form")
    view = services.family_view("u_ravi")
    assert any(a["user"] == "Priya" for a in view["recent_alerts"])


def test_advice_history_roundtrip():
    services.save_advice("u_ravi", "Take the metro for the daily commute.")
    history = services.get_advice_history("u_ravi")
    assert history[0]["text"].startswith("Take the metro")


def test_suggest_alternatives_transport():
    hints = services.suggest_alternatives("Transport")
    assert any("metro" in h.lower() for h in hints)


@pytest.mark.parametrize("today", ["2026-10-02", "2026-10-15", "2026-10-31"])
def test_demo_story_holds_on_any_day_of_month(monkeypatch, today):
    monkeypatch.setenv("FINMATE_TODAY", today)
    db.init_db(reset=True)
    pre = next(b for b in services.budget_status("u_ravi")["personal"] if b["category"] == "Transport")
    assert pre["pct"] < 100
    r = services.save_expense("u_ravi", 450, today, "Uber", "Transport", "receipt", "Home to Office")
    assert any(a["level"] == "exceeded" for a in r["alerts"])
