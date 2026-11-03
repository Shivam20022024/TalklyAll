"""Super-admin only routes.

Every endpoint here is gated by :func:`auth.require_super_admin`. Company context
is taken from the URL path (``/companies/{company_id}/...``) and validated against
the database - a super admin never has to touch Mongo to switch context, and a
company admin can never reach these routes.
"""
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from datetime import datetime
import uuid

import mongodb
from auth import require_super_admin, get_password_hash, normalize_role

admin_router = APIRouter()


async def _require_company(db, company_id: str) -> dict:
    company = await db.companies.find_one({"company_id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def _clean(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


# --- Platform dashboard -------------------------------------------------------

@admin_router.get("/dashboard")
async def platform_dashboard(current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()

    total_companies = await db.companies.count_documents({})
    active_companies = await db.companies.count_documents({"status": "ACTIVE"})
    total_users = await db.users.count_documents({"user_id": {"$exists": True}})
    total_campaigns = await db.campaigns.count_documents({})
    total_leads = await db.leads.count_documents({})
    total_calls = await db.calls.count_documents({})
    interested_leads = await db.leads.count_documents({"status": {"$in": ["Interested", "Qualified"]}})
    conversions = await db.leads.count_documents({"status": "Converted"})

    revenue_agg = await db.transactions.aggregate([
        {"$match": {"type": "CREDIT", "status": "COMPLETED"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(length=1)
    spend_agg = await db.usage_records.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$customer_cost"}}},
    ]).to_list(length=1)

    return {
        "status": "success",
        "data": {
            "total_companies": total_companies,
            "active_companies": active_companies,
            "total_users": total_users,
            "total_campaigns": total_campaigns,
            "total_leads": total_leads,
            "total_calls": total_calls,
            "interested_leads": interested_leads,
            "conversions": conversions,
            "revenue": round((revenue_agg[0]["total"] if revenue_agg else 0), 2),
            "usage_spend": round((spend_agg[0]["total"] if spend_agg else 0), 2),
        },
    }


# Legacy alias used by the old frontend build.
@admin_router.get("/dashboard-stats")
async def dashboard_stats(current_user: dict = Depends(require_super_admin)):
    res = await platform_dashboard(current_user)
    d = res["data"]
    return {"status": "success", "data": {
        "Total Companies": d["total_companies"],
        "Active Companies": d["active_companies"],
        "Total Users": d["total_users"],
        "Total Leads": d["total_leads"],
        "Total Calls": d["total_calls"],
        "Conversions": d["conversions"],
    }}


# --- Companies --------------------------------------------------------------

@admin_router.get("/companies")
async def list_companies(
    search: str = Query(""),
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(require_super_admin),
):
    db = mongodb.get_db()
    match: dict = {}
    if search:
        match["name"] = {"$regex": search, "$options": "i"}

    pipeline = [
        {"$match": match},
        {"$lookup": {"from": "users", "localField": "company_id", "foreignField": "company_id", "as": "users"}},
        {"$lookup": {"from": "calls", "localField": "company_id", "foreignField": "company_id", "as": "calls"}},
        {"$lookup": {"from": "leads", "localField": "company_id", "foreignField": "company_id", "as": "leads"}},
        {"$project": {
            "_id": {"$toString": "$_id"},
            "company_id": 1, "name": 1, "status": 1, "bolna_agent_id": 1,
            "created_at": 1, "updated_at": 1,
            "stats": {
                "users": {"$size": "$users"},
                "calls": {"$size": "$calls"},
                "leads": {"$size": "$leads"},
            },
        }},
        {"$sort": {"created_at": -1}},
        {"$skip": skip},
        {"$limit": limit},
    ]
    companies = [c async for c in db.companies.aggregate(pipeline)]
    total = await db.companies.count_documents(match)
    return {"status": "success", "data": companies, "total": total}


@admin_router.post("/companies")
async def create_company(payload: dict = Body(...), current_user: dict = Depends(require_super_admin)):
    company_name = payload.get("company_name") or payload.get("name")
    email = payload.get("email")
    password = payload.get("password")
    user_name = payload.get("user_name") or payload.get("name")

    if not all([company_name, email, password, user_name]):
        raise HTTPException(status_code=400, detail="Missing required fields")

    db = mongodb.get_db()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    company_id = str(uuid.uuid4())
    now = datetime.utcnow()
    await db.companies.insert_one({
        "company_id": company_id, "name": company_name, "status": "ACTIVE",
        "bolna_agent_id": None, "plan_type": "trial", "created_at": now, "updated_at": now,
    })
    await db.users.insert_one({
        "user_id": str(uuid.uuid4()), "company_id": company_id, "name": user_name,
        "email": email, "password_hash": get_password_hash(password),
        "role": "company_admin", "is_active": True, "created_at": now, "updated_at": now,
    })
    return {"status": "success", "company_id": company_id}


@admin_router.get("/companies/{company_id}")
async def get_company(company_id: str, current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    company = _clean(await _require_company(db, company_id))
    return {"status": "success", "data": company}


@admin_router.patch("/companies/{company_id}")
async def update_company(company_id: str, payload: dict = Body(...), current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    await _require_company(db, company_id)
    allowed = {k: payload[k] for k in ("name", "status", "bolna_agent_id", "plan_type", "use_sarvam_voice") if k in payload}
    if "status" in allowed and allowed["status"] not in ("ACTIVE", "SUSPENDED", "TRIAL", "INACTIVE"):
        raise HTTPException(status_code=400, detail="Invalid status")
    if not allowed:
        raise HTTPException(status_code=400, detail="No updatable fields provided")
    allowed["updated_at"] = datetime.utcnow()
    await db.companies.update_one({"company_id": company_id}, {"$set": allowed})
    return {"status": "success"}


@admin_router.post("/companies/{company_id}/activate")
async def activate_company(company_id: str, current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    await _require_company(db, company_id)
    await db.companies.update_one({"company_id": company_id}, {"$set": {"status": "ACTIVE", "updated_at": datetime.utcnow()}})
    return {"status": "success"}


@admin_router.post("/companies/{company_id}/deactivate")
async def deactivate_company(company_id: str, current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    await _require_company(db, company_id)
    await db.companies.update_one({"company_id": company_id}, {"$set": {"status": "SUSPENDED", "updated_at": datetime.utcnow()}})
    return {"status": "success"}


# Legacy status endpoint.
@admin_router.post("/companies/{company_id}/status")
async def set_company_status(company_id: str, payload: dict = Body(...), current_user: dict = Depends(require_super_admin)):
    return await update_company(company_id, {"status": payload.get("status")}, current_user)


# --- Company-scoped views --------------------------------------------------

@admin_router.get("/companies/{company_id}/overview")
async def company_overview(company_id: str, current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    await _require_company(db, company_id)
    from services.intelligence_service import IntelligenceService
    metrics = await IntelligenceService().get_overall_dashboard_metrics(db, company_id)
    return {"status": "success", "data": metrics}


@admin_router.get("/companies/{company_id}/analytics")
async def company_analytics(company_id: str, range: str = "30 Days", current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    await _require_company(db, company_id)
    from services.intelligence_service import IntelligenceService
    metrics = await IntelligenceService().get_dashboard_metrics(db, company_id, range)
    return {"status": "success", "data": metrics}


@admin_router.get("/companies/{company_id}/users")
async def company_users(company_id: str, current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    await _require_company(db, company_id)
    users = []
    async for u in db.users.find({"company_id": company_id}, {"password_hash": 0}):
        users.append(_clean(u))
    return {"status": "success", "data": users}


@admin_router.get("/companies/{company_id}/calls")
async def company_calls(company_id: str, skip: int = 0, limit: int = 50, current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    await _require_company(db, company_id)
    calls = []
    async for c in db.calls.find({"company_id": company_id}).sort("created_at", -1).skip(skip).limit(limit):
        c["_id"] = None
        calls.append(c)
    return {"status": "success", "data": calls}


@admin_router.get("/companies/{company_id}/campaigns")
async def company_campaigns(company_id: str, current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    await _require_company(db, company_id)
    campaigns = []
    async for c in db.campaigns.find({"company_id": company_id}).sort("created_at", -1):
        c["_id"] = None
        campaigns.append(c)
    return {"status": "success", "data": campaigns}


@admin_router.get("/companies/{company_id}/leads")
async def company_leads(company_id: str, skip: int = 0, limit: int = 100, current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    await _require_company(db, company_id)
    leads = []
    async for l in db.leads.find({"company_id": company_id}).sort("created_at", -1).skip(skip).limit(limit):
        l["_id"] = None
        leads.append(l)
    return {"status": "success", "data": leads}


@admin_router.get("/companies/{company_id}/billing")
async def company_billing(company_id: str, current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    await _require_company(db, company_id)
    from services.billing_service import billing_service
    wallet = await billing_service.get_dashboard_data(db, company_id)
    usage = []
    async for u in db.usage_records.find({"company_id": company_id}).sort("created_at", -1).limit(50):
        u["_id"] = None
        usage.append(u)
    return {"status": "success", "data": {"wallet": wallet, "usage": usage}}


@admin_router.post("/companies/{company_id}/reconcile-wallet")
async def reconcile_company_wallet(company_id: str, current_user: dict = Depends(require_super_admin)):
    """Recompute this company's wallet.balance from its own transaction
    ledger and correct any drift (e.g. left over from the pre-$inc race
    condition). Safe to call repeatedly - a no-op once balance matches."""
    db = mongodb.get_db()
    await _require_company(db, company_id)
    from services.billing_service import billing_service
    result = await billing_service.reconcile_wallet(db, company_id)
    return {"status": "success", "data": result}


@admin_router.get("/companies/{company_id}/prompt")
async def company_prompt(company_id: str, current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    await _require_company(db, company_id)
    doc = await db.prompts.find_one({"company_id": company_id})
    if not doc:
        return {"status": "success", "data": {"prompt": None, "welcome_message": None, "prompt_status": "Draft"}}
    return {"status": "success", "data": {
        "prompt": doc.get("draft_prompt") or doc.get("prompt"),
        "welcome_message": doc.get("draft_welcome_message") or doc.get("welcome_message"),
        "published_prompt": doc.get("published_prompt"),
        "prompt_status": doc.get("status", "Published" if doc.get("published_prompt") else "Draft"),
    }}


@admin_router.put("/companies/{company_id}/prompt")
async def update_company_prompt(company_id: str, payload: dict = Body(...), current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    await _require_company(db, company_id)
    await db.prompts.update_one(
        {"company_id": company_id},
        {"$set": {
            "draft_prompt": payload.get("prompt"),
            "draft_welcome_message": payload.get("welcome_message"),
            "status": "Draft",
            "updated_at": datetime.utcnow(),
        }},
        upsert=True,
    )
    return {"status": "success"}


# --- Users -----------------------------------------------------------------

@admin_router.get("/users")
async def list_users(current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    pipeline = [
        {"$match": {"user_id": {"$exists": True}}},
        {"$lookup": {"from": "companies", "localField": "company_id", "foreignField": "company_id", "as": "company_info"}},
        {"$unwind": {"path": "$company_info", "preserveNullAndEmptyArrays": True}},
        {"$project": {
            "_id": {"$toString": "$_id"},
            "user_id": 1, "name": 1, "email": 1, "role": 1, "company_id": 1,
            "is_active": 1, "created_at": 1,
            "company_name": "$company_info.name",
        }},
        {"$sort": {"created_at": -1}},
    ]
    users = [u async for u in db.users.aggregate(pipeline)]
    for u in users:
        u["role"] = normalize_role(u.get("role"))
    return {"status": "success", "data": users}


@admin_router.patch("/users/{user_id}")
async def update_user(user_id: str, payload: dict = Body(...), current_user: dict = Depends(require_super_admin)):
    db = mongodb.get_db()
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    allowed = {}
    if "is_active" in payload:
        allowed["is_active"] = bool(payload["is_active"])
    if "role" in payload:
        allowed["role"] = normalize_role(payload["role"])
    if not allowed:
        raise HTTPException(status_code=400, detail="No updatable fields provided")
    allowed["updated_at"] = datetime.utcnow()
    await db.users.update_one({"user_id": user_id}, {"$set": allowed})
    return {"status": "success"}
