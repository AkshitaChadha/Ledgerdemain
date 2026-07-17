import os
from flask import current_app

try:
    import resend
except ImportError:  # Keeps the app bootable before optional email setup is installed.
    resend = None


def send_email(to_email: str | None, subject: str, html: str) -> bool:
    api_key = os.getenv("RESEND_API_KEY")
    if not to_email or not api_key or resend is None:
        return False

    resend.api_key = api_key

    try:
        resend.Emails.send(
            {
                "from": os.getenv("RESEND_FROM_EMAIL", "Ledgerdemain <onboarding@resend.dev>"),
                "to": [to_email],
                "subject": subject,
                "html": html,
            }
        )
        return True
    except Exception as exc:
        current_app.logger.warning("Resend email failed: %s", exc)
        return False
