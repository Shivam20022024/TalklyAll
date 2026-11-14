import os
import re
import datetime
import requests
from starlette.concurrency import run_in_threadpool

class WhatsAppService:
    """
    Service for automated WhatsApp messaging via Meta WhatsApp Cloud API.
    Sends reminders, booking confirmations, and brochures directly to leads after calls.
    """

    def clean_phone_number(self, phone: str) -> str:
        """Sanitizes phone number into international format without '+' for Meta API (e.g., 919877082909)."""
        if not phone:
            return ""
        digits = re.sub(r"\D", "", str(phone))
        # If standard 10-digit Indian number without country code, prepend 91
        if len(digits) == 10:
            digits = "91" + digits
        elif len(digits) == 11 and digits.startswith("0"):
            digits = "91" + digits[1:]
        return digits

    async def get_whatsapp_credentials(self, db, company_id: str = None) -> dict:
        """Retrieves WhatsApp configuration dynamically from the company's database record."""
        config = {
            "enabled": True,
            "provider": "meta_cloud",
            "phone_number_id": os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip(),
            "access_token": os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip()
        }

        company = None
        if company_id:
            company = await db.companies.find_one({"company_id": company_id})
        
        # If no company found with that ID, find any company where user configured whatsapp in frontend
        if not company or not company.get("whatsapp_config"):
            company = await db.companies.find_one({"whatsapp_config.phone_number_id": {"$exists": True, "$ne": ""}})

        if company and company.get("whatsapp_config"):
            w_cfg = company["whatsapp_config"]
            if w_cfg.get("phone_number_id"):
                config["phone_number_id"] = w_cfg.get("phone_number_id").strip()
            if w_cfg.get("access_token"):
                config["access_token"] = w_cfg.get("access_token").strip()
            if "enabled" in w_cfg:
                config["enabled"] = bool(w_cfg["enabled"])

        return config


    async def send_meta_whatsapp_message(self, phone_number_id: str, access_token: str, recipient_phone: str, message_body: str) -> dict:
        """Calls the Meta WhatsApp Cloud API to send a text message."""
        clean_recipient = self.clean_phone_number(recipient_phone)
        if not clean_recipient:
            return {"status": "error", "message": "Invalid recipient phone number"}

        url = f"https://graph.facebook.com/v19.0/{phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_recipient,
            "type": "text",
            "text": {
                "preview_url": True,
                "body": message_body
            }
        }

        def _send():
            try:
                response = requests.post(url, headers=headers, json=payload, timeout=15)
                return response.status_code, response.text
            except Exception as e:
                return 500, str(e)

        status_code, response_text = await run_in_threadpool(_send)

        if status_code in [200, 201]:
            try:
                import json
                resp_json = json.loads(response_text)
                msg_id = resp_json.get("messages", [{}])[0].get("id")
                return {"status": "success", "message_id": msg_id, "recipient": clean_recipient}
            except Exception:
                return {"status": "success", "response": response_text, "recipient": clean_recipient}
        else:
            return {"status": "error", "status_code": status_code, "detail": response_text}

    async def send_meta_whatsapp_template(self, phone_number_id: str, access_token: str, recipient_phone: str, template_name: str = "hello_world", language_code: str = "en_US") -> dict:
        """Calls the Meta WhatsApp Cloud API to send a pre-approved template message."""
        clean_recipient = self.clean_phone_number(recipient_phone)
        if not clean_recipient:
            return {"status": "error", "message": "Invalid recipient phone number"}

        url = f"https://graph.facebook.com/v19.0/{phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": clean_recipient,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code}
            }
        }

        def _send():
            try:
                response = requests.post(url, headers=headers, json=payload, timeout=15)
                return response.status_code, response.text
            except Exception as e:
                return 500, str(e)

        status_code, response_text = await run_in_threadpool(_send)

        if status_code in [200, 201]:
            try:
                import json
                resp_json = json.loads(response_text)
                msg_id = resp_json.get("messages", [{}])[0].get("id")
                return {"status": "success", "message_id": msg_id, "recipient": clean_recipient}
            except Exception:
                return {"status": "success", "response": response_text, "recipient": clean_recipient}
        else:
            return {"status": "error", "status_code": status_code, "detail": response_text}

    async def process_post_call_whatsapp(self, db, call_id: str):
        """
        Triggered automatically when a call finishes analysis.
        Checks if the customer asked for WhatsApp or scheduled an appointment/demo,
        constructs the personalized reminder, and sends it via WhatsApp.
        """
        try:
            call = await db.calls.find_one({"call_id": call_id})
            if not call:
                return

            # Same resolved id crm_service.py uses - a quick-call that
            # reused an existing lead (dedup by phone) stores that lead's
            # real id on the call record, which can differ from call_id.
            # Falls back to call_id for every other path, unchanged.
            lead_id = call.get("lead_id") or call_id

            company_id = call.get("company_id")
            if not company_id:
                lead = await db.leads.find_one({"lead_id": lead_id})
                if lead and lead.get("company_id"):
                    company_id = lead.get("company_id")

            creds = await self.get_whatsapp_credentials(db, company_id)

            if not creds.get("enabled"):
                return

            analysis = call.get("analysis") or {}
            reqs = analysis.get("requirements") or analysis.get("property_requirements") or {}
            timeline = reqs.get("timeline") or ""

            # Only message the customer when the call actually produced real
            # signal of interest. Without this, a hallucinated/garbled "yes"
            # on an otherwise low-quality call could still trigger an
            # automatic "your seat is confirmed" WhatsApp to the customer -
            # this reuses the same lead_status bar crm_service.py already
            # computes from the full call analysis (not a single turn), plus
            # an explicit AI-drafted WhatsApp recommendation as an override
            # for calls where the AI specifically judged a message warranted.
            lead_for_gate = await db.leads.find_one({"lead_id": lead_id})
            lead_status = (lead_for_gate or {}).get("status", "")
            has_whatsapp_draft = any(
                isinstance(rec, dict) and rec.get("type", "").lower() == "whatsapp" and rec.get("draft")
                for rec in (analysis.get("follow_up_recommendations") or [])
            )
            if lead_status not in ("Converted", "Qualified", "Interested") and not has_whatsapp_draft:
                print(f"[WhatsApp Automation] Skipping {call_id}: no confirmed interest (lead_status='{lead_status}')")
                return

            # Resolve customer phone
            customer_phone = call.get("customer_id") or call.get("phone_number") or call.get("customer_phone")
            if not customer_phone:
                lead = await db.leads.find_one({"lead_id": lead_id})
                if lead:
                    customer_phone = lead.get("phone")

            if not customer_phone:
                return

            customer_name = call.get("customer_name") or "Valued Customer"
            company = await db.companies.find_one({"company_id": company_id})
            company_name = company.get("name") if company else "TalklyAI"
            offering = reqs.get("offering") or call.get("offering") or "Session"

            # Check if AI generated a tailored draft
            draft_text = ""
            for rec in analysis.get("follow_up_recommendations") or []:
                if rec.get("type", "").lower() == "whatsapp" and rec.get("draft"):
                    draft_text = rec.get("draft")
                    break

            # Fallback message template if no custom draft - always English,
            # regardless of what language the call itself was conducted in.
            if not draft_text:
                if timeline:
                    draft_text = (
                        f"Hi {customer_name}! Thank you for speaking with {company_name}.\n\n"
                        f"Your {offering} session is confirmed:\n"
                        f"🗓 Time: {timeline}\n\n"
                        f"We look forward to seeing you! Reply to this message if you have any questions."
                    )
                else:
                    draft_text = (
                        f"Hi {customer_name}! Thank you for speaking with {company_name}.\n\n"
                        f"As requested, here are all the details about {offering}.\n\n"
                        f"Let us know if you need any further assistance!"
                    )

            # If Meta Cloud API keys are configured, send real message
            phone_number_id = creds.get("phone_number_id")
            access_token = creds.get("access_token")

            if phone_number_id and access_token:
                # Dispatch custom personalized appointment & details message directly
                result = await self.send_meta_whatsapp_message(
                    phone_number_id, access_token, customer_phone, draft_text
                )
                delivery_status = "sent" if result.get("status") == "success" else "failed"
                message_id = result.get("message_id")

            else:
                # Simulation mode (credentials not added yet)
                delivery_status = "simulated"
                message_id = f"sim_{int(datetime.datetime.utcnow().timestamp())}"
                print(f"[WhatsApp Automation] Meta API credentials not set. Simulated sending to {customer_phone}:\n{draft_text}")



            now_iso = datetime.datetime.utcnow().isoformat() + "Z"
            whatsapp_record = {
                "whatsapp_sent": True,
                "whatsapp_status": delivery_status,
                "whatsapp_message_id": message_id,
                "whatsapp_recipient": customer_phone,
                "whatsapp_message_body": draft_text,
                "whatsapp_timestamp": now_iso
            }

            # Update call and lead records
            await db.calls.update_one({"call_id": call_id}, {"$set": whatsapp_record})
            await db.leads.update_one(
                {"$or": [{"lead_id": lead_id}, {"phone": customer_phone}]},
                {"$set": {
                    "whatsapp_sent": True,
                    "whatsapp_last_sent": now_iso,
                    "whatsapp_status": delivery_status
                }}
            )

            print(f"[WhatsApp Automation] Dispatched automated reminder to {customer_phone} (Status: {delivery_status})")
        except Exception as e:
            print(f"[WhatsApp Automation Error] {e}")

whatsapp_service = WhatsAppService()
