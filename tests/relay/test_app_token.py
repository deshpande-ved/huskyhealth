# E05S02: health check, token route, rate limit, quiet errors.
import pytest

import app as relay_app

SENTINEL = "SENTINEL-7f3a9c"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(relay_app, "TOKEN_LIMIT", relay_app.Window(30, 60))
    return relay_app.app.test_client()


def test_healthz_and_v1_only(client):
    r = client.get("/v1/healthz")
    assert r.status_code == 200 and r.data == b"ok"
    assert all(rule.rule.startswith("/v1/") for rule in relay_app.app.url_map.iter_rules())


def test_token_kinds(client):
    for kind in ("brief", "listen"):
        r = client.post(f"/v1/token?kind={kind}")
        assert r.status_code == 200 and len(r.get_json()["token"]) >= 20
    for q in ("", "?kind=speak", f"?kind={SENTINEL}"):
        r = client.post(f"/v1/token{q}")
        assert r.status_code == 422 and SENTINEL.encode() not in r.data


def test_rate_limit_window(client, monkeypatch):
    now = [100.0]
    monkeypatch.setattr(relay_app.time, "monotonic", lambda: now[0])
    for _ in range(30):
        assert client.post("/v1/token?kind=brief").status_code == 200
    r = client.post("/v1/token?kind=brief")
    assert r.status_code == 429 and r.get_json() == {"error": "slow down"}
    now[0] += 61
    assert client.post("/v1/token?kind=brief").status_code == 200


def test_errors_are_generic(client, monkeypatch):
    cases = [
        client.get(f"/{SENTINEL}"),
        client.get(f"/v1/{SENTINEL}"),
        client.get("/v1/token"),                                           # wrong method
        client.post("/v1/token?kind=brief", data=SENTINEL * 50000),        # too large
    ]
    for r in cases:
        assert r.status_code >= 400 and SENTINEL.encode() not in r.data
        assert set(r.get_json()) == {"error"}

    with relay_app.app.app_context():                               # unhandled exception -> fixed body
        body, code = relay_app.any_error(RuntimeError(SENTINEL))
    assert code == 500 and body == {"error": "server error"}
