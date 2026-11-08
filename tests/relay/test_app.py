# The relay app: health check, /v1 only, quiet errors.
import pytest

import app as relay_app

SENTINEL = "SENTINEL-7f3a9c"


@pytest.fixture()
def client():
    return relay_app.app.test_client()


def test_healthz_and_v1_only(client):
    r = client.get("/v1/healthz")
    assert r.status_code == 200 and r.data == b"ok"
    assert all(rule.rule.startswith("/v1/") for rule in relay_app.app.url_map.iter_rules())


def test_errors_are_generic(client, monkeypatch):
    cases = [
        client.get(f"/{SENTINEL}"),
        client.get(f"/v1/{SENTINEL}"),
        client.post("/v1/healthz"),                                        # wrong method
        client.post("/v1/account/open", data=SENTINEL * 50000),           # too large
    ]
    for r in cases:
        assert r.status_code >= 400 and SENTINEL.encode() not in r.data
        assert set(r.get_json()) == {"error", "status"} and r.headers["API-Version"] == "1.1"

    with relay_app.app.app_context():                               # unhandled exception -> fixed body
        body, code, _headers = relay_app.any_error(RuntimeError(SENTINEL))
    assert code == 500 and body == {"error": "server error", "status": 500}
