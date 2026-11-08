# relay/dropbox.py: convenience mode drop boxes. The relay keeps only ciphertext; plaintext never outlives the request.
import base64
import hmac
import os
import secrets
import threading
import time
from typing import Annotated, Literal

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from flask import Blueprint, request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, model_validator

BOXES: dict[str, dict] = {}            # box_id -> {"pub", "write", "read", "drop", "exp"}; RAM only
_LOCK = threading.Lock()
TTL = 24 * 3600
MAX_DROP = 128 * 1024                   # ~3 h of workout-rate heart rate as JSON
DAY3 = 3 * 86400

bp = Blueprint("dropbox", __name__)


# ---- payload the Shortcut sends (times are seconds before sending; no dates, names, devices or GPS) ----
class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Sample(_Strict):
    t_s: int = Field(ge=0, le=DAY3)
    v: float = Field(ge=0, le=1000)


SyncSport = Literal["squash", "running", "walking", "cycling", "strength", "hiit", "other"]


class Mark(_Strict):
    """A workout type the Watch recorded at workout start (from the 'workout starts' automation)."""
    sport: SyncSport
    t_s: int = Field(ge=0, le=10_000_000)          # seconds before sending; old marks are ignored by the phone


IsoTime = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$", max_length=40)]
Bpm = Annotated[float, Field(ge=20, le=300)]                 # a real heart rate; catches per-minute sums


class SyncWorkout(_Strict):
    sport: SyncSport
    start_s: int = Field(ge=0, le=DAY3)
    end_s: int = Field(ge=0, le=DAY3)
    kcal: float | None = Field(default=None, ge=0, le=10000)
    src: Literal["watch", "garmin", "other"] = "watch"
    hr: list[Sample] = Field(default_factory=list, max_length=4000)
    # List format (no per-reading loop in Shortcuts): parallel lists of ISO 8601 times and heart rates.
    hr_t: list[IsoTime] = Field(default_factory=list, max_length=4000)
    hr_v: list[Bpm] = Field(default_factory=list, max_length=4000)

    @model_validator(mode="after")
    def _same_length(self):
        if len(self.hr_t) != len(self.hr_v):
            raise ValueError("hr_t and hr_v differ in length")
        return self


class SyncDrop(_Strict):
    v: Literal[1]
    workouts: list[SyncWorkout] = Field(default_factory=list, max_length=20)
    rhr: list[Sample] = Field(default_factory=list, max_length=50)
    hrv: list[Sample] = Field(default_factory=list, max_length=200)
    effort: list[Sample] = Field(default_factory=list, max_length=50)
    marks: list[Mark] = Field(default_factory=list, max_length=20)


def seal(pub_spki_der: bytes, plaintext: bytes) -> dict:
    key, nonce = AESGCM.generate_key(bit_length=256), os.urandom(12)
    pub = serialization.load_der_public_key(pub_spki_der)
    wrapped = pub.encrypt(key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                                            algorithm=hashes.SHA256(), label=None))
    b64 = lambda b: base64.b64encode(b).decode()
    return {"key": b64(wrapped), "nonce": b64(nonce), "ct": b64(AESGCM(key).encrypt(nonce, plaintext, None))}


def _err(code: int):
    from app import generic                          # one generic body for every error
    return generic(code)


def _purge(now: float):
    for b, box in list(BOXES.items()):
        if box["drop"] and box["drop"]["at"] + TTL < now:
            box["drop"] = None


def _secret_ok(box: dict, which: str) -> bool:
    given = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    return bool(given) and hmac.compare_digest(given.encode(), box[which].encode())


@bp.post("/v1/box")
def create_box():
    from app import BOX_LIMIT
    if not BOX_LIMIT.allow():
        return _err(429)
    try:
        body = request.get_json(force=True, silent=True) or {}
        der = base64.b64decode(body.get("pub", ""), validate=True)
        pub = serialization.load_der_public_key(der)
        if set(body) != {"pub"} or not isinstance(pub, rsa.RSAPublicKey) or pub.key_size < 2048:
            return _err(422)
    except Exception:
        return _err(422)
    box_id = secrets.token_urlsafe(16)
    with _LOCK:
        BOXES[box_id] = {"pub": der, "write": secrets.token_urlsafe(24), "read": secrets.token_urlsafe(24), "drop": None}
        return {"box": box_id, "write": BOXES[box_id]["write"], "read": BOXES[box_id]["read"]}


@bp.post("/v1/drop/<box_id>")
def post_drop(box_id: str):
    if (request.content_length or 0) > MAX_DROP:
        return _err(413)
    with _LOCK:
        _purge(time.monotonic())
        box = BOXES.get(box_id)
        if box is None:
            return _err(404)
        if not _secret_ok(box, "write"):
            return _err(403)
        if box["drop"] is not None:
            return _err(409)
        raw = request.get_data(cache=False)
        if len(raw) > MAX_DROP:
            return _err(413)
        try:
            SyncDrop.model_validate_json(raw)            # never echo or log the error: it contains input
        except ValidationError:
            return _err(422)
        box["drop"] = {**seal(box["pub"], raw), "at": time.monotonic()}
        del raw
    return "", 204


@bp.get("/v1/drop/<box_id>")
def get_drop(box_id: str):
    with _LOCK:
        now = time.monotonic()
        _purge(now)
        box = BOXES.get(box_id)
        if box is None:
            return _err(404)
        if not _secret_ok(box, "read"):
            return _err(403)
        drop, box["drop"] = box["drop"], None
    if drop is None:
        return _err(404)
    return {"key": drop["key"], "nonce": drop["nonce"], "ct": drop["ct"], "age_s": int(now - drop["at"])}


@bp.delete("/v1/box/<box_id>")
def delete_box(box_id: str):
    with _LOCK:
        box = BOXES.get(box_id)
        if box is None:
            return _err(404)
        if not _secret_ok(box, "read"):
            return _err(403)
        del BOXES[box_id]
    return "", 204
