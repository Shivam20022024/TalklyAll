# Decoupled live-call pipeline: Sarvam STT -> OpenAI (plain text chat
# completions, not Realtime) -> Bakbak TTS, replacing OpenAI Realtime's
# fused listen+reason+speak engine for companies with
# company.conversation_engine == "decoupled". Originally built against
# OpenRouter/Gemini for the reasoning leg; swapped to OpenAI's own standard
# chat completions after OpenRouter's account turned out to have no
# purchased credits (confirmed live: every call returned 402 "Insufficient
# credits"). OpenAI Realtime's audio/listening is still not used anywhere
# in this file - this is the cheap, text-only chat endpoint.
#
# STAGE 1 (+goodbye-triggered auto-hangup, ported from plivo_routes.py's
# proven implementation since Stage 1 testing hit it directly - a call
# never ending was worse than not having it), per the approved plan
# (C:\Users\Shivam kumar\.claude\plans\serene-inventing-mist.md). Still no
# barge-in or tool-calling yet. Those remain staged for later passes so a
# failure is easy to isolate, not entangled with several new pieces of
# untested logic at once.
#
# Both STT (Sarvam) and TTS (Bakbak) were empirically validated against the
# real APIs this session before being wired in here - see sarvam_stt.py and
# bakbak_tts.py's module docstrings.

import asyncio
import base64
import json
import logging
import os
import re
import time
from typing import Any, Optional

from fastapi import WebSocket, WebSocketDisconnect
import httpx
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local"))

from services.bakbak_tts import BakbakTTSSession
from services.sarvam_tts import SarvamTTSSession
from services.sarvam_stt import SarvamSTTSession
from services.openai_chat import stream_openai_reply
from routes.plivo_routes import safe_print, finalize_plivo_call, HALLUCINATION_PHRASES, is_degenerate_transcript
from services.hindi_normalizer import is_hindi_or_hinglish
from telephony.plivo_provider import PlivoProvider

# Same proven keyword list and dynamic delay formula as plivo_routes.py's
# trigger_auto_hangup (roughly 11 chars/sec of speech + 3.5s buffer,
# clamped 7-16s) - duplicated rather than imported because the original is
# a closure nested inside the OpenAI pipeline's function, not a standalone
# callable, and that working pipeline isn't being touched.
GOODBYE_KEYWORDS = [
    "अलविदा", "दिन शुभ हो", "बाय", "bye", "goodbye", "good bye",
    "have a great day", "have a wonderful day", "have a good day", "have a nice day",
    "take care", "talk to you soon", "बात करने के लिए धन्यवाद", "कॉल करने के लिए धन्यवाद",
    "शुभ दिन"
]

# Matches the first sentence OR comma-terminated clause (English/Hindi
# terminators) at the start of a growing streamed-text buffer, so it can be
# flushed to TTS the moment it completes instead of waiting for the whole
# (possibly multi-sentence) reply. Comma included on purpose - Bakbak's TTS
# call is a single blocking HTTP round trip with no streaming (see
# bakbak_tts.py), so its synthesis time scales with how much text it's
# given; flushing at the first comma instead of only the first full stop
# gives it a short acknowledgment clause to synthesize first (see
# DECOUPLED_FIRST_WORD_DIRECTIVE below) instead of a whole sentence,
# cutting the dead air before the agent's first word - confirmed live as a
# 2-3s gap before this change.
_SENTENCE_END_RE = re.compile(r"^(.*?[.!?।])\s*")
_CLAUSE_END_RE = re.compile(r"^(.*?[,])\s*")
_COMMON_ABBRS = {"dr.", "mr.", "mrs.", "ms.", "rs.", "no.", "vs.", "e.g.", "i.e."}

DECOUPLED_FIRST_WORD_DIRECTIVE_EN = (
    "\n\nCRITICAL LOW-LATENCY DELIVERY & CONVERSATION RULES:\n"
    "1. RAPID OPENER (MANDATORY): Always start your response with a natural acknowledgment "
    "ending with a period or exclamation (e.g. 'Got it.', 'I see.', 'Great.', 'Sure thing.', 'Understood.'). "
    "This allows your voice to begin playing immediately in under 1 second while your main response generates.\n"
    "2. STRICT SINGLE QUESTION RULE (NEVER STACK QUESTIONS): Ask strictly ONE simple, concise question per turn (under 10 words). "
    "NEVER ask multiple questions in one breath (e.g. NEVER ask 'क्या आप वीकेंड में आना चाहेंगे? और सुबह का समय ठीक रहेगा या शाम का?'). "
    "Ask only ONE detail at a time (e.g. 'क्या आप वीकेंड में आना चाहेंगे या वीकडे में?'), then immediately STOP speaking and WAIT for the customer to reply. "
    "Only ask about time slots (morning/evening) in a subsequent turn AFTER the customer has chosen a day!\n"
    "3. DIRECT FIRST TURN (ZERO IDENTITY RE-ASKING): You already addressed the customer by name in the opening message ('Hi yash...', 'Hello Vikash...'). "
    "When they say 'Yes', 'Yeah', 'Hello', 'Speaking', 'यह', 'यस', 'Haan', 'हाँ', 'Sure', or 'OK', their identity is ALREADY 100% confirmed. "
    "You are STRICTLY FORBIDDEN from asking 'am I speaking with [name]?', 'is this [name]?', or 'just to confirm'. NEVER re-ask their name. "
    "Immediately ask your first discovery question in under 12 words.\n"
    "4. ABSOLUTE BAN ON REPEATING CUSTOMER NAME: You already greeted the customer by name in the opening message. "
    "Once the conversation is underway, NEVER repeat or speak their name in your subsequent replies "
    "(do NOT say 'Thanks, Vikash!' or 'Hi Anshu', just say 'Got it.' or 'I see.').\n"
    "5. STRICT LANGUAGE ENFORCEMENT: You MUST converse 100% in English unless the customer explicitly speaks Hindi."
)

