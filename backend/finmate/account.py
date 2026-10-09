"""Account management: profile, password, preferences, data export/deletion, and family members."""
import csv
import io
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from . import auth, db
from .passwords import hash_password, verify_password

router = APIRouter(prefix="/api", tags=["account"])
CURRENCIES = ("INR", "USD", "EUR", "GBP")


def _check_password_strength(pw: str) -> None:
    if len(pw) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")


# ---- profile -----------------------------------------------------------------------------
class ProfileIn(BaseModel):
    name: str
    email: str


@router.patch("/account/profile")
def update_profile(body: ProfileIn, user: dict = Depends(auth.current_user)):
    name, email = body.name.strip(), body.email.strip().lower()
    if not name:
        raise HTTPException(422, "Name is required")
    if not auth._EMAIL.match(email):
        raise HTTPException(422, "Enter a valid email address")
    with db.connect() as c:
        taken = c.execute("SELECT 1 FROM users WHERE email=%s AND id<>%s", (email, user["user_id"])).fetchone()
        if taken:
            raise HTTPException(409, "Another account already uses this email")
        c.execute("UPDATE users SET name=%s, email=%s WHERE id=%s", (name, email, user["user_id"]))
    return {"user": auth.public_user(user["user_id"])}


# ---- password / sessions -----------------------------------------------------------------
class PasswordIn(BaseModel):
    current_password: str = ""
    new_password: str


def _bump_and_reissue(response: Response, user_id: str) -> str:
    """Revoke every existing session, then give this browser a fresh one."""
    with db.connect() as c:
        c.execute("UPDATE users SET token_version = token_version + 1 WHERE id=%s", (user_id,))
    return auth.set_session(response, user_id)


@router.post("/account/password")
def change_password(body: PasswordIn, response: Response, user: dict = Depends(auth.current_user)):
    _check_password_strength(body.new_password)
    with db.connect() as c:
        row = c.execute("SELECT password_hash FROM users WHERE id=%s", (user["user_id"],)).fetchone()
        # Google-only accounts have no password yet, so they may set one without a current password.
        if row["password_hash"] and not verify_password(body.current_password, row["password_hash"]):
            raise HTTPException(403, "Current password is incorrect")
        c.execute("UPDATE users SET password_hash=%s WHERE id=%s",
                  (hash_password(body.new_password), user["user_id"]))
    return {"ok": True, "token": _bump_and_reissue(response, user["user_id"])}


@router.post("/account/sign-out-everywhere")
def sign_out_everywhere(response: Response, user: dict = Depends(auth.current_user)):
    return {"ok": True, "token": _bump_and_reissue(response, user["user_id"])}


# ---- preferences -------------------------------------------------------------------------
class PreferencesIn(BaseModel):
    currency: str
    warn_pct: int


@router.patch("/account/preferences")
def update_preferences(body: PreferencesIn, user: dict = Depends(auth.current_user)):
    if body.currency not in CURRENCIES:
        raise HTTPException(422, f"Currency must be one of {', '.join(CURRENCIES)}")
    if not 50 <= body.warn_pct <= 95:
        raise HTTPException(422, "Warning threshold must be between 50% and 95%")
    with db.connect() as c:
        c.execute("UPDATE users SET currency=%s, warn_pct=%s WHERE id=%s",
                  (body.currency, body.warn_pct, user["user_id"]))
    return {"user": auth.public_user(user["user_id"])}


# ---- export / delete ---------------------------------------------------------------------
@router.get("/account/export")
def export_data(user: dict = Depends(auth.current_user)):
    with db.connect() as c:
        rows = c.execute("SELECT date, merchant, category, amount, source, note, bill_id, created_at FROM expenses"
                         " WHERE user_id=%s ORDER BY date, id", (user["user_id"],)).fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["date", "merchant", "category", "amount", "source", "note", "bill_id", "recorded_at"])
    for r in rows:
        w.writerow([r["date"], r["merchant"], r["category"], r["amount"], r["source"], r["note"], r["bill_id"] or "", r["created_at"]])
    name = f"finmate-expenses-{date.today().isoformat()}.csv"
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


class DeleteIn(BaseModel):
    confirm_email: str
    password: str = ""


def _purge_user(c, user_id: str, family_id: str) -> None:
    c.execute("DELETE FROM expenses WHERE user_id=%s", (user_id,))
    c.execute("DELETE FROM bills WHERE user_id=%s", (user_id,))
    c.execute("DELETE FROM budgets WHERE owner_type='user' AND owner_id=%s", (user_id,))
    c.execute("DELETE FROM alerts WHERE user_id=%s", (user_id,))
    c.execute("DELETE FROM advice WHERE user_id=%s", (user_id,))
    c.execute("DELETE FROM users WHERE id=%s", (user_id,))
    if c.execute("SELECT COUNT(*) FROM users WHERE family_id=%s", (family_id,)).fetchone()[0] == 0:
        c.execute("DELETE FROM budgets WHERE owner_type='family' AND owner_id=%s", (family_id,))
        c.execute("DELETE FROM alerts WHERE family_id=%s", (family_id,))
        c.execute("DELETE FROM families WHERE id=%s", (family_id,))


