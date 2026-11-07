from fastapi import APIRouter, HTTPException, Depends, Body, Query
from datetime import datetime, timedelta
import uuid
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import mongodb
from auth import require_super_admin, get_password_hash
from industry_templates import INDUSTRY_TEMPLATES

access_requests_router = APIRouter()

# Talkly's own access requests always carry a string `id`. The same Mongo
# collection is also used by the unrelated hiring app (rows without `id`,
# lowercase statuses) - scope every query to ours only.
TALKLY_REQ = {"id": {"$exists": True}}

def send_email(to_email: str, subject: str, body: str, html_body: str = None):
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")
    
    if smtp_user and smtp_pass:
        try:
            msg = MIMEMultipart()
            msg['From'] = smtp_user
            msg['To'] = to_email
            msg['Subject'] = subject
            
            msg.attach(MIMEText(body, 'plain'))
            if html_body:
                msg.attach(MIMEText(html_body, 'html'))
                
            server = smtplib.SMTP(smtp_host, smtp_port)
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
            server.quit()
        except Exception as e:
            print(f"SMTP Error: {str(e)}")
    else:
        print(f"--- Simulating Email Send (SMTP config missing) ---")
        print(f"To: {to_email}\nSubject: {subject}\nBody: {body}\n")

@access_requests_router.post("")
async def create_access_request(payload: dict = Body(...)):
    db = mongodb.get_db()
    email = payload.get("email")
    company_name = payload.get("company_name")
    password = payload.get("password")
    
    if not email or not company_name or not password:
        raise HTTPException(status_code=400, detail="Missing required fields")
        
    # Check duplicate in users
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account already exists for this email. Please sign in.")
        
    # Check duplicate in companies
    if await db.companies.find_one({"name": company_name}):
        raise HTTPException(status_code=400, detail="An account for this company already exists.")
        
    # Check duplicate pending request
    if await db.access_requests.find_one({"email": email, "status": "PENDING"}):
        raise HTTPException(status_code=400, detail="Your access request is already under review.")
        
    if await db.access_requests.find_one({"company_name": company_name, "status": "PENDING"}):
        raise HTTPException(status_code=400, detail="An access request for this company is already under review.")

    request_id = str(uuid.uuid4())
    doc = {
        "id": request_id,
        "company_name": company_name,
        "contact_name": payload.get("contact_name", ""),
        "email": email,
        "phone": payload.get("phone", ""),
        "website": payload.get("website", ""),
        "industry": payload.get("industry", ""),
        "company_size": payload.get("company_size", ""),
        "expected_minutes": payload.get("expected_minutes", ""),
        "use_case": payload.get("use_case", ""),
        "message": payload.get("message", ""),
        "password_hash": get_password_hash(password),
        "status": "PENDING",
        "created_at": datetime.utcnow(),
    }
    await db.access_requests.insert_one(doc)
    
    return {"status": "success", "message": "Your access request has been submitted successfully."}

