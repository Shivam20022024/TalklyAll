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
        "status": "Completed",
        "last_updated": datetime.utcnow().isoformat()
    }
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

    # If no AI analysis (e.g. short call), ensure db.leads is updated from 'Calling' to 'Contacted' or 'No Answer'
    if not analysis_result and not already_analyzed:
        dur = duration if duration is not None else int(call_doc.get("duration", 0) or 0)
        lead_status = "Contacted" if dur > 0 else "No Answer"
        await db.leads.update_one(
            {"lead_id": call_id},
            {"$set": {
                "status": lead_status,
                "lastContact": datetime.utcnow().isoformat()
            }}
        )

    await db.calls.update_one({"call_id": call_id}, {"$set": update_data})
    logger.info(f"Plivo call {call_id} finalized successfully.")


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
        if cname.lower() not in ("valued customer", "unknown", "there", ""):
            customer_name = cname

    if not lead_doc and call_doc and call_doc.get("customer_id") and company_id:
        lead_doc = await db.leads.find_one({"phone": call_doc.get("customer_id"), "company_id": company_id})

    if not customer_name and lead_doc and lead_doc.get("name"):
        cname = str(lead_doc.get("name")).strip()
        if cname.lower() not in ("valued customer", "unknown", "there", ""):
            customer_name = cname

    call_industry = None
    if prompt_doc and prompt_doc.get("industry"):
        call_industry = prompt_doc.get("industry")
    elif company and company.get("industry"):
        call_industry = company.get("industry")
    elif call_doc and call_doc.get("industry") and call_doc.get("industry") != "general_sales":
        call_industry = call_doc.get("industry")
    elif lead_doc and lead_doc.get("industry") and lead_doc.get("industry") != "general_sales":
        call_industry = lead_doc.get("industry")
    elif call_doc and call_doc.get("industry"):
        call_industry = call_doc.get("industry")

    if not call_industry or call_industry not in INDUSTRY_TEMPLATES:
        call_industry = "general_sales"

    is_inbound = bool(call_doc and call_doc.get("direction") == "inbound")

    offering = ""
    if lead_doc:
        offering = str(lead_doc.get("offering") or lead_doc.get("property") or "").strip()
    if not offering:
        industry_fallbacks = {
            "real_estate": "luxury property",
            "healthcare": "doctor appointment consultation",
            "edtech": "online certification",
            "bfsi": "loan",
            "general_sales": "AI calling services",
            "collections": "loan EMI payment"
        }
        offering = industry_fallbacks.get(call_industry, "AI calling services")

    location = ""
    if lead_doc:
        location = str(lead_doc.get("location") or "").strip()
    if not location:
        location = "our office"

    template_def = INDUSTRY_TEMPLATES.get(call_industry, INDUSTRY_TEMPLATES["general_sales"])

    system_prompt = None
    welcome_text = None

    if prompt_doc:
        if is_inbound:
            cand_prompt = prompt_doc.get("published_inbound_prompt") or prompt_doc.get("inbound_prompt")
            cand_welcome = prompt_doc.get("published_inbound_welcome_message") or prompt_doc.get("inbound_welcome_message")
            is_stale_real_estate = False
        else:
            cand_prompt = prompt_doc.get("published_prompt") or prompt_doc.get("prompt")
            cand_welcome = prompt_doc.get("published_welcome_message") or prompt_doc.get("welcome_message")
            is_stale_real_estate = (
                call_industry != "real_estate" and cand_welcome and
                ("फ्लैट" in cand_welcome or "nov" in cand_welcome or "प्रोजेक्ट" in cand_welcome or "फ्लैट लेने का" in cand_welcome)
            )
        if cand_prompt and not is_stale_real_estate:
            system_prompt = cand_prompt
        if cand_welcome and not is_stale_real_estate:
            welcome_text = cand_welcome

    if not system_prompt:
        system_prompt = template_def["inbound_prompt"] if is_inbound else template_def["prompt"]
    if not welcome_text:
        welcome_text = template_def["inbound_welcome_message"] if is_inbound else template_def["welcome_message"]

    name_tags = ["{{customer_name}}", "{customer_name}", "{{lead_name}}", "{lead_name}", "{{name}}", "{name}", "{{lead}}", "{lead}"]
    if customer_name:
        for tag in name_tags:
            welcome_text = welcome_text.replace(tag, customer_name)
            system_prompt = system_prompt.replace(tag, customer_name)
    else:
        for tag in name_tags:
            welcome_text = welcome_text.replace(f"{tag},", "").replace(tag, "").replace("  ", " ").strip()
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

    # Generic per-lead CSV columns (e.g. {{amount_due}}, {{due_date}} for a
    # Collections upload) - mirrors the substitution server.py already does
    # for the separate Bolna dialing path (see its lead_dict.get("custom_fields")
    # loop), which this Plivo/Realtime path never had. Exact, case-sensitive
    # match against the uploaded column name, same as that reference loop.
    if lead_doc:
        for ck, cv in (lead_doc.get("custom_fields") or {}).items():
            if cv is not None:
                tag = f"{{{{{ck}}}}}"
                welcome_text = welcome_text.replace(tag, str(cv))
                system_prompt = system_prompt.replace(tag, str(cv))

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

    indian_accent_directive = (
        "CRITICAL VOICE & ACCENT DIRECTIVE:\n"
        "- IDENTITY: You are an Indian professional voice representative calling from an office in India.\n"
        "- ACCENT: Speak with an authentic, natural urban Indian English accent (Indian English cadence, syllable-timing, and clear intonation).\n"
        "- PHONETICS: Use distinct Indian English articulation (crisp dental 't' and 'd' stops, clear vowels, NO American rhotic 'r' drawl, NO American slang or valley-girl inflection).\n"
        "- PROHIBITED: NEVER speak in an American, British, or foreign Western accent. Avoid American filler sounds like 'gonna', 'wanna', 'kinda'.\n"
        "- LANGUAGE MIRRORING: Match the language the customer is actually using, turn by turn - do not stay locked to your opening greeting's language. If they reply with a substantive phrase or sentence in English, continue in English (with your Indian English accent). If they speak Hindi or code-mixed Hinglish, respond in natural Hindi/Hinglish. If they explicitly ask for Hindi ('हिंदी में बात करो') or ask for English, switch immediately. If the customer has replied in English for the last two turns, keep speaking English even if your earlier turns were in Hindi.\n"
        "- DO NOT SWITCH LANGUAGE ON A BARE FILLER WORD: A single short acknowledgment with no real content - 'Hello', 'Hi', 'Yes', 'Yeah', 'OK', 'Haan', 'Ji', 'Thanks' - is NOT a language switch signal on its own, even though the word itself is English. Keep speaking in whichever language you were already using until the customer actually says a substantive phrase or sentence in a different language.\n"
        "- LANGUAGE LIMIT: You are only able to speak English and Hindi/Hinglish well. If the customer speaks a different language (e.g. Tamil, Telugu, Bengali, Kannada, Malayalam, or any other), do NOT attempt to reply in that language - politely say, in English, that you can continue in English or Hindi, and ask which they'd prefer. Never guess at or attempt a language outside English and Hindi/Hinglish.\n\n"
    )

    natural_speech_directive = (
        "\n\nNATURAL HUMAN CONVERSATION STYLE:"
        "\n- Talk like a real person on a phone call, not someone reading a script. Short, warm, everyday phrasing beats long formal sentences."
        "\n- MATCH YOUR ACKNOWLEDGMENT TO WHAT THE CUSTOMER ACTUALLY SAID - classify it first, don't pick from one generic pool:"
        "\n   - A plain GREETING ('Hello', 'Hi', 'Hey', 'Haan ji' as a pickup) is not gratitude, agreement, or an answer to anything - there's nothing to thank them for yet, and nothing to greet back either (you already greeted them once in your opening line). Do NOT reply with a greeting word of your own at all - no 'Hi!', no 'नमस्ते!', no 'हाँ जी!', in any language. Go STRAIGHT into your next line with zero acknowledgment word first. Confirmed live: even a correctly-matched-language greeting-reply ('हाँ जी!' before a Hindi question) still read as two separate things being said back to back rather than one natural line - dropping the greeting-reply word entirely, not just fixing its language, is what actually fixes this. NEVER say 'Great, thanks!', 'Perfect!', 'Wonderful!', or 'That's great to hear!' in response to a bare greeting either - those only make sense as a reaction to something the customer actually gave you."
        "\n   - An AFFIRMATION that genuinely confirms something ('Yes', 'Sure', 'Okay', 'Haan' in answer to a real question) is where 'Great, thanks!', 'Perfect', 'Sure thing', 'Got it', 'Alright', 'Noted' fit."
        "\n   - GRATITUDE from the customer ('Thank you') gets a brief 'You're welcome' style reply, not a re-thanking."
        "\n   - An actual answer to your question gets a reaction to its CONTENT ('Oh nice', 'I see', 'Makes sense') plus your next step, not a generic filler."
        "\n   - Within whichever category applies, rotate through different phrasing - NEVER use the exact same acknowledgment word/phrase twice in the same call."
        "\n- Ask ONE short, plain question at a time. Prefer 'What exactly are you looking for?' over a long compound sentence like 'Could you tell me a bit more about what you're looking for in the program, or any specific questions you have? That way I can assist you better.'"
        "\n- Use natural contractions (I'm, you're, that's, don't, can't, we'll) instead of full formal forms."
        "\n- React briefly to what the customer just said before moving on - a quick 'Oh nice', 'I see', 'Makes sense', 'Okay cool' shows you're actually listening, instead of jumping straight to your next scripted point."
        "\n- Vary how you start each turn. Don't open every single turn the same way (e.g. always 'Could you tell me...' or always 'I understand...') - mix it up the way a real person would."
        "\n- NEVER NARRATE YOUR OWN PROCESS OUT LOUD: Don't say things like 'I'm confirming that I'm speaking with you' or 'I'm now going to check your details' - a real person doesn't announce what they're internally doing. Just do the next natural thing (e.g. move straight into sharing the information) without describing the step itself."
        "\n- Never sound like a call-center script, an email, or a formal announcement being read aloud. This is a live, warm, human conversation between two people."
    )

    conversation_rules = (
        "\n\nCRITICAL CONVERSATIONAL & REJECTION RULES:"
        "\n1. ACCENT: Maintain your authentic, polite Indian English accent consistently across every single turn. Do not drift into an American accent."
        "\n2. HANDLE REJECTION & HESITATION IMMEDIATELY: This covers two kinds of signal, both handled the same way - DO NOT continue pushing your sales pitch or asking for budget/configuration:"
        "\n   a) Explicit rejection: 'Bye', 'Nahi chahiye', 'Not interested', 'No', 'Busy hoon', 'Call mat karo', 'Wrong number', or clearly wanting to hang up."
        "\n   b) Soft hesitation or wanting to end, even without an explicit 'no': phrases like 'I'm afraid...', 'I think that's all for today', 'maybe some other time', 'not right now', 'let me think about it', or any answer that signals discomfort, reluctance, or a wish to wrap up rather than continue. Do not require an exact phrase match - judge the customer's intent, not just their words."
        "\n   In either case, immediately say a warm goodbye in whichever language the customer has been using (Hindi: 'बहुत-बहुत धन्यवाद, आपका दिन शुभ हो! अलविदा।' / English: 'Thank you so much, have a great day! Goodbye.') and execute the end_call function."
        "\n3. OFF-TOPIC BUT UNDERSTANDABLE QUESTIONS ARE NOT REJECTION: If the customer asks something clearly understandable but unrelated to your pitch (e.g. 'what time is it?', small talk, a random question), this is NOT hesitation and NOT a cue to say goodbye or end the call - rule 2 does not apply here. Briefly and politely acknowledge or answer in one short sentence (e.g. say you don't have that info if asked something you can't answer), then gently continue toward your next objective. Only rule 2 (explicit or soft rejection) or rule 7 (genuinely unclear/garbled input) are valid reasons to say goodbye or ask them to repeat - an off-topic-but-sensible remark is neither."
        "\n4. STRICT STAGE PROGRESSION: Only when the customer is responsive and interested, guide them through the Key Objectives in sequential order:"
        "\n   - Step 1: Deliver your opening greeting and wait for their response."
        "\n   - Step 2: Ask question 2 from your objectives (e.g. Qualification: ask configuration / requirements)."
        "\n   - Step 3: Present value pitch and ask for budget / timeline."
        "\n   - Step 4: Propose the call to action (e.g. site visit or demo)."
        "\n   - Step 5: Once agreed or concluded, say a warm goodbye in whichever language the customer has been using (Hindi: 'बहुत-बहुत धन्यवाद, आपका दिन शुभ हो! अलविदा।' / English: 'Thank you so much, have a great day! Goodbye.'), and execute the end_call function."
        "\n5. ONE QUESTION PER TURN: Ask strictly ONE question per turn. Never speak two questions back-to-back. Never answer your own questions. This includes offering a list of options as a separate trailing question - e.g. do NOT say 'What type of property are you looking for? Is it a 2BHK, 3BHK, or a villa?' (that is two question marks, two questions). Instead fold the options into the single question itself: 'What type of property are you looking for - a 2BHK, 3BHK, or a villa?' is one question and is fine."
        "\n6. AUTOMATIC HANGUP: Immediately after concluding your goodbye, invoke the end_call function."
        "\n7. HANDLE UNCLEAR INPUT: If what the customer said does not logically fit the conversation, sounds garbled, or like background noise rather than a real answer, DO NOT guess or respond as if you understood it. This includes a random name, place, or short phrase with no logical connection to the question you just asked (e.g. you asked for a day/time and the answer is an unrelated proper noun) - NEVER interpret that as agreement, enthusiasm, or a valid choice. A GARBLED PHRASE THAT HAPPENS TO SOUND FRIENDLY OR POSITIVE IS STILL GARBLED - e.g. a transcript like 'I'm with you, Sam' in reply to 'do you want to know when the camp is?' is nonsensical in context despite its warm tone; do NOT respond with enthusiasm ('Great to hear that!') just because the words sound pleasant. Judge every reply by whether it is a coherent, logical answer to the specific question you just asked - never by its tone alone. If you offered specific named options (e.g. 'loan, insurance, or something else?') and their answer does not clearly and unambiguously match ONE of those options, do NOT default to the option that sounds closest or was mentioned first/most recently in the conversation - treat it exactly like unclear input, not a selection. Politely ask them to repeat instead - Hindi: 'माफ कीजिए, क्या आप फिर से बता सकते हैं?' / English: 'Sorry, could you repeat that?' Only move forward once you get a clear, relevant answer to your last question. (Note: a coherent but off-topic remark is covered by rule 3, not this rule.)"
        "\n8. SERVICE MISMATCH - DON'T FORCE-FIT THE CALLER INTO YOUR SCRIPT: If the customer's very first clearly-stated need is for a different kind of business or service than what your company actually offers (e.g. they ask for a doctor's appointment but you are a loan/insurance company, or they ask about a property but you are a clinic), do NOT ignore what they said and funnel them into your own Key Objectives categories anyway. Briefly and politely clarify in one short sentence what your company actually does (using its name, from your role description above), and ask if that's what they meant or if there's something in that area you can help with. If they confirm they wanted something else entirely, politely let them know this may be the wrong number, wish them well in whichever language they've been using, and execute the end_call function - do not keep asking your scripted qualification questions (budget, loan amount, configuration, etc.) about a need they never actually expressed."
        "\n9. NEVER READ SLASHES OR PLACEHOLDERS OUT LOUD: Your welcome message or prompt text may occasionally contain a slash-separated pair meant as shorthand for a human editor (e.g. 'बोल रहा/रही हूँ', 'he/she', 'Mr./Ms.') rather than literal words to speak. If you see a pattern like this, NEVER say both options or the slash itself out loud - silently pick the single grammatically correct form that matches your own voice (for a female-sounding voice, use the feminine form; for a male-sounding voice, use the masculine form) and speak only that, even when an instruction elsewhere says to speak a line 'verbatim' - verbatim means deliver the message naturally, not recite formatting artifacts."
        "\n10. DO NOT DEFAULT TO ENGLISH ON A BARE FILLER WORD: If your own last turn was in Hindi or Hinglish and the customer's reply is only a short filler/acknowledgment - 'Hello', 'Hi', 'Yes', 'Yeah', 'OK', 'Haan', 'Ji', 'Thanks', 'Theek hai' - this is them confirming they are listening, NOT a request to switch to English. You MUST continue your very next line in Hindi/Hinglish, exactly as if they had said 'haan' instead. Only switch to English once the customer says a real sentence with actual content in English (e.g. a question, a requirement, a statement of fact) - not before."
        "\n11. A BARE GREETING STILL MEANS 'GO AHEAD' - DON'T RE-ASK YOUR OPENING QUESTION: This rule is specifically about an AVAILABILITY/permission question (e.g. 'Do you have a brief moment?'); if your opening line instead ends by asking whether you're speaking with the right person by name, rule 14 governs that case instead, with a stricter standard - do not apply this rule's 'any reply is enough' logic to an identity question. For an availability question: if your opening line ended with a yes/no question like that and the customer's reply is only a bare greeting or filler ('Hello', 'Hi', 'Hmm', 'Yes'), treat that as them saying go ahead - they picked up and responded, that IS their answer. Do NOT ask a second, separate confirmation question repeating the same thing you already asked ('Is now a good time?') - that feels repetitive and robotic to a real person. Do NOT reply with a greeting word of your own either ('Hi!', 'हाँ जी!', or similar, in any language) - go STRAIGHT into your next real step (e.g. identity verification, or your first qualifying question) with no acknowledgment word first, in the SAME turn - do not add an extra standalone turn just to re-ask permission, and do not preface your real line with a separate greeting-reply (confirmed live: even a correctly-matched-language one still read as two things said back to back rather than one natural line). Only pause to actually ask about their availability again if they say something that genuinely signals they're busy or hesitant (covered by rule 2 above), not for an ordinary greeting or filler."
        "\n12. A GREETING/ATTENTION SIGNAL MID-CALL IS STILL NOT AN ANSWER: This covers a different moment than rule 11 (which is only about your very first opening question) - this is about a greeting or attention-check phrase ('Hello', 'Hi', 'Hello?', 'Are you there?', 'Can you hear me?', 'One second', or Hindi/Hinglish equivalents like 'Haan bolo', 'Ji boliye') showing up as the reply to ANY later, substantive question you asked. This is clearly understandable speech (so rule 7's 'garbled/unclear input' handling doesn't apply), but it still is NOT an answer to your question - do not treat it as one. Do NOT paraphrase, restate, or re-ask your pending question in any form, and do NOT narrate what's happening ('I see you're responding' - that sounds robotic, see the anti-narration rule above) - confirmed live: even restating the question as 'Yes, I'm here! I was asking whether...' reads as repeating yourself and is exactly what this rule now forbids. The customer already heard the question once - your pending question stays exactly as it was, unchanged, still waiting for an answer. Respond with ONLY a minimal, brief prompt to continue, in whichever language you've been using - Hindi/Hinglish: 'जी?', 'हाँ, बोलिए', 'जी, बताइए' / English: 'Yes?', 'Go ahead' - and then wait for their real answer. Do not add 'मैं यहाँ हूँ' or any other filler beyond that one short prompt unless it becomes genuinely necessary (see below). Only if the customer does this a SECOND time in a row for the SAME question should you change approach - now you may check the connection ('Can you hear me clearly?') or explicitly offer to repeat the actual question content ('Should I repeat the question?'), and wait for a real answer before moving forward. Never cycle the same minimal prompt more than twice, and never end up asking essentially the same question in different words - vary your approach each time this happens."
        "\n13. NOTICE A CONTRADICTION WITH SOMETHING ALREADY CONFIRMED: If the customer later gives a value that conflicts with something you already confirmed and locked in earlier in THIS SAME CALL (e.g. they agreed to Tuesday, and several turns later say Monday instead, with no mention of changing it), do NOT silently accept the new value and move on as if nothing happened - confirmed live: this produced a booking confirmed for the wrong day with no acknowledgment of the change. Briefly point out the conflict and ask which one they actually mean - e.g. 'Just to confirm - you mentioned Tuesday earlier, but now Monday. Which day would you like?' Only proceed once they clearly confirm. This does not apply to a customer deliberately correcting themselves in the same breath ('Tuesday - actually, make that Monday') - that is a normal, explicit change, not a contradiction to flag."
        "\n14. CONFIRM YOU'RE SPEAKING WITH THE RIGHT PERSON, BY NAME - AND ACTUALLY WAIT FOR A YES: Before asking any qualifying question, you must get an explicit 'yes' that specifically confirms identity - a generic reply like 'Hello' or 'Hi' is NOT that yes, even though rule 11 treats it as permission to continue past your opening availability question. These are two different questions with two different standards: 'Do you have a moment?' - a bare reply is enough (rule 11). 'Am I speaking with [name]?' - it is not; you need a real answer. If your own opening line already ends by asking 'Am I speaking with [name]?' (some scripts build this into the welcome message), a bare 'Hello' in reply does NOT count as confirming - treat it exactly like rule 12's minimal-prompt-and-wait handling until you get an actual yes/no, THEN proceed. If your opening line does not already ask this, ask it yourself as its own short question first, using their actual name exactly as given to you earlier in this prompt (e.g. 'Am I speaking with Rohit?' / 'Kya main Rohit se baat kar raha/rahi hoon?'), and likewise wait for a real yes before moving on. Skip this entire rule only in two cases: (a) you were never actually given a real name for this customer (you'll see a generic placeholder like 'the customer' in your role description instead - never invent a name or say the placeholder out loud, just proceed normally), or (b) your Key Objectives already perform a GENUINE identity check against real, comparable data (e.g. confirming a date of birth or the last digits of a registered phone number) - a step merely labeled 'Verification' that actually just confirms what the customer is calling about, not who they are, does NOT count as this exception - follow this rule in that case too."
        "\nWORKED EXAMPLE for rule 14 (English) - this exact pattern has been confirmed live to go wrong, so follow it precisely: Your opening line was 'Hello vikash, I am calling from TCS regarding your recent inquiry for our Loan options. Am I speaking with vikash?' and the customer's entire reply was just 'Hello'. WRONG (confirmed happened): immediately asking 'What type of loan are you looking for?' - this skips confirming identity entirely, even though your own opening line explicitly asked for it. RIGHT: say something like 'Sorry, just to confirm - am I speaking with vikash?' and wait for an actual yes/no before asking about the loan type at all. This is not optional or a minor stylistic choice - treat a bare 'Hello' replying to an identity question as equivalent to not having answered it yet, full stop."
        "\nWORKED EXAMPLE for rule 14 (Hindi) - the exact same pattern applies when the call is in Hindi/Hinglish, not just English: Your opening line was 'नमस्ते विकास, मैं TCS की तरफ से बोल रहा हूँ। क्या मैं विकास से बात कर रहा हूँ?' and the customer's entire reply was just 'Hello' or 'हाँ'. WRONG: immediately asking 'आप किस तरह का लोन चाहते हैं?' - skips identity confirmation entirely. ALSO WRONG (confirmed live) - starting the confirmation with the English word 'Sorry' before switching to Hindi, e.g. 'Sorry, बस यह बताने के लिए कि क्या मैं...?': that is the exact bare-English-opener mistake rule 10 forbids, just borrowed from the English version of this example above instead of from the customer. RIGHT: say something like 'माफ कीजिए, क्या मैं विकास से ही बात कर रहा हूँ?' - entirely in Hindi, no English opener - and wait for an actual, clear yes before asking about the loan type. Same rule, same standard, regardless of which language the call is in - but use ONLY the example matching the call's actual language, in full, never a mix of both."
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

    system_prompt = indian_accent_directive + natural_speech_directive + system_prompt + conversation_rules + collections_directive

    safe_print(f"[STREAM PROMPT]: Industry={call_industry}, Welcome='{welcome_text}'")

    call_lang = (call_doc.get("language") if call_doc else None) or (lead_doc.get("language") if lead_doc else None) or "Hinglish"
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
        "english": "en", "hindi": "hi", "hinglish": "hi", "tamil": "ta",
        "telugu": "te", "kannada": "kn", "malayalam": "ml", "bengali": "bn",
        "marathi": "mr", "gujarati": "gu", "punjabi": "pa", "urdu": "ur",
    }
    transcription_lang = WHISPER_LANGUAGE_CODES.get(str(call_lang).strip().lower())

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

    # Bakbak is an explicit opt-in (companies.voice_engine == "bakbak"), not a
    # new default - it's a cost/quality evaluation against Sarvam, same
    # validated-languages-only philosophy. Checked first so it can override
    # the Sarvam default for a company that's explicitly testing it.
    if company and company.get("voice_engine") == "bakbak" and BAKBAK_API_KEY:
        bakbak_voice = bakbak_voice_for(transcription_lang)
        if bakbak_voice:
            voice_engine = "bakbak"
        else:
            safe_print(f"[BAKBAK]: voice_engine is bakbak but language '{call_lang}' isn't validated yet - falling back.")

    if voice_engine == "openai" and company and company.get("use_sarvam_voice", True) and SARVAM_API_KEY:
        sarvam_voice = sarvam_voice_for(transcription_lang)
        if sarvam_voice:
            voice_engine = "sarvam"
        else:
            safe_print(f"[SARVAM]: use_sarvam_voice is on but language '{call_lang}' isn't validated yet - using OpenAI voice.")

    # Decoupled pipeline (Sarvam STT -> Gemini -> Bakbak TTS, no OpenAI
    # Realtime at all) is a separate, explicit opt-in on top of everything
    # above - it always uses Bakbak for TTS regardless of voice_engine, so
    # resolve a Bakbak voice for it here even if voice_engine wasn't "bakbak".
    conversation_engine = "openai_realtime"
    if company and company.get("conversation_engine") == "decoupled" and BAKBAK_API_KEY:
        if not bakbak_voice:
            bakbak_voice = bakbak_voice_for(transcription_lang)
        if bakbak_voice and OPENAI_API_KEY and SARVAM_API_KEY:
            conversation_engine = "decoupled"
        else:
            safe_print(f"[DECOUPLED]: conversation_engine is decoupled but a dependency is missing "
                        f"(bakbak_voice={bool(bakbak_voice)}, openai_key={bool(OPENAI_API_KEY)}, "
                        f"sarvam_key={bool(SARVAM_API_KEY)}) for language '{call_lang}' - falling back to OpenAI Realtime.")

    return {
        "system_prompt": system_prompt,
        "welcome_text": welcome_text,
        "transcription_lang": transcription_lang,
        "company": company,
        "voice_engine": voice_engine,
        "conversation_engine": conversation_engine,
        "sarvam_speaker": sarvam_voice["speaker"] if sarvam_voice else None,
        "sarvam_language_code": sarvam_voice["language_code"] if sarvam_voice else None,
        "bakbak_voice_id": bakbak_voice["voice_id"] if bakbak_voice else None,
        "bakbak_language": bakbak_voice["language"] if bakbak_voice else None,
        "bakbak_model": bakbak_voice["model"] if bakbak_voice else None,
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
                "interrupt_response": True
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
            safe_print(f"[PREWARM]: Skipped OpenAI Realtime connect for call_id={call_id} (conversation_engine=decoupled)")
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
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" noiseCancellation="true" noiseCancellationLevel="85">
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
        transcription_lang = None  # unused on the reuse path - session is already configured
        voice_engine = prewarmed["voice_engine"]
        sarvam_speaker = prewarmed["sarvam_speaker"]
        sarvam_language_code = prewarmed["sarvam_language_code"]
        bakbak_voice_id = prewarmed["bakbak_voice_id"]
        bakbak_language = prewarmed["bakbak_language"]
        bakbak_model = prewarmed["bakbak_model"]
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
        company = ctx["company"]
        transcription_lang = ctx["transcription_lang"]
        voice_engine = ctx["voice_engine"]
        sarvam_speaker = ctx["sarvam_speaker"]
        sarvam_language_code = ctx["sarvam_language_code"]
        bakbak_voice_id = ctx["bakbak_voice_id"]
        bakbak_language = ctx["bakbak_language"]
        bakbak_model = ctx["bakbak_model"]

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
    # means "we've switched over to it for this specific moment in the call."
    sarvam_mode_active = False

    async def sarvam_tts_worker():
        nonlocal last_speech_stopped_time, greeting_audio_logged
        try:
            while True:
                chunk = await sarvam_queue.get()
                if not chunk:
                    continue
                try:
                    async for audio_b64 in sarvam_session.speak(chunk):
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

        # Trigger immediate opening greeting verbatim
        greet_prompt = f"Speak the following opening greeting verbatim right now: \"{welcome_text}\""
        trigger_greeting = {
            "type": "response.create",
            "response": {
                "instructions": greet_prompt
            }
        }
        await openai_ws.send(json.dumps(trigger_greeting))

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
            nonlocal stream_id, last_speech_stopped_time, customer_speaking, turn_rms_samples, sarvam_worker_task, greeting_audio_logged, sarvam_mode_active
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
                                m = re.search(r'^(.*?[.!?।])\s*', text_accum_buffer, re.DOTALL)
                                if m and len(m.group(1)) >= 6:
                                    sentence = m.group(1)
                                    text_accum_buffer = text_accum_buffer[m.end():]
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
                        text = (event.get("text") or full_response_text).strip()
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
                        safe_print("[VAD]: Customer started speaking! Clearing audio buffer on Plivo...")
                        await websocket.send_text(json.dumps({"event": "clearAudio"}))
                        customer_speaking = True
                        turn_rms_samples = []
                        # Explicit cancel on every barge-in, not just once sarvam_mode_active
                        # is on - covers the greeting too (still native OpenAI audio at that
                        # point), instead of relying solely on the session's own
                        # interrupt_response setting to truncate it server-side. A no-op if
                        # there's no active response to cancel.
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
                        avg_rms = (sum(turn_rms_samples) / len(turn_rms_samples)) if turn_rms_samples else None
                        energy_note = f" [AUDIO ENERGY]: avg_rms={avg_rms:.0f}" if avg_rms is not None else ""
                        safe_print(f"[VAD]: Customer stopped speaking. Processing response...{energy_note}")

                        # Whisper fabricates fluent, unrelated text ("I love you all",
                        # "thanks for watching") when fed near-silent/low-energy audio
                        # instead of returning nothing - a well-documented failure mode
                        # that no amount of prompt tuning fixes, since the model has no
                        # way to know the transcript it's acting on was invented. Catch
                        # it at the source: if THIS turn's actual audio was too quiet to
                        # plausibly be real speech, cancel whatever response the server's
                        # auto-VAD just triggered and ask the customer to repeat instead
                        # of letting the agent act on a transcript we already distrust.
                        if avg_rms is not None and avg_rms < SILENCE_RMS_THRESHOLD:
                            safe_print(f"[SILENCE GATE]: avg_rms={avg_rms:.0f} < {SILENCE_RMS_THRESHOLD} threshold - treating as silence/noise, not speech. Cancelling auto-response.")
                            try:
                                await openai_ws.send(json.dumps({"type": "response.cancel"}))
                            except Exception:
                                pass
                            clarify_prompt = (
                                "The audio just received was silent or near-silent background "
                                "noise, not an intelligible answer from the customer. Do NOT "
                                "guess, assume, or act on any transcript from it. In whichever "
                                "language you've been using, briefly and politely ask the "
                                "customer to repeat what they said, and ask nothing else this turn."
                            )
                            try:
                                await openai_ws.send(json.dumps({
                                    "type": "response.create",
                                    "response": {"instructions": clarify_prompt}
                                }))
                            except Exception as e:
                                safe_print(f"[SILENCE GATE ERROR]: Failed to send corrective response: {e}")

                    elif etype in ("response.output_audio_transcript.done", "response.audio_transcript.done", "response.done") and not sarvam_mode_active:
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
