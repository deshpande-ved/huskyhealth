# Accounts: zero-knowledge vaults. The Pi stores only a scrypt hash and ciphertext, never the username or plaintext.
import base64
import hashlib
import os

import pytest

import accounts
import app as relay_app

AID = hashlib.sha256(b"huskyhealth:ved").hexdigest()
AUTH = base64.b64encode(b"A" * 32).decode()
WRONG = base64.b64encode(b"B" * 32).decode()


@pytest.fixture()
def c(tmp_path, monkeypatch):
    monkeypatch.setattr(accounts, "VAULT_DIR", str(tmp_path))
    monkeypatch.setattr(relay_app, "ACCOUNT_LIMIT", relay_app.Window(100, 60))
    accounts.SESSIONS.clear()
    return relay_app.app.test_client()


def create(c, aid=AID, auth=AUTH):
    return c.post("/v1/account/create", json={"id": aid, "auth": auth})


def test_create_open_save_reopen(c):
    r = create(c)
    assert r.status_code == 201 and r.json["vault"] is None
    s = r.json["session"]
    blob = base64.b64encode(b"\x01ciphertext-bytes").decode()
    assert c.post("/v1/account/vault", json={"vault": blob}, headers={"Authorization": f"Bearer {s}"}).status_code == 204
    r = c.post("/v1/account/open", json={"id": AID, "auth": AUTH})
    assert r.status_code == 200 and r.json["vault"] == blob and r.json["session"] != s


def test_duplicate_create_is_409(c):
    assert create(c).status_code == 201
    assert create(c).status_code == 409


def test_wrong_password_and_unknown_account_look_the_same(c):
    create(c)
    wrong = c.post("/v1/account/open", json={"id": AID, "auth": WRONG})
    unknown = c.post("/v1/account/open", json={"id": "0" * 64, "auth": AUTH})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json == unknown.json == {"error": "unauthorized"}


@pytest.mark.parametrize("body", [
    {"id": "ved", "auth": AUTH},                                   # a raw username is refused: ids are hashes
    {"id": AID, "auth": base64.b64encode(b"short").decode()},     # auth must be a 32-byte key
    {"id": AID, "auth": AUTH, "password": "x"},                   # unknown fields refused
    {"id": AID},
])
def test_bad_credentials_rejected(c, body):
    assert c.post("/v1/account/create", json=body).status_code == 422


def test_vault_needs_session_and_cap(c):
    s = create(c).json["session"]
    assert c.post("/v1/account/vault", json={"vault": "AAAA"}).status_code == 401
    assert c.post("/v1/account/vault", json={"vault": "AAAA"}, headers={"Authorization": "Bearer nope"}).status_code == 401
    big = "A" * (accounts.MAX_VAULT + 4)
    assert c.post("/v1/account/vault", json={"vault": big}, headers={"Authorization": f"Bearer {s}"}).status_code in (413,)
    assert c.post("/v1/account/vault", json={"vault": "not base64!"}, headers={"Authorization": f"Bearer {s}"}).status_code == 422


def test_session_expires(c, monkeypatch):
    s = create(c).json["session"]
    aid, _ = accounts.SESSIONS[s]
    accounts.SESSIONS[s] = (aid, 0)
    assert c.post("/v1/account/vault", json={"vault": "AAAA"}, headers={"Authorization": f"Bearer {s}"}).status_code == 401


def test_delete_removes_file_and_sessions(c, tmp_path):
    s = create(c).json["session"]
    assert (tmp_path / f"{AID}.json").exists()
    assert c.post("/v1/account/delete", headers={"Authorization": f"Bearer {s}"}).status_code == 204
    assert not (tmp_path / f"{AID}.json").exists()
    assert c.post("/v1/account/open", json={"id": AID, "auth": AUTH}).status_code == 401


def test_disk_holds_nothing_readable(c, tmp_path):
    """What is on the Pi's disk: a hash id, salt, scrypt hash, ciphertext. No username, no auth key, no plaintext."""
    s = create(c).json["session"]
    c.post("/v1/account/vault", json={"vault": base64.b64encode(os.urandom(64)).decode()}, headers={"Authorization": f"Bearer {s}"})
    files = list(tmp_path.iterdir())
    assert [f.name for f in files] == [f"{AID}.json"]
    raw = files[0].read_text()
    assert "ved" not in raw and AUTH not in raw and set(__import__("json").loads(raw)) == {"v", "salt", "hash", "vault"}


def test_rate_limited(c, monkeypatch):
    monkeypatch.setattr(relay_app, "ACCOUNT_LIMIT", relay_app.Window(1, 60))
    create(c)
    assert c.post("/v1/account/open", json={"id": AID, "auth": AUTH}).status_code == 429
