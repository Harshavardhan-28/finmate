"""Postgres shared memory for all FinMate agents, plus demo seed data."""
import os
from contextlib import contextmanager
from datetime import date, timedelta
from functools import lru_cache

import psycopg
from psycopg.rows import dict_row

DEFAULT_DATABASE_URL = "postgresql://finmate:finmate@localhost:5432/finmate"
CATEGORIES = [
    "Transport", "Food", "Groceries", "Shopping",
    "Entertainment", "Utilities", "Health", "Other",
]
DEMO_PASSWORD = "demo1234"  # dev-only password for the seeded Ravi and Priya logins

_NOW = "to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')"
SCHEMA = f"""
CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','member')),
  family_id TEXT NOT NULL REFERENCES families(id),
  email TEXT UNIQUE, password_hash TEXT, google_sub TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  merchant TEXT NOT NULL, date TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'form', created_at TEXT NOT NULL DEFAULT {_NOW});
ALTER TABLE users ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE users ADD COLUMN IF NOT EXISTS warn_pct INTEGER NOT NULL DEFAULT 80;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount DOUBLE PRECISION NOT NULL, date TEXT NOT NULL, merchant TEXT NOT NULL,
  category TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'form',
  note TEXT NOT NULL DEFAULT '', receipt_path TEXT,
  created_at TEXT NOT NULL DEFAULT {_NOW});
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE;
CREATE TABLE IF NOT EXISTS budgets (
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user','family')),
  owner_id TEXT NOT NULL, category TEXT NOT NULL, monthly_limit DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (owner_type, owner_id, category));
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY, user_id TEXT NOT NULL,
  family_id TEXT NOT NULL, scope TEXT NOT NULL, category TEXT NOT NULL,
  level TEXT NOT NULL, pct DOUBLE PRECISION NOT NULL, message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT {_NOW});
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT {_NOW});
CREATE TABLE IF NOT EXISTS advice (
  id SERIAL PRIMARY KEY, user_id TEXT NOT NULL,
  text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT {_NOW});
"""


class Row(dict):
    """A dict row that also supports positional access, so `fetchone()[0]` keeps working."""

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


def database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)


def today() -> date:
    v = os.environ.get("FINMATE_TODAY")
    return date.fromisoformat(v) if v else date.today()


@contextmanager
def connect():
    """Yield a connection that commits on success, rolls back on error, and always closes."""
    conn = psycopg.connect(database_url(), row_factory=_row_factory)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def _row_factory(cur):
    make = dict_row(cur)
    return lambda values: Row(make(values))


@lru_cache(maxsize=1)
def _demo_hash() -> str:
    from .passwords import hash_password
    return hash_password(DEMO_PASSWORD)


def init_db(reset: bool = False) -> None:
    """Create the schema and load demo data. reset=True wipes everything first."""
    with connect() as conn:
        if reset:
            conn.execute("DROP SCHEMA public CASCADE")
            conn.execute("CREATE SCHEMA public")
        conn.execute(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            _seed(conn)


# Days-ago offsets for 18 cab rides on the same commute over the last 30 days.
_CAB_DAYS_AGO = [1, 2, 3, 5, 6, 7, 9, 10, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28]
DEMO_RECEIPT_AMOUNT = 450


def _seed(conn: psycopg.Connection) -> None:
    t = today()
    month = t.strftime("%Y-%m")
    conn.execute("INSERT INTO families VALUES ('f_sharma', 'Sharma Family')")
    pw = _demo_hash()
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO users (id, name, role, family_id, email, password_hash) VALUES (%s,%s,%s,%s,%s,%s)",
            [("u_ravi", "Ravi", "admin", "f_sharma", "ravi@finmate.dev", pw),
             ("u_priya", "Priya", "member", "f_sharma", "priya@finmate.dev", pw)],
        )

    def add(user, days_ago, amount, merchant, category, note="", source="form"):
        d = (t - timedelta(days=days_ago)).isoformat()
        conn.execute(
            "INSERT INTO expenses (user_id, amount, date, merchant, category, source, note)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (user, amount, d, merchant, category, source, note),
        )

    # Ravi: the daily cab commute (the demo story).
    for i, da in enumerate(_CAB_DAYS_AGO):
        add("u_ravi", da, 400 + (i % 4) * 20, "Uber" if i % 2 == 0 else "Ola",
            "Transport", "Home to Office", "receipt")
    add("u_ravi", 4, 640, "Swiggy", "Food", "Dinner order")
    add("u_ravi", 11, 520, "Zomato", "Food", "Dinner order")
    add("u_ravi", 8, 1199, "Netflix + Prime", "Entertainment", "Subscriptions")
    add("u_ravi", 15, 2100, "BESCOM", "Utilities", "Electricity bill")
    # Priya: groceries and shopping.
    for da, amt, m in [(2, 1850, "BigBasket"), (9, 2240, "DMart"), (17, 1620, "BigBasket")]:
        add("u_priya", da, amt, m, "Groceries", "Weekly groceries", "receipt")
    add("u_priya", 6, 890, "Zomato", "Food", "Lunch order", "voice")
    add("u_priya", 12, 1490, "Myntra", "Shopping", "Clothes")
    add("u_priya", 20, 450, "Apollo Pharmacy", "Health", "Medicines", "receipt")

    # Set Ravi's Transport limit so that the ₹450 demo receipt lands at ~112%.
    mtd = conn.execute(
        "SELECT COALESCE(SUM(amount),0) FROM expenses"
        " WHERE user_id='u_ravi' AND category='Transport' AND substr(date,1,7)=%s",
        (month,),
    ).fetchone()[0]
    target = round((mtd + DEMO_RECEIPT_AMOUNT) / 1.12 / 50) * 50
    # Late in the month mtd is large; never start above ~95% so the receipt still crosses 100%.
    transport_limit = max(300, target, -(-int(mtd / 0.95) // 50) * 50)
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO budgets VALUES (%s,%s,%s,%s)",
            [("user", "u_ravi", "Transport", transport_limit),
             ("user", "u_ravi", "Food", 4000),
             ("user", "u_priya", "Shopping", 3000),
             ("user", "u_priya", "Groceries", 9000),
             ("family", "f_sharma", "Food", 12000),
             ("family", "f_sharma", "Groceries", 12000),
             ("family", "f_sharma", "Entertainment", 3000)],
        )
