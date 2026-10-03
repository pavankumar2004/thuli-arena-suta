"""Minimal OpenRouter client: chat completions that must return one JSON object."""

import base64
import io
import json
import os
import re
import time
from pathlib import Path

import requests

URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = os.environ.get("FORYOU_MODEL", "anthropic/claude-sonnet-5.5")


class LLMError(Exception):
    pass


def url_part(url: str) -> dict:
    return {"type": "image_url", "image_url": {"url": url}}


def image_part(path: Path, max_side: int = 512) -> dict:
    """A downscaled JPEG as a data URL: enough to read an outfit, cheap in tokens."""
    from PIL import Image

    im = Image.open(path).convert("RGB")
    im.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=80)
    data = base64.b64encode(buf.getvalue()).decode()
    return {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{data}"}}


def _parse_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise LLMError("model did not return JSON")
    return json.loads(text[start:end + 1])


def complete_json(system: str, content: list[dict], max_tokens: int = 2500,
                  timeout: float = 90, model: str | None = None) -> tuple[dict, dict]:
    """Return (parsed JSON, usage). Token use is capped; one retry on bad JSON."""
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise LLMError("OPENROUTER_API_KEY is not set (put it in .env)")
    body = {"model": model or MODEL, "max_tokens": max_tokens, "temperature": 0.4,
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": content}],
            "usage": {"include": True}}
    last_error = None
    for _ in range(2):
        started = time.monotonic()
        resp = requests.post(URL, json=body, timeout=timeout,
                             headers={"Authorization": f"Bearer {key}",
                                      "X-Title": "Thuli Arena Suta"})
        if resp.status_code != 200:
            raise LLMError(f"OpenRouter HTTP {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        usage = {**(data.get("usage") or {}), "seconds": round(time.monotonic() - started, 1),
                 "model": data.get("model", model or MODEL)}
        try:
            return _parse_json(data["choices"][0]["message"]["content"]), usage
        except (ValueError, LLMError, KeyError) as exc:
            last_error = exc
    raise LLMError(f"unparseable model output: {last_error}")
