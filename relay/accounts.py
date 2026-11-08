# relay/accounts.py: zero-knowledge accounts. The Pi stores, per account, one file holding
#   - a scrypt hash of an auth key the browser derives from the password (never the password), and
#   - one ciphertext blob (AES-256-GCM, key derived in the browser from the password; the Pi never has it).
# The account id is SHA-256 of the username, made in the browser: the Pi never sees the username either.
# Nothing readable is stored. Sessions live in RAM for 1 hour.
# Also stored: the account's RSA public key (public by definition) and SHA-256 hashes of device write tokens.
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time

from records import load_pub

from flask import Blueprint, request

bp = Blueprint("accounts", __name__)

VAULT_DIR = os.environ.get("VAULT_DIR", "/data/vaults")
MAX_VAULT = 200 * 1024                       # base64 ciphertext; the browser gzips before encrypting
SESSION_TTL = 3600
ID_RE = re.compile(r"^[0-9a-f]{64}$")
B64_RE = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
SESSIONS: dict[str, tuple[str, float]] = {}  # token -> (account id, expiry); RAM only
LOCK = threading.Lock()


def _err(code, retry_after=None):
    from app import generic                  # shared fixed-body errors
    return generic(code, retry_after)


def _limit():
    from app import ACCOUNT_LIMIT
    return ACCOUNT_LIMIT.allow()


def require_session():
    """(account id, None) for a valid session within its rate limit, else (None, error response)."""
    from app import SESSION_LIMIT
    h = request.headers.get("Authorization", "")
    tok = h[7:] if h.startswith("Bearer ") else ""
    aid = session_id()
    if not aid:
        return None, _err(401)
    wait = SESSION_LIMIT.check(hashlib.sha256(tok.encode()).hexdigest())
    return (None, _err(429, wait)) if wait else (aid, None)


def _path(aid: str) -> str:
    return os.path.join(VAULT_DIR, f"{aid}.json")


def _hash(auth: bytes, salt: bytes) -> bytes:
    return hashlib.scrypt(auth, salt=salt, n=2**14, r=8, p=1, dklen=32)


def _creds():
    """(id, auth bytes) from the JSON body, or None. auth is the 32-byte key the browser derived."""
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or set(body) - {"id", "auth", "pub"}:
        return None
    aid, auth = body.get("id"), body.get("auth")
    if not isinstance(aid, str) or not ID_RE.match(aid) or not isinstance(auth, str) or not B64_RE.match(auth):
        return None
    try:
        raw = base64.b64decode(auth, validate=True)
    except ValueError:
        return None
    return (aid, raw) if len(raw) == 32 else None


def read_account(aid: str):
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


def session_id():
    h = request.headers.get("Authorization", "")
    tok = h[7:] if h.startswith("Bearer ") else ""
    now = time.time()
    with LOCK:
        for t in [t for t, (_, exp) in SESSIONS.items() if exp < now]:
            del SESSIONS[t]
        hit = SESSIONS.get(tok)
    return hit[0] if hit else None


def _new_session(aid: str) -> str:
    tok = secrets.token_urlsafe(32)
    with LOCK:
        SESSIONS[tok] = (aid, time.time() + SESSION_TTL)
    return tok


@bp.post("/v1/account/create")
def create():
    from app import CREATE_LIMIT
    if not _limit() or not CREATE_LIMIT.allow():
        return _err(429, 60)
    c = _creds()
    if not c:
        return _err(422)
    aid, auth = c
    pub = (request.get_json(silent=True) or {}).get("pub")
    if pub is not None and not load_pub(pub):
        return _err(422)
    salt = secrets.token_bytes(16)
    rec = {"v": 1, "salt": base64.b64encode(salt).decode(), "hash": base64.b64encode(_hash(auth, salt)).decode(),
           "vault": None, "pub": pub, "tokens": []}
    with LOCK:
        if os.path.exists(_path(aid)):
            return _err(409)
        _write(aid, rec)
    return {"session": _new_session(aid), "vault": None}, 201


