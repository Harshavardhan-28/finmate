"""Account management, family administration, preferences, and direct ledger writes."""
import pytest
from fastapi.testclient import TestClient

from finmate import agents, db
from tests.test_agents_e2e import FakeLlm


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FINMATE_UPLOADS", str(tmp_path / "uploads"))
    monkeypatch.setenv("FINMATE_FAKE_VISION", "1")
    real = agents.build_agents
    monkeypatch.setattr(agents, "build_agents", lambda **kw: real(model=FakeLlm(), **kw))
    db.init_db(reset=True)
    from finmate import api
    with TestClient(api.app) as c:
        yield c


def login(c, email="ravi@finmate.dev", password="demo1234"):
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---- profile & password ------------------------------------------------------------------
def test_update_profile_and_reject_taken_email(client):
    login(client)
    r = client.patch("/api/account/profile", json={"name": "Ravi K", "email": "ravi.k@finmate.dev"})
    assert r.status_code == 200 and r.json()["user"]["name"] == "Ravi K"
    assert client.get("/api/auth/me").json()["user"]["email"] == "ravi.k@finmate.dev"
    taken = client.patch("/api/account/profile", json={"name": "Ravi", "email": "PRIYA@finmate.dev"})
    assert taken.status_code == 409
    assert client.patch("/api/account/profile", json={"name": " ", "email": "a@b.co"}).status_code == 422


def test_change_password_requires_current_and_revokes_other_sessions(client):
    other_token = login(client)           # a second "device"
    client.cookies.clear()
    login(client)
    bad = client.post("/api/account/password", json={"current_password": "wrong", "new_password": "newpass123"})
    assert bad.status_code == 403
    weak = client.post("/api/account/password", json={"current_password": "demo1234", "new_password": "short"})
    assert weak.status_code == 422
    ok = client.post("/api/account/password", json={"current_password": "demo1234", "new_password": "newpass123"})
    assert ok.status_code == 200
    # This browser stays signed in (cookie reissued); the old token on another device is dead.
    assert client.get("/api/auth/me").status_code == 200
    client.cookies.clear()
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {other_token}"}).status_code == 401
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": "ravi@finmate.dev", "password": "demo1234"}).status_code == 401
    login(client, password="newpass123")


def test_sign_out_everywhere_keeps_current_session(client):
    old = login(client)
    assert client.post("/api/account/sign-out-everywhere").status_code == 200
    assert client.get("/api/auth/me").status_code == 200
    client.cookies.clear()
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {old}"}).status_code == 401


# ---- preferences -------------------------------------------------------------------------
def test_preferences_validate_and_change_alert_threshold(client):
    login(client, "priya@finmate.dev")
    assert client.patch("/api/account/preferences", json={"currency": "XYZ", "warn_pct": 80}).status_code == 422
    assert client.patch("/api/account/preferences", json={"currency": "USD", "warn_pct": 20}).status_code == 422
    r = client.patch("/api/account/preferences", json={"currency": "USD", "warn_pct": 60})
    assert r.json()["user"]["currency"] == "USD" and r.json()["user"]["warn_pct"] == 60
    # Priya spent 1850 on groceries this month. At a 3000 limit that is 61.7%: only a 60% threshold warns.
    client.put("/api/budgets", json={"owner_type": "user", "category": "Groceries", "monthly_limit": 3000})
    d = client.get("/api/dashboard").json()
    groceries = next(b for b in d["budgets"]["personal"] if b["category"] == "Groceries")
    assert groceries["pct"] == 61.7 and groceries["level"] == "warning"
    assert d["budgets"]["warn_pct"] == 60


# ---- export & delete ---------------------------------------------------------------------
def test_export_csv_contains_only_own_rows(client):
    login(client, "priya@finmate.dev")
    r = client.get("/api/account/export")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("date,merchant,category,amount") and len(lines) == 7
    assert "Uber" not in r.text and "BigBasket" in r.text


def test_delete_account_needs_confirmation_and_password(client):
    client.post("/api/auth/register", json={"name": "Solo", "email": "solo@example.com", "password": "password1"})
    assert client.request("DELETE", "/api/account", json={"confirm_email": "other@x.co", "password": "password1"}).status_code == 422
    assert client.request("DELETE", "/api/account", json={"confirm_email": "solo@example.com", "password": "nope"}).status_code == 403
    ok = client.request("DELETE", "/api/account", json={"confirm_email": "solo@example.com", "password": "password1"})
    assert ok.status_code == 200 and client.get("/api/auth/me").status_code == 401
    with db.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM users WHERE email='solo@example.com'").fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM families WHERE name LIKE 'Solo%'").fetchone()[0] == 0


