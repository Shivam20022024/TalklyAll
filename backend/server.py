
# server.py
import os
import sys
import warnings

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# Suppress pydub RuntimeWarnings
warnings.filterwarnings("ignore", category=RuntimeWarning, module="pydub")

# Configure FFmpeg paths at the very start to suppress pydub warnings
USER_FFMPEG_BIN = r"C:\Users\brijb\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin"
if os.path.exists(USER_FFMPEG_BIN):
    os.environ["PATH"] += os.pathsep + USER_FFMPEG_BIN

import time
import re
import json
import uuid
import asyncio
import requests
import mimetypes
import subprocess
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Form, BackgroundTasks, Depends
from auth import (
    require_company_access,
    tenant_filter,
    enforce_no_foreign_company,
)
from routes.auth_routes import auth_router
from fastapi.middleware.cors import CORSMiddleware
import io
import openpyxl
from fastapi.concurrency import run_in_threadpool
from process_audio import process_uploaded_audio, get_weekly_excel_file, analyze_transcript_text
import mongodb
from industry_templates import INDUSTRY_TEMPLATES
from services.crm_service import crm_service
from services.language_service import LanguageService
from services.intelligence_service import IntelligenceService
language_service = LanguageService()
intelligence_service = IntelligenceService()
from services.whatsapp_service import whatsapp_service
from fastapi.responses import FileResponse
from dotenv import load_dotenv

import shutil
from contextlib import asynccontextmanager

# Load env values
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env.local"))

ngrok_process = None

def ensure_ngrok_tunnel():
    """
    Automatically checks and starts ngrok tunnel if running in local development
    and BASE_URL is set to an ngrok domain.
    """
    global ngrok_process
    base_url = os.environ.get("BASE_URL", "").strip()
    if "ngrok" not in base_url.lower():
        return

    # Check if ngrok is already running on port 4040
    try:
        req = requests.get("http://127.0.0.1:4040/api/tunnels", timeout=1.0)
        if req.status_code == 200:
            data = req.json()
            tunnels = [t.get("public_url", "") for t in data.get("tunnels", [])]
            clean_base = base_url.rstrip("/")
            if any(clean_base in t for t in tunnels):
                print(f"[AUTO-NGROK]: Public tunnel active at {base_url} -> port 8002")
                return
    except Exception:
        pass

    # Find ngrok executable
    ngrok_bin = shutil.which("ngrok")
    if not ngrok_bin:
        win_path = os.path.expanduser(r"~\AppData\Local\Microsoft\WindowsApps\ngrok.exe")
        if os.path.exists(win_path):
            ngrok_bin = win_path

    if not ngrok_bin:
        print("[AUTO-NGROK]: ngrok executable not found in PATH. Start manually if testing live phone calls.")
        return

    domain = base_url.replace("https://", "").replace("http://", "").split("/")[0]
    cmd = [ngrok_bin, "http", "8002", "--url", domain]

    try:
        DETACHED_PROCESS = 0x00000008
        ngrok_process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=DETACHED_PROCESS if os.name == 'nt' else 0
        )
        print(f"[AUTO-NGROK]: Automatically started ngrok tunnel: {base_url} -> http://localhost:8002")
    except Exception as e:
        print(f"[AUTO-NGROK]: Note: Could not auto-launch ngrok ({e}).")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    await mongodb.ensure_indexes()
    ensure_ngrok_tunnel()
    print("--- PROVIDER CONFIG ---")
    print(f"OpenRouter Analysis: {os.environ.get('OPENROUTER_MODEL', 'Not Set')} (Key: {bool(os.environ.get('OPENROUTER_API_KEY'))})")
    print(f"OpenAI Analysis: gpt-4o (Key: {bool(os.environ.get('OPENAI_API_KEY'))})")
    yield
    # Shutdown logic
    global ngrok_process
    if ngrok_process:
        try:
            ngrok_process.terminate()
            print("[AUTO-NGROK]: ngrok tunnel stopped.")
        except Exception:
            pass

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://localhost:8002",
        "http://127.0.0.1:8002"
    ],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from routes.campaign_routes import campaign_router
from routes.lead_routes import lead_router
from routes.auth_routes import auth_router
from routes.billing_routes import billing_router
from routes.admin_routes import admin_router
from routes.agent_routes import agent_router
from routes.access_requests import access_requests_router
from routes.telephony_routes import telephony_router
from routes.collections_routes import collections_router

app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(billing_router, prefix="/api/v1/billing", tags=["Billing"])
# Super-admin platform APIs. Mounted at /admin (canonical) and /super-admin (legacy alias).
app.include_router(admin_router, prefix="/api/v1/admin", tags=["Super Admin"])
app.include_router(admin_router, prefix="/api/v1/super-admin", tags=["Super Admin (legacy)"])
app.include_router(campaign_router, prefix="/api/v1", tags=["Campaigns"])
app.include_router(lead_router, prefix="/api/v1", tags=["Leads"])
app.include_router(agent_router, prefix="/api/v1", tags=["Agent"])
app.include_router(telephony_router, prefix="/api/v1/telephony", tags=["Telephony"])
app.include_router(collections_router, prefix="/api/v1/collections", tags=["Collections"])
app.include_router(access_requests_router, prefix="/api/v1/access-requests")
app.include_router(access_requests_router, prefix="/api/v1/admin/access-requests")
from routes.whatsapp_routes import whatsapp_router
app.include_router(whatsapp_router)
from routes.livekit_routes import livekit_router
app.include_router(livekit_router)
from routes.plivo_routes import plivo_router
app.include_router(plivo_router, prefix="/api/v1/plivo", tags=["Plivo"])

from services.billing_service import billing_service
@app.get("/")
@app.head("/")
async def health_check():
    return {"status": "ok", "service": "TalklyAI Backend"}

