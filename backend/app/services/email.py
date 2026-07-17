import os
from flask import current_app

try:
    import resend
except ImportError:  # Keeps the app bootable before optional email setup is installed.
    resend = None


def send_email_with_status(to_email: str | None, subject: str, html: str) -> dict:
    api_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("RESEND_FROM_EMAIL", "Ledgerdemain <onboarding@resend.dev>")

    if not to_email:
        return {"sent": False, "error": "No recipient email was provided."}
    if not api_key:
        return {"sent": False, "error": "RESEND_API_KEY is not loaded on the backend."}
    if resend is None:
        return {"sent": False, "error": "The resend package is not installed on the backend."}

    resend.api_key = api_key

    try:
        resend.Emails.send(
            {
                "from": from_email,
                "to": [to_email],
                "subject": subject,
                "html": html,
            }
        )
        return {"sent": True, "error": None}
    except Exception as exc:
        current_app.logger.warning("Resend email failed: %s", exc)
        return {"sent": False, "error": str(exc)}


def send_email(to_email: str | None, subject: str, html: str) -> bool:
    return send_email_with_status(to_email, subject, html)["sent"]
