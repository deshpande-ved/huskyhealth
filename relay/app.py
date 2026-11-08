# relay/app.py: the HuskyHealth relay. RAM only except accounts (ciphertext, hashes and public keys: accounts.py,
# records.py);
# /v1/ only, and it never logs or echoes input.
import logging
import threading
import time
from collections import deque
from pathlib import Path

from flask import Flask, request
from werkzeug.exceptions import HTTPException

from tokens import mint

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 256 * 1024
logging.getLogger("werkzeug").disabled = True     # no request lines, no IPs
app.logger.disabled = True

GENERIC = {400: "bad request", 401: "unauthorized", 403: "forbidden", 404: "not found", 405: "method not allowed",
           409: "conflict", 410: "gone", 413: "too large", 415: "send application/json", 422: "rejected",
           429: "slow down", 500: "server error"}
API_VERSION = "1"


def generic(code: int, retry_after: int | None = None):
    """The only error shape: a fixed message and the status. Never the request, never exception details."""
    code = code if code in GENERIC else (500 if code >= 500 else 400)
    headers = {"Retry-After": str(retry_after)} if code == 429 and retry_after else {}
    return {"error": GENERIC[code], "status": code}, code, headers


@app.after_request
def version_header(resp):
    resp.headers["API-Version"] = API_VERSION
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.before_request
def json_only():                                      # 415 for any body that is not JSON (input validation, OWASP API8)
    if request.method in ("POST", "PUT", "PATCH") and (request.content_length or 0) > 0 \
            and request.mimetype != ("audio/wav" if request.path == "/v1/listen" else "application/json"):
        return generic(415)


@app.before_request
def size_cap():                                       # enforced even on routes that never read the body
    if (request.content_length or 0) > app.config["MAX_CONTENT_LENGTH"]:
        return generic(413)


@app.errorhandler(HTTPException)
def http_error(e):                                    # fixed body: never the request, never exc details
    return generic(e.code or 500)


@app.errorhandler(Exception)
def any_error(_e):                                    # handled here so Flask does not log a traceback
    return generic(500)


class Window:
    """Global sliding-window rate limit, in RAM. A backstop: per-key limits (KeyedWindow) do the real work."""
    def __init__(self, limit: int, seconds: float):
        self.limit, self.seconds, self.hits, self.lock = limit, seconds, deque(), threading.Lock()

    def allow(self) -> bool:
        now = time.monotonic()
        with self.lock:
            while self.hits and now - self.hits[0] >= self.seconds:
                self.hits.popleft()
            if len(self.hits) >= self.limit:
                return False
            self.hits.append(now)
            return True


class KeyedWindow:
    """Sliding-window limit per key (an account id, a token hash, a session): one abuser cannot lock everyone out.
    RAM only; at most `max_keys` keys are tracked (oldest dropped), so the limiter itself cannot be flooded."""
    def __init__(self, limit: int, seconds: float, max_keys: int = 10_000):
        self.limit, self.seconds, self.max_keys = limit, seconds, max_keys
        self.hits: dict[str, deque] = {}
        self.lock = threading.Lock()

    def check(self, key: str) -> int:
        """0 if allowed (and counted), else the seconds until the next request would be allowed."""
        now = time.monotonic()
        with self.lock:
            q = self.hits.pop(key, deque())
            while q and now - q[0] >= self.seconds:
                q.popleft()
            if len(q) >= self.limit:
                self.hits[key] = q
                return max(1, int(self.seconds - (now - q[0])) + 1)
            q.append(now)
            self.hits[key] = q                       # re-inserted: dict order is least- to most-recently used
            while len(self.hits) > self.max_keys:
                self.hits.pop(next(iter(self.hits)))
            return 0


TOKEN_LIMIT = Window(30, 60)
RECORD_LIMIT = Window(600, 60)              # global backstop for record writes
ACCOUNT_LIMIT = Window(120, 60)             # global backstop for create/open (each runs scrypt, ~50 ms)
LOGIN_PER_ACCOUNT = KeyedWindow(10, 900)     # 10 log-in attempts per account per 15 min: no brute force, no lockout of others
CREATE_LIMIT = Window(30, 3600)              # new accounts per hour, everyone together
WRITE_PER_TOKEN = KeyedWindow(120, 3600)     # a device token: 120 records an hour (a 60-day backfill is ~20-60)
WRITE_PER_ACCOUNT = KeyedWindow(300, 3600)   # all of one account's devices together
SESSION_LIMIT = KeyedWindow(120, 60)         # reads, deletes, token management per session
SPEAK_PER_SESSION = KeyedWindow(40, 3600)    # spoken briefs and answers per account per hour (Gradium credits)
LISTEN_PER_SESSION = KeyedWindow(30, 3600)   # spoken questions per account per hour


@app.get("/v1/healthz")
def healthz():
    return "ok", 200, {"Content-Type": "text/plain; charset=utf-8"}


_OPENAPI = (Path(__file__).with_name("openapi.json")).read_text()


@app.get("/v1/openapi.json")
def openapi():
    return _OPENAPI, 200, {"Content-Type": "application/json"}


@app.post("/v1/token")
def token():
    kind = request.args.get("kind")
    if kind not in ("brief", "listen"):
        return generic(422)
    if not TOKEN_LIMIT.allow():
        return generic(429)
    return {"token": mint(kind, ttl=600)}


from records import bp as records_bp            # noqa: E402  (registered after the shared helpers exist)

app.register_blueprint(records_bp)

from accounts import bp as accounts_bp          # noqa: E402

app.register_blueprint(accounts_bp)

from speak import bp as speak_bp                # noqa: E402

app.register_blueprint(speak_bp)
