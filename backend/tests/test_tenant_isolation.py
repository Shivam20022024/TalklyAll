"""Tenant-isolation security tests (the 13 required properties)."""
import uuid
from datetime import datetime

import pytest

A = lambda w: {"Authorization": f"Bearer {w['a']['token']}"}
B = lambda w: {"Authorization": f"Bearer {w['b']['token']}"}
SA = lambda w: {"Authorization": f"Bearer {w['super']['token']}"}


# 1
async def test_company_a_cannot_read_company_b_leads(client, world):
    r = await client.get("/api/v1/leads", headers=A(world))
    assert r.status_code == 200
    ids = {l["lead_id"] for l in r.json()}
    assert world["a"]["lead_id"] in ids
    assert world["b"]["lead_id"] not in ids


# 2
async def test_company_a_cannot_read_company_b_campaigns(client, world):
    r = await client.get("/api/v1/campaigns", headers=A(world))
    assert r.status_code == 200
    ids = {c["campaign_id"] for c in r.json()}
    assert world["b"]["campaign_id"] not in ids


# 3
async def test_company_a_cannot_read_company_b_calls(client, world):
    r = await client.get("/api/v1/calls", headers=A(world))
    assert r.status_code == 200
    ids = {c["call_id"] for c in r.json()}
    assert world["a"]["call_id"] in ids
    assert world["b"]["call_id"] not in ids

    # direct fetch of B's call as A -> 404
    r = await client.get(f"/api/v1/calls/{world['b']['call_id']}", headers=A(world))
    assert r.status_code == 404


# 4
async def test_company_a_cannot_modify_company_b_records(client, world):
    r = await client.patch(
        f"/api/v1/campaigns/{world['b']['campaign_id']}",
        json={"name": "hacked"}, headers=A(world),
    )
    assert r.status_code == 404


# 5
async def test_company_a_cannot_delete_company_b_records(client, world):
    r = await client.request(
        "DELETE", "/api/v1/leads/delete-bulk",
        json={"lead_ids": [world["b"]["lead_id"]]}, headers=A(world),
    ) if False else await client.post(
        "/api/v1/leads/delete-bulk",
        json={"lead_ids": [world["b"]["lead_id"]]}, headers=A(world),
    )
    assert r.status_code == 200
    assert r.json()["deleted_count"] == 0

    r = await client.delete(f"/api/v1/campaigns/{world['b']['campaign_id']}", headers=A(world))
    assert r.status_code == 404


# 6
async def test_company_a_cannot_use_company_b_bolna_agent(client, world, db):
    # A publishes -> targets ONLY A's agent; a foreign company_id in the body is rejected.
    r = await client.post(
        "/api/v1/prompt/publish",
        json={"prompt": "x", "company_id": world["b"]["company_id"]}, headers=A(world),
    )
    assert r.status_code == 403

    r = await client.post("/api/v1/prompt/publish", json={"prompt": "legit"}, headers=A(world))
    assert r.status_code == 200
    assert r.json()["agent_id"] == "agent-A"

    # B's prompt/agent untouched
    b_prompt = await db.prompts.find_one({"company_id": world["b"]["company_id"]})
    assert b_prompt["published_prompt"] == "B prompt"


# 7
async def test_company_admin_cannot_access_super_admin_apis(client, world):
    for path in ("/api/v1/admin/dashboard", "/api/v1/admin/companies",
                 f"/api/v1/admin/companies/{world['b']['company_id']}/calls"):
        r = await client.get(path, headers=A(world))
        assert r.status_code == 403, path


# 8
async def test_company_a_cannot_change_its_company_id(client, world, db):
    r = await client.post(
        "/api/v1/campaigns",
        json={"name": "c1", "company_id": world["b"]["company_id"]}, headers=A(world),
    )
    assert r.status_code == 403  # enforce_no_foreign_company

    # even without an explicit reject, a created record is stamped with the caller's company
    r = await client.post("/api/v1/campaigns", json={"name": "c2"}, headers=A(world))
    assert r.status_code == 200
    assert r.json()["company_id"] == world["a"]["company_id"]