@router.delete("/account")
def delete_account(body: DeleteIn, response: Response, user: dict = Depends(auth.current_user)):
    if (user["email"] or "").lower() != body.confirm_email.strip().lower():
        raise HTTPException(422, "Type your account email to confirm")
    with db.connect() as c:
        row = c.execute("SELECT password_hash FROM users WHERE id=%s", (user["user_id"],)).fetchone()
        if row["password_hash"] and not verify_password(body.password, row["password_hash"]):
            raise HTTPException(403, "Password is incorrect")
        others = c.execute("SELECT COUNT(*) FROM users WHERE family_id=%s AND id<>%s",
                           (user["family_id"], user["user_id"])).fetchone()[0]
        admins = c.execute("SELECT COUNT(*) FROM users WHERE family_id=%s AND role='admin' AND id<>%s",
                           (user["family_id"], user["user_id"])).fetchone()[0]
        if others and user["role"] == "admin" and not admins:
            raise HTTPException(409, "You are the only admin. Promote another member or remove them first.")
        _purge_user(c, user["user_id"], user["family_id"])
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


# ---- family members (admin only) ---------------------------------------------------------
class MemberIn(BaseModel):
    name: str
    email: str
    password: str
    role: str = "member"


class RoleIn(BaseModel):
    role: str


def _members(c, family_id: str) -> list[dict]:
    return [dict(r) for r in c.execute(
        "SELECT id, name, email, role, password_hash IS NOT NULL AS has_password,"
        " google_sub IS NOT NULL AS has_google FROM users WHERE family_id=%s ORDER BY role, name", (family_id,))]


def _target(c, admin: dict, member_id: str) -> dict:
    r = c.execute("SELECT id, role, family_id FROM users WHERE id=%s", (member_id,)).fetchone()
    if r is None or r["family_id"] != admin["family_id"]:
        raise HTTPException(404, "No such family member")
    return dict(r)


def _admin_count(c, family_id: str) -> int:
    return c.execute("SELECT COUNT(*) FROM users WHERE family_id=%s AND role='admin'", (family_id,)).fetchone()[0]


@router.get("/family/members")
def list_members(admin: dict = Depends(auth.require_admin)):
    with db.connect() as c:
        return _members(c, admin["family_id"])


@router.post("/family/members", status_code=201)
def add_member(body: MemberIn, admin: dict = Depends(auth.require_admin)):
    name, email = body.name.strip(), body.email.strip().lower()
    if not name:
        raise HTTPException(422, "Name is required")
    if not auth._EMAIL.match(email):
        raise HTTPException(422, "Enter a valid email address")
    if body.role not in ("admin", "member"):
        raise HTTPException(422, "Role must be admin or member")
    _check_password_strength(body.password)
    with db.connect() as c:
        if c.execute("SELECT 1 FROM users WHERE email=%s", (email,)).fetchone():
            raise HTTPException(409, "An account with this email already exists")
        c.execute("INSERT INTO users (id, name, role, family_id, email, password_hash) VALUES (%s,%s,%s,%s,%s,%s)",
                  (f"u_{uuid.uuid4().hex[:8]}", name, body.role, admin["family_id"], email,
                   hash_password(body.password)))
        return _members(c, admin["family_id"])


@router.patch("/family/members/{member_id}")
def set_member_role(member_id: str, body: RoleIn, admin: dict = Depends(auth.require_admin)):
    if body.role not in ("admin", "member"):
        raise HTTPException(422, "Role must be admin or member")
    with db.connect() as c:
        t = _target(c, admin, member_id)
        if t["role"] == "admin" and body.role == "member" and _admin_count(c, admin["family_id"]) <= 1:
            raise HTTPException(409, "A family needs at least one admin")
        c.execute("UPDATE users SET role=%s WHERE id=%s", (body.role, member_id))
        return _members(c, admin["family_id"])


@router.delete("/family/members/{member_id}")
def remove_member(member_id: str, admin: dict = Depends(auth.require_admin)):
    if member_id == admin["user_id"]:
        raise HTTPException(409, "Use Delete account in Settings to remove yourself")
    with db.connect() as c:
        _target(c, admin, member_id)
        _purge_user(c, member_id, admin["family_id"])
        return _members(c, admin["family_id"])
