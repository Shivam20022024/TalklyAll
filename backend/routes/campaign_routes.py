from fastapi import APIRouter, HTTPException, Depends, Body
from datetime import datetime
import uuid
import mongodb
from auth import (
    require_company_access,
    tenant_filter,
    enforce_no_foreign_company,
    stamp_company,
)

campaign_router = APIRouter()

@campaign_router.post("/campaigns")
async def create_campaign(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    enforce_no_foreign_company(current_user, payload)
    db = mongodb.get_db()
    name = payload.get("name")
    offering_name = payload.get("offering") or payload.get("property") or ""
    industry = payload.get("industry")
    if not industry:
        prompt_doc = await db.prompts.find_one({"company_id": current_user["company_id"]})
        if prompt_doc and prompt_doc.get("industry"):
            industry = prompt_doc.get("industry")
        else:
            comp = await db.companies.find_one({"company_id": current_user["company_id"]})
            industry = comp.get("industry") if comp else "general_sales"

    if not name:
        raise HTTPException(status_code=400, detail="Campaign name is required")

    campaign_id = str(uuid.uuid4())

    doc = {
        "campaign_id": campaign_id,
        "name": name,
        "industry": industry,
        "offering": offering_name,
        "property": offering_name,
        "created_at": datetime.utcnow(),
        "leads_count": 0,
        "calls_made": 0,
        "connected": 0,
        "interested": 0,
        "status": "Active",
        "progress": 0
    }
    stamp_company(current_user, doc)

    await db.campaigns.insert_one(doc)
    doc["_id"] = None
    return doc

@campaign_router.get("/campaigns")
async def list_campaigns(industry: str = None, current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    company_id = current_user["company_id"]
    query = tenant_filter(current_user)
    if industry and industry.lower() != "all":
        query["industry"] = industry.lower()
    campaigns = await db.campaigns.find(query).sort("created_at", -1).to_list(length=100)

    campaign_ids = [c.get("campaign_id") for c in campaigns if c.get("campaign_id")]

    # Bulk fetch leads counts (scoped to this company)
    leads_counts = {}
    converted_counts = {}
    pending_leads_counts = {}
    if campaign_ids:
        leads_cursor = db.leads.aggregate([
            {"$match": {"campaign_id": {"$in": campaign_ids}, "company_id": company_id}},
            {"$group": {
                "_id": "$campaign_id",
                "count": {"$sum": 1},
                "converted": {"$sum": {"$cond": [{"$in": ["$status", ["Converted", "converted"]]}, 1, 0]}},
                "pending": {"$sum": {"$cond": [{"$in": ["$status", ["New", "Calling"]]}, 1, 0]}}
            }}
        ])
        async for doc in leads_cursor:
            leads_counts[doc["_id"]] = doc["count"]
            converted_counts[doc["_id"]] = doc.get("converted", 0)
            pending_leads_counts[doc["_id"]] = doc.get("pending", 0)

    # Bulk fetch calls stats (scoped to this company)
    calls_stats = {}
    if campaign_ids:
        calls_cursor = db.calls.aggregate([
            {"$match": {"campaign_id": {"$in": campaign_ids}, "company_id": company_id}},
            {"$group": {
                "_id": "$campaign_id",
                "calls_made": {"$sum": 1},
                "connected": {"$sum": {"$cond": [{"$in": ["$status", ["Completed", "completed", "Analyzed"]]}, 1, 0]}},
                "interested": {"$sum": {"$cond": [{"$in": ["$analysis.lead_temperature", ["Warm", "Hot"]]}, 1, 0]}}
            }}
        ])
        async for doc in calls_cursor:
            calls_stats[doc["_id"]] = doc

    # Bulk prepare update operations to sync campaign stats
    from pymongo import UpdateOne
    bulk_updates = []

    for c in campaigns:
        c["_id"] = None
        campaign_id = c.get("campaign_id")

        if campaign_id:
            # Get stats from our bulk aggregation maps
            leads_count = leads_counts.get(campaign_id, 0)
            c_stats = calls_stats.get(campaign_id, {})
            calls_made = c_stats.get("calls_made", 0)
            connected = c_stats.get("connected", 0)
            lead_converted = converted_counts.get(campaign_id, 0)
            call_interested = c_stats.get("interested", 0)
            interested = max(call_interested, lead_converted)
            pending = pending_leads_counts.get(campaign_id, 0)

            # Auto-resolve status: When all leads in the campaign have been called/contacted
            # and no New/Calling leads remain, mark the campaign as Completed.
            current_status = c.get("status") or "Active"
            resolved_status = current_status
            if current_status != "Paused":
                if leads_count > 0 and pending == 0:
                    resolved_status = "Completed"
                elif pending > 0 and current_status == "Completed":
                    resolved_status = "Active"

            c["status"] = resolved_status
            c["leads"] = leads_count
            c["calls"] = calls_made
            c["connected"] = connected
            c["interested"] = interested
            c["bookings"] = interested

            # Queue for bulk update (scoped to company)
            bulk_updates.append(
                UpdateOne(
                    {"campaign_id": campaign_id, "company_id": company_id},
                    {"$set": {
                        "leads_count": leads_count,
                        "calls_made": calls_made,
                        "connected": connected,
                        "interested": interested,
                        "status": resolved_status
                    }}
                )
            )
        else:
            c["leads"] = c.get("leads_count", 0)
            c["calls"] = c.get("calls_made", 0)
            c["connected"] = c.get("connected", 0)
            c["interested"] = c.get("interested", 0)
            c["bookings"] = c.get("interested", 0)

        # Calculate conversion for UI based on connected/interested
        if c.get("connected", 0) > 0:
            c["conversion"] = f"{round((c['interested'] / c['connected']) * 100, 1)}%"
        elif c.get("leads", 0) > 0 and c.get("interested", 0) > 0:
            c["conversion"] = f"{round((c['interested'] / c['leads']) * 100, 1)}%"
        else:
            c["conversion"] = "0%"

    if bulk_updates:
        # Execute the background sync in a single DB call
        await db.campaigns.bulk_write(bulk_updates)

    return campaigns


@campaign_router.patch("/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    enforce_no_foreign_company(current_user, payload)
    db = mongodb.get_db()
    allowed = {k: payload[k] for k in ("name", "property", "status", "progress") if k in payload}
    if not allowed:
        raise HTTPException(status_code=400, detail="No updatable fields provided")
    allowed["updated_at"] = datetime.utcnow()
    result = await db.campaigns.update_one(
        tenant_filter(current_user, {"campaign_id": campaign_id}),
        {"$set": allowed},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"status": "success"}


@campaign_router.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    result = await db.campaigns.delete_one(tenant_filter(current_user, {"campaign_id": campaign_id}))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"status": "success"}


@campaign_router.post("/campaigns/delete-bulk")
async def delete_bulk_campaigns(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    campaign_ids = payload.get("campaign_ids", [])
    if not campaign_ids:
        return {"status": "success", "deleted_count": 0}

    result = await db.campaigns.delete_many(tenant_filter(current_user, {"campaign_id": {"$in": campaign_ids}}))
    return {"status": "success", "deleted_count": result.deleted_count}


@campaign_router.post("/campaigns/status-bulk")
async def update_bulk_campaign_status(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    campaign_ids = payload.get("campaign_ids", [])
    new_status = payload.get("status")
    if not campaign_ids or not new_status:
        raise HTTPException(status_code=400, detail="campaign_ids and status are required")

    result = await db.campaigns.update_many(
        tenant_filter(current_user, {"campaign_id": {"$in": campaign_ids}}),
        {"$set": {"status": new_status, "updated_at": datetime.utcnow()}}
    )
    return {"status": "success", "modified_count": result.modified_count}
