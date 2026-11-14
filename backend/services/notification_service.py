import os
import smtplib
import uuid
import asyncio
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


class NotificationService:
    """In-app notifications + an email alert whenever a lead crosses into
    Qualified/Converted - the only two places that previously surfaced this
    were the Leads page and a Calls detail modal, both of which require
    someone to go look. Nothing pushed the update to anyone."""

    async def notify_hot_lead(self, db, company_id: str, lead_id: str, lead_doc: dict, lead_status: str, analysis_result: dict):
        if not company_id or not lead_id:
            return

        lead_name = (lead_doc or {}).get("name") or "A lead"
        lead_phone = (lead_doc or {}).get("phone") or ""
        ai_score = (lead_doc or {}).get("aiScore") or analysis_result.get("lead_score", 0)
        summary = (analysis_result or {}).get("summary") or ""
        offering = (lead_doc or {}).get("offering") or (lead_doc or {}).get("property") or ""

        title = f"{lead_name} is now {lead_status}"
        message = summary[:240] if summary else f"{lead_name} ({lead_phone}) scored {ai_score} on this call."

        notification = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "type": "lead_status",
            "status": lead_status,
            "title": title,
            "message": message,
            "lead_id": lead_id,
            "call_id": lead_id,
            "lead_name": lead_name,
            "lead_phone": lead_phone,
            "ai_score": ai_score,
            "offering": offering,
            "read": False,
            "created_at": datetime.utcnow(),
        }

        try:
            await db.notifications.insert_one(notification)
        except Exception as e:
            print(f"Failed to write notification for lead {lead_id}: {e}")

        try:
            await self._send_email_alert(db, company_id, title, message, lead_phone, ai_score, lead_status)
        except Exception as e:
            print(f"Lead alert email failed for {lead_id}: {e}")

    async def _send_email_alert(self, db, company_id: str, title: str, message: str, lead_phone: str, ai_score, lead_status: str):
        admin = await db.users.find_one({"company_id": company_id, "role": "company_admin"})
        to_email = admin.get("email") if admin else None
        if not to_email:
            return

        subject = f"Talkly Alert: {title}"
        body = (
            f"{title}\n\n"
            f"Phone: {lead_phone}\n"
            f"AI Score: {ai_score}\n"
            f"Status: {lead_status}\n\n"
            f"Summary: {message}\n\n"
            f"Open the Leads page in Talkly to view the full call details."
        )

        smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(os.environ.get("SMTP_PORT", 587))
        smtp_user = os.environ.get("SMTP_USER")
        smtp_pass = os.environ.get("SMTP_PASS")

        if not (smtp_user and smtp_pass):
            print(f"--- Simulating lead alert email (SMTP not configured) ---")
            print(f"To: {to_email}\nSubject: {subject}\n{body[:150]}...")
            return

        msg = MIMEMultipart()
        msg["From"] = smtp_user
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        def _dispatch():
            server = smtplib.SMTP(smtp_host, smtp_port)
            try:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
            finally:
                server.quit()

        await asyncio.to_thread(_dispatch)


notification_service = NotificationService()
