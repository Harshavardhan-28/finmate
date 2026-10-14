"""Tool tokens and the guard plugin, unit-level."""
import asyncio
import time

import jwt
import pytest

from finmate import auth, db, identity, security, vision


def test_roundtrip_and_subject():
    assert identity.verify_tool_token(identity.mint_tool_token("u_ravi")) == "u_ravi"


def test_expired_token_rejected():
    old = identity.mint_tool_token("u_ravi", now=time.time() - identity.TOKEN_TTL - identity.BUCKET - 5)
    with pytest.raises(identity.ToolAuthError):
        identity.verify_tool_token(old)


def test_tampered_or_foreign_tokens_rejected():
    good = identity.mint_tool_token("u_ravi")
    head, payload, sig = good.split(".")
    with pytest.raises(identity.ToolAuthError):
        identity.verify_tool_token(f"{head}.{payload}.{sig[:-2]}xx")
    forged = jwt.encode({"iss": identity.ISSUER, "aud": identity.AUDIENCE, "sub": "u_priya", "iat": int(time.time()),
                         "exp": int(time.time()) + 60}, "not-the-key", algorithm="HS256")
    with pytest.raises(identity.ToolAuthError):
        identity.verify_tool_token(forged)
    wrong_aud = jwt.encode({"iss": identity.ISSUER, "aud": "someone-else", "sub": "u_ravi", "iat": int(time.time()),
                            "exp": int(time.time()) + 60}, identity._key(), algorithm="HS256")
    with pytest.raises(identity.ToolAuthError):
        identity.verify_tool_token(wrong_aud)


def test_login_session_token_is_not_a_tool_token():
    with pytest.raises(identity.ToolAuthError):
        identity.verify_tool_token(auth.create_token("u_ravi") if db.init_db() is None else "")


def test_tool_key_differs_from_login_key():
    assert identity._key() != auth._secret().encode()


def test_current_user_requires_authentication():
    with pytest.raises(identity.ToolAuthError):
        identity.current_user_id()
    marker = identity.set_principal("u_ravi")
    try:
        assert identity.current_user_id() == "u_ravi"
    finally:
        identity.reset_principal(marker)


class _Tool:
    name = "get_expenses"


class _Ctx:
    user_id = "u_ravi"
    agent_name = "insights_agent"


def test_guard_blocks_identity_arguments_and_allows_normal_calls():
    plugin = security.ToolGuardPlugin()
    blocked = asyncio.run(plugin.before_tool_callback(tool=_Tool(), tool_args={"user_id": "u_priya", "days": 30}, tool_context=_Ctx()))
    assert blocked and blocked["error"] == "identity_argument_rejected"
    assert asyncio.run(plugin.before_tool_callback(tool=_Tool(), tool_args={"days": 30}, tool_context=_Ctx())) is None


def test_attachments_are_private_to_their_uploader(tmp_path, monkeypatch):
    monkeypatch.setattr(vision, "UPLOADS", tmp_path)
    monkeypatch.setenv("FINMATE_FAKE_VISION", "1")
    db.init_db(reset=True)
    (tmp_path / "f00d.png").write_bytes(b"x")
    vision.register_attachment("f00d", "u_ravi")
    assert vision.extract("f00d", "receipt image", "u_ravi")["fields"]["merchant"] == "Uber"
    with pytest.raises(FileNotFoundError):
        vision.extract("f00d", "receipt image", "u_priya")
    with pytest.raises(FileNotFoundError):
        vision.extract("missing", "receipt image", "u_ravi")
