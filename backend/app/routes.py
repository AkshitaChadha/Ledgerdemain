from __future__ import annotations

from datetime import date

from flask import Blueprint, jsonify, request

from .services.ledger import (
    create_transaction,
    delete_transaction,
    get_transaction,
    list_transactions,
    recent_transactions,
    record_delete_event,
    seed_demo_data,
    summary,
    undo_delete_event,
    update_transaction,
    find_possible_duplicate,
    available_months,
    get_setting,
    set_setting
)
from .services.notifications import (
    create_notification,
    get_notifications,
    mark_all_as_read,
    maybe_send_webhook,
)
from .services.rules import analyze_transaction

from .services.email import send_email

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

EMAIL_ALERT_SEVERITIES = {"warning", "critical"}


def _send_notification_email(subject: str, html: str) -> bool:
    """Send only explicit user-facing warnings through Resend."""
    return send_email(get_setting("notification_email"), subject, html)


def _send_direct_email(to_email: str | None, subject: str, html: str) -> bool:
    """Send account/settings emails to the address being configured."""
    return send_email(to_email, subject, html)

@api.get("/settings")
def get_settings():
    return jsonify({
        "notification_email": get_setting("notification_email")
    })


@api.post("/settings")
def save_settings():
    payload = request.get_json() or {}
    previous_email = (get_setting("notification_email") or "").strip()
    next_email = (payload.get("notification_email") or "").strip()

    set_setting("notification_email", next_email)

    email_event = None
    email_sent = False

    if next_email and not previous_email:
        email_event = "welcome"
        email_sent = _send_direct_email(
            next_email,
            "Welcome to Ledgerdemain",
            """
            <h2>Welcome to Ledgerdemain</h2>
            <p>Your alert email is now connected.</p>
            <p>The ledger will email you only for important moments: possible duplicates and high-priority spending warnings.</p>
            """,
        )
    elif next_email and next_email.lower() != previous_email.lower():
        email_event = "changed"
        email_sent = _send_direct_email(
            next_email,
            "Ledgerdemain alert email changed",
            """
            <h2>Your Ledgerdemain alert email was changed</h2>
            <p>This address will now receive important ledger warnings.</p>
            <p>If you did not make this change, review your local app settings.</p>
            """,
        )

    return jsonify({
        "success": True,
        "emailEvent": email_event,
        "emailSent": email_sent,
    })
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
            "months":available_months(),
        }
    )


@api.post("/transactions")
def add_transaction():
    payload = request.get_json(silent=True) or {}

    force_save = payload.pop("force_save", False)

    # ---------------- Duplicate Detection ----------------
    if not force_save:
        duplicate = find_possible_duplicate(payload)

        if duplicate:
            create_notification(
                "Possible duplicate detected",
                f"{payload.get('title', 'This entry')} looks similar to {duplicate['transaction']['title']}.",
                "warning",
                "in-app",
                "Review duplicate",
                "Compare the amount, date, title, and category before saving.",
                duplicate["transaction"]["id"],
                duplicate["transaction"]["title"],
            )

            _send_notification_email(
                "Ledgerdemain detected a possible duplicate",
                f"""
                <h2>The ledger sensed an echo...</h2>

                <p>
                A transaction similar to
                <b>{duplicate["transaction"]["title"]}</b>
                was just entered.
                </p>

                <h3>Why it was flagged</h3>

                <ul>
                    {''.join(f'<li>{reason}</li>' for reason in duplicate["reasons"])}
                </ul>
                """,
            )

            return jsonify(
                {
                    "duplicateFound": True,
                    "duplicate": duplicate["transaction"],
                    "matchReasons": duplicate["reasons"],
                    "notifications": get_notifications(),
                }
            ), 200

    # ---------------- Validation ----------------
    errors = _validate_transaction(payload)
    if errors:
        return jsonify({"errors": errors}), 400

    # ---------------- Create Transaction ----------------
    recent = recent_transactions()
    created = create_transaction(payload)
    alerts = analyze_transaction(created, recent)

    # ---------------- Notifications ----------------
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

        if alert.severity in EMAIL_ALERT_SEVERITIES:
            _send_notification_email(
                alert.title,
                f"""
                <h2>{alert.title}</h2>

                <p>{alert.message}</p>
                <p><b>Suggested action:</b> {alert.action_text or "Review the latest ledger entry."}</p>
                """,
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

    # ---------------- Response ----------------
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

    event_id = record_delete_event(existing)
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
            "undoEventId": event_id,
        }
    )


@api.post("/transactions/undo-delete/<int:event_id>")
def undo_delete_transaction(event_id: int):
    restored = undo_delete_event(event_id)
    if not restored:
        return jsonify({"error": "This delete can no longer be undone."}), 409

    create_notification(
        "Transaction restored",
        f"{restored['title']} returned to the ledger.",
        "info",
        "in-app",
        "Review restored entry",
        "The delete event was replayed backward from the ledger history.",
        restored["id"],
        restored["title"],
    )

    return jsonify(
        {
            "transaction": restored,
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
            "months": available_months(),
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
