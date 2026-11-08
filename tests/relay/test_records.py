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
    for name, args in {"LOGIN_PER_ACCOUNT": (10, 900), "WRITE_PER_TOKEN": (120, 3600), "WRITE_PER_ACCOUNT": (300, 3600),
                       "SESSION_LIMIT": (120, 60)}.items():
        monkeypatch.setattr(relay_app, name, relay_app.KeyedWindow(*args))    # fresh per test: limits are per key, in RAM
    accounts.SESSIONS.clear()
    return relay_app.app.test_client()


@pytest.fixture()
def acct(c):
    s = c.post("/v1/account/create", json={"id": AID, "auth": AUTH, "pub": PUB}).json["session"]
    tok = c.post("/v1/account/tokens", json={"scope": "write"}, headers=bearer(s)).json["token"]
    return {"session": s, "token": tok}


def test_post_then_read_back_and_decrypt(c, acct):
    r = c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"]))
    assert r.status_code == 201 and r.json["id"] == 1
    c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"]))
    got = c.get("/v1/me/records", headers=bearer(acct["session"])).json
    assert [x["id"] for x in got["records"]] == [1, 2] and got["last"] == 2
    opened = unseal(got["records"][0])
    assert opened["record"] == payload() and abs(opened["received"] - got["records"][0]["at"]) < 3600
    assert c.get("/v1/me/records?after=1", headers=bearer(acct["session"])).json["last"] == 2
    assert len(c.get("/v1/me/records?after=2", headers=bearer(acct["session"])).json["records"]) == 0


def test_disk_holds_only_ciphertext_and_hashes(c, acct, tmp_path):
    raw = json.dumps(payload()).encode()
    c.post("/v1/me/records", content_type="application/json", data=raw, headers=bearer(acct["token"]))
    disk = "".join(p.read_text() for p in tmp_path.iterdir())
    secret = acct["token"].split("_", 2)[2]
    assert secret not in disk and "squash" not in disk and raw.decode() not in disk
    for i in range(3):
        assert base64.b64encode(raw[i:])[4:40].decode() not in disk


def test_tokens_auth_and_revoke(c, acct):
    url, body = "/v1/me/records", json.dumps(payload())
    assert c.post(url, content_type="application/json", data=body).status_code == 401
    assert c.post(url, content_type="application/json", data=body, headers=bearer(acct["session"])).status_code == 401          # sessions can't write
    assert c.post(url, content_type="application/json", data=body, headers=bearer(acct["token"] + "x")).status_code == 401
    assert c.post(url, content_type="application/json", data=body, headers=bearer(f"hhw_{'0' * 64}_abc")).status_code == 401
    assert c.get(url, headers=bearer(acct["token"])).status_code == 401                        # tokens can't read
    toks = c.get("/v1/account/tokens", headers=bearer(acct["session"])).json["tokens"]
    assert len(toks) == 1 and set(toks[0]) == {"id", "scope", "created", "expires", "last_used"}
    assert c.delete(f"/v1/account/tokens/{toks[0]['id']}", headers=bearer(acct["session"])).status_code == 204
    assert c.post(url, content_type="application/json", data=body, headers=bearer(acct["token"])).status_code == 401


def test_no_public_key_yet_is_409_then_pubkey_fixes_it(c):
    s = c.post("/v1/account/create", json={"id": AID, "auth": AUTH}).json["session"]
    tok = c.post("/v1/account/tokens", json={}, headers=bearer(s)).json["token"]
    assert c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(tok)).status_code == 409
    assert c.post("/v1/account/pubkey", json={"pub": "bm9wZQ=="}, headers=bearer(s)).status_code == 422
    assert c.post("/v1/account/pubkey", json={"pub": keypair(1024)[1]}, headers=bearer(s)).status_code == 422
    assert c.post("/v1/account/pubkey", json={"pub": PUB}, headers=bearer(s)).status_code == 204
    assert c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(tok)).status_code == 201


def test_schema_rejects_and_never_stores_marker(c, acct, tmp_path):
    url = "/v1/me/records"
    for bad in [payload(note=MARKER), payload(device="Pat's Apple Watch"),
                payload(workouts=[{"sport": "squash", "start_s": 10, "end_s": 1, "device": "X"}]),
                payload(workouts=[{"sport": "squash", "start_s": "10", "end_s": 1}]),
                payload(marks=[{"sport": "golf", "t_s": 5}])]:
        r = c.post(url, content_type="application/json", data=json.dumps(bad), headers=bearer(acct["token"]))
        assert r.status_code == 422 and r.get_json() == {"error": "rejected", "status": 422} and MARKER.encode() not in r.data
    assert MARKER not in "".join(p.read_text() for p in tmp_path.iterdir())
    assert c.post(url, content_type="application/json", data="x" * (128 * 1024 + 1), headers=bearer(acct["token"])).status_code == 413