@bp.post("/v1/account/open")
def open_account():
    from app import LOGIN_PER_ACCOUNT
    if not _limit():
        return _err(429, 60)
    c = _creds()
    if not c:
        return _err(422)
    aid, auth = c
    wait = LOGIN_PER_ACCOUNT.check(aid)          # brute force on one account is slowed; nobody else is locked out
    if wait:
        return _err(429, wait)
    rec = read_account(aid)
    # Unknown account and wrong password look the same (401). A dummy hash keeps the timing the same too.
    salt = base64.b64decode(rec["salt"]) if rec else b"\0" * 16
    ok = hmac.compare_digest(_hash(auth, salt), base64.b64decode(rec["hash"]) if rec else b"\1" * 32)
    if not rec or not ok:
        return _err(401)
    return {"session": _new_session(aid), "vault": rec.get("vault"), "has_pub": bool(rec.get("pub"))}


@bp.post("/v1/account/vault")
def save_vault():
    aid, err = require_session()
    if err:
        return err
    body = request.get_json(silent=True)
    vault = body.get("vault") if isinstance(body, dict) and set(body) == {"vault"} else None
    if not isinstance(vault, str) or not B64_RE.match(vault):
        return _err(422)
    if len(vault) > MAX_VAULT:
        return _err(413)
    with LOCK:
        rec = read_account(aid)
        if not rec:
            return _err(404)
        rec["vault"] = vault
        _write(aid, rec)
    return "", 204


@bp.post("/v1/account/delete")
def delete():
    aid, err = require_session()
    if err:
        return err
    with LOCK:
        for path in (_path(aid), _path(aid).replace(".json", ".inbox.json")):
            try:
                os.remove(path)
            except FileNotFoundError:
                pass
        for t in [t for t, (a, _) in SESSIONS.items() if a == aid]:
            del SESSIONS[t]
    return "", 204


def _body():
    b = request.get_json(silent=True)
    return b if isinstance(b, dict) else {}


@bp.post("/v1/account/pubkey")
def set_pubkey():
    """The browser made the account's keypair; only the public half comes here (records are sealed to it)."""
    aid, err = require_session()
    if err:
        return err
    b = _body()
    if set(b) != {"pub"} or not isinstance(b["pub"], str) or not load_pub(b["pub"]):
        return _err(422)
    with LOCK:
        rec = read_account(aid)
        if not rec:
            return _err(404)
        rec["pub"] = b["pub"]
        _write(aid, rec)
    return "", 204


MAX_TOKENS = 10


@bp.post("/v1/account/tokens")
def new_token():
    """A write token for one device (the iPhone, a script). Shown once; the Pi keeps only its SHA-256."""
    aid, err = require_session()
    if err:
        return err
    b = _body()
    days = b.get("days", 90)
    if b.get("scope", "write") != "write" or not isinstance(days, int) or isinstance(days, bool) or not 1 <= days <= 365:
        return _err(422)
    secret = secrets.token_urlsafe(24)
    tid = secrets.token_hex(4)
    with LOCK:
        rec = read_account(aid)
        if not rec:
            return _err(404)
        toks = rec.setdefault("tokens", [])
        if len(toks) >= MAX_TOKENS:
            return _err(409)
        now = time.time()
        toks.append({"id": tid, "h": hashlib.sha256(secret.encode()).hexdigest(), "scope": "write",
                     "created": time.strftime("%Y-%m-%d", time.gmtime(now)),
                     "expires": time.strftime("%Y-%m-%d", time.gmtime(now + days * 86400)), "last_used": None})
        _write(aid, rec)
    return {"id": tid, "token": f"hhw_{aid}_{secret}", "scope": "write", "expires": toks[-1]["expires"]}, 201


@bp.get("/v1/account/tokens")
def list_tokens():
    aid, err = require_session()
    if err:
        return err
    rec = read_account(aid)
    if not rec:
        return _err(401)
    return {"tokens": [{k: t.get(k) for k in ("id", "scope", "created", "expires", "last_used")} for t in rec.get("tokens", [])]}


@bp.delete("/v1/account/tokens/<tid>")
def revoke_token(tid: str):
    aid, err = require_session()
    if err:
        return err
    with LOCK:
        rec = read_account(aid)
        if not rec:
            return _err(404)
        before = len(rec.get("tokens", []))
        rec["tokens"] = [t for t in rec.get("tokens", []) if t["id"] != tid]
        if len(rec["tokens"]) == before:
            return _err(404)
        _write(aid, rec)
    return "", 204
