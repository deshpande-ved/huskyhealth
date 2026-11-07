# relay/app.py: the HuskyHealth relay. Stateless, RAM only, /v1/ only, and it never logs or echoes input.
import logging
import threading
import time
from collections import deque

from flask import Flask, request
from werkzeug.exceptions import HTTPException

from tokens import mint

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 256 * 1024
logging.getLogger("werkzeug").disabled = True     # no request lines, no IPs
app.logger.disabled = True

GENERIC = {400: "bad request", 401: "unauthorized", 403: "forbidden", 404: "not found", 405: "method not allowed",
           410: "gone", 413: "too large", 422: "rejected", 429: "slow down", 500: "server error"}


def generic(code: int):
    code = code if code in GENERIC else (500 if code >= 500 else 400)
    return {"error": GENERIC[code]}, code


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
    """Global sliding-window rate limit, in RAM."""
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


TOKEN_LIMIT = Window(30, 60)


@app.get("/v1/healthz")
def healthz():
    return "ok", 200, {"Content-Type": "text/plain; charset=utf-8"}


@app.post("/v1/token")
def token():
    kind = request.args.get("kind")
    if kind not in ("brief", "listen"):
        return generic(422)
    if not TOKEN_LIMIT.allow():
        return generic(429)
    return {"token": mint(kind, ttl=600)}
