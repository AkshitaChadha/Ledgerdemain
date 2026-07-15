from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta

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
        ("Monthly salary", 68000, "income", "Salary", "July salary credited", "2026-07-01"),
        ("Metro recharge", 1200, "expense", "Transport", "Commute card top-up", "2026-07-02"),
        ("Team dinner", 2450, "expense", "Food", "Celebration dinner", "2026-07-03"),
        ("Freelance landing page", 18000, "income", "Freelance", "Client milestone payment", "2026-07-05"),
        ("Pharmacy order", 980, "expense", "Health", "Medicines and essentials", "2026-07-06"),
        ("Streaming annual plan", 2499, "expense", "Entertainment", "Renewed annual subscription", "2026-07-08"),
        ("Laptop accessory", 6200, "expense", "Shopping", "Mechanical keyboard", "2026-07-10"),
        ("Electricity bill", 4100, "expense", "Bills", "Monthly utility bill", "2026-07-11"),
        ("Weekend groceries", 2850, "expense", "Food", "Bulk home groceries", "2026-07-13"),
    ]

    db = get_db()
    existing = db.execute("SELECT COUNT(*) AS count FROM transactions").fetchone()
    if existing["count"] > 0:
        return list_transactions()

    db.executemany(
        """
        INSERT INTO transactions(title, amount, type, category, note, transaction_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        """,
        demo_rows,
    )
    db.commit()
    return list_transactions()


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
