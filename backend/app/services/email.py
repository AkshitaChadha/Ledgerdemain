import os
import smtplib
from email.message import EmailMessage
from flask import current_app


def send_email_with_status(to_email: str | None, subject: str, html: str) -> dict:
    if _smtp_is_configured():
        smtp_result = _send_email_with_smtp(to_email, subject, html)
        if smtp_result["sent"]:
            return smtp_result

        current_app.logger.warning("SMTP email failed: %s", smtp_result["error"])
        return smtp_result

    if not to_email:
        return {"sent": False, "error": "No recipient email was provided."}
    return {"sent": False, "error": "SMTP is not configured on the backend."}


def send_email(to_email: str | None, subject: str, html: str) -> bool:
    return send_email_with_status(to_email, subject, html)["sent"]


def email_delivery_status() -> dict:
    return {
        "emailProvider": "smtp",
        "smtpConfigured": _smtp_is_configured(),
        "hasSmtpHost": bool(os.getenv("SMTP_HOST")),
        "hasSmtpUser": bool(os.getenv("SMTP_USER")),
        "hasSmtpPassword": bool(os.getenv("SMTP_PASSWORD")),
        "smtpFromEmail": os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_USER"),
    }


def _smtp_is_configured() -> bool:
    return all(
        [
            os.getenv("SMTP_HOST"),
            os.getenv("SMTP_USER"),
            os.getenv("SMTP_PASSWORD"),
        ]
    )


def _send_email_with_smtp(to_email: str | None, subject: str, html: str) -> dict:
    if not to_email:
        return {"sent": False, "error": "No recipient email was provided."}

    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("SMTP_FROM_EMAIL") or username
    from_name = os.getenv("SMTP_FROM_NAME", "Ledgerdemain")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{from_name} <{from_email}>"
    message["To"] = to_email
    message.set_content(_html_to_text(html))
    message.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.starttls()
            server.login(username, password)
            server.send_message(message)
        return {"sent": True, "error": None}
    except Exception as exc:
        return {"sent": False, "error": str(exc)}


def _html_to_text(html: str) -> str:
    return (
        html.replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("<p>", "")
        .replace("</p>", "\n")
        .replace("<h2>", "")
        .replace("</h2>", "\n\n")
        .replace("<b>", "")
        .replace("</b>", "")
    )
