"""Authentication: email+password and Google OAuth, issuing a JWT as an httpOnly cookie or Bearer token."""
import base64
import os
import re
import secrets
import time
import urllib.parse
import uuid

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from . import db, services
from .passwords import hash_password, verify_password

COOKIE = "finmate_token"
OAUTH_STATE_COOKIE = "finmate_oauth_state"
TOKEN_TTL = 7 * 24 * 3600
_DEV_SECRET = "dev-only-insecure-secret-change-me"
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo"

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _secret() -> str:
    return os.environ.get("JWT_SECRET") or _DEV_SECRET


def frontend_url() -> str:
    return os.environ.get("FRONTEND_URL", "http://localhost:3000")


def google_enabled() -> bool:
    return bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"))


def google_redirect_uri() -> str:
    return os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")


def google_mobile_redirect_uri() -> str:
    """Google rejects http redirects to LAN addresses, so a phone needs a public https URL (e.g. a tunnel)."""
    return os.environ.get("GOOGLE_MOBILE_REDIRECT_URI") or google_redirect_uri()


def _mobile_return_ok(url: str) -> bool:
    """The app's deep link; only schemes we ship (finmate://, Expo Go's exp://) may receive a token."""
    allowed = {x.strip() for x in os.environ.get("MOBILE_REDIRECT_SCHEMES", "finmate,exp,exps").split(",") if x.strip()}
    return urllib.parse.urlsplit(url).scheme in allowed


def create_token(user_id: str) -> str:
    """Signed session token. `ver` is the user's token_version, so bumping it revokes every older token."""
    now = int(time.time())
    with db.connect() as c:
        r = c.execute("SELECT token_version FROM users WHERE id=%s", (user_id,)).fetchone()
    return jwt.encode({"sub": user_id, "ver": r["token_version"] if r else 0, "iat": now,
                       "exp": now + TOKEN_TTL}, _secret(), algorithm="HS256")


def set_session(resp: Response, user_id: str) -> str:
    token = create_token(user_id)
    _set_cookie(resp, token)
    return token


def _set_cookie(resp: Response, token: str) -> None:
    resp.set_cookie(COOKIE, token, max_age=TOKEN_TTL, httponly=True, samesite="lax",
                    secure=os.environ.get("COOKIE_SECURE") == "1", path="/")


def current_user(request: Request) -> dict:
    """FastAPI dependency: the authenticated user from the cookie or `Authorization: Bearer`."""
    token = request.cookies.get(COOKIE)
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        claims = jwt.decode(token, _secret(), algorithms=["HS256"])
        user = public_user(claims["sub"], with_version=True)
    except (jwt.PyJWTError, ValueError, KeyError) as exc:
        raise HTTPException(401, "Invalid or expired session") from exc
    if user.pop("token_version") != claims.get("ver", 0):
        raise HTTPException(401, "Session was signed out")
    return user


def require_admin(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    return user


def public_user(user_id: str, with_version: bool = False) -> dict:
    """The account fields the client may see (never the password hash)."""
    with db.connect() as c:
        r = c.execute("SELECT id, name, role, family_id, email, currency, warn_pct, token_version,"
                      " password_hash IS NOT NULL AS has_password, google_sub IS NOT NULL AS has_google"
                      " FROM users WHERE id=%s", (user_id,)).fetchone()
    if r is None:
        raise ValueError("unknown user")
    out = {"user_id": r["id"], "name": r["name"], "role": r["role"], "family_id": r["family_id"],
           "email": r["email"], "currency": r["currency"], "warn_pct": r["warn_pct"],
           "has_password": r["has_password"], "has_google": r["has_google"]}
    if with_version:
        out["token_version"] = r["token_version"]
    return out


_public = public_user


def _create_account(c, name: str, email: str, password_hash: str | None, google_sub: str | None) -> str:
    """New account = new family with this user as its admin."""
    suffix = uuid.uuid4().hex[:8]
    family_id, user_id = f"f_{suffix}", f"u_{suffix}"
    c.execute("INSERT INTO families VALUES (%s,%s)", (family_id, f"{name}'s Family"))
    c.execute("INSERT INTO users (id, name, role, family_id, email, password_hash, google_sub)"
              " VALUES (%s,%s,'admin',%s,%s,%s,%s)",
              (user_id, name, family_id, email, password_hash, google_sub))
    return user_id


class RegisterIn(BaseModel):
    name: str
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/register")
def register(body: RegisterIn, response: Response):
    name, email = body.name.strip(), body.email.strip().lower()
    if not name:
        raise HTTPException(422, "Name is required")
    if not _EMAIL.match(email):
        raise HTTPException(422, "Enter a valid email address")
    if len(body.password) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")
    with db.connect() as c:
        if c.execute("SELECT 1 FROM users WHERE email=%s", (email,)).fetchone():
            raise HTTPException(409, "An account with this email already exists")
        user_id = _create_account(c, name, email, hash_password(body.password), None)
    return {"user": _public(user_id), "token": set_session(response, user_id)}


@router.post("/login")
def login(body: LoginIn, response: Response):
    email = body.email.strip().lower()
    with db.connect() as c:
        r = c.execute("SELECT id, password_hash FROM users WHERE email=%s", (email,)).fetchone()
    # Always run a hash check so timing doesn't reveal whether the email exists.
    ok = verify_password(body.password, r["password_hash"] if r else _dummy_hash())
    if not r or not ok:
        raise HTTPException(401, "Incorrect email or password")
    return {"user": _public(r["id"]), "token": set_session(response, r["id"])}


_DUMMY: list[str] = []


def _dummy_hash() -> str:
    if not _DUMMY:
        _DUMMY.append(hash_password(secrets.token_hex(8)))
    return _DUMMY[0]


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(current_user)):
    return {"user": user}