@app.get("/api/v1/analytics/dashboard")
async def get_analytics_dashboard(range: str = "30 Days", campaign_id: str = None, industry: str = None, current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    metrics = await intelligence_service.get_dashboard_metrics(db, current_user["company_id"], range, campaign_id, industry)
    return {"status": "success", "data": metrics}

@app.get("/api/v1/analytics/overall")
async def get_overall_analytics(current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    metrics = await intelligence_service.get_overall_dashboard_metrics(db, current_user["company_id"])
    return {"status": "success", "data": metrics}

@app.get("/api/v1/customers/{customer_id}/timeline")
async def get_customer_timeline(customer_id: str, current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    timeline = await intelligence_service.get_customer_timeline(db, customer_id, current_user["company_id"])
    return {"status": "success", "data": timeline}


DEFAULT_PROMPT = "You are an AI sales agent for TalklyAI. You MUST speak entirely in English. Be polite and qualify the lead by asking if they are looking for a 2BHK or 3BHK apartment."
DEFAULT_WELCOME = "Hi, this is TalklyAI. How can I help you today?"


def _effective_prompt(doc: dict | None, industry: str | None = None):
    """Prompt actually used for live calls: industry-specific published/draft, then top-level published/draft."""
    if not doc:
        return None, None
    if industry:
        ind_entry = (doc.get("industry_prompts") or {}).get(industry, {})
        if ind_entry:
            prompt = ind_entry.get("published_prompt") or ind_entry.get("draft_prompt") or ind_entry.get("prompt")
            welcome = ind_entry.get("published_welcome_message") or ind_entry.get("draft_welcome_message") or ind_entry.get("welcome_message")
            if prompt or welcome:
                return prompt, welcome
    prompt = doc.get("published_prompt") or doc.get("draft_prompt") or doc.get("prompt")
    welcome = doc.get("published_welcome_message") or doc.get("draft_welcome_message") or doc.get("welcome_message")
    return prompt, welcome


def _prompt_view(doc: dict | None, industry: str | None = None) -> dict:
    """Present a prompt doc for a specific industry or the active one, supporting
    independent per-industry custom prompts across all verticals + company custom templates."""
    active_ind = industry or (doc.get("industry") if doc else None) or "real_estate"
    
    custom_templates = (doc.get("custom_templates") or []) if doc else []
    cleaned_custom = []
    for ct in custom_templates:
        if not isinstance(ct, dict):
            continue
        c_copy = dict(ct)
        raw_v = c_copy.get("variables")
        v_tags = ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{location}}"]
        if isinstance(raw_v, list):
            v_tags = [str(x) for x in raw_v]
        elif isinstance(raw_v, dict):
            for k in raw_v.keys():
                clean_k = k.replace("{", "").replace("}", "")
                tag = f"{{{{{clean_k}}}}}"
                if tag not in v_tags:
                    v_tags.append(tag)
        c_copy["variables"] = v_tags
        cleaned_custom.append(c_copy)
    custom_templates = cleaned_custom
    custom_map = {t["id"]: t for t in custom_templates if isinstance(t, dict) and t.get("id")}
    
    if active_ind in custom_map:
        template_def = custom_map[active_ind]
    else:
        template_def = INDUSTRY_TEMPLATES.get(active_ind, INDUSTRY_TEMPLATES.get("general_sales", {}))
    
    ind_prompts = (doc.get("industry_prompts") or {}) if doc else {}
    ind_entry = ind_prompts.get(active_ind, {})
    
    # 1. Check if this industry has customized prompt in industry_prompts
    draft = ind_entry.get("draft_prompt") or ind_entry.get("prompt")
    draft_welcome = ind_entry.get("draft_welcome_message") or ind_entry.get("welcome_message")
    published = ind_entry.get("published_prompt") or ind_entry.get("prompt")
    published_welcome = ind_entry.get("published_welcome_message") or ind_entry.get("welcome_message")

    draft_inbound = ind_entry.get("draft_inbound_prompt") or ind_entry.get("inbound_prompt")
    draft_inbound_welcome = ind_entry.get("draft_inbound_welcome_message") or ind_entry.get("inbound_welcome_message")
    published_inbound = ind_entry.get("published_inbound_prompt")
    published_inbound_welcome = ind_entry.get("published_inbound_welcome_message")

    status = ind_entry.get("status")

    # 2. If not in industry_prompts, fall back to doc top-level if doc.industry matches active_ind
    if not draft and doc and doc.get("industry") == active_ind:
        draft = doc.get("draft_prompt") or doc.get("prompt")
        draft_welcome = doc.get("draft_welcome_message") or doc.get("welcome_message")
        published = doc.get("published_prompt") or doc.get("prompt")
        published_welcome = doc.get("published_welcome_message") or doc.get("welcome_message")
        draft_inbound = doc.get("draft_inbound_prompt") or doc.get("inbound_prompt")
        draft_inbound_welcome = doc.get("draft_inbound_welcome_message") or doc.get("inbound_welcome_message")
        published_inbound = doc.get("published_inbound_prompt")
        published_inbound_welcome = doc.get("published_inbound_welcome_message")
        if not status:
            status = doc.get("status")

    # 3. If still empty, initialize with template definition
    default_prompt = template_def.get("prompt", DEFAULT_PROMPT)
    default_welcome = template_def.get("welcome_message", DEFAULT_WELCOME)
    default_inbound_prompt = template_def.get("inbound_prompt", "")
    default_inbound_welcome = template_def.get("inbound_welcome_message", "")

    offering = ind_entry.get("offering") or (doc.get("offering") if doc and doc.get("industry") == active_ind else "")
    location = ind_entry.get("location") or (doc.get("location") if doc and doc.get("industry") == active_ind else "")
    if "cyber" in location.lower() or "dlf" in location.lower():
        location = ""
    
    # Merge variables so freshest configured variables are never shadowed
    merged_vars = {}
    if doc and isinstance(doc.get("variables"), dict):
        merged_vars.update(doc["variables"])
    if ind_entry and isinstance(ind_entry.get("variables"), dict):
        merged_vars.update(ind_entry["variables"])
    variables = merged_vars

    kb = (
        ind_entry.get("draft_knowledge_base")
        or ind_entry.get("published_knowledge_base")
        or ind_entry.get("knowledge_base")
        or template_def.get("knowledge_base")
        or (doc.get("knowledge_base") if doc and doc.get("industry") == active_ind else "")
        or ""
    )

    return {
        "status": "success",
        "industry": active_ind,
        "template_name": ind_entry.get("name") or template_def.get("name", active_ind),
        "template_description": ind_entry.get("description") or template_def.get("description", ""),
        "default_offering_label": template_def.get("default_offering_label", "Product / Offering"),
        "offering_placeholder": template_def.get("offering_placeholder", ""),
        "specific_variables": template_def.get("specific_variables", []),
        "prompt": draft or published or default_prompt,
        "welcome_message": draft_welcome or published_welcome or default_welcome,
        "published_prompt": published,
        "published_welcome_message": published_welcome,
        "inbound_prompt": draft_inbound or published_inbound or default_inbound_prompt,
        "inbound_welcome_message": draft_inbound_welcome or published_inbound_welcome or default_inbound_welcome,
        "published_inbound_prompt": published_inbound,
        "published_inbound_welcome_message": published_inbound_welcome,
        "knowledge_base": kb,
        "prompt_status": status or ("Published" if published else "Draft"),
        "published_at": ind_entry.get("published_at") or (doc.get("published_at") if doc else None),
        "offering": offering,
        "location": location,
        "variables": variables or {},
        "active_company_industry": (doc.get("industry") if doc else "real_estate"),
        "custom_templates": custom_templates,
        "industry_prompts_summary": {
            k: {"status": v.get("status", "Draft"), "offering": v.get("offering", ""), "name": v.get("name", k)}
            for k, v in ind_prompts.items()
        }
    }


@app.get("/api/v1/prompt")
async def get_prompt(industry: str | None = None, current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    doc = await db.prompts.find_one({"company_id": current_user["company_id"]})
    return _prompt_view(doc, industry=industry)


@app.post("/api/v1/prompt")
async def save_prompt(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    enforce_no_foreign_company(current_user, payload)
    db = mongodb.get_db()
    prompt = payload.get("prompt")
    welcome_message = payload.get("welcome_message")
    inbound_prompt = payload.get("inbound_prompt")
    inbound_welcome_message = payload.get("inbound_welcome_message")
    industry = payload.get("industry") or "real_estate"
    offering = payload.get("offering")
    location = payload.get("location")
    variables = payload.get("variables")
    knowledge_base = payload.get("knowledge_base")

    now = datetime.utcnow()
    ind_update = {
        f"industry_prompts.{industry}.draft_prompt": prompt,
        f"industry_prompts.{industry}.draft_welcome_message": welcome_message,
        f"industry_prompts.{industry}.prompt": prompt,
        f"industry_prompts.{industry}.welcome_message": welcome_message,
        f"industry_prompts.{industry}.status": "Draft",
        f"industry_prompts.{industry}.updated_at": now,
    }
    if knowledge_base is not None:
        ind_update[f"industry_prompts.{industry}.draft_knowledge_base"] = str(knowledge_base).strip()
        ind_update[f"industry_prompts.{industry}.knowledge_base"] = str(knowledge_base).strip()
    if inbound_prompt is not None:
        ind_update[f"industry_prompts.{industry}.draft_inbound_prompt"] = inbound_prompt
        ind_update[f"industry_prompts.{industry}.inbound_prompt"] = inbound_prompt
    if inbound_welcome_message is not None:
        ind_update[f"industry_prompts.{industry}.draft_inbound_welcome_message"] = inbound_welcome_message
        ind_update[f"industry_prompts.{industry}.inbound_welcome_message"] = inbound_welcome_message
    if offering is not None:
        ind_update[f"industry_prompts.{industry}.offering"] = str(offering).strip()
    if location is not None:
        ind_update[f"industry_prompts.{industry}.location"] = str(location).strip()
    if variables is not None and isinstance(variables, dict):
        ind_update[f"industry_prompts.{industry}.variables"] = variables

    # Also keep top-level draft in sync
    ind_update.update({
        "draft_prompt": prompt,
        "draft_welcome_message": welcome_message,
        "prompt": prompt,
        "welcome_message": welcome_message,
        "status": "Draft",
        "industry": industry,
        "updated_at": now,
    })
    if offering is not None:
        ind_update["offering"] = str(offering).strip()
    if location is not None:
        ind_update["location"] = str(location).strip()
    if variables is not None and isinstance(variables, dict):
        ind_update["variables"] = variables
    if inbound_prompt is not None:
        ind_update["draft_inbound_prompt"] = inbound_prompt
        ind_update["inbound_prompt"] = inbound_prompt
    if inbound_welcome_message is not None:
        ind_update["draft_inbound_welcome_message"] = inbound_welcome_message
        ind_update["inbound_welcome_message"] = inbound_welcome_message
    if knowledge_base is not None:
        ind_update["draft_knowledge_base"] = str(knowledge_base).strip()
        ind_update["knowledge_base"] = str(knowledge_base).strip()

    await db.prompts.update_one(
        {"company_id": current_user["company_id"]},
        {"$set": ind_update},
        upsert=True
    )
    if industry.startswith("custom_"):
        custom_patch = {
            "custom_templates.$.prompt": prompt,
            "custom_templates.$.draft_prompt": prompt,
            "custom_templates.$.welcome_message": welcome_message,
            "custom_templates.$.draft_welcome_message": welcome_message,
            "custom_templates.$.updated_at": now.isoformat()
        }
        if knowledge_base is not None:
            custom_patch["custom_templates.$.knowledge_base"] = str(knowledge_base).strip()
            custom_patch["custom_templates.$.draft_knowledge_base"] = str(knowledge_base).strip()
        if inbound_prompt is not None:
            custom_patch["custom_templates.$.inbound_prompt"] = inbound_prompt
            custom_patch["custom_templates.$.draft_inbound_prompt"] = inbound_prompt
        if inbound_welcome_message is not None:
            custom_patch["custom_templates.$.inbound_welcome_message"] = inbound_welcome_message
            custom_patch["custom_templates.$.draft_inbound_welcome_message"] = inbound_welcome_message
        if variables is not None:
            tag_list = [f"{{{{{k.replace('{','').replace('}','')}}}}}" for k in variables.keys()] if isinstance(variables, dict) else list(variables)
            custom_patch["custom_templates.$.variables"] = tag_list
        await db.prompts.update_one(
            {"company_id": current_user["company_id"], "custom_templates.id": industry},
            {"$set": custom_patch}
        )
    return {"status": "success", "industry": industry}


@app.post("/api/v1/prompt/publish")
async def publish_prompt(payload: dict | None = Body(None), current_user: dict = Depends(require_company_access)):
    payload = payload or {}
    enforce_no_foreign_company(current_user, payload)
    db = mongodb.get_db()
    company_id = current_user["company_id"]

    doc = await db.prompts.find_one({"company_id": company_id})
    industry = payload.get("industry") or (doc or {}).get("industry") or "real_estate"
    
    ind_entry = ((doc or {}).get("industry_prompts") or {}).get(industry, {})

    prompt = payload.get("prompt") or ind_entry.get("draft_prompt") or ind_entry.get("prompt") or (doc or {}).get("draft_prompt") or (doc or {}).get("prompt")
    welcome = payload.get("welcome_message") or ind_entry.get("draft_welcome_message") or ind_entry.get("welcome_message") or (doc or {}).get("draft_welcome_message") or (doc or {}).get("welcome_message")
    inbound_prompt = payload.get("inbound_prompt") or ind_entry.get("draft_inbound_prompt") or ind_entry.get("inbound_prompt") or (doc or {}).get("draft_inbound_prompt") or (doc or {}).get("inbound_prompt")
    inbound_welcome = payload.get("inbound_welcome_message") or ind_entry.get("draft_inbound_welcome_message") or ind_entry.get("inbound_welcome_message") or (doc or {}).get("draft_inbound_welcome_message") or (doc or {}).get("inbound_welcome_message")
    offering = payload.get("offering") or ind_entry.get("offering") or (doc or {}).get("offering") or ""
    location = payload.get("location") or ind_entry.get("location") or (doc or {}).get("location") or ""
    variables = payload.get("variables") or ind_entry.get("variables") or (doc or {}).get("variables") or {}
    knowledge_base = (
        payload.get("knowledge_base")
        or ind_entry.get("draft_knowledge_base")
        or ind_entry.get("knowledge_base")
        or (doc or {}).get("draft_knowledge_base")
        or (doc or {}).get("knowledge_base")
        or ""
    )

    if not prompt:
        raise HTTPException(status_code=400, detail="Nothing to publish - save a draft first")

    company = await db.companies.find_one({"company_id": company_id})
    agent_id = (company or {}).get("bolna_agent_id") or os.environ.get("BOLNA_AGENT_ID")

    # If Bolna agent is configured, try syncing to Bolna
    api_key = os.environ.get("BOLNA_API_KEY", "").strip()
    bolna_synced = False
    if agent_id and api_key:
        try:
            resp = await run_in_threadpool(
                requests.patch,
                f"https://api.bolna.ai/agent/{agent_id}",
                json={"agent_prompts": {"task_1": {"system_prompt": prompt}},
                      "agent_config": {"agent_welcome_message": welcome or ""}},
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                timeout=30,
            )
            bolna_synced = resp.ok
            if not resp.ok:
                print(f"Bolna agent update notice for company {company_id}: {resp.status_code}")
        except Exception as e:
            print(f"Bolna agent update notice for company {company_id}: {e}")

    now = datetime.utcnow()
    pub_update = {
        f"industry_prompts.{industry}.published_prompt": prompt,
        f"industry_prompts.{industry}.published_welcome_message": welcome,
        f"industry_prompts.{industry}.draft_prompt": prompt,
        f"industry_prompts.{industry}.draft_welcome_message": welcome,
        f"industry_prompts.{industry}.prompt": prompt,
        f"industry_prompts.{industry}.welcome_message": welcome,
        f"industry_prompts.{industry}.published_inbound_prompt": inbound_prompt,
        f"industry_prompts.{industry}.published_inbound_welcome_message": inbound_welcome,
        f"industry_prompts.{industry}.draft_inbound_prompt": inbound_prompt,
        f"industry_prompts.{industry}.draft_inbound_welcome_message": inbound_welcome,
        f"industry_prompts.{industry}.inbound_prompt": inbound_prompt,
        f"industry_prompts.{industry}.inbound_welcome_message": inbound_welcome,
        f"industry_prompts.{industry}.offering": str(offering).strip() if offering else "",
        f"industry_prompts.{industry}.location": str(location).strip() if location else "",
        f"industry_prompts.{industry}.variables": variables,
        f"industry_prompts.{industry}.knowledge_base": str(knowledge_base).strip(),
        f"industry_prompts.{industry}.published_knowledge_base": str(knowledge_base).strip(),
        f"industry_prompts.{industry}.status": "Published",
        f"industry_prompts.{industry}.published_at": now,
        f"industry_prompts.{industry}.updated_at": now,

        "published_prompt": prompt,
        "published_welcome_message": welcome,
        "draft_prompt": prompt,
        "draft_welcome_message": welcome,
        "prompt": prompt,
        "welcome_message": welcome,
        "published_inbound_prompt": inbound_prompt,
        "published_inbound_welcome_message": inbound_welcome,
        "draft_inbound_prompt": inbound_prompt,
        "draft_inbound_welcome_message": inbound_welcome,
        "inbound_prompt": inbound_prompt,
        "inbound_welcome_message": inbound_welcome,
        "knowledge_base": str(knowledge_base).strip(),
        "published_knowledge_base": str(knowledge_base).strip(),
        "offering": str(offering).strip() if offering else "",
        "location": str(location).strip() if location else "",
        "variables": variables,
        "status": "Published",
        "industry": industry,
        "published_at": now,
        "updated_at": now,
    }

    await db.prompts.update_one(
        {"company_id": company_id},
        {"$set": pub_update},
        upsert=True,
    )
    if industry.startswith("custom_"):
        await db.prompts.update_one(
            {"company_id": company_id, "custom_templates.id": industry},
            {
                "$set": {
                    "custom_templates.$.prompt": prompt,
                    "custom_templates.$.published_prompt": prompt,
                    "custom_templates.$.welcome_message": welcome,
                    "custom_templates.$.published_welcome_message": welcome,
                    "custom_templates.$.inbound_prompt": inbound_prompt,
                    "custom_templates.$.published_inbound_prompt": inbound_prompt,
                    "custom_templates.$.inbound_welcome_message": inbound_welcome,
                    "custom_templates.$.published_inbound_welcome_message": inbound_welcome,
                    "custom_templates.$.knowledge_base": str(knowledge_base).strip(),
                    "custom_templates.$.published_knowledge_base": str(knowledge_base).strip(),
                    "custom_templates.$.variables": [f"{{{{{k.replace('{','').replace('}','')}}}}}" for k in variables.keys()] if isinstance(variables, dict) else (list(variables) if variables else ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{location}}"]),
                    "custom_templates.$.published_at": now.isoformat(),
                    "custom_templates.$.updated_at": now.isoformat()
                }
            }
        )
    comp_update = {"industry": industry, "updated_at": now}
    if offering:
        comp_update["offering"] = str(offering).strip()
    await db.companies.update_one(
        {"company_id": company_id},
        {"$set": comp_update}
    )
    await db.users.update_many(
        {"company_id": company_id},
        {"$set": {"industry": industry, "updated_at": now}}
    )
    return {"status": "success", "industry": industry, "bolna_synced": bolna_synced, "agent_id": agent_id}


@app.post("/api/v1/prompt/auto-build")
async def auto_build_agent_prompt(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    """Generates a complete, tailored Voice Agent prompt and greeting using AI builder."""
    from services.prompt_builder_service import prompt_builder_service
    db = mongodb.get_db()
    company_id = current_user["company_id"]
    
    # Auto-fill company_name if missing
    if not payload.get("company_name"):
        comp = await db.companies.find_one({"company_id": company_id})
        if comp and comp.get("name"):
            payload["company_name"] = comp["name"]

    generated = await prompt_builder_service.build_custom_agent_prompt(payload)
    if not generated:
        raise HTTPException(status_code=500, detail="Failed to generate agent prompt")

    save_immediately = bool(payload.get("save_immediately", True))
    if save_immediately:
        t_id = generated["template_id"]
        now = datetime.utcnow()
        custom_entry = {
            "id": t_id,
            "name": generated["template_name"],
            "description": generated["description"],
            "icon": "Sparkles",
            "default_offering_label": generated.get("default_offering_label", "Offering"),
            "offering_placeholder": generated.get("offering_placeholder", ""),
            "welcome_message": generated["welcome_message"],
            "prompt": generated["prompt"],
            "inbound_welcome_message": generated.get("inbound_welcome_message", ""),
            "inbound_prompt": generated.get("inbound_prompt", ""),
            "knowledge_base": generated.get("knowledge_base", ""),
            "variables": generated.get("suggested_variables", ["{{company_name}}", "{{customer_name}}", "{{offering}}"]),
            "specific_variables": generated.get("specific_variables", []),
            "created_at": now.isoformat()
        }

        # Store in db.prompts under custom_templates array and industry_prompts dict
        ind_save = {
            f"industry_prompts.{t_id}.prompt": generated["prompt"],
            f"industry_prompts.{t_id}.draft_prompt": generated["prompt"],
            f"industry_prompts.{t_id}.welcome_message": generated["welcome_message"],
            f"industry_prompts.{t_id}.draft_welcome_message": generated["welcome_message"],
            f"industry_prompts.{t_id}.inbound_prompt": generated.get("inbound_prompt", ""),
            f"industry_prompts.{t_id}.draft_inbound_prompt": generated.get("inbound_prompt", ""),
            f"industry_prompts.{t_id}.inbound_welcome_message": generated.get("inbound_welcome_message", ""),
            f"industry_prompts.{t_id}.draft_inbound_welcome_message": generated.get("inbound_welcome_message", ""),
            f"industry_prompts.{t_id}.knowledge_base": generated.get("knowledge_base", ""),
            f"industry_prompts.{t_id}.draft_knowledge_base": generated.get("knowledge_base", ""),
            f"industry_prompts.{t_id}.name": generated["template_name"],
            f"industry_prompts.{t_id}.description": generated["description"],
            f"industry_prompts.{t_id}.default_offering_label": generated.get("default_offering_label", "Offering"),
            f"industry_prompts.{t_id}.offering_placeholder": generated.get("offering_placeholder", ""),
            f"industry_prompts.{t_id}.specific_variables": generated.get("specific_variables", []),
            f"industry_prompts.{t_id}.status": "Draft",
            f"industry_prompts.{t_id}.updated_at": now
        }

        # Pull existing if duplicate id, then push
        await db.prompts.update_one(
            {"company_id": company_id},
            {"$pull": {"custom_templates": {"id": t_id}}},
            upsert=True
        )
        await db.prompts.update_one(
            {"company_id": company_id},
            {
                "$set": ind_save,
                "$push": {"custom_templates": custom_entry}
            },
            upsert=True
        )

    return {"status": "success", "template": generated}


@app.get("/api/v1/prompt/custom-templates")
async def get_custom_templates(current_user: dict = Depends(require_company_access)):
    """Retrieves all custom agent templates created by the current company."""
    db = mongodb.get_db()
    doc = await db.prompts.find_one({"company_id": current_user["company_id"]})
    templates = (doc or {}).get("custom_templates") or []
    return {"status": "success", "templates": templates}


@app.delete("/api/v1/prompt/custom-templates/{template_id}")
async def delete_custom_template(template_id: str, current_user: dict = Depends(require_company_access)):
    """Deletes a company custom agent template and safely resets active vertical if deleted."""
    db = mongodb.get_db()
    company_id = current_user["company_id"]
    await db.prompts.update_one(
        {"company_id": company_id},
        {
            "$pull": {"custom_templates": {"id": template_id}},
            "$unset": {f"industry_prompts.{template_id}": ""}
        }
    )
    # If the company was using this template as active vertical, reset cleanly
    comp = await db.companies.find_one({"company_id": company_id})
    if comp and comp.get("industry") == template_id:
        now = datetime.utcnow()
        await db.companies.update_one(
            {"company_id": company_id},
            {"$set": {"industry": "real_estate", "updated_at": now}}
        )
        await db.users.update_many(
            {"company_id": company_id},
            {"$set": {"industry": "real_estate", "updated_at": now}}
        )
        await db.prompts.update_one(
            {"company_id": company_id},
            {"$set": {"industry": "real_estate", "updated_at": now}}
        )
    return {"status": "success", "message": f"Template {template_id} deleted"}


@app.post("/api/v1/prompt/parse-knowledge-file")
async def parse_knowledge_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_company_access)
):
    """
    Parses an uploaded PDF, Excel (.xlsx, .xls), CSV, or text file
    and formats its contents into structured knowledge facts / FAQs for the voice agent.
    """
    filename = (file.filename or "uploaded_file").strip()
    lower_fn = filename.lower()
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    extracted_text = ""

    # 1. Handle PDF Documents
    if lower_fn.endswith(".pdf"):
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            pages_text = []
            max_pages = min(len(reader.pages), 30)
            for idx in range(max_pages):
                txt = reader.pages[idx].extract_text() or ""
                if txt.strip():
                    pages_text.append(txt.strip())
            extracted_text = "\n\n".join(pages_text)
            if len(reader.pages) > 30:
                extracted_text += f"\n\n[Note: Extracted first 30 pages out of {len(reader.pages)} pages for optimal voice response latency.]"
        except Exception as e:
            logger.error(f"Failed to parse PDF {filename}: {e}")
            raise HTTPException(status_code=400, detail=f"Failed to read PDF document: {str(e)}")

    # 2. Handle Excel Spreadsheets
    elif lower_fn.endswith((".xlsx", ".xls", ".xlsm", ".xlsb")):
        try:
            import pandas as pd
            df = pd.read_excel(io.BytesIO(content))
            df = df.dropna(how="all")
            if df.empty:
                raise HTTPException(status_code=400, detail="The Excel sheet has no readable data rows.")
            
            # Check for Q&A columns
            q_col = next((c for c in df.columns if any(w in str(c).lower() for w in ["question", "faq", "query", "q"])), None)
            a_col = next((c for c in df.columns if any(w in str(c).lower() for w in ["answer", "ans", "response", "reply", "solution", "a"]) and c != q_col), None)

            rows_out = []
            if q_col and a_col:
                for _, row in df.iterrows():
                    q_val = str(row.get(q_col) or "").strip()
                    a_val = str(row.get(a_col) or "").strip()
                    if q_val and a_val and q_val.lower() != "nan" and a_val.lower() != "nan":
                        rows_out.append(f"Q: {q_val}\nA: {a_val}")
            else:
                # Tabular rows (Products, Specs, Pricing, Policies)
                for _, row in df.iterrows():
                    parts = []
                    for c in df.columns:
                        val = str(row.get(c) or "").strip()
                        if val and val.lower() != "nan":
                            parts.append(f"{c}: {val}")
                    if parts:
                        rows_out.append("- " + " | ".join(parts))
            
            extracted_text = "\n\n".join(rows_out)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to parse Excel {filename}: {e}")
            raise HTTPException(status_code=400, detail=f"Failed to read Excel spreadsheet: {str(e)}")

    # 3. Handle CSV / TSV Spreadsheets
    elif lower_fn.endswith((".csv", ".tsv")):
        try:
            import pandas as pd
            text = None
            for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
                try:
                    text = content.decode(enc)
                    break
                except Exception:
                    continue
            if not text:
                text = content.decode("utf-8", errors="ignore")
            
            import io as py_io
            df = pd.read_csv(py_io.StringIO(text), sep=None, engine="python")
            df = df.dropna(how="all")
            
            q_col = next((c for c in df.columns if any(w in str(c).lower() for w in ["question", "faq", "query", "q"])), None)
            a_col = next((c for c in df.columns if any(w in str(c).lower() for w in ["answer", "ans", "response", "reply", "solution", "a"]) and c != q_col), None)

            rows_out = []
            if q_col and a_col:
                for _, row in df.iterrows():
                    q_val = str(row.get(q_col) or "").strip()
                    a_val = str(row.get(a_col) or "").strip()
                    if q_val and a_val and q_val.lower() != "nan" and a_val.lower() != "nan":
                        rows_out.append(f"Q: {q_val}\nA: {a_val}")
            else:
                for _, row in df.iterrows():
                    parts = []
                    for c in df.columns:
                        val = str(row.get(c) or "").strip()
                        if val and val.lower() != "nan":
                            parts.append(f"{c}: {val}")
                    if parts:
                        rows_out.append("- " + " | ".join(parts))
            extracted_text = "\n\n".join(rows_out)
        except Exception as e:
            logger.error(f"Failed to parse CSV {filename}: {e}")
            raise HTTPException(status_code=400, detail=f"Failed to read CSV spreadsheet: {str(e)}")

    # 4. Handle Word Documents (.docx)
    elif lower_fn.endswith(".docx"):
        try:
            import docx
            doc = docx.Document(io.BytesIO(content))
            paras = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    cells = [c.text.strip() for c in row.cells if c.text and c.text.strip()]
                    if cells:
                        paras.append(" - " + " | ".join(cells))
            extracted_text = "\n\n".join(paras)
        except Exception as e:
            logger.error(f"Failed to parse Word document {filename}: {e}")
            raise HTTPException(status_code=400, detail=f"Failed to read Word document: {str(e)}")

    # 5. Handle TXT / Markdown
    elif lower_fn.endswith((".txt", ".md", ".text")):
        for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
            try:
                extracted_text = content.decode(enc)
                break
            except Exception:
                continue
        if not extracted_text:
            extracted_text = content.decode("utf-8", errors="ignore")

    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload a PDF (.pdf), Word (.docx), Excel (.xlsx, .xls), CSV (.csv), or text (.txt) file."
        )

    # Clean whitespace
    extracted_text = re.sub(r"[ \t]+", " ", extracted_text).strip()
    extracted_text = re.sub(r"\n{3,}", "\n\n", extracted_text)

    # Truncate if excessively long (e.g. > 15,000 characters)
    if len(extracted_text) > 15000:
        extracted_text = extracted_text[:15000] + "\n\n[Note: Document trimmed to 15,000 characters for optimal live calling latency.]"

    if not extracted_text:
        raise HTTPException(status_code=400, detail="Could not extract any readable text from the file.")

    return {
        "status": "success",
        "filename": filename,
        "extracted_text": extracted_text,
        "character_count": len(extracted_text)
    }


BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000")

# Startup logic moved to lifespan context manager above

@app.get("/api/v1/calls")
async def get_calls(limit: int = 20, skip: int = 0, direction: str = None, current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    base_filter = {"direction": direction} if direction else None
    cursor = db.calls.find(tenant_filter(current_user, base_filter)).sort("created_at", -1).skip(skip).limit(limit)
    calls = []
    async for d in cursor:
        d["_id"] = None
        calls.append(d)
    return calls

@app.get("/api/v1/notifications")
async def get_notifications(limit: int = 20, skip: int = 0, current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    cursor = db.notifications.find(tenant_filter(current_user)).sort("created_at", -1).skip(skip).limit(limit)
    notifications = []
    async for n in cursor:
        n["_id"] = None
        notifications.append(n)
    unread_count = await db.notifications.count_documents(tenant_filter(current_user, {"read": False}))
    return {"status": "success", "notifications": notifications, "unread_count": unread_count}

@app.post("/api/v1/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    await db.notifications.update_one(
        tenant_filter(current_user, {"id": notification_id}),
        {"$set": {"read": True}}
    )
    return {"status": "success"}

@app.post("/api/v1/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    await db.notifications.update_many(
        tenant_filter(current_user, {"read": False}),
        {"$set": {"read": True}}
    )
    return {"status": "success"}

@app.get("/api/v1/calls/stats")
async def get_calls_stats(direction: str = None, current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    base_filter = {"direction": direction} if direction else None
    match = tenant_filter(current_user, base_filter)

    total = await db.calls.count_documents(match)
    answered = await db.calls.count_documents({**match, "status": {"$in": ["Completed", "Analyzed"]}})

    today_start = datetime(datetime.utcnow().year, datetime.utcnow().month, datetime.utcnow().day)
    today_count = await db.calls.count_documents({**match, "created_at": {"$gte": today_start}})

    pipeline = [
        {"$match": match},
        {"$group": {"_id": None, "total_seconds": {"$sum": "$duration_seconds"}}}
    ]
    agg = await db.calls.aggregate(pipeline).to_list(1)
    total_seconds = float(agg[0]["total_seconds"]) if agg and agg[0].get("total_seconds") else 0.0
    avg_duration = round(total_seconds / answered, 1) if answered > 0 else 0.0

    unique_callers = len(await db.calls.distinct("customer_id", match))

    return {
        "status": "success",
        "total_calls": total,
        "answered_calls": answered,
        "missed_calls": max(0, total - answered),
        "calls_today": today_count,
        "avg_duration_seconds": avg_duration,
        "unique_callers": unique_callers
    }

@app.get("/api/v1/calls/export")
async def export_calls_excel(direction: str = None, current_user: dict = Depends(require_company_access)):
    """Properly formatted, single-direction .xlsx export - separate files for
    inbound vs outbound so the two don't get mixed into one messy sheet."""
    db = mongodb.get_db()
    base_filter = {"direction": direction} if direction else None
    cursor = db.calls.find(tenant_filter(current_user, base_filter)).sort("created_at", -1)
    calls = await cursor.to_list(length=None)

    from report_service import generate_calls_export
    direction_label = (direction or "all").title()
    file_path = await run_in_threadpool(generate_calls_export, calls, direction_label)

    filename = f"talkly_{direction or 'all'}_calls_{datetime.utcnow().strftime('%Y%m%d')}.xlsx"

    from starlette.background import BackgroundTask
    return FileResponse(
        file_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        background=BackgroundTask(lambda: os.path.exists(file_path) and os.remove(file_path))
    )

@app.delete("/api/v1/calls")
async def delete_all_calls(current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    result = await db.calls.delete_many(tenant_filter(current_user))
    return {"status": "success", "deleted_count": result.deleted_count}

@app.post("/api/v1/calls/delete-bulk")
async def delete_bulk_calls(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    call_ids = payload.get("call_ids", [])
    if not call_ids:
        return {"status": "success", "deleted_count": 0}

    result = await db.calls.delete_many(tenant_filter(current_user, {"call_id": {"$in": call_ids}}))
    return {"status": "success", "deleted_count": result.deleted_count}

@app.get("/api/v1/calls/{call_id}")
async def get_call(call_id: str, current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    # 1. First check if there is a completed call specifically associated with this lead_id (most recent first)
    doc = await db.calls.find_one(
        tenant_filter(current_user, {"lead_id": call_id, "transcript": {"$regex": r"\S"}}),
        sort=[("created_at", -1)]
    )
    # 2. If no call by lead_id with transcript, check exact call_id
    if not doc:
        exact_doc = await db.calls.find_one(tenant_filter(current_user, {"call_id": call_id}))
        if exact_doc and exact_doc.get("transcript"):
            doc = exact_doc
        elif not doc:
            doc = exact_doc

    # 3. If doc still has no transcript, look up by lead's phone number for latest completed call
    if not doc or not doc.get("transcript"):
        lead = await db.leads.find_one(tenant_filter(current_user, {"lead_id": call_id}))
        if lead and lead.get("phone"):
            clean_digits = "".join(filter(str.isdigit, str(lead["phone"])))
            if clean_digits:
                phone_call = await db.calls.find_one(
                    tenant_filter(current_user, {
                        "customer_id": {"$regex": clean_digits},
                        "transcript": {"$regex": r"\S"}
                    }),
                    sort=[("created_at", -1)]
                )
                if phone_call:
                    doc = phone_call

    # 4. Fallback to latest call by lead_id even without transcript
    if not doc:
        doc = await db.calls.find_one(
            tenant_filter(current_user, {"lead_id": call_id}),
            sort=[("created_at", -1)]
        )

    if not doc:
        raise HTTPException(status_code=404, detail="Call not found")
    doc["_id"] = None
    return doc

@app.post("/api/v1/calls/trigger")
async def trigger_bolna_call(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    enforce_no_foreign_company(current_user, payload)
    raw_digits = "".join(filter(str.isdigit, str(payload.get("phone_number", ""))))
    if len(raw_digits) == 10:
        phone_number = f"+91{raw_digits}"
    elif len(raw_digits) == 11 and raw_digits.startswith("0"):
        phone_number = f"+91{raw_digits[1:]}"
    elif len(raw_digits) == 12 and raw_digits.startswith("91"):
        phone_number = f"+{raw_digits}"
    else:
        phone_number = f"+{raw_digits}" if raw_digits else ""
    lead_id = payload.get("lead_id")
    if not lead_id or lead_id == "test-agent-call":
        import time
        lead_id = f"test-agent-call-{int(time.time()*1000)}"
    campaign_language = payload.get("campaign_language", "English")
    ai_voice = payload.get("ai_voice", "Default")
    voice_gender = payload.get("voice_gender", "Female")
    regional_accent = payload.get("regional_accent", "Default")

    api_key = os.environ.get("BOLNA_API_KEY", "").strip()

    db = mongodb.get_db()

    allowance = await billing_service.check_call_allowance(db, current_user["company_id"])
    if not allowance["allowed"]:
        raise HTTPException(status_code=402, detail=allowance["reason"])

    # Fetch real customer name if provided or if lead exists (scoped to this company)
    customer_name = ""
    if payload.get("customer_name") and str(payload.get("customer_name")).strip():
        customer_name = str(payload.get("customer_name")).strip()
    elif payload.get("name") and str(payload.get("name")).strip():
        customer_name = str(payload.get("name")).strip()
    elif lead_id and not lead_id.startswith("test-agent-call-"):
        lead = await db.leads.find_one(tenant_filter(current_user, {"lead_id": payload.get("lead_id")}))
        if not lead:
            try:
                from bson import ObjectId
                lead = await db.leads.find_one(tenant_filter(current_user, {"_id": ObjectId(payload.get("lead_id"))}))
            except Exception:
                pass
        if lead and lead.get("name"):
            customer_name = lead.get("name").strip()

    if not customer_name:
        existing_lead = await db.leads.find_one(tenant_filter(current_user, {"phone": phone_number}))
        if existing_lead and existing_lead.get("name"):
            customer_name = existing_lead.get("name").strip()

    if not customer_name:
        customer_name = "Valued Customer"

    # 2. Resolve this company's dedicated Bolna agent (never a shared global agent in strict mode)
    try:
        agent_id = await language_service.get_agent_id_for_language(db, campaign_language, current_user["company_id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not api_key or not agent_id:
        raise HTTPException(status_code=400, detail="Bolna.ai API Key or Agent ID not configured for this company")

    
    # Always fetch latest BASE_URL to ensure it reflects current ngrok/tunnel
    current_base_url = os.environ.get("BASE_URL", "http://localhost:8000").strip()

    call_industry = payload.get("industry")
    if not call_industry and 'lead' in locals() and lead:
        call_industry = lead.get("industry")
        if not call_industry and lead.get("campaign_id"):
            camp = await db.campaigns.find_one({"campaign_id": lead.get("campaign_id"), "company_id": current_user["company_id"]})
            if camp:
                call_industry = camp.get("industry")
    if not call_industry:
        company_doc = await db.companies.find_one({"company_id": current_user["company_id"]})
        if company_doc:
            call_industry = company_doc.get("industry", "general_sales")

    # If this is a quick call, insert or update the lead in CRM so it shows on the Leads page.
    # Reuse an existing lead for this phone number AND name (same company)
    # instead of minting a new one every time - confirmed live: repeated
    # Quick Calls to the same number were creating a new duplicate lead row
    # on every click, since this always upserted under the freshly-generated
    # quick-call-<timestamp> id rather than checking for an existing lead
    # first. Matching on name too (not phone alone) matters in practice: a
    # phone number can legitimately be called under more than one name
    # (e.g. a shared/reused test or office line) and phone-only matching
    # silently merged those into one lead, overwriting whoever was called
    # most recently - confirmed live, a customer's own call results
    # appeared to vanish from the Leads page once a different name was
    # called on the same number. The call record below still gets its own
    # unique call_id per attempt - only the lead identity is deduplicated.
    # Resolved lead_id for this call - equal to the call's own id unless the
    # quick-call branch below reuses an existing lead under a different id.
    # Stored on the call record so finalize_plivo_call can find the right
    # lead to update after analysis, instead of assuming lead_id == call_id
    # (true before the dedup fix, no longer guaranteed for reused leads -
    # confirmed live: a fully analyzed call's results were never reaching
    # any lead document because of exactly this mismatch).
    resolved_lead_id = lead_id
    if lead_id.startswith("quick-call-"):
        existing_quick_lead = await db.leads.find_one(
            tenant_filter(current_user, {"phone": phone_number, "name": customer_name})
        )
        quick_lead_id = existing_quick_lead["lead_id"] if existing_quick_lead else lead_id
        resolved_lead_id = quick_lead_id
        
        # Resolve offering: if payload provides an explicit offering, use it.
        # If payload offering is omitted (e.g. quick call from modal), only retain
        # existing lead's offering if their stored industry matches call_industry.
        # If switching industries, purge stale cross-industry offering.
        resolved_offering = str(payload.get("offering") or "").strip()
        if not resolved_offering and existing_quick_lead:
            ex_ind = (existing_quick_lead.get("industry") or "").strip().lower()
            if not ex_ind or ex_ind == call_industry:
                resolved_offering = str(existing_quick_lead.get("offering") or existing_quick_lead.get("property") or "").strip()
        
        await db.leads.update_one(
            {"lead_id": quick_lead_id, "company_id": current_user["company_id"]},
            {"$set": {
                "name": customer_name,
                "phone": phone_number,
                "offering": resolved_offering,
                "property": resolved_offering,
                "location": payload.get("location", ""),
                "industry": call_industry,
                "status": "Calling",
                "lastContact": datetime.utcnow().isoformat(),
            },
            "$setOnInsert": {
                "lead_id": quick_lead_id,
                "custom_fields": {},
                "aiScore": 0,
                "created_at": datetime.utcnow(),
                "company_id": current_user["company_id"]
            }},
            upsert=True
        )
    
    # Resolve lead attributes for call record
    lead_amount = (
        payload.get("amount_due")
        or (lead.get("amount_due") if 'lead' in locals() and lead else None)
        or (lead.get("custom_fields", {}).get("amount_due") if 'lead' in locals() and lead else None)
        or (lead.get("custom_fields", {}).get("Loan Amount") if 'lead' in locals() and lead else None)
    )
    lead_due = (
        payload.get("due_date")
        or (lead.get("due_date") if 'lead' in locals() and lead else None)
        or (lead.get("custom_fields", {}).get("due_date") if 'lead' in locals() and lead else None)
        or (lead.get("custom_fields", {}).get("due date") if 'lead' in locals() and lead else None)
    )
    lead_custom = (
        payload.get("custom_fields")
        or (lead.get("custom_fields") if 'lead' in locals() and lead else {})
        or {}
    )

    await db.calls.update_one(
        {"call_id": lead_id, "company_id": current_user["company_id"]},
        {"$set": {
            "customer_id": phone_number,
            "customer_name": customer_name,
            "lead_id": resolved_lead_id,
            "direction": "outbound",
            "transcript": "",
            "status": "Initiating",
            "created_at": datetime.utcnow(),
            "language": campaign_language,
            "detected_language": campaign_language,
            "preferred_language": campaign_language,
            "transcript_language": campaign_language,
            "ai_voice": ai_voice,
            "voice_gender": voice_gender,
            "regional_accent": regional_accent,
            "company_id": current_user["company_id"],
            "campaign_id": lead.get("campaign_id") if 'lead' in locals() and lead else None,
            "industry": call_industry,
            "amount_due": lead_amount,
            "due_date": lead_due,
            "custom_fields": lead_custom
        }},
        upsert=True
    )

    url = "https://api.bolna.ai/call"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    bolna_payload = {
        "agent_id": agent_id,
        "recipient_phone_number": phone_number,
        "webhook_url": f"{current_base_url}/webhooks/bolna",
        "user_data": {
            "lead_id": lead_id,
            "customer_name": customer_name,
            "agent_name": "AI Agent",
            "campaign_language": campaign_language,
            "ai_voice": ai_voice,
            "voice_gender": voice_gender,
            "regional_accent": regional_accent,
            "company_id": current_user["company_id"]
        }
    }

    # Fetch custom prompt from DB (published prompt is what live calls use)
    prompt_doc = await db.prompts.find_one({"company_id": current_user["company_id"]})
    _bp, _wm = _effective_prompt(prompt_doc, industry=call_industry)
    base_prompt = _bp or "You are an AI sales agent for TalklyAI. Be polite and helpful."

    # Replace variables (supports {{customer_name}}, {customer_name}, {{lead_name}}, {lead_name}, etc.)
    prompt_text = base_prompt
    name_tags = ["{{customer_name}}", "{customer_name}", "{{lead_name}}", "{lead_name}", "{{name}}", "{name}", "{{lead}}", "{lead}"]
    for tag in name_tags:
        prompt_text = prompt_text.replace(tag, customer_name)
    company = await db.companies.find_one({"company_id": current_user["company_id"]})
    company_name_val = company.get("name") if company else "Company"
    
    # Resolve Caller ID (Dedicated Custom Line or Talkly Shared Line)
    company_telephony = company.get("telephony") if company else {}
    if company_telephony and company_telephony.get("mode") == "custom" and company_telephony.get("phone_number"):
        caller_id = company_telephony["phone_number"]
        telephony_provider = company_telephony.get("provider", "custom")
        # Note: Bolna agent e8ea6527 uses Plivo as its carrier. Only send from_phone_number if provider is Plivo
        if telephony_provider.lower() == "plivo":
            bolna_payload["from_phone_number"] = caller_id
    else:
        shared_env = os.environ.get("TALKLY_SHARED_NUMBER", "").strip()
        if shared_env and shared_env != "+918031830100":
            bolna_payload["from_phone_number"] = shared_env
            caller_id = shared_env
        else:
            caller_id = "Talkly Shared Carrier"
        telephony_provider = "talkly_shared"

    bolna_payload["user_data"]["caller_id"] = caller_id
    bolna_payload["user_data"]["telephony_provider"] = telephony_provider
    prompt_text = prompt_text.replace("{{company_name}}", company_name_val)

    # Dynamic variables from lead record
    lead_obj = None
    if 'lead' in locals() and lead:
        lead_obj = lead
    elif lead_id and not str(lead_id).startswith("test-agent-call-"):
        lead_obj = await db.leads.find_one({"lead_id": lead_id, "company_id": current_user["company_id"]})
        if not lead_obj:
            try:
                from bson import ObjectId
                lead_obj = await db.leads.find_one({"_id": ObjectId(lead_id), "company_id": current_user["company_id"]})
            except Exception:
                pass
    if not lead_obj and resolved_lead_id:
        lead_obj = await db.leads.find_one({"lead_id": resolved_lead_id, "company_id": current_user["company_id"]})

    lead_dict = lead_obj or {}
    is_test_call = bool(lead_id and str(lead_id).startswith("test-agent-call"))

    offering_val = ""
    # 1. Payload offering override
    if payload.get("offering"):
        offering_val = str(payload.get("offering")).strip()

    # 2. Lead offering (only if not a test call and industry matches)
    if not offering_val and not is_test_call:
        lead_ind = (lead_dict.get("industry") or "").strip().lower()
        if not lead_ind or lead_ind == "general_sales" or lead_ind == call_industry:
            offering_val = str(lead_dict.get("offering") or lead_dict.get("property") or "").strip()

    # 3. Campaign offering
    if not offering_val and lead_dict.get("campaign_id"):
        camp = await db.campaigns.find_one({"campaign_id": lead_dict["campaign_id"]})
        if camp:
            offering_val = str(camp.get("offering") or camp.get("property") or "").strip()

    # 4. Cross-industry sanity filter
    if offering_val and call_industry:
        off_lower = offering_val.lower()
        cross_mismatched = False
        if call_industry == "real_estate" and any(w in off_lower for w in ["certification", "course", "curriculum", "scholarship", "degree", "doctor", "clinic", "patient", "loan emi"]):
            cross_mismatched = True
        elif call_industry == "edtech" and any(w in off_lower for w in ["villa", "bhk", "flat", "apartment", "doctor", "clinic", "patient"]):
            cross_mismatched = True
        elif call_industry == "healthcare" and any(w in off_lower for w in ["villa", "bhk", "flat", "apartment", "course", "certification", "degree", "curriculum"]):
            cross_mismatched = True
        elif call_industry == "bfsi" and any(w in off_lower for w in ["villa", "flat", "bhk", "course", "certification", "curriculum", "doctor", "clinic"]):
            cross_mismatched = True
        if cross_mismatched:
            offering_val = ""

    ind_entry = (prompt_doc.get("industry_prompts") or {}).get(call_industry, {}) if prompt_doc else {}

    # 5. Prompt document offering
    if not offering_val and prompt_doc:
        if ind_entry and ind_entry.get("offering"):
            offering_val = str(ind_entry.get("offering")).strip()
        elif prompt_doc.get("industry") == call_industry and prompt_doc.get("offering"):
            prompt_off = str(prompt_doc.get("offering")).strip()
            if prompt_off and not (call_industry == "real_estate" and any(w in prompt_off.lower() for w in ["certification", "course", "degree"])):
                offering_val = prompt_off

    # 6. Industry fallback
    if not offering_val:
        industry_fallbacks = {
            "real_estate": "property",
            "healthcare": "consultation",
            "edtech": "program",
            "bfsi": "loan",
            "general_sales": "solution"
        }
        custom_templates = (prompt_doc.get("custom_templates") or []) if prompt_doc else []
        custom_map = {t["id"]: t for t in custom_templates if isinstance(t, dict) and t.get("id")}
        template_def = custom_map.get(call_industry, {})
        offering_val = (
            industry_fallbacks.get(call_industry)
            or template_def.get("offering")
            or template_def.get("offering_placeholder")
            or template_def.get("default_offering_label")
            or "service"
        )

    location_val = str(lead_dict.get("location") or payload.get("location") or "")
    if "cyber" in location_val.lower() or "dlf" in location_val.lower():
        location_val = ""
    prompt_text = prompt_text.replace("{{offering}}", offering_val)
    prompt_text = prompt_text.replace("{{property_name}}", offering_val)
    prompt_text = prompt_text.replace("{{property_location}}", location_val)
    prompt_text = prompt_text.replace("{{location}}", location_val)
    for ck, cv in lead_dict.get("custom_fields", {}).items():
        if cv is not None:
            prompt_text = prompt_text.replace(f"{{{{{ck}}}}}", str(cv)).replace(f"{{{ck}}}", str(cv))

    # Dynamic variables from prompt document, lead document, and industry settings
    dyn_dispatch = {}
    if prompt_doc and isinstance(prompt_doc.get("variables"), dict):
        dyn_dispatch.update(prompt_doc["variables"])
    if ind_entry and isinstance(ind_entry.get("variables"), dict):
        dyn_dispatch.update(ind_entry["variables"])

    # Include lead custom fields and root attributes
    if lead_dict:
        for k in ["amount_due", "due_date", "loan_amount", "tenure", "company_size", "doctor_name", "budget"]:
            if lead_dict.get(k):
                dyn_dispatch[k] = str(lead_dict[k]).strip()
        for ck, cv in (lead_dict.get("custom_fields") or {}).items():
            if cv is not None:
                dyn_dispatch[ck] = str(cv).strip()

    # Include payload overrides
    if payload.get("amount_due"):
        dyn_dispatch["amount_due"] = str(payload["amount_due"]).strip()
    if payload.get("due_date"):
        dyn_dispatch["due_date"] = str(payload["due_date"]).strip()

    # Universal aliases for loan/overdue amount
    amt_val = (
        dyn_dispatch.get("amount_due")
        or dyn_dispatch.get("loan_amount")
        or dyn_dispatch.get("Loan Amount")
        or dyn_dispatch.get("loan amount")
        or dyn_dispatch.get("amount")
        or dyn_dispatch.get("order_amount")
        or lead_dict.get("amount_due")
        or ""
    )
    if amt_val:
        clean_amt = str(amt_val).replace("₹", "").replace("Rs.", "").replace(",", "").strip()
        dyn_dispatch["amount_due"] = clean_amt
        dyn_dispatch["loan_amount"] = clean_amt
        dyn_dispatch["Loan Amount"] = clean_amt

    # Universal aliases for due date with spoken date format
    due_val = (
        dyn_dispatch.get("due_date")
        or dyn_dispatch.get("due date")
        or dyn_dispatch.get("Due Date")
        or dyn_dispatch.get("payment_date")
        or dyn_dispatch.get("date")
        or lead_dict.get("due_date")
        or ""
    )
    if due_val:
        spoken_due = str(due_val).strip()
        if spoken_due.endswith(" 00:00:00"):
            spoken_due = spoken_due[:-9].strip()
        if re.match(r"^\d{4}-\d{2}-\d{2}$", spoken_due):
            try:
                parsed_dt = datetime.strptime(spoken_due, "%Y-%m-%d")
                spoken_due = parsed_dt.strftime("%d %B %Y")
            except Exception:
                pass
        dyn_dispatch["due_date"] = spoken_due
        dyn_dispatch["due date"] = spoken_due
        dyn_dispatch["Due Date"] = spoken_due

    for vk, vv in dyn_dispatch.items():
        prompt_text = prompt_text.replace(f"{{{{{vk}}}}}", str(vv)).replace(f"{{{vk}}}", str(vv))
    
    # Strip double currency symbols in prompt
    prompt_text = re.sub(r"₹\s*₹", "₹", prompt_text)
    
    bolna_payload["user_data"]["company_name"] = company_name_val
    # Add language instructions if not English
    if campaign_language.lower() != "english":
        prompt_text += f"\n\nIMPORTANT: You MUST speak entirely in the {campaign_language} language. Please reply naturally in {campaign_language}."

    bolna_payload["user_data"]["system_prompt"] = prompt_text
    bolna_payload["agent_prompts"] = {
        "task_1": {
            "system_prompt": prompt_text
        }
    }

    welcome_message = _wm
    if welcome_message:
        welcome_text = welcome_message.replace("{{customer_name}}", customer_name)
        welcome_text = welcome_text.replace("{{company_name}}", company_name_val)
        welcome_text = welcome_text.replace("{{offering}}", offering_val)
        welcome_text = welcome_text.replace("{{property_name}}", offering_val)
        welcome_text = welcome_text.replace("{{property_location}}", location_val)
        welcome_text = welcome_text.replace("{{location}}", location_val)
        for ck, cv in lead_dict.get("custom_fields", {}).items():
            if cv is not None:
                welcome_text = welcome_text.replace(f"{{{{{ck}}}}}", str(cv)).replace(f"{{{ck}}}", str(cv))
        for vk, vv in dyn_dispatch.items():
            welcome_text = welcome_text.replace(f"{{{{{vk}}}}}", str(vv)).replace(f"{{{vk}}}", str(vv))
        welcome_text = re.sub(r"₹\s*₹", "₹", welcome_text)
        welcome_text = re.sub(r"Rs\.?\s*₹", "₹", welcome_text, flags=re.IGNORECASE)
        _dedupe_plural_word = re.compile(r"\b(\w+?)(?:s|es)?\s+\1(?:s|es)?\b", re.IGNORECASE)
        welcome_text = _dedupe_plural_word.sub(r"\1", welcome_text)
        prompt_text = _dedupe_plural_word.sub(r"\1", prompt_text)
        bolna_payload["agent_config"] = {
            "agent_welcome_message": welcome_text
        }
        bolna_payload["user_data"]["welcome_message"] = welcome_text

    # Direct Plivo Dispatch: If company has a custom Plivo line OR uses Talkly's shared Plivo line
    plivo_auth_id = None
    plivo_auth_token = None
    plivo_from_number = None

    if company_telephony and company_telephony.get("mode") == "custom" and company_telephony.get("provider", "").lower() == "plivo":
        plivo_auth_id = company_telephony.get("account_sid")
        plivo_auth_token = company_telephony.get("auth_token")
        plivo_from_number = company_telephony.get("phone_number")
    elif not (company_telephony and company_telephony.get("mode") == "custom" and company_telephony.get("provider", "").lower() in ["twilio", "exotel"]):
        # Shared mode or default: use Talkly's shared Plivo line
        plivo_auth_id = os.environ.get("PLIVO_AUTH_ID")
        plivo_auth_token = os.environ.get("PLIVO_AUTH_TOKEN")
        plivo_from_number = os.environ.get("PLIVO_PHONE_NUMBER") or os.environ.get("TALKLY_SHARED_NUMBER", "+918065535758")

    if plivo_auth_id and plivo_auth_token and plivo_from_number:
        from telephony.plivo_provider import PlivoProvider
        plivo_prov = PlivoProvider(plivo_auth_id, plivo_auth_token, default_from=plivo_from_number)
        try:
            mode_tag = "Custom Line" if company_telephony and company_telephony.get("mode") == "custom" else "Talkly Shared Line"
            print(f"Routing call directly via Plivo API ({mode_tag}) from {plivo_from_number} to {phone_number}")
            plivo_res = await plivo_prov.trigger_outbound_call(
                to_phone_number=phone_number,
                lead_id=lead_id,
                company_id=current_user["company_id"],
                from_phone_number=plivo_from_number,
                base_url=current_base_url
            )
            await db.calls.update_one(
                {"call_id": lead_id},
                {"$set": {
                    "status": "Initiated",
                    "provider": "plivo",
                    "caller_id": plivo_from_number,
                    "plivo_request_uuid": plivo_res.get("plivo_request_uuid")
                }}
            )

            # Pre-synthesize the welcome greeting in background while the phone is ringing
            try:
                company_engine = (company.get("conversation_engine") if company else None) or "decoupled"
                if company_engine == "decoupled" and welcome_text:
                    from routes.plivo_decoupled import prewarm_decoupled_greeting
                    from services.bakbak_tts import bakbak_voice_for
                    lang_hint = "hi" if any("\u0900" <= c <= "\u097f" for c in welcome_text) else "en"
                    b_voice = bakbak_voice_for(lang_hint)
                    if b_voice:
                        prewarm_decoupled_greeting(
                            call_id=lead_id,
                            company_id=current_user["company_id"],
                            welcome_text=welcome_text,
                            bakbak_voice_id=b_voice["voice_id"],
                            bakbak_language=b_voice["language"],
                            bakbak_model=b_voice.get("model", "m1")
                        )
            except Exception as pw_err:
                print(f"[PREWARM TRIGGER NOTICE]: {pw_err}")

            return {
                "status": "success",
                "execution_id": plivo_res.get("plivo_request_uuid"),
                "provider": "plivo",
                "caller_id": plivo_from_number,
                "message": f"Direct Plivo call dispatched successfully from {plivo_from_number} ({mode_tag})"
            }
        except Exception as e:
            print(f"Direct Plivo dispatch error: {e}")
            await db.calls.update_one({"call_id": lead_id}, {"$set": {"status": "Failed"}})
            raise HTTPException(status_code=500, detail=f"Plivo Dispatch Error: {str(e)}")

    # Twilio/Exotel custom lines have no working dispatch path today - only
    # direct Plivo dispatch is implemented, and the Bolna payload below is
    # dead (Bolna is no longer the live call provider). Previously this fell
    # through silently and the call just never rang; fail loudly instead so
    # it's visible rather than looking like a successful dispatch that
    # mysteriously never connects.
    if company_telephony and company_telephony.get("mode") == "custom" and company_telephony.get("provider", "").lower() in ["twilio", "exotel"]:
        await db.calls.update_one({"call_id": lead_id}, {"$set": {"status": "Failed"}})
        raise HTTPException(
            status_code=501,
            detail=f"{company_telephony.get('provider', '').title()} outbound dispatch isn't supported yet - only Plivo (Talkly shared number or a Plivo custom line) can place live calls. Disconnect this line in Settings or connect a Plivo number instead."
        )

    try:
        import json
        with open("payload_dump.json", "w") as f:
            json.dump(bolna_payload, f, indent=2)
            
        print(f"Triggering Bolna call to {phone_number} with webhook_url: {bolna_payload['webhook_url']}")
        print(f"DUMPING BOLNA PAYLOAD: {json.dumps(bolna_payload, indent=2)}")
        response = requests.post(url, json=bolna_payload, headers=headers, timeout=30)
        
        # Graceful fallback: If Bolna rejects the custom caller ID, retry with default carrier routing
        if not response.ok and "from_phone_number" in bolna_payload and ("doesn't exist" in response.text or "from_number" in response.text):
            print(f"Notice: Bolna rejected caller ID {bolna_payload.get('from_phone_number')}, falling back to default routing...")
            bolna_payload.pop("from_phone_number", None)
            response = requests.post(url, json=bolna_payload, headers=headers, timeout=30)

        if not response.ok:
            await db.calls.update_one({"call_id": lead_id}, {"$set": {"status": "Failed"}})
            raise HTTPException(status_code=response.status_code, detail=f"Bolna Error: {response.text}")
        
        bolna_data = response.json()
        execution_id = bolna_data.get("execution_id")
        
        if execution_id:
            # Start a background polling task as a fallback for webhooks
            asyncio.create_task(poll_bolna_execution(execution_id, lead_id, api_key))
            
        return bolna_data
    except HTTPException:
        raise
    except Exception as e:
        await db.calls.update_one({"call_id": lead_id}, {"$set": {"status": "Error"}})
        raise HTTPException(status_code=500, detail=f"API Error: {str(e)}")

async def process_bulk_calls(contacts: list, campaign_language: str = "English", ai_voice: str = "Default", voice_gender: str = "Female", regional_accent: str = "Default", company_id: str = None):
    api_key = os.environ.get("BOLNA_API_KEY", "").strip()
    
    db = mongodb.get_db()
    
    # Dynamically fetch Agent ID based on Database mapping
    agent_id = await language_service.get_agent_id_for_language(db, campaign_language, company_id)
    
    if not api_key or not agent_id:
        return
    current_base_url = os.environ.get("BASE_URL", "http://localhost:8000").strip()
    url = "https://api.bolna.ai/call"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    for idx, contact in enumerate(contacts):
        phone_str = str(contact.get("phone", "")).replace(" ", "").replace("-", "").replace("(", "").replace(")", "").strip()
        customer_name = str(contact.get("name", "Bulk Phone Lead")).strip()
        
        # Ensure it has a country code (assuming +91 for 10-digit Indian numbers)
        if phone_str and not phone_str.startswith("+"):
            if len(phone_str) == 10 and phone_str.isdigit():
                phone_str = f"+91{phone_str}"
            else:
                phone_str = f"+{phone_str}"
                
        if not phone_str:
            continue
            
        lead_id = contact.get("lead_id") or f"bulk_{int(time.time() * 1000)}_{idx}"
        
        campaign_id_val = contact.get("campaign_id")
        contact_industry = contact.get("industry")
        if not contact_industry and campaign_id_val:
            camp = await db.campaigns.find_one({"campaign_id": campaign_id_val})
            if camp:
                contact_industry = camp.get("industry")
        if not contact_industry and company_id:
            comp = await db.companies.find_one({"company_id": company_id})
            if comp:
                contact_industry = comp.get("industry")
        
        await db.calls.insert_one({
            "call_id": lead_id,
            "lead_id": contact.get("lead_id") or lead_id,
            "customer_id": phone_str,
            "customer_name": customer_name,
            "direction": "outbound",
            "transcript": "",
            "status": "Initiating",
            "created_at": datetime.utcnow(),
            "language": campaign_language,
            "detected_language": campaign_language,
            "preferred_language": campaign_language,
            "transcript_language": campaign_language,
            "ai_voice": ai_voice,
            "voice_gender": voice_gender,
            "regional_accent": regional_accent,
            "company_id": company_id,
            "campaign_id": campaign_id_val,
            "industry": contact_industry,
            "amount_due": contact.get("amount_due"),
            "due_date": contact.get("due_date"),
            "custom_fields": contact.get("custom_fields") or {}
        })
        
        bolna_payload = {
            "agent_id": agent_id,
            "recipient_phone_number": phone_str,
            "webhook_url": f"{current_base_url}/webhooks/bolna",
            "user_data": {
                "lead_id": lead_id,
                "customer_name": customer_name,
                "agent_name": "AI Agent",
                "campaign_language": campaign_language,
                "ai_voice": ai_voice,
                "voice_gender": voice_gender,
                "regional_accent": regional_accent
            }
        }

        # Fetch custom prompt from DB (published)
        prompt_doc = await db.prompts.find_one({"company_id": company_id})
        _bp, _wm = _effective_prompt(prompt_doc)
        base_prompt = _bp or "You are an AI sales agent for TalklyAI. Be polite and helpful."

        # Replace variables
        prompt_text = base_prompt.replace("{{customer_name}}", customer_name)
        company = await db.companies.find_one({"company_id": company_id})
        company_name_val = company.get("name") if company else "Company"

        company_telephony = company.get("telephony") if company else {}
        if company_telephony and company_telephony.get("mode") == "custom" and company_telephony.get("phone_number"):
            caller_id = company_telephony["phone_number"]
            telephony_provider = company_telephony.get("provider", "custom")
            if telephony_provider.lower() == "plivo":
                bolna_payload["from_phone_number"] = caller_id
        else:
            shared_env = os.environ.get("TALKLY_SHARED_NUMBER", "").strip()
            if shared_env and shared_env != "+918031830100":
                bolna_payload["from_phone_number"] = shared_env
                caller_id = shared_env
            else:
                caller_id = "Talkly Shared Carrier"
            telephony_provider = "talkly_shared"

        bolna_payload["user_data"]["caller_id"] = caller_id
        bolna_payload["user_data"]["telephony_provider"] = telephony_provider
        prompt_text = prompt_text.replace("{{company_name}}", company_name_val)

        # Dynamic variable replacement from contact/lead
        offering_val = str(contact.get("offering") or contact.get("property") or "")
        location_val = str(contact.get("location") or "")
        prompt_text = prompt_text.replace("{{offering}}", offering_val)
        prompt_text = prompt_text.replace("{{property_name}}", offering_val)
        prompt_text = prompt_text.replace("{{property_location}}", location_val)
        prompt_text = prompt_text.replace("{{location}}", location_val)
        for ck, cv in contact.get("custom_fields", {}).items():
            if cv is not None:
                prompt_text = prompt_text.replace(f"{{{{{ck}}}}}", str(cv))
        
        bolna_payload["user_data"]["company_name"] = company_name_val
        
        # Add language instructions if not English
        if campaign_language.lower() != "english":
            prompt_text += f"\n\nIMPORTANT: You MUST speak entirely in the {campaign_language} language. Please reply naturally in {campaign_language}."

        bolna_payload["user_data"]["system_prompt"] = prompt_text
        bolna_payload["agent_prompts"] = {
            "task_1": {
                "system_prompt": prompt_text
            }
        }
        
        welcome_message = _wm
        if welcome_message:
            welcome_text = welcome_message.replace("{{customer_name}}", customer_name)
            welcome_text = welcome_text.replace("{{company_name}}", company_name_val)
            welcome_text = welcome_text.replace("{{offering}}", offering_val)
            welcome_text = welcome_text.replace("{{property_name}}", offering_val)
            welcome_text = welcome_text.replace("{{property_location}}", location_val)
            welcome_text = welcome_text.replace("{{location}}", location_val)
            for ck, cv in contact.get("custom_fields", {}).items():
                if cv is not None:
                    welcome_text = welcome_text.replace(f"{{{{{ck}}}}}", str(cv))
            _dedupe_plural_word = re.compile(r"\b(\w+?)(?:s|es)?\s+\1(?:s|es)?\b", re.IGNORECASE)
            welcome_text = _dedupe_plural_word.sub(r"\1", welcome_text)
            bolna_payload["agent_config"] = {
                "agent_welcome_message": welcome_text
            }
            bolna_payload["user_data"]["welcome_message"] = welcome_text
        
        print(f"DEBUG: Parsed name for {phone_str} is -> '{customer_name}'")
        
        # Direct Plivo Dispatch in Bulk - mirrors the single-call /api/v1/calls/trigger
        # path: use the company's own Plivo account if configured, otherwise fall back
        # to Talkly's shared Plivo line. Without this fallback, every company on the
        # shared line (the normal/default setup) silently fell through to the Bolna
        # branch below, which uses a different voice/STT stack with none of a
        # published prompt's Collections compliance rules or Sarvam Indian-accent
        # voice behind it.
        bulk_plivo_auth_id = None
        bulk_plivo_auth_token = None
        bulk_plivo_from_number = None
        if company_telephony and company_telephony.get("mode") == "custom" and company_telephony.get("provider", "").lower() == "plivo":
            bulk_plivo_auth_id = company_telephony.get("account_sid")
            bulk_plivo_auth_token = company_telephony.get("auth_token")
            bulk_plivo_from_number = company_telephony.get("phone_number") or caller_id
        elif not (company_telephony and company_telephony.get("mode") == "custom" and company_telephony.get("provider", "").lower() in ["twilio", "exotel"]):
            bulk_plivo_auth_id = os.environ.get("PLIVO_AUTH_ID")
            bulk_plivo_auth_token = os.environ.get("PLIVO_AUTH_TOKEN")
            bulk_plivo_from_number = os.environ.get("PLIVO_PHONE_NUMBER") or os.environ.get("TALKLY_SHARED_NUMBER", "+918065535758")

        if bulk_plivo_auth_id and bulk_plivo_auth_token and bulk_plivo_from_number:
            from telephony.plivo_provider import PlivoProvider
            plivo_prov = PlivoProvider(bulk_plivo_auth_id, bulk_plivo_auth_token, default_from=bulk_plivo_from_number)
            try:
                print(f"Bulk: Routing directly via Plivo API from {bulk_plivo_from_number} to {phone_str}")
                plivo_res = await plivo_prov.trigger_outbound_call(
                    to_phone_number=phone_str,
                    lead_id=lead_id,
                    company_id=company_id,
                    from_phone_number=bulk_plivo_from_number,
                    base_url=current_base_url
                )
                await db.calls.update_one(
                    {"call_id": lead_id},
                    {"$set": {
                        "status": "Initiated",
                        "provider": "plivo",
                        "caller_id": bulk_plivo_from_number,
                        "plivo_request_uuid": plivo_res.get("plivo_request_uuid")
                    }}
                )
                try:
                    company_engine = (company.get("conversation_engine") if company else None) or "decoupled"
                    if company_engine == "decoupled" and welcome_text:
                        from routes.plivo_decoupled import prewarm_decoupled_greeting
                        from services.bakbak_tts import bakbak_voice_for
                        lang_hint = "hi" if any("\u0900" <= c <= "\u097f" for c in welcome_text) else "en"
                        b_voice = bakbak_voice_for(lang_hint)
                        if b_voice:
                            prewarm_decoupled_greeting(
                                call_id=lead_id,
                                company_id=company_id,
                                welcome_text=welcome_text,
                                bakbak_voice_id=b_voice["voice_id"],
                                bakbak_language=b_voice["language"],
                                bakbak_model=b_voice.get("model", "m1")
                            )
                except Exception as pw_err:
                    print(f"[PREWARM BULK NOTICE]: {pw_err}")
                await asyncio.sleep(0.5)
                continue
            except Exception as e:
                print(f"Bulk Plivo dispatch error for {phone_str}: {e}")
                await db.calls.update_one({"call_id": lead_id}, {"$set": {"status": "Failed"}})
                await asyncio.sleep(0.5)
                continue

        try:
            import json
            print(f"Triggering Bulk Bolna call to {phone_str} with webhook_url: {bolna_payload['webhook_url']}")
            print(f"DUMPING BOLNA BULK PAYLOAD: {json.dumps(bolna_payload, indent=2)}")
            # Run blocking request in threadpool
            response = await run_in_threadpool(requests.post, url, json=bolna_payload, headers=headers, timeout=30)
            
            # Graceful fallback: If Bolna rejects the custom caller ID, retry with default carrier routing
            if not response.ok and "from_phone_number" in bolna_payload and ("doesn't exist" in response.text or "from_number" in response.text):
                print(f"Notice: Bolna rejected caller ID {bolna_payload.get('from_phone_number')} in bulk, retrying with default routing...")
                bolna_payload.pop("from_phone_number", None)
                response = await run_in_threadpool(requests.post, url, json=bolna_payload, headers=headers, timeout=30)

            if response.ok:
                bolna_data = response.json()
                execution_id = bolna_data.get("execution_id")
                if execution_id:
                    asyncio.create_task(poll_bolna_execution(execution_id, lead_id, api_key))
            else:
                await db.calls.update_one({"call_id": lead_id}, {"$set": {"status": "Failed"}})
                print(f"Bolna Bulk Error for {phone_str}: {response.text}")
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error processing bulk call for {phone_str}: {e}")
            await db.calls.update_one({"call_id": lead_id}, {"$set": {"status": "Error"}})
            print(f"API Bulk Error for {phone_str}: {str(e)}")
            
        await asyncio.sleep(0.5)

@app.post("/api/v1/calls/trigger-bulk")
async def trigger_bolna_bulk(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    campaign_language: str = Form("English"),
    ai_voice: str = Form("Default"),
    voice_gender: str = Form("Female"),
    regional_accent: str = Form("Default"),
    preview_only: bool = Form(False),
    current_user: dict = Depends(require_company_access)
):
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Only .xlsx and .csv files are supported")

    if not preview_only:
        db = mongodb.get_db()
        allowance = await billing_service.check_call_allowance(db, current_user["company_id"])
        if not allowance["allowed"]:
            raise HTTPException(status_code=402, detail=allowance["reason"])

    contents = await file.read()
    contacts = []
    
    try:
        if file.filename.endswith('.csv'):
            import csv
            content_str = contents.decode('utf-8', errors='replace')
            reader = csv.reader(io.StringIO(content_str))
            
            rows = list(reader)
            if rows:
                header_row = rows[0]
                phone_col_idx = 0
                name_col_idx = -1
                
                for idx, cell in enumerate(header_row):
                    cell_str = str(cell).lower().strip() if cell else ""
                    if cell_str in ["phone", "phone number", "phone_number", "number", "mobile"]:
                        phone_col_idx = idx
                    elif cell_str in ["name", "customer name", "customer_name", "first name", "full name"]:
                        name_col_idx = idx
                        
                for row in rows[1:]:
                    if row and len(row) > phone_col_idx and row[phone_col_idx]:
                        phone_val = str(row[phone_col_idx]).strip()
                        digits = re.sub(r'\D', '', phone_val)
                        if len(digits) >= 10:
                            name = "Bulk Phone Lead"
                            if name_col_idx != -1 and len(row) > name_col_idx and row[name_col_idx]:
                                name = str(row[name_col_idx]).strip()
                            contacts.append({"phone": phone_val, "name": name})
        else:
            wb = openpyxl.load_workbook(io.BytesIO(contents))
            sheet = wb.active
            
            header_row = next(sheet.iter_rows(min_row=1, max_row=1, values_only=True), None)
            phone_col_idx = 0
            name_col_idx = -1
            
            if header_row:
                for idx, cell in enumerate(header_row):
                    cell_str = str(cell).lower().strip() if cell else ""
                    if cell_str in ["phone", "phone number", "phone_number", "number", "mobile"]:
                        phone_col_idx = idx
                    elif cell_str in ["name", "customer name", "customer_name", "first name", "full name"]:
                        name_col_idx = idx
                        
            for row in sheet.iter_rows(min_row=2 if header_row else 1, values_only=True):
                if row and len(row) > phone_col_idx and row[phone_col_idx]:
                    phone_val = str(row[phone_col_idx]).strip()
                    digits = re.sub(r'\D', '', phone_val)
                    if len(digits) >= 10:
                        name = "Bulk Phone Lead"
                        if name_col_idx != -1 and len(row) > name_col_idx and row[name_col_idx]:
                            name = str(row[name_col_idx]).strip()
                        contacts.append({"phone": phone_val, "name": name})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading Excel file: {str(e)}")
        
    if not contacts:
        raise HTTPException(status_code=400, detail="No phone numbers found in the Excel file.")
        
    if preview_only:
        return {
            "status": "success",
            "message": f"Parsed {len(contacts)} numbers for preview.",
            "contacts": contacts,
            "count": len(contacts)
        }
        
    background_tasks.add_task(process_bulk_calls, contacts, campaign_language, ai_voice, voice_gender, regional_accent, current_user["company_id"])
    
    return {
        "status": "success",
        "message": f"Successfully initiated bulk calls for {len(contacts)} numbers.",
        "contacts": contacts,
        "count": len(contacts)
    }

@app.post("/api/v1/calls/trigger-campaigns")
async def trigger_campaign_calls(
    background_tasks: BackgroundTasks,
    payload: dict = Body(...),
    current_user: dict = Depends(require_company_access)
):
    campaign_ids = payload.get("campaign_ids", [])
    if not campaign_ids:
        raise HTTPException(status_code=400, detail="No campaigns selected")
        
    db = mongodb.get_db()
    contacts = []
    
    # "No Answer" is retriable too - a lead that never connected shouldn't be
    # permanently stuck just because one attempt was already made.
    leads = await db.leads.find({
        "campaign_id": {"$in": campaign_ids},
        "company_id": current_user["company_id"],
        "status": {"$in": ["New", "No Answer"]}
    }).to_list(length=1000)
    
    for lead in leads:
        if lead.get("phone"):
            contacts.append({
                "lead_id": lead.get("lead_id"),
                "phone": lead.get("phone"),
                "name": lead.get("name", "Lead"),
                "campaign_id": lead.get("campaign_id"),
                "amount_due": lead.get("amount_due") or (lead.get("custom_fields") or {}).get("amount_due") or (lead.get("custom_fields") or {}).get("Loan Amount"),
                "due_date": lead.get("due_date") or (lead.get("custom_fields") or {}).get("due_date") or (lead.get("custom_fields") or {}).get("due date"),
                "custom_fields": lead.get("custom_fields") or {},
                "offering": lead.get("offering") or lead.get("property") or ""
            })
            
    if not contacts:
        raise HTTPException(status_code=400, detail="No new leads found in selected campaigns.")
        
    campaign_language = "Hinglish"
    ai_voice = "Default"
    voice_gender = "Female"
    regional_accent = "Default"
    
    background_tasks.add_task(process_bulk_calls, contacts, campaign_language, ai_voice, voice_gender, regional_accent, current_user["company_id"])
    
    # Mark them as Contacted/Initiating so they aren't triggered again.
    # lastContact must be an ISO string, not a native datetime - every other
    # write site in the codebase stores it as .isoformat(), and the Leads
    # list sort (lead_routes.py) sorts on this field directly. Mixing BSON
    # date and string types in the same field breaks that sort: MongoDB
    # ranks dates above strings by BSON type regardless of actual value, so
    # a lead touched here would outrank a genuinely more recent one written
    # elsewhere as a string - confirmed live, this exact line was the sole
    # source of that bug.
    await db.leads.update_many(
        {"_id": {"$in": [l["_id"] for l in leads]}},
        {"$set": {"status": "Contacted", "lastContact": datetime.utcnow().isoformat()}}
    )
    
    return {
        "status": "success",
        "message": f"Successfully initiated calls for {len(contacts)} leads.",
        "count": len(contacts)
    }

@app.post("/api/v1/calls/send-email")
async def send_email(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    to_email = payload.get("to")
    subject = payload.get("subject")
    body = payload.get("body")
    
    if not to_email:
        raise HTTPException(status_code=400, detail="Missing 'to' email address.")
        
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASS")
    
    if smtp_user and smtp_pass:
        try:
            msg = MIMEMultipart()
            msg['From'] = smtp_user
            msg['To'] = to_email
            msg['Subject'] = subject or "Message from Talkly AI"
            msg.attach(MIMEText(body or "", 'plain'))
            
            server = smtplib.SMTP(smtp_host, smtp_port)
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
            server.quit()
            return {"status": "success", "message": "Email sent successfully via SMTP."}
        except Exception as e:
            print(f"SMTP Error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
    else:
        print(f"--- Simulating Email Send (SMTP config missing) ---")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Body Snippet: {str(body)[:100]}...")
        print(f"-----------------------------")
        
        # Simulate network delay
        await asyncio.sleep(1.5)
        
        return {"status": "success", "message": "Email simulated (Configure SMTP_USER & SMTP_PASS in .env to send real emails)."}


async def sync_lead_status_from_call(db, lead_id: str, analysis_result: dict):
    if not analysis_result:
        return
        
    intents = analysis_result.get("intents") or []
    summary = (analysis_result.get("summary") or "").lower()
    conv_prob = analysis_result.get("conversion_probability") or 0
    reqs = analysis_result.get("requirements") or analysis_result.get("property_requirements") or {}
    timeline = reqs.get("timeline") if isinstance(reqs, dict) else None
    lead_temp = analysis_result.get("lead_temperature")

    # Detect if appointment / demo session / visit / sanction callback was scheduled across all 5 use cases
    conversion_intent_keywords = [
        "Appointment Booking", "Demo Booking", "Site Visit", "Demo Scheduled", "Enrollment", "Converted",
        "Doctor Consultation", "Consultation Confirmed", "Doctor Appointment", "Clinic Visit", "Slot Confirmed",
        "Loan Application", "Documentation Callback", "Sanction Request", "Pre-Approval", "Sanction Ready",
        "Executive Walkthrough", "Product Demo", "Meeting Scheduled", "Screen-share Demo"
    ]
    summary_conversion_keywords = [
        "confirmed participation", "confirmed seat", "confirmed demo", "seat confirmed", "booked",
        "appointment confirmed", "scheduled demo", "masterclass confirmed", "site visit confirmed",
        "visit scheduled", "consultation confirmed", "sanction quote",
        "document verification confirmed", "walkthrough confirmed", "screen-share confirmed", "demo booked"
    ]

    lead_score = analysis_result.get("lead_score", 0)
    
    # Detect if the customer simply asked to call back or was busy (reschedule / low intent)
    is_callback_or_busy = (
        bool(timeline and any(cb in str(timeline).lower() for cb in ["call back", "callback", "busy", "reschedule", "later", "not interested"]))
        or any(cb in summary for cb in ["busy", "call back later", "callback later", "reschedule", "not a good time", "requested for a call back"])
        or any(i in ["Low Intent Lead", "Not Interested", "Busy"] for i in intents)
    )

    # A lead can only be Converted if they have genuine intent AND are not just asking for a callback while busy
    is_converted = False
    if not is_callback_or_busy and lead_temp != "Cold" and lead_score >= 50:
        is_converted = (
            any(i in conversion_intent_keywords for i in intents)
            or conv_prob >= 70
            or (any(k in summary for k in summary_conversion_keywords) and conv_prob >= 40)
        )

    if is_converted:
        lead_status = "Converted"
    elif lead_temp == "Hot" or conv_prob >= 50 or lead_score >= 75:
        lead_status = "Qualified"
    elif (lead_temp in ["Warm", "Hot"] or lead_score >= 40) and not (lead_temp == "Cold" and lead_score < 30):
        lead_status = "Interested"
    else:
        lead_status = "Contacted"
        
    update_data = {
        "status": lead_status,
        "aiScore": analysis_result.get("lead_score", 0),
        "lastContact": datetime.utcnow().isoformat()
    }
    
    # Extract requirements (general offering or property) and location if available
    reqs = analysis_result.get("requirements") or analysis_result.get("property_requirements", {})
    if isinstance(reqs, dict):
        offering_val = reqs.get("offering") or reqs.get("propertyType") or reqs.get("property_type")
        if offering_val:
            update_data["property"] = offering_val
            update_data["offering"] = offering_val
        if reqs.get("location"):
            update_data["location"] = reqs.get("location")
        if reqs.get("budget"):
            update_data["budget"] = reqs.get("budget")

    await db.leads.update_one(
        {"lead_id": lead_id},
        {"$set": update_data}
    )

async def poll_bolna_execution(execution_id: str, lead_id: str, api_key: str):
    """
    Polls Bolna API for transcript updates in case webhooks fail.
    """
    db = mongodb.get_db()
    url = f"https://api.bolna.ai/executions/{execution_id}"
    headers = {"Authorization": f"Bearer {api_key}"}
    
    log_msg = f"Starting polling fallback for Execution {execution_id} (Lead: {lead_id})"
    print(log_msg)
    with open("bolna_polling.log", "a") as f:
        f.write(f"{datetime.utcnow().isoformat()} - {log_msg}\n")
    
    # Poll for up to 10 minutes
    for i in range(300): 
        try:
            await asyncio.sleep(2)
            # Use run_in_threadpool for blocking requests.get
            response = await run_in_threadpool(requests.get, url, headers=headers, timeout=15)
            
            if response.ok:
                # Force UTF-8 decoding for Hindi/International characters
                response.encoding = 'utf-8'
                data = response.json()
                transcript = data.get("transcript") or ""
                status = data.get("status", "Active")
                
                with open("bolna_polling.log", "a") as f:
                    f.write(f"{datetime.utcnow().isoformat()} - Poll {i}: Status={status}, TranscriptLen={len(transcript)}\n")

                update_data = {
                    "last_poll_at": datetime.utcnow().isoformat() + "Z"
                }
                if transcript:
                    update_data["transcript"] = transcript
                    
                if status.lower() in ["completed", "finished", "ended"]:
                    print(f"Polling: Call {lead_id} completed. Triggering analysis...")
                    
                    # Fetch company_id and duration for billing
                    call_doc = await db.calls.find_one({"call_id": lead_id})
                    if call_doc and call_doc.get("company_id"):
                        duration = data.get("duration") or data.get("telephony_data", {}).get("duration") or 60
                        await billing_service.process_call_billing(
                            db, lead_id, call_doc["company_id"], call_doc.get("direction", "outbound"), duration
                        )
                    
                    analysis_result = await run_in_threadpool(analyze_transcript_text, transcript)
                    if analysis_result:
                        update_data.update({
                            "status": "Analyzed",
                            "summary": analysis_result.get("summary"),
                            "sentiment": analysis_result.get("sentiment"),
                            "duration_seconds": duration if 'duration' in locals() else 60,
                            "analysis": analysis_result
                        })
                        await sync_lead_status_from_call(db, lead_id, analysis_result)
                        # Auto-dispatch to external CRM / Webhook if configured
                        asyncio.create_task(crm_service.sync_call_to_crm(db, lead_id))
                        # Auto-dispatch WhatsApp reminder / confirmation
                        asyncio.create_task(whatsapp_service.process_post_call_whatsapp(db, lead_id))
                    else:
                        update_data["status"] = "Completed"
                    
                    await db.calls.update_one({"call_id": lead_id}, {"$set": update_data})
                    break # Stop polling
                elif status.lower() in ["failed", "canceled", "error", "no-answer", "busy", "timeout", "rejected"]:
                    update_data["status"] = "Failed"
                    await db.calls.update_one({"call_id": lead_id}, {"$set": update_data})
                    break # Stop polling
                else:
                    update_data["status"] = "Active"
                    await db.calls.update_one({"call_id": lead_id}, {"$set": update_data})
            else:
                with open("bolna_polling.log", "a") as f:
                    f.write(f"{datetime.utcnow().isoformat()} - Poll {i}: API Error {response.status_code}\n")
                    
        except Exception as e:
            err_msg = f"Polling error for {lead_id}: {str(e)}"
            print(err_msg)
            with open("bolna_polling.log", "a") as f:
                f.write(f"{datetime.utcnow().isoformat()} - {err_msg}\n")
    
    print(f"Finished polling fallback for {lead_id}")

@app.post("/webhooks/bolna")
async def bolna_webhook(data: dict = Body(...)):
    db = mongodb.get_db()
    
    # Save to log file
    with open("bolna_webhook.log", "a") as f:
        f.write(f"{datetime.utcnow().isoformat()} - {json.dumps(data)}\n")
        
    print(f"WEBHOOK RECEIVED FROM BOLNA: {json.dumps(data)[:300]}...")
    
    user_data = data.get("user_data") or {}
    if isinstance(user_data, str):
        try: user_data = json.loads(user_data)
        except: user_data = {}
            
    lead_id = user_data.get("lead_id") or data.get("lead_id") or data.get("call_id")
    transcript = data.get("transcript") or data.get("conversation_history") or data.get("telephony_data", {}).get("transcript", "")
    status = data.get("status", "Active")
    
    if not lead_id:
        phone = data.get("recipient_phone_number") or data.get("telephony_data", {}).get("to_number")
        if phone:
            phone_clean = phone.replace('+', '').strip()
            potential_call = await db.calls.find_one({
                "customer_id": {"$regex": f"{phone_clean}$"}, 
                "status": {"$in": ["Initiating", "Active"]}
            })
            if potential_call:
                lead_id = potential_call["call_id"]
                
        # If STILL no lead_id, it's a completely new inbound call!
        if not lead_id:
            customer_phone = data.get("telephony_data", {}).get("from_number") or data.get("caller_phone_number") or "Unknown Inbound"
            lead_id = data.get("call_id") or data.get("execution_id") or f"inbound_{int(time.time()*1000)}"
            
            # Resolve company_id from the Bolna agent that handled the call.
            inbound_company_id = None
            agent_id = data.get("agent_id") or data.get("telephony_data", {}).get("agent_id")
            if agent_id:
                mapping = await db.language_mappings.find_one({"bolna_agent_id": agent_id})
                if mapping and mapping.get("company_id"):
                    inbound_company_id = mapping.get("company_id")
                if not inbound_company_id:
                    company = await db.companies.find_one({"bolna_agent_id": agent_id})
                    if company:
                        inbound_company_id = company.get("company_id")
            if not inbound_company_id:
                # Unattributable inbound call - keep it but flag it for an admin.
                inbound_company_id = os.environ.get("UNATTRIBUTED_INBOUND_COMPANY_ID") or "unassigned"
                print(f"WARNING: inbound call {lead_id} could not be attributed to a company (agent_id={agent_id})")

            await db.calls.insert_one({
                "call_id": lead_id,
                "customer_id": customer_phone,
                "customer_name": "Inbound Caller",
                "direction": "inbound",
                "transcript": "",
                "status": "Active",
                "created_at": datetime.utcnow(),
                "language": "Detecting...",
                "detected_language": "Unknown",
                "preferred_language": "Unknown",
                "transcript_language": "Unknown",
                "company_id": inbound_company_id
            })
            print(f"Created new INBOUND lead record: {lead_id} from {customer_phone}")

    if lead_id:
        update_data = {
            "transcript": transcript,
            "last_webhook_at": datetime.utcnow().isoformat() + "Z"
        }
        
        if status.lower() in ["completed", "finished", "ended"]:
            print(f"Call {lead_id} completed. Triggering AI Analysis...")
            
            # Fetch company_id and duration for billing
            call_doc = await db.calls.find_one({"call_id": lead_id})
            if call_doc and call_doc.get("company_id"):
                duration = data.get("telephony_data", {}).get("duration") or data.get("duration") or 60
                await billing_service.process_call_billing(
                    db, lead_id, call_doc["company_id"], call_doc.get("direction", "outbound"), duration
                )
                
            try:
                analysis_result = await run_in_threadpool(analyze_transcript_text, transcript)
                if analysis_result:
                    detected = analysis_result.get("detected_language") or analysis_result.get("language_detected") or "English"
                    update_data.update({
                        "status": "Analyzed",
                        "summary": analysis_result.get("summary"),
                        "sentiment": analysis_result.get("sentiment"),
                        "duration_seconds": duration if 'duration' in locals() else 60,
                        "language": detected,
                        "detected_language": detected,
                        "preferred_language": analysis_result.get("preferred_language") or detected,
                        "transcript_language": analysis_result.get("transcript_language") or detected,
                        "analysis": analysis_result
                    })
                    await sync_lead_status_from_call(db, lead_id, analysis_result)
                    # Auto-dispatch to external CRM / Webhook if configured
                    asyncio.create_task(crm_service.sync_call_to_crm(db, lead_id))
                    # Auto-dispatch WhatsApp reminder / confirmation
                    asyncio.create_task(whatsapp_service.process_post_call_whatsapp(db, lead_id))
                else:
                    update_data["status"] = "Completed"
            except Exception as e:
                print(f"Analysis failed for {lead_id}: {str(e)}")
                update_data["status"] = "Completed"
        elif status.lower() in ["failed", "canceled", "error", "no-answer", "busy", "timeout", "rejected"]:
            update_data["status"] = "Failed"
        else:
            update_data["status"] = "Active"

        await db.calls.update_one({"call_id": lead_id}, {"$set": update_data})
    return {"status": "success"}

@app.post("/api/v1/process-audio")
async def process_audio_api(
    file: UploadFile = File(...), 
    agent_name: str = Form("AI Agent"),
    employee_id: str = Form(None),
    employee_email: str = Form(None),
    current_user: dict = Depends(require_company_access)
):
    temp_path = None
    try:
        timestamp = int(time.time() * 1000)
        temp_path = f"temp_{timestamp}_{file.filename}"
        with open(temp_path, "wb") as f:
            f.write(await file.read())
        
        result = await run_in_threadpool(process_uploaded_audio, temp_path)
        now = datetime.utcnow()
        unique_call_id = f"call_{timestamp}"
        doc = {
            "call_id": unique_call_id,
            "customer_id": result.get("analysis", {}).get("customer_name") or "Phone Lead",
            "customer_name": result.get("analysis", {}).get("customer_name") or "Phone Lead",
            "direction": "outbound",
            "agent_name": agent_name,
            "employee_id": employee_id,
            "employee_email": employee_email,
            "sentiment": str(result.get("sentiment", "neutral")).lower(),
            "summary": result.get("summary"),
            "transcript": result.get("transcript"),
            "analysis": result.get("analysis", {}),
            "created_at": now,
            "status": "Analyzed",
            "company_id": current_user["company_id"],
            "source": "voice_intelligence"
        }
        db = mongodb.get_db()
        await db.calls.insert_one(doc)
        doc["_id"] = None
        if temp_path and os.path.exists(temp_path): os.remove(temp_path)
        return doc
    except Exception as e:
        print(f"ERROR PROCESSING AUDIO: {str(e)}")
        if temp_path and os.path.exists(temp_path): os.remove(temp_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/voice-intelligence/history")
async def get_voice_intelligence_history(limit: int = 20, skip: int = 0, current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    cursor = db.calls.find({
        "company_id": current_user["company_id"], 
        "$or": [
            {"source": "voice_intelligence"},
            {"status": "Analyzed", "duration_seconds": {"$exists": False}, "customer_name": "Phone Lead"}
        ]
    }).sort("created_at", -1).skip(skip).limit(limit)
    
    history = []
    async for d in cursor:
        d["_id"] = None
        history.append(d)
    return {"status": "success", "data": history}

@app.get("/download/{report_type}")
async def download_report(report_type: str):
    if report_type == "excel":
        from process_audio import get_weekly_excel_file
        file_path = get_weekly_excel_file()
        # Fallback to absolute path if needed
        full_path = os.path.join(BASE_DIR, file_path) if not os.path.isabs(file_path) else file_path
        if os.path.exists(full_path):
            return FileResponse(full_path, filename=os.path.basename(full_path))
        
        # Fallback to cumulative report if weekly doesn't exist
        fallback_path = os.path.join(BASE_DIR, "results", "analytics_results.xlsx")
        if os.path.exists(fallback_path):
            return FileResponse(fallback_path, filename="analytics_results.xlsx")
            
        return {"status": "error", "message": "Report not found"}
    # Mock download for demo
    return {"status": "success", "message": f"{report_type} report ready"}

# --- Phase 3 CRM & Follow-Up Endpoints ---

from services.crm_service import crm_service

async def _get_owned_call(db, call_id: str, current_user: dict):
    doc = await db.calls.find_one(tenant_filter(current_user, {"call_id": call_id}))
    if not doc:
        raise HTTPException(status_code=404, detail="Call not found")
    return doc


@app.post("/api/v1/calls/{call_id}/sync-crm")
async def sync_call_to_crm(call_id: str, current_user: dict = Depends(require_company_access)):
    try:
        db = mongodb.get_db()
        await _get_owned_call(db, call_id, current_user)
        await crm_service.sync_call_to_crm(db, call_id)
        return {"status": "success", "message": "Successfully synced to CRM."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/calls/{call_id}/send-followup")
async def send_followup_email(call_id: str, current_user: dict = Depends(require_company_access)):
    # Simulates sending an email
    try:
        db = mongodb.get_db()
        await _get_owned_call(db, call_id, current_user)
        import asyncio
        await asyncio.sleep(1) # Simulate network delay

        # Mark email as sent in DB (scoped to this company)
        await db.calls.update_one(
            tenant_filter(current_user, {"call_id": call_id}),
            {"$set": {
                "followup_sent": True,
                "followup_sent_at": datetime.utcnow().isoformat()
            }}
        )
        return {"status": "success", "message": "Email sent successfully."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/industry-templates")
async def get_industry_templates():
    """Returns pre-built prompt templates for multiple industries."""
    return {
        "status": "success",
        "templates": INDUSTRY_TEMPLATES
    }

@app.post("/api/v1/settings/test-webhook")
async def test_webhook_endpoint(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    webhook_url = payload.get("webhook_url")
    if not webhook_url:
        raise HTTPException(status_code=400, detail="webhook_url is required")
    try:
        res = await crm_service.send_test_webhook(webhook_url)
        return {"status": "success", "result": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Webhook test failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    # Using 'server:app' as a string is required for multi-worker setup or reload
    uvicorn.run("server:app", host="0.0.0.0", port=8002, reload=True)


