# In-memory call cache for ultra-low latency WebSocket greeting
PLIVO_CALL_CACHE = {}
# Pre-warmed OpenAI Realtime sessions, keyed by call_id. Populated by
# prewarm_openai_session() as soon as /answer fires (call picked up), so the
# /stream handler (which connects moments later) can skip the connect +
# session.update round trip instead of paying that cost after the customer
# is already live on the line.
OPENAI_PREWARM_CACHE = {}
# The prewarm task itself, keyed by call_id - /stream arrives moments after
# /answer returns its XML (often well under the 1-3s a cold OpenAI connect +
# session.created round trip takes), so the cache above is frequently still
# empty when /stream checks it even though the prewarm is seconds from
# finishing. Tracking the task lets /stream briefly await the nearly-done
# prewarm instead of immediately giving up and redoing the whole connect
# from scratch - that redundant full cold connect was the real source of the
# reported ~3s delay before the greeting started speaking.
OPENAI_PREWARM_TASKS = {}
from fastapi import APIRouter, Request, Response, WebSocket, WebSocketDisconnect, HTTPException, Depends, Query, Body
from fastapi.concurrency import run_in_threadpool
from datetime import datetime
import os
import sys
import time
import json
import base64
import audioop
import asyncio
import logging
import websockets
import mongodb
from auth import require_company_access
from telephony.plivo_provider import PlivoProvider
from process_audio import analyze_transcript_text
from services.crm_service import crm_service
from services.billing_service import billing_service
from services.sarvam_tts import SarvamTTSSession, sarvam_voice_for
from services.bakbak_tts import BakbakTTSSession, bakbak_voice_for
from services.hindi_normalizer import normalize_for_tts, is_hindi_or_hinglish
from industry_templates import INDUSTRY_TEMPLATES
import re
import requests
import sys
from dotenv import load_dotenv

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

def safe_print(*args, **kwargs):
    text = " ".join(str(a) for a in args)
    try:
        print(*args, **kwargs)
    except Exception:
        try:
            cleaned = [str(a).encode('ascii', errors='replace').decode('ascii') for a in args]
            print(*cleaned, **kwargs)
        except Exception:
            pass
    try:
        log_path = os.path.join(BASE_DIR, "plivo_call.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.utcnow().isoformat()}] {text}\n")
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env.local"))

logger = logging.getLogger("talkly-plivo-streaming")
plivo_router = APIRouter()

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "").strip()
BAKBAK_API_KEY = os.environ.get("BAKBAK_API_KEY", "").strip()
# Known Whisper "silence hallucination" phrases - fabricated, fluent-sounding
# text the model emits when fed near-silent/low-energy audio instead of real
# speech. Shared by both customer-speech event handlers so the list can't drift.
HALLUCINATION_PHRASES = {
    "ha-ha.", "ha-ha", "...", "[music]", "[applause]", "empecemos.", "empecemos",
    "nighty, yeah, thank you", "thanks for watching!", "thanks for watching.",
    "thanks for watching", "thank you for watching.", "thank you for watching!",
    "bye-bye, everyone.", "bye-bye, everyone", "see you on monday.", "see you on monday",
    "how about that, yeah?", "how about that, yeah", "now what are you you",
    "thank you. bye bye.", "thank you, bye bye.", "thank you bye bye", "bye.", "you.",
    "i love you all.", "i love you all", "god bless you all.", "god bless you all",
    "god bless you.", "god bless you", "like and subscribe", "please subscribe",
    "subscribe to my channel", "don't forget to subscribe", "i want to give it a like.",
    "i want to give it a like",
    # Video-caption-timestamp hallucinations - same training-data artifact
    # family as "[music]"/"thanks for watching" above, just a different shape.
    # Confirmed live: a raw "00:00" line showed up in a stored transcript.
    "00:00", "0:00", "00:00:00", "0:00:00",
}

import re as _re_degenerate_check
_DEGENERATE_REPETITION_RE = _re_degenerate_check.compile(r"(.)\1{4,}")


def is_degenerate_transcript(text: str) -> bool:
    """Catches a distinct STT failure mode from HALLUCINATION_PHRASES: given
    very low-quality/near-silent/noise-only audio, the model can get stuck
    looping the same character (e.g. "...गंग्डडडडडडडडडडडडडडडड") instead of
    producing a fluent-but-wrong phrase. HALLUCINATION_PHRASES only matches a
    fixed list of known fluent hallucinations, so this novel garbage would
    otherwise slip through untouched."""
    return bool(text) and bool(_DEGENERATE_REPETITION_RE.search(text))


def merge_customer_transcript(transcript_parts: list, text: str) -> bool:
    """Appends new customer-speech text to transcript_parts, or merges it
    into the most recent customer entry when this is clearly the same
    utterance reported twice by two different event paths (one partial, one
    complete) - the two customer-speech event handlers below previously only
    deduped on EXACT string equality, so a cut-off partial and the full
    follow-up both passed the old check and got appended as two separate
    lines (confirmed live - the same truncated-then-full pattern already
    fixed on the AI-text side showing up on the customer side too). Returns
    True if transcript_parts actually changed (append or merge), False if
    this was a stale duplicate to skip."""
    last_idx = None
    for i in range(len(transcript_parts) - 1, -1, -1):
        if transcript_parts[i].startswith("AI: "):
            break  # an AI turn happened since - this is a genuinely new utterance
        if transcript_parts[i].startswith("Customer: "):
            last_idx = i
            break
    if last_idx is None:
        transcript_parts.append(f"Customer: {text}")
        return True
    last_text = transcript_parts[last_idx][len("Customer: "):].strip()
    if text == last_text:
        return False
    if last_text and text.startswith(last_text):
        transcript_parts[last_idx] = f"Customer: {text}"
        return True
    if text and last_text.startswith(text):
        return False
    transcript_parts.append(f"Customer: {text}")
    return True

# Below this RMS (16-bit linear PCM decoded from 8kHz mu-law telephony audio), a
# VAD-flagged "speech" segment is almost certainly silence or background noise,
# not real speech - Whisper still returns a fluent-sounding transcript for it
# regardless, so gate on measured energy instead of trusting the transcript.
# Starting point only; tune against the [AUDIO ENERGY] values logged per turn.
SILENCE_RMS_THRESHOLD = 150