DECOUPLED_FIRST_WORD_DIRECTIVE_HI = (
    "\n\nCRITICAL LOW-LATENCY DELIVERY & CONVERSATION RULES:\n"
    "1. NATURAL HUMAN OPENER: Speak naturally like a polite human coordinator. "
    "Do NOT force repetitive, robotic words like 'समझ गया' at the beginning of your responses. "
    "When connecting your response, use short, warm, gender-neutral phrases like 'जी बिल्कुल, ', 'जी, ', 'बहुत बढ़िया, ', 'ज़रूर, ' ending with a comma (,) so speech flows seamlessly into your question without awkward dead pauses. "
    "If the customer just said 'हाँ बताइए', 'बोलिए', or 'Hello', do NOT say 'समझ गया' - simply say 'जी, क्या आप...' and continue naturally.\n"
    "2. STRICT SINGLE QUESTION RULE (NEVER STACK QUESTIONS): Ask strictly ONE simple, concise question per turn (under 10 words). "
    "NEVER ask multiple questions in one breath (e.g. NEVER ask 'क्या आप वीकेंड में आना चाहेंगे? और सुबह का समय ठीक रहेगा या शाम का?'). "
    "Ask only ONE detail at a time (e.g. 'क्या आप वीकेंड में आना चाहेंगे या वीकडे में?'), then immediately STOP speaking and WAIT for the customer to reply. "
    "Only ask about time slots (morning/evening) in a subsequent turn AFTER the customer has chosen a day!\n"
    "3. DIRECT FIRST TURN (पहचान दोबारा पूछना सख्त मना है): आपने वेलकम मैसेज में ग्राहक का नाम पहले ही ले लिया है ('नमस्ते यश...', 'Hi yash...'). "
    "जब ग्राहक 'हाँ', 'Haan', 'Yes', 'यह', 'यस', 'जी', 'बोलिए', 'Hello' या कोई भी जवाब दे, तो पहचान पूरी तरह कन्फर्म है। "
    "कभी भी 'क्या मेरी बात [नाम] से हो रही है?' या 'Just to confirm, am I speaking with [name]' दोबारा मत पूछिए। "
    "सीधे अपने पहले मुख्य सवाल पर आगे बढ़िए।\n"
    "4. ABSOLUTE BAN ON REPEATING CUSTOMER NAME: You already greeted the customer by name in the opening message. "
    "Once the conversation is underway, NEVER repeat or speak their name in your subsequent replies.\n"
    "5. STRICT LANGUAGE CONTINUITY (HINDI/HINGLISH): Your opening greeting was in Hindi/Hinglish. You MUST converse 100% in natural Hindi/Hinglish throughout this call. "
    "When the customer answers with words like 'Haan kar rahe hain', 'Mobile phone', 'Tomorrow', 'Morning', 'Yes', 'OK', you MUST NOT switch to English! "
    "Continue answering and asking questions in Hindi/Hinglish. ONLY switch to English if the customer explicitly commands you to speak in English."
)

logger = logging.getLogger("talkly-plivo-decoupled")

BAKBAK_API_KEY = os.environ.get("BAKBAK_API_KEY", "").strip()
SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "").strip()
# Plain text chat completions, not Realtime - OPENAI_API_KEY is already
# funded elsewhere in this codebase. gpt-4o-mini by default: cheap, and
# this pipeline's whole point is avoiding Realtime's expensive audio-token
# pricing, so a cheap text model for turn-by-turn reasoning fits.
OPENAI_CHAT_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_CHAT_MODEL = os.environ.get("DECOUPLED_CHAT_MODEL", "gpt-4o-mini")

# Sarvam STT's "auto" language_code does real per-utterance adaptive
# detection (confirmed in the SDK's connect() docstring) - unlike the
# OpenAI/Whisper path, which has transcription_lang hard-pinned to "hi" for
# Hindi/Hinglish calls because Whisper's auto-detect previously mis-rendered
# Hindi speech in the wrong script entirely (see resolve_call_voice_context's
# WHISPER_LANGUAGE_CODES comment). Sarvam's auto mode is a different,
# purpose-built feature, not the same thing that broke before - using it
# here is what actually delivers "English when they speak English, Hindi
# when they speak Hindi" without re-touching the Whisper pipeline at all.

# In-memory prewarmed greeting cache: call_id -> asyncio.Task
# Populated as soon as an outbound call is dispatched (while the phone rings)
# or when Plivo's /answer webhook fires, so the greeting audio is already 100%
# synthesized and waiting in memory when /stream connects (0ms startup latency).
DECOUPLED_GREETING_CACHE = {}


async def prewarm_bakbak_connection(client: httpx.AsyncClient):
    """Pre-warms the TCP and TLS socket to Bakbak TTS (hub.getraya.app) during
    greeting playback so the first customer turn pays 0ms TLS setup."""
    try:
        if client is not None:
            await client.head("https://hub.getraya.app", timeout=4.0)
            safe_print("[DECOUPLED PREWARM]: Bakbak TTS HTTP connection pre-warmed successfully (hot TLS socket ready).")
    except Exception as e:
        safe_print(f"[DECOUPLED PREWARM NOTICE]: Bakbak connection pre-warm non-critical: {e}")


