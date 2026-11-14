from fastapi import APIRouter, HTTPException, Depends, Body
from datetime import datetime
import mongodb
from auth import require_company_access
from services.whatsapp_service import whatsapp_service

whatsapp_router = APIRouter(prefix="/api/v1/whatsapp", tags=["whatsapp"])

@whatsapp_router.get("/settings")
async def get_whatsapp_settings(current_user: dict = Depends(require_company_access)):
    """Retrieves the company's WhatsApp configuration (with access token masked)."""
    db = mongodb.get_db()
    company = await db.companies.find_one({"company_id": current_user["company_id"]})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    w_cfg = company.get("whatsapp_config") or {}
    token = w_cfg.get("access_token", "")
    masked_token = f"••••••••••••••••{token[-6:]}" if len(token) > 8 else ("" if not token else "••••••••")

    return {
        "status": "success",
        "config": {
            "enabled": bool(w_cfg.get("enabled", True)),
            "provider": w_cfg.get("provider", "meta_cloud"),
            "phone_number_id": w_cfg.get("phone_number_id", ""),
            "has_token": bool(token),
            "masked_token": masked_token
        }
    }

@whatsapp_router.patch("/settings")
async def update_whatsapp_settings(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    """Updates company WhatsApp configuration."""
    db = mongodb.get_db()
    company = await db.companies.find_one({"company_id": current_user["company_id"]})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    current_cfg = company.get("whatsapp_config") or {}

    new_cfg = {
        "enabled": payload.get("enabled", current_cfg.get("enabled", True)),
        "provider": payload.get("provider", "meta_cloud"),
        "phone_number_id": str(payload.get("phone_number_id", current_cfg.get("phone_number_id", ""))).strip(),
        "updated_at": datetime.utcnow().isoformat()
    }

    # Only update token if provided (not masked)
    token = payload.get("access_token")
    if token and not token.startswith("••••"):
        new_cfg["access_token"] = token.strip()
    elif "access_token" in current_cfg:
        new_cfg["access_token"] = current_cfg["access_token"]

    await db.companies.update_one(
        {"company_id": current_user["company_id"]},
        {"$set": {"whatsapp_config": new_cfg}}
    )

    return {"status": "success", "message": "WhatsApp settings updated successfully"}

@whatsapp_router.post("/test")
async def test_whatsapp_message(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    """Sends a live test WhatsApp message to verify Meta Cloud API credentials."""
    db = mongodb.get_db()
    recipient_phone = payload.get("phone")
    if not recipient_phone:
        raise HTTPException(status_code=400, detail="Recipient phone number is required")

    creds = await whatsapp_service.get_whatsapp_credentials(db, current_user["company_id"])
    phone_number_id = str(payload.get("phone_number_id") or creds.get("phone_number_id") or "").strip()
    raw_token = payload.get("access_token")
    access_token = raw_token.strip() if (raw_token and not str(raw_token).startswith("••••")) else creds.get("access_token")

    if not phone_number_id or not access_token:
        raise HTTPException(
            status_code=400,
            detail="Meta WhatsApp credentials not found. Please provide Phone Number ID and Access Token, then click 'Save WhatsApp Settings'."
        )

    # Auto-persist valid credentials to company
    await db.companies.update_one(
        {"company_id": current_user["company_id"]},
        {"$set": {
            "whatsapp_config.phone_number_id": phone_number_id,
            "whatsapp_config.access_token": access_token,
            "whatsapp_config.enabled": True
        }}
    )

    test_message = (
        "🚀 *TalklyAI WhatsApp Integration Test*\n\n"
        "Great news! Your Meta WhatsApp Cloud API is successfully connected to TalklyAI.\n\n"
        "Post-call automated reminders, demo links, and brochures will now be sent automatically to your prospects."
    )

    # First, dispatch Meta's pre-approved hello_world template (guaranteed delivery for test sandbox numbers)
    res_tpl = await whatsapp_service.send_meta_whatsapp_template(
        phone_number_id, access_token, recipient_phone, "hello_world", "en_US"
    )

    # Next, dispatch custom TalklyAI test text
    res = await whatsapp_service.send_meta_whatsapp_message(
        phone_number_id, access_token, recipient_phone, test_message
    )

    if res_tpl.get("status") == "success" or res.get("status") == "success":
        return {
            "status": "success",
            "message": f"Test WhatsApp dispatched to {recipient_phone}! Check WhatsApp chat from +1 (555) 200-0290.",
            "details": res_tpl if res_tpl.get("status") == "success" else res
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Meta WhatsApp API error: {res_tpl.get('detail') or res.get('detail', 'Unknown error')}"
        )

@whatsapp_router.post("/send-manual")
async def send_manual_whatsapp(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    """Manually dispatch or re-send a WhatsApp reminder to any customer."""
    db = mongodb.get_db()
    recipient_phone = payload.get("phone")
    message = payload.get("message")
    call_id = payload.get("call_id")

    if not recipient_phone or not message:
        raise HTTPException(status_code=400, detail="Phone number and message are required")

    creds = await whatsapp_service.get_whatsapp_credentials(db, current_user["company_id"])
    phone_number_id = creds.get("phone_number_id")
    access_token = creds.get("access_token")

    if phone_number_id and access_token:
        res = await whatsapp_service.send_meta_whatsapp_message(
            phone_number_id, access_token, recipient_phone, message
        )
        status = "sent" if res.get("status") == "success" else "failed"
    else:
        res = {"status": "simulated", "note": "Credentials not configured"}
        status = "simulated"

    if call_id:
        await db.calls.update_one(
            {"call_id": call_id},
            {"$set": {
                "whatsapp_sent": True,
                "whatsapp_status": status,
                "whatsapp_message_body": message,
                "whatsapp_timestamp": datetime.datetime.utcnow().isoformat() + "Z"
            }}
        )

    return {"status": "success", "delivery_status": status, "details": res}
