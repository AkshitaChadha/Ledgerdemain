from __future__ import annotations

import json
from urllib import request

from flask import current_app

from ..db import get_db


def create_notification(
    title: str,
    message: str,
    severity: str,
    medium: str = "in-app",
    action_label: str | None = None,
    action_text: str | None = None,
    source_transaction_id: int | None = None,
    source_transaction_title: str | None = None,
) -> dict:
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO notifications(
            title,
            message,
            severity,
            medium,
            action_label,
            action_text,
            source_transaction_id,
            source_transaction_title,
            created_at,
            is_read
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 0)
        """,
        (
            title,
            message,
            severity,
            medium,
            action_label,
            action_text,
            source_transaction_id,
            source_transaction_title,
        ),
    )
    db.commit()
    row = db.execute(
        """
        SELECT
            id,
            title,
            message,
            severity,
            medium,
            action_label,
            action_text,
            source_transaction_id,
            source_transaction_title,
            created_at,
            is_read
        FROM notifications
        WHERE id = ?
        """,
        (cursor.lastrowid,),
    ).fetchone()
    return dict(row)


def get_notifications() -> list[dict]:
    db = get_db()
    rows = db.execute(
        """
        SELECT
            id,
            title,
            message,
            severity,
            medium,
            action_label,
            action_text,
            source_transaction_id,
            source_transaction_title,
            created_at,
            is_read
        FROM notifications
        WHERE is_read = 0
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 20
        """
    ).fetchall()
    return [dict(row) for row in rows]


def mark_all_as_read() -> None:
    db = get_db()
    db.execute("UPDATE notifications SET is_read = 1 WHERE is_read = 0")
    db.commit()


def maybe_send_webhook(payload: dict) -> bool:
    db = get_db()
    row = db.execute("SELECT value FROM settings WHERE key = 'webhook_url'").fetchone()
    webhook_url = row["value"] if row else current_app.config["DEFAULT_WEBHOOK_URL"]

    if not webhook_url:
        return False

    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        webhook_url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=5):
            return True
    except Exception:
        return False
