# Bakbak (Raya/LitWiz Labs) TTS - second opt-in voice engine, evaluated as a
# cheaper alternative to Sarvam (~5x less per character on paper). Confirmed
# empirically against the live API: the non-streaming /v1/text-to-speech
# endpoint genuinely honors codec=mulaw + sample_rate=8000 and returns
# ready-to-play Plivo-compatible bytes with no transcoding needed. The
# streaming endpoint was NOT used here - it always returns base64 32-bit
# float PCM regardless of the codec/sample_rate requested, with no documented
# sample rate, which would need a real conversion/resampling pipeline before
# it could be trusted on a live call. That's a possible later upgrade, not
# this one.
#
# Trade-off vs Sarvam: this session waits for each full sentence to
# synthesize before returning anything (no incremental streaming), so a turn
# using Bakbak will have more dead air before the agent starts speaking than
# the same turn would with Sarvam.

import base64
import logging
from typing import AsyncIterator, Optional

import httpx

logger = logging.getLogger("talkly-bakbak-tts")

BAKBAK_TTS_URL = "https://hub.getraya.app/v1/text-to-speech"

# Only pairings actually tested live against the real API (Anjura M1 - the
# voice explicitly marketed as "works best for Hindi, English, and
# Hinglish" - confirmed 200 OK + correctly-sized mulaw/8kHz audio for both
# hi and en-in). "hinglish" isn't a separate key here because
# plivo_routes.WHISPER_LANGUAGE_CODES already aliases it to "hi" before
# this map is consulted. Mirrors sarvam_tts.py's SARVAM_VOICE_MAP
# philosophy: never guess at an untested voice/language pairing on a live
# call - every other language still falls back to Sarvam/OpenAI.
BAKBAK_VOICE_MAP = {
    "hi": {"voice_id": "3fe4afbc-3bde-4c97-ab8e-37e3fb8c7ba2", "language": "hi", "model": "m1"},
    "en": {"voice_id": "3fe4afbc-3bde-4c97-ab8e-37e3fb8c7ba2", "language": "en-in", "model": "m1"},
}


def bakbak_voice_for(transcription_lang: Optional[str]) -> dict:
    """Returns {"voice_id", "language", "model"} for Raya / Bakbak TTS.
    Defaults to Anjura M1 so voice is ALWAYS available."""
    lang = (transcription_lang or "").strip().lower()
    if lang.startswith("hi"):
        return BAKBAK_VOICE_MAP["hi"]
    return BAKBAK_VOICE_MAP["en"]


class BakbakTTSSession:
    """Same speak() contract as SarvamTTSSession so it's a drop-in
    alternative in plivo_routes.py's TTS worker - one HTTP call per
    speak(text), yielding the single resulting base64 mulaw/8kHz payload."""

    def __init__(self, api_key: str, voice_id: str, language: str, model: str = "m1"):
        self._api_key = api_key
        self._voice_id = voice_id
        self._language = language
        self._model = model
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "BakbakTTSSession":
        self._client = httpx.AsyncClient(
            timeout=20.0,
            limits=httpx.Limits(max_keepalive_connections=10, keepalive_expiry=120.0)
        )
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            except Exception:
                pass

    async def speak(self, text: str) -> AsyncIterator[str]:
        """Synthesize one chunk of AI speech and yield it as a single
        base64 mulaw/8kHz chunk. Logs and returns nothing on any failure,
        same fail-open behavior as SarvamTTSSession, to avoid hanging the
        call on a bad response."""
        text = (text or "").strip()
        if not text or self._client is None:
            return
        try:
            resp = await self._client.post(
                BAKBAK_TTS_URL,
                headers={"X-API-Key": self._api_key, "Content-Type": "application/json"},
                json={
                    "text": text,
                    "voice_id": self._voice_id,
                    "language": self._language,
                    "model": self._model,
                    "codec": "mulaw",
                    "sample_rate": 8000,
                    "speed": 1.0,
                },
            )
            if resp.status_code != 200:
                logger.error(f"[BAKBAK TTS ERROR]: {resp.status_code} - {resp.text[:300]}")
                return
            yield base64.b64encode(resp.content).decode("ascii")
        except Exception as e:
            logger.error(f"[BAKBAK TTS ERROR]: {e}")
            return
