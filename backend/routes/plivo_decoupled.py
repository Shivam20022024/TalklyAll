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

from fastapi import WebSocket, WebSocketDisconnect
import httpx

from services.bakbak_tts import BakbakTTSSession
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
DECOUPLED_FIRST_WORD_DIRECTIVE = (
    "\n\nRESPONSE DELIVERY (read this - it affects how fast the caller hears you): "
    "Begin every reply with a short, natural 1-4 word acknowledgment or filler clause "
    "ending in a comma - e.g. 'ठीक है,', 'समझ गया,', 'अच्छा,', 'Got it,', 'Sure,', "
    "'I see,' - matching whichever language you're already using, before continuing "
    "with the rest of your actual response after the comma. This is not optional "
    "styling - it is a real technical requirement of this call's voice pipeline, "
    "which starts synthesizing speech from the text up to your first comma before "
    "your full sentence is even finished. Do not open with a long clause before the "
    "first comma, and do not skip the leading comma-terminated opener."
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


async def _speak_and_forward(websocket: WebSocket, tts_session: BakbakTTSSession, text: str) -> None:
    """Synthesizes text via Bakbak and forwards every resulting chunk to
    Plivo as a playAudio event - identical wire format to the existing
    sarvam_tts_worker in plivo_routes.py."""
    text = (text or "").strip()
    if not text:
        return
    try:
        async for audio_b64 in tts_session.speak(text):
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


async def run_decoupled_pipeline(websocket: WebSocket, call_id: str, company_id: str, db, ctx: dict) -> None:
    """ctx is resolve_call_voice_context()'s return dict - the caller
    resolves it once, same as the OpenAI path does, so this function doesn't
    duplicate that DB-heavy lookup."""
    system_prompt = ctx["system_prompt"]
    welcome_text = ctx["welcome_text"]
    company = ctx.get("company")
    bakbak_voice_id = ctx.get("bakbak_voice_id")
    bakbak_language = ctx.get("bakbak_language")
    bakbak_model = ctx.get("bakbak_model")
    stt_language_code = "auto"
    hangup_triggered = False

    if not (BAKBAK_API_KEY and bakbak_voice_id and OPENAI_CHAT_API_KEY and SARVAM_API_KEY):
        safe_print(f"[DECOUPLED ERROR]: Missing required config for call_id={call_id} "
                    f"(bakbak_key={bool(BAKBAK_API_KEY)}, bakbak_voice={bool(bakbak_voice_id)}, "
                    f"openai_key={bool(OPENAI_CHAT_API_KEY)}, sarvam_key={bool(SARVAM_API_KEY)}) - aborting call.")
        await websocket.close()
        return

    transcript_parts: list = []
    messages = [{"role": "system", "content": system_prompt + DECOUPLED_FIRST_WORD_DIRECTIVE}]

    tts_session = BakbakTTSSession(BAKBAK_API_KEY, bakbak_voice_id, bakbak_language, bakbak_model)
    stt_session = SarvamSTTSession(SARVAM_API_KEY, stt_language_code)
    # One shared connection for every OpenAI turn this call makes, instead
    # of a fresh TCP/TLS handshake per turn - measured live as real,
    # avoidable overhead on top of actual generation time.
    openai_http_client = httpx.AsyncClient(timeout=30.0)

    await tts_session.__aenter__()
    await stt_session.__aenter__()
    safe_print(f"[DECOUPLED]: Sarvam STT + Bakbak TTS sessions open for call_id={call_id} (lang={stt_language_code})")

    try:
        # Greeting - no OpenAI native-audio fast path anymore, this is the
        # known latency trade-off flagged in the plan (Bakbak is non-streaming,
        # so there's a full round trip before the first word plays).
        if welcome_text:
            await _speak_and_forward(websocket, tts_session, welcome_text)
            transcript_parts.append(f"AI: {welcome_text}")
            await db.calls.update_one({"call_id": call_id}, {"$set": {"transcript": "\n".join(transcript_parts)}})
            messages.append({"role": "assistant", "content": welcome_text})

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

        async def handle_final_transcript(customer_text: str) -> None:
            try:
                customer_text = (customer_text or "").strip()
                if not customer_text or len(customer_text) <= 1:
                    return
                if customer_text.lower() in HALLUCINATION_PHRASES or is_degenerate_transcript(customer_text):
                    safe_print(f"[DECOUPLED]: Dropped likely hallucinated/degenerate STT text: '{customer_text}'")
                    return
                async with turn_lock:
                    turn_start = time.time()
                    safe_print(f"[CUSTOMER SPEECH][DECOUPLED]: {customer_text}")
                    transcript_parts.append(f"Customer: {customer_text}")
                    await db.calls.update_one({"call_id": call_id}, {"$set": {"transcript": "\n".join(transcript_parts)}})
                    messages.append({"role": "user", "content": customer_text})

                    # Flush the first completed sentence to Bakbak as soon as
                    # the streamed text reaches a sentence boundary, instead
                    # of waiting for the entire (possibly multi-sentence)
                    # reply - this is what actually uses the streaming the
                    # OpenAI call already requests.
                    full_reply = ""
                    first_sentence_flushed = False
                    remainder_start = 0
                    first_sentence_ready_at = None
                    async for delta in stream_openai_reply(messages, OPENAI_CHAT_API_KEY, OPENAI_CHAT_MODEL, client=openai_http_client):
                        full_reply += delta
                        if not first_sentence_flushed:
                            m = _SENTENCE_END_RE.match(full_reply)
                            if m:
                                first_sentence_flushed = True
                                first_sentence_ready_at = time.time()
                                remainder_start = m.end()
                                safe_print(f"[DECOUPLED LATENCY]: OpenAI first sentence ready in {first_sentence_ready_at - turn_start:.2f}s")
                                await _speak_and_forward(websocket, tts_session, m.group(1).strip())
                                safe_print(f"[DECOUPLED LATENCY]: Bakbak first-sentence audio sent, {time.time() - first_sentence_ready_at:.2f}s after text was ready ({time.time() - turn_start:.2f}s total)")
                    full_reply = full_reply.strip()
                    if not full_reply:
                        safe_print(f"[DECOUPLED ERROR]: OpenAI chat returned no text for call_id={call_id}")
                        return

                    safe_print(f"[AI SPEECH][DECOUPLED]: {full_reply}")
                    messages.append({"role": "assistant", "content": full_reply})
                    transcript_parts.append(f"AI: {full_reply}")
                    await db.calls.update_one({"call_id": call_id}, {"$set": {"transcript": "\n".join(transcript_parts)}})
                    if first_sentence_flushed:
                        remaining_text = full_reply[remainder_start:].strip()
                        if remaining_text:
                            await _speak_and_forward(websocket, tts_session, remaining_text)
                    else:
                        await _speak_and_forward(websocket, tts_session, full_reply)

                    reply_lower = full_reply.lower()
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