@router.get("/config")
def config():
    return {"google": google_enabled()}


# ---- Google OAuth (active only when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set) ----------
def _require_google() -> None:
    if not google_enabled():
        raise HTTPException(404, "Google sign-in is not configured")


@router.get("/google/login")
def google_login(request: Request, client: str = "", return_to: str = ""):
    _require_google()
    mobile = client == "mobile"
    if mobile and not _mobile_return_ok(return_to):
        raise HTTPException(400, "Unsupported return address")
    state = secrets.token_urlsafe(24)
    if mobile:  # the deep link rides in the signed-by-cookie state so the callback knows where to hand the token
        state = "m." + secrets.token_urlsafe(18) + "." + base64.urlsafe_b64encode(return_to.encode()).decode().rstrip("=")
    url = GOOGLE_AUTH + "?" + urllib.parse.urlencode({
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "redirect_uri": google_mobile_redirect_uri() if mobile else google_redirect_uri(),
        "response_type": "code", "scope": "openid email profile", "state": state,
        "prompt": "select_account"})
    resp = RedirectResponse(url)
    resp.set_cookie(OAUTH_STATE_COOKIE, state, max_age=600, httponly=True, samesite="lax",
                    secure=os.environ.get("COOKIE_SECURE") == "1", path="/")
    return resp


def _google_profile(code: str, redirect_uri: str | None = None) -> dict:
    """Exchange the auth code for a token and fetch the user's profile. Separate so tests can stub it."""
    with httpx.Client(timeout=10) as http:
        tok = http.post(GOOGLE_TOKEN, data={
            "code": code, "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "redirect_uri": redirect_uri or google_redirect_uri(), "grant_type": "authorization_code"})
        tok.raise_for_status()
        info = http.get(GOOGLE_USERINFO, headers={"Authorization": f"Bearer {tok.json()['access_token']}"})
        info.raise_for_status()
        return info.json()


@router.get("/google/callback")
def google_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    _require_google()
    mobile_return = None
    if state.startswith("m."):
        try:
            mobile_return = base64.urlsafe_b64decode(state.split(".", 2)[2] + "=" * (-len(state.split(".", 2)[2]) % 4)).decode()
        except Exception:
            mobile_return = None
        if not mobile_return or not _mobile_return_ok(mobile_return):
            raise HTTPException(400, "Invalid sign-in state")
    fail = RedirectResponse(f"{mobile_return}?auth_error=google" if mobile_return else f"{frontend_url()}/login?auth_error=google")
    expected = request.cookies.get(OAUTH_STATE_COOKIE)
    if error or not code or not expected or not secrets.compare_digest(expected, state):
        return fail
    try:
        profile = _google_profile(code, google_mobile_redirect_uri() if mobile_return else None)
    except (httpx.HTTPError, KeyError):
        return fail
    sub, email = profile.get("sub"), (profile.get("email") or "").lower()
    if not sub or not email or not profile.get("email_verified", False):
        return fail
    with db.connect() as c:
        r = c.execute("SELECT id FROM users WHERE google_sub=%s", (sub,)).fetchone()
        if r is None:
            r = c.execute("SELECT id FROM users WHERE email=%s", (email,)).fetchone()
            if r:  # existing password account with the same verified email: link it
                c.execute("UPDATE users SET google_sub=%s WHERE id=%s", (sub, r["id"]))
        user_id = r["id"] if r else _create_account(
            c, profile.get("name") or email.split("@")[0], email, None, sub)
    if mobile_return:  # hand the Bearer token to the app's deep link; mobile keeps it in SecureStore
        sep = "&" if "?" in mobile_return else "?"
        resp = RedirectResponse(f"{mobile_return}{sep}token={create_token(user_id)}")
        resp.delete_cookie(OAUTH_STATE_COOKIE, path="/")
        return resp
    resp = RedirectResponse(f"{frontend_url()}/app")
    set_session(resp, user_id)
    resp.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    return resp
