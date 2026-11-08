# Personal API: POST /v1/me/records with a device write token; the Pi stores only ciphertext sealed to the
# account's public key; GET needs a password session; the private key never reaches the Pi.
import base64
import hashlib
import json
import logging

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

import accounts
import app as relay_app
import records

MARKER = "MARKER-plaintext-9b2e41"
AID = hashlib.sha256(b"huskyhealth:ved").hexdigest()
AUTH = base64.b64encode(b"A" * 32).decode()


def keypair(bits=2048):
    k = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    spki = k.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return k, base64.b64encode(spki).decode()


KEY, PUB = keypair()


def payload(**extra):
    p = {"v": 1, "workouts": [{"sport": "squash", "start_s": 3600, "end_s": 600, "kcal": 400.0, "src": "watch",
                               "hr": [{"t_s": 3000, "v": 150.0}, {"t_s": 2985, "v": 152.0}]}],
         "rhr": [{"t_s": 50000, "v": 52.0}], "hrv": [], "effort": [{"t_s": 590, "v": 7.0}]}
    p.update(extra)
    return p


def bearer(s):
    return {"Authorization": f"Bearer {s}"}


def unseal(r):
    aes = KEY.decrypt(base64.b64decode(r["key"]), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    return json.loads(AESGCM(aes).decrypt(base64.b64decode(r["nonce"]), base64.b64decode(r["ct"]), None))


@pytest.fixture()
def c(tmp_path, monkeypatch):
    monkeypatch.setattr(accounts, "VAULT_DIR", str(tmp_path))
    monkeypatch.setattr(relay_app, "ACCOUNT_LIMIT", relay_app.Window(100, 60))
    monkeypatch.setattr(relay_app, "RECORD_LIMIT", relay_app.Window(100, 60))
    accounts.SESSIONS.clear()
    return relay_app.app.test_client()


@pytest.fixture()
def acct(c):
    s = c.post("/v1/account/create", json={"id": AID, "auth": AUTH, "pub": PUB}).json["session"]
    tok = c.post("/v1/account/tokens", json={"scope": "write"}, headers=bearer(s)).json["token"]
    return {"session": s, "token": tok}


def test_post_then_read_back_and_decrypt(c, acct):
    r = c.post("/v1/me/records", data=json.dumps(payload()), headers=bearer(acct["token"]))
    assert r.status_code == 201 and r.json["id"] == 1
    c.post("/v1/me/records", data=json.dumps(payload()), headers=bearer(acct["token"]))
    got = c.get("/v1/me/records", headers=bearer(acct["session"])).json
    assert [x["id"] for x in got["records"]] == [1, 2] and got["last"] == 2
    assert unseal(got["records"][0]) == payload()
    assert c.get("/v1/me/records?after=1", headers=bearer(acct["session"])).json["last"] == 2
    assert len(c.get("/v1/me/records?after=2", headers=bearer(acct["session"])).json["records"]) == 0


def test_disk_holds_only_ciphertext_and_hashes(c, acct, tmp_path):
    raw = json.dumps(payload()).encode()
    c.post("/v1/me/records", data=raw, headers=bearer(acct["token"]))
    disk = "".join(p.read_text() for p in tmp_path.iterdir())
    secret = acct["token"].split("_", 2)[2]
    assert secret not in disk and "squash" not in disk and raw.decode() not in disk
    for i in range(3):
        assert base64.b64encode(raw[i:])[4:40].decode() not in disk


def test_tokens_auth_and_revoke(c, acct):
    url, body = "/v1/me/records", json.dumps(payload())
    assert c.post(url, data=body).status_code == 401
    assert c.post(url, data=body, headers=bearer(acct["session"])).status_code == 401          # sessions can't write
    assert c.post(url, data=body, headers=bearer(acct["token"] + "x")).status_code == 401
    assert c.post(url, data=body, headers=bearer(f"hhw_{'0' * 64}_abc")).status_code == 401
    assert c.get(url, headers=bearer(acct["token"])).status_code == 401                        # tokens can't read
    toks = c.get("/v1/account/tokens", headers=bearer(acct["session"])).json["tokens"]
    assert len(toks) == 1 and set(toks[0]) == {"id", "scope", "created"}
    assert c.delete(f"/v1/account/tokens/{toks[0]['id']}", headers=bearer(acct["session"])).status_code == 204
    assert c.post(url, data=body, headers=bearer(acct["token"])).status_code == 401


def test_no_public_key_yet_is_409_then_pubkey_fixes_it(c):
    s = c.post("/v1/account/create", json={"id": AID, "auth": AUTH}).json["session"]
    tok = c.post("/v1/account/tokens", json={}, headers=bearer(s)).json["token"]
    assert c.post("/v1/me/records", data=json.dumps(payload()), headers=bearer(tok)).status_code == 409
    assert c.post("/v1/account/pubkey", json={"pub": "bm9wZQ=="}, headers=bearer(s)).status_code == 422
    assert c.post("/v1/account/pubkey", json={"pub": keypair(1024)[1]}, headers=bearer(s)).status_code == 422
    assert c.post("/v1/account/pubkey", json={"pub": PUB}, headers=bearer(s)).status_code == 204
    assert c.post("/v1/me/records", data=json.dumps(payload()), headers=bearer(tok)).status_code == 201


def test_schema_rejects_and_never_stores_marker(c, acct, tmp_path):
    url = "/v1/me/records"
    for bad in [payload(note=MARKER), payload(device="Pat's Apple Watch"),
                payload(workouts=[{"sport": "squash", "start_s": 10, "end_s": 1, "device": "X"}]),
                payload(workouts=[{"sport": "squash", "start_s": "10", "end_s": 1}]),
                payload(marks=[{"sport": "golf", "t_s": 5}])]:
        r = c.post(url, data=json.dumps(bad), headers=bearer(acct["token"]))
        assert r.status_code == 422 and r.get_json() == {"error": "rejected"} and MARKER.encode() not in r.data
    assert MARKER not in "".join(p.read_text() for p in tmp_path.iterdir())
    assert c.post(url, data="x" * (128 * 1024 + 1), headers=bearer(acct["token"])).status_code == 413


def test_list_format_and_marks(c, acct):
    good = {"v": 1, "workouts": [{"sport": "squash", "start_s": 86400, "end_s": 0, "kcal": None, "src": "watch",
                                  "hr_t": ["2026-11-07T18:01:02-05:00", "2026-11-07T18:01:07-05:00"], "hr_v": [150, 151.5]}],
            "rhr": [], "hrv": [], "effort": [], "marks": [{"sport": "walking", "t_s": 5000}]}
    assert c.post("/v1/me/records", data=json.dumps(good), headers=bearer(acct["token"])).status_code == 201
    for change in [{"hr_v": [150]}, {"hr_v": [1336, 151]}, {"hr_t": ["Nov 7", "x"]}]:
        d = json.loads(json.dumps(good))
        d["workouts"][0].update(change)
        assert c.post("/v1/me/records", data=json.dumps(d), headers=bearer(acct["token"])).status_code == 422


def test_inbox_is_capped(c, acct, monkeypatch):
    monkeypatch.setattr(records, "MAX_INBOX", 3)
    for _ in range(5):
        c.post("/v1/me/records", data=json.dumps(payload()), headers=bearer(acct["token"]))
    got = c.get("/v1/me/records", headers=bearer(acct["session"])).json["records"]
    assert [x["id"] for x in got] == [3, 4, 5]


def test_delete_account_removes_inbox(c, acct, tmp_path):
    c.post("/v1/me/records", data=json.dumps(payload()), headers=bearer(acct["token"]))
    assert c.post("/v1/account/delete", headers=bearer(acct["session"])).status_code == 204
    assert list(tmp_path.iterdir()) == []


def test_no_logging_full_cycle(c, acct, caplog):
    caplog.set_level(logging.DEBUG)
    c.post("/v1/me/records", data=json.dumps(payload()), headers=bearer(acct["token"]))
    c.get("/v1/me/records", headers=bearer(acct["session"]))
    assert caplog.records == []