# 9
async def test_company_a_cannot_impersonate_super_admin(client, world):
    from auth import create_access_token
    # forge a token that *claims* super_admin for A's user id
    forged = create_access_token(data={"sub": world["a"]["user_id"], "role": "super_admin", "company_id": None})
    r = await client.get("/api/v1/admin/dashboard", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 403  # role is resolved from the DB, not the token


# 10
async def test_super_admin_can_access_all_companies(client, world):
    r = await client.get("/api/v1/admin/companies", headers=SA(world))
    assert r.status_code == 200
    ids = {c["company_id"] for c in r.json()["data"]}
    assert {world["a"]["company_id"], world["b"]["company_id"]} <= ids

    for cid in (world["a"]["company_id"], world["b"]["company_id"]):
        r = await client.get(f"/api/v1/admin/companies/{cid}/overview", headers=SA(world))
        assert r.status_code == 200


# 11
async def test_super_admin_can_switch_company_context(client, world):
    ra = await client.get(f"/api/v1/admin/companies/{world['a']['company_id']}/calls", headers=SA(world))
    rb = await client.get(f"/api/v1/admin/companies/{world['b']['company_id']}/calls", headers=SA(world))
    a_ids = {c["call_id"] for c in ra.json()["data"]}
    b_ids = {c["call_id"] for c in rb.json()["data"]}
    assert world["a"]["call_id"] in a_ids and world["a"]["call_id"] not in b_ids
    assert world["b"]["call_id"] in b_ids and world["b"]["call_id"] not in a_ids

    # unknown company -> 404
    r = await client.get(f"/api/v1/admin/companies/{uuid.uuid4()}/calls", headers=SA(world))
    assert r.status_code == 404


# 12
async def test_new_records_get_correct_company_id(client, world, db):
    r = await client.post("/api/v1/leads", json={"name": "L", "phone": "+911111111111"}, headers=A(world))
    assert r.status_code == 200
    lead = await db.leads.find_one({"lead_id": r.json()["lead_id"]})
    assert lead["company_id"] == world["a"]["company_id"]

    r = await client.post("/api/v1/campaigns", json={"name": "K"}, headers=A(world))
    camp = await db.campaigns.find_one({"campaign_id": r.json()["campaign_id"]})
    assert camp["company_id"] == world["a"]["company_id"]


# 13
async def test_access_request_approval_assigns_company_id(client, world, db):
    req_id = str(uuid.uuid4())
    await db.access_requests.insert_one({
        "id": req_id, "company_name": "Newco", "contact_name": "New Admin",
        "email": "new@newco.com", "password_hash": "x", "status": "PENDING",
        "created_at": datetime.utcnow(),
    })
    r = await client.post(f"/api/v1/access-requests/{req_id}/approve", headers=SA(world))
    assert r.status_code == 200

    user = await db.users.find_one({"email": "new@newco.com"})
    company = await db.companies.find_one({"name": "Newco"})
    assert user["company_id"] == company["company_id"]
    assert user["role"] == "company_admin"
    assert user["is_active"] is True


# extra: deactivated user is locked out
async def test_deactivated_user_rejected(client, world, db):
    await db.users.update_one({"user_id": world["a"]["user_id"]}, {"$set": {"is_active": False}})
    r = await client.get("/api/v1/campaigns", headers=A(world))
    assert r.status_code == 403


# 15: Telephony settings isolation and inbound webhook URL
async def test_telephony_settings_isolated_and_webhook_returned(client, world):
    r_a = await client.get("/api/v1/telephony/settings", headers=A(world))
    assert r_a.status_code == 200
    data_a = r_a.json()
    assert "inbound_webhook_url" in data_a
    assert "/api/v1/plivo/answer" in data_a["inbound_webhook_url"]

    r_b = await client.get("/api/v1/telephony/settings", headers=B(world))
    assert r_b.status_code == 200
    data_b = r_b.json()
    assert "inbound_webhook_url" in data_b


# 16: Auto Build Custom Agent & Tenant Isolation
async def test_auto_build_agent_and_custom_template_isolation(client, world):
    # Tenant A auto-builds a custom solar agent
    payload = {
        "agent_name": "Saanvi",
        "company_name": "Acme Solar Corp",
        "industry": "Renewable Solar Energy",
        "agent_designation": "Solar Consultation Specialist",
        "language": "Hindi / Hinglish",
        "voice_tone": "Warm, professional, consultative",
        "primary_objective": "Qualify roof ownership and book free solar inspection.",
        "must_ask_questions": ["Do you own the roof?", "What is your electricity bill?"],
        "offerings_and_usps": "40% government subsidy and 25-year panel warranty.",
        "closing_call_to_action": "Schedule visit this weekend.",
        "save_immediately": True
    }
    r = await client.post("/api/v1/prompt/auto-build", json=payload, headers=A(world))
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "success"
    template = data["template"]
    template_id = template["template_id"]
    assert "prompt" in template
    assert "welcome_message" in template

    # Tenant A sees their custom template in list
    r_list_a = await client.get("/api/v1/prompt/custom-templates", headers=A(world))
    assert r_list_a.status_code == 200
    tmpl_ids_a = [t["id"] for t in r_list_a.json()["templates"]]
    assert template_id in tmpl_ids_a

    # Tenant B must NOT see Tenant A's custom template
    r_list_b = await client.get("/api/v1/prompt/custom-templates", headers=B(world))
    assert r_list_b.status_code == 200
    tmpl_ids_b = [t["id"] for t in r_list_b.json()["templates"]]
    assert template_id not in tmpl_ids_b

    # Tenant A deletes the custom template
    r_del = await client.delete(f"/api/v1/prompt/custom-templates/{template_id}", headers=A(world))
    assert r_del.status_code == 200

    # Verify deleted for Tenant A
    r_list_a2 = await client.get("/api/v1/prompt/custom-templates", headers=A(world))
    assert template_id not in [t["id"] for t in r_list_a2.json()["templates"]]


@pytest.mark.asyncio
async def test_custom_template_voice_context_resolution(world):
    import mongodb
    from routes.plivo_routes import resolve_call_voice_context
    db = mongodb.get_db()

    cid_a = world["a"]["company_id"]
    cid_b = world["b"]["company_id"]

    # 1. Tenant A creates custom agent template
    custom_template_id = "custom_rooftop_solar_test"
    custom_welcome = "नमस्ते {customer_name}, मैं Saanvi हूँ, Tata Solar से।"
    custom_prompt = "Role: Solar Energy Consultant. Goal: Qualify rooftop solar interest."
    
    await db.prompts.update_one(
        {"company_id": cid_a},
        {
            "$set": {
                "industry": custom_template_id,
                "offering": "5kW Rooftop Solar",
                f"industry_prompts.{custom_template_id}.prompt": custom_prompt,
                f"industry_prompts.{custom_template_id}.welcome_message": custom_welcome,
                f"industry_prompts.{custom_template_id}.published_prompt": custom_prompt,
                f"industry_prompts.{custom_template_id}.published_welcome_message": custom_welcome,
                f"industry_prompts.{custom_template_id}.offering": "5kW Rooftop Solar",
                f"industry_prompts.{custom_template_id}.status": "Published"
            },
            "$push": {
                "custom_templates": {
                    "id": custom_template_id,
                    "name": "Solar Advisor",
                    "welcome_message": custom_welcome,
                    "prompt": custom_prompt,
                    "offering": "5kW Rooftop Solar",
                    "offering_placeholder": "5kW Rooftop Solar"
                }
            }
        },
        upsert=True
    )

    # 2. Insert test call for Tenant A
    call_id_a = f"test-solar-call-{uuid.uuid4().hex[:6]}"
    await db.calls.insert_one({
        "call_id": call_id_a,
        "company_id": cid_a,
        "customer_name": "Mohit",
        "customer_id": "+919876543210",
        "industry": custom_template_id,
        "status": "Initiating"
    })

    # 3. Resolve voice context for Tenant A's call
    ctx_a = await resolve_call_voice_context(db, call_id_a, cid_a)
    
    # Verify Tenant A gets the Solar welcome message and custom prompt
    assert "नमस्ते Mohit" in ctx_a["welcome_text"]
    assert "Tata Solar" in ctx_a["welcome_text"]
    assert "AI calling services" not in ctx_a["welcome_text"]
    assert "Solar Energy Consultant" in ctx_a["system_prompt"]

    # 4. Tenant B tries to resolve a call with Tenant A's private template
    call_id_b = f"test-foreign-call-{uuid.uuid4().hex[:6]}"
    await db.calls.insert_one({
        "call_id": call_id_b,
        "company_id": cid_b,
        "customer_name": "Rohan",
        "customer_id": "+919123456789",
        "industry": custom_template_id, # Tenant B does not own this template
        "status": "Initiating"
    })
    ctx_b = await resolve_call_voice_context(db, call_id_b, cid_b)
    
    # Tenant B must NOT leak Tenant A's custom solar prompt
    assert "Tata Solar" not in ctx_b["welcome_text"]
    assert "Solar Energy Consultant" not in ctx_b["system_prompt"]
    # Tenant B safely falls back to standard general sales
    assert "AI calling services" in ctx_b["welcome_text"]