def test_list_format_and_marks(c, acct):
    good = {"v": 1, "workouts": [{"sport": "squash", "start_s": 86400, "end_s": 0, "kcal": None, "src": "watch",
                                  "hr_t": ["2026-11-07T18:01:02-05:00", "2026-11-07T18:01:07-05:00"], "hr_v": [150, 151.5]}],
            "rhr": [], "hrv": [], "effort": [], "marks": [{"sport": "walking", "t_s": 5000}]}
    assert c.post("/v1/me/records", content_type="application/json", data=json.dumps(good), headers=bearer(acct["token"])).status_code == 201
    for change in [{"hr_v": [150]}, {"hr_v": [1336, 151]}, {"hr_t": ["Nov 7", "x"]}]:
        d = json.loads(json.dumps(good))
        d["workouts"][0].update(change)
        assert c.post("/v1/me/records", content_type="application/json", data=json.dumps(d), headers=bearer(acct["token"])).status_code == 422


def test_inbox_is_capped(c, acct, monkeypatch):
    monkeypatch.setattr(records, "MAX_INBOX", 3)
    for _ in range(5):
        c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"]))
    got = c.get("/v1/me/records", headers=bearer(acct["session"])).json["records"]
    assert [x["id"] for x in got] == [3, 4, 5]


def test_delete_account_removes_inbox(c, acct, tmp_path):
    c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"]))
    assert c.post("/v1/account/delete", headers=bearer(acct["session"])).status_code == 204
    assert list(tmp_path.iterdir()) == []


def test_no_logging_full_cycle(c, acct, caplog):
    caplog.set_level(logging.DEBUG)
    c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"]))
    c.get("/v1/me/records", headers=bearer(acct["session"]))
    assert caplog.records == []


def test_backfill_window_60_days_ok_62_rejected(c, acct):
    day = 86400
    ok = payload(workouts=[{"sport": "squash", "start_s": 60 * day, "end_s": 60 * day - 2700, "src": "watch",
                            "hr": [{"t_s": 60 * day - 100, "v": 150.0}]}],
                 rhr=[{"t_s": d * day, "v": 52.0} for d in range(60)], hrv=[{"t_s": d * 3600, "v": 60.0} for d in range(400)])
    assert c.post("/v1/me/records", content_type="application/json", data=json.dumps(ok), headers=bearer(acct["token"])).status_code == 201
    old = payload(workouts=[{"sport": "squash", "start_s": 62 * day, "end_s": 62 * day - 2700}])
    assert c.post("/v1/me/records", content_type="application/json", data=json.dumps(old), headers=bearer(acct["token"])).status_code == 422


def test_receive_time_is_rounded_outside_exact_inside(c, acct):
    r = c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"])).json
    assert r["at"] % 3600 == 0
    rec = c.get("/v1/me/records", headers=bearer(acct["session"])).json["records"][0]
    assert rec["at"] % 3600 == 0 and unseal(rec)["received"] >= rec["at"]


def test_delete_after_sync_and_ids_never_repeat(c, acct):
    for _ in range(3):
        c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"]))
    assert c.delete("/v1/me/records?upto=3", headers=bearer(acct["session"])).status_code == 204
    assert c.get("/v1/me/records", headers=bearer(acct["session"])).json["records"] == []
    assert c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"])).json["id"] == 4
    assert c.delete("/v1/me/records?upto=x", headers=bearer(acct["session"])).status_code == 422
    assert c.delete("/v1/me/records?upto=9", headers=bearer(acct["token"])).status_code == 401   # tokens cannot delete


def test_uncollected_records_expire_after_30_days(c, acct):
    c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"]))
    items = records.read_inbox(AID)
    items[0]["at"] -= 31 * 86400                                   # pretend it arrived 31 days ago
    records.write_inbox(AID, items)
    assert c.get("/v1/me/records", headers=bearer(acct["session"])).json["records"] == []
    c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"]))
    assert [r["id"] for r in records.read_inbox(AID)] == [2]        # the stale one is gone from disk too