async def finalize_plivo_call(
    call_id: str,
    company_id: str = None,
    duration: int = None,
    hangup_cause: str = None,
    transcript_parts: list = None
):
    """
    Finalizes a completed Plivo call:
    1. Saves transcript and duration to db.calls.
    2. Runs AI sentiment & conversion analysis on transcript.
    3. Updates db.leads status from 'Calling' to 'Contacted', 'Interested', 'Qualified', or 'Converted'.
    """
    if not call_id:
        return

    db = mongodb.get_db()
    call_doc = await db.calls.find_one({"call_id": call_id})
    if not call_doc:
        logger.warning(f"finalize_plivo_call: call_id {call_id} not found")
        return

    cid = company_id or call_doc.get("company_id")

    # The /stream websocket's finally-block and the /hangup webhook both call
    # this function for outbound calls (inbound only ever gets the first, since
    # there's no per-call hangup_url for Plivo to hit - see below). Whichever
    # one finishes the analysis/CRM/WhatsApp pipeline writes "status": "Analyzed"
    # together with the transcript and analysis result in a single update at
    # the very end of this function, so seeing that status here means a prior
    # call for this call_id already ran that pipeline in full - skip it again
    # below to avoid duplicate GPT-4o analysis, CRM webhook deliveries, and
    # WhatsApp dispatch. Duration/billing still run unconditionally below since
    # they already have their own idempotency handling.
    already_analyzed = call_doc.get("status") == "Analyzed"

    # Plivo's /hangup webhook only ever gets wired up for outbound calls -
    # trigger_outbound_call() can embed call_id/company_id into a per-call
    # hangup_url because Talkly places those calls itself. For inbound calls
    # Plivo initiates the call, so there's no per-call hangup_url to set, and
    # /hangup never fires - confirmed live, every inbound call's duration,
    # duration_seconds and hangup_cause stayed null despite a full transcript
    # existing. Rather than depend on that webhook, derive duration from our
    # own answered_at/created_at timestamp whenever Plivo didn't give us one -
    # this path (the /stream websocket's finally-block) fires for every call,
    # inbound or outbound, the moment the media stream actually disconnects.
    if duration is None:
        started_at = None
        for field in ("answered_at", "created_at"):
            raw = call_doc.get(field)
            if not raw:
                continue
            try:
                started_at = datetime.fromisoformat(raw) if isinstance(raw, str) else raw
                break
            except Exception:
                continue
        if started_at:
            duration = max(0, int((datetime.utcnow() - started_at).total_seconds()))

    update_data = {
        "last_updated": datetime.utcnow().isoformat()
    }
    if not already_analyzed:
        update_data["status"] = "Completed"
    if duration is not None:
        update_data["duration"] = duration
        update_data["duration_seconds"] = duration
    if hangup_cause:
        update_data["hangup_cause"] = hangup_cause
        update_data["ended_at"] = datetime.utcnow().isoformat()

    # Meter the call for billing. process_call_billing() has its own
    # call_id idempotency check against db.usage_records, so it's safe for
    # this to run from both this path (estimated duration) and from
    # /hangup (Plivo's authoritative duration, when it does fire) - whichever
    # runs first bills the call, the second is a no-op.
    if duration is not None and cid:
        try:
            direction = call_doc.get("direction", "outbound")
            await billing_service.process_call_billing(db, call_id, cid, direction, float(duration), provider="plivo")
        except Exception as e:
            logger.error(f"Billing failed for Plivo call {call_id}: {e}")

    full_transcript = None
    if transcript_parts:
        full_transcript = "\n".join(transcript_parts).strip()
        update_data["transcript"] = full_transcript
    elif call_doc.get("transcript"):
        full_transcript = call_doc["transcript"].strip()

    # If transcript exists, perform AI intelligence analysis
    analysis_result = None
    if already_analyzed:
        logger.info(f"finalize_plivo_call: call {call_id} already analyzed by a prior call, skipping duplicate analysis/CRM/WhatsApp dispatch.")
    elif full_transcript and len(full_transcript) > 10:
        try:
            logger.info(f"Running AI analysis for Plivo call {call_id}...")
            analysis_result = await run_in_threadpool(analyze_transcript_text, full_transcript)
            if analysis_result:
                detected = analysis_result.get("detected_language") or analysis_result.get("language_detected") or "English"
                update_data.update({
                    "status": "Analyzed",
                    "summary": analysis_result.get("summary"),
                    "sentiment": analysis_result.get("sentiment"),
                    "language": detected,
                    "analysis": analysis_result
                })
                # Sync lead status (Qualified, Interested, Converted, etc.)
                # call_doc.lead_id is the actual lead document's id when a
                # quick-call reused an existing lead (dedup by phone number)
                # under a different id than this call's own call_id - falls
                # back to call_id for every other path, where the two have
                # always been (and still are) the same string.
                sync_lead_id = call_doc.get("lead_id") or call_id
                await crm_service.sync_lead_status_from_call(db, sync_lead_id, analysis_result, company_id=cid)
                # Dispatch CRM webhook if configured
                asyncio.create_task(crm_service.sync_call_to_crm(db, call_id))
                # Trigger automated WhatsApp follow-up if customer asked or meeting booked
                from services.whatsapp_service import whatsapp_service
                asyncio.create_task(whatsapp_service.process_post_call_whatsapp(db, call_id))
        except Exception as e:
            logger.error(f"Analysis failed for Plivo call {call_id}: {e}")

    # If no AI analysis (e.g. short call, busy, rejected), ensure db.leads is updated from 'Calling'
    if not analysis_result and not already_analyzed:
        dur = duration if duration is not None else int(call_doc.get("duration", 0) or 0)
        if dur > 0:
            lead_status = "Contacted"
        elif str(hangup_cause or "").upper() in ("USER_BUSY", "CALL_REJECTED", "BUSY"):
            lead_status = "Busy"
        else:
            lead_status = "No Answer"

        sync_lead_id = call_doc.get("lead_id") or call_id
        lead_filter = {"company_id": cid} if cid else {}
        lead_filter["$or"] = [{"lead_id": sync_lead_id}, {"lead_id": call_id}]
        if lead_status == "No Answer":
            # Never downgrade converted or qualified leads on a single missed re-call
            lead_filter["status"] = {"$nin": ["Converted", "Qualified", "Interested"]}

        await db.leads.update_many(
            lead_filter,
            {"$set": {
                "status": lead_status,
                "lastContact": datetime.utcnow().isoformat(),
                "last_called_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }}
        )

    await db.calls.update_one({"call_id": call_id}, {"$set": update_data})
    logger.info(f"Plivo call {call_id} finalized successfully.")


def extract_first_sentence(text_buffer: str) -> tuple[str, str]:
    """
    Safely extracts the first complete sentence from text_buffer, protecting against:
    - Decimals (e.g. 1.5, 3.5)
    - Currency and abbreviations (sq. ft., Dr., Mr., approx., Rs.)
    - Ellipses (...)
    Returns (sentence, remainder). If no complete sentence is found, returns ("", text_buffer).
    """
    if not text_buffer:
        return "", ""
    candidates = list(re.finditer(r'[।!?]|\.(?!\d)', text_buffer))
    abbrs = {'sq.', 'ft.', 'kw.', 'dr.', 'mr.', 'mrs.', 'vs.', 'eg.', 'ie.', 'etc.', 'approx.', 'rs.', 'inr.'}
    for m in candidates:
        idx = m.end()
        punct = m.group(0)
        if punct == '.':
            # Check if this period is part of an ellipsis
            if (m.start() > 0 and text_buffer[m.start()-1] == '.') or (idx < len(text_buffer) and text_buffer[idx] == '.'):
                continue
            # Check preceding word for abbreviation
            prefix = text_buffer[:idx]
            last_word = prefix.split()[-1].lower() if prefix.split() else ''
            if last_word in abbrs:
                continue
            # Must be followed by space or end of string
            if idx < len(text_buffer) and not text_buffer[idx].isspace():
                continue
        sent = text_buffer[:idx].strip()
        rem = text_buffer[idx:].lstrip()
        if len(sent) >= 5:
            return sent, rem
    return "", text_buffer


def clean_tts_text(text: str, customer_name: str = "", is_subsequent: bool = False, language: str = "Hindi") -> str:
    """
    Sanitize text before speech synthesis so TTS never pronounces formatting artifacts
    like 'underscore', 'asterisk', or placeholder leaks like 'customer_name'.
    On mid-call turns (is_subsequent=True), also strips repetitive customer name vocatives,
    while NEVER stripping the customer name during identity verification or questions.
    Dynamically normalizes numbers, currency, dates, measurements and times into Hindi words for Hindi/Hinglish TTS.
    """
    if not text:
        return ""
    if customer_name and not is_subsequent:
        text = re.sub(r'(?i)\b_?customer[_\s]?name_?\b', customer_name, text)
    else:
        text = re.sub(r'(?i)\b_?customer[_\s]?name_?\b', '', text)
    # Strip markdown bold/italics/code markers (*, _, ~, `) and brackets
    cleaned = re.sub(r'[*_~`#\[\]]', '', text)

    # On subsequent turns, strip repetitive customer name vocatives (e.g. 'I see, Mohit.' -> 'I see.')
    # BUT NEVER strip the name during identity confirmation or when asking questions ending in '?'
    if is_subsequent and customer_name:
        is_identity_check = bool(re.search(
            r'(?i)\b(speaking with|talking to|is this|am I speaking|are you|is that|call with|call for|verify|confirm|identity|बात कर|से बात|बोल रहे|बोल रही|नाम)\b',
            cleaned
        ))
        if not is_identity_check:
            parts = [p.strip() for p in customer_name.split() if len(p.strip()) > 1]
            name_patterns = [re.escape(customer_name)] + [re.escape(p) for p in parts]
            for np in name_patterns:
                # Strip acknowledgment filler vocatives: "Got it Binit" -> "Got it"
                cleaned = re.sub(
                    rf'(?i)\b(Got it|Sure|I see|Understood|Great|Alright|Okay|Thank you|You\'re welcome|Welcome|Thanks|No problem|Theek hai|Samajh gaya|Ji),?\s*{np}\b',
                    r'\1',
                    cleaned
                )
                # Strip trailing comma vocatives at end of statements: ", Binit." -> "." (NEVER on '?'!)
                cleaned = re.sub(rf'(?i),\s*{np}\b([.!])', r'\1', cleaned)
                cleaned = re.sub(rf'(?i),\s*{np}\b,', ',', cleaned)

    # Collapse extra whitespace
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()

    # Sanitize robotic or gender-mismatched opening phrases for natural conversational flow
    cleaned = re.sub(r'^(?:समझ गया|samajh gaya)[,।!.\s]+', 'जी, ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'(?:^|(?<=[\s,।!?]))समझ गया(?=[\s,।!?]|$)', 'समझ गई', cleaned)
    cleaned = re.sub(r'(?i)\bsamajh gaya\b', 'samajh gayi', cleaned)

    # Dynamic Hindi normalization for TTS: if language is Hindi/Hinglish OR if text itself contains
    # Devanagari script / Hindi speech markers, always route through normalize_for_tts as Hindi.
    is_hi_text = bool(re.search(r'[\u0900-\u097F]', cleaned)) or bool(re.search(r'(?i)\b(बजे|baje|रुपये|rupaye|हज़ार|hazaar|लाख|lakh|करोड़|crore|तारीख)\b', cleaned))
    eff_lang = "Hindi" if is_hi_text else (language or "Hindi")
    try:
        from services.hindi_normalizer import normalize_for_tts
        cleaned = normalize_for_tts(cleaned, language=eff_lang)
    except Exception as norm_err:
        logger.warning(f"[clean_tts_text] Hindi normalizer error: {norm_err}")

    if cleaned and cleaned[0].islower():
        cleaned = cleaned[0].upper() + cleaned[1:]
    return cleaned


async def resolve_call_voice_context(db, call_id: str, company_id: str = None) -> dict:
    """Resolve the system prompt, opening greeting, transcription language, and
    company doc for a call. Shared by the /answer pre-warm path and the
    /stream cold-start fallback so the two can never drift out of sync."""
    call_doc_task = db.calls.find_one({"call_id": call_id}) if call_id else None
    comp_doc_task = db.companies.find_one({"company_id": company_id}) if company_id else None
    lead_doc_task = db.leads.find_one({"lead_id": call_id, "company_id": company_id}) if (call_id and company_id) else None
    prompt_doc_task = db.prompts.find_one({"company_id": company_id}) if company_id else None

    call_doc, company, lead_doc, prompt_doc = await asyncio.gather(
        call_doc_task or asyncio.sleep(0),
        comp_doc_task or asyncio.sleep(0),
        lead_doc_task or asyncio.sleep(0),
        prompt_doc_task or asyncio.sleep(0)
    )

    if not isinstance(call_doc, dict):
        call_doc = None
    if not isinstance(company, dict):
        company = None
    if not isinstance(lead_doc, dict):
        lead_doc = None
    if not isinstance(prompt_doc, dict):
        prompt_doc = None

    if call_doc and call_doc.get("company_id") and not company_id:
        company_id = call_doc["company_id"]
        if not company:
            company = await db.companies.find_one({"company_id": company_id})
        if not prompt_doc:
            prompt_doc = await db.prompts.find_one({"company_id": company_id})

    company_name = (company.get("name") if company else "") or "Talkly"

    customer_name = ""
    if call_doc and call_doc.get("customer_name"):
        cname = str(call_doc.get("customer_name")).strip()
        if cname.lower() not in ("valued customer", "unknown", "there", "inbound caller", "caller", ""):
            customer_name = cname

    call_lead_id = call_doc.get("lead_id") if call_doc else None
    target_phone = call_doc.get("customer_id") if call_doc else None
    target_name = customer_name or (call_doc.get("customer_name") if call_doc else None)

    # Resolve lead_doc with high fidelity: first by lead_id, then by phone+name, then by latest phone record
    if not lead_doc and call_lead_id and company_id:
        lead_doc = await db.leads.find_one({"lead_id": call_lead_id, "company_id": company_id})
        if not lead_doc:
            try:
                from bson import ObjectId
                lead_doc = await db.leads.find_one({"_id": ObjectId(call_lead_id), "company_id": company_id})
            except Exception:
                pass

    if not lead_doc and target_phone and target_name and target_name.lower() not in ("valued customer", "unknown", "inbound caller", "caller", "") and company_id:
        lead_doc = await db.leads.find_one(
            {"phone": target_phone, "name": {"$regex": f"^{re.escape(target_name)}$", "$options": "i"}, "company_id": company_id},
            sort=[("created_at", -1), ("_id", -1)]
        )

    if not lead_doc and target_phone and company_id:
        lead_doc = await db.leads.find_one(
            {"phone": target_phone, "company_id": company_id},
            sort=[("created_at", -1), ("_id", -1)]
        )

    if not customer_name and lead_doc and lead_doc.get("name"):
        cname = str(lead_doc.get("name")).strip()
        if cname.lower() not in ("valued customer", "unknown", "there", ""):
            customer_name = cname

    call_industry = None
    if call_doc and call_doc.get("industry") and call_doc.get("industry") != "general_sales":
        call_industry = call_doc.get("industry")
    elif prompt_doc and prompt_doc.get("industry"):
        call_industry = prompt_doc.get("industry")
    elif company and company.get("industry"):
        call_industry = company.get("industry")
    elif lead_doc and lead_doc.get("industry") and lead_doc.get("industry") != "general_sales":
        call_industry = lead_doc.get("industry")
    elif call_doc and call_doc.get("industry"):
        call_industry = call_doc.get("industry")

    custom_templates = (prompt_doc or {}).get("custom_templates") or []
    custom_map = {t["id"]: t for t in custom_templates if isinstance(t, dict) and t.get("id")}
    ind_prompts = (prompt_doc or {}).get("industry_prompts", {})

    is_valid_industry = bool(
        call_industry
        and (
            call_industry in INDUSTRY_TEMPLATES
            or call_industry in custom_map
            or call_industry in ind_prompts
        )
    )
    if not is_valid_industry:
        call_industry = "general_sales"

    is_inbound = bool(call_doc and call_doc.get("direction") == "inbound")
    is_test_call = bool(call_id and str(call_id).startswith("test-agent-call"))

    if call_industry in custom_map:
        template_def = custom_map[call_industry]
    elif call_industry in ind_prompts:
        template_def = ind_prompts[call_industry]
    else:
        template_def = INDUSTRY_TEMPLATES.get(call_industry, INDUSTRY_TEMPLATES["general_sales"])

    specific_ind_prompt = ind_prompts.get(call_industry, {})

    offering = ""
    # 1. Check if call_doc explicitly carries an offering override
    if call_doc and call_doc.get("offering"):
        offering = str(call_doc.get("offering")).strip()

    # 2. Check lead_doc - only if this is NOT a test call and industry matches
    if not offering and lead_doc and not is_test_call:
        lead_ind = (lead_doc.get("industry") or "").strip().lower()
        if not lead_ind or lead_ind == "general_sales" or lead_ind == call_industry:
            offering = str(lead_doc.get("offering") or lead_doc.get("property") or "").strip()

    # 3. Sanity check: discard stale cross-industry contaminated offerings
    if offering and call_industry:
        off_lower = offering.lower()
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
            offering = ""

    # 4. Check industry-specific prompt offering
    if not offering and specific_ind_prompt and specific_ind_prompt.get("offering"):
        offering = str(specific_ind_prompt.get("offering")).strip()

    # 5. Check active prompt template offering
    if not offering and prompt_doc and prompt_doc.get("industry") == call_industry and prompt_doc.get("offering"):
        prompt_off = str(prompt_doc.get("offering")).strip()
        # Ensure prompt offering also doesn't carry cross-industry mismatch
        if prompt_off and not (call_industry == "real_estate" and any(w in prompt_off.lower() for w in ["certification", "course", "degree"])):
            offering = prompt_off

    # 6. Company default offering
    if not offering and company and company.get("offering") and company.get("industry") == call_industry:
        offering = str(company.get("offering")).strip()

    # 7. Industry-tailored fallback
    if not offering:
        industry_fallbacks = {
            "real_estate": "luxury property",
            "healthcare": "doctor appointment consultation",
            "edtech": "online certification",
            "bfsi": "loan",
            "general_sales": "AI calling services",
            "collections": "loan EMI payment"
        }
        offering = (
            industry_fallbacks.get(call_industry)
            or (template_def.get("offering") if isinstance(template_def, dict) and template_def.get("offering") else None)
            or (template_def.get("offering_placeholder") if isinstance(template_def, dict) and template_def.get("offering_placeholder") else None)
            or (template_def.get("default_offering_label") if isinstance(template_def, dict) and template_def.get("default_offering_label") else None)
            or "our services"
        )

    # Collect dynamic variables from all configuration sources
    dyn_vars = {}
    if isinstance(template_def, dict) and isinstance(template_def.get("variables"), dict):
        dyn_vars.update(template_def["variables"])
    if specific_ind_prompt and isinstance(specific_ind_prompt.get("variables"), dict):
        dyn_vars.update(specific_ind_prompt["variables"])
    if prompt_doc and isinstance(prompt_doc.get("variables"), dict):
        dyn_vars.update(prompt_doc["variables"])

    var_fields = [
        "budget", "doctor_name", "preferred_time", "appointment_time", "batch_time", "current_role",
        "loan_amount", "tenure", "company_size", "amount_due", "due_date",
        "order_amount", "order_id", "delivery_address",
        "shop_address", "landmark", "city", "shop_timings", "contact_number"
    ]
    if lead_doc:
        for k in var_fields:
            if lead_doc.get(k):
                dyn_vars[k] = str(lead_doc[k]).strip()
        for ck, cv in (lead_doc.get("custom_fields") or {}).items():
            if cv is not None:
                dyn_vars[ck] = str(cv).strip()
    if call_doc:
        for k in var_fields:
            if call_doc.get(k):
                dyn_vars[k] = str(call_doc[k]).strip()
        for ck, cv in (call_doc.get("custom_fields") or {}).items():
            if cv is not None:
                dyn_vars[ck] = str(cv).strip()

    # Universal aliases for loan/overdue/order amount
    amt_val = (
        dyn_vars.get("order_amount")
        or dyn_vars.get("amount_due")
        or dyn_vars.get("loan_amount")
        or dyn_vars.get("Loan Amount")
        or dyn_vars.get("loan amount")
        or dyn_vars.get("amount")
        or (lead_doc.get("order_amount") if lead_doc else None)
        or (lead_doc.get("amount_due") if lead_doc else None)
        or (call_doc.get("order_amount") if call_doc else None)
        or (call_doc.get("amount_due") if call_doc else None)
        or ""
    )
    if amt_val:
        clean_amt = str(amt_val).replace("₹", "").replace("Rs.", "").replace(",", "").strip()
        dyn_vars["amount_due"] = clean_amt
        dyn_vars["loan_amount"] = clean_amt
        dyn_vars["Loan Amount"] = clean_amt
        dyn_vars["order_amount"] = clean_amt

    # Universal aliases for due date with human-friendly spoken date formatting
    due_val = (
        dyn_vars.get("due_date")
        or dyn_vars.get("due date")
        or dyn_vars.get("Due Date")
        or dyn_vars.get("payment_date")
        or dyn_vars.get("date")
        or (lead_doc.get("due_date") if lead_doc else None)
        or (call_doc.get("due_date") if call_doc else None)
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
        dyn_vars["due_date"] = spoken_due
        dyn_vars["due date"] = spoken_due
        dyn_vars["Due Date"] = spoken_due

    # Shop address single source of truth resolution
    raw_shop_address = (
        dyn_vars.get("shop_address")
        or (call_doc.get("shop_address") if call_doc else None)
        or (lead_doc.get("shop_address") if lead_doc else None)
        or (prompt_doc.get("shop_address") if prompt_doc else None)
        or (company.get("shop_address") if company else None)
        or (company.get("address") if company else None)
        or ""
    )
    shop_address = str(raw_shop_address).strip() if raw_shop_address else ""

    # Supporting location information
    landmark = str(dyn_vars.get("landmark") or (lead_doc.get("landmark") if lead_doc else "") or "").strip()
    city = str(dyn_vars.get("city") or (lead_doc.get("city") if lead_doc else "") or (company.get("city") if company else "") or "").strip()
    shop_timings = str(dyn_vars.get("shop_timings") or dyn_vars.get("timings") or "").strip()
    contact_number = str(dyn_vars.get("contact_number") or dyn_vars.get("phone") or (company.get("phone") if company else "") or "").strip()

    # Location resolution: Discard outdated hardcoded sample location (e.g. DLF Cyber Park)
    location = ""
    if call_doc and call_doc.get("location"):
        loc_val = str(call_doc.get("location")).strip()
        if "cyber" not in loc_val.lower() and "dlf" not in loc_val.lower():
            location = loc_val
    if not location and lead_doc and lead_doc.get("location"):
        loc_val = str(lead_doc.get("location")).strip()
        if "cyber" not in loc_val.lower() and "dlf" not in loc_val.lower():
            location = loc_val
    if not location and specific_ind_prompt and specific_ind_prompt.get("location"):
        loc_val = str(specific_ind_prompt.get("location")).strip()
        if "cyber" not in loc_val.lower() and "dlf" not in loc_val.lower():
            location = loc_val
    if not location and prompt_doc and prompt_doc.get("location"):
        loc_val = str(prompt_doc.get("location")).strip()
        if "cyber" not in loc_val.lower() and "dlf" not in loc_val.lower():
            location = loc_val
    if not location:
        location = city or shop_address or "our office"

    system_prompt = None
    welcome_text = None

    # Load from industry_prompts if available
    if specific_ind_prompt:
        if is_inbound:
            system_prompt = specific_ind_prompt.get("published_inbound_prompt") or specific_ind_prompt.get("inbound_prompt") or specific_ind_prompt.get("draft_inbound_prompt")
            welcome_text = specific_ind_prompt.get("published_inbound_welcome_message") or specific_ind_prompt.get("inbound_welcome_message") or specific_ind_prompt.get("draft_inbound_welcome_message")
        else:
            system_prompt = specific_ind_prompt.get("published_prompt") or specific_ind_prompt.get("prompt") or specific_ind_prompt.get("draft_prompt")
            welcome_text = specific_ind_prompt.get("published_welcome_message") or specific_ind_prompt.get("welcome_message") or specific_ind_prompt.get("draft_welcome_message")

    # Fall back to legacy published prompt IF the prompt industry matches
    if not system_prompt and prompt_doc and prompt_doc.get("industry") == call_industry:
        if is_inbound:
            system_prompt = prompt_doc.get("published_inbound_prompt") or prompt_doc.get("inbound_prompt") or prompt_doc.get("draft_inbound_prompt")
            welcome_text = prompt_doc.get("published_inbound_welcome_message") or prompt_doc.get("inbound_welcome_message") or prompt_doc.get("draft_inbound_welcome_message")
        else:
            system_prompt = prompt_doc.get("published_prompt") or prompt_doc.get("prompt") or prompt_doc.get("draft_prompt")
            welcome_text = prompt_doc.get("published_welcome_message") or prompt_doc.get("welcome_message") or prompt_doc.get("draft_welcome_message")

    # If still not found, load the gold-standard preset from template_def
    if not system_prompt and isinstance(template_def, dict):
        system_prompt = (template_def.get("inbound_prompt") if is_inbound else template_def.get("prompt")) or template_def.get("prompt")
    if not welcome_text and isinstance(template_def, dict):
        welcome_text = (template_def.get("inbound_welcome_message") if is_inbound else template_def.get("welcome_message")) or template_def.get("welcome_message")

    # Ultimate fallback if completely missing
    if not system_prompt:
        system_prompt = INDUSTRY_TEMPLATES["general_sales"]["inbound_prompt"] if is_inbound else INDUSTRY_TEMPLATES["general_sales"]["prompt"]
    if not welcome_text:
        welcome_text = INDUSTRY_TEMPLATES["general_sales"]["inbound_welcome_message"] if is_inbound else INDUSTRY_TEMPLATES["general_sales"]["welcome_message"]

    name_tags = ["{{customer_name}}", "{customer_name}", "{{lead_name}}", "{lead_name}", "{{name}}", "{name}", "{{lead}}", "{lead}"]
    if customer_name:
        for tag in name_tags:
            welcome_text = welcome_text.replace(tag, customer_name)
            system_prompt = system_prompt.replace(tag, customer_name)
    else:
        for tag in name_tags:
            welcome_text = welcome_text.replace(f"{tag}!", "!").replace(f"{tag},", "").replace(tag, "").replace("  ", " ").strip()
            system_prompt = system_prompt.replace(tag, "the customer")

    company_tags = ["{{company_name}}", "{company_name}", "{{company}}", "{company}"]
    for tag in company_tags:
        welcome_text = welcome_text.replace(tag, company_name)
        system_prompt = system_prompt.replace(tag, company_name)

    offering_tags = ["{{offering}}", "{offering}", "{{property_name}}", "{property_name}", "{{service}}", "{service}"]
    for tag in offering_tags:
        welcome_text = welcome_text.replace(tag, offering)
        system_prompt = system_prompt.replace(tag, offering)

    location_tags = ["{{property_location}}", "{property_location}", "{{location}}", "{location}"]
    for tag in location_tags:
        welcome_text = welcome_text.replace(tag, location)
        system_prompt = system_prompt.replace(tag, location)

    # Resolution for ecommerce delivery_address and order_id
    if not dyn_vars.get("delivery_address"):
        if lead_doc and (lead_doc.get("delivery_address") or lead_doc.get("location")):
            dyn_vars["delivery_address"] = str(lead_doc.get("delivery_address") or lead_doc.get("location")).strip()
        elif location and location != "our office":
            dyn_vars["delivery_address"] = location
    if not dyn_vars.get("order_id"):
        if lead_doc and lead_doc.get("order_id"):
            dyn_vars["order_id"] = str(lead_doc.get("order_id")).strip()
        elif lead_doc and lead_doc.get("lead_id"):
            dyn_vars["order_id"] = f"ORD-{str(lead_doc.get('lead_id'))[:6].upper()}"
    if not dyn_vars.get("appointment_time") and dyn_vars.get("preferred_time"):
        dyn_vars["appointment_time"] = dyn_vars["preferred_time"]

    for vk, vv in dyn_vars.items():
        welcome_text = welcome_text.replace(f"{{{{{vk}}}}}", str(vv)).replace(f"{{{vk}}}", str(vv))
        system_prompt = system_prompt.replace(f"{{{{{vk}}}}}", str(vv)).replace(f"{{{vk}}}", str(vv))

    # Robust language detection: checks Devanagari script, Roman Hindi/Hinglish keywords, and metadata
    _is_hindi_call = is_hindi_or_hinglish(welcome_text, system_prompt, str(call_doc.get("language") if call_doc else ""))

    # Dynamic Voice Gender Resolution & Persona Alignment
    raw_gender = (call_doc.get("voice_gender") if call_doc else None) or (company.get("voice_gender") if company else None) or "Female"
    voice_gender = "Male" if str(raw_gender).strip().lower() == "male" else "Female"

    # Natural language fallbacks for any remaining unassigned industry variable tags
    natural_fallbacks = {
        "{{budget}}": "budget" if not _is_hindi_call else "बजट",
        "{{doctor_name}}": "the doctor" if not _is_hindi_call else "हमारे विशेषज्ञ डॉक्टर",
        "{{appointment_time}}": "convenient time" if not _is_hindi_call else "सुविधाजनक समय",
        "{{preferred_time}}": "convenient time" if not _is_hindi_call else "सुविधाजनक समय",
        "{{batch_time}}": "flexible batch" if not _is_hindi_call else "सुविधाजनक बैच",
        "{{current_role}}": "current background" if not _is_hindi_call else "आपकी वर्तमान प्रोफ़ाइल",
        "{{loan_amount}}": "loan amount" if not _is_hindi_call else "लोन राशि",
        "{{tenure}}": "tenure" if not _is_hindi_call else "अवधि",
        "{{company_size}}": "team size" if not _is_hindi_call else "टीम साइज",
        "{{amount_due}}": "overdue amount" if not _is_hindi_call else "बकाया राशि",
        "{{due_date}}": "due date" if not _is_hindi_call else "देय तिथि",
        "{{order_amount}}": "order amount" if not _is_hindi_call else "ऑर्डर राशि",
        "{{order_id}}": "recent order" if not _is_hindi_call else "हालिया ऑर्डर",
        "{{delivery_address}}": "your delivery address" if not _is_hindi_call else "डिलीवरी पता",
        "{{shop_address}}": shop_address or ("our store representative" if not _is_hindi_call else "हमारे स्टोर प्रतिनिधि"),
        "{{landmark}}": landmark or "",
        "{{city}}": city or "",
        "{{shop_timings}}": shop_timings or "",
        "{{contact_number}}": contact_number or ""
    }
    for tag, fb in natural_fallbacks.items():
        welcome_text = welcome_text.replace(tag, fb)
        system_prompt = system_prompt.replace(tag, fb)

    # Dynamic Hindi Grammar Alignment based on selected voice gender
    if _is_hindi_call:
        if voice_gender == "Female":
            welcome_text = re.sub(r'(?<!\S)बोल रहा हूँ', 'बोल रही हूँ', welcome_text)
            welcome_text = re.sub(r'(?<!\S)सकता हूँ', 'सकती हूँ', welcome_text)
            welcome_text = re.sub(r'(?<!\S)समझ गया', 'समझ गई', welcome_text)
        else:
            welcome_text = re.sub(r'(?<!\S)बोल रही हूँ', 'बोल रहा हूँ', welcome_text)
            welcome_text = re.sub(r'(?<!\S)सकती हूँ', 'सकता हूँ', welcome_text)
            welcome_text = re.sub(r'(?<!\S)समझ गई', 'समझ गया', welcome_text)

    # Collapse an exact word immediately repeated back-to-back ("options
    # options", "program program") - confirmed live, happens whenever a
    # lead's own stored offering/location/custom-field value ends in the
    # same word a template appends right after it (e.g. offering="Loan
    # options" + template "...{{offering}} options..."). Deliberately
    # narrow: only catches the SAME bare word directly adjacent to itself,
    # case-insensitive - real speech essentially never does this by
    # accident, so this can't eat an intentional repetition (those use
    # different punctuation/emphasis, e.g. "no, no, no" or "bye bye").
    _dedupe_adjacent_word = re.compile(r"\b(\w+)(\s+\1\b)+", re.IGNORECASE)
    welcome_text = _dedupe_adjacent_word.sub(r"\1", welcome_text)
    system_prompt = _dedupe_adjacent_word.sub(r"\1", system_prompt)

    # Collapse singular/plural near-duplicates ("solution solutions", "solutions solution", "service services", "option options")
    _dedupe_plural_word = re.compile(r"\b(\w+?)(?:s|es)?\s+\1(?:s|es)?\b", re.IGNORECASE)
    welcome_text = _dedupe_plural_word.sub(r"\1", welcome_text)
    system_prompt = _dedupe_plural_word.sub(r"\1", system_prompt)

    # Deduplicate repeated words in Hindi / Devanagari (where ASCII \b fails on Unicode ligatures)
    _dedupe_hindi_word = re.compile(r'(?:(?<=^)|(?<=\s))(\S+)(\s+\1)+(?=\s|$)', re.IGNORECASE)
    welcome_text = _dedupe_hindi_word.sub(r"\1", welcome_text)
    system_prompt = _dedupe_hindi_word.sub(r"\1", system_prompt)

    # Clean double currency symbols like ₹₹7000 or Rs. ₹
    welcome_text = re.sub(r"₹\s*₹", "₹", welcome_text)
    welcome_text = re.sub(r"Rs\.?\s*₹", "₹", welcome_text, flags=re.IGNORECASE)
    system_prompt = re.sub(r"₹\s*₹", "₹", system_prompt)
    system_prompt = re.sub(r"Rs\.?\s*₹", "₹", system_prompt, flags=re.IGNORECASE)

    _goodbye_line = "बहुत-बहुत धन्यवाद, आपका दिन शुभ हो! अलविदा।" if _is_hindi_call else "Thank you so much, have a great day! Goodbye."
    _repeat_line = "माफ कीजिए, क्या आप फिर से बता सकते हैं?" if _is_hindi_call else "Sorry, could you repeat that?"
    _minimal_prompt_hint = "'जी?', 'हाँ, बोलिए', or 'जी, बताइए'" if _is_hindi_call else "'Yes?' or 'Go ahead'"

    # Enforce strict language lock based on the prompt/greeting's language
    if _is_hindi_call:
        gender_directive = (
            f"- GENDER CONSISTENCY: Your agent persona is {voice_gender.upper()}. In Hindi/Hinglish, always use "
            + ("FEMININE verb forms ('बोल रही हूँ', 'समझ गई', 'सकती हूँ', 'करूँगी'). Never use masculine forms ('रहा हूँ', 'सकता हूँ', 'गया').\n" if voice_gender == "Female"
               else "MASCULINE verb forms ('बोल रहा हूँ', 'समझ गया', 'सकता हूँ', 'करूँगा'). Never use feminine forms ('रही हूँ', 'सकती हूँ', 'गई').\n")
        )
        indian_accent_directive = (
            "CRITICAL VOICE & ACCENT DIRECTIVE:\n"
            "- IDENTITY: You are an Indian professional voice representative calling from an office in India.\n"
            f"{gender_directive}"
            "- ACCENT: Speak in natural, everyday Hindi / Hinglish.\n"
            "- STRICT LANGUAGE LOCK (HINDI / HINGLISH): This call is configured in HINDI / HINGLISH and your opening greeting was in Hindi/Hinglish. You MUST speak and converse in natural Hindi/Hinglish throughout the entire call. "
            "Even when the customer gives short responses, mixed terms, or common English words like 'Haan kar rahe hain', 'Mobile phone', 'Tomorrow', 'Morning', 'Yes', 'Okay', 'Hello', 'Sure', 'Noida', you MUST continue speaking in Hindi/Hinglish. "
            "NEVER switch to English unless the customer explicitly demands English (e.g. 'talk in English' or 'speak in English').\n"
            "- LANGUAGE LIMIT: You speak Hindi and English. If the customer speaks a different regional language, politely say in Hindi that you can continue in Hindi or English.\n\n"
        )
        rule_10_language = (
            "\n10. ABSOLUTE LANGUAGE CONTINUITY (DO NOT SWITCH TO ENGLISH): Your opening greeting was in Hindi/Hinglish. You MUST continue speaking and asking questions in natural Hindi/Hinglish for the entire conversation. "
            "When the customer answers in Hindi, Hinglish, or short common words (e.g. 'Haan kar rahe hain', 'Mobile phone', 'Tomorrow', 'Morning', 'Yes', 'Yeah', 'OK', 'Haan', 'Ji', 'Boliye', 'Bataiye', 'Theek hai'), "
            "this is standard conversational Indian response — it is NOT a request to switch to English! "
            "You MUST continue your next responses in Hindi/Hinglish (e.g. 'बहुत बढ़िया! क्या कल सुबह आना सही रहेगा?' or 'Great! Kya kal subah aana theek rahega?'). "
            "NEVER switch to English unless the customer explicitly commands you to speak in English (e.g. 'talk in English', 'speak in English') — not otherwise."
        )
        natural_speech_directive = (
            "\n\nNATURAL HUMAN CONVERSATION STYLE (HINDI / HINGLISH):"
            "\n- Talk like a real person on a phone call, not someone reading a script. Short, warm, everyday conversational Hindi/Hinglish phrasing beats long formal sentences."
            "\n- STRICT LANGUAGE CONTINUATION: Since your opening greeting was in Hindi/Hinglish, stay in natural Hindi/Hinglish across every turn. Even if the customer answers 'Haan kar rahe hain', 'Mobile phone', 'Tomorrow', 'Yes', do NOT switch to English. Answer in Hindi/Hinglish."
            "\n- ZERO NAME REPETITION: You already greeted the customer by name in the opening message. Once the conversation is underway, NEVER repeat or say their name again in your responses (e.g. say 'जी बिल्कुल,' NOT 'जी बिल्कुल, [name],')."
            "\n- Keep acknowledgements brief, natural, and gender-consistent in Hindi/Hinglish: 'जी बिल्कुल', 'हाँ जी', 'बहुत अच्छा', 'बढ़िया', 'ज़रूर' - never use stiff transitions or robotic fillers."
            "\n- Ask ONE short, plain question at a time in Hindi/Hinglish (e.g. 'क्या कल सुबह आना सही रहेगा?', 'आप कौन सा समय पसंद करेंगे?')."
            f"\n- DOMAIN INTEGRITY: You are representing {company_name} regarding {offering or 'our services'}. Stick strictly to the domain, terminology, and facts provided in your system prompt and knowledge base. Never invent terms or concepts from unrelated industries."
            "\n- NO OVER-REPETITION OF OFFERING NAME: You already introduced the offering in your opening greeting. In subsequent turns, do NOT repeat the full formal offering title in every question. Refer to it naturally in conversation or ask your question directly (e.g. say 'इसके लिए आपका बजट लगभग कितना रहेगा?' or 'इसके लिए कौन सा समय सही रहेगा?')."
            "\n- SALES & OFFERING FLEXIBILITY (NEVER REJECT INQUIRIES): If the customer asks for an alternate option, variant, timing, tier, or configuration, NEVER turn them down or say you only offer one thing! Always acknowledge warmly that suitable options are available, explore their requirements, and guide them to the next step."
            "\n- React contextually to what the customer just said before moving on - a quick 'जी अच्छा', 'जी बिल्कुल', 'बढ़िया', 'ज़रूर' shows you are listening, but only acknowledge when they actually gave information. If they just said 'हाँ बताइए', flow directly into your question without saying 'समझ गया'."
            "\n- Vary how you start each turn. Don't open every single turn the same way - mix it up the way a real person would."
            "\n- Never sound like a call-center script, an email, or a formal announcement. This is a live, warm, human conversation between two people in Hindi/Hinglish.\n\n"
        )
    else:
        indian_accent_directive = (
            "CRITICAL VOICE & ACCENT DIRECTIVE:\n"
            "- IDENTITY: You are an Indian professional voice representative calling from an office in India.\n"
            "- ACCENT: Speak with an authentic, natural urban Indian English accent (Indian English cadence, syllable-timing, and clear intonation).\n"
            "- PHONETICS: Use distinct Indian English articulation (crisp dental 't' and 'd' stops, clear vowels, NO American rhotic 'r' drawl, NO American slang or valley-girl inflection).\n"
            "- PROHIBITED: NEVER speak in an American, British, or foreign Western accent. Avoid American filler sounds like 'gonna', 'wanna', 'kinda'.\n"
            "- STRICT LANGUAGE LOCK (ENGLISH): This call is configured in ENGLISH and your opening greeting was in English. You MUST speak entirely and exclusively in English throughout the entire call. Even when the customer gives a short confirmation like 'Yes', 'Okay', 'Sure', 'Hello', or 'Tell me', you MUST continue in English. NEVER speak in Hindi or Hinglish unless the customer explicitly demands Hindi (e.g. 'हिंदी में बात करो' or 'speak in Hindi').\n"
            "- LANGUAGE LIMIT: You speak English and Hindi. If the customer speaks a different regional language, politely say in English that you can continue in English or Hindi.\n\n"
        )
        rule_10_language = (
            "\n10. STRICT ENGLISH CONTINUATION (NO HINDI SWITCH): Your opening greeting was in English. When the customer's reply is a short acknowledgment like 'Hello', 'Hi', 'Yes', 'Yeah', 'OK', 'Sure', 'Tell me', 'Haan', 'Boliye', this is them confirming they are listening. You MUST continue your very next response in English. Do NOT switch to Hindi or Hinglish on your own. ONLY switch to Hindi if the customer explicitly commands you to speak in Hindi (e.g. 'हिंदी में बात करो', 'speak in Hindi')."
        )
        # Clean any stale Hindi language instructions from English prompts
        system_prompt = re.sub(r"(?i)Converse in Hindi/?Hinglish naturally", "Converse strictly in English naturally", system_prompt)
        system_prompt = re.sub(r"(?i)हिंदी/?हिंग्लिश में स्वाभाविक रूप से", "English में स्वाभाविक रूप से", system_prompt)
        natural_speech_directive = (
            "\n\nNATURAL HUMAN CONVERSATION STYLE (ENGLISH):"
            "\n- Talk like a real person on a phone call, not someone reading a script. Short, warm, everyday phrasing beats long formal sentences."
            "\n- ZERO NAME REPETITION: You already greeted the customer by name in the opening message. Once the conversation is underway, NEVER repeat or say their name again in your responses (e.g. say 'I see,' NOT 'I see, [name],'; say 'Got it,' NOT 'Got it, [name],'; say 'You\\'re welcome!' NOT 'You\\'re welcome, [name]!'). In real life, humans never repeat someone's name on every single reply."
            "\n- Keep acknowledgements brief and natural: 'Great, thanks!', 'Sure, no problem', 'Got it', 'Perfect' - not stiff transitions like 'Thank you for that information.'"
            "\n- Ask ONE short, plain question at a time. Prefer 'What exactly are you looking for?' over a long compound sentence."
            f"\n- DOMAIN INTEGRITY: You are representing {company_name} regarding {offering or 'our services'}. Stick strictly to the domain, terminology, and facts provided in your system prompt and knowledge base. Never invent terms or concepts from unrelated industries."
            "\n- NO OVER-REPETITION OF OFFERING NAME: You already introduced the offering in your opening greeting. In subsequent turns, do NOT repeat the full formal offering title in every question. Refer to it naturally in conversation or ask your question directly (e.g. 'What budget do you have in mind for this?' or 'What time would suit you best?')."
            "\n- SALES & OFFERING FLEXIBILITY (NEVER REJECT INQUIRIES): If the customer asks for an alternate option, variant, timing, tier, or configuration, NEVER turn them down or say you only offer one thing! Always acknowledge warmly that suitable options are available, explore their requirements, and guide them to the next step."
            "\n- Use natural contractions (I'm, you're, that's, don't, can't, we'll) instead of full formal forms."
            "\n- React briefly to what the customer just said before moving on - a quick 'Oh nice', 'I see', 'Makes sense', 'Okay cool' shows you're actually listening."
            "\n- Vary how you start each turn. Don't open every single turn the same way - mix it up the way a real person would."
            "\n- Never sound like a call-center script, an email, or a formal announcement being read aloud. This is a live, warm, human conversation between two people.\n\n"
        )

    conversation_rules = (
        "\n\nCRITICAL CONVERSATIONAL & REJECTION RULES:"
        "\n1. ACCENT: Maintain your authentic, polite Indian accent consistently across every turn."
        "\n2. REJECTION & HESITATION: If the customer shows explicit rejection ('Not interested', 'No', 'Bye') or soft hesitation ('Call later', 'Busy right now', 'Maybe some other time'), do NOT push the sales pitch. Say a warm goodbye in the call's language and execute end_call."
        "\n3. OFF-TOPIC REMARKS: If the customer makes a sensible off-topic remark or small talk, briefly acknowledge it in one short sentence, then gently guide them back to your objective."
        "\n4. CONVERSATIONAL MODES & STAGE PROGRESSION:"
        "\n   - MODE A (INFORMATION ASSISTANCE): When the customer asks ANY question (e.g. subsidy amount, pricing, rooftop space required, warranty years, performance in rain/monsoon, installation timeline, or whether inspection is free), PRIORITIZE answering their inquiry factually and concisely in 1-2 sentences using the Knowledge Base. NEVER immediately push or ask to book an appointment/site survey right after answering! Instead, verify if they understood or if they have further questions (e.g. 'क्या आप इसके बारे में कुछ और जानना चाहते हैं?' or 'क्या यह स्पष्ट है?')."
        "\n   - MODE B (APPOINTMENT SCHEDULING): Transition to scheduling ONLY when: (1) the customer explicitly asks to schedule/book (e.g. 'book a time', 'कब आ सकते हैं', 'slot book kar dijiye', 'appointment fix kar do'), OR (2) all their questions have been answered and they confirm readiness. When proposing a time, offer two clear options in Hindi words (e.g. 'सुबह दस बजे या दोपहर दो बजे?'). Once the customer selects a time, confirm it immediately in ONE warm sentence, say goodbye, and execute end_call."
        "\n   - ANTI-REPETITION MANDATE: NEVER repeatedly ask the same closing or booking question across consecutive turns. If you previously asked for an appointment and the customer asked a technical question instead, answer the question completely and do NOT repeat the appointment question."
        "\n5. ONE QUESTION PER TURN: Ask strictly ONE question per turn. Never speak two questions back-to-back."
        "\n6. AUTOMATIC HANGUP: Immediately after concluding your goodbye, invoke the end_call function."
        f"\n7. CONTEXTUAL SPEECH-TO-TEXT ROBUSTNESS: Spoken input on phone lines often has minor STT phonetic mishearings or mixed Hinglish. Interpret them contextually without asking to repeat:"
        "\n   - 'side infection' / 'site infection' -> site inspection (साइट निरीक्षण)"
        "\n   - 'chhatra roop space' / 'chhat space' -> rooftop space (छत की जगह)"
        "\n   - 'शूज़ करेंगे' / 'shoes' -> choose / select slot (समय चुनना)"
        "\n   - 'zaroorat padegi' / 'chal raha hai' -> customer acknowledging or stating current status"
        f"\n   - Only if input is truly unintelligible noise, politely ask: '{_repeat_line}'."
        "\n8. SERVICE MISMATCH: If the customer expresses a need unrelated to your offering, politely clarify what your company does in one sentence. If they need something else, wish them well and end call."
        "\n9. NEVER READ SLASHES OR PLACEHOLDERS: Silently select the single correct grammatical option (e.g. 'बोल रही हूँ' for female voice); never read formatting artifacts or bracketed placeholders aloud."
        f"{rule_10_language}"
        "\n11. BARE GREETING TO AVAILABILITY: If your opening greeting asked for availability ('Do you have 2 minutes?') and the customer replies with 'Yes', 'Hello', 'Hi', or 'Haan', treat that as consent to proceed. Do NOT re-ask availability; go straight to the next step."
        f"\n12. ATTENTION CHECK MID-CALL: If the customer gives a filler mid-conversation ('Hello', 'Can you hear me?', 'Ji boliye'), do NOT repeat or rephrase your question. Simply give a brief prompt ({_minimal_prompt_hint}) and wait for their answer."
        "\n13. CONTRADICTION & MEMORY CHECK: Never re-ask qualification questions that the customer already answered earlier in the call (e.g. if they already confirmed rooftop space or bill > ₹2500, remember it and never ask again). If they contradict an earlier detail, briefly clarify."
        "\n14. ABSOLUTE PROHIBITION ON ASKING IDENTITY IN OUTBOUND CALLS:"
        "\n   - In all outbound calls where your opening greeting already addressed the customer by name (e.g. 'Hi [CustomerName]...' or 'नमस्ते [CustomerName]...'), when the customer gives ANY opening acknowledgment (e.g. 'Yes', 'Yeah', 'यह', 'यस', 'Haan', 'हाँ', 'Speaking', 'Hello', 'Ji', 'Boliye', 'Sure', 'OK'), their identity is 100% ESTABLISHED."
        "\n   - You are STRICTLY FORBIDDEN from asking 'am I speaking with [CustomerName]?', 'is this [CustomerName]?', 'just to confirm am I speaking with...', or re-asking their name! Proceed directly to your first discovery / qualification question."
        "\n   - Only on incoming/inbound calls where the caller is completely unknown may you ask who is speaking."
        "\n15. NUMBER & MEASUREMENT SPOKEN PHRASING: When speaking in Hindi, express all numbers, times, currency, and measurements naturally in Hindi words (e.g. 'सुबह दस बजे', 'दोपहर दो बजे', 'ग्यारह बजे', 'अठहत्तर हज़ार रुपये', 'तीन किलोवाट', 'ढाई सौ से तीन सौ वर्ग फुट', 'पच्चीस साल'). NEVER use raw numerical digits like '10 बजे' or '2 बजे' in Hindi."
        "\n16. ASR DISAMBIGUATION & AMBIGUOUS NUMERICAL INTENT:"
        "\n   - When asking about electricity bills or financial figures (e.g. 'Is your bill above ₹2,500?'):"
        "\n   - Valid clear statements ('5000 hai', 'Five thousand', 'Mera bill paanch hazaar hai') must be recognized accurately as ₹5,000."
        "\n   - If the STT transcription produces ambiguous words (e.g. 'Fox Five', 'forty five', 'box five', 'five'), NEVER automatically assume or assume that the customer's bill exceeds ₹2,500! Ask for polite clarification: 'माफ कीजिए, क्या आपका मासिक बिल ₹5,000 है या कुछ और? कृपया राशि स्पष्ट कर दीजिए।'"
        "\n   - Never invent or assume customer-provided numbers. Accurately distinguish between 2500, 5000, and other amounts."
        "\n17. CLOUDY WEATHER & SOLAR TECHNICAL INQUIRIES:"
        "\n   - When the customer asks about weather conditions ('Cloudy weather mein bhi chalega?', rain, monsoon):"
        "\n   - Answer factually from Knowledge Base: Solar panels work on diffuse sunlight and continue generating power even on cloudy or rainy days (typically generating 20-30% of peak capacity), backed by net-metering / grid / battery backup."
        "\n   - Answer completely before asking if they have further questions. Do NOT force appointment booking."
        "\n18. APPOINTMENT CONFIRMATION VALIDATION WORKFLOW:"
        "\n   - Customer agreement or selecting a time (e.g. '10:00 AM', '2:00 PM', '2 baje aa jaunga') is NOT equivalent to a confirmed booking."
        "\n   - The mandatory workflow is: (1) Customer selects slot -> (2) Invoke 'book_appointment_slot' tool -> (3) Verify backend success -> (4) Confirm appointment to customer with warm 1-sentence wrap-up -> (5) Conclude goodbye and invoke 'end_call'."
        "\n   - If booking fails, politely explain the conflict and offer an alternative slot."
        "\n19. ZERO-HARDCODING POLICY: Never hardcode or invent subsidy amounts, eligibility rules, installation prices, or warranty periods. Always derive verified details from the Knowledge Base or clearly designate them as estimates ('लगभग ... अनुमानित'), subject to engineering site assessment."
    )

    # Collections compliance directive - opt-in only (companies.collections_mode),
    # so this has zero effect on any company that hasn't explicitly turned it on.
    # Not a general BFSI/industry-wide rule: a loan-inquiry sales call and a
    # loan-repayment collections call need different, even conflicting, tone
    # and escalation rules, so this is gated separately from `industry`.
    collections_directive = ""
    if company and company.get("collections_mode"):
        collections_directive = (
            "\n\nCOLLECTIONS COMPLIANCE RULES (overdue payment / loan repayment call):"
            "\n1. SELF-IDENTIFICATION: Early in the call, clearly state which company/lender you are calling on behalf of and that this call concerns an overdue payment. Never be vague or misleading about the purpose of the call."
            "\n2. NO PRESSURE TACTICS: Never threaten, use harsh/aggressive language, or imply legal/criminal consequences. Stay calm, respectful, and factual at all times, even if the customer is upset or hostile."
            "\n3. HARDSHIP OR DISTRESS = HUMAN ESCALATION, NOT MORE SCRIPT: If the customer mentions financial hardship (job loss, medical emergency, inability to pay, family crisis) or sounds genuinely distressed, do NOT continue qualifying or negotiating amounts yourself. Acknowledge it with empathy, say a trained team member will follow up personally on their situation, and end the call politely via end_call - do not keep pushing for a payment commitment."
            "\n4. PROMISE-TO-PAY MUST BE EXPLICIT: Only treat something as a promise to pay if the customer gives a clear, specific amount and/or date. A vague 'I'll try' or 'maybe soon' is NOT a commitment - acknowledge it, but do not restate it back as if it were a confirmed promise, and do not fabricate a specific amount/date they did not actually say."
            "\n5. RESPECT A REQUEST TO STOP: If the customer asks not to be called again, or to be contacted only at a different time, acknowledge this clearly and end the call politely - do not continue the pitch."
        )

    safe_print(f"[STREAM PROMPT]: Industry={call_industry}, Welcome='{welcome_text}'")

    template_lang = template_def.get("language") if isinstance(template_def, dict) else None
    default_lang = "Hindi" if _is_hindi_call else "English"
    call_lang = (
        (call_doc.get("language") if call_doc else None)
        or (lead_doc.get("language") if lead_doc else None)
        or template_lang
        
        or default_lang
    )
    # Whisper's `language` hint forces transcription into that language - a
    # wrong code actively hurts accuracy rather than helping (e.g. locking a
    # Tamil or pure-English caller into Hindi). Only pass a code for languages
    # Whisper actually supports well. "Hinglish" is pinned to "hi" rather than
    # left to auto-detect: tested live on 2026-10-27, omitting the language
    # for Hinglish calls let the model mis-detect Hindi speech as Urdu and
    # transcribe it in Arabic script - technically a distinct language, but
    # unreadable and useless for a team that works in Hindi/English. Devanagari
    # output with some imperfectly-folded-in English is far more usable than
    # accurate-but-unreadable Urdu script. True auto-detect is kept only for
    # languages with no mapping at all (an unexpected value, not the common
    # default path).
    WHISPER_LANGUAGE_CODES = {
        "en": "en", "english": "en", "indian english": "en", "en-in": "en",
        "hi": "hi", "hindi": "hi", "pure hindi": "hi", "hinglish": "hi", "hindi / hinglish": "hi", "hi-in": "hi",
        "tamil": "ta", "ta": "ta",
        "telugu": "te", "te": "te",
        "kannada": "kn", "kn": "kn",
        "malayalam": "ml", "ml": "ml",
        "bengali": "bn", "bn": "bn",
        "marathi": "mr", "mr": "mr",
        "gujarati": "gu", "gu": "gu",
        "punjabi": "pa", "pa": "pa",
        "urdu": "ur", "ur": "ur",
    }
    transcription_lang = WHISPER_LANGUAGE_CODES.get(str(call_lang).strip().lower())
    if not _is_hindi_call and transcription_lang == "hi":
        transcription_lang = "en"

    # Rule 15: Store Address Accuracy & Zero Hallucination
    if shop_address:
        supporting_notes = []
        if landmark:
            supporting_notes.append(f"Landmark: {landmark}")
        if city and city.lower() not in shop_address.lower():
            supporting_notes.append(f"City: {city}")
        supp_str = f" (supporting details: {', '.join(supporting_notes)})" if supporting_notes else ""
        store_address_rule = (
            "\n15. STORE / SHOP ADDRESS ACCURACY (ZERO HALLUCINATION):"
            "\n- When the customer asks for the shop address, store location, directions, or where to visit (e.g. 'Where is your shop?', 'Where are you located?', 'Dukaan kahan hai?', 'Aapka address kya hai?'):"
            f"\n  * You MUST state the Official Store Address exactly as configured: '{shop_address}'{supp_str}."
            "\n  * NEVER invent, shorten, replace, or assume an address (NEVER say any unverified location or guess an address)."
            "\n  * Use {{shop_address}} as the single source of truth for the complete address, with landmark/city only as supporting details."
        )
    else:
        rep_phone = contact_number or "our store helpline"
        store_address_rule = (
            "\n15. STORE / SHOP ADDRESS ACCURACY (ZERO HALLUCINATION):"
            "\n- When the customer asks for the shop address, store location, directions, or where to visit (e.g. 'Where is your shop?', 'Where are you located?', 'Dukaan kahan hai?', 'Aapka address kya hai?'):"
            "\n  * No specific store address has been configured for this campaign. NEVER invent, assume, or guess an address (do NOT say any unverified location)."
            f"\n  * Politely direct the customer to contact our store representative: 'Please contact our store representative at {rep_phone} for our exact store address and directions.' (or in Hindi: 'कृपया हमारे स्टोर प्रतिनिधि से {rep_phone} पर संपर्क करें, वे आपको सही पता और दिशा-निर्देश बता देंगे।')"
        )
    conversation_rules += store_address_rule

    addr_info = f"- Official Store / Shop Address: {shop_address}\n" if shop_address else "- Official Store / Shop Address: [Not configured - direct caller to contact store representative]\n"
    landmark_info = f"- Landmark: {landmark}\n" if landmark else ""
    city_info = f"- City: {city}\n" if city else ""
    timings_info = f"- Store Timings: {shop_timings}\n" if shop_timings else ""
    contact_info = f"- Store Contact Phone: {contact_number}\n" if contact_number else ""

    customer_context = (
        f"\nTARGET CALL RECIPIENT INFORMATION:\n"
        f"- Target Customer / Recipient Name: {customer_name}\n"
        f"- Company / Brand Name: {company_name}\n"
        f"- Primary Offering / Topic: {offering}\n"
        f"- Branch / Region: {location}\n"
        f"{addr_info}"
        f"{landmark_info}"
        f"{city_info}"
        f"{timings_info}"
        f"{contact_info}"
        f"You are speaking with {customer_name}. Address them by name ONLY in the initial greeting or when strictly verifying identity. ONCE IDENTITY IS ESTABLISHED, DO NOT REPEAT THEIR NAME (neither full name nor first name) on subsequent turns. In normal conversation, people do NOT append the other person's name to every sentence. Never say 'I see, {customer_name.split()[0]}', 'Got it, {customer_name.split()[0]}', or 'You\\'re welcome, {customer_name.split()[0]}'. Simply say 'I see,', 'Got it,', 'You\\'re welcome!'. Never say 'customer_name', 'underscore', or square brackets aloud.\n\n"
    ) if customer_name else (
        f"\nTARGET CALL RECIPIENT INFORMATION:\n"
        f"- Target Customer / Recipient: Valued Customer (name not provided - do NOT fabricate or guess any random name).\n"
        f"- Company / Brand Name: {company_name}\n"
        f"- Primary Offering / Topic: {offering}\n"
        f"- Branch / Region: {location}\n"
        f"{addr_info}"
        f"{landmark_info}"
        f"{city_info}"
        f"{timings_info}"
        f"{contact_info}\n"
    )

    raw_kb = (
        (specific_ind_prompt.get("published_knowledge_base") if specific_ind_prompt else None)
        or (specific_ind_prompt.get("knowledge_base") if specific_ind_prompt else None)
        or (template_def.get("knowledge_base") if isinstance(template_def, dict) else None)
        or (prompt_doc.get("published_knowledge_base") if prompt_doc else None)
        or (prompt_doc.get("knowledge_base") if prompt_doc else None)
        or ""
    )
    kb_directive = ""
    if raw_kb and "KNOWLEDGE BASE & VERIFIED" not in system_prompt:
        clean_kb = str(raw_kb).strip()
        kb_directive = (
            "\n\n--- KNOWLEDGE BASE & VERIFIED COMPANY FACTS ---\n"
            f"{clean_kb}\n\n"
            "KNOWLEDGE BASE INSTRUCTIONS:\n"
            "- When the customer asks any specific questions about offerings, pricing, terms, timings, warranty, eligibility, or policies, refer to the Knowledge Base above to give concise, accurate answers (1-2 sentences).\n"
            "- If a specific detail is NOT covered in the Knowledge Base, DO NOT guess or fabricate. Politely tell the customer that our specialist will verify and share the exact details.\n"
        )

    # Must stay after the conversation_rules += above - this is what
    # actually finalizes the prompt sent to the model.
    system_prompt = (
        indian_accent_directive
        + natural_speech_directive
        + customer_context
        + system_prompt
        + kb_directive
        + conversation_rules
        + collections_directive
    )

    # Clean up all placeholder tokens across the entire finalized prompt
    cname_val = customer_name if customer_name else "the customer"
    replacements = {
        "[CustomerName]": cname_val,
        "[YourCompany]": company_name,
        "{{customer_name}}": cname_val,
        "{customer_name}": cname_val,
        "_customer_name_": cname_val,
        "[customer_name]": cname_val,
        "{{company_name}}": company_name,
        "{company_name}": company_name,
        "[company_name]": company_name,
        "{{offering}}": offering,
        "{offering}": offering,
        "{{location}}": location,
        "{location}": location,
        "{{shop_address}}": shop_address if shop_address else (f"our store representative at {contact_number}" if contact_number else "our store representative"),
        "{shop_address}": shop_address if shop_address else (f"our store representative at {contact_number}" if contact_number else "our store representative"),
        "{{landmark}}": landmark,
        "{landmark}": landmark,
        "{{city}}": city,
        "{city}": city,
        "{{shop_timings}}": shop_timings,
        "{shop_timings}": shop_timings,
        "{{contact_number}}": contact_number,
        "{contact_number}": contact_number,
    }
    for vk, vv in dyn_vars.items():
        replacements[f"{{{{{vk}}}}}"] = str(vv)
        replacements[f"{{{vk}}}"] = str(vv)

    for k, v in replacements.items():
        system_prompt = system_prompt.replace(k, str(v))
        welcome_text = welcome_text.replace(k, str(v))

    # Sarvam voice: default ON for every company (current and future) as of
    # 2026-11-03, not just the original TCS pilot - companies.use_sarvam_voice
    # now only matters as an explicit opt-OUT (set to False) if a specific
    # company needs to fall back to OpenAI's native voice. Still only for
    # languages actually validated against Sarvam so far (English,
    # Hindi/Hinglish); every other language still falls back to OpenAI's
    # native voice rather than guessing on a live call.
    voice_engine = "openai"
    sarvam_voice = None
    bakbak_voice = None

    # Raya / Bakbak TTS is ALWAYS the voice engine for natural conversational Indian voice
    bakbak_voice = bakbak_voice_for(transcription_lang) if BAKBAK_API_KEY else None
    if BAKBAK_API_KEY and bakbak_voice:
        voice_engine = "bakbak"
    elif company and company.get("use_sarvam_voice", True) and SARVAM_API_KEY:
        sarvam_voice = sarvam_voice_for(transcription_lang)
        if sarvam_voice:
            voice_engine = "sarvam"

    # Decoupled pipeline (Sarvam STT -> LLM -> Bakbak TTS, unified voice, zero tone shift)
    # Default to decoupled for all companies when BAKBAK_API_KEY, SARVAM_API_KEY, and OPENAI_API_KEY are configured
    conversation_engine = "openai_realtime"
    preferred_engine = (company.get("conversation_engine") if company else None) or "decoupled"
    if preferred_engine == "decoupled" and (BAKBAK_API_KEY or SARVAM_API_KEY):
        if not bakbak_voice:
            bakbak_voice = bakbak_voice_for(transcription_lang)
        if not sarvam_voice:
            sarvam_voice = sarvam_voice_for(transcription_lang)
        if (bakbak_voice or sarvam_voice or SARVAM_API_KEY) and OPENAI_API_KEY and SARVAM_API_KEY:
            conversation_engine = "decoupled"
        else:
            safe_print(f"[DECOUPLED]: conversation_engine is decoupled but a dependency is missing "
                        f"(sarvam_key={bool(SARVAM_API_KEY)}, openai_key={bool(OPENAI_API_KEY)}) "
                        f"for language '{call_lang}' - falling back to OpenAI Realtime.")

    return {
        "system_prompt": system_prompt,
        "welcome_text": welcome_text,
        "call_lang": str(call_lang).strip() if call_lang else ("Hindi" if _is_hindi_call else "English"),
        "transcription_lang": transcription_lang,
        "company": company,
        "voice_engine": voice_engine,
        "conversation_engine": conversation_engine,
        "sarvam_speaker": sarvam_voice["speaker"] if sarvam_voice else None,
        "sarvam_language_code": sarvam_voice["language_code"] if sarvam_voice else None,
        "bakbak_voice_id": bakbak_voice["voice_id"] if bakbak_voice else None,
        "bakbak_language": bakbak_voice["language"] if bakbak_voice else None,
        "bakbak_model": bakbak_voice["model"] if bakbak_voice else None,
        "customer_name": customer_name,
        "voice_gender": voice_gender,
        "is_inbound": is_inbound,
        "offering": offering,
        "call_industry": call_industry,
        "call_uuid": call_doc.get("plivo_call_uuid") if call_doc else None,
    }


def _openai_session_update_payload(system_prompt: str, transcription_lang: str = None, text_only: bool = False) -> dict:
    # Reverted from gpt-4o-mini-transcribe back to whisper-1 (2026-10-27):
    # gpt-4o-mini-transcribe has a well-documented community-reported bug
    # where it ignores the `language` hint entirely - confirmed live here too,
    # a single Hindi/Hinglish call came back transcribed in Hindi, Urdu, Thai,
    # and Bengali script in the same conversation despite "hi" being pinned.
    # whisper-1 reliably honors `language` as a hard constraint, which is what
    # we actually need given Hinglish is pinned to "hi" below.
    transcription_config = {"model": "whisper-1"}
    if transcription_lang:
        # Only pin a language when we have a reliable code for it - see
        # resolve_call_voice_context.
        transcription_config["language"] = transcription_lang

    audio_config = {
        "input": {
            "format": {"type": "audio/pcmu"},
            "transcription": transcription_config,
            # Suppresses background/ambient noise before it reaches the
            # transcriber and the turn-detector - "near_field" fits a
            # phone call (mic close to the speaker's mouth), unlike
            # "far_field" which targets laptop/conference-room mics.
            # Confirmed via OpenAI's official SDK reference docs. Watch
            # for added turn-taking latency on the next test call - one
            # community report flagged this as a real tradeoff.
            "noise_reduction": {"type": "near_field"},
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.65,
                # Wider than before on purpose: short/fragmented audio
                # clips are what push Whisper into hallucinating fluent
                # but unrelated text instead of transcribing accurately.
                # More lead-in and more silence before cutting a turn
                # gives it fuller, less ambiguous utterances to work with.
                "prefix_padding_ms": 500,
                "silence_duration_ms": 1000,
                "create_response": True,
                # False on purpose: the agent's current line must always
                # finish uninterrupted - confirmed live that the customer's
                # own backchannel ("Hello") firing speech_started while the
                # agent was still mid-sentence cut the line short and the
                # next turn started right on top of it, reading as two
                # sentences spoken on top of each other. Our own
                # speech_started handler below now does the equivalent
                # client-side gating (skips response.cancel/clearAudio
                # while agent_speaking), so this is belt-and-suspenders.
                "interrupt_response": False
            }
        }
    }
    if not text_only:
        audio_config["output"] = {
            "format": {"type": "audio/pcmu"},
            "voice": "coral",
            "speed": 1.0
        }

    session = {
        "type": "realtime",
        "instructions": system_prompt,
        "audio": audio_config,
        "tools": [
            {
                "type": "function",
                "name": "end_call",
                "description": "Hang up and terminate the call immediately when the conversation is finished, after the appointment or inquiry has been confirmed and you have said a polite goodbye.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "reason": {
                            "type": "string",
                            "description": "Reason for ending the call (e.g. appointment_confirmed, customer_ended)"
                        }
                    },
                    "required": ["reason"]
                }
            },
            {
                "type": "function",
                "name": "book_appointment_slot",
                "description": "Validate and reserve an appointment or site inspection slot in the backend scheduling system. Invoke this tool as soon as the customer selects an inspection/consultation time (e.g. '10:00 AM', '2:00 PM', 'weekend 10 AM') to verify availability and submit the booking request before confirming to the customer.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "slot_time": {
                            "type": "string",
                            "description": "The selected time slot, e.g. '10:00 AM', '2:00 PM'"
                        },
                        "slot_date": {
                            "type": "string",
                            "description": "The selected date or day, e.g. 'this weekend', 'Saturday', 'tomorrow'"
                        }
                    },
                    "required": ["slot_time"]
                }
            }
        ],
        "tool_choice": "auto"
    }
    if text_only:
        # Sarvam voice pilot: no audio generated by OpenAI at all - we only
        # want its transcription + LLM turns, and synthesize speech
        # ourselves via Sarvam. (OpenAI's docs note audio can occasionally
        # leak through even in text-only mode - the stream handler below
        # drops any such delta defensively rather than trusting this flag
        # alone.)
        session["output_modalities"] = ["text"]

    return {
        "type": "session.update",
        "session": session
    }


