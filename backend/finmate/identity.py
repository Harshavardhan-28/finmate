"""Who is calling a tool: signed, short-lived tool tokens and the per-request principal.

Why this exists. An LLM must never be the source of truth for *who the user is*: a prompt
injection, a hostile receipt or a plain hallucination can make it write any user_id into a tool call.
So identity travels out-of-band and the model cannot touch it:

    API (verified login) -> Runner(user_id) -> McpToolset.header_provider -> `Authorization: Bearer <tool token>`
        -> MCP server middleware verifies the token -> `current_user_id()` -> tool -> services

Tool tokens are HS256 JWTs with their own signing key, issuer and audience, so a leaked login
cookie is useless against the tool server and vice versa. They carry only the subject and expire quickly.
"""
import hashlib
import hmac
import os
import time
from contextvars import ContextVar

import jwt

ISSUER = "finmate-api"
AUDIENCE = "finmate-tools"
TOKEN_TTL = 600     # seconds a token is accepted for
BUCKET = 300        # tokens are minted per 5-minute bucket so ADK's MCP session pool is reused, not grown per call

_DEV_SECRET = "finmate-dev-secret-change-me"


class ToolAuthError(Exception):
    """The caller did not present a valid tool token."""


def _key() -> bytes:
    """Signing key. TOOL_TOKEN_SECRET if set; otherwise derived from JWT_SECRET under a separate label,
    so the login-session key and the tool-token key are never the same bytes."""
    explicit = os.environ.get("TOOL_TOKEN_SECRET")
    if explicit:
        return explicit.encode()
    root = (os.environ.get("JWT_SECRET") or _DEV_SECRET).encode()
    return hmac.new(root, b"finmate/tool-token/v1", hashlib.sha256).digest()


def mint_tool_token(user_id: str, *, now: float | None = None) -> str:
    """A bearer token asserting 'the authenticated principal of this turn is user_id'."""
    if not user_id:
        raise ToolAuthError("cannot mint a tool token without a user id")
    t = int(now if now is not None else time.time())
    iat = t - t % BUCKET
    return jwt.encode({"iss": ISSUER, "aud": AUDIENCE, "sub": user_id, "iat": iat, "exp": iat + TOKEN_TTL},
                      _key(), algorithm="HS256")


def verify_tool_token(token: str) -> str:
    """Return the user id the token was issued for, or raise ToolAuthError."""
    try:
        claims = jwt.decode(token, _key(), algorithms=["HS256"], audience=AUDIENCE, issuer=ISSUER,
                            options={"require": ["exp", "iat", "sub", "aud", "iss"]})
    except jwt.PyJWTError as exc:
        raise ToolAuthError(f"invalid tool token: {exc}") from exc
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        raise ToolAuthError("tool token has no subject")
    return sub


_principal: ContextVar[str | None] = ContextVar("finmate_tool_principal", default=None)


def set_principal(user_id: str | None):
    return _principal.set(user_id)


def reset_principal(token) -> None:
    _principal.reset(token)


def current_user_id() -> str:
    """The authenticated user for the tool call in flight. Raises if the call was not authenticated."""
    uid = _principal.get()
    if not uid:
        raise ToolAuthError("no authenticated user for this tool call")
    return uid