def test_json_only_and_version_header(c, acct):
    r = c.post("/v1/me/records", data=json.dumps(payload()), headers=bearer(acct["token"]))      # no JSON content type
    assert r.status_code == 415 and r.headers["API-Version"] == "1.1" and r.headers["Cache-Control"] == "no-store"


def test_per_token_write_limit_with_retry_after(c, acct, monkeypatch):
    monkeypatch.setattr(relay_app, "WRITE_PER_TOKEN", relay_app.KeyedWindow(2, 3600))
    send = lambda: c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"]))
    assert send().status_code == 201 and send().status_code == 201
    r = send()
    assert r.status_code == 429 and 0 < int(r.headers["Retry-After"]) <= 3600
    other = c.post("/v1/account/tokens", json={}, headers=bearer(acct["session"])).json["token"]   # another device still works
    assert c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(other)).status_code == 201


def test_tokens_expire_and_record_last_used(c, acct):
    c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"]))
    tok = c.get("/v1/account/tokens", headers=bearer(acct["session"])).json["tokens"][0]
    assert tok["last_used"] is not None and tok["expires"] > tok["created"]
    rec = accounts.read_account(AID)
    rec["tokens"][0]["expires"] = "2000-01-01"
    accounts._write(AID, rec)
    assert c.post("/v1/me/records", content_type="application/json", data=json.dumps(payload()), headers=bearer(acct["token"])).status_code == 401


@pytest.mark.parametrize("days", [0, 366, "30", True])
def test_token_lifetime_is_1_to_365_days(c, acct, days):
    assert c.post("/v1/account/tokens", json={"days": days}, headers=bearer(acct["session"])).status_code == 422


def test_session_rate_limit(c, acct, monkeypatch):
    monkeypatch.setattr(relay_app, "SESSION_LIMIT", relay_app.KeyedWindow(3, 60))
    codes = [c.get("/v1/me/records", headers=bearer(acct["session"])).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]



def test_vo2_and_sleep_are_accepted_and_bounded(c, acct):
    ok = payload(vo2=[{"t_s": 86400 * d, "v": 47.5} for d in range(10)], sleep=[{"t_s": 86400 * d + 3600, "v": 430.0} for d in range(60)])
    assert c.post("/v1/me/records", content_type="application/json", data=json.dumps(ok), headers=bearer(acct["token"])).status_code == 201
    got = c.get("/v1/me/records", headers=bearer(acct["session"])).json["records"][0]
    assert unseal(got)["record"]["sleep"][0] == {"t_s": 3600, "v": 430.0}
    too_long = payload(sleep=[{"t_s": 1, "v": 1200.0}])                        # 20 h asleep is not a night
    assert c.post("/v1/me/records", content_type="application/json", data=json.dumps(too_long), headers=bearer(acct["token"])).status_code == 422



def test_client_sealed_record_is_stored_without_the_relay_reading_it(c, acct, tmp_path):
    from cryptography.hazmat.primitives.serialization import load_der_public_key
    inner = json.dumps({"received": 1794103242, "record": payload()}).encode()
    aes, nonce = AESGCM.generate_key(bit_length=256), b"\x07" * 12
    pub = load_der_public_key(base64.b64decode(PUB))
    env = {"key": base64.b64encode(pub.encrypt(aes, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))).decode(),
           "nonce": base64.b64encode(nonce).decode(), "ct": base64.b64encode(AESGCM(aes).encrypt(nonce, inner, None)).decode()}
    r = c.post("/v1/me/records", content_type="application/json", data=json.dumps({"sealed": env}), headers=bearer(acct["token"]))
    assert r.status_code == 201
    got = c.get("/v1/me/records", headers=bearer(acct["session"])).json["records"][0]
    assert {k: got[k] for k in ("key", "nonce", "ct")} == env                    # stored exactly as the device sealed it
    assert unseal(got) == {"received": 1794103242, "record": payload()}


@pytest.mark.parametrize("env", [{"key": "AAAA", "nonce": "AAAA", "ct": "AAAA"}, {"key": "x", "nonce": "y"}, "nope"])
def test_bad_envelopes_fall_through_to_the_schema_and_are_rejected(c, acct, env):
    r = c.post("/v1/me/records", content_type="application/json", data=json.dumps({"sealed": env}), headers=bearer(acct["token"]))
    assert r.status_code == 422


def test_open_returns_the_public_key(c):
    c.post("/v1/account/create", json={"id": AID, "auth": AUTH, "pub": PUB})
    assert c.post("/v1/account/open", json={"id": AID, "auth": AUTH}).json["pub"] == PUB
