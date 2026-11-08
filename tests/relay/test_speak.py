# Spoken brief: session only, brief text only (privacy filter), Gradium through the egress proxy, nothing stored.
import base64
import hashlib
import io
import json
import logging
import struct

import pytest

import accounts
import app as relay_app
import speak

AID = hashlib.sha256(b"huskyhealth:ved").hexdigest()
AUTH = base64.b64encode(b"A" * 32).decode()
BRIEF = "Train hard. Your heart-rate variability is inside your normal range. This week: load 244, 87 % of usual."


class FakeStream(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture()
def c(tmp_path, monkeypatch):
    monkeypatch.setattr(accounts, "VAULT_DIR", str(tmp_path))
    for name, args in {"LOGIN_PER_ACCOUNT": (10, 900), "SESSION_LIMIT": (120, 60), "SPEAK_PER_SESSION": (20, 3600)}.items():
        monkeypatch.setattr(relay_app, name, relay_app.KeyedWindow(*args))
    monkeypatch.setattr(relay_app, "ACCOUNT_LIMIT", relay_app.Window(100, 60))
    monkeypatch.setattr(relay_app, "CREATE_LIMIT", relay_app.Window(100, 3600))
    accounts.SESSIONS.clear()
    return relay_app.app.test_client()


@pytest.fixture()
def session(c):
    return c.post("/v1/account/create", json={"id": AID, "auth": AUTH}).json["session"]


def bearer(s):
    return {"Authorization": f"Bearer {s}"}


def gradium_ok(monkeypatch, sent):
    pcm = b"\x01\x00" * 2400
    lines = [{"type": "audio", "audio": base64.b64encode(pcm[:2400]).decode()},
             {"type": "text", "text": "Train", "start_s": 0.1, "stop_s": 0.4},
             {"type": "audio", "audio": base64.b64encode(pcm[2400:]).decode()},
             {"type": "text", "text": "hard.", "start_s": 0.4, "stop_s": 0.8}]

    def fake(req, timeout):
        sent.append({"url": req.full_url, "headers": dict(req.header_items()), "body": json.loads(req.data)})
        return FakeStream("\n".join(json.dumps(x) for x in lines).encode())
    monkeypatch.setattr(speak.urllib.request, "urlopen", fake)
    monkeypatch.setenv("GRADIUM_API_KEY", "test-key")
    return pcm


def test_speaks_brief_with_word_timings(c, session, monkeypatch):
    sent = []
    pcm = gradium_ok(monkeypatch, sent)
    r = c.post("/v1/speak", json={"text": BRIEF}, headers=bearer(session))
    assert r.status_code == 200
    audio = base64.b64decode(r.json["audio"])
    assert audio[:4] == b"RIFF" and audio[8:12] == b"WAVE" and audio.endswith(pcm)
    assert struct.unpack("<I", audio[40:44])[0] == len(pcm) and struct.unpack("<I", audio[24:28])[0] == 24000
    assert r.json["words"] == [{"text": "Train", "start_s": 0.1, "stop_s": 0.4}, {"text": "hard.", "start_s": 0.4, "stop_s": 0.8}]
    # exactly one passage of text left, to the TTS endpoint, with the key in a header
    assert len(sent) == 1 and sent[0]["url"].endswith("/api/post/speech/tts")
    assert sent[0]["body"] == {"text": BRIEF, "voice_id": speak.DEFAULT_VOICE, "output_format": "pcm_24000", "only_audio": False}
    assert sent[0]["headers"]["X-api-key"] == "test-key"


def test_needs_a_session(c, monkeypatch):
    gradium_ok(monkeypatch, [])
    assert c.post("/v1/speak", json={"text": BRIEF}).status_code == 401


@pytest.mark.parametrize("text", ["", "x" * 601, "email me at ved@example.com", "call 6175551234", "see https://evil.example",
                                  "born 2004-01-02 12345", "<script>", 42])
def test_privacy_filter_refuses_anything_but_brief_text(c, session, monkeypatch, text):
    sent = []
    gradium_ok(monkeypatch, sent)
    assert c.post("/v1/speak", json={"text": text}, headers=bearer(session)).status_code == 422
    assert sent == []                                                     # nothing left the Pi


def test_extra_fields_refused(c, session, monkeypatch):
    gradium_ok(monkeypatch, [])
    assert c.post("/v1/speak", json={"text": BRIEF, "voice_id": "x"}, headers=bearer(session)).status_code == 422


def test_not_set_up_and_upstream_down(c, session, monkeypatch):
    monkeypatch.delenv("GRADIUM_API_KEY", raising=False)
    assert c.post("/v1/speak", json={"text": BRIEF}, headers=bearer(session)).status_code == 503
    monkeypatch.setenv("GRADIUM_API_KEY", "k")

    def down(req, timeout):
        raise speak.urllib.error.URLError("down")
    monkeypatch.setattr(speak.urllib.request, "urlopen", down)
    r = c.post("/v1/speak", json={"text": BRIEF}, headers=bearer(session))
    assert r.status_code == 502 and r.json == {"error": "speech is unavailable", "status": 502}


def test_rate_limited_per_account(c, session, monkeypatch):
    gradium_ok(monkeypatch, [])
    monkeypatch.setattr(relay_app, "SPEAK_PER_SESSION", relay_app.KeyedWindow(1, 3600))
    assert c.post("/v1/speak", json={"text": BRIEF}, headers=bearer(session)).status_code == 200
    r = c.post("/v1/speak", json={"text": BRIEF}, headers=bearer(session))
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0


def test_nothing_logged(c, session, monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)
    gradium_ok(monkeypatch, [])
    c.post("/v1/speak", json={"text": BRIEF}, headers=bearer(session))
    assert BRIEF not in caplog.text
