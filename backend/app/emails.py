"""Sends account emails (verify your address, reset your password).

We call Brevo's HTTP API instead of SMTP: free hosts like Render block outgoing SMTP ports,
but a normal HTTPS request always works. Without BREVO_API_KEY (local development),
the email is printed to the server console so you can still click the link."""
import html

import httpx

from .config import BREVO_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME, FRONTEND_URL


class EmailError(Exception):
    pass


def send_email(to: str, subject: str, text_body: str, html_body: str) -> None:
    if not BREVO_API_KEY:
        print(f"\n--- EMAIL (not sent: BREVO_API_KEY is not set) ---\nTo: {to}\nSubject: {subject}\n\n{text_body}\n---\n")
        return
    try:
        res = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": BREVO_API_KEY, "accept": "application/json"},
            json={
                "sender": {"name": EMAIL_FROM_NAME, "email": EMAIL_FROM},
                "to": [{"email": to}],
                "subject": subject,
                "textContent": text_body,
                "htmlContent": html_body,
            },
            timeout=15,
        )
    except httpx.HTTPError as exc:
        raise EmailError("Couldn't reach the email service.") from exc
    if res.status_code >= 300:
        print(f"Brevo error {res.status_code}: {res.text[:300]}")
        raise EmailError("The email service rejected the message.")


def _link_email(to: str, name: str, subject: str, intro: str, button: str, link: str, footer: str) -> None:
    text_body = f"Hi {name},\n\n{intro}\n\n{link}\n\n{footer}\n\nLead Prioritizer"
    html_body = f"""
<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a">
  <h2 style="margin-bottom:4px">Lead Prioritizer</h2>
  <p>Hi {html.escape(name)},</p>
  <p>{html.escape(intro)}</p>
  <p style="margin:28px 0">
    <a href="{html.escape(link)}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">{html.escape(button)}</a>
  </p>
  <p style="font-size:13px;color:#64748b">Or paste this link into your browser:<br>{html.escape(link)}</p>
  <p style="font-size:13px;color:#64748b">{html.escape(footer)}</p>
</div>"""
    send_email(to, subject, text_body, html_body)


def send_verification_email(to: str, name: str, token: str) -> None:
    _link_email(
        to,
        name,
        "Confirm your email for Lead Prioritizer",
        "Please confirm this is your email address to activate your account.",
        "Confirm my email",
        f"{FRONTEND_URL}/verify-email?token={token}",
        "The link works for 24 hours. If you didn't sign up, you can ignore this email.",
    )


def send_reset_email(to: str, name: str, token: str) -> None:
    _link_email(
        to,
        name,
        "Reset your Lead Prioritizer password",
        "Someone (hopefully you) asked to reset your password. Choose a new one here:",
        "Choose a new password",
        f"{FRONTEND_URL}/reset-password?token={token}",
        "The link works for 30 minutes and only once. If you didn't ask for this, ignore this email: your password stays the same.",
    )
