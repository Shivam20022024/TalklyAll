from datetime import datetime, timedelta
import asyncio
from typing import Dict, Any, List

class IntelligenceService:
    """
    Service for calculating AI Business Intelligence metrics across calls.
    """
    
    async def get_dashboard_metrics(self, db, company_id: str, range_str: str = "30 Days", campaign_id: str = None, industry: str = None) -> Dict[str, Any]:
        """
        Calculates top-level metrics for the BI Dashboard, optionally filtered by campaign or industry vertical.
        """
        today = datetime.utcnow()
        if range_str == "Today":
            days = 0
        elif range_str == "7 Days":
            days = 7
        elif range_str == "90 Days":
            days = 90
        else:
            days = 30
            
        start_date = (today - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
        
        base_query_leads = {"company_id": company_id, "created_at": {"$gte": start_date}}
        base_query_calls = {"company_id": company_id, "created_at": {"$gte": start_date}}
        
        call_industry_conds = []
        if campaign_id:
            base_query_leads["campaign_id"] = campaign_id
            base_query_calls["campaign_id"] = campaign_id
        elif industry and industry != "all":
            # Match campaigns that belong to this industry vertical
            matching_campaigns = await db.campaigns.find(
                {"company_id": company_id, "industry": industry}, 
                {"campaign_id": 1}
            ).to_list(length=500)
            matching_campaign_ids = [c["campaign_id"] for c in matching_campaigns if c.get("campaign_id")]
            
            call_industry_conds = [{"industry": industry}]
            lead_industry_conds = [{"industry": industry}]
            if matching_campaign_ids:
                call_industry_conds.append({"campaign_id": {"$in": matching_campaign_ids}})
                lead_industry_conds.append({"campaign_id": {"$in": matching_campaign_ids}})
            
            base_query_calls["$or"] = call_industry_conds
            base_query_leads["$or"] = lead_industry_conds
        
        # 1-4. Concurrently fetch all top-level metrics
        total_leads_task = db.leads.count_documents(base_query_leads)
        calls_made_task = db.calls.count_documents(base_query_calls)
        connected_calls_task = db.calls.count_documents({
            **base_query_calls,
            "status": {"$in": ["Completed", "completed", "Analyzed"]}
        })
        qualified_leads_task = db.leads.count_documents({
            **base_query_leads, 
            "status": {"$in": ["Qualified", "Converted"]}
        })
        interested_leads_task = db.leads.count_documents({
            **base_query_leads, 
            "status": {"$in": ["Interested", "Qualified", "Converted"]}
        })
        converted_leads_task = db.leads.count_documents({**base_query_leads, "status": "Converted"})
        contacted_leads_task = db.leads.count_documents({**base_query_leads, "status": {"$ne": "New"}})
        
        analyzed_calls_task = db.calls.count_documents({
            **base_query_calls,
            "analysis": {"$exists": True}
        })
        
        (
            total_leads, calls_made, connected_calls, 
            qualified_leads, interested_leads, converted_leads, contacted_leads,
            analyzed_calls_count
        ) = await asyncio.gather(
            total_leads_task, calls_made_task, connected_calls_task,
            qualified_leads_task, interested_leads_task, converted_leads_task, contacted_leads_task,
            analyzed_calls_task
        )
        
        # 5. Conversion Rate
        conversion_rate = "0%"
        if total_leads > 0:
            rate = (converted_leads / total_leads) * 100
            conversion_rate = f"{rate:.1f}%"

        # Collections is a recovery funnel, not a sales funnel: the generic
        # status-string counts above ("Qualified"/"Interested"/"Converted")
        # don't mean anything here. Swap in the real signals - whether the
        # agent actually verified the account holder's identity, whether a
        # specific promise to pay was secured, and what fraction of those
        # promises were actually kept (reconciled against real repayments by
        # backend/routes/collections_routes.py).
        if industry == "collections":
            identity_verified_task = db.leads.count_documents({
                **base_query_leads, "identity_verified": True
            })
            ptp_secured_task = db.leads.count_documents({
                **base_query_leads, "promise_to_pay.promised": True
            })
            ptp_kept_task = db.leads.count_documents({
                **base_query_leads, "collections_status": {"$in": ["kept", "kept_late"]}
            })
            identity_verified, ptp_secured, ptp_kept = await asyncio.gather(
                identity_verified_task, ptp_secured_task, ptp_kept_task
            )
            qualified_leads = identity_verified
            interested_leads = ptp_secured
            conversion_rate = f"{(ptp_kept / total_leads * 100):.1f}%" if total_leads > 0 else "0%"
            
        # 6. Chart Data
        chart_data = []
        chart_tasks = []
        labels = []
        
        if days == 0:
            points = 12
            step_hours = 2
            for i in range(points - 1, -1, -1):
                d_start = (today - timedelta(hours=i*step_hours)).replace(minute=0, second=0, microsecond=0)
                d_end = d_start + timedelta(hours=step_hours)
                labels.append(d_start.strftime("%I %p"))
                
                chart_base = {"company_id": company_id, "created_at": {"$gte": d_start, "$lt": d_end}}
                if campaign_id:
                    chart_base["campaign_id"] = campaign_id
                elif call_industry_conds:
                    chart_base["$or"] = call_industry_conds
                    
                chart_tasks.append(db.calls.count_documents(chart_base))
                chart_tasks.append(db.calls.count_documents({**chart_base, "status": {"$in": ["Completed", "completed", "Analyzed"]}}))
        else:
            points = min(12, days)
            step_days = max(1, days // points)
            for i in range(points - 1, -1, -1):
                d_start = (today - timedelta(days=i*step_days)).replace(hour=0, minute=0, second=0, microsecond=0)
                d_end = d_start + timedelta(days=step_days)
                labels.append(d_start.strftime("%b %d"))
                
                chart_base = {"company_id": company_id, "created_at": {"$gte": d_start, "$lt": d_end}}
                if campaign_id:
                    chart_base["campaign_id"] = campaign_id
                elif call_industry_conds:
                    chart_base["$or"] = call_industry_conds
                    
                chart_tasks.append(db.calls.count_documents(chart_base))
                chart_tasks.append(db.calls.count_documents({**chart_base, "status": {"$in": ["Completed", "completed", "Analyzed"]}}))
                
        if chart_tasks:
            results = await asyncio.gather(*chart_tasks)
            # results is a flat list: [cm1, cc1, cm2, cc2, ...]
            for idx, label in enumerate(labels):
                chart_data.append({
                    "date": label,
                    "calls_made": results[idx*2],
                    "connected_calls": results[idx*2 + 1]
                })

        # Aggregate real intents and objections from analyzed calls
        analyzed_calls_cursor = db.calls.find(
            {**base_query_calls, "analysis": {"$exists": True}},
            {"analysis": 1}
        ).limit(200)

        intent_counts = {}
        objection_counts = {}
        total_intents_found = 0
        total_objections_found = 0

        async for call_doc in analyzed_calls_cursor:
            analysis = call_doc.get("analysis", {})
            intents_list = list(analysis.get("intents", []) or [])
            req_offering = (analysis.get("requirements") or {}).get("offering")
            if req_offering and req_offering not in intents_list:
                intents_list.append(req_offering)
            
            for itm in intents_list:
                if itm and isinstance(itm, str) and itm.strip():
                    key = itm.strip()
                    intent_counts[key] = intent_counts.get(key, 0) + 1
                    total_intents_found += 1
            
            objs_list = analysis.get("key_objections", []) or []
            for obj in objs_list:
                obj_text = ""
                if isinstance(obj, dict):
                    obj_text = obj.get("content") or obj.get("type") or ""
                elif isinstance(obj, str):
                    obj_text = obj
                if obj_text and obj_text.strip():
                    key = obj_text.strip()
                    objection_counts[key] = objection_counts.get(key, 0) + 1
                    total_objections_found += 1

        real_intents = []
        if total_intents_found > 0:
            for label, cnt in sorted(intent_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
                pct = round((cnt / total_intents_found) * 100)
                real_intents.append({"label": label, "count": cnt, "pct": pct})

        real_objections = []
        if total_objections_found > 0:
            for label, cnt in sorted(objection_counts.items(), key=lambda x: x[1], reverse=True)[:4]:
                pct = round((cnt / total_objections_found) * 100)
                real_objections.append({"objection": label, "count": cnt, "frequency": f"{pct}%"})
            
        return {
            "total_leads": total_leads,
            "calls_made": calls_made,
            "connected_calls": connected_calls,
            "qualified_leads": qualified_leads,
            "interested_leads": interested_leads,
            "converted_leads": converted_leads,
            "contacted_leads": contacted_leads,
            "conversion_rate": conversion_rate,
            "chart_data": chart_data,
            "analyzed_calls_count": analyzed_calls_count,
            "real_intents": real_intents,
            "real_objections": real_objections
        }
    async def get_overall_dashboard_metrics(self, db, company_id: str) -> Dict[str, Any]:
        """
        Calculates lifetime (overall) metrics for the BI Dashboard.
        """
        # 1-3. Concurrently fetch all call and lead counts
        total_calls_task = db.calls.count_documents({"company_id": company_id})
        inbound_calls_task = db.calls.count_documents({"company_id": company_id, "direction": "inbound"})
        outbound_calls_task = db.calls.count_documents({"company_id": company_id, "direction": "outbound"})
        total_leads_task = db.calls.count_documents({"company_id": company_id, "analysis": {"$exists": True}})
        hot_leads_task = db.calls.count_documents({"company_id": company_id, "analysis.lead_temperature": "Hot"})
        warm_leads_task = db.calls.count_documents({"company_id": company_id, "analysis.lead_temperature": "Warm"})
        cold_leads_task = db.calls.count_documents({"company_id": company_id, "analysis.lead_temperature": "Cold"})
        
        (
            total_calls, inbound_calls, outbound_calls, total_leads, 
            hot_leads, warm_leads, cold_leads
        ) = await asyncio.gather(
            total_calls_task, inbound_calls_task, outbound_calls_task, total_leads_task,
            hot_leads_task, warm_leads_task, cold_leads_task
        )
        
        # 4. Averages
        avg_pipeline = [
            {"$match": {"company_id": company_id, "analysis.lead_score": {"$exists": True}}},
            {"$group": {
                "_id": None, 
                "avg_score": {"$avg": "$analysis.lead_score"},
                "avg_conv": {"$avg": "$analysis.conversion_probability"}
            }}
        ]
        avg_agg = await db.calls.aggregate(avg_pipeline).to_list(length=1)
        avg_buyer_intent = round(avg_agg[0]["avg_score"]) if avg_agg and avg_agg[0]["avg_score"] is not None else 0
        avg_conversion = round(avg_agg[0]["avg_conv"]) if avg_agg and avg_agg[0]["avg_conv"] is not None else 0
        
        # 5. Talk Time & Spending (from usage_records)
        usage_pipeline = [
            {"$match": {"company_id": company_id}},
            {"$group": {
                "_id": None,
                "total_seconds": {"$sum": "$duration_seconds"},
                "total_spending": {"$sum": "$customer_cost"}
            }}
        ]
        usage_agg = await db.usage_records.aggregate(usage_pipeline).to_list(length=1)
        
        total_seconds = usage_agg[0]["total_seconds"] if usage_agg else 0
        total_spending = usage_agg[0]["total_spending"] if usage_agg else 0
        
        # Convert seconds to hours for display (or return seconds and let frontend format)
        total_talk_time_hrs = round(total_seconds / 3600)
        
        return {
            "total_calls": total_calls,
            "inbound_calls": inbound_calls,
            "outbound_calls": outbound_calls,
            "total_leads": total_leads,
            "hot_leads": hot_leads,
            "warm_leads": warm_leads,
            "cold_leads": cold_leads,
            "average_buyer_intent": avg_buyer_intent,
            "average_conversion_probability": avg_conversion,
            "total_talk_time": total_talk_time_hrs,
            "total_spending": round(total_spending, 2)
        }

    async def get_customer_timeline(self, db, customer_id: str, company_id: str) -> List[Dict[str, Any]]:
        """
        Fetches the complete timeline of interactions for a given customer phone number.
        """
        # Ensure correct formatting (some might have +, some might not)
        clean_id = customer_id.replace('+', '').strip()
        
        calls = await db.calls.find(
            {"customer_id": {"$regex": f"{clean_id}$"}, "company_id": company_id}
        ).sort("created_at", -1).to_list(length=50)
        
        timeline = []
        for call in calls:
            # Map call document to a timeline event
            timeline.append({
                "type": "call",
                "id": call.get("call_id"),
                "date": call.get("created_at"),
                "direction": call.get("direction", "outbound"),
                "status": call.get("status"),
                "duration": "00:00", # TODO: compute from timestamps if available
                "summary": call.get("summary", ""),
                "sentiment": call.get("sentiment", "neutral"),
                "lead_score": call.get("analysis", {}).get("lead_score", 0),
                "action_items": call.get("analysis", {}).get("action_items", [])
            })
            
        return timeline
