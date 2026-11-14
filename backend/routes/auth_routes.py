import re
from fastapi import APIRouter, HTTPException, Depends, Body
from datetime import datetime
import os
import uuid
import mongodb
from auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    normalize_role,
    ROLE_SUPER_ADMIN,
    require_company_access,
)
from industry_templates import INDUSTRY_TEMPLATES

auth_router = APIRouter()


def _self_register_enabled() -> bool:
    val = os.environ.get("ALLOW_SELF_REGISTER")
    if val is None:
        return True # Default to self-serve enabled for rapid onboarding
    return str(val).strip().lower() in ("1", "true", "yes", "on")


@auth_router.post("/register")
async def register_company(payload: dict = Body(...)):
    """Public sign-up.

    By default this does NOT create an active company - it files a pending
    ``access_requests`` row so a super admin can review it (preserving the
    Request Access workflow). Set ``ALLOW_SELF_REGISTER=true`` to restore instant
    self-service company creation.
    """
    company_name = payload.get("company_name")
    email = payload.get("email")
    password = payload.get("password")
    user_name = payload.get("name")

    if not all([company_name, email, password, user_name]):
        raise HTTPException(status_code=400, detail="Missing required fields")

    db = mongodb.get_db()

    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    if not _self_register_enabled():
        if await db.access_requests.find_one({"email": email, "status": "PENDING"}):
            raise HTTPException(status_code=400, detail="Your access request is already under review.")
        await db.access_requests.insert_one({
            "id": str(uuid.uuid4()),
            "company_name": company_name,
            "contact_name": user_name,
            "email": email,
            "password_hash": get_password_hash(password),
            "status": "PENDING",
            "source": "self_register",
            "created_at": datetime.utcnow(),
        })
        return {
            "status": "pending_review",
            "message": "Your request has been submitted and is pending approval.",
        }

    company_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    now = datetime.utcnow()
    industry = payload.get("industry") or "general_sales"
    tmpl = INDUSTRY_TEMPLATES.get(industry, INDUSTRY_TEMPLATES.get("general_sales"))

    await db.companies.insert_one({
        "company_id": company_id,
        "name": company_name,
        "industry": industry,
        "plan_type": "trial",
        "status": "ACTIVE",
        "voice_engine": "bakbak",
        "conversation_engine": "decoupled",
        "use_sarvam_voice": True,
        "bolna_agent_id": None,
        "webhook_url": payload.get("webhook_url", ""),
        "created_at": now,
        "updated_at": now,
    })
    await db.users.insert_one({
        "user_id": user_id,
        "company_id": company_id,
        "name": user_name,
        "email": email,
        "password_hash": get_password_hash(password),
        "role": "company_admin",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    })

    # Initialize default prompt from industry template and pre-seed all 6 industry presets
    industry_prompts = {}
    for k, tmpl_data in INDUSTRY_TEMPLATES.items():
        is_chosen = (k == industry)
        industry_prompts[k] = {
            "prompt": tmpl_data.get("prompt", ""),
            "welcome_message": tmpl_data.get("welcome_message", ""),
            "draft_prompt": tmpl_data.get("prompt", ""),
            "draft_welcome_message": tmpl_data.get("welcome_message", ""),
            "published_prompt": tmpl_data.get("prompt", ""),
            "published_welcome_message": tmpl_data.get("welcome_message", ""),
            "inbound_prompt": tmpl_data.get("inbound_prompt", ""),
            "inbound_welcome_message": tmpl_data.get("inbound_welcome_message", ""),
            "draft_inbound_prompt": tmpl_data.get("inbound_prompt", ""),
            "draft_inbound_welcome_message": tmpl_data.get("inbound_welcome_message", ""),
            "published_inbound_prompt": tmpl_data.get("inbound_prompt", ""),
            "published_inbound_welcome_message": tmpl_data.get("inbound_welcome_message", ""),
            "offering": payload.get("offering", "") if is_chosen else "",
            "location": payload.get("location", "") if is_chosen else "",
            "variables": {},
            "status": "Published" if is_chosen else "Draft",
            "updated_at": now
        }

    if tmpl:
        await db.prompts.insert_one({
            "company_id": company_id,
            "industry": industry,
            "draft_prompt": tmpl["prompt"],
            "published_prompt": tmpl["prompt"],
            "draft_welcome_message": tmpl["welcome_message"],
            "published_welcome_message": tmpl["welcome_message"],
            "draft_inbound_prompt": tmpl.get("inbound_prompt", ""),
            "published_inbound_prompt": tmpl.get("inbound_prompt", ""),
            "draft_inbound_welcome_message": tmpl.get("inbound_welcome_message", ""),
            "published_inbound_welcome_message": tmpl.get("inbound_welcome_message", ""),
            "industry_prompts": industry_prompts,
            "offering": payload.get("offering", ""),
            "location": payload.get("location", ""),
            "status": "Published",
            "created_at": now,
            "updated_at": now
        })

    # No cash grant on signup: new companies get TRIAL_FREE_SECONDS (10 min)
    # of genuinely free calling, metered directly in process_call_billing()
    # and check_call_allowance() rather than approximated as a rupee credit.

    access_token = create_access_token(data={"sub": user_id, "email": email})
    return {
        "status": "success",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "name": user_name,
            "email": email,
            "role": "company_admin",
            "company_id": company_id,
            "company_name": company_name,
            "industry": industry
        },
    }


