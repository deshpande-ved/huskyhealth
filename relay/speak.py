# relay/speak.py: "hear today's call", spoken by Gradium. The only thing that leaves is one short passage of brief
# text the browser wrote from your numbers; it goes through the egress proxy (mitmweb shows exactly that body).
# Nothing is stored or logged. Audio and word timings come back for highlighting as each word is spoken.
import base64
import json
import os
import re
import struct
import urllib.error
import urllib.request

from flask import Blueprint, request

bp = Blueprint("speak", __name__)

GRADIUM_BASE = os.environ.get("GRADIUM_BASE_URL", "https://api.gradium.ai") + "/api/post/speech/tts"
DEFAULT_VOICE = "YTpq7expH9539ERJ"          # a Gradium library voice; GRADIUM_VOICE_ID (a consenting coach's clone) wins
MAX_TEXT = 600
RATE = 24_000                                # pcm_24000: 16-bit mono PCM; the relay adds the WAV header
# Privacy rule: brief text only. Letters, digits, spaces and plain punctuation; no @ (emails), no URLs,
# no runs of 5+ digits (phone numbers, dates, ids). Anything else is refused before it can leave.
ALLOWED = re.compile(r"^[A-Za-z0-9 .,;:%'()/\-’–—]+$")
SUSPECT = re.compile(r"\d{5,}|https?|www\.", re.I)


def _err(code: int, retry_after: int | None = None):
    from app import generic
    return generic(code, retry_after)


def allowed_text(text) -> bool:
    return isinstance(text, str) and 0 < len(text) <= MAX_TEXT and bool(ALLOWED.match(text)) and not SUSPECT.search(text)


def wav(pcm: bytes, rate: int = RATE) -> bytes:
    """A 16-bit mono WAV around raw PCM, sizes filled in (streamed chunks have no reliable header)."""
    return b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16) \
        + b"data" + struct.pack("<I", len(pcm)) + pcm


def synthesize(text: str, key: str, voice: str) -> tuple[bytes, list[dict]]:
    """Gradium TTS as a JSON stream: audio chunks plus per-word timings. Returns (pcm bytes, words)."""
    body = json.dumps({"text": text, "voice_id": voice, "output_format": "pcm_24000", "only_audio": False}).encode()
    req = urllib.request.Request(GRADIUM_BASE, data=body, method="POST",
                                 headers={"x-api-key": key, "Content-Type": "application/json"})
    pcm, words = bytearray(), []
    with urllib.request.urlopen(req, timeout=25) as resp:
        for line in resp:
            line = line.strip()
            if not line:
                continue
            msg = json.loads(line)
            if msg.get("type") == "audio":
                pcm += base64.b64decode(msg["audio"])
            elif msg.get("type") == "text" and "start_s" in msg:
                words.append({"text": str(msg.get("text", ""))[:64], "start_s": float(msg["start_s"]), "stop_s": float(msg.get("stop_s", msg["start_s"]))})
            elif msg.get("type") == "error":
                raise RuntimeError("gradium error")
    return bytes(pcm), words


@bp.post("/v1/speak")
def speak():
    import accounts
    from app import SPEAK_PER_SESSION
    aid, err = accounts.require_session()                # an account session: the public cannot spend the credits
    if err:
        return err
    wait = SPEAK_PER_SESSION.check(aid)
    if wait:
        return _err(429, wait)
    body = request.get_json(silent=True)
    text = body.get("text") if isinstance(body, dict) and set(body) == {"text"} else None
    if not allowed_text(text):
        return _err(422)
    key = os.environ.get("GRADIUM_API_KEY", "")
    if not key:
        return {"error": "speech is not set up", "status": 503}, 503
    try:
        pcm, words = synthesize(text, key, os.environ.get("GRADIUM_VOICE_ID") or DEFAULT_VOICE)
    except (urllib.error.URLError, OSError, ValueError, RuntimeError, KeyError):
        return {"error": "speech is unavailable", "status": 502}, 502
    if not pcm:
        return {"error": "speech is unavailable", "status": 502}, 502
    return {"audio": base64.b64encode(wav(pcm)).decode(), "mime": "audio/wav", "words": words}
