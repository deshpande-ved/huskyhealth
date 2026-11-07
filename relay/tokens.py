# relay/tokens.py: RAM only; gunicorn must run ONE worker or tokens vanish between processes
import hashlib
import secrets
import threading
import time

_TOKENS: dict[str, tuple[str, float, str | None]] = {}
_LOCK = threading.Lock()


def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def mint(kind: str, ttl: int = 600, bound: str | None = None) -> str:
    tok = secrets.token_urlsafe(16)                           # 128 random bits
    now = time.monotonic()
    with _LOCK:
        for t, (_, exp, _) in list(_TOKENS.items()):          # purge expired
            if exp < now:
                del _TOKENS[t]
        _TOKENS[tok] = (kind, now + ttl, bound)
    return tok


def burn(tok: str, kind: str, bound: str | None = None) -> bool:  # single use: removed even if invalid
    with _LOCK:
        k, exp, b = _TOKENS.pop(tok, (None, 0.0, None))
    return k == kind and time.monotonic() < exp and b == bound
