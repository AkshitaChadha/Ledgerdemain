from __future__ import annotations

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
    baseline_values = []

    for offset in range(13, -1, -1):
        day = today - timedelta(days=offset)
        day_key = day.isoformat()
        total_expense = sum(
            float(item["amount"])
            for item in transactions
            if item["type"] == "expense" and item["transaction_date"] == day_key
        )
        baseline_values.append(total_expense)
        baseline = sum(baseline_values) / len(baseline_values) if baseline_values else 0
        points.append(
            {
                "date": day_key,
                "expense": round(total_expense, 2),
                "flagged": baseline > 0 and total_expense > baseline * 1.6,
            }
        )

    return points