@access_requests_router.get("")
async def get_access_requests(
    status: str = Query("ALL"),
    search: str = Query(""),
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(require_super_admin)
):
    db = mongodb.get_db()

    query = dict(TALKLY_REQ)
    if status != "ALL":
        query["status"] = status

    if search:
        query["$or"] = [
            {"company_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"contact_name": {"$regex": search, "$options": "i"}},
        ]

    cursor = db.access_requests.find(query).sort("created_at", -1).skip(skip).limit(limit)
    requests = await cursor.to_list(length=limit)

    # Format dates and _id
    for req in requests:
        req["_id"] = str(req["_id"])

    total = await db.access_requests.count_documents(query)
    
    return {
        "items": requests,
        "total": total
    }

@access_requests_router.get("/stats")
async def get_access_request_stats(current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    
    pending = await db.access_requests.count_documents({**TALKLY_REQ, "status": "PENDING"})
    approved = await db.access_requests.count_documents({**TALKLY_REQ, "status": "APPROVED"})
    rejected = await db.access_requests.count_documents({**TALKLY_REQ, "status": "REJECTED"})
    total_companies = await db.companies.count_documents({})
    
    return {
        "pending": pending,
        "approved": approved,
        "rejected": rejected,
        "total_companies": total_companies
    }

@access_requests_router.post("/{req_id}/approve")
async def approve_access_request(req_id: str, current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    
    request = await db.access_requests.find_one({"id": req_id})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
        
    if request["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be approved")
        
    company_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    
    # 1. Update Request
    await db.access_requests.update_one(
        {"id": req_id},
        {"$set": {
            "status": "APPROVED",
            "reviewed_by": current_user["user_id"],
            "reviewed_at": datetime.utcnow()
        }}
    )
    
    now = datetime.utcnow()

    # 2. Create Company (dedicated tenant, no Bolna agent yet - super admin sets it later)
    req_industry = request.get("industry") or "real_estate"
    company_doc = {
        "company_id": company_id,
        "name": request["company_name"],
        "industry": req_industry,
        "plan_type": "trial",
        "status": "ACTIVE",
        "voice_engine": "bakbak",
        "conversation_engine": "decoupled",
        "use_sarvam_voice": True,
        "bolna_agent_id": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.companies.insert_one(company_doc)

    # 2b. Initialize default prompt and pre-seed all 6 industry presets for the company
    tmpl = INDUSTRY_TEMPLATES.get(req_industry, INDUSTRY_TEMPLATES.get("real_estate", {}))
    industry_prompts = {}
    for k, tmpl_data in INDUSTRY_TEMPLATES.items():
        is_chosen = (k == req_industry)
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
            "offering": "",
            "location": "",
            "variables": {},
            "status": "Published" if is_chosen else "Draft",
            "updated_at": now
        }

    if tmpl:
        await db.prompts.insert_one({
            "company_id": company_id,
            "industry": req_industry,
            "draft_prompt": tmpl.get("prompt", ""),
            "published_prompt": tmpl.get("prompt", ""),
            "draft_welcome_message": tmpl.get("welcome_message", ""),
            "published_welcome_message": tmpl.get("welcome_message", ""),
            "draft_inbound_prompt": tmpl.get("inbound_prompt", ""),
            "published_inbound_prompt": tmpl.get("inbound_prompt", ""),
            "draft_inbound_welcome_message": tmpl.get("inbound_welcome_message", ""),
            "published_inbound_welcome_message": tmpl.get("inbound_welcome_message", ""),
            "industry_prompts": industry_prompts,
            "offering": "",
            "location": "",
            "status": "Published",
            "created_at": now,
            "updated_at": now
        })

    # 3. Create the company admin user, bound to the new company_id.
    user_doc = {
        "user_id": user_id,
        "company_id": company_id,
        "name": request["contact_name"],
        "email": request["email"],
        "password_hash": request.get("password_hash", ""),
        "role": "company_admin",
        "is_active": True,
        "status": "ACTIVE",
        "created_at": now,
        "updated_at": now,
    }
    await db.users.insert_one(user_doc)
    
    # 4. Send Approval Email
    frontend_url = os.environ.get("NEXT_PUBLIC_FRONTEND_URL", "http://localhost:3000")
    login_link = f"{frontend_url}/login"
    
    email_body = f"""Hello {request['contact_name']},

Your company access request for TalklyAI has been approved!
You can now log in to your dashboard using the email and password you provided during registration.

Login here: {login_link}

Regards,
TalklyAI Team
Novalantis
"""
    send_email(
        to_email=request["email"],
        subject="Your TalklyAI account has been approved!",
        body=email_body
    )
    
    return {"status": "success", "message": "Request approved successfully"}

@access_requests_router.post("/{req_id}/reject")
async def reject_access_request(req_id: str, payload: dict = Body(...), current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    reason = payload.get("reason", "Not suitable at this time")
    
    request = await db.access_requests.find_one({"id": req_id})
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
        
    await db.access_requests.update_one(
        {"id": req_id},
        {"$set": {
            "status": "REJECTED",
            "rejection_reason": reason,
            "reviewed_by": current_user["user_id"],
            "reviewed_at": datetime.utcnow()
        }}
    )
    
    # Send Rejection Email
    email_body = f"""Hello {request['contact_name']},

Thank you for your interest in TalklyAI. Unfortunately, your access request was not approved at this time.

Regards,
TalklyAI Team
Novalantis
"""
    send_email(
        to_email=request["email"],
        subject="Update on your TalklyAI access request",
        body=email_body
    )
    
    return {"status": "success", "message": "Request rejected successfully"}
