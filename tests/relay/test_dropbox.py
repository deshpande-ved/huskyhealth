# E06S01 / S04 / S05: drop box API, SyncDrop schema, ciphertext-only storage, dump proof.
import base64
import json
import logging

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

import app as relay_app
import dropbox
from tools import dump_boxes

MARKER = "MARKER-plaintext-9b2e41"


def keypair(bits=2048):
    k = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    spki = k.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return k, base64.b64encode(spki).decode()


def payload(**extra):
    p = {"v": 1, "workouts": [{"sport": "squash", "start_s": 3600, "end_s": 600, "kcal": 400.0, "src": "watch",
                               "hr": [{"t_s": 3000, "v": 150.0}, {"t_s": 2985, "v": 152.0}]}],
         "rhr": [{"t_s": 50000, "v": 52.0}], "hrv": [], "effort": [{"t_s": 590, "v": 7.0}]}
    p.update(extra)
    return p


@pytest.fixture()
def c(monkeypatch):
    dropbox.BOXES.clear()
    monkeypatch.setattr(relay_app, "BOX_LIMIT", relay_app.Window(30, 60))
    return relay_app.app.test_client()


def mkbox(c, pub=None):
    if pub is None:
        _, pub = keypair()
    r = c.post("/v1/box", json={"pub": pub})
    assert r.status_code == 200
    return r.get_json()


def auth(s):
    return {"Authorization": f"Bearer {s}"}


def test_create_box_and_bad_keys(c):
    b = mkbox(c)
    assert set(b) == {"box", "write", "read"} and all(len(v) >= 22 for v in b.values())
    _, small = keypair(1024)
    for body in [{"pub": small}, {"pub": "not-base64!"}, {"pub": base64.b64encode(b"junk").decode()}, {"pub": small, "x": 1}]:
        r = c.post("/v1/box", json=body)
        assert r.status_code == 422 and r.get_json() == {"error": "rejected"}


def test_box_rate_limit(c):
    _, pub = keypair()
    codes = [c.post("/v1/box", json={"pub": pub}).status_code for _ in range(31)]
    assert codes[:30] == [200] * 30 and codes[30] == 429


def test_only_ciphertext_is_held(c):
    b = mkbox(c)
    raw = json.dumps(payload()).encode()
    r = c.post(f"/v1/drop/{b['box']}", data=raw, headers=auth(b["write"]))
    assert r.status_code == 204
    held = repr(dropbox.BOXES)
    assert set(dropbox.BOXES[b["box"]]["drop"]) == {"key", "nonce", "ct", "at"}
    probes = [raw, base64.b64encode(raw)] + [base64.b64encode(raw[i:])[4:40] for i in range(3)]
    for p in probes:
        assert p.decode() not in held


def test_marker_never_stored_even_when_rejected(c):
    b = mkbox(c)
    r = c.post(f"/v1/drop/{b['box']}", data=json.dumps(payload(note=MARKER)), headers=auth(b["write"]))
    assert r.status_code == 422 and MARKER.encode() not in r.data
    assert MARKER not in repr(dropbox.BOXES)
    for off in range(3):
        assert base64.b64encode(("x" * off + MARKER).encode())[4:24].decode() not in repr(dropbox.BOXES)


