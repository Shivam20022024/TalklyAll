import uuid
import datetime
from fastapi import APIRouter, HTTPException, Depends, Body
import mongodb
from auth import require_company_access
from services.livekit_service import livekit_service

livekit_router = APIRouter(prefix="/api/v1/livekit", tags=["livekit"])

@livekit_router.get("/settings")
async def get_livekit_settings(current_user: dict = Depends(require_company_access)):
    """Retrieves LiveKit configuration with masked secret."""
    db = mongodb.get_db()
    company = await db.companies.find_one({"company_id": current_user["company_id"]})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    creds = livekit_service.get_credentials(company)
    secret = creds["api_secret"]
    masked_secret = f"••••••••••••••••{secret[-4:]}" if len(secret) > 8 else ("" if not secret else "••••••••")

    return {
        "status": "success",
        "config": {
            "url": creds["url"],
            "api_key": creds["api_key"],
            "has_secret": bool(secret),
            "masked_secret": masked_secret
        }
    }

@livekit_router.patch("/settings")
async def update_livekit_settings(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    """Updates company LiveKit Cloud or Server credentials."""
    db = mongodb.get_db()
    company = await db.companies.find_one({"company_id": current_user["company_id"]})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    current_cfg = company.get("livekit_config") or {}

    new_cfg = {
        "url": str(payload.get("url", current_cfg.get("url", ""))).strip(),
        "api_key": str(payload.get("api_key", current_cfg.get("api_key", ""))).strip(),
        "updated_at": datetime.datetime.utcnow().isoformat()
    }

    # Only overwrite secret if provided and not masked
    secret = payload.get("api_secret")
    if secret and not str(secret).startswith("••••"):
        new_cfg["api_secret"] = str(secret).strip()
    elif "api_secret" in current_cfg:
        new_cfg["api_secret"] = current_cfg["api_secret"]

    await db.companies.update_one(
        {"company_id": current_user["company_id"]},
        {"$set": {"livekit_config": new_cfg}}
    )

    return {"status": "success", "message": "LiveKit settings updated successfully"}

@livekit_router.post("/token")
async def generate_playground_token(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    """
    Generates a LiveKit room token for in-browser real-time AI testing.
    Stores the active test prompt and greeting in the room metadata so the Voice Agent worker can pick it up.
    """
    db = mongodb.get_db()
    company = await db.companies.find_one({"company_id": current_user["company_id"]})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    creds = livekit_service.get_credentials(company)
    if not creds["url"] or not creds["api_key"] or not creds["api_secret"]:
        raise HTTPException(
            status_code=400,
            detail="LiveKit credentials are not configured. Please add your LiveKit URL, API Key, and API Secret in Settings."
        )

    # Unique room for this in-browser test session
    session_id = uuid.uuid4().hex[:8]
    room_name = f"playground-{current_user['company_id'][:8]}-{session_id}"
    participant_identity = f"user-{current_user.get('user_id', session_id)[:8]}"
    participant_name = current_user.get("name") or "Tester"

    # Extract dynamic test context
    prompt_doc = await db.prompts.find_one({"company_id": current_user["company_id"]})
    system_prompt = payload.get("prompt") or (prompt_doc.get("published_prompt") if prompt_doc else None) or company.get("custom_prompt") or "You are a helpful AI voice assistant."
    welcome_message = payload.get("welcome_message") or (prompt_doc.get("published_welcome_message") if prompt_doc else None) or company.get("custom_welcome") or "Hi! How can I help you today?"
    industry = payload.get("industry") or (prompt_doc.get("industry") if prompt_doc else None) or company.get("industry") or "general_sales"

    # Store playground session context in MongoDB so LiveKit agent worker can load it upon joining
    await db.livekit_sessions.update_one(
        {"room_name": room_name},
        {"$set": {
            "room_name": room_name,
            "company_id": current_user["company_id"],
            "system_prompt": system_prompt,
            "welcome_message": welcome_message,
            "industry": industry,
            "created_at": datetime.datetime.utcnow().isoformat(),
            "status": "active"
        }},
        upsert=True
    )

    token = livekit_service.generate_token(
        room_name=room_name,
        participant_identity=participant_identity,
        participant_name=participant_name,
        api_key=creds["api_key"],
        api_secret=creds["api_secret"]
    )

    return {
        "status": "success",
        "room_name": room_name,
        "token": token,
        "livekit_url": creds["url"],
        "participant_identity": participant_identity
    }
