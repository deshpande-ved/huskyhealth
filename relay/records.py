# relay/records.py: the zero-knowledge personal API. Records are a short-lived encrypted queue: deleted once your
# website or CLI collects them into your vault, and after 30 days if nobody does. Any device POSTs health records with a write token; the relay
# validates each one, seals it to the account's public key in memory, and stores only the ciphertext. Reading needs
# the account's private key, which lives inside the password-encrypted vault: the Pi can never read a record.
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Literal

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from flask import Blueprint, request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

MAX_RECORD = 128 * 1024                 # ~3 h of workout-rate heart rate as JSON
MAX_INBOX = 400                         # records kept per account; the oldest are dropped first
RECORD_TTL = 30 * 86400                 # a record nobody collects is deleted after 30 days
HOUR = 3600
WINDOW = 61 * 86400                     # records may reach back 61 days (the app backfills 60 on first login)

bp = Blueprint("records", __name__)


# ---- one record (times are seconds before sending; no dates, names, devices or GPS) ----
class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Sample(_Strict):
    t_s: int = Field(ge=0, le=WINDOW)
    v: float = Field(ge=0, le=1000)


SyncSport = Literal["squash", "running", "walking", "cycling", "strength", "hiit", "other"]


class SyncWorkout(_Strict):
    sport: SyncSport
    start_s: int = Field(ge=0, le=WINDOW)
    end_s: int = Field(ge=0, le=WINDOW)
    kcal: float | None = Field(default=None, ge=0, le=10000)
    src: Literal["watch", "garmin", "other"] = "watch"
    hr: list[Sample] = Field(default_factory=list, max_length=4000)


class SyncDrop(_Strict):
    v: Literal[1]
    workouts: list[SyncWorkout] = Field(default_factory=list, max_length=20)
    rhr: list[Sample] = Field(default_factory=list, max_length=120)
    hrv: list[Sample] = Field(default_factory=list, max_length=400)
    effort: list[Sample] = Field(default_factory=list, max_length=50)
    vo2: list[Sample] = Field(default_factory=list, max_length=120)      # VO2 max estimates, ml/kg/min
    sleep: list[Sample] = Field(default_factory=list, max_length=120)    # minutes asleep per night, at the time you woke


def seal(pub_spki_der: bytes, plaintext: bytes) -> dict:
    key, nonce = AESGCM.generate_key(bit_length=256), os.urandom(12)
    pub = serialization.load_der_public_key(pub_spki_der)
    wrapped = pub.encrypt(key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                                            algorithm=hashes.SHA256(), label=None))
    b64 = lambda b: base64.b64encode(b).decode()
    return {"key": b64(wrapped), "nonce": b64(nonce), "ct": b64(AESGCM(key).encrypt(nonce, plaintext, None))}


def _err(code: int, retry_after: int | None = None):
    from app import generic                          # one generic body for every error
    return generic(code, retry_after)


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
    today = time.strftime("%Y-%m-%d", time.gmtime())
    for t in (rec or {}).get("tokens", []):
        if hmac.compare_digest(h, t["h"]):
            return (parts[1], rec, t) if t.get("expires", "9999-12-31") >= today else None   # expired tokens stop working
    return None


def client_sealed(raw: bytes):
    """{"sealed": {"key", "nonce", "ct"}} from a device that encrypted the record itself -> the envelope, else None.
    Shape only: an RSA-2048/4096 wrapped key, a 12-byte nonce, ciphertext plus a 16-byte tag."""
    try:
        body = json.loads(raw)
    except ValueError:
        return None
    env = body.get("sealed") if isinstance(body, dict) and set(body) == {"sealed"} else None
    if not isinstance(env, dict) or set(env) != {"key", "nonce", "ct"} or not all(isinstance(v, str) for v in env.values()):
        return None
    try:
        key, nonce, ct = (base64.b64decode(env[k], validate=True) for k in ("key", "nonce", "ct"))
    except ValueError:
        return None
    if len(key) not in (256, 512) or len(nonce) != 12 or not 16 < len(ct) <= MAX_RECORD:
        return None
    return {"key": env["key"], "nonce": env["nonce"], "ct": env["ct"]}


@bp.post("/v1/me/records")
def post_record():
    import accounts
    from app import RECORD_LIMIT, WRITE_PER_ACCOUNT, WRITE_PER_TOKEN
    if not RECORD_LIMIT.allow():
        return _err(429, 10)
    if (request.content_length or 0) > MAX_RECORD:
        return _err(413)
    who = _writer()
    if not who:
        return _err(401)
    aid, rec, tok = who
    wait = WRITE_PER_TOKEN.check(tok["h"]) or WRITE_PER_ACCOUNT.check(aid)
    if wait:
        return _err(429, wait)
    if not rec.get("pub"):
        return _err(409)                                 # no key yet: log in on the website once
    raw = request.get_data(cache=False)
    if len(raw) > MAX_RECORD:
        return _err(413)
    now = int(time.time())
    presealed = client_sealed(raw)
    if presealed:
        # Sealed on the device (the iPhone app): the relay never sees the record, not even in memory. It can only
        # check the envelope; the app builds records from a fixed field list and the website validates on opening.
        sealed = presealed
    else:
        try:
            SyncDrop.model_validate_json(raw)            # never echo or log the error: it contains input
        except ValidationError:
            return _err(422)
        # Sealed here, in memory, for clients that cannot encrypt (curl, scripts). The exact receive time travels
        # inside the ciphertext; only the hour is stored in the clear.
        sealed = seal(base64.b64decode(rec["pub"]), json.dumps({"received": now, "record": json.loads(raw)}).encode())
    del raw
    with accounts.LOCK:
        acct = accounts.read_account(aid) or rec
        items = [r for r in read_inbox(aid) if r["at"] >= now - RECORD_TTL]
        rid = acct.get("next_id") or ((items[-1]["id"] + 1) if items else 1)   # ids never repeat, even after deletes
        items.append({"id": rid, "at": now - now % HOUR, **sealed})
        write_inbox(aid, items[-MAX_INBOX:])
        acct["next_id"] = rid + 1
        for t in acct.get("tokens", []):                 # last used, to the day: enough to spot a stale device
            if t["h"] == tok["h"]:
                t["last_used"] = time.strftime("%Y-%m-%d", time.gmtime(now))
        accounts._write(aid, acct)
    return {"id": rid, "at": now - now % HOUR}, 201


@bp.get("/v1/me/records")
def list_records():
    import accounts
    aid, err = accounts.require_session()
    if err:
        return err
    try:
        after = int(request.args.get("after", "0"))
    except ValueError:
        return _err(422)
    cutoff = int(time.time()) - RECORD_TTL
    items = [r for r in read_inbox(aid) if r["id"] > after and r["at"] >= cutoff][:100]
    return {"records": items, "last": items[-1]["id"] if items else after}


@bp.delete("/v1/me/records")
def delete_records():
    """Delete-after-sync: once a client has folded records into the encrypted vault, it removes them here."""
    import accounts
    aid, err = accounts.require_session()
    if err:
        return err
    try:
        upto = int(request.args.get("upto", ""))
    except ValueError:
        return _err(422)
    with accounts.LOCK:
        write_inbox(aid, [r for r in read_inbox(aid) if r["id"] > upto])
    return "", 204