def test_read_once_then_404_and_decrypts(c):
    k, pub = keypair()
    b = mkbox(c, pub)
    c.post(f"/v1/drop/{b['box']}", data=json.dumps(payload()), headers=auth(b["write"]))
    r = c.get(f"/v1/drop/{b['box']}", headers=auth(b["read"]))
    d = r.get_json()
    aes = k.decrypt(base64.b64decode(d["key"]), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    plain = AESGCM(aes).decrypt(base64.b64decode(d["nonce"]), base64.b64decode(d["ct"]), None)
    assert json.loads(plain) == payload() and d["age_s"] >= 0
    assert c.get(f"/v1/drop/{b['box']}", headers=auth(b["read"])).status_code == 404


def test_expiry(c, monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(dropbox.time, "monotonic", lambda: now[0])
    b = mkbox(c)
    c.post(f"/v1/drop/{b['box']}", data=json.dumps(payload()), headers=auth(b["write"]))
    now[0] += 24 * 3600 + 1
    assert c.get(f"/v1/drop/{b['box']}", headers=auth(b["read"])).status_code == 404


def test_errors(c):
    b = mkbox(c)
    url = f"/v1/drop/{b['box']}"
    assert c.post(url, data=json.dumps(payload()), headers=auth("wrong")).status_code == 403
    assert c.post(url, data=json.dumps(payload())).status_code == 403
    assert c.post(url, data=json.dumps(payload()), headers=auth(b["read"])).status_code == 403
    assert c.post(url, data="x" * (128 * 1024 + 1), headers=auth(b["write"])).status_code == 413
    assert c.post(url, data=json.dumps(payload()), headers=auth(b["write"])).status_code == 204
    assert c.post(url, data=json.dumps(payload()), headers=auth(b["write"])).status_code == 409
    assert c.get(url, headers=auth(b["write"])).status_code == 403
    assert c.delete(f"/v1/box/{b['box']}", headers=auth("nope")).status_code == 403
    assert c.get("/v1/drop/unknownbox", headers=auth(b["read"])).status_code == 404


def test_schema_on_drop(c):
    b = mkbox(c)
    url = f"/v1/drop/{b['box']}"
    for bad in [payload(extra=1), payload(device="Pat's Apple Watch"),
                payload(workouts=[{"sport": "squash", "start_s": 10, "end_s": 1, "device": "X"}]),
                payload(workouts=[{"sport": "squash", "start_s": "10", "end_s": 1}])]:
        r = c.post(url, data=json.dumps(bad), headers=auth(b["write"]))
        assert r.status_code == 422 and r.get_json() == {"error": "rejected"}


def test_delete_box(c):
    b = mkbox(c)
    assert c.delete(f"/v1/box/{b['box']}", headers=auth(b["read"])).status_code == 204
    assert c.get(f"/v1/drop/{b['box']}", headers=auth(b["read"])).status_code == 404


def test_no_logging_full_cycle(c, caplog):
    caplog.set_level(logging.DEBUG)
    b = mkbox(c)
    c.post(f"/v1/drop/{b['box']}", data=json.dumps(payload()), headers=auth(b["write"]))
    c.get(f"/v1/drop/{b['box']}", headers=auth(b["read"]))
    c.delete(f"/v1/box/{b['box']}", headers=auth(b["read"]))
    assert caplog.records == []


def test_dump_proof():
    dropbox.BOXES.clear()
    marker_payload = json.loads(json.dumps(dump_boxes.SYNTHETIC))
    lines = dump_boxes.run(marker_payload)
    assert len(lines) == 1
    import re
    assert re.fullmatch(r"box: ciphertext \d+ bytes, head [0-9a-f]{32}", lines[0])
    assert "squash" not in lines[0] and "120" not in lines[0].split("head")[0][:-1].replace("ciphertext", "")


def test_build_sheet_and_demo_docs():
    import re
    from pathlib import Path
    docs = Path(__file__).resolve().parents[2] / "docs"
    sheet = (docs / "shortcut-build-sheet.md").read_text()
    for h in ["## Paste the pairing code", "## Read recent heart rate", "## Stop unless there was a workout",
              "## Build the payload", "## POST the drop", "## Triggers"]:
        assert h in sheet, h
    for t in ["App → Is Opened", "Run Immediately", "Notify When Run", "only when there is a new workout", "Import Question"]:
        assert t in sheet, t
    example = sheet[sheet.index("```json") + 7: sheet.index("```", sheet.index("```json") + 7)]
    dropbox.SyncDrop.model_validate_json(example)
    assert not re.search(r"\b\d{4}-\d{2}-\d{2}T|device|sourceName", example)
    for doc in (sheet, (docs / "demo-sync.md").read_text()):
        assert not re.search(r"([0-9]{1,3}\.){3}[0-9]{1,3}|ssh |@[a-z0-9-]+\.(com|edu)", doc)
        hosts = set(re.findall(r"https?://([a-z0-9.-]+)", doc))
        assert hosts <= {"veds-pi5.polecat-nominal.ts.net"}, hosts