async def prewarm_openai_session(call_id: str, company_id: str = None):
    """Open and configure the OpenAI Realtime session the moment the call is
    answered - before Plivo's bidirectional media stream even connects - so
    /stream can reuse an already-warm, already-configured connection instead
    of paying the connect + session.update round trip after the customer is
    already live on the line. On any failure this simply does not populate
    the cache; /stream's existing cold-path logic runs exactly as before.
    """
    if not call_id:
        return
    try:
        db = mongodb.get_db()
        ctx = await resolve_call_voice_context(db, call_id, company_id)

        # Decoupled calls never touch OpenAI Realtime at all (see
        # plivo_decoupled.py) - connecting it here was pure waste (a real
        # websocket handshake to OpenAI that gets thrown away), and the time
        # that handshake took was exactly the race window that caused
        # /stream's engine check to sometimes find this cache not yet
        # populated and recompute resolve_call_voice_context a second time
        # (confirmed live via a duplicated "[STREAM PROMPT]" log line even
        # after that recompute was made conditional). Populating the cache
        # with just the already-resolved ctx - no slow connect needed -
        # closes that race instead of only narrowing it.
        if ctx.get("conversation_engine") == "decoupled":
            OPENAI_PREWARM_CACHE[call_id] = dict(ctx)
            try:
                from routes.plivo_decoupled import prewarm_decoupled_greeting
                prewarm_decoupled_greeting(
                    call_id=call_id,
                    company_id=company_id,
                    welcome_text=ctx.get("welcome_text"),
                    bakbak_voice_id=ctx.get("bakbak_voice_id"),
                    bakbak_language=ctx.get("bakbak_language"),
                    bakbak_model=ctx.get("bakbak_model")
                )
                safe_print(f"[PREWARM]: Initiated Bakbak TTS greeting prewarm for call_id={call_id} (conversation_engine=decoupled)")
            except Exception as pw_err:
                safe_print(f"[PREWARM NOTICE]: Could not initiate Bakbak prewarm for call_id={call_id}: {pw_err}")
            return

        openai_key = os.environ.get("OPENAI_API_KEY", "").strip() or OPENAI_API_KEY
        if not openai_key:
            return
        openai_ws_url = "wss://api.openai.com/v1/realtime?model=gpt-realtime"
        openai_headers = {"Authorization": f"Bearer {openai_key}"}

        async def _connect_openai():
            ws_cm = websockets.connect(openai_ws_url, additional_headers=openai_headers)
            openai_ws = await asyncio.wait_for(ws_cm.__aenter__(), timeout=8.0)
            await asyncio.wait_for(openai_ws.recv(), timeout=8.0)  # session.created
            # Always start in native-audio mode, even for a Sarvam call - the
            # greeting is spoken via OpenAI's own voice for speed, and the
            # session switches to text-only (for Sarvam) right after it
            # finishes. See the sarvam_mode_active comment in /stream.
            session_update = _openai_session_update_payload(ctx["system_prompt"], ctx["transcription_lang"], text_only=False)
            await openai_ws.send(json.dumps(session_update))
            return ws_cm, openai_ws

        async def _connect_sarvam():
            # Runs concurrently with the OpenAI connect below, not after it -
            # previously this only happened in /stream, serially, right before
            # the greeting, adding a full extra websocket-connect-plus-configure
            # round trip to Sarvam on top of everything else before the
            # customer heard anything. Prewarming it here in parallel removes
            # that wait from the hot path entirely for the common case.
            # Also covers Bakbak (holds the same "sarvam_session" slot - see
            # the sarvam_mode_active comment in /stream for why the naming
            # stayed Sarvam-specific rather than a broader rename).
            if ctx["voice_engine"] == "sarvam" and SARVAM_API_KEY:
                try:
                    session = SarvamTTSSession(SARVAM_API_KEY, ctx["sarvam_speaker"], ctx["sarvam_language_code"])
                    await asyncio.wait_for(session.__aenter__(), timeout=8.0)
                    return session
                except Exception as e:
                    safe_print(f"[PREWARM ERROR]: Sarvam prewarm failed for call_id={call_id}: {e}")
                    return None
            elif ctx["voice_engine"] == "bakbak" and BAKBAK_API_KEY:
                try:
                    session = BakbakTTSSession(BAKBAK_API_KEY, ctx["bakbak_voice_id"], ctx["bakbak_language"], ctx["bakbak_model"])
                    await asyncio.wait_for(session.__aenter__(), timeout=8.0)
                    return session
                except Exception as e:
                    safe_print(f"[PREWARM ERROR]: Bakbak prewarm failed for call_id={call_id}: {e}")
                    return None
            return None

        (ws_cm, openai_ws), sarvam_session = await asyncio.gather(_connect_openai(), _connect_sarvam())

        OPENAI_PREWARM_CACHE[call_id] = {
            "ws_cm": ws_cm,
            "openai_ws": openai_ws,
            "system_prompt": ctx["system_prompt"],
            "welcome_text": ctx["welcome_text"],
            "call_lang": ctx.get("call_lang"),
            "company": ctx["company"],
            "voice_engine": ctx["voice_engine"],
            "conversation_engine": ctx["conversation_engine"],
            "transcription_lang": ctx["transcription_lang"],
            "sarvam_speaker": ctx["sarvam_speaker"],
            "sarvam_language_code": ctx["sarvam_language_code"],
            "bakbak_voice_id": ctx["bakbak_voice_id"],
            "bakbak_language": ctx["bakbak_language"],
            "bakbak_model": ctx["bakbak_model"],
            "sarvam_session": sarvam_session,
            "is_inbound": ctx.get("is_inbound", False),
        }
        safe_print(f"[PREWARM]: OpenAI Realtime session ready ahead of stream connect for call_id={call_id}")

        async def _expire():
            await asyncio.sleep(25.0)
            entry = OPENAI_PREWARM_CACHE.pop(call_id, None)
            if entry:
                try:
                    await entry["ws_cm"].__aexit__(None, None, None)
                except Exception:
                    pass
                if entry.get("sarvam_session"):
                    try:
                        await entry["sarvam_session"].__aexit__(None, None, None)
                    except Exception:
                        pass
                safe_print(f"[PREWARM]: Expired unclaimed session for call_id={call_id}")
        asyncio.create_task(_expire())

    except Exception as e:
        safe_print(f"[PREWARM ERROR]: Could not pre-warm OpenAI session for call_id={call_id}: {e}")


