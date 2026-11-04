# Streaming OpenAI chat completions - the "reasoning" leg of the decoupled
# Sarvam STT -> OpenAI -> Bakbak TTS pipeline. Originally built against
# OpenRouter/Gemini, swapped to OpenAI's own standard (non-Realtime) chat
# completions endpoint after OpenRouter's account turned out to have no
# purchased credits - OPENAI_API_KEY is already funded and working
# everywhere else in this codebase (Whisper, post-call analysis, the
# Realtime pipeline), so this avoids needing a second paid account. This is
# NOT the expensive Realtime audio API - it's the plain text
# chat-completions endpoint, so none of OpenAI Realtime's audio-token
# pricing applies here.

import json
import logging
from typing import AsyncIterator

import httpx

logger = logging.getLogger("talkly-openai-chat")

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"


async def stream_openai_reply(messages: list, api_key: str, model: str) -> AsyncIterator[str]:
    """Streams one reply given a full message history
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
            async with client.stream("POST", OPENAI_CHAT_URL, headers=headers, json=payload) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    logger.error(f"[OPENAI CHAT ERROR]: {resp.status_code} - {body[:300]}")
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
        logger.error(f"[OPENAI CHAT ERROR]: {e}")
        return
