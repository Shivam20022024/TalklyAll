# Decoupled live-call pipeline: Sarvam STT -> Gemini (via OpenRouter) ->
# Bakbak TTS, replacing OpenAI Realtime's fused listen+reason+speak engine
# for companies with company.conversation_engine == "decoupled". OpenAI
# Realtime isn't used anywhere in this file.
#
# STAGE 1 ONLY, per the approved plan
# (C:\Users\Shivam kumar\.claude\plans\serene-inventing-mist.md): core loop
# only - no barge-in, no tool-calling, no goodbye-keyword auto-hangup yet.
# A test call ends when the caller hangs up or Plivo sends "stop". Those
# behaviors are deliberately staged in later passes so a failure in this
# first version is easy to isolate, not entangled with five new pieces of
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

from fastapi import WebSocket, WebSocketDisconnect

from services.bakbak_tts import BakbakTTSSession
from services.sarvam_stt import SarvamSTTSession
from services.gemini_chat import stream_gemini_reply
from routes.plivo_routes import safe_print, finalize_plivo_call, HALLUCINATION_PHRASES

logger = logging.getLogger("talkly-plivo-decoupled")

BAKBAK_API_KEY = os.environ.get("BAKBAK_API_KEY", "").strip()
SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY", "").strip()
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-3.8-flash")

# Sarvam STT's language_code is BCP-47 ("hi-IN"/"en-IN"); resolve_call_voice_context's
# transcription_lang is the short Whisper-style code ("hi"/"en"). Only the two
# languages actually validated this session map here.
STT_LANGUAGE_MAP = {"en": "en-IN", "hi": "hi-IN"}


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
    bakbak_voice_id = ctx.get("bakbak_voice_id")
    bakbak_language = ctx.get("bakbak_language")
    bakbak_model = ctx.get("bakbak_model")
    stt_language_code = STT_LANGUAGE_MAP.get(ctx.get("transcription_lang"), "hi-IN")

    if not (BAKBAK_API_KEY and bakbak_voice_id and OPENROUTER_API_KEY and SARVAM_API_KEY):
        safe_print(f"[DECOUPLED ERROR]: Missing required config for call_id={call_id} "
                    f"(bakbak_key={bool(BAKBAK_API_KEY)}, bakbak_voice={bool(bakbak_voice_id)}, "
                    f"openrouter_key={bool(OPENROUTER_API_KEY)}, sarvam_key={bool(SARVAM_API_KEY)}) - aborting call.")
        await websocket.close()
        return

    transcript_parts: list = []
    messages = [{"role": "system", "content": system_prompt}]

    tts_session = BakbakTTSSession(BAKBAK_API_KEY, bakbak_voice_id, bakbak_language, bakbak_model)
    stt_session = SarvamSTTSession(SARVAM_API_KEY, stt_language_code)

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

        async def handle_final_transcript(customer_text: str) -> None:
            customer_text = (customer_text or "").strip()
            if not customer_text or len(customer_text) <= 1:
                return
            if customer_text.lower() in HALLUCINATION_PHRASES:
                safe_print(f"[DECOUPLED]: Dropped likely hallucinated STT text: '{customer_text}'")
                return
            async with turn_lock:
                safe_print(f"[CUSTOMER SPEECH][DECOUPLED]: {customer_text}")
                transcript_parts.append(f"Customer: {customer_text}")
                await db.calls.update_one({"call_id": call_id}, {"$set": {"transcript": "\n".join(transcript_parts)}})
                messages.append({"role": "user", "content": customer_text})

                full_reply = ""
                async for delta in stream_gemini_reply(messages, OPENROUTER_API_KEY, OPENROUTER_MODEL):
                    full_reply += delta
                full_reply = full_reply.strip()
                if not full_reply:
                    safe_print(f"[DECOUPLED ERROR]: Gemini returned no text for call_id={call_id}")
                    return

                safe_print(f"[AI SPEECH][DECOUPLED]: {full_reply}")
                messages.append({"role": "assistant", "content": full_reply})
                transcript_parts.append(f"AI: {full_reply}")
                await db.calls.update_one({"call_id": call_id}, {"$set": {"transcript": "\n".join(transcript_parts)}})
                await _speak_and_forward(websocket, tts_session, full_reply)

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

        async def stt_to_gemini():
            async for ev in stt_session.events():
                if ev["type"] == "final":
                    asyncio.create_task(handle_final_transcript(ev["text"]))
                elif ev["type"] == "error":
                    safe_print(f"[DECOUPLED ERROR]: Sarvam STT error for call_id={call_id}: {ev.get('message')}")
                    break

        plivo_task = asyncio.create_task(plivo_to_stt())
        stt_task = asyncio.create_task(stt_to_gemini())
        done, pending = await asyncio.wait({plivo_task, stt_task}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()

    except WebSocketDisconnect:
        safe_print(f"[DECOUPLED]: Client disconnected for call_id={call_id}")
    except Exception as e:
        safe_print(f"[DECOUPLED ERROR]: Unhandled exception for call_id={call_id}: {e}")
    finally:
        await tts_session.__aexit__(None, None, None)
        await stt_session.__aexit__(None, None, None)
        try:
            await finalize_plivo_call(call_id, company_id=company_id, transcript_parts=transcript_parts)
        except Exception as e:
            safe_print(f"[DECOUPLED ERROR]: finalize_plivo_call failed for call_id={call_id}: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