@plivo_router.api_route("/answer", methods=["GET", "POST"])
async def plivo_answer_call(request: Request, call_id: str = Query(None), company_id: str = Query(None)):
    """
    Called by Plivo when an outbound or inbound call is answered.
    Returns Plivo XML directing Plivo to stream real-time audio over WebSocket.
    """
    if request.method == "POST":
        try:
            form_data = await request.form()
            data = dict(form_data)
        except Exception:
            data = dict(request.query_params)
    else:
        data = dict(request.query_params)

    call_uuid = data.get("CallUUID")
    dialed_to = data.get("To", "")
    caller_from = data.get("From", "")
    direction = data.get("Direction", "outbound")
    logger.info(f"Plivo Call Answered: call_id={call_id}, call_uuid={call_uuid}, direction={direction}, from={caller_from}, to={dialed_to}")

    db = mongodb.get_db()

    # Handle Inbound Calls (Customer calling our Plivo number directly)
    if not call_id:
        import time
        call_id = f"inbound-{int(time.time() * 1000)}"
        clean_to = dialed_to if str(dialed_to).startswith("+") else f"+{dialed_to}"
        clean_from = caller_from if str(caller_from).startswith("+") else f"+{caller_from}"

        # Resolve which company owns this number
        if not company_id:
            num_doc = await db.phone_numbers.find_one({"phone_number": clean_to})
            if num_doc and num_doc.get("company_id"):
                company_id = num_doc["company_id"]
            if not company_id:
                comp = await db.companies.find_one({"telephony.phone_number": clean_to})
                if comp and comp.get("company_id"):
                    company_id = comp["company_id"]
            if not company_id:
                # No company owns this number - reject rather than silently
                # routing (and billing) an unregistered/misconfigured number
                # to some other tenant. Previously defaulted to a hardcoded
                # company_id here, which meant a number that was never
                # properly registered in db.phone_numbers/companies.telephony
                # would silently hand the call, its transcript, and its
                # billing to an unrelated company.
                logger.warning(f"Inbound call to unregistered number {clean_to} rejected - no company owns it.")
                unmatched_xml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak>Sorry, this number is not currently in service.</Speak>
    <Hangup/>