async def prewarm_openai_connection(client: httpx.AsyncClient, api_key: str, model: str):
    """Pre-warms the TCP and TLS connection to api.openai.com in the background
    during greeting playback. Eliminates the ~1.0s cold TLS handshake delay
    when the customer speaks their first word."""
    try:
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {"model": model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1}
        await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=5.0)
        safe_print("[DECOUPLED PREWARM]: OpenAI HTTP connection pre-warmed successfully (hot TLS socket ready).")
    except Exception as e:
        safe_print(f"[DECOUPLED PREWARM NOTICE]: OpenAI connection pre-warm non-critical: {e}")


def prewarm_decoupled_greeting(
    call_id: str,
    company_id: str = None,
    welcome_text: str = None,
    bakbak_voice_id: str = None,
    
    bakbak_language: str = None,
    bakbak_model: str = None,
):
    """Synthesizes the welcome greeting ahead of time (while the phone is ringing
    or at /answer time) so that when /stream connects, the initial voice audio is
    forwarded immediately (sub-10ms latency) instead of making the customer wait 2-3 seconds."""
    if not call_id:
        return None
    if call_id in DECOUPLED_GREETING_CACHE:
        return DECOUPLED_GREETING_CACHE[call_id]

    async def _synth():
        try:
            w_text = welcome_text
            v_id = bakbak_voice_id
            v_lang = bakbak_language
            v_mod = bakbak_model or "m1"
            ctx = None

            if not w_text or not v_id:
                import mongodb
                from routes.plivo_routes import resolve_call_voice_context
                db = mongodb.get_db()
                ctx = await resolve_call_voice_context(db, call_id, company_id)
                w_text = w_text or ctx.get("welcome_text")
                v_id = v_id or ctx.get("bakbak_voice_id")
                v_lang = v_lang or ctx.get("bakbak_language")
                v_mod = v_mod or ctx.get("bakbak_model", "m1")

            if not w_text:
                return None

            is_hi_greet = is_hindi_or_hinglish(w_text)
            w_text = clean_tts_text(w_text, customer_name="", is_subsequent=False, language="Hindi" if is_hi_greet else "English")

            t0 = time.time()
            api_key = os.environ.get("BAKBAK_API_KEY", "").strip() or BAKBAK_API_KEY
            if api_key:
                v_id = v_id or "3fe4afbc-3bde-4c97-ab8e-37e3fb8c7ba2"
                v_lang = v_lang or ("hi" if is_hi_greet else "en-in")
                session = BakbakTTSSession(api_key, v_id, v_lang, v_mod)
            elif SARVAM_API_KEY:
                speaker = (ctx.get("sarvam_speaker") if ctx else None) or ("ishita_enhi_customer" if is_hi_greet else "simran_en_conversation")
                lang = "hi-IN" if is_hi_greet else "en-IN"
                session = SarvamTTSSession(SARVAM_API_KEY, speaker, lang)
            else:
                return None

            await session.__aenter__()
            chunks = []
            total_sec = 0.0
            try:
                async for audio_b64 in session.speak(w_text):
                    if audio_b64:
                        chunks.append(audio_b64)
                        try:
                            raw_bytes = base64.b64decode(audio_b64)
                            total_sec += len(raw_bytes) / 8000.0
                        except Exception:
                            pass
            finally:
                await session.__aexit__(None, None, None)

            t1 = time.time()
            safe_print(
                f"[DECOUPLED PREWARM]: Pre-synthesized welcome greeting for call_id={call_id} "
                f"({total_sec:.2f}s audio, {len(chunks)} chunks, {len(w_text)} chars) in {t1 - t0:.2f}s"
            )
            return {"chunks": chunks, "duration": total_sec, "text": w_text}
        except Exception as e:
            safe_print(f"[DECOUPLED PREWARM ERROR]: Failed to pre-synthesize for call_id={call_id}: {e}")
            return None

    task = asyncio.create_task(_synth())
    DECOUPLED_GREETING_CACHE[call_id] = task

    async def _auto_cleanup():
        await asyncio.sleep(60.0)
        DECOUPLED_GREETING_CACHE.pop(call_id, None)

    asyncio.create_task(_auto_cleanup())
    return task


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


async def _speak_and_forward(websocket: WebSocket, tts_session: Any, text: str, customer_name: str = "", is_subsequent: bool = False, language: str = "Hindi") -> float:
    """Synthesizes text via Sarvam/Bakbak streaming and forwards every resulting chunk to
    Plivo as a playAudio event - identical wire format to the existing
    sarvam_tts_worker in plivo_routes.py. Returns total audio duration in seconds."""
    text = clean_tts_text(text, customer_name, is_subsequent=is_subsequent, language=language)
    if not text:
        return 0.0
    total_audio_sec = 0.0
    try:
        async for audio_b64 in tts_session.speak(text):
            try:
                raw_bytes = base64.b64decode(audio_b64)
                # 8kHz 8-bit mulaw audio = 8000 bytes per second
                total_audio_sec += len(raw_bytes) / 8000.0
            except Exception:
                pass
            play_msg = {
                "event": "playAudio",
                "media": {
                    "contentType": "audio/x-mulaw",
                    "sampleRate": 8000,
                    "payload": audio_b64
                }
            }
            await websocket.send_text(json.dumps(play_msg))
    except Exception as e:
        safe_print(f"[DECOUPLED TTS ERROR]: {e}")
    return total_audio_sec