def test_sole_admin_cannot_delete_while_family_has_members(client):
    login(client)
    r = client.request("DELETE", "/api/account", json={"confirm_email": "ravi@finmate.dev", "password": "demo1234"})
    assert r.status_code == 409


# ---- family management -------------------------------------------------------------------
def test_members_cannot_manage_family(client):
    login(client, "priya@finmate.dev")
    assert client.get("/api/family/members").status_code == 403
    assert client.post("/api/family/members", json={"name": "X", "email": "x@x.co", "password": "password1"}).status_code == 403


def test_admin_adds_promotes_and_removes_members(client):
    login(client)
    added = client.post("/api/family/members", json={"name": "Asha", "email": "asha@example.com", "password": "password1"})
    assert added.status_code == 201 and {m["email"] for m in added.json()} >= {"asha@example.com"}
    assert client.post("/api/family/members", json={"name": "A", "email": "asha@example.com", "password": "password1"}).status_code == 409
    asha = next(m for m in added.json() if m["email"] == "asha@example.com")
    assert client.patch(f"/api/family/members/{asha['id']}", json={"role": "admin"}).status_code == 200
    assert client.patch("/api/family/members/u_ravi", json={"role": "member"}).status_code == 200  # another admin exists
    # Ravi is now a member; Asha (admin) can remove Priya, and a lone admin cannot be demoted.
    client.post("/api/auth/logout")
    login(client, "asha@example.com", "password1")
    assert client.patch(f"/api/family/members/{asha['id']}", json={"role": "member"}).status_code == 409
    gone = client.delete("/api/family/members/u_priya")
    assert gone.status_code == 200 and "u_priya" not in {m["id"] for m in gone.json()}
    with db.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM expenses WHERE user_id='u_priya'").fetchone()[0] == 0
    assert client.delete(f"/api/family/members/{asha['id']}").status_code == 409  # not yourself


def test_admin_cannot_touch_another_family(client):
    client.post("/api/auth/register", json={"name": "Out", "email": "out@example.com", "password": "password1"})
    assert client.delete("/api/family/members/u_priya").status_code == 404
    assert client.patch("/api/family/members/u_ravi", json={"role": "member"}).status_code == 404


# ---- direct ledger writes ----------------------------------------------------------------
def test_add_and_delete_expense_and_alerts(client):
    login(client)
    bad = client.post("/api/expenses", json={"amount": 0, "date": "2026-10-08", "merchant": "x", "category": "Food"})
    assert bad.status_code == 422
    r = client.post("/api/expenses", json={"amount": 450, "date": "2026-10-08", "merchant": "Uber",
                                           "category": "Transport", "note": "Home to Office"})
    assert r.status_code == 201 and any(a["level"] == "exceeded" for a in r.json()["alerts"])
    eid = r.json()["expense"]["id"]
    assert client.delete(f"/api/expenses/{eid}").status_code == 200
    assert client.delete(f"/api/expenses/{eid}").status_code == 404
    client.post("/api/auth/logout")
    login(client)
    other = client.post("/api/expenses", json={"amount": 10, "date": "2026-10-08", "merchant": "m", "category": "Food"})
    client.post("/api/auth/logout")
    login(client, "priya@finmate.dev")
    assert client.delete(f"/api/expenses/{other.json()['expense']['id']}").status_code == 404  # not hers


def test_budget_edit_rules(client):
    login(client, "priya@finmate.dev")
    ok = client.put("/api/budgets", json={"owner_type": "user", "category": "Food", "monthly_limit": 5000})
    assert ok.status_code == 200 and any(b["category"] == "Food" and b["limit"] == 5000 for b in ok.json()["personal"])
    assert client.put("/api/budgets", json={"owner_type": "family", "category": "Food", "monthly_limit": 1}).status_code == 403
    assert client.delete("/api/budgets/user/Food").status_code == 200
    assert client.delete("/api/budgets/user/Food").status_code == 404
    assert client.delete("/api/budgets/family/Food").status_code == 403
    client.post("/api/auth/logout")
    login(client)
    assert client.delete("/api/budgets/family/Entertainment").status_code == 200
