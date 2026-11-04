import datetime
import asyncio
import json
import requests
from starlette.concurrency import run_in_threadpool

class CRMService:
    async def sync_call_to_crm(self, db, call_id: str) -> bool:
        """
        Dispatches call intelligence data to the tenant's configured webhook URL
        (Zapier, Make.com, HubSpot, Salesforce, or custom CRM).
        """
        # Look up the call
        call_doc = await db.calls.find_one({"call_id": call_id})
        if not call_doc:
            raise ValueError(f"Call {call_id} not found")

        company_id = call_doc.get("company_id")
        webhook_url = None
        if company_id:
            company = await db.companies.find_one({"company_id": company_id})
            if company and company.get("webhook_url"):
                webhook_url = str(company.get("webhook_url")).strip()

        # Fetch lead if available for extra metadata
        lead_doc = None
        if call_doc.get("call_id"):
            lead_doc = await db.leads.find_one({"lead_id": call_doc.get("call_id")})
        if not lead_doc and call_doc.get("customer_id"):
            lead_doc = await db.leads.find_one({"phone": call_doc.get("customer_id")})

        analysis = call_doc.get("analysis", {})
        requirements = analysis.get("requirements") or analysis.get("property_requirements") or {}

        payload = {
            "event": "call.completed",
            "call_id": call_id,
            "company_id": company_id,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "lead": {
                "name": call_doc.get("customer_name") or (lead_doc.get("name") if lead_doc else "Unknown"),
                "phone": call_doc.get("customer_phone") or call_doc.get("customer_id") or (lead_doc.get("phone") if lead_doc else ""),
                "offering": lead_doc.get("offering") if lead_doc else lead_doc.get("property") if lead_doc else "",
                "status": lead_doc.get("status") if lead_doc else "Contacted",
                "custom_fields": lead_doc.get("custom_fields", {}) if lead_doc else {}
            },
            "call_metrics": {
                "duration_seconds": call_doc.get("duration_seconds", 0),
                "direction": call_doc.get("direction", "outbound"),
                "status": call_doc.get("status", "Completed"),
                "language": call_doc.get("language", "English")
            },
            "ai_intelligence": {
                "sentiment": call_doc.get("sentiment") or analysis.get("sentiment", "neutral"),
                "lead_score": analysis.get("lead_score", 0),
                "lead_temperature": analysis.get("lead_temperature", "Warm"),
                "summary": call_doc.get("summary") or analysis.get("summary", ""),
                "intents": analysis.get("intents", []),
                "action_items": analysis.get("action_items", []),
                "requirements": requirements
            },
            "transcript": call_doc.get("transcript", "")
        }

        webhook_success = True
        webhook_status_code = None

        if webhook_url:
            try:
                def _dispatch():
                    return requests.post(
                        webhook_url,
                        json=payload,
                        headers={"Content-Type": "application/json", "User-Agent": "TalklyAI-Webhook/1.0"},
                        timeout=10
                    )
                resp = await run_in_threadpool(_dispatch)
                webhook_status_code = resp.status_code
                webhook_success = resp.ok
                print(f"CRM Webhook dispatched to {webhook_url} -> Status {resp.status_code}")
            except Exception as ex:
                webhook_success = False
                print(f"CRM Webhook delivery error for call {call_id}: {ex}")

        # Update the database record
        await db.calls.update_one(
            {"call_id": call_id},
            {"$set": {
                "crm_synced": webhook_success,
                "crm_webhook_url": webhook_url,
                "crm_status_code": webhook_status_code,
                "crm_sync_timestamp": datetime.datetime.utcnow().isoformat()
            }}
        )

        return True

    async def send_test_webhook(self, webhook_url: str) -> dict:
        """Sends a verification ping to validate the webhook URL."""
        test_payload = {
            "event": "webhook.test",
            "message": "TalklyAI Webhook connection verified successfully!",
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
        }
        def _ping():
            return requests.post(
                webhook_url,
                json=test_payload,
                headers={"Content-Type": "application/json", "User-Agent": "TalklyAI-Webhook/1.0"},
                timeout=8
            )
        resp = await run_in_threadpool(_ping)
        return {
            "success": resp.ok,
            "status_code": resp.status_code,
            "response_text": resp.text[:200]
        }

    async def sync_lead_status_from_call(self, db, lead_id: str, analysis_result: dict, company_id: str = None):
        if not analysis_result:
            return
            
        intents = analysis_result.get("intents") or []
        summary = (analysis_result.get("summary") or "").lower()
        conv_prob = analysis_result.get("conversion_probability") or 0
        reqs = analysis_result.get("requirements") or analysis_result.get("property_requirements") or {}
        timeline = reqs.get("timeline") if isinstance(reqs, dict) else None
        lead_temp = analysis_result.get("lead_temperature")

        conversion_intent_keywords = [
            "Appointment Booking", "Demo Booking", "Site Visit", "Demo Scheduled", "Enrollment", "Converted",
            "Doctor Consultation", "Consultation Confirmed", "Doctor Appointment", "Clinic Visit", "Slot Confirmed",
            "Loan Application", "Documentation Callback", "Sanction Request", "Pre-Approval", "Sanction Ready",
            "Executive Walkthrough", "Product Demo", "Meeting Scheduled", "Screen-share Demo"
        ]
        summary_conversion_keywords = [
            "confirmed participation", "confirmed seat", "confirmed demo", "seat confirmed", "booked",
            "appointment confirmed", "scheduled demo", "masterclass confirmed", "site visit confirmed",
            "visit scheduled", "consultation confirmed", "sanction quote",
            "document verification confirmed", "walkthrough confirmed", "screen-share confirmed", "demo booked"
        ]

        lead_score = analysis_result.get("lead_score", 0)
        
        is_callback_or_busy = (
            bool(timeline and any(cb in str(timeline).lower() for cb in ["call back", "callback", "busy", "reschedule", "later", "not interested"]))
            or any(cb in summary for cb in ["busy", "call back later", "callback later", "reschedule", "not a good time", "requested for a call back"])
            or any(i in ["Low Intent Lead", "Not Interested", "Busy"] for i in intents)
        )

        is_converted = False
        if not is_callback_or_busy and lead_temp != "Cold" and lead_score >= 50:
            is_converted = (
                any(i in conversion_intent_keywords for i in intents)
                or conv_prob >= 70
                or (any(k in summary for k in summary_conversion_keywords) and conv_prob >= 40)
            )

        if is_converted:
            lead_status = "Converted"
        elif lead_temp == "Hot" or conv_prob >= 50 or lead_score >= 75:
            lead_status = "Qualified"
        elif (lead_temp in ["Warm", "Hot"] or lead_score >= 40) and not (lead_temp == "Cold" and lead_score < 30):
            lead_status = "Interested"
        else:
            lead_status = "Contacted"
            
        update_data = {
            "status": lead_status,
            "aiScore": analysis_result.get("lead_score", 0),
            "lastContact": datetime.datetime.utcnow().isoformat()
        }
        
        reqs = analysis_result.get("requirements") or analysis_result.get("property_requirements", {})
        if isinstance(reqs, dict):
            offering_val = reqs.get("offering") or reqs.get("propertyType") or reqs.get("property_type")
            if offering_val:
                update_data["property"] = offering_val
                update_data["offering"] = offering_val
            if reqs.get("location"):
                update_data["location"] = reqs.get("location")
            if reqs.get("budget"):
                update_data["budget"] = reqs.get("budget")

        # Collections-specific fields: the full analysis dict only ever gets
        # written to db.calls, never db.leads, so without copying these two
        # over explicitly the collections reconciliation/dashboard metrics
        # (which query db.leads) would never see them.
        ptp = analysis_result.get("promise_to_pay")
        if isinstance(ptp, dict) and ptp:
            update_data["promise_to_pay"] = ptp
        if "identity_verified" in analysis_result:
            update_data["identity_verified"] = bool(analysis_result.get("identity_verified"))

        await db.leads.update_one(
            {"lead_id": lead_id},
            {"$set": update_data}
        )

        # Push an in-app notification + email alert for anything worth a
        # human knowing about right away. Without this, the only way to find
        # out a lead went Qualified/Converted was to go open the Leads page.
        if company_id and lead_status in ("Qualified", "Converted"):
            try:
                from services.notification_service import notification_service
                lead_doc = await db.leads.find_one({"lead_id": lead_id})
                await notification_service.notify_hot_lead(db, company_id, lead_id, lead_doc, lead_status, analysis_result)
            except Exception as e:
                print(f"Lead notification dispatch failed for {lead_id}: {e}")

crm_service = CRMService()

