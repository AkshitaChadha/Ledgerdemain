from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta
from difflib import SequenceMatcher

from ..db import get_db


def list_transactions() -> list[dict]:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, title, amount, type, category, note, transaction_date, created_at
        FROM transactions
        ORDER BY date(transaction_date) DESC, id DESC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def get_transaction(transaction_id: int) -> dict | None:
    db = get_db()
    row = db.execute(
        """
        SELECT id, title, amount, type, category, note, transaction_date, created_at
        FROM transactions
        WHERE id = ?
        """,
        (transaction_id,),
    ).fetchone()
    return dict(row) if row else None


def recent_transactions(days: int = 30) -> list[dict]:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, title, amount, type, category, note, transaction_date, created_at
        FROM transactions
        WHERE date(transaction_date) >= date('now', ?)
        ORDER BY date(transaction_date) DESC, id DESC
        """,
        (f"-{days} days",),
    ).fetchall()
    return [dict(row) for row in rows]


def create_transaction(payload: dict) -> dict:
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO transactions(title, amount, type, category, note, transaction_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        """,
        (
            payload["title"],
            payload["amount"],
            payload["type"],
            payload["category"],
            payload.get("note", ""),
            payload["transaction_date"],
        ),
    )
    db.commit()

    row = db.execute(
        """
        SELECT id, title, amount, type, category, note, transaction_date, created_at
        FROM transactions
        WHERE id = ?
        """,
        (cursor.lastrowid,),
    ).fetchone()
    return dict(row)


def update_transaction(transaction_id: int, payload: dict) -> dict | None:
    db = get_db()
    db.execute(
        """
        UPDATE transactions
        SET title = ?, amount = ?, type = ?, category = ?, note = ?, transaction_date = ?
        WHERE id = ?
        """,
        (
            payload["title"],
            payload["amount"],
            payload["type"],
            payload["category"],
            payload.get("note", ""),
            payload["transaction_date"],
            transaction_id,
        ),
    )
    db.commit()
    return get_transaction(transaction_id)


def delete_transaction(transaction_id: int) -> bool:
    db = get_db()
    cursor = db.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
    db.commit()
    return cursor.rowcount > 0


def record_delete_event(transaction: dict) -> int:
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO ledger_events(event_type, transaction_id, payload, created_at, undone_at)
        VALUES ('transaction.deleted', ?, ?, datetime('now'), NULL)
        """,
        (transaction["id"], json.dumps(transaction)),
    )
    db.commit()
    return cursor.lastrowid


def undo_delete_event(event_id: int) -> dict | None:
    db = get_db()
    event = db.execute(
        """
        SELECT id, payload, undone_at
        FROM ledger_events
        WHERE id = ? AND event_type = 'transaction.deleted'
        """,
        (event_id,),
    ).fetchone()

    if not event or event["undone_at"]:
        return None

    transaction = json.loads(event["payload"])
    existing = get_transaction(int(transaction["id"]))
    if existing:
        db.execute("UPDATE ledger_events SET undone_at = datetime('now') WHERE id = ?", (event_id,))
        db.commit()
        return existing

    db.execute(
        """
        INSERT INTO transactions(id, title, amount, type, category, note, transaction_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            transaction["id"],
            transaction["title"],
            transaction["amount"],
            transaction["type"],
            transaction["category"],
            transaction.get("note", ""),
            transaction["transaction_date"],
            transaction["created_at"],
        ),
    )
    db.execute("UPDATE ledger_events SET undone_at = datetime('now') WHERE id = ?", (event_id,))
    db.commit()
    return get_transaction(int(transaction["id"]))


