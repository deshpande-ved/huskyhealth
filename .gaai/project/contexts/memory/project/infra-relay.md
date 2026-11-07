---
type: memory
category: project
id: PROJECT-INFRA-004
tags:
  - relay
  - api
  - tokens
  - flask
  - privacy
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (section 10.5)
---

# Relay (`relay/`)

## Routes
| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/v1/token?kind=brief\|listen` | none (global limit ~30/min) | — | `{token}` for one brief or one check-in, 10-min expiry |
| POST | `/v1/brief` | `Bearer` brief token | `BriefIn` | `{text, speak_token}`; the speak token is bound to a hash of `text` |
| POST | `/v1/speak` | `Bearer` speak token | `SpeakIn` | audio bytes; the text must match the token; hourly limit |
| POST | `/v1/listen` | `Bearer` listen token | ≤ 5 s audio (≤ 200 KB) | `{effort: 1–10}` only; hourly limit |
| POST | `/v1/box` | none (rate-limited) | public key (SPKI, base64) | `{box, write, read}` |
| POST | `/v1/drop/<box>` | write secret | last 3 days (≤ 64 KB) | 204; only ciphertext is kept |
| GET | `/v1/drop/<box>` | read secret | — | ciphertext, then deleted |
| DELETE | `/v1/box/<box>` | read secret | — | 204; box forgotten |
| GET | `/v1/audit` | none | — | counts: briefs, blocked, PII findings |
| GET | `/healthz` | none | — | `ok` |

## `relay/tokens.py`
```python
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
```

## `relay/app.py` — brief route (sketch)
```python
# relay/app.py: the brief route (sketch)
@app.post("/v1/brief")
def brief_route():
    if not burn(bearer(request), "brief"):
        return {"error": "token invalid, expired or used"}, 410
    raw = request.get_data(as_text=True)
    try:
        found = pii_types("\n".join(strings_of(json.loads(raw))))
    except ValueError:
        return {"error": "not JSON"}, 422
    try:
        s = BriefIn.model_validate_json(raw)
        schema_ok = True
    except ValidationError:                           # never log it: pydantic errors include the input
        schema_ok = False
    if found or not schema_ok:
        AUDIT["blocked"] += 1
        AUDIT["pii_findings"] += len(found)
        return {"error": "rejected", "schema_ok": schema_ok, "pii": found}, 422
    prompt = json.dumps(bucketize(s), separators=(",", ":"))
    text = claude_brief(prompt) if not pii_types(prompt) else None
    if text is None or pii_types(text):               # checked before anyone hears it
        AUDIT["blocked"] += 1
        return {"error": "blocked"}, 422
    AUDIT["briefs"] += 1
    return {"text": text, "speak_token": mint("speak", bound=digest(text))}
```

## `/v1/speak`
1. Validate `SpeakIn`. 2. `burn(token, "speak", bound=digest(text))`. 3. Check the hourly limit. 4. Call Gradium through `egress:8082`. 5. Return audio with `Cache-Control: no-store`.

## Logging rules
- No request bodies, brief text or audio. No `ValidationError` details. No IPs. Gunicorn access log stays off.
