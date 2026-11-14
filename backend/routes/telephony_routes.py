from fastapi import APIRouter, HTTPException, Depends, Body
from datetime import datetime
import os
import re
import mongodb
from auth import require_company_access

telephony_router = APIRouter()

DEFAULT_SHARED_NUMBER = os.environ.get("TALKLY_SHARED_NUMBER", "+918065535758")
DEFAULT_SHARED_LABEL = os.environ.get("TALKLY_SHARED_LABEL", "+91 80 6553 5758 (Talkly Plivo shared number)")

def mask_secret(val: str) -> str:
    if not val:
        return ""
    if len(val) <= 6:
        return "••••••"
    return val[:2] + "••••••••" + val[-4:]

@telephony_router.get("/settings")
async def get_telephony_settings(current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    company = await db.companies.find_one({"company_id": current_user["company_id"]})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    telephony = company.get("telephony") or {}
    mode = telephony.get("mode", "shared")
    provider = telephony.get("provider")
    phone_number = telephony.get("phone_number")
    
    connected_line = None
    if mode == "custom" and phone_number:
        connected_line = {
            "provider": provider or "twilio",
            "phone_number": phone_number,
            "account_sid_masked": mask_secret(telephony.get("account_sid", "")),
            "status": "connected",
            "connected_at": telephony.get("connected_at", datetime.utcnow().isoformat())
        }

    base_url = os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")
    inbound_webhook_url = f"{base_url}/api/v1/plivo/answer"

    return {
        "status": "success",
        "mode": mode,
        "shared_number": DEFAULT_SHARED_NUMBER,
        "shared_number_label": DEFAULT_SHARED_LABEL,
        "connected_line": connected_line,
        "inbound_webhook_url": inbound_webhook_url,
        "inbound_routing": telephony.get("inbound_routing") or {
            "mode": "ai_agent",
            "fallback_number": ""
        }
    }

@telephony_router.post("/connect")
async def connect_telephony_line(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    provider = payload.get("provider", "twilio").strip().lower()
    phone_number = payload.get("phone_number", "").strip()
    account_sid = payload.get("account_sid", "").strip()
    auth_token = payload.get("auth_token", "").strip()
    api_key = payload.get("api_key", "").strip()
    api_token = payload.get("api_token", "").strip()
    inbound_mode = payload.get("inbound_mode", "ai_agent")
    fallback_number = payload.get("fallback_number", "").strip()

    if not phone_number:
        raise HTTPException(status_code=400, detail="Phone number is required")

    # Basic normalization: ensure starts with +
    clean_num = phone_number.replace(" ", "").replace("-", "")
    if not clean_num.startswith("+"):
        clean_num = "+" + clean_num

    db = mongodb.get_db()
    company_id = current_user["company_id"]

    # Twilio/Exotel dispatch isn't implemented yet - only Plivo calls can
    # actually be placed (see server.py's outbound trigger). Reject the
    # connection here rather than silently saving credentials for a line
    # that will never be able to place a call.
    if provider in ("twilio", "exotel"):
        raise HTTPException(
            status_code=501,
            detail=f"{provider.title()} isn't supported for live calls yet - only Plivo is currently wired up for outbound dispatch. Connect a Plivo number instead, or use the Talkly shared number."
        )

    # Verify provider-specific required fields
    if provider == "twilio":
        if not account_sid or not auth_token:
            raise HTTPException(status_code=400, detail="Twilio requires Account SID and Auth Token")
    elif provider == "exotel":
        if not account_sid or not (api_key or auth_token):
            raise HTTPException(status_code=400, detail="Exotel requires Account SID and API Key/Token")
    elif provider == "plivo":
        if not account_sid or not auth_token:
            raise HTTPException(status_code=400, detail="Plivo requires Auth ID and Auth Token")
        from telephony.plivo_provider import PlivoProvider
        plivo_prov = PlivoProvider(account_sid, auth_token)
        ver_res = await plivo_prov.verify_credentials()
        if not ver_res.get("valid"):
            raise HTTPException(
                status_code=400,
                detail=f"Plivo credential verification failed: {ver_res.get('error', 'Invalid Auth ID or Auth Token')}"
            )

    telephony_doc = {
        "mode": "custom",
        "provider": provider,
        "phone_number": clean_num,
        "account_sid": account_sid,
        "auth_token": auth_token,
        "api_key": api_key,
        "api_token": api_token,
        "connected_at": datetime.utcnow().isoformat(),
        "inbound_routing": {
            "mode": inbound_mode,
            "fallback_number": fallback_number
        }
    }

    # Save to company doc
    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {
            "telephony": telephony_doc,
            "updated_at": datetime.utcnow()
        }}
    )

    # Upsert to phone_numbers registry for incoming call lookup
    await db.phone_numbers.update_one(
        {"phone_number": clean_num},
        {"$set": {
            "phone_number": clean_num,
            "company_id": company_id,
            "provider": provider,
            "status": "active",
            "inbound_mode": inbound_mode,
            "fallback_number": fallback_number,
            "updated_at": datetime.utcnow()
        }},
        upsert=True
    )

    return {
        "status": "success",
        "message": f"Successfully connected {provider.capitalize()} line {clean_num}",
        "line": {
            "provider": provider,
            "phone_number": clean_num,
            "account_sid_masked": mask_secret(account_sid),
            "status": "connected"
        }
    }

@telephony_router.post("/disconnect")
async def disconnect_telephony_line(current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    company_id = current_user["company_id"]

    company = await db.companies.find_one({"company_id": company_id})
    if company and company.get("telephony", {}).get("phone_number"):
        curr_num = company["telephony"]["phone_number"]
        await db.phone_numbers.update_one(
            {"phone_number": curr_num, "company_id": company_id},
            {"$set": {"status": "disconnected", "updated_at": datetime.utcnow()}}
        )

    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": {
            "telephony": {
                "mode": "shared",
                "provider": None,
                "phone_number": None,
                "connected_at": None
            },
            "updated_at": datetime.utcnow()
        }}
    )

    return {
        "status": "success",
        "message": "Disconnected custom line. Outbound calls will now use the Talkly shared number pool."
    }