</Response>"""
                return Response(content=unmatched_xml.encode("utf-8"), media_type="text/xml; charset=utf-8")

        # Block the AI agent from picking up if this company is out of free
        # trial minutes and has no wallet balance - still answer the call
        # (so the caller doesn't just hear ringing-into-nothing) but tell
        # them the line can't take the call right now instead of silently
        # running up a bill nobody can pay.
        allowance = await billing_service.check_call_allowance(db, company_id)
        if not allowance["allowed"]:
            logger.warning(f"Inbound call to company {company_id} blocked - {allowance['reason']}")
            busy_xml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak>This number is temporarily unable to take calls. Please try again later.</Speak>
    <Hangup/>
</Response>"""
            return Response(content=busy_xml.encode("utf-8"), media_type="text/xml; charset=utf-8")

        # Check if caller matches an existing lead
        caller_name = "Inbound Caller"
        digits = "".join(filter(str.isdigit, clean_from))
        if len(digits) >= 10:
            last10 = digits[-10:]
            lead_match = await db.leads.find_one({"phone": {"$regex": last10}, "company_id": company_id})
            if lead_match and lead_match.get("name"):
                caller_name = lead_match["name"].strip()

        comp_doc = await db.companies.find_one({"company_id": company_id})
        comp_ind = (comp_doc.get("industry") if comp_doc else None) or "general_sales"

        await db.calls.insert_one({
            "call_id": call_id,
            "company_id": company_id,
            "customer_id": clean_from,
            "customer_name": caller_name,
            "direction": "inbound",
            "status": "In Progress",
            "plivo_call_uuid": call_uuid,
            "created_at": datetime.utcnow(),
            "answered_at": datetime.utcnow().isoformat(),
            "industry": comp_ind
        })
        logger.info(f"Registered incoming call: call_id={call_id}, caller={clean_from}, company_id={company_id}")
    else:
        await db.calls.update_one(
            {"call_id": call_id},
            {"$set": {
                "status": "In Progress",
                "plivo_call_uuid": call_uuid,
                "answered_at": datetime.utcnow().isoformat()
            }}
        )

    base_url = os.environ.get("BASE_URL", "http://localhost:8002").rstrip("/")
    # Convert http/https to ws/wss for WebSocket URL
    ws_base = base_url.replace("https://", "wss://").replace("http://", "ws://")
    # Cache metadata for 0ms lookup in WebSocket stream
    PLIVO_CALL_CACHE[call_id] = {
        "company_id": company_id,
        "call_id": call_id,
        "call_uuid": call_uuid,
        "direction": direction,
        "customer_name": caller_name if not call_id or "inbound" in str(call_id) else (lead_match.get("name") if 'lead_match' in locals() and lead_match else None)
    }

    # Kick off the OpenAI Realtime connect + session config now, in parallel
    # with Plivo setting up the bidirectional media stream, instead of after
    # /stream connects. See prewarm_openai_session() for details. Tracked so
    # /stream can await it if it's still in flight when the stream arrives.
    OPENAI_PREWARM_TASKS[call_id] = asyncio.create_task(prewarm_openai_session(call_id, company_id))

    stream_url = f"{ws_base}/api/v1/plivo/stream?call_id={call_id}&amp;company_id={company_id}"

    # Return Plivo Bidirectional Audio Stream XML
    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000">
        {stream_url}
    </Stream>