def seed_demo_data() -> list[dict]:
    demo_rows = [

        # ---------------- APRIL ----------------
        ("Monthly salary",68000,"income","Salary","April salary","2026-04-01"),
        ("House rent",18000,"expense","Bills","Monthly rent","2026-04-02"),
        ("Groceries",5200,"expense","Food","Weekly groceries","2026-04-05"),
        ("Petrol",2400,"expense","Transport","Fuel refill","2026-04-08"),
        ("Netflix",649,"expense","Entertainment","Monthly subscription","2026-04-10"),
        ("Electricity bill",3650,"expense","Bills","Utility bill","2026-04-15"),
        ("Dining out",1850,"expense","Food","Weekend dinner","2026-04-20"),
        ("Coffee",280,"expense","Food","Cafe stop","2026-04-22"),
        ("Uber",420,"expense","Transport","Airport ride","2026-04-24"),
        ("Gym membership",1800,"expense","Health","Monthly gym","2026-04-26"),
        ("Internet bill",999,"expense","Bills","Broadband","2026-04-27"),
        ("Book purchase",650,"expense","Education","Technical book","2026-04-28"),


        # ---------------- MAY ----------------
        ("Monthly salary",68000,"income","Salary","May salary","2026-05-01"),
        ("House rent",18000,"expense","Bills","Monthly rent","2026-05-02"),
        ("Groceries",5600,"expense","Food","Weekly groceries","2026-05-06"),
        ("Electricity bill",3720,"expense","Bills","Utility bill","2026-05-14"),
        ("Movie night",980,"expense","Entertainment","Cinema","2026-05-17"),
        ("Freelance logo",12000,"income","Freelance","Logo design","2026-05-23"),
        ("Shopping",4200,"expense","Shopping","Summer clothes","2026-05-28"),
        ("Coffee",310,"expense","Food","Morning coffee","2026-05-11"),
        ("Fuel",2300,"expense","Transport","Petrol refill","2026-05-13"),
        ("Internet bill",999,"expense","Bills","Broadband","2026-05-20"),
        ("Gym membership",1800,"expense","Health","Monthly gym","2026-05-24"),
        ("Groceries",2100,"expense","Food","Quick grocery run","2026-05-30"),

        # ---------------- JUNE ----------------
        ("Monthly salary",68000,"income","Salary","June salary","2026-06-01"),
        ("House rent",18000,"expense","Bills","Monthly rent","2026-06-02"),
        ("Flight tickets",11000,"expense","Transport","Weekend trip","2026-06-07"),
        ("Dining out",4300,"expense","Food","Birthday celebration","2026-06-12"),
        ("Electricity bill",3980,"expense","Bills","Utility bill","2026-06-14"),
        ("Freelance landing page",18000,"income","Freelance","Client milestone","2026-06-19"),
        ("Groceries",6100,"expense","Food","Monthly groceries","2026-06-24"),
        ("Coffee",250,"expense","Food","Coffee","2026-06-09"),
        ("Internet bill",999,"expense","Bills","Broadband","2026-06-16"),
        ("Movie",750,"expense","Entertainment","Weekend movie","2026-06-18"),
        ("Fuel",2600,"expense","Transport","Petrol","2026-06-22"),
        ("Gym membership",1800,"expense","Health","Monthly gym","2026-06-28"),


        # ---------------- JULY ----------------
        ("Monthly salary",68000,"income","Salary","July salary credited","2026-07-01"),
        ("Metro recharge",1200,"expense","Transport","Commute card top-up","2026-07-02"),
        ("Team dinner",2450,"expense","Food","Celebration dinner","2026-07-03"),
        ("Freelance landing page",18000,"income","Freelance","Client milestone payment","2026-07-05"),
        ("Pharmacy order",980,"expense","Health","Medicines","2026-07-06"),
        ("Streaming annual plan",2499,"expense","Entertainment","Annual subscription","2026-07-08"),
        ("Laptop accessory",6200,"expense","Shopping","Mechanical keyboard","2026-07-10"),
        ("Electricity bill",4100,"expense","Bills","Monthly utility bill","2026-07-11"),
        ("Weekend groceries",2850,"expense","Food","Bulk groceries","2026-07-13"),
        ("Bonus",15000,"income","Salary","Quarterly bonus","2026-07-15"),
        ("Coffee",300,"expense","Food","Cafe","2026-07-17"),
        ("Fuel",2500,"expense","Transport","Petrol","2026-07-18"),
        ("Internet bill",999,"expense","Bills","Broadband","2026-07-21"),
        ("Gym membership",1800,"expense","Health","Monthly gym","2026-07-24"),
        ("Weekend movie",850,"expense","Entertainment","Cinema","2026-07-27"),
    ]

    db = get_db()
    db.execute("DELETE FROM transactions")

    db.executemany(
        """
        INSERT INTO transactions(title, amount, type, category, note, transaction_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        """,
        demo_rows,
    )
    db.commit()
    return list_transactions()

def get_setting(key):
    db = get_db()

    row = db.execute(
        "SELECT value FROM settings WHERE key=?",
        (key,),
    ).fetchone()

    return row["value"] if row else ""