@auth_router.post("/login")
async def login(payload: dict = Body(...)):
    raw_email = payload.get("email")
    raw_password = payload.get("password")

    if not raw_email or not raw_password:
        raise HTTPException(status_code=400, detail="Missing email or password")

    clean_email = str(raw_email).strip().lower()
    clean_password = str(raw_password).strip()

    db = mongodb.get_db()
    # Case-insensitive and whitespace-tolerant email lookup
    user = await db.users.find_one({"email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}})
    if not user:
        user = await db.users.find_one({"email": raw_email})

    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    email = user.get("email") or clean_email

    # Verify password with clean password first, then raw password
    p_hash = user.get("password_hash", "")
    if not (verify_password(clean_password, p_hash) or verify_password(raw_password, p_hash)):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.get("is_active") is False or user.get("status") == "PENDING_ACTIVATION":
        raise HTTPException(status_code=401, detail="Your account is not active yet. Please contact support.")

    role = normalize_role(user.get("role")) or "company_admin"
    company_id = None if role == ROLE_SUPER_ADMIN else user.get("company_id")

    company_name = "Platform" if role == ROLE_SUPER_ADMIN else "Unknown"
    industry = None
    if company_id:
        company = await db.companies.find_one({"company_id": company_id})
        if company:
            company_name = company.get("name", "Unknown")
            industry = company.get("industry") or "healthcare"

    # The token only needs to identify the user; role/company are re-resolved from
    # the DB on every request by auth.get_current_user.
    access_token = create_access_token(data={"sub": user["user_id"], "email": email})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["user_id"],
            "name": user.get("name"),
            "email": email,
            "role": role,
            "company_id": company_id,
            "company_name": company_name,
            "industry": industry,
        },
    }


@auth_router.post("/activate")
async def activate_account(payload: dict = Body(...)):
    token = payload.get("token")
    password = payload.get("password")

    if not token or not password:
        raise HTTPException(status_code=400, detail="Missing token or password")

    db = mongodb.get_db()
    token_doc = await db.activation_tokens.find_one({"token": token, "used": False})

    if not token_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired activation link.")

    if datetime.utcnow() > token_doc["expires_at"]:
        raise HTTPException(status_code=400, detail="Your activation link has expired. Please contact support.")

    user_id = token_doc["user_id"]

    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "password_hash": get_password_hash(password),
            "status": "ACTIVE",
            "is_active": True,
            "updated_at": datetime.utcnow(),
        }},
    )
    await db.activation_tokens.update_one({"token": token}, {"$set": {"used": True}})

    return {"status": "success", "message": "Account activated successfully."}


@auth_router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    db = mongodb.get_db()
    company_name = "Platform" if current_user["role"] == ROLE_SUPER_ADMIN else None
    industry = None
    if current_user.get("company_id"):
        company = await db.companies.find_one({"company_id": current_user["company_id"]})
        if company:
            company_name = company.get("name")
            industry = company.get("industry") or "healthcare"
    return {
        "id": current_user["user_id"],
        "user_id": current_user["user_id"],
        "name": current_user.get("name"),
        "email": current_user.get("email"),
        "role": current_user["role"],
        "company_id": current_user.get("company_id"),
        "company_name": company_name,
        "industry": industry,
        "is_active": current_user.get("is_active", True),
    }

@auth_router.get("/company-settings")
async def get_company_settings(current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    company = await db.companies.find_one({"company_id": current_user["company_id"]})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    prompt_doc = await db.prompts.find_one({"company_id": current_user["company_id"]})
    effective_industry = company.get("industry") or (prompt_doc or {}).get("industry") or "real_estate"

    custom_name = None
    if prompt_doc and "custom_templates" in prompt_doc:
        for t in prompt_doc.get("custom_templates", []):
            if t.get("id") == effective_industry:
                custom_name = t.get("name")
                break

    return {
        "status": "success",
        "company": {
            "company_id": company.get("company_id"),
            "name": company.get("name"),
            "industry": effective_industry,
            "custom_industry_name": custom_name,
            "offering": company.get("offering") or (prompt_doc or {}).get("offering", ""),
            "webhook_url": company.get("webhook_url", ""),
            "plan_type": company.get("plan_type", "trial")
        }
    }

@auth_router.patch("/company-settings")
async def update_company_settings(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    update_fields = {}
    if "name" in payload:
        update_fields["name"] = payload["name"]
    if "industry" in payload:
        update_fields["industry"] = payload["industry"]
    if "webhook_url" in payload:
        update_fields["webhook_url"] = payload["webhook_url"]
    
    if update_fields:
        update_fields["updated_at"] = datetime.utcnow()
        await db.companies.update_one(
            {"company_id": current_user["company_id"]},
            {"$set": update_fields}
        )
    return {"status": "success", "message": "Company settings updated successfully."}
