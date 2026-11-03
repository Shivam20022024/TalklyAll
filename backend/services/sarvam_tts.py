# Sarvam streaming TTS - opt-in replacement for OpenAI Realtime's own voice
# output. OpenAI's Realtime voice ("coral") has no Indian-accented option and
# no prompt instruction changes that (confirmed empirically - see the
# sarvam-tts-evaluation memory). Sarvam's bulbul:v4-flash model, tested live
# against the real API key, produces natural English/Hindi/Hinglish speech
# directly in mulaw/8kHz - Plivo's exact wire format - with ~0.25s to first
# audio chunk, so no transcode step and no added latency budget.
#
# One SarvamTTSSession is opened per call and reused for every AI turn
# (Sarvam's streaming socket is explicitly designed to take multiple
# conversions over one connection), closed when the call ends.

import logging
from typing import AsyncIterator, Optional

from sarvamai import AsyncSarvamAI

logger = logging.getLogger("talkly-sarvam-tts")

SARVAM_MODEL = "bulbul:v4-flash"

# Only the languages actually validated in the live evaluation. Anything else
# should fall back to OpenAI's native voice rather than guessing at an
# untested speaker/language pairing on a live call.
SARVAM_VOICE_MAP = {
    "en": {"speaker": "simran_en_conversation", "language_code": "en-IN"},
    "hi": {"speaker": "ishita_enhi_customer", "language_code": "hi-IN"},
}


def sarvam_voice_for(transcription_lang: Optional[str]) -> Optional[dict]:
    """Returns {"speaker", "language_code"} for a validated language code
    (as produced by plivo_routes.WHISPER_LANGUAGE_CODES), or None if this
    language hasn't been evaluated against Sarvam yet."""
    return SARVAM_VOICE_MAP.get((transcription_lang or "").strip().lower())


class SarvamTTSSession:
    """One Sarvam text-to-speech-streaming WebSocket connection for the
    lifetime of a single call."""

    def __init__(self, api_key: str, speaker: str, language_code: str):
        self._api_key = api_key
        self._speaker = speaker
        self._language_code = language_code
        self._client: Optional[AsyncSarvamAI] = None
        self._socket_cm = None
        self._socket = None

    async def __aenter__(self) -> "SarvamTTSSession":
        self._client = AsyncSarvamAI(api_subscription_key=self._api_key)
        self._socket_cm = self._client.text_to_speech_streaming.connect(
            model=SARVAM_MODEL,
            send_completion_event=True,
            api_subscription_key=self._api_key,
        )
        self._socket = await self._socket_cm.__aenter__()
        await self._socket.configure(
            target_language_code=self._language_code,
            speaker=self._speaker,
            pace=1.0,
            speech_sample_rate=8000,
            output_audio_codec="mulaw",
            enable_preprocessing=True,  # needed for mixed-language (Hinglish) text
            min_buffer_size=30,
            max_chunk_length=120,
        )
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._socket_cm is not None:
            try:
                await self._socket_cm.__aexit__(exc_type, exc, tb)
            except Exception:
                pass

    async def speak(self, text: str) -> AsyncIterator[str]:
        """Synthesize one chunk of AI speech, yielding base64 mulaw/8kHz
        audio chunks as Sarvam streams them back. Stops at the "final"
        completion event (or on error / malformed message, to avoid hanging
        the call on a stuck socket)."""
        text = (text or "").strip()
        if not text or self._socket is None:
            return
        await self._socket.convert(text)
        await self._socket.flush()
        while True:
            msg = await self._socket.recv()
            mtype = getattr(msg, "type", None)
            if mtype == "audio":
                audio_b64 = getattr(msg.data, "audio", None)
                if audio_b64:
                    yield audio_b64
            elif mtype == "event":
                if getattr(msg.data, "event_type", None) == "final":
                    return
            elif mtype == "error":
                logger.error(f"[SARVAM TTS ERROR]: {getattr(msg.data, 'message', msg)}")
                return
            else:
                return
