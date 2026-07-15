import sqlite3
from pathlib import Path

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    category TEXT NOT NULL,
    note TEXT,
    transaction_date TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'critical')),
    medium TEXT NOT NULL,
    action_label TEXT,
    action_text TEXT,
    source_transaction_id INTEGER,
    source_transaction_title TEXT,
    created_at TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        db_path = Path(current_app.config["DATABASE_PATH"])
        db_path.parent.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(db_path)
        g.db.row_factory = sqlite3.Row

    return g.db


def close_db(_error=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    db = get_db()
    db.executescript(SCHEMA)
    _ensure_column(db, "notifications", "action_label", "TEXT")
    _ensure_column(db, "notifications", "action_text", "TEXT")
    _ensure_column(db, "notifications", "source_transaction_id", "INTEGER")
    _ensure_column(db, "notifications", "source_transaction_title", "TEXT")
    db.execute(
        "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
        ("webhook_url", current_app.config["DEFAULT_WEBHOOK_URL"]),
    )
    db.commit()


def init_app(app) -> None:
    @app.before_request
    def ensure_initialized():
        init_db()


def _ensure_column(db: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = db.execute(f"PRAGMA table_info({table})").fetchall()
    if any(item["name"] == column for item in columns):
        return
    db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
