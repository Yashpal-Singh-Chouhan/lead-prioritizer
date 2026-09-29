"""The ONLY place the backend talks to the AI (Groq's OpenAI-compatible API)."""
import json

import httpx

from .config import GROQ_API_KEY, GROQ_API_URL, GROQ_MODEL


class AIError(Exception):
    """A readable error we can show to the salesperson."""


def call_ai(messages: list[dict], want_json: bool = False) -> str:
    if not GROQ_API_KEY:
        raise AIError("GROQ_API_KEY is missing on the server.")

    body: dict = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.2 if want_json else 0.6,  # low = consistent analysis, higher = natural chat
    }
    if want_json:
        body["response_format"] = {"type": "json_object"}
    if GROQ_MODEL.startswith("openai/gpt-oss"):
        body["reasoning_effort"] = "low"  # faster answers

    try:
        res = httpx.post(
            GROQ_API_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json=body,
            timeout=60,
        )
    except httpx.HTTPError as exc:
        raise AIError(f"Could not reach the AI service: {exc.__class__.__name__}") from exc

    if res.status_code == 429:
        raise AIError("The AI is busy (free-tier rate limit). Wait a few seconds and try again.")
    if res.status_code == 400 and "json_validate_failed" in res.text:
        raise AIError("The AI response was not valid JSON. Please try again.")
    if res.status_code >= 400:
        raise AIError(f"AI request failed ({res.status_code}): {res.text[:200]}")

    text = (res.json().get("choices") or [{}])[0].get("message", {}).get("content")
    if not text:
        raise AIError("The AI returned an empty response. Please try again.")
    return text


def parse_json(text: str) -> dict:
    """AI models sometimes wrap JSON in extra text. This safely pulls out the {...} part."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
    raise AIError("The AI response was not valid JSON. Please try again.")


def call_ai_json(messages: list[dict]) -> dict:
    """Structured call: asks for JSON and retries once if the model returns something unparseable."""
    try:
        return parse_json(call_ai(messages, want_json=True))
    except AIError as exc:
        if "not valid JSON" not in str(exc):
            raise
        return parse_json(call_ai(messages, want_json=True))
