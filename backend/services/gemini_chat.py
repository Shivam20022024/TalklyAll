# Streaming Gemini-via-OpenRouter chat completions - the "reasoning" leg of
# the decoupled Sarvam STT -> Gemini -> Bakbak TTS pipeline. This is a new
# streaming/multi-turn use of the same OpenRouter endpoint process_audio.py
# already calls for one-shot, non-streaming post-call analysis - reuses the
# same URL/auth/model convention, but this is genuinely new, untested
# integration surface (streaming + a real conversation history) for this
# codebase.

import json
import logging
from typing import AsyncIterator

import httpx

logger = logging.getLogger("talkly-gemini-chat")

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"


async def stream_gemini_reply(messages: list, api_key: str, model: str) -> AsyncIterator[str]:
    """Streams one Gemini reply given a full message history
    ([{"role": "system"|"user"|"assistant", "content": str}, ...]), yielding
    text deltas as they arrive. Fail-open: logs and stops yielding on any
    error, same philosophy as SarvamTTSSession/BakbakTTSSession, so a bad
    response never hangs the call."""
    if not messages or not api_key:
        return
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream("POST", OPENROUTER_API_URL, headers=headers, json=payload) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    logger.error(f"[GEMINI ERROR]: {resp.status_code} - {body[:300]}")
                    return
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data_str = line[len("data:"):].strip()
                    if not data_str or data_str == "[DONE]":
                        continue
                    try:
                        chunk = json.loads(data_str)
                    except Exception:
                        continue
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta") or {}
                    content = delta.get("content")
                    if content:
                        yield content
    except Exception as e:
        logger.error(f"[GEMINI ERROR]: {e}")
        return