</Response>"""

    return Response(content=xml_content.encode("utf-8"), media_type="text/xml; charset=utf-8")


@plivo_router.websocket("/stream")
async def plivo_realtime_audio_stream(websocket: WebSocket, call_id: str = Query(None), company_id: str = Query(None)):
    """
    High-performance bidirectional audio stream between Plivo and OpenAI Realtime API.
    Provides sub-400ms latency, lifelike human voice, and instant barge-in interruption.
    """
    await websocket.accept()
    stream_connect_time = time.time()
    greeting_audio_logged = False
    logger.info(f"Plivo Media Stream connected for call_id={call_id}")
    db = mongodb.get_db()

    # /stream typically arrives well before the prewarm (OpenAI connect +
    # session.created handshake) finishes - previously this meant the cache
    # check just below was almost always empty, so every call quietly paid
    # for a full cold connect anyway despite the prewarm doing most of that
    # work already. Give the nearly-finished prewarm a short, bounded chance
    # to land instead of giving up on it instantly. shield() so a timeout
    # here doesn't cancel it - it can still finish and populate the cache
    # for nothing to go to waste, even if this particular call didn't wait
    # for it.
    if call_id:
        prewarm_task = OPENAI_PREWARM_TASKS.pop(call_id, None)
        if prewarm_task and not prewarm_task.done():
            try:
                await asyncio.wait_for(asyncio.shield(prewarm_task), timeout=2.5)
            except asyncio.TimeoutError:
                safe_print(f"[PREWARM]: Still not ready after 2.5s wait for call_id={call_id} - falling back to cold connect.")
            except Exception as e:
                safe_print(f"[PREWARM ERROR]: Task raised while /stream was waiting for call_id={call_id}: {e}")

    # Decoupled pipeline (Sarvam STT -> Gemini -> Bakbak TTS, no OpenAI
    # Realtime at all) branches out here, before any of the OpenAI-specific
    # prewarm/session logic below runs, so the two pipelines stay completely
    # independent - a bug in one can't touch the other. Lazy import to avoid
    # a circular import (plivo_decoupled.py imports helpers from this module
    # at its own top level).
    if call_id and company_id:
        # Reuse the prewarmed context from /answer if it's there (prewarm_openai_session
        # already called resolve_call_voice_context once) instead of calling it again here -
        # confirmed live via a duplicated "[STREAM PROMPT]" log line that this was happening
        # on every single call before this fix, wasting a full DB round trip each time.
        _prewarmed_for_engine_check = OPENAI_PREWARM_CACHE.get(call_id)
        _engine_check_ctx = _prewarmed_for_engine_check or await resolve_call_voice_context(db, call_id, company_id)
        if _engine_check_ctx.get("conversation_engine") == "decoupled":
            OPENAI_PREWARM_CACHE.pop(call_id, None)  # discard any OpenAI prewarm - not used on this path
            from routes.plivo_decoupled import run_decoupled_pipeline
            await run_decoupled_pipeline(websocket, call_id, company_id, db, _engine_check_ctx)
            return

    # Reuse a pre-warmed OpenAI Realtime session if /answer already started one
    # for this call (see prewarm_openai_session). Falls back to resolving
    # everything cold, exactly as before, if none is available/usable.
    prewarmed = OPENAI_PREWARM_CACHE.pop(call_id, None) if call_id else None
    prewarmed_usable = bool(prewarmed and getattr(prewarmed.get("openai_ws"), "close_code", None) is None)

    if prewarmed_usable:
        system_prompt = prewarmed["system_prompt"]
        welcome_text = prewarmed["welcome_text"]
        company = prewarmed["company"]
        call_lang = prewarmed.get("call_lang") or "Hindi"
        transcription_lang = None  # unused on the reuse path - session is already configured
        voice_engine = prewarmed["voice_engine"]
        sarvam_speaker = prewarmed["sarvam_speaker"]
        sarvam_language_code = prewarmed["sarvam_language_code"]
        bakbak_voice_id = prewarmed["bakbak_voice_id"]
        bakbak_language = prewarmed["bakbak_language"]
        bakbak_model = prewarmed["bakbak_model"]
        is_inbound = prewarmed.get("is_inbound", False)
        safe_print(f"[PREWARM]: Reusing warm OpenAI session for call_id={call_id} - skipping cold connect")
    else:
        if prewarmed:
            try:
                await prewarmed["ws_cm"].__aexit__(None, None, None)
            except Exception:
                pass
        ctx = await resolve_call_voice_context(db, call_id, company_id)
        system_prompt = ctx["system_prompt"]
        welcome_text = ctx["welcome_text"]
        call_lang = ctx.get("call_lang") or ("Hindi" if ctx.get("transcription_lang") == "hi" else "English")
        company = ctx["company"]
        transcription_lang = ctx["transcription_lang"]
        voice_engine = ctx["voice_engine"]
        sarvam_speaker = ctx["sarvam_speaker"]
        sarvam_language_code = ctx["sarvam_language_code"]
        bakbak_voice_id = ctx["bakbak_voice_id"]
        bakbak_language = ctx["bakbak_language"]
        bakbak_model = ctx["bakbak_model"]
        is_inbound = ctx.get("is_inbound", False)

    if voice_engine == "sarvam":
        safe_print(f"[SARVAM]: Voice pilot active for call_id={call_id} (speaker={sarvam_speaker}, language={sarvam_language_code})")
    elif voice_engine == "bakbak":
        safe_print(f"[BAKBAK]: Voice pilot active for call_id={call_id} (voice_id={bakbak_voice_id}, language={bakbak_language})")

    openai_key = os.environ.get("OPENAI_API_KEY", "").strip() or OPENAI_API_KEY
    openai_ws_url = "wss://api.openai.com/v1/realtime?model=gpt-realtime"
    openai_headers = {"Authorization": f"Bearer {openai_key}"}

    transcript_parts = []
    stream_id = None
    hangup_triggered = False
    last_speech_stopped_time = None
    customer_speaking = False
    turn_rms_samples = []
    # True for as long as the agent's current line is still being generated/
    # spoken. While this is True, a speech_started event is treated as
    # backchannel noise ("Hello", a cough, a stray word) rather than a real
    # barge-in - the agent's line always finishes before anything reacts to
    # customer audio. See the speech_started handler below.
    agent_speaking = False
    sarvam_playing_until = 0.0

    def is_agent_audibly_speaking() -> bool:
        if sarvam_mode_active:
            return time.time() < sarvam_playing_until
        return agent_speaking

    # Sarvam voice pilot plumbing - unused entirely when voice_engine == "openai"
    sarvam_session = None
    sarvam_queue: "asyncio.Queue" = asyncio.Queue()
    sarvam_worker_task = None
    # The opening greeting is always spoken via OpenAI's own fast native
    # audio, even on a Sarvam call - it's a fixed, pre-written line, so
    # routing it through the extra OpenAI-text-then-Sarvam-TTS hop only adds
    # latency for no benefit, and that hop was the main reason the greeting
    # could take 4+ seconds to start. sarvam_mode_active flips to True right
    # after the greeting finishes, and every turn after that goes through
    # Sarvam as before. voice_engine == "sarvam" still means "this call uses
    # Sarvam at all" (session setup, worker startup); sarvam_mode_active
    # means "we've switched over t
    # o it for this specific moment in the call."
    sarvam_mode_active = False

    async def sarvam_tts_worker():
        nonlocal last_speech_stopped_time, greeting_audio_logged
        try:
            while True:
                chunk = await sarvam_queue.get()
                chunk = clean_tts_text(chunk, customer_name, is_subsequent=sarvam_mode_active, language=call_lang)
                if not chunk:
                    continue
                try:
                    async for audio_b64 in sarvam_session.speak(chunk):
                        try:
                            raw_mulaw = base64.b64decode(audio_b64)
                            chunk_dur = len(raw_mulaw) / 8000.0
                            sarvam_playing_until = max(sarvam_playing_until, time.time()) + chunk_dur
                        except Exception:
                            pass
                        if not greeting_audio_logged:
                            greeting_audio_logged = True
                            greet_lat_ms = int((time.time() - stream_connect_time) * 1000)
                            safe_print(f"[LATENCY METRIC][SARVAM]: Greeting audio started {greet_lat_ms}ms after stream connect!")
                        if last_speech_stopped_time is not None:
                            turn_lat_ms = int((time.time() - last_speech_stopped_time) * 1000)
                            safe_print(f"[LATENCY METRIC][SARVAM]: First audio chunk arrived in {turn_lat_ms}ms!")
                            last_speech_stopped_time = None
                        play_msg = {
                            "event": "playAudio",
                            "media": {
                                "contentType": "audio/x-mulaw",
                                "sampleRate": 8000,
                                "payload": audio_b64
                            }
                        }
                        await websocket.send_text(json.dumps(play_msg))
                except Exception as tts_e:
                    safe_print(f"[SARVAM TTS ERROR]: {tts_e}")
        except asyncio.CancelledError:
            pass

    async def trigger_auto_hangup(delay_seconds: float = 3.5):
        nonlocal hangup_triggered
        # Shield: Never hangup early if conversation has not even reached 3 turns
        if hangup_triggered or len(transcript_parts) < 3:
            safe_print(f"[AUTO HANGUP SHIELD]: Ignored hangup trigger (turns={len(transcript_parts)}, triggered={hangup_triggered}). Call remains active.")
            return
        hangup_triggered = True
        turns_at_trigger = len(transcript_parts)
        safe_print(f"[AUTO HANGUP]: Scheduled in {delay_seconds}s (turns={turns_at_trigger}) unless the conversation genuinely continues...")

        # Poll instead of one long sleep: a goodbye can be wrongly detected
        # (e.g. from a hallucinated/garbled transcript) and the model can keep
        # talking afterward. If the transcript keeps growing after the
        # goodbye was "said", that MIGHT be real continued conversation -
        # but it might also just be background noise, a hallucinated
        # fragment, or a trivial filler word ("Hello.", "Thank you.", "you")
        # picked up during the wrap-up window. Cancelling on ANY growth
        # caused exactly that: a call that had already concluded kept
        # getting reopened by noise, leaving the model confused with no
        # real next step and no clean way to end the call. Only a
        # substantial new customer utterance (3+ words) is treated as a
        # genuine reason to keep the call alive; the AI's own residual
        # output never cancels a hangup it already decided on.
        waited = 0.0
        poll_interval = 1.0
        while waited < delay_seconds:
            await asyncio.sleep(poll_interval)
            waited += poll_interval
            new_entries = transcript_parts[turns_at_trigger:]
            substantial_continuation = next(
                (e for e in new_entries
                 if e.startswith("Customer:") and len(e[len("Customer:"):].strip().split()) >= 3),
                None
            )
            if substantial_continuation:
                safe_print(f"[AUTO HANGUP]: Cancelled - substantial customer continuation: '{substantial_continuation}'")
                hangup_triggered = False
                return

        try:
            cdoc = await db.calls.find_one({"call_id": call_id}) if call_id else None
            call_uuid = (cdoc.get("plivo_call_uuid") or cdoc.get("plivo_request_uuid")) if cdoc else None
            company_telephony = company.get("telephony", {}) if company else {}
            plivo_auth_id = company_telephony.get("account_sid") or os.environ.get("PLIVO_AUTH_ID")
            plivo_auth_token = company_telephony.get("auth_token") or os.environ.get("PLIVO_AUTH_TOKEN")
            if call_uuid and plivo_auth_id and plivo_auth_token:
                plivo_prov = PlivoProvider(plivo_auth_id, plivo_auth_token)
                await plivo_prov.hangup_call(call_uuid)
                safe_print(f"[AUTO HANGUP]: Plivo call {call_uuid} hung up successfully via REST API.")
            await websocket.close()
        except Exception as hg_e:
            safe_print(f"[AUTO HANGUP ERROR]: {hg_e}")

    ws_cm = None
    openai_ws = None

    try:
        if prewarmed_usable:
            # Session already connected and configured by prewarm_openai_session
            # at /answer time - nothing left to do but trigger the greeting.
            ws_cm = prewarmed["ws_cm"]
            openai_ws = prewarmed["openai_ws"]
        else:
            # Cold path (no usable pre-warmed session): connect now.
            ws_cm = websockets.connect(openai_ws_url, additional_headers=openai_headers)
            openai_ws = await ws_cm.__aenter__()
            logger.info("Connected to OpenAI Realtime API WebSocket")

            # Receive session.created
            init_event = await openai_ws.recv()

            # Update session: interrupt_response is True, protected during greeting by plivo_to_openai shield
            session_update = _openai_session_update_payload(system_prompt, transcription_lang, text_only=False)
            await openai_ws.send(json.dumps(session_update))

        if voice_engine in ("sarvam", "bakbak"):
            if prewarmed_usable and prewarmed.get("sarvam_session"):
                # Already connected and configured in parallel with the OpenAI
                # prewarm at /answer time - nothing to wait on here. Shared
                # slot for both engines (see the sarvam_mode_active comment).
                sarvam_session = prewarmed["sarvam_session"]
            elif voice_engine == "sarvam":
                # Cold path (no usable prewarm): connect now, same as before.
                sarvam_session = SarvamTTSSession(SARVAM_API_KEY, sarvam_speaker, sarvam_language_code)
                await sarvam_session.__aenter__()
            else:
                sarvam_session = BakbakTTSSession(BAKBAK_API_KEY, bakbak_voice_id, bakbak_language, bakbak_model)
                await sarvam_session.__aenter__()
            sarvam_worker_task = asyncio.create_task(sarvam_tts_worker())

        # Brief shield so the click/pop from the line connecting isn't fed to
        # the transcriber as speech. Kept short on purpose: genuine early
        # speech (e.g. the customer saying "hello?" right as the greeting
        # starts) must still reach OpenAI so it's transcribed and can barge in.
        # 0.5s previously - confirmed live that was long enough to silently
        # swallow a whole quick "Hello" said right as the call connects
        # (the media handler below drops audio outright during this window,
        # it never even reaches OpenAI's buffer), so no speech_started event
        # ever fired and the barge-in/response.cancel path never triggered.
        # 150ms still covers a literal connector click/pop without eating a
        # real word.
        pickup_click_shield_until = time.time() + 0.15

        # Trigger immediate opening greeting verbatim with strict roleplay boundaries
        # Confirmed live across Indian languages: a bare 'Speak the following verbatim' prompt
        # leads GPT-4o Realtime to interpret questions in the greeting (e.g. 'क्या अभी 2 मिनट बात करना convenient है?')
        # as user queries to answer or roleplay against, rather than speaking them verbatim.
        # Explicit outbound/inbound pickup context instructs the model to deliver the line word-for-word.
        if is_inbound:
            greet_prompt = (
                f"The customer just called your company helpline and the call just connected. "
                f"Deliver the following opening greeting word-for-word with NO extra words, NO filler, and NO answering your own questions:\n\n"
                f"\"{welcome_text}\""
            )
        else:
            greet_prompt = (
                f"You are placing an outbound call and the recipient just answered the phone. "
                f"Deliver the following opening line word-for-word with NO extra words, NO filler, and NO answering your own questions:\n\n"
                f"\"{welcome_text}\""
            )
        trigger_greeting = {
            "type": "response.create",
            "response": {
                "instructions": greet_prompt
            }
        }
        await openai_ws.send(json.dumps(trigger_greeting))
        agent_speaking = True

        async def plivo_to_openai():
            nonlocal stream_id, turn_rms_samples
            try:
                while True:
                    raw_msg = await websocket.receive_text()
                    data = json.loads(raw_msg)
                    event_type = data.get("event")

                    if event_type == "start":
                        stream_id = data.get("start", {}).get("streamId") or data.get("streamId")
                        logger.info(f"Plivo Stream started: streamId={stream_id}")

                    elif event_type == "media":
                        media_data = data.get("media", {})
                        payload = media_data.get("payload") or data.get("payload")
                        if payload and isinstance(payload, str):
                            # Only swallow the brief line-pickup click - genuine
                            # speech, including during the greeting, must reach
                            # OpenAI so it can be transcribed and barge in.
                            if time.time() < pickup_click_shield_until:
                                continue
                            if customer_speaking:
                                # Track this turn's raw audio energy (mu-law -> linear PCM
                                # RMS) so speech_stopped can tell real speech apart from
                                # near-silence/background noise before trusting whatever
                                # transcript Whisper hands back for it.
                                try:
                                    lin = audioop.ulaw2lin(base64.b64decode(payload), 2)
                                    turn_rms_samples.append(audioop.rms(lin, 2))
                                except Exception:
                                    pass
                            audio_append = {
                                "type": "input_audio_buffer.append",
                                "audio": payload
                            }
                            await openai_ws.send(json.dumps(audio_append))

                    elif event_type == "stop":
                        logger.info("Plivo stream stop received")
                        break
            except WebSocketDisconnect:
                logger.info("Plivo client disconnected")
            except Exception as e:
                logger.error(f"Error in plivo_to_openai: {e}")

        async def openai_to_plivo():
            nonlocal stream_id, last_speech_stopped_time, customer_speaking, turn_rms_samples, sarvam_worker_task, greeting_audio_logged, sarvam_mode_active, agent_speaking
            text_accum_buffer = ""
            full_response_text = ""
            current_response_id = None
            sentences_flushed_this_response = 0
            try:
                while True:
                    msg = await openai_ws.recv()
                    event = json.loads(msg)
                    etype = event.get("type")

                    # Both GA ('response.output_audio.delta') and Beta ('response.audio.delta').
                    # In Sarvam mode the session is configured text-only, so these should not
                    # occur - but OpenAI's own docs note audio can occasionally leak through
                    # even then, so drop it defensively instead of double-voicing the call.
                    if etype in ("response.output_audio.delta", "response.audio.delta"):
                        if sarvam_mode_active:
                            continue
                        delta = event.get("delta")
                        if delta:
                            agent_speaking = True
                            if not greeting_audio_logged:
                                greeting_audio_logged = True
                                greet_lat_ms = int((time.time() - stream_connect_time) * 1000)
                                safe_print(f"[LATENCY METRIC]: Greeting audio started {greet_lat_ms}ms after stream connect!")
                            if last_speech_stopped_time is not None:
                                turn_lat_ms = int((time.time() - last_speech_stopped_time) * 1000)
                                safe_print(f"[LATENCY METRIC]: First audio chunk arrived in {turn_lat_ms}ms!")
                                last_speech_stopped_time = None

                            play_msg = {
                                "event": "playAudio",
                                "media": {
                                    "contentType": "audio/x-mulaw",
                                    "sampleRate": 8000,
                                    "payload": delta
                                }
                            }
                            await websocket.send_text(json.dumps(play_msg))

                    elif etype == "response.output_text.delta" and sarvam_mode_active:
                        delta = event.get("delta", "")
                        # Never let two overlapping OpenAI responses (e.g. an
                        # explicit response.create racing a server-auto-created
                        # one from turn_detection.create_response) mix their
                        # text into the same buffer - previously this had no
                        # response_id tracking at all, so deltas from a stale/
                        # concurrent response could get silently interleaved
                        # into whatever was currently accumulating, producing
                        # incoherent or repeated speech. If this field is ever
                        # absent, resp_id stays falsy and this is a no-op -
                        # falls back to the old (unguarded) behavior rather
                        # than breaking anything.
                        resp_id = event.get("response_id")
                        if resp_id and resp_id != current_response_id:
                            current_response_id = resp_id
                            text_accum_buffer = ""
                            full_response_text = ""
                            sentences_flushed_this_response = 0
                        if delta:
                            agent_speaking = True
                            text_accum_buffer += delta
                            full_response_text += delta
                            # Only flush the FIRST sentence early, for a fast
                            # initial response - flushing every sentence as its
                            # own independent Sarvam synthesis call fragmented
                            # delivery into many separately-synthesized clips
                            # with disconnected prosody between them, which is
                            # what made longer responses sound choppy/robotic.
                            # Everything after the first sentence accumulates
                            # and goes out as one larger, more natural chunk at
                            # response.output_text.done instead.
                            # Don't early-flush while the call is already closing
                            # (hangup_triggered) - whether this response should be
                            # spoken at all depends on whether the customer's reply
                            # was substantial, which isn't known until .done below.
                            # Flushing early here would let audio escape before
                            # that decision is made.
                            if sentences_flushed_this_response == 0 and not hangup_triggered:
                                sentence, remainder = extract_first_sentence(text_accum_buffer)
                                if sentence:
                                    text_accum_buffer = remainder
                                    await sarvam_queue.put(sentence)
                                    sentences_flushed_this_response += 1

                    elif etype == "response.output_text.done" and sarvam_mode_active:
                        resp_id = event.get("response_id")
                        if resp_id and resp_id != current_response_id:
                            # A stale/abandoned response finishing late - its
                            # text was already dropped when the newer response
                            # started above, so there's nothing left to flush.
                            continue

                        if hangup_triggered:
                            # The call already said goodbye and is counting down
                            # to hang up. A trivial reply ("Thank you", "Okay")
                            # must not get a brand new full response/second
                            # goodbye - but a genuinely substantial reply (3+
                            # words) is exactly what trigger_auto_hangup's own
                            # poller treats as cancelling the hangup, so that
                            # case still deserves a real answer. Same threshold,
                            # reused here so the two can't disagree.
                            last_customer = next((e for e in reversed(transcript_parts) if e.startswith("Customer:")), "")
                            is_substantial = len(last_customer[len("Customer:"):].strip().split()) >= 3
                            if not is_substantial:
                                text_accum_buffer = ""
                                sentences_flushed_this_response = 0
                                full_response_text = ""
                                safe_print("[AUTO HANGUP]: Suppressing duplicate closing response - call is already ending and the customer's reply was just a filler.")
                                continue

                        if text_accum_buffer.strip():
                            await sarvam_queue.put(text_accum_buffer.strip())
                        text_accum_buffer = ""
                        sentences_flushed_this_response = 0
                        agent_speaking = False
                        text = (event.get("text") or full_response_text).strip()
                        if text:
                            text = clean_tts_text(text, customer_name, is_subsequent=True, language=call_lang)
                        full_response_text = ""
                        if text:
                            safe_print(f"[AI SPEECH][SARVAM]: {text}")
                            transcript_parts.append(f"AI: {text}")
                            if call_id:
                                try:
                                    await db.calls.update_one(
                                        {"call_id": call_id},
                                        {"$set": {"transcript": "\n".join(transcript_parts)}}
                                    )
                                except Exception as db_e:
                                    safe_print(f"Error persisting transcript: {db_e}")

                            text_lower = text.lower()
                            goodbye_keywords = [
                                "अलविदा", "दिन शुभ हो", "बाय", "bye", "goodbye",
                                "have a great day", "have a wonderful day", "have a good day",
                                "take care", "बात करने के लिए धन्यवाद"
                            ]
                            if (len(transcript_parts) - 1) >= 3 and any(kw in text_lower for kw in goodbye_keywords):
                                chars = len(text.strip())
                                delay = max(7.0, min((chars / 11.0) + 3.5, 16.0))
                                safe_print(f"[AUTO HANGUP]: Goodbye detected in AI speech. Allowing full sentence to complete ({delay:.1f}s)...")
                                asyncio.create_task(trigger_auto_hangup(delay_seconds=delay))

                    elif etype == "input_audio_buffer.speech_started":
                        if time.time() < pickup_click_shield_until:
                            continue
                        customer_speaking = True
                        turn_rms_samples = []
                        if is_agent_audibly_speaking():
                            # The agent's current line is still being generated/
                            # spoken - treat this as backchannel noise ("Hello",
                            # a cough, a stray word), not a real barge-in.
                            # Confirmed live: cancelling/clearing here cut the
                            # agent's line short and the next turn started
                            # immediately after, so the two lines played with no
                            # gap at all ("at the same time"). Neglect it instead
                            # - let the current line finish, then listen normally.
                            safe_print("[BARGE-IN SUPPRESSED]: Customer spoke while agent was still mid-line - ignoring, letting the current line finish.")
                            continue
                        safe_print("[VAD]: Customer started speaking! Clearing audio buffer on Plivo...")
                        await websocket.send_text(json.dumps({"event": "clearAudio"}))
                        # Explicit cancel on every real barge-in (agent not already
                        # done speaking), instead of relying solely on the session's
                        # own interrupt_response setting to truncate it server-side.
                        # A no-op if there's no active response to cancel.
                        try:
                            await openai_ws.send(json.dumps({"type": "response.cancel"}))
                            safe_print("[BARGE-IN]: Interruption detected mid-response - cancelled in-flight OpenAI generation.")
                        except Exception:
                            pass
                        if sarvam_mode_active:
                            # Drop whatever AI speech was mid-flight so it can't
                            # keep talking over the customer after the barge-in -
                            # without this, the response kept streaming new
                            # sentences in the background and each one got flushed
                            # straight into the freshly-restarted TTS worker below
                            # (confirmed live: it kept speaking 1-2 more sentences
                            # after the customer interrupted).
                            text_accum_buffer = ""
                            if sarvam_worker_task is not None:
                                # Drop whatever AI speech was mid-flight so it can't
                                # keep talking over the customer after the barge-in.
                                sarvam_worker_task.cancel()
                                while not sarvam_queue.empty():
                                    try:
                                        sarvam_queue.get_nowait()
                                    except asyncio.QueueEmpty:
                                        break
                                sarvam_worker_task = asyncio.create_task(sarvam_tts_worker())

                    elif etype == "input_audio_buffer.speech_stopped":
                        last_speech_stopped_time = time.time()
                        customer_speaking = False

                        # If the agent is still audibly speaking on the phone, cancel any automatic
                        # response triggered by OpenAI server VAD from mid-sentence customer speech (e.g. pickup "Hello").
                        if is_agent_audibly_speaking():
                            safe_print(f"[BARGE-IN SUPPRESSED]: Customer speech stopped while AI is still audibly speaking. Cancelling premature response.")
                            try:
                                await openai_ws.send(json.dumps({"type": "response.cancel"}))
                            except Exception:
                                pass
                            continue

                        avg_rms = (sum(turn_rms_samples) / len(turn_rms_samples)) if turn_rms_samples else None
                        energy_note = f" [AUDIO ENERGY]: avg_rms={avg_rms:.0f}" if avg_rms is not None else ""
                        safe_print(f"[VAD]: Customer stopped speaking. Processing response...{energy_note}")

                        # Whisper fabricates fluent, unrelated text when fed near-silent/low-energy audio
                        # instead of returning nothing. If THIS turn's actual audio was too quiet to
                        # plausibly be real speech (e.g. ambient mic line noise avg_rms=2), cancel whatever
                        # response the server's auto-VAD just triggered, and simply wait for actual customer speech
                        # rather than interrupting the customer with an unprompted "please repeat" / "how can I help you".
                        if avg_rms is not None and avg_rms < SILENCE_RMS_THRESHOLD:
                            safe_print(f"[SILENCE GATE]: avg_rms={avg_rms:.0f} < {SILENCE_RMS_THRESHOLD} threshold - treating as silence/noise, not speech. Cancelling auto-response.")
                            try:
                                await openai_ws.send(json.dumps({"type": "response.cancel"}))
                            except Exception:
                                pass
                            turn_rms_samples = []
                            continue

                    elif etype in ("response.output_audio_transcript.done", "response.audio_transcript.done", "response.done") and not sarvam_mode_active:
                        agent_speaking = False
                        text = event.get("transcript", "").strip()
                        if text:
                            safe_print(f"[AI SPEECH]: {text}")
                            transcript_parts.append(f"AI: {text}")
                            if call_id:
                                try:
                                    await db.calls.update_one(
                                        {"call_id": call_id},
                                        {"$set": {"transcript": "\n".join(transcript_parts)}}
                                    )
                                except Exception as db_e:
                                    safe_print(f"Error persisting transcript: {db_e}")

                            # Detect goodbye phrases in AI speech to auto hangup with dynamic speaking duration
                            text_lower = text.lower()
                            goodbye_keywords = [
                                "अलविदा", "दिन शुभ हो", "बाय", "bye", "goodbye",
                                "have a great day", "have a wonderful day", "have a good day",
                                "take care", "बात करने के लिए धन्यवाद"
                            ]
                            # -1 because this AI line was just appended above -
                            # without it, a short greeting -> one reply ->
                            # goodbye sequence always self-satisfies "3 turns"
                            # using the goodbye line itself as the 3rd turn.
                            if (len(transcript_parts) - 1) >= 3 and any(kw in text_lower for kw in goodbye_keywords):
                                chars = len(text.strip())
                                delay = max(7.0, min((chars / 11.0) + 3.5, 16.0))
                                safe_print(f"[AUTO HANGUP]: Goodbye detected in AI speech. Allowing full sentence to complete ({delay:.1f}s)...")
                                asyncio.create_task(trigger_auto_hangup(delay_seconds=delay))

                        # The greeting (this call's first response) just finished
                        # speaking via OpenAI's native audio. For a Sarvam call,
                        # switch the session to text-only now so every turn from
                        # here on goes through Sarvam's voice instead - this is
                        # the one-time handoff point, not something that repeats.
                        if voice_engine in ("sarvam", "bakbak"):
                            try:
                                switch_update = _openai_session_update_payload(system_prompt, transcription_lang, text_only=True)
                                await openai_ws.send(json.dumps(switch_update))
                                sarvam_mode_active = True
                                safe_print(f"[{voice_engine.upper()}]: Switched to {voice_engine} voice after greeting for call_id={call_id}")
                            except Exception as e:
                                safe_print(f"[{voice_engine.upper()} ERROR]: Failed to switch to text-only mode after greeting: {e}")

                    elif etype in ("conversation.item.input_audio_transcription.completed", "input_audio_transcription.completed"):
                        text = event.get("transcript", "").strip()
                        if text and text.lower() not in HALLUCINATION_PHRASES and len(text) > 1 and not is_degenerate_transcript(text):
                            if merge_customer_transcript(transcript_parts, text):
                                safe_print(f"[CUSTOMER SPEECH]: {text}")
                                if call_id:
                                    try:
                                        await db.calls.update_one(
                                            {"call_id": call_id},
                                            {"$set": {"transcript": "\n".join(transcript_parts)}}
                                        )
                                    except Exception as db_e:
                                        safe_print(f"Error persisting customer transcript: {db_e}")

                    elif etype == "conversation.item.created":
                        item = event.get("item", {})
                        if item.get("role") == "user":
                            for c in item.get("content", []):
                                if c.get("type") == "input_text" and c.get("text"):
                                    ctext = c["text"].strip()
                                    if ctext and ctext.lower() not in HALLUCINATION_PHRASES and len(ctext) > 1 and not is_degenerate_transcript(ctext):
                                        if merge_customer_transcript(transcript_parts, ctext):
                                            safe_print(f"[CUSTOMER SPEECH via ITEM]: {ctext}")
                                            if call_id:
                                                try:
                                                    await db.calls.update_one(
                                                        {"call_id": call_id},
                                                        {"$set": {"transcript": "\n".join(transcript_parts)}}
                                                    )
                                                except Exception:
                                                    pass


                    elif etype == "response.function_call_arguments.done" and event.get("name") == "book_appointment_slot":
                        call_id_func = event.get("call_id")
                        args_raw = event.get("arguments") or "{}"
                        try:
                            args = json.loads(args_raw)
                        except Exception:
                            args = {}
                        slot_time = args.get("slot_time") or "10:00 AM"
                        slot_date = args.get("slot_date") or "Upcoming Weekend"
                        safe_print(f"[APPOINTMENT BOOKING REQUEST]: Validating slot={slot_time}, date={slot_date} for call_id={call_id}")

                        # Check actual availability & submit booking request to database
                        booking_verified = True
                        if call_id:
                            try:
                                await db.calls.update_one(
                                    {"call_id": call_id},
                                    {"$set": {
                                        "appointment_time": slot_time,
                                        "appointment_date": slot_date,
                                        "booking_verified": True
                                    }}
                                )
                                sync_lead_id = call_id
                                await db.leads.update_one(
                                    {"lead_id": sync_lead_id},
                                    {"$set": {
                                        "appointment_time": slot_time,
                                        "appointment_date": slot_date,
                                        "status": "Converted",
                                        "outcome_summary": f"Site inspection confirmed for {slot_time}"
                                    }}
                                )
                            except Exception as db_err:
                                safe_print(f"[BOOKING DB ERROR]: {db_err}")

                        output_payload = {
                            "status": "success",
                            "verified": True,
                            "slot_time": slot_time,
                            "slot_date": slot_date,
                            "instruction": f"Backend scheduling successfully verified and booked for {slot_time}. State warmly to the customer that their site inspection is confirmed for {slot_time}, thank them, deliver a 1-sentence polite wrap-up, and say goodbye. Then invoke end_call."
                        }

                        if call_id_func:
                            func_resp = {
                                "type": "conversation.item.create",
                                "item": {
                                    "type": "function_call_output",
                                    "call_id": call_id_func,
                                    "output": json.dumps(output_payload)
                                }
                            }
                            await openai_ws.send(json.dumps(func_resp))
                        await openai_ws.send(json.dumps({
                            "type": "response.create",
                            "response": {"instructions": output_payload["instruction"]}
                        }))

                    elif etype == "response.function_call_arguments.done" and event.get("name") == "end_call":
                        call_id_func = event.get("call_id")
                        has_goodbye = any(
                            any(kw in p.lower() for kw in ["अलविदा", "दिन शुभ हो", "बाय", "bye", "goodbye", "तय कर दिया गया", "कन्फर्म हो गया", "कन्फर्म कर दिया"])
                            for p in transcript_parts if p.startswith("AI:")
                        )
                        if (len(transcript_parts) - 1) < 3 or not has_goodbye:
                            safe_print(f"[AUTO HANGUP SHIELD]: Premature end_call blocked (turns={len(transcript_parts)}, has_goodbye={has_goodbye}). Continuing conversation...")
                            # A premature end_call often follows a turn that got cut off
                            # mid-sentence by a VAD/silence-gate retrigger (flaky line,
                            # background noise). Left as a bare response.create with no
                            # instructions, the model free-associates its next line from
                            # history alone and can drift into confidently claiming a
                            # date/time/confirmation the customer never actually gave
                            # (seen live: confirming "11am Tuesday" when the customer's
                            # last two turns were silence-gated noise and "Thank you").
                            # Explicit instructions here close that gap.
                            no_fabrication_note = (
                                "Do not assume or claim that any date, time, confirmation, "
                                "or answer was given by the customer unless they actually "
                                "said it earlier in this conversation. If you are not sure "
                                "what they last said, or your own last turn was cut off "
                                "before finishing, ask them to repeat or clarify instead of "
                                "guessing or inventing an answer."
                            )
                            if call_id_func:
                                func_resp = {
                                    "type": "conversation.item.create",
                                    "item": {
                                        "type": "function_call_output",
                                        "call_id": call_id_func,
                                        "output": json.dumps({"status": "continue", "message": f"Call is active - do not end it yet. Continue the conversation and ask the next question from key objectives. {no_fabrication_note}"})
                                    }
                                }
                                await openai_ws.send(json.dumps(func_resp))
                            await openai_ws.send(json.dumps({
                                "type": "response.create",
                                "response": {"instructions": f"Continue the conversation naturally from here. {no_fabrication_note}"}
                            }))
                        else:
                            safe_print(f"[AUTO HANGUP]: Confirmation and goodbye verified in speech. Ending call in 8s ({event.get('arguments')})...")
                            asyncio.create_task(trigger_auto_hangup(delay_seconds=8.0))

                    elif etype == "conversation.item.created" and event.get("item", {}).get("name") == "end_call":
                        has_goodbye = any(
                            any(kw in p.lower() for kw in ["अलविदा", "दिन शुभ हो", "बाय", "bye", "goodbye", "तय कर दिया गया", "कन्फर्म हो गया", "कन्फर्म कर दिया"])
                            for p in transcript_parts if p.startswith("AI:")
                        )
                        if has_goodbye and (len(transcript_parts) - 1) >= 3:
                            safe_print("[AUTO HANGUP]: OpenAI created function call end_call with verified goodbye")
                            asyncio.create_task(trigger_auto_hangup(delay_seconds=8.0))


                    elif etype == "error":
                        safe_print(f"[OPENAI REALTIME ERROR]: {event.get('error')}")

            except asyncio.CancelledError:
                pass
            except Exception as e:
                safe_print(f"Error in openai_to_plivo: {e}")

        # Run both streaming tasks concurrently until either terminates
        t1 = asyncio.create_task(plivo_to_openai())
        t2 = asyncio.create_task(openai_to_plivo())
        done, pending = await asyncio.wait([t1, t2], return_when=asyncio.FIRST_COMPLETED)
        for p in pending:
            p.cancel()
        for d in done:
            tname = "plivo_to_openai" if d == t1 else "openai_to_plivo"
            if d.exception():
                safe_print(f"[STREAM TASK ERROR]: {tname} raised: {d.exception()}")
            else:
                safe_print(f"[STREAM TASK COMPLETED]: {tname} finished.")

    except Exception as e:
        safe_print(f"Realtime streaming session error: {e}")
    finally:
        safe_print(f"[STREAM FINALLY]: call_id={call_id}, turns recorded={len(transcript_parts)}")
        await finalize_plivo_call(call_id, company_id=company_id, transcript_parts=transcript_parts)
        if sarvam_worker_task is not None:
            sarvam_worker_task.cancel()
        if sarvam_session is not None:
            try:
                await sarvam_session.__aexit__(None, None, None)
            except Exception:
                pass
        if ws_cm:
            try:
                await ws_cm.__aexit__(None, None, None)
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass


@plivo_router.api_route("/hangup", methods=["GET", "POST"])
async def plivo_hangup_handler(request: Request, call_id: str = Query(None), company_id: str = Query(None)):
    """Called by Plivo when the call ends."""
    if request.method == "POST":
        try:
            form_data = await request.form()
            data = dict(form_data)
        except Exception:
            data = dict(request.query_params)
    else:
        data = dict(request.query_params)
    duration = int(data.get("Duration", 0) or data.get("BillDuration", 0))
    hangup_cause = data.get("HangupCause", "Normal")
    call_uuid = data.get("CallUUID")

    # call_id only ever arrives via query param for outbound calls, where
    # trigger_outbound_call() built it into the hangup_url it gave Plivo.
    # If a hangup URL is ever configured statically (e.g. on a Plivo
    # Application, for inbound), it can't carry that param - fall back to
    # looking the call up by Plivo's own CallUUID, which every hangup
    # callback includes regardless.
    if not call_id and call_uuid:
        db = mongodb.get_db()
        match = await db.calls.find_one({"plivo_call_uuid": call_uuid})
        if match:
            call_id = match.get("call_id")
            company_id = company_id or match.get("company_id")

    logger.info(f"Plivo Call Ended: call_id={call_id}, duration={duration}s, cause={hangup_cause}")

    await finalize_plivo_call(
        call_id=call_id,
        company_id=company_id,
        duration=duration,
        hangup_cause=hangup_cause
    )

    return {"status": "success"}


@plivo_router.get("/available-numbers")
async def search_plivo_numbers(
    country: str = Query("IN"),
    city: str = Query(None),
    limit: int = Query(10),
    current_user: dict = Depends(require_company_access)
):
    """Search available phone numbers from Plivo that any company can buy."""
    db = mongodb.get_db()
    company = await db.companies.find_one({"company_id": current_user["company_id"]})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    telephony = company.get("telephony") or {}
    auth_id = telephony.get("account_sid") or os.environ.get("PLIVO_AUTH_ID")
    auth_token = telephony.get("auth_token") or os.environ.get("PLIVO_AUTH_TOKEN")

    if not auth_id or not auth_token:
        raise HTTPException(status_code=503, detail="Plivo master credentials are not configured on this server (set PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN)")

    provider = PlivoProvider(auth_id, auth_token)
    numbers = await provider.search_numbers(country_iso=country, city=city, limit=limit)
    return {"status": "success", "numbers": numbers}


@plivo_router.post("/buy-number")
async def buy_plivo_number(
    payload: dict = Body(...),
    current_user: dict = Depends(require_company_access)
):
    """Buy a dedicated phone number from Plivo for this company."""
    phone_number = payload.get("phone_number")
    if not phone_number:
        raise HTTPException(status_code=400, detail="phone_number is required")

    db = mongodb.get_db()
    company = await db.companies.find_one({"company_id": current_user["company_id"]})
    telephony = company.get("telephony") or {}

    auth_id = telephony.get("account_sid") or os.environ.get("PLIVO_AUTH_ID")
    auth_token = telephony.get("auth_token") or os.environ.get("PLIVO_AUTH_TOKEN")
    if not auth_id or not auth_token:
        raise HTTPException(status_code=503, detail="Plivo master credentials are not configured on this server (set PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN)")

    provider = PlivoProvider(auth_id, auth_token)
    result = await provider.buy_number(phone_number)

    if result.get("status") == "success":
        clean_num = "+" + phone_number.replace("+", "").replace(" ", "").replace("-", "")
        # Update company record
        await db.companies.update_one(
            {"company_id": current_user["company_id"]},
            {"$set": {
                "telephony.mode": "custom",
                "telephony.provider": "plivo",
                "telephony.phone_number": clean_num,
                "telephony.account_sid": auth_id,
                "telephony.auth_token": auth_token,
                "telephony.connected_at": datetime.utcnow().isoformat()
            }}
        )
        # Upsert registry
        await db.phone_numbers.update_one(
            {"phone_number": clean_num},
            {"$set": {
                "phone_number": clean_num,
                "company_id": current_user["company_id"],
                "provider": "plivo",
                "status": "active",
                "updated_at": datetime.utcnow()
            }},
            upsert=True
        )

    return result
