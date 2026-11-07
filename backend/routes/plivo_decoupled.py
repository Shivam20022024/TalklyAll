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

from services.bakbak_tts import BakbakTTSSession
from services.sarvam_tts import SarvamTTSSession
from services.sarvam_stt import SarvamSTTSession
from services.openai_chat import stream_openai_reply
from routes.plivo_routes import safe_print, finalize_plivo_call, HALLUCINATION_PHRASES, is_degenerate_transcript
from telephony.plivo_provider import PlivoProvider

# Same proven keyword list and dynamic delay formula as plivo_routes.py's
# trigger_auto_hangup (roughly 11 chars/sec of speech + 3.5s buffer,
# clamped 7-16s) - duplicated rather than imported because the original is
# a closure nested inside the OpenAI pipeline's function, not a standalone
# callable, and that working pipeline isn't being touched.
GOODBYE_KEYWORDS = [
    "अलविदा", "दिन शुभ हो", "बाय", "bye", "goodbye",
    "have a great day", "have a wonderful day", "have a good day",
    "take care", "बात करने के लिए धन्यवाद"
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
_SENTENCE_END_RE = re.compile(r"^(.*?[,.!?।])\s*")

# Decoupled-only addition, not part of the shared conversation_rules used by
# both pipelines - the OpenAI Realtime pipeline has no equivalent
# non-streaming-TTS bottleneck, so this instruction has nothing to fix
# there. Paired with the comma-inclusive _SENTENCE_END_RE above: this gives
# Bakbak a short, complete clause to synthesize first instead of a full
# sentence, so the caller hears something within roughly the time Bakbak
# takes to synthesize 2-4 words, not an entire reply.
DECOUPLED_FIRST_WORD_DIRECTIVE_EN = (
    "\n\nCRITICAL LOW-LATENCY DELIVERY & LANGUAGE (read this - it affects how fast the caller hears you): "
    "Begin every reply with an immediate, ultra-short 1-2 word English acknowledgment clause "
    "ending in a comma - e.g. 'Got it,', 'Sure,', 'I see,', 'Understood,', 'Great,' - "
    "before continuing with the rest of your actual response after the comma. "
    "This 1-2 word opener allows voice streaming to begin within 200ms without dead air. "
    "STRICT LANGUAGE ENFORCEMENT: You MUST converse 100% in English. Do NOT switch to Hindi "
    "or Hinglish unless the customer explicitly tells you to speak in Hindi. "
    "ABSOLUTE BAN ON REPEATING CUSTOMER NAME: You already greeted the customer by name in the opening message. "
    "Once the conversation is underway, NEVER say their name (neither first name nor full name) in your subsequent replies. "
    "NEVER say 'I see, Mohit,' or 'Got it, Mohit,' or 'You're welcome, Mohit!'. Strictly say 'I see,', 'Got it,', 'Sure,', 'You're welcome!'. "
    "Do not open with a long clause before the first comma, and do not skip the leading comma-terminated opener."
)

DECOUPLED_FIRST_WORD_DIRECTIVE_HI = (
    "\n\nCRITICAL LOW-LATENCY DELIVERY & LANGUAGE (read this - it affects how fast the caller hears you): "
    "Begin every reply with an immediate, ultra-short 1-2 word Hindi acknowledgment clause "
    "ending in a comma - e.g. 'ठीक है,', 'समझ गया,', 'जी,', 'अच्छा,' - "
    "before continuing with the rest of your actual response after the comma. "
    "This 1-2 word opener allows voice streaming to begin within 200ms without dead air. "
    "STRICT LANGUAGE ENFORCEMENT: You MUST converse in natural Hindi/Hinglish. "
    "Do NOT switch to English on short fillers unless the customer explicitly tells you to speak in English. "
    "ABSOLUTE BAN ON REPEATING CUSTOMER NAME: You already greeted the customer by name in the opening message. "
    "Once the conversation is underway, NEVER repeat or speak their name in your subsequent replies. "
    "NEVER say 'ठीक है, Mohit,' or 'समझ गया, Mohit,'. Strictly say 'ठीक है,', 'समझ गया,'. "
    "Do not open with a long clause before the first comma, and do not skip the leading comma-terminated opener."
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

            t0 = time.time()
            api_key = os.environ.get("BAKBAK_API_KEY", "").strip() or BAKBAK_API_KEY
            if api_key:
                v_id = v_id or "3fe4afbc-3bde-4c97-ab8e-37e3fb8c7ba2"
                v_lang = v_lang or ("hi" if bool(re.search(r"[ऀ-ॿ]", w_text or "")) else "en-in")
                session = BakbakTTSSession(api_key, v_id, v_lang, v_mod)
            elif SARVAM_API_KEY:
                is_hi = bool(re.search(r"[ऀ-ॿ]", w_text or ""))
                speaker = (ctx.get("sarvam_speaker") if ctx else None) or ("ishita_enhi_customer" if is_hi else "simran_en_conversation")
                lang = "hi-IN" if is_hi else "en-IN"
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


def clean_tts_text(text: str, customer_name: str = "", is_subsequent: bool = False) -> str:
    """
    Sanitize text before speech synthesis so TTS never pronounces formatting artifacts
    like 'underscore', 'asterisk', or placeholder leaks like 'customer_name'.
    On mid-call turns (is_subsequent=True), also strips repetitive customer name vocatives.
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
    if is_subsequent and customer_name:
        parts = [p.strip() for p in customer_name.split() if len(p.strip()) > 1]
        name_patterns = [re.escape(customer_name)] + [re.escape(p) for p in parts]
        for np in name_patterns:
            cleaned = re.sub(rf'(?i)\b(Got it|Sure|I see|Understood|Great|Alright|Okay|Thank you|You\'re welcome|Welcome|Thanks|No problem|Theek hai|Samajh gaya|Ji),?\s*{np}\b', r'\1', cleaned)
            cleaned = re.sub(rf'(?i),\s*{np}\b([.!?])', r'\1', cleaned)
            cleaned = re.sub(rf'(?i),\s*{np}\b,', ',', cleaned)
            cleaned = re.sub(rf'(?i)\b{np}\b([.!?])', r'\1', cleaned)
            cleaned = re.sub(rf'(?i)(^|[.!?]\s*){np},?\s*', r'\1', cleaned)

    # Collapse extra whitespace
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    if cleaned and cleaned[0].islower():
        cleaned = cleaned[0].upper() + cleaned[1:]
    return cleaned


async def _speak_and_forward(websocket: WebSocket, tts_session: Any, text: str, customer_name: str = "", is_subsequent: bool = False) -> float:
    """Synthesizes text via Sarvam/Bakbak streaming and forwards every resulting chunk to
    Plivo as a playAudio event - identical wire format to the existing
    sarvam_tts_worker in plivo_routes.py. Returns total audio duration in seconds."""
    text = clean_tts_text(text, customer_name, is_subsequent=is_subsequent)
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
    # Detect pipeline language strictly from whether welcome_text is in Hindi/Devanagari
    is_hindi_pipeline = bool(re.search(r"[ऀ-ॿ]", welcome_text or ""))
    directive = DECOUPLED_FIRST_WORD_DIRECTIVE_HI if is_hindi_pipeline else DECOUPLED_FIRST_WORD_DIRECTIVE_EN

    _sarvam_stt_lang_map = {"en": "en-IN", "hi": "hi-IN"}
    if is_hindi_pipeline:
        stt_language_code = _sarvam_stt_lang_map.get(ctx.get("transcription_lang"), "hi-IN")
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

        if prewarmed_result and prewarmed_result.get("chunks"):
            # FAST PATH: Play pre-synthesized audio chunks immediately (0ms delay!)
            t_play_start = time.time()
            welcome_duration = prewarmed_result["duration"]
            for audio_b64 in prewarmed_result["chunks"]:
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
                f"[DECOUPLED LATENCY]: Instant welcome audio sent {((time.time() - t_play_start)*1000):.1f}ms after stream connect! "
                f"(Audio duration: {welcome_duration:.2f}s)"
            )
        elif welcome_text:
            # Fallback path if not prewarmed: split greeting so first sentence plays as fast as possible
            safe_print(f"[DECOUPLED]: No prewarm found for call_id={call_id}, synthesizing on-the-fly...")
            sentences = [s.strip() for s in re.split(r'(?<=[।?!.])\s+', welcome_text) if s.strip()]
            if len(sentences) > 1:
                dur1 = await _speak_and_forward(websocket, tts_session, sentences[0])
                welcome_duration += dur1
                for rem in sentences[1:]:
                    dur_rem = await _speak_and_forward(websocket, tts_session, rem)
                    welcome_duration += dur_rem
            else:
                welcome_duration = await _speak_and_forward(websocket, tts_session, welcome_text)

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

        async def trigger_decoupled_hangup(delay_seconds: float) -> None:
            nonlocal hangup_triggered
            if hangup_triggered or len(transcript_parts) < 3:
                safe_print(f"[DECOUPLED AUTO HANGUP SHIELD]: Ignored (turns={len(transcript_parts)}, triggered={hangup_triggered}).")
                return
            hangup_triggered = True
            turns_at_trigger = len(transcript_parts)
            safe_print(f"[DECOUPLED AUTO HANGUP]: Scheduled in {delay_seconds:.1f}s (turns={turns_at_trigger}) unless the conversation genuinely continues...")

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
                    safe_print(f"[DECOUPLED AUTO HANGUP]: Cancelled - substantial customer continuation: '{substantial_continuation}'")
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
                    safe_print(f"[DECOUPLED AUTO HANGUP]: Plivo call {call_uuid} hung up successfully via REST API.")
                await websocket.close()
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
                if customer_text.lower() in HALLUCINATION_PHRASES or is_degenerate_transcript(customer_text):
                    safe_print(f"[DECOUPLED]: Dropped likely hallucinated/degenerate STT text: '{customer_text}'")
                    return

                # Only apply the pickup shield during the opening welcome message.
                # Mid-call turns must NEVER drop the customer's answer!
                now = time.time()
                is_welcome_turn = len(transcript_parts) <= 1
                if is_welcome_turn and now < agent_speaking_until:
                    safe_print(
                        f"[DECOUPLED PICKUP SHIELD]: Ignored speech while AI is still audibly speaking welcome line "
                        f"({agent_speaking_until - now:.2f}s remaining): '{customer_text}'"
                    )
                    return

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
                            if m and len(m.group(1).strip().split()) >= 1:
                                first_sentence_flushed = True
                                first_sentence_ready_at = time.time()
                                remainder_start = m.end()
                                first_sent_text = m.group(1).strip()
                                safe_print(f"[DECOUPLED LATENCY]: OpenAI first clause ready in {first_sentence_ready_at - turn_start:.2f}s: '{first_sent_text}'")
                                # Run TTS concurrently in background so OpenAI generation is not stalled
                                first_audio_task = asyncio.create_task(
                                    _speak_and_forward(websocket, tts_session, first_sent_text, customer_name, is_subsequent=True)
                                )

                    full_reply = full_reply.strip()
                    if not full_reply:
                        safe_print(f"[DECOUPLED ERROR]: OpenAI chat returned no text for call_id={call_id}")
                        if first_audio_task:
                            await first_audio_task
                        return

                    clean_full_reply = clean_tts_text(full_reply, customer_name, is_subsequent=True)
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
                            dur2 = await _speak_and_forward(websocket, tts_session, remaining_text, customer_name, is_subsequent=True)
                            agent_speaking_until = max(agent_speaking_until, time.time()) + dur2 + 0.1
                    else:
                        dur3 = await _speak_and_forward(websocket, tts_session, clean_full_reply, customer_name, is_subsequent=True)
                        agent_speaking_until = max(agent_speaking_until, time.time()) + dur3 + 0.1

                    reply_lower = clean_full_reply.lower()
                    if (len(transcript_parts) - 1) >= 3 and any(kw in reply_lower for kw in GOODBYE_KEYWORDS):
                        chars = len(full_reply.strip())
                        delay = max(7.0, min((chars / 11.0) + 3.5, 16.0))
                        safe_print(f"[DECOUPLED AUTO HANGUP]: Goodbye detected in AI speech. Allowing full sentence to complete ({delay:.1f}s)...")
                        t = asyncio.create_task(trigger_decoupled_hangup(delay))
                        turn_tasks.add(t)
                        t.add_done_callback(turn_tasks.discard)
            except Exception:
                import traceback
                safe_print(f"[DECOUPLED ERROR]: handle_final_transcript crashed for call_id={call_id}:\n{traceback.format_exc()}")

        async def plivo_to_stt():
            while True:
                raw_msg = await websocket.receive_text()
                data = json.loads(raw_msg)
                event_type = data.get("event")
                if event_type == "media":
                    payload = (data.get("media") or {}).get("payload") or data.get("payload")
                    if payload and isinstance(payload, str):
                        await stt_session.push_audio(payload)
                elif event_type == "stop":
                    safe_print(f"[DECOUPLED]: Plivo stream stop received for call_id={call_id}")
                    break

        speech_stopped_at = None

        async def stt_to_gemini():
            nonlocal speech_stopped_at
            async for ev in stt_session.events():
                safe_print(f"[DECOUPLED STT EVENT]: {ev}")
                if ev["type"] == "speech_stopped":
                    speech_stopped_at = time.time()
                elif ev["type"] == "final":
                    if speech_stopped_at is not None:
                        safe_print(f"[DECOUPLED LATENCY]: Sarvam final transcript {time.time() - speech_stopped_at:.2f}s after speech_stopped")
                    t = asyncio.create_task(handle_final_transcript(ev["text"]))
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
                is_hindi = bool(re.search(r"[ऀ-ॿ]", welcome_text or ""))
                cname = ctx.get("customer_name") or ""
                if is_hindi:
                    prompt_line = f"नमस्ते {cname} जी, क्या आप मुझे सुन पा रहे हैं? क्या अभी 2 मिनट बात हो सकती है?" if cname else "नमस्ते, क्या आप मुझे सुन पा रहे हैं? क्या अभी 2 मिनट बात हो सकती है?"
                else:
                    prompt_line = f"Hi {cname}, are you able to hear me? Is now a convenient time to chat?" if cname else "Hi, are you able to hear me? Is now a convenient time to chat?"
                async with turn_lock:
                    if len(transcript_parts) == 1 and not hangup_triggered:
                        transcript_parts.append(f"AI: {prompt_line}")
                        messages.append({"role": "assistant", "content": prompt_line})
                        dur = await _speak_and_forward(websocket, tts_session, prompt_line, cname)
                        agent_speaking_until = max(agent_speaking_until, time.time()) + dur + 0.3
                        await db.calls.update_one({"call_id": call_id}, {"$set": {"transcript": "\n".join(transcript_parts)}})

        welcome_silence_task = asyncio.create_task(check_welcome_silence())
        turn_tasks.add(welcome_silence_task)
        welcome_silence_task.add_done_callback(turn_tasks.discard)

        plivo_task = asyncio.create_task(plivo_to_stt())
        stt_task = asyncio.create_task(stt_to_gemini())
        done, pending = await asyncio.wait({plivo_task, stt_task}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()

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
