import base64
import urllib.parse
"""Auth: register/login, cookie + bearer transport, access control, and the gated Google flow."""
import pytest
from fastapi.testclient import TestClient

from finmate import agents, auth, db
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


def register(client, email="new@example.com", password="s3cretpass", name="Nia"):
    return client.post("/api/auth/register", json={"name": name, "email": email, "password": password})


def test_register_creates_admin_in_new_family_and_sets_cookie(client):
    r = register(client)
    assert r.status_code == 200
    user = r.json()["user"]
    assert user["role"] == "admin" and user["family_id"] != "f_sharma"
    assert client.get("/api/auth/me").json()["user"]["email"] == "new@example.com"
    assert client.get("/api/dashboard").json()["user"]["id"] == user["user_id"]
    set_cookie = r.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "samesite=lax" in set_cookie


def test_register_validation_and_duplicates(client):
    assert register(client, password="short").status_code == 422
    assert register(client, email="not-an-email").status_code == 422
    assert register(client).status_code == 200
    assert register(client, email="NEW@example.com").status_code == 409


def test_login_wrong_password_and_unknown_email_are_indistinguishable(client):
    a = client.post("/api/auth/login", json={"email": "ravi@finmate.dev", "password": "nope"})
    b = client.post("/api/auth/login", json={"email": "ghost@finmate.dev", "password": "nope"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


def test_bearer_token_works_without_cookie(client):
    token = client.post("/api/auth/login", json={"email": "ravi@finmate.dev", "password": "demo1234"}).json()["token"]
    client.cookies.clear()
    assert client.get("/api/dashboard").status_code == 401
    ok = client.get("/api/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert ok.status_code == 200 and ok.json()["user"]["id"] == "u_ravi"


def test_tampered_or_expired_token_rejected(client, monkeypatch):
    token = auth.create_token("u_ravi")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}x"}).status_code == 401
    monkeypatch.setattr(auth, "TOKEN_TTL", -10)
    expired = auth.create_token("u_ravi")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_logout_clears_session(client):
    client.post("/api/auth/login", json={"email": "ravi@finmate.dev", "password": "demo1234"})
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_protected_routes_need_auth_and_reset_is_admin_only(client):
    for method, path in [("get", "/api/dashboard"), ("post", "/api/chat"), ("post", "/api/confirm"),
                         ("post", "/api/upload"), ("post", "/api/reset")]:
        assert getattr(client, method)(path).status_code == 401, path
    client.post("/api/auth/login", json={"email": "priya@finmate.dev", "password": "demo1234"})
    assert client.post("/api/reset").status_code == 403


def test_expenses_endpoint_is_scoped_to_the_user(client):
    assert client.get("/api/expenses").status_code == 401
    client.post("/api/auth/login", json={"email": "priya@finmate.dev", "password": "demo1234"})
    rows = client.get("/api/expenses", params={"days": 90}).json()
    assert rows and {r["user_id"] for r in rows} == {"u_priya"}
    assert all(r["category"] == "Groceries" for r in client.get("/api/expenses", params={"category": "groceries"}).json())


def test_users_cannot_reach_each_others_data(client):
    register(client)
    d = client.get("/api/dashboard").json()
    assert d["recent_expenses"] == [] and d["user"]["id"] != "u_ravi"


# ---- Google ----------------------------------------------------------------------------
def test_google_disabled_without_keys(client, monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    assert client.get("/api/auth/config").json() == {"google": False}
    assert client.get("/api/auth/google/login", follow_redirects=False).status_code == 404


@pytest.fixture
def google(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "csecret")
    profile = {"sub": "g-123", "email": "gina@gmail.com", "email_verified": True, "name": "Gina"}
    monkeypatch.setattr(auth, "_google_profile", lambda code, redirect_uri=None: profile)
    return profile


def _start(client):
    r = client.get("/api/auth/google/login", follow_redirects=False)
    assert r.status_code == 307 and "accounts.google.com" in r.headers["location"]
    return client.cookies.get(auth.OAUTH_STATE_COOKIE)


def test_google_flow_creates_account_and_signs_in(client, google):
    assert client.get("/api/auth/config").json() == {"google": True}
    state = _start(client)
    r = client.get("/api/auth/google/callback", params={"code": "c", "state": state}, follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == "http://localhost:3000/app"
    me = client.get("/api/auth/me").json()["user"]
    assert me["email"] == "gina@gmail.com" and me["role"] == "admin"
    # Signing in again reuses the same account.
    client.post("/api/auth/logout")
    state = _start(client)
    client.get("/api/auth/google/callback", params={"code": "c", "state": state}, follow_redirects=False)
    assert client.get("/api/auth/me").json()["user"]["user_id"] == me["user_id"]


def test_google_links_existing_account_by_verified_email(client, google):
    google["email"] = "ravi@finmate.dev"
    state = _start(client)
    client.get("/api/auth/google/callback", params={"code": "c", "state": state}, follow_redirects=False)
    assert client.get("/api/auth/me").json()["user"]["user_id"] == "u_ravi"


def test_google_rejects_bad_state_and_unverified_email(client, google):
    _start(client)
    r = client.get("/api/auth/google/callback", params={"code": "c", "state": "forged"}, follow_redirects=False)
    assert "auth_error=google" in r.headers["location"]
    google["email_verified"] = False
    state = _start(client)
    r = client.get("/api/auth/google/callback", params={"code": "c", "state": state}, follow_redirects=False)
    assert "auth_error=google" in r.headers["location"]
    assert client.get("/api/auth/me").status_code == 401


def test_google_mobile_hands_bearer_token_to_deep_link(client, google, monkeypatch):
    monkeypatch.setenv("GOOGLE_MOBILE_REDIRECT_URI", "https://tunnel.example/api/auth/google/callback")
    r = client.get("/api/auth/google/login", params={"client": "mobile", "return_to": "finmate://auth"}, follow_redirects=False)
    assert r.status_code == 307 and "tunnel.example" in urllib.parse.unquote(r.headers["location"])
    state = client.cookies.get(auth.OAUTH_STATE_COOKIE)
    r = client.get("/api/auth/google/callback", params={"code": "c", "state": state}, follow_redirects=False)
    loc = r.headers["location"]
    assert loc.startswith("finmate://auth?token=")
    client.cookies.clear()
    me = client.get("/api/auth/me", headers={"Authorization": "Bearer " + loc.split("token=")[1]})
    assert me.json()["user"]["email"] == "gina@gmail.com"


def test_google_mobile_rejects_foreign_return_address(client, google):
    r = client.get("/api/auth/google/login", params={"client": "mobile", "return_to": "https://evil.example/x"}, follow_redirects=False)
    assert r.status_code == 400


def test_google_mobile_state_must_match_cookie(client, google):
    client.get("/api/auth/google/login", params={"client": "mobile", "return_to": "finmate://auth"}, follow_redirects=False)
    forged = "m.x." + base64.urlsafe_b64encode(b"finmate://auth").decode().rstrip("=")
    r = client.get("/api/auth/google/callback", params={"code": "c", "state": forged}, follow_redirects=False)
    assert r.headers["location"] == "finmate://auth?auth_error=google"
