# relay/accounts.py: zero-knowledge accounts. The Pi stores, per account, one file holding
#   - a scrypt hash of an auth key the browser derives from the password (never the password), and
#   - one ciphertext blob (AES-256-GCM, key derived in the browser from the password; the Pi never has it).
# The account id is SHA-256 of the username, made in the browser: the Pi never sees the username either.
# Nothing readable is stored. Sessions live in RAM for 1 hour.
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time

from flask import Blueprint, request

bp = Blueprint("accounts", __name__)

VAULT_DIR = os.environ.get("VAULT_DIR", "/data/vaults")
MAX_VAULT = 200 * 1024                       # base64 ciphertext; the browser gzips before encrypting
SESSION_TTL = 3600
ID_RE = re.compile(r"^[0-9a-f]{64}$")
B64_RE = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
SESSIONS: dict[str, tuple[str, float]] = {}  # token -> (account id, expiry); RAM only
_LOCK = threading.Lock()


def _err(code):
    from app import generic                  # shared fixed-body errors
    return generic(code)


def _limit():
    from app import ACCOUNT_LIMIT
    return ACCOUNT_LIMIT.allow()


def _path(aid: str) -> str:
    return os.path.join(VAULT_DIR, f"{aid}.json")


def _hash(auth: bytes, salt: bytes) -> bytes:
    return hashlib.scrypt(auth, salt=salt, n=2**14, r=8, p=1, dklen=32)


def _creds():
    """(id, auth bytes) from the JSON body, or None. auth is the 32-byte key the browser derived."""
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) - {"id", "auth"}:
        return None
    aid, auth = body.get("id"), body.get("auth")
    if not isinstance(aid, str) or not ID_RE.match(aid) or not isinstance(auth, str) or not B64_RE.match(auth):
        return None
    try:
        raw = base64.b64decode(auth, validate=True)
    except ValueError:
        return None
    return (aid, raw) if len(raw) == 32 else None


def _read(aid: str):
    try:
        with open(_path(aid), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return None


def _write(aid: str, rec: dict) -> None:
    os.makedirs(VAULT_DIR, exist_ok=True)
    tmp = _path(aid) + f".{secrets.token_hex(4)}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(rec, f)
    os.replace(tmp, _path(aid))              # atomic: never a half-written vault


def _session_id():
    h = request.headers.get("Authorization", "")
    tok = h[7:] if h.startswith("Bearer ") else ""
    now = time.time()
    with _LOCK:
        for t in [t for t, (_, exp) in SESSIONS.items() if exp < now]:
            del SESSIONS[t]
        hit = SESSIONS.get(tok)
    return hit[0] if hit else None


def _new_session(aid: str) -> str:
    tok = secrets.token_urlsafe(32)
    with _LOCK:
        SESSIONS[tok] = (aid, time.time() + SESSION_TTL)
    return tok


@bp.post("/v1/account/create")
def create():
    if not _limit():
        return _err(429)
    c = _creds()
    if not c:
        return _err(422)
    aid, auth = c
    salt = secrets.token_bytes(16)
    rec = {"v": 1, "salt": base64.b64encode(salt).decode(), "hash": base64.b64encode(_hash(auth, salt)).decode(), "vault": None}
    with _LOCK:
        if os.path.exists(_path(aid)):
            return _err(409)
        _write(aid, rec)
    return {"session": _new_session(aid), "vault": None}, 201


@bp.post("/v1/account/open")
def open_account():
    if not _limit():
        return _err(429)
    c = _creds()
    if not c:
        return _err(422)
    aid, auth = c
    rec = _read(aid)
    # Unknown account and wrong password look the same (401). A dummy hash keeps the timing the same too.
    salt = base64.b64decode(rec["salt"]) if rec else b"\0" * 16
    ok = hmac.compare_digest(_hash(auth, salt), base64.b64decode(rec["hash"]) if rec else b"\1" * 32)
    if not rec or not ok:
        return _err(401)
    return {"session": _new_session(aid), "vault": rec.get("vault")}


@bp.post("/v1/account/vault")
def save_vault():
    aid = _session_id()
    if not aid:
        return _err(401)
    body = request.get_json(silent=True)
    vault = body.get("vault") if isinstance(body, dict) and set(body) == {"vault"} else None
    if not isinstance(vault, str) or not B64_RE.match(vault):
        return _err(422)
    if len(vault) > MAX_VAULT:
        return _err(413)
    with _LOCK:
        rec = _read(aid)
        if not rec:
            return _err(404)
        rec["vault"] = vault
        _write(aid, rec)
    return "", 204


@bp.post("/v1/account/delete")
def delete():
    aid = _session_id()
    if not aid:
        return _err(401)
    with _LOCK:
        try:
            os.remove(_path(aid))
        except FileNotFoundError:
            pass
        for t in [t for t, (a, _) in SESSIONS.items() if a == aid]:
            del SESSIONS[t]
    return "", 204
