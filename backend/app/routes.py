from __future__ import annotations

from datetime import date

from flask import Blueprint, jsonify, request

from .services.ledger import (
    create_transaction,
    delete_transaction,
    get_transaction,
    list_transactions,
    recent_transactions,
    seed_demo_data,
    summary,
    update_transaction,
)
from .services.notifications import (
    create_notification,
    get_notifications,
    mark_all_as_read,
    maybe_send_webhook,
)
from .services.rules import analyze_transaction

api = Blueprint("api", __name__)

CATEGORIES = [
    "Salary",
    "Freelance",
    "Food",
    "Transport",
    "Bills",
    "Shopping",
    "Health",
    "Entertainment",
    "Savings",
    "Other",
]


@api.get("/health")
def health():
    return jsonify({"status": "ok"})


@api.get("/bootstrap")
def bootstrap():
    return jsonify(
        {
            "categories": CATEGORIES,
            "transactions": list_transactions(),
            "summary": summary(),
            "notifications": get_notifications(),
        }
    )


@api.post("/transactions")
def add_transaction():
    payload = request.get_json(silent=True) or {}
    errors = _validate_transaction(payload)
    if errors:
        return jsonify({"errors": errors}), 400

    recent = recent_transactions()
    created = create_transaction(payload)
    alerts = analyze_transaction(created, recent)

    for alert in alerts:
        create_notification(
            alert.title,
            alert.message,
            alert.severity,
            alert.medium,
            alert.action_label,
            alert.action_text,
            alert.source_transaction_id,
            alert.source_transaction_title,
        )
        maybe_send_webhook(
            {
                "title": alert.title,
                "message": alert.message,
                "severity": alert.severity,
                "actionLabel": alert.action_label,
                "actionText": alert.action_text,
                "transaction": created,
            }
        )

    return (
        jsonify(
            {
                "transaction": created,
                "summary": summary(),
                "notifications": get_notifications(),
                "alerts": [alert.__dict__ for alert in alerts],
            }
        ),
        201,
    )


@api.put("/transactions/<int:transaction_id>")
def edit_transaction(transaction_id: int):
    existing = get_transaction(transaction_id)
    if not existing:
        return jsonify({"error": "Transaction not found."}), 404

    payload = request.get_json(silent=True) or {}
    errors = _validate_transaction(payload)
    if errors:
        return jsonify({"errors": errors}), 400

    updated = update_transaction(transaction_id, payload)
    create_notification(
        "Transaction updated",
        f"{updated['title']} was edited and the ledger summary was refreshed.",
        "info",
        "in-app",
        "Review updated entry",
        "Make sure the new amount, category, and date look correct.",
        updated["id"],
        updated["title"],
    )

    return jsonify(
        {
            "transaction": updated,
            "transactions": list_transactions(),
            "summary": summary(),
            "notifications": get_notifications(),
        }
    )


@api.delete("/transactions/<int:transaction_id>")
def remove_transaction(transaction_id: int):
    existing = get_transaction(transaction_id)
    if not existing:
        return jsonify({"error": "Transaction not found."}), 404

    delete_transaction(transaction_id)
    create_notification(
        "Transaction deleted",
        f"{existing['title']} was removed from the ledger.",
        "warning",
        "in-app",
        "Review totals",
        "Double-check that the updated totals still match your intent.",
        transaction_id,
        existing["title"],
    )

    return jsonify(
        {
            "transactions": list_transactions(),
            "summary": summary(),
            "notifications": get_notifications(),
        }
    )


@api.post("/seed")
def seed():
    transactions = seed_demo_data()
    create_notification(
        "Demo data loaded",
        "Sample ledger entries were added so the dashboard and pulse can be reviewed quickly.",
        "info",
        "in-app",
        "Review pulse",
        "Inspect the pulse chart and smart insights using the seeded transactions.",
    )
    return jsonify(
        {
            "transactions": transactions,
            "summary": summary(),
            "notifications": get_notifications(),
        }
    )


@api.get("/notifications")
def notifications():
    return jsonify({"notifications": get_notifications()})


@api.post("/notifications/read-all")
def notifications_read_all():
    mark_all_as_read()
    return jsonify({"notifications": get_notifications()})


def _validate_transaction(payload: dict) -> dict:
    errors = {}

    title = (payload.get("title") or "").strip()
    if len(title) < 3:
        errors["title"] = "Use at least 3 characters for the title."

    try:
        amount = float(payload.get("amount", 0))
        if amount <= 0:
            errors["amount"] = "Amount must be greater than 0."
        else:
            payload["amount"] = round(amount, 2)
    except (TypeError, ValueError):
        errors["amount"] = "Amount must be a valid number."

    if payload.get("type") not in {"income", "expense"}:
        errors["type"] = "Select income or expense."

    category = (payload.get("category") or "").strip()
    if not category:
        errors["category"] = "Category is required."
    payload["category"] = category

    transaction_date = payload.get("transaction_date")
    try:
        parsed_date = date.fromisoformat(transaction_date)
        if parsed_date > date.today():
            errors["transaction_date"] = "Future dates are not allowed for this demo."
    except Exception:
        errors["transaction_date"] = "Use a valid date."

    payload["title"] = title
    payload["note"] = (payload.get("note") or "").strip()

    return errors
