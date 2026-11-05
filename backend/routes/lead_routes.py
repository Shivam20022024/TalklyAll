from fastapi import APIRouter, HTTPException, Depends, Body, UploadFile, File, Form
from datetime import datetime
import uuid
import csv
import io
import mongodb
from auth import (
    require_company_access,
    tenant_filter,
    enforce_no_foreign_company,
    stamp_company,
)

lead_router = APIRouter()

@lead_router.post("/leads")
async def create_lead(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    enforce_no_foreign_company(current_user, payload)
    name = payload.get("name")
    phone = payload.get("phone")
    campaign_id = payload.get("campaign_id")

    if not phone:
        raise HTTPException(status_code=400, detail="Phone is required")

    db = mongodb.get_db()
    lead_id = str(uuid.uuid4())

    offering = payload.get("offering") or payload.get("property") or ""
    location = payload.get("location") or payload.get("city") or ""
    custom_fields = payload.get("custom_fields") or {}

    industry = payload.get("industry")
    if not industry and campaign_id:
        camp = await db.campaigns.find_one({"campaign_id": campaign_id, "company_id": current_user["company_id"]})
        if camp:
            industry = camp.get("industry")
    if not industry:
        comp = await db.companies.find_one({"company_id": current_user["company_id"]})
        if comp:
            industry = comp.get("industry", "general_sales")

    doc = {
        "lead_id": lead_id,
        "campaign_id": campaign_id,
        "name": name or "Unknown",
        "phone": phone,
        "offering": offering,
        "property": offering,
        "location": location,
        "industry": industry,
        "custom_fields": custom_fields,
        "status": "New",
        "aiScore": 0,
        "lastContact": None,
        "created_at": datetime.utcnow()
    }
    stamp_company(current_user, doc)

    await db.leads.insert_one(doc)
    doc["_id"] = None
    return doc

@lead_router.post("/leads/upload")
async def upload_leads_csv(
    file: UploadFile = File(...),
    campaign_id: str = Form(None),
    current_user: dict = Depends(require_company_access)
):
    import openpyxl

    if not (file.filename.endswith('.csv') or file.filename.endswith('.xlsx')):
        raise HTTPException(status_code=400, detail="Only CSV and Excel (.xlsx) files are supported")

    content = await file.read()

    if file.filename.endswith('.csv'):
        text = content.decode('utf-8', errors='replace')
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    else:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        sheet = wb.active
        headers = [cell.value for cell in sheet[1]]
        rows = []
        for row in sheet.iter_rows(min_row=2, values_only=True):
            row_dict = {headers[i]: val for i, val in enumerate(row) if i < len(headers) and headers[i]}
            rows.append(row_dict)

    db = mongodb.get_db()
    company_id = current_user["company_id"]

    # If a campaign_id is supplied, verify it belongs to this company.
    campaign_industry = None
    if campaign_id:
        owned = await db.campaigns.find_one({"campaign_id": campaign_id, "company_id": company_id})
        if not owned:
            raise HTTPException(status_code=404, detail="Campaign not found")
        campaign_industry = owned.get("industry")
    
    if not campaign_industry:
        comp = await db.companies.find_one({"company_id": company_id})
        if comp:
            campaign_industry = comp.get("industry", "general_sales")

    docs = []

    for row in rows:
        # Generic matching for name and phone columns
        name = row.get("Name") or row.get("name") or row.get("Customer Name") or "Unknown"
        phone = row.get("Phone") or row.get("phone") or row.get("Phone Number")

        if not phone:
            continue

        offering = (
            row.get("Offering") or row.get("offering") or 
            row.get("Product") or row.get("product") or 
            row.get("Service") or row.get("service") or 
            row.get("Course") or row.get("course") or 
            row.get("Program") or row.get("program") or 
            row.get("Property") or row.get("property") or 
            row.get("Loan Type") or row.get("loan type") or row.get("Loan") or row.get("loan") or 
            row.get("Specialty") or row.get("specialty") or row.get("Doctor") or row.get("doctor") or 
            row.get("Plan") or row.get("plan") or ""
        )
        location = row.get("Location") or row.get("location") or row.get("City") or row.get("city") or ""
        row_industry = row.get("industry") or row.get("Industry") or campaign_industry

        # Collect any extra columns into custom_fields for dynamic prompt variable injection
        reserved_keys = {
            "name", "phone", "customer name", "phone number", 
            "property", "offering", "product", "service", "course", "program",
            "loan type", "loan", "specialty", "doctor", "plan",
            "location", "city", "industry"
        }
        custom_fields = {str(k): v for k, v in row.items() if str(k).strip().lower() not in reserved_keys and v is not None}

        docs.append({
            "lead_id": str(uuid.uuid4()),
            "company_id": company_id,
            "campaign_id": campaign_id,
            "name": name,
            "phone": phone,
            "offering": offering,
            "property": offering,
            "location": location,
            "industry": row_industry,
            "custom_fields": custom_fields,
            "status": "New",
            "aiScore": 0,
            "lastContact": None,
            "created_at": datetime.utcnow()
        })

    if docs:
        await db.leads.insert_many(docs)
        if campaign_id:
            await db.campaigns.update_one(
                {"campaign_id": campaign_id, "company_id": company_id},
                {"$inc": {"leads_count": len(docs)}}
            )

    return {"status": "success", "inserted_count": len(docs)}

@lead_router.get("/leads")
async def list_leads(campaign_id: str = None, range: str = None, industry: str = None, current_user: dict = Depends(require_company_access)):
    from datetime import timedelta
    db = mongodb.get_db()
    query = tenant_filter(current_user)

    if campaign_id:
        query["campaign_id"] = campaign_id

    if industry and industry.lower() != "all":
        query["industry"] = industry.lower()

    if range and range != "All Time":
        today = datetime.utcnow()
        if range == "Today":
            start_date = today.replace(hour=0, minute=0, second=0, microsecond=0)
        elif range == "7 Days":
            start_date = (today - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif range == "30 Days":
            start_date = (today - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif range == "90 Days":
            start_date = (today - timedelta(days=90)).replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            start_date = None

        if start_date:
            query["$or"] = [
                {"created_at": {"$gte": start_date}},
                {"lastContact": {"$gte": start_date.isoformat()}}
            ]

    # Sort by most recent activity (lastContact), not just when the lead
    # record was first created - confirmed live: a lead that's called again
    # weeks after it was first added (e.g. a reused Quick Call match) kept
    # sorting by its original creation date, burying it far below leads
    # created more recently but never actually contacted since. Leads with
    # no lastContact yet (nulls) sort last automatically, falling back to
    # created_at order among themselves.
    leads = await db.leads.find(query).sort([("lastContact", -1), ("created_at", -1)]).to_list(length=200)

    for l in leads:
        l["_id"] = None

    return leads

@lead_router.delete("/leads")
async def delete_all_leads(current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    result = await db.leads.delete_many(tenant_filter(current_user))
    return {"status": "success", "deleted_count": result.deleted_count}

@lead_router.post("/leads/delete-bulk")
async def delete_bulk_leads(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    lead_ids = payload.get("lead_ids", [])
    if not lead_ids:
        return {"status": "success", "deleted_count": 0}

    result = await db.leads.delete_many(tenant_filter(current_user, {"lead_id": {"$in": lead_ids}}))
    return {"status": "success", "deleted_count": result.deleted_count}