def set_setting(key, value):
    db = get_db()

    db.execute(
        """
        INSERT INTO settings(key,value)
        VALUES(?,?)
        ON CONFLICT(key)
        DO UPDATE SET value=excluded.value
        """,
        (key, value),
    )

    db.commit()

def summary() -> dict:
    transactions = list_transactions()
    income = sum(float(item["amount"]) for item in transactions if item["type"] == "income")
    expense = sum(float(item["amount"]) for item in transactions if item["type"] == "expense")

    by_category = defaultdict(float)
    daily_totals = defaultdict(float)

    for item in transactions:
        signed_amount = float(item["amount"]) if item["type"] == "income" else -float(item["amount"])
        daily_totals[item["transaction_date"]] += signed_amount
        if item["type"] == "expense":
            by_category[item["category"]] += float(item["amount"])

    pulse = _build_pulse(transactions)

    return {
        "income": round(income, 2),
        "expense": round(expense, 2),
        "net": round(income - expense, 2),
        "transactionCount": len(transactions),
        "topCategories": [
            {"category": category, "amount": round(amount, 2)}
            for category, amount in sorted(by_category.items(), key=lambda entry: entry[1], reverse=True)[:5]
        ],
        "dailyNet": [
            {"date": date, "amount": round(amount, 2)}
            for date, amount in sorted(daily_totals.items())
        ],
        "pulse": pulse,
    }
def available_months():
    db = get_db()

    rows = db.execute(
        """
        SELECT DISTINCT
            strftime('%Y-%m', transaction_date) AS value,
            strftime('%m', transaction_date) AS month,
            strftime('%Y', transaction_date) AS year
        FROM transactions
        ORDER BY value DESC
        """
    ).fetchall()

    return [dict(row) for row in rows]

def _build_pulse(transactions: list[dict]) -> list[dict]:
    today = datetime.now().date()
    points = []
    candidates = []

    for offset in range(13, -1, -1):
        day = today - timedelta(days=offset)
        day_key = day.isoformat()
        total_expense = sum(
            float(item["amount"])
            for item in transactions
            if item["type"] == "expense" and item["transaction_date"] == day_key
        )
        prior_expenses = [point["expense"] for point in points if point["expense"] > 0]
        baseline = sum(prior_expenses) / len(prior_expenses) if prior_expenses else 0
        ratio = (total_expense / baseline) if baseline > 0 else 0

        point = {
            "date": day_key,
            "expense": round(total_expense, 2),
            "baseline": round(baseline, 2),
            "ratio": round(ratio, 2),
            "flagged": False,
        }
        points.append(point)

        if baseline > 0 and total_expense > baseline * 1.6:
            candidates.append(point)

    if candidates:
        standout = max(candidates, key=lambda item: (item["ratio"], item["expense"], item["date"]))
        for point in points:
            point["flagged"] = point["date"] == standout["date"]

    return points


def find_possible_duplicate(payload):
    """
    Look for a recent transaction that is very similar.
    Returns the matching row or None.
    """
    db = get_db()
    amount = float(payload["amount"])
    title = payload["title"].strip().lower()
    category = payload["category"]
    tx_type = payload["type"]

    cutoff = (
        datetime.now() - timedelta(days=2)
    ).strftime("%Y-%m-%d")

    rows = db.execute(
        """
        SELECT *
        FROM transactions
        WHERE type = ?
          AND category = ?
          AND transaction_date >= ?
        ORDER BY transaction_date DESC
        """,
        (
            tx_type,
            category,
            cutoff,
        ),
    ).fetchall()

    for row in rows:

        existing_amount = float(row["amount"])

        # Allow ±5% (minimum ₹5)
        if abs(existing_amount - amount) > max(amount * 0.05, 5):
            continue

        similarity = SequenceMatcher(
            None,
            title,
            row["title"].lower(),
        ).ratio()

        if similarity >= 0.75:
            reasons = []

            reasons.append("Same category")
            amount_difference = abs(existing_amount - amount)
            if amount_difference < 1:
                reasons.append("Same amount")
            else:
                reasons.append(f"Amount differs by only ₹{amount_difference:.2f}")

            reasons.append(f"Title similarity {round(similarity * 100)}%")

            reasons.append("Recorded within the last 48 hours")

            return {
                "transaction": dict(row),
                "reasons": reasons,
            }

    return None