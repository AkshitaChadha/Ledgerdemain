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

from .services.email import email_delivery_status, send_email, send_email_with_status

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
    """Send only explicit user-facing warnings through SMTP."""
    return send_email(get_setting("notification_email"), subject, html)


def _send_direct_email_status(to_email: str | None, subject: str, html: str) -> dict:
    """Send account/settings emails and return a deploy-friendly failure reason."""
    return send_email_with_status(to_email, subject, html)


def _ledger_email(title: str, eyebrow: str, body: str, action: str | None = None) -> str:
    action_html = (
        f"""
        <div style="margin-top:22px;padding:14px 16px;border-radius:16px;background:#f7f4ff;border:1px solid #ded6ff;color:#35246b;">
            <strong>Next spell:</strong> {action}
        </div>
        """
        if action
        else ""
    )

    return f"""
    <div style="margin:0;padding:28px;background:#fbf3df;font-family:Georgia,'Times New Roman',serif;color:#202033;">
        <div style="max-width:620px;margin:0 auto;background:#fffaf0;border:1px solid #e9dcc0;border-radius:24px;overflow:hidden;box-shadow:0 18px 45px rgba(35,25,70,.12);">
            <div style="padding:24px 28px;background:linear-gradient(135deg,#5b3fdb,#281b68);color:#fff;">
                <div style="font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#e8b84b;font-weight:700;">{eyebrow}</div>
                <h1 style="margin:8px 0 4px;font-size:30px;line-height:1.1;">Ledgerdemain</h1>
                <p style="margin:0;color:#ded8ff;">Your money, made magically simple.</p>
            </div>
            <div style="padding:28px;">
                <h2 style="margin:0 0 14px;font-size:24px;color:#241b4d;">{title}</h2>
                <div style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.7;color:#4b5563;">
                    {body}
                </div>
                {action_html}
            </div>
            <div style="padding:18px 28px;border-top:1px solid #efe3ca;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:12px;color:#7b7280;">
                Sent by Ledgerdemain because this looked important enough to leave the ledger.
            </div>
        </div>
    </div>
    """

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
    welcomed_email = (get_setting("notification_email_welcome_sent_to") or "").strip()

    set_setting("notification_email", next_email)

    email_event = None
    email_sent = False
    email_error = None

    if next_email and previous_email and next_email.lower() != previous_email.lower():
        email_event = "changed"
        email_result = _send_direct_email_status(
            next_email,
            "Ledgerdemain alert email changed",
            _ledger_email(
                "The ravens have a new route.",
                "Alert route changed",
                """
                <p>Your Ledgerdemain alert email was updated successfully.</p>
                <p>Important omens, duplicate warnings, and spending spikes will now arrive at this address.</p>
                """,
                "If this was not you, open the app and update the notification email.",
            ),
        )
        email_sent = email_result["sent"]
        email_error = email_result["error"]
        if email_sent:
            set_setting("notification_email_welcome_sent_to", next_email)
    elif next_email and welcomed_email.lower() != next_email.lower():
        email_event = "welcome"
        email_result = _send_direct_email_status(
            next_email,
            "Welcome to Ledgerdemain",
            _ledger_email(
                "The ledger knows where to find you.",
                "Welcome omen",
                """
                <p>Your alert email is connected.</p>
                <p>Ledgerdemain will stay quiet for ordinary bookkeeping and only send mail when something deserves attention.</p>
                <p>Expect a message for possible duplicates, unusual spending spikes, or cashflow warnings.</p>
                """,
                "Add a few entries or load demo data to see the warning system come alive.",
            ),
        )
        email_sent = email_result["sent"]
        email_error = email_result["error"]
        if email_sent:
            set_setting("notification_email_welcome_sent_to", next_email)

    return jsonify({
        "success": True,
        "emailEvent": email_event,
        "emailSent": email_sent,
        "emailError": email_error,
    })


@api.get("/settings/email-status")
def settings_email_status():
    return jsonify(email_delivery_status())


@api.post("/settings/test-email")
def send_settings_test_email():
    email = (get_setting("notification_email") or "").strip()
    result = _send_direct_email_status(
        email,
        "Ledgerdemain test email",
        """
        <h2>The raven found its route.</h2>
        <p>This is a test email from Ledgerdemain. Future important ledger warnings will arrive here.</p>
        """,
    )

    return jsonify(
        {
            "success": result["sent"],
            "emailSent": result["sent"],
            "emailError": result["error"],
            "status": email_delivery_status(),
        }
    ), 200 if result["sent"] else 400


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
                _ledger_email(
                    "The ledger sensed an echo.",
                    "Duplicate warning",
                    f"""
                    <p>A transaction similar to <b>{duplicate["transaction"]["title"]}</b> was just entered.</p>
                    <p>Why it was flagged:</p>
                    <ul>
                        {''.join(f'<li>{reason}</li>' for reason in duplicate["reasons"])}
                    </ul>
                    """,
                    "Compare the entries before keeping both.",
                ),
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
                _ledger_email(
                    alert.title,
                    "Warning omen",
                    f"""
                    <p>{alert.message}</p>
                    <p>The ledger is not judging the spend. It is asking you to look twice.</p>
                    """,
                    alert.action_text or "Review the latest ledger entry.",
                ),
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
    created_notification = create_notification(
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
            "newNotifications": [created_notification],
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
