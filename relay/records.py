# relay/records.py: the zero-knowledge personal API. Any device POSTs health records with a write token; the relay
# validates each one, seals it to the account's public key in memory, and stores only the ciphertext. Reading needs
# the account's private key, which lives inside the password-encrypted vault: the Pi can never read a record.
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Annotated, Literal

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from flask import Blueprint, request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, model_validator

MAX_RECORD = 128 * 1024                 # ~3 h of workout-rate heart rate as JSON
MAX_INBOX = 400                         # records kept per account; the oldest are dropped first
WINDOW = 61 * 86400                     # records may reach back 61 days (the app backfills 60 on first login)

bp = Blueprint("records", __name__)


# ---- one record (times are seconds before sending; no dates, names, devices or GPS) ----
class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Sample(_Strict):
    t_s: int = Field(ge=0, le=WINDOW)
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
    start_s: int = Field(ge=0, le=WINDOW)
    end_s: int = Field(ge=0, le=WINDOW)
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
    rhr: list[Sample] = Field(default_factory=list, max_length=120)
    hrv: list[Sample] = Field(default_factory=list, max_length=400)
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


def load_pub(b64: str):
    """DER SPKI (base64) -> RSA public key of at least 2048 bits, else None."""
    try:
        der = base64.b64decode(b64, validate=True)
        pub = serialization.load_der_public_key(der)
        return der if isinstance(pub, rsa.RSAPublicKey) and pub.key_size >= 2048 else None
    except Exception:
        return None


def _inbox_path(aid: str) -> str:
    import accounts
    return os.path.join(accounts.VAULT_DIR, f"{aid}.inbox.json")


def read_inbox(aid: str) -> list:
    try:
        with open(_inbox_path(aid), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return []


def write_inbox(aid: str, items: list) -> None:
    import accounts
    os.makedirs(accounts.VAULT_DIR, exist_ok=True)
    tmp = _inbox_path(aid) + f".{secrets.token_hex(4)}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(items, f)
    os.replace(tmp, _inbox_path(aid))


def _writer():
    """Account id for a valid write token (hhw_<account id>_<secret>), else None. Only a hash of the secret is stored."""
    import accounts
    tok = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    parts = tok.split("_", 2)
    if len(parts) != 3 or parts[0] != "hhw" or not accounts.ID_RE.match(parts[1]):
        return None
    rec = accounts.read_account(parts[1])
    h = hashlib.sha256(parts[2].encode()).hexdigest()
    if rec and any(hmac.compare_digest(h, t["h"]) for t in rec.get("tokens", [])):
        return parts[1], rec
    return None


@bp.post("/v1/me/records")
def post_record():
    import accounts
    from app import RECORD_LIMIT
    if not RECORD_LIMIT.allow():
        return _err(429)
    if (request.content_length or 0) > MAX_RECORD:
        return _err(413)
    who = _writer()
    if not who:
        return _err(401)
    aid, rec = who
    if not rec.get("pub"):
        return _err(409)                                 # no key yet: log in on the website once
    raw = request.get_data(cache=False)
    if len(raw) > MAX_RECORD:
        return _err(413)
    try:
        SyncDrop.model_validate_json(raw)                # never echo or log the error: it contains input
    except ValidationError:
        return _err(422)
    at = int(time.time())
    sealed = seal(base64.b64decode(rec["pub"]), raw)
    del raw
    with accounts.LOCK:
        items = read_inbox(aid)
        rid = (items[-1]["id"] + 1) if items else 1
        items.append({"id": rid, "at": at, **sealed})
        write_inbox(aid, items[-MAX_INBOX:])
    return {"id": rid, "at": at}, 201


@bp.get("/v1/me/records")
def list_records():
    import accounts
    aid = accounts.session_id()
    if not aid:
        return _err(401)
    try:
        after = int(request.args.get("after", "0"))
    except ValueError:
        return _err(422)
    items = [r for r in read_inbox(aid) if r["id"] > after][:100]
    return {"records": items, "last": items[-1]["id"] if items else after}
