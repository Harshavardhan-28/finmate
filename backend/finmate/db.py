"""SQLite shared memory for all FinMate agents, plus demo seed data."""
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta
from pathlib import Path

DEFAULT_DB = Path(__file__).resolve().parent.parent / "finmate.db"
CATEGORIES = [
    "Transport", "Food", "Groceries", "Shopping",
    "Entertainment", "Utilities", "Health", "Other",
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','member')),
  family_id TEXT NOT NULL REFERENCES families(id));
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL, date TEXT NOT NULL, merchant TEXT NOT NULL,
  category TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'form',
  note TEXT NOT NULL DEFAULT '', receipt_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS budgets (
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user','family')),
  owner_id TEXT NOT NULL, category TEXT NOT NULL, monthly_limit REAL NOT NULL,
  PRIMARY KEY (owner_type, owner_id, category));
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
  family_id TEXT NOT NULL, scope TEXT NOT NULL, category TEXT NOT NULL,
  level TEXT NOT NULL, pct REAL NOT NULL, message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS advice (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
  text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
"""


def db_path() -> str:
    return os.environ.get("FINMATE_DB", str(DEFAULT_DB))


def today() -> date:
    v = os.environ.get("FINMATE_TODAY")
    return date.fromisoformat(v) if v else date.today()


@contextmanager
def connect():
    """Yield a connection that commits on success, rolls back on error, and always closes."""
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db(reset: bool = False) -> None:
    """Create the schema and load demo data. reset=True wipes everything first."""
    path = Path(db_path())
    if reset and path.exists():
        path.unlink()
    with connect() as conn:
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
            _seed(conn)


# Days-ago offsets for 18 cab rides on the same commute over the last 30 days.
_CAB_DAYS_AGO = [1, 2, 3, 5, 6, 7, 9, 10, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28]
DEMO_RECEIPT_AMOUNT = 450


def _seed(conn: sqlite3.Connection) -> None:
    t = today()
    month = t.strftime("%Y-%m")
    conn.execute("INSERT INTO families VALUES ('f_sharma', 'Sharma Family')")
    conn.executemany(
        "INSERT INTO users VALUES (?,?,?,?)",
        [("u_ravi", "Ravi", "admin", "f_sharma"),
         ("u_priya", "Priya", "member", "f_sharma")],
    )

    def add(user, days_ago, amount, merchant, category, note="", source="form"):
        d = (t - timedelta(days=days_ago)).isoformat()
        conn.execute(
            "INSERT INTO expenses (user_id, amount, date, merchant, category, source, note)"
            " VALUES (?,?,?,?,?,?,?)",
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
        " WHERE user_id='u_ravi' AND category='Transport' AND substr(date,1,7)=?",
        (month,),
    ).fetchone()[0]
    target = round((mtd + DEMO_RECEIPT_AMOUNT) / 1.12 / 50) * 50
    # Late in the month mtd is large; never start above ~95% so the receipt still crosses 100%.
    transport_limit = max(300, target, -(-int(mtd / 0.95) // 50) * 50)
    conn.executemany(
        "INSERT INTO budgets VALUES (?,?,?,?)",
        [("user", "u_ravi", "Transport", transport_limit),
         ("user", "u_ravi", "Food", 4000),
         ("user", "u_priya", "Shopping", 3000),
         ("user", "u_priya", "Groceries", 9000),
         ("family", "f_sharma", "Food", 12000),
         ("family", "f_sharma", "Groceries", 12000),
         ("family", "f_sharma", "Entertainment", 3000)],
    )