async def run_decoupled_pipeline(websocket: WebSocket, call_id: str, company_id: str, db, ctx: dict) -> None:
    """ctx is resolve_call_voice_context()'s return dict - the caller
    resolves it once, same as the OpenAI path does, so this function doesn't
    duplicate that DB-heavy lookup."""
    system_prompt = ctx["system_prompt"]
    welcome_text = ctx["welcome_text"]
    customer_name = ctx.get("customer_name") or ""
    company = ctx.get("company")
    offering = ctx.get("offering") or ""
    company_name = (company.get("name") if isinstance(company, dict) else None) or "the company"
    bakbak_voice_id = ctx.get("bakbak_voice_id")
    bakbak_language = ctx.get("bakbak_language")
    bakbak_model = ctx.get("bakbak_model")
    # Pin Sarvam STT to the campaign's actual configured language when it's
    # one we're confident mapping (same "only pin what we're sure of, auto
    # otherwise" philosophy as WHISPER_LANGUAGE_CODES in
    # resolve_call_voice_context). "auto" alone was confirmed live to
    # mis-detect ambiguous/noisy audio as an unrelated language entirely
    # (Vietnamese, on an English edtech campaign) - that wrong-language
    # transcript then became the next "user" message in the chat history,
    # and gpt-4o-mini naturally kept replying in it since the conversation
    # context was now actually in that language. Pinning doesn't make STT
    # infallible, but it removes the failure mode of auto-detect landing on
    # a language the campaign was never configured for. "en-IN"/"hi-IN"
    # confirmed valid against the installed sarvamai SDK's own
    # speech_to_text_realtime_streaming.connect() language_code signature.
    # Detect pipeline language from Hindi Devanagari or Roman Hinglish keywords
    is_hindi_pipeline = is_hindi_or_hinglish(welcome_text, system_prompt, ctx.get("call_lang"))
    call_lang = ctx.get("call_lang") or ("Hindi" if is_hindi_pipeline else "English")

    v_gender = ctx.get("voice_gender") or "Female"
    gender_rules = (
        f"\n6. GENDER CONSISTENCY: Your voice persona is {v_gender.upper()}. In Hindi/Hinglish, strictly use "
        + ("FEMININE verb forms ('बोल रही हूँ', 'समझ गई', 'सकती हूँ', 'करूँगी'). Never use masculine forms ('रहा हूँ', 'सकता हूँ', 'गया').\n" if v_gender == "Female"
           else "MASCULINE verb forms ('बोल रहा हूँ', 'समझ गया', 'सकता हूँ', 'करूँगा'). Never use feminine forms ('रही हूँ', 'सकती हूँ', 'गई').\n")
    )
    ind_anchor = (
        f"7. DOMAIN INTEGRITY: You are representing {company_name} regarding {offering or 'our services'}. "
        "Stick strictly to the domain, terminology, and facts provided in your system prompt and knowledge base. Never invent terms or concepts from unrelated industries.\n"
        "8. NO OVER-REPETITION: Do NOT repeat the full formal offering title on every turn. Refer to it naturally in conversation or ask your question directly.\n"
        "9. SALES & OFFERING FLEXIBILITY (NEVER REJECT INQUIRIES): If the customer asks for an alternate option, variant, timing, tier, or configuration, NEVER reject them or say you only offer one thing! Always acknowledge warmly that suitable options are available, explore their requirements, and guide them to the next step.\n"
    )
    if is_hindi_pipeline:
        directive = DECOUPLED_FIRST_WORD_DIRECTIVE_HI + gender_rules + ind_anchor
    else:
        directive = DECOUPLED_FIRST_WORD_DIRECTIVE_EN

    _sarvam_stt_lang_map = {"en": "en-IN", "hi": "hi-IN"}
    if is_hindi_pipeline:
        stt_language_code = "hi-IN"
    else:
        stt_language_code = "en-IN"

    hangup_triggered = False

    # Always lock voice engine to Raya / Bakbak TTS
    use_bakbak_tts = bool(BAKBAK_API_KEY)

    if not (OPENAI_CHAT_API_KEY and SARVAM_API_KEY and (use_bakbak_tts or SARVAM_API_KEY)):
        safe_print(f"[DECOUPLED ERROR]: Missing required config for call_id={call_id} "
                    f"(sarvam_key={bool(SARVAM_API_KEY)}, openai_key={bool(OPENAI_CHAT_API_KEY)}, "
                    f"bakbak_key={bool(BAKBAK_API_KEY)}) - aborting call.")
        await websocket.close()
        return

    transcript_parts: list = []
    messages = [{"role": "system", "content": system_prompt + directive}]

    # 1. Connect Sarvam STT concurrently in background so it doesn't block welcome audio playback
    stt_session = SarvamSTTSession(SARVAM_API_KEY, stt_language_code)
    stt_init_task = asyncio.create_task(stt_session.__aenter__())

    if use_bakbak_tts:
        v_id = bakbak_voice_id or "3fe4afbc-3bde-4c97-ab8e-37e3fb8c7ba2"
        v_lang = bakbak_language or ("hi" if is_hindi_pipeline else "en-in")
        v_mod = bakbak_model or "m1"
        tts_session = BakbakTTSSession(BAKBAK_API_KEY, v_id, v_lang, v_mod)
        safe_print(f"[DECOUPLED]: Voice engine locked to Raya / Bakbak TTS (voice_id={v_id}, lang={v_lang})")
    else:
        sarvam_speaker = ctx.get("sarvam_speaker") or ("ishita_enhi_customer" if is_hindi_pipeline else "simran_en_conversation")
        sarvam_lang = "hi-IN" if is_hindi_pipeline else "en-IN"
        tts_session = SarvamTTSSession(SARVAM_API_KEY, sarvam_speaker, sarvam_lang)
        safe_print(f"[DECOUPLED]: Fallback to Sarvam Streaming TTS ({sarvam_speaker}, {sarvam_lang})")

    await tts_session.__aenter__()

    openai_http_client = httpx.AsyncClient(
        timeout=30.0,
        limits=httpx.Limits(max_keepalive_connections=5, keepalive_expiry=60.0)
    )
    asyncio.create_task(prewarm_openai_connection(openai_http_client, OPENAI_CHAT_API_KEY, OPENAI_CHAT_MODEL))
    if hasattr(tts_session, "_client") and tts_session._client:
        asyncio.create_task(prewarm_bakbak_connection(tts_session._client))

    agent_speaking_until = 0.0
    welcome_duration = 0.0

    try:
        # Check if prewarmed welcome audio is available (from call dispatch or /answer)
        prewarm_task = DECOUPLED_GREETING_CACHE.pop(call_id, None)
        prewarmed_result = None
        if prewarm_task:
            try:
                # If call was placed while phone was ringing, this resolves in 0ms!
                prewarmed_result = await asyncio.wait_for(asyncio.shield(prewarm_task), timeout=2.5)
            except Exception as e:
                safe_print(f"[DECOUPLED PREWARM NOTICE]: Prewarm wait ended: {e}")

        # Ensure Plivo media stream handshake is complete ("start" event received)
        # before dispatching audio into the track so Plivo's media server doesn't drop the audio.
        try:
            raw_init = await asyncio.wait_for(websocket.receive_text(), timeout=1.5)
            init_data = json.loads(raw_init)
            init_evt = init_data.get("event")
            if init_evt == "start":
                st_id = init_data.get("start", {}).get("streamId") or init_data.get("streamId")
                safe_print(f"[DECOUPLED]: Plivo media stream ready (streamId={st_id}) for call_id={call_id}")
            elif init_evt == "media":
                p = (init_data.get("media") or {}).get("payload") or init_data.get("payload")
                if p:
                    await stt_session.push_audio(p)
        except Exception as init_err:
            safe_print(f"[DECOUPLED]: Handshake start wait: {init_err}")

        if prewarmed_result and prewarmed_result.get("chunks"):
            # FAST PATH: Play pre-synthesized audio chunks immediately into active stream
            t_play_start = time.time()
            welcome_duration = prewarmed_result["duration"]
            for audio_b64 in prewarmed_result["chunks"]:
                try:
                    raw_audio = base64.b64decode(audio_b64)
                    chunk_sz = 8000  # 1-second slices of 8kHz mulaw
                    if len(raw_audio) > chunk_sz:
                        for offset in range(0, len(raw_audio), chunk_sz):
                            sub_b64 = base64.b64encode(raw_audio[offset:offset + chunk_sz]).decode("ascii")
                            play_msg = {
                                "event": "playAudio",
                                "media": {
                                    "contentType": "audio/x-mulaw",
                                    "sampleRate": 8000,
                                    "payload": sub_b64
                                }
                            }
                            await websocket.send_text(json.dumps(play_msg))
                            await asyncio.sleep(0.01)
                    else:
                        play_msg = {
                            "event": "playAudio",
                            "media": {
                                "contentType": "audio/x-mulaw",
                                "sampleRate": 8000,
                                "payload": audio_b64
                            }
                        }
                        await websocket.send_text(json.dumps(play_msg))
                except Exception:
                    play_msg = {
                        "event": "playAudio",
                        "media": {
                            "contentType": "audio/x-mulaw",
                            "sampleRate": 8000,
                            "payload": audio_b64
                        }
                    }
                    await websocket.send_text(json.dumps(play_msg))
            safe_print(
                f"[DECOUPLED LATENCY]: Instant welcome audio sent {((time.time() - t_play_start)*1000):.1f}ms after stream start! "
                f"(Audio duration: {welcome_duration:.2f}s)"
            )
        elif welcome_text:
            # Fallback path if not prewarmed: split greeting so first sentence plays as fast as possible
            safe_print(f"[DECOUPLED]: No prewarm found for call_id={call_id}, synthesizing on-the-fly...")
            sentences = [s.strip() for s in re.split(r'(?<=[।?!.])\s+', welcome_text) if s.strip()]
            if len(sentences) > 1:
                dur1 = await _speak_and_forward(websocket, tts_session, sentences[0], customer_name, is_subsequent=False, language=call_lang)
                welcome_duration += dur1
                for rem in sentences[1:]:
                    dur_rem = await _speak_and_forward(websocket, tts_session, rem, customer_name, is_subsequent=False, language=call_lang)
                    welcome_duration += dur_rem
            else:
                welcome_duration = await _speak_and_forward(websocket, tts_session, welcome_text, customer_name, is_subsequent=False, language=call_lang)

        if welcome_text:
            # Add a 0.5s network buffer to ensure Plivo carrier has finished playing out the audio
            agent_speaking_until = time.time() + welcome_duration + 0.5
            safe_print(f"[DECOUPLED]: Welcome audio sent ({welcome_duration:.2f}s). Plivo playback will complete at {agent_speaking_until:.2f} (in {welcome_duration:.2f}s).")
            transcript_parts.append(f"AI: {welcome_text}")
            await db.calls.update_one({"call_id": call_id}, {"$set": {"transcript": "\n".join(transcript_parts)}})
            messages.append({"role": "assistant", "content": welcome_text})

        # Ensure Sarvam STT WebSocket is ready before customer can finish speaking
        try:
            await asyncio.wait_for(stt_init_task, timeout=5.0)
            safe_print(f"[DECOUPLED]: Sarvam STT ready for call_id={call_id} (lang={stt_language_code})")
        except Exception as stt_err:
            safe_print(f"[DECOUPLED ERROR]: Sarvam STT connect failed for call_id={call_id}: {stt_err}")

        turn_lock = asyncio.Lock()  # serializes Gemini+TTS turns - Stage 1 has no barge-in, so one turn at a time is correct
        # Each STT "final" event spawns handle_final_transcript as a
        # fire-and-forget task (see stt_to_gemini below) so a slow
        # Gemini/TTS turn doesn't block new STT events from being consumed.
        # Tracked here so cleanup can wait for any still-running turn before
        # closing the websocket - without this, a turn that was mid-flight
        # when the Plivo connection dropped would have its audio silently
        # fail to send (confirmed live: "Unexpected ASGI message
        # 'websocket.send', after sending 'websocket.close'").
        turn_tasks: set = set()
        hangup_early_event = asyncio.Event()

        async def trigger_decoupled_hangup(delay_seconds: float) -> None:
            nonlocal hangup_triggered
            if hangup_triggered:
                return
            hangup_triggered = True
            turns_at_trigger = len(transcript_parts)
            safe_print(f"[DECOUPLED AUTO HANGUP]: Scheduled in {delay_seconds:.1f}s (turns={turns_at_trigger}) after AI goodbye...")

            try:
                # Wait for the calculated delay, or wake up immediately if caller speaks parting words
                try:
                    await asyncio.wait_for(hangup_early_event.wait(), timeout=delay_seconds)
                    safe_print("[DECOUPLED AUTO HANGUP]: Immediate hangup triggered by caller acknowledgment.")
                except asyncio.TimeoutError:
                    pass

                # Short 0.2s pause for carrier buffer flush
                await asyncio.sleep(0.2)

                safe_print(f"[DECOUPLED AUTO HANGUP]: Terminating Plivo call now for call_id={call_id}...")
                cdoc = await db.calls.find_one({"call_id": call_id}) if call_id else None
                call_uuid = (cdoc.get("plivo_call_uuid") or cdoc.get("plivo_request_uuid")) if cdoc else None
                if not call_uuid:
                    try:
                        from routes.plivo_routes import PLIVO_CALL_CACHE
                        call_uuid = (PLIVO_CALL_CACHE.get(call_id) or {}).get("call_uuid")
                    except Exception:
                        pass
                if not call_uuid:
                    call_uuid = ctx.get("call_uuid")

                company_telephony = company.get("telephony", {}) if company else {}
                plivo_auth_id = company_telephony.get("account_sid") or os.environ.get("PLIVO_AUTH_ID")
                plivo_auth_token = company_telephony.get("auth_token") or os.environ.get("PLIVO_AUTH_TOKEN")
                if call_uuid and plivo_auth_id and plivo_auth_token:
                    plivo_prov = PlivoProvider(plivo_auth_id, plivo_auth_token)
                    hung_up = await plivo_prov.hangup_call(call_uuid)
                    safe_print(f"[DECOUPLED AUTO HANGUP]: Plivo call {call_uuid} hangup REST API result: {hung_up}")
                else:
                    safe_print(f"[DECOUPLED AUTO HANGUP WARNING]: Could not find call_uuid ({call_uuid}) or Plivo credentials.")

                try:
                    await websocket.close()
                except Exception:
                    pass
            except Exception as e:
                safe_print(f"[DECOUPLED AUTO HANGUP ERROR]: {e}")

        async def _save_transcript_bg():
            try:
                await db.calls.update_one(
                    {"call_id": call_id},
                    {"$set": {"transcript": "\n".join(transcript_parts)}}
                )
            except Exception as e:
                safe_print(f"[DECOUPLED DB ERROR]: {e}")

        async def handle_final_transcript(customer_text: str) -> None:
            nonlocal agent_speaking_until
            try:
                customer_text = (customer_text or "").strip()
                if not customer_text or len(customer_text) <= 1:
                    return

                # If goodbye was already spoken / hangup is in progress, do NOT start a new OpenAI turn!
                if hangup_triggered:
                    safe_print(f"[DECOUPLED AUTO HANGUP]: Caller spoke '{customer_text}' after goodbye was already delivered.")
                    transcript_parts.append(f"Customer: {customer_text}")
                    asyncio.create_task(_save_transcript_bg())
                    # Only cut call early if AI has already finished audibly speaking its closing line
                    if time.time() >= agent_speaking_until:
                        hangup_early_event.set()
                    return

                if customer_text.lower() in HALLUCINATION_PHRASES or is_degenerate_transcript(customer_text):
                    safe_print(f"[DECOUPLED]: Dropped likely hallucinated/degenerate STT text: '{customer_text}'")
                    return

                # If customer speaks during welcome message, buffer until welcome audio completes
                now = time.time()
                is_welcome_turn = len(transcript_parts) <= 1
                if is_welcome_turn and now < agent_speaking_until:
                    wait_rem = agent_speaking_until - now
                    safe_print(
                        f"[DECOUPLED PICKUP BUFFER]: Buffered customer speech '{customer_text}' during welcome line "
                        f"({wait_rem:.2f}s remaining). Processing immediately upon welcome completion..."
                    )
                    await asyncio.sleep(wait_rem)
                elif not is_welcome_turn and now < agent_speaking_until:
                    # Customer spoke while AI was still audibly playing on Plivo line - execute clean barge-in
                    safe_print(
                        f"[DECOUPLED BARGE-IN]: Customer spoke ('{customer_text}') while AI was audibly speaking "
                        f"({agent_speaking_until - now:.2f}s remaining). Clearing Plivo audio buffer immediately..."
                    )
                    try:
                        await websocket.send_text(json.dumps({"event": "clearAudio"}))
                    except Exception as ce:
                        safe_print(f"[DECOUPLED BARGE-IN ERROR]: Failed to send clearAudio: {ce}")
                    agent_speaking_until = time.time()
                    await asyncio.sleep(0.12)

                async with turn_lock:
                    turn_start = time.time()
                    safe_print(f"[CUSTOMER SPEECH][DECOUPLED]: {customer_text}")
                    transcript_parts.append(f"Customer: {customer_text}")
                    asyncio.create_task(_save_transcript_bg())
                    messages.append({"role": "user", "content": customer_text})

                    # Flush the first completed clause to Bakbak concurrently as soon as
                    # it completes, while OpenAI continues streaming the remaining text.
                    full_reply = ""
                    first_sentence_flushed = False
                    remainder_start = 0
                    first_sentence_ready_at = None
                    first_audio_task = None
                    first_sent_text = ""

                    async for delta in stream_openai_reply(messages, OPENAI_CHAT_API_KEY, OPENAI_CHAT_MODEL, client=openai_http_client):
                        full_reply += delta
                        if not first_sentence_flushed:
                            m = _SENTENCE_END_RE.match(full_reply)
                            target_match = None
                            if m:
                                cand = m.group(1).strip()
                                cand_lower = cand.lower()
                                # Don't flush tiny 1-2 word fragments alone (e.g. "Got it.", "जी बिल्कुल।", "ठीक है।")
                                # Flushing tiny fragments causes disconnected prosody, flat downward cadence, and jitter gaps.
                                # Require at least 3 words, or match forward to include the next clause/sentence boundary.
                                if cand_lower not in _COMMON_ABBRS and len(cand.split()) >= 3:
                                    target_match = m
                                else:
                                    m2 = re.match(r"^(" + re.escape(cand) + r"\s+.*?[.!?।,])\s*", full_reply)
                                    if m2 and len(m2.group(1).strip().split()) >= 3:
                                        target_match = m2
                            if not target_match:
                                mc = _CLAUSE_END_RE.match(full_reply)
                                if mc and len(mc.group(1).strip().split()) >= 3:
                                    target_match = mc

                            if target_match:
                                first_sentence_flushed = True
                                first_sentence_ready_at = time.time()
                                remainder_start = target_match.end()
                                first_sent_text = target_match.group(1).strip()
                                safe_print(f"[DECOUPLED LATENCY]: OpenAI first clause ready in {first_sentence_ready_at - turn_start:.2f}s: '{first_sent_text}'")
                                # Run TTS concurrently in background so OpenAI generation is not stalled
                                first_audio_task = asyncio.create_task(
                                    _speak_and_forward(websocket, tts_session, first_sent_text, customer_name, is_subsequent=True, language=call_lang)
                                )

                    full_reply = full_reply.strip()
                    if not full_reply:
                        safe_print(f"[DECOUPLED ERROR]: OpenAI chat returned no text for call_id={call_id}")
                        if first_audio_task:
                            await first_audio_task
                        return

                    clean_full_reply = clean_tts_text(full_reply, customer_name, is_subsequent=True, language=call_lang)
                    safe_print(f"[AI SPEECH][DECOUPLED]: {clean_full_reply}")
                    messages.append({"role": "assistant", "content": clean_full_reply})
                    transcript_parts.append(f"AI: {clean_full_reply}")
                    asyncio.create_task(_save_transcript_bg())

                    if first_audio_task:
                        dur1 = await first_audio_task
                        agent_speaking_until = max(agent_speaking_until, time.time()) + dur1 + 0.1
                        safe_print(f"[DECOUPLED LATENCY]: TTS first-clause audio sent ({dur1:.2f}s), total latency={time.time() - turn_start:.2f}s")
                        remaining_text = full_reply[remainder_start:].strip()
                        if remaining_text:
                            dur2 = await _speak_and_forward(websocket, tts_session, remaining_text, customer_name, is_subsequent=True, language=call_lang)
                            agent_speaking_until = max(agent_speaking_until, time.time()) + dur2 + 0.1
                    else:
                        dur3 = await _speak_and_forward(websocket, tts_session, clean_full_reply, customer_name, is_subsequent=True, language=call_lang)
                        agent_speaking_until = max(agent_speaking_until, time.time()) + dur3 + 0.1

                    reply_lower = clean_full_reply.lower()
                    if (len(transcript_parts) - 1) >= 3 and any(kw in reply_lower for kw in GOODBYE_KEYWORDS):
                        rem_audio_sec = max(0.0, agent_speaking_until - time.time())
                        delay = max(1.5, min(rem_audio_sec + 1.2, 20.0))
                        safe_print(f"[DECOUPLED AUTO HANGUP]: Goodbye detected in AI speech. Audio finishes in {rem_audio_sec:.1f}s; hanging up in {delay:.1f}s...")
                        t = asyncio.create_task(trigger_decoupled_hangup(delay))
                        turn_tasks.add(t)
                        t.add_done_callback(turn_tasks.discard)
            except Exception:
                import traceback
                safe_print(f"[DECOUPLED ERROR]: handle_final_transcript crashed for call_id={call_id}:\n{traceback.format_exc()}")

        media_count = 0

        async def plivo_to_stt():
            nonlocal media_count
            while True:
                raw_msg = await websocket.receive_text()
                data = json.loads(raw_msg)
                event_type = data.get("event")
                if event_type == "media":
                    media_count += 1
                    if media_count == 1:
                        safe_print(f"[DECOUPLED]: First media packet received from Plivo for call_id={call_id}")
                    elif media_count % 250 == 0:
                        safe_print(f"[DECOUPLED]: {media_count} media packets received from Plivo for call_id={call_id}")
                    payload = (data.get("media") or {}).get("payload") or data.get("payload")
                    if payload and isinstance(payload, str):
                        await stt_session.push_audio(payload)
                elif event_type == "stop":
                    safe_print(f"[DECOUPLED]: Plivo stream stop received for call_id={call_id} (total media packets: {media_count})")
                    break

        speech_stopped_at = None
        pending_transcript_buffer = ""
        TRAILING_HESITATIONS = ("एप्रोक्स", "लगभग", "और", "मतलब", "यानी", "around", "approx", "about", "and", "or", "लेकिन", "बट")

        async def stt_to_gemini():
            nonlocal speech_stopped_at, pending_transcript_buffer
            async for ev in stt_session.events():
                safe_print(f"[DECOUPLED STT EVENT]: {ev}")
                if ev["type"] == "speech_stopped":
                    speech_stopped_at = time.time()
                elif ev["type"] == "final":
                    txt = (ev.get("text") or "").strip()
                    if pending_transcript_buffer:
                        txt = f"{pending_transcript_buffer} {txt}".strip()
                        pending_transcript_buffer = ""
                    clean_trailing = txt.rstrip("।!?,. ").lower()
                    if clean_trailing.endswith(TRAILING_HESITATIONS):
                        safe_print(f"[DECOUPLED PAUSE BUFFER]: Customer ended on hesitation word ('{txt}'). Waiting for completion...")
                        pending_transcript_buffer = txt
                        await asyncio.sleep(0.7)
                        if pending_transcript_buffer == txt:
                            pending_transcript_buffer = ""
                        else:
                            continue
                    if speech_stopped_at is not None:
                        safe_print(f"[DECOUPLED LATENCY]: Sarvam final transcript {time.time() - speech_stopped_at:.2f}s after speech_stopped")
                    t = asyncio.create_task(handle_final_transcript(txt))
                    turn_tasks.add(t)
                    t.add_done_callback(turn_tasks.discard)
                elif ev["type"] == "error":
                    safe_print(f"[DECOUPLED ERROR]: Sarvam STT error for call_id={call_id}: {ev.get('message')}")
                    break
            safe_print(f"[DECOUPLED]: stt_to_gemini loop ended for call_id={call_id} (events() generator finished)")

        async def check_welcome_silence():
            nonlocal agent_speaking_until
            # Wait until the welcome message finishes playing + 5.0s buffer
            wait_for_finish = max(0.0, agent_speaking_until - time.time())
            await asyncio.sleep(wait_for_finish + 5.0)
            if len(transcript_parts) == 1 and not hangup_triggered:
                safe_print("[DECOUPLED]: User has been silent for 5.0s after welcome message finished. Prompting gently...")
                is_hindi = is_hindi_or_hinglish(welcome_text, system_prompt, call_lang)
                is_inbound = bool(ctx.get("is_inbound", False))
                cname = ctx.get("customer_name") or ""
                if is_inbound:
                    if is_hindi:
                        prompt_line = f"नमस्ते {cname} जी, क्या आप मुझे सुन पा रहे हैं? मैं आपकी किस तरह सहायता कर सकती हूँ?" if cname else "नमस्ते, क्या आप मुझे सुन पा रहे हैं? मैं आपकी किस तरह सहायता कर सकती हूँ?"
                    else:
                        prompt_line = f"Hi {cname}, are you able to hear me? How can I help you today?" if cname else "Hi, are you able to hear me? How can I help you today?"
                else:
                    if is_hindi:
                        prompt_line = f"नमस्ते {cname} जी, क्या आप मुझे सुन पा रहे हैं? क्या अभी 2 मिनट बात हो सकती है?" if cname else "नमस्ते, क्या आप मुझे सुन पा रहे हैं? क्या अभी 2 मिनट बात हो सकती है?"
                    else:
                        prompt_line = f"Hi {cname}, are you able to hear me? Is now a convenient time to chat?" if cname else "Hi, are you able to hear me? Is now a convenient time to chat?"
                async with turn_lock:
                    if len(transcript_parts) == 1 and not hangup_triggered:
                        transcript_parts.append(f"AI: {prompt_line}")
                        messages.append({"role": "assistant", "content": prompt_line})
                        dur = await _speak_and_forward(websocket, tts_session, prompt_line, cname, is_subsequent=True, language=call_lang)
                        agent_speaking_until = max(agent_speaking_until, time.time()) + dur + 0.3
                        await db.calls.update_one({"call_id": call_id}, {"$set": {"transcript": "\n".join(transcript_parts)}})

        welcome_silence_task = asyncio.create_task(check_welcome_silence())

        plivo_task = asyncio.create_task(plivo_to_stt())
        stt_task = asyncio.create_task(stt_to_gemini())
        done, pending = await asyncio.wait({plivo_task, stt_task}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        welcome_silence_task.cancel()

        # Let any turn that was already mid-flight (customer's last
        # utterance already transcribed, Gemini/TTS in progress) finish
        # speaking before the websocket gets closed below, instead of
        # racing it. Bounded wait so a genuinely stuck turn can't hang
        # shutdown forever.
        if turn_tasks:
            safe_print(f"[DECOUPLED]: Waiting for {len(turn_tasks)} in-flight turn(s) to finish before closing call_id={call_id}")
            await asyncio.wait(turn_tasks, timeout=15.0)

    except WebSocketDisconnect:
        safe_print(f"[DECOUPLED]: Client disconnected for call_id={call_id}")
    except Exception as e:
        safe_print(f"[DECOUPLED ERROR]: Unhandled exception for call_id={call_id}: {e}")
    finally:
        await tts_session.__aexit__(None, None, None)
        await stt_session.__aexit__(None, None, None)
        try:
            await openai_http_client.aclose()
        except Exception:
            pass
        try:
            await finalize_plivo_call(call_id, company_id=company_id, transcript_parts=transcript_parts)
        except Exception as e:
            safe_print(f"[DECOUPLED ERROR]: finalize_plivo_call failed for call_id={call_id}: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
