# E05S02 / PRIV-6: nothing a client sends shows up in logs or stdout/stderr.
import logging
import re
from pathlib import Path

import app as relay_app

SENTINEL = "SENTINEL-log-55d1"
RELAY = Path(relay_app.__file__).resolve().parent


def test_sentinel_never_logged(caplog, capfd):
    caplog.set_level(logging.DEBUG)
    c = relay_app.app.test_client()
    h = {"X-Note": SENTINEL, "Authorization": f"Bearer {SENTINEL}", "Content-Type": "application/json"}
    c.get(f"/v1/healthz?x={SENTINEL}", headers=h)
    c.post(f"/v1/token?kind=brief&x={SENTINEL}", data=SENTINEL, headers=h)
    c.post(f"/v1/token?kind={SENTINEL}", data='{"a": "%s"}' % SENTINEL, headers=h)
    c.get(f"/{SENTINEL}", headers=h)
    out, err = capfd.readouterr()
    assert SENTINEL not in caplog.text and SENTINEL not in out and SENTINEL not in err


def test_priv6_grep():
    for f in RELAY.glob("*.py"):
        src = f.read_text()
        assert not re.search(r"log(ger)?\.\w+\(.*(body|request\.json|brief|prompt|audio|errors\(\))", src), f.name
        assert "print(" not in src, f.name


def test_deploy_doc():
    doc = (RELAY.parent / "docs" / "relay-deploy.md").read_text()
    for cmd in ["git clone git@github.com:<owner>/huskyhealth.git", "chmod 600", "docker compose up -d --build",
                "sudo tailscale funnel --bg --https=10000 http://localhost:8090", "tailscale funnel status",
                "git pull && docker compose up -d --build"]:
        assert cmd in doc, cmd
    assert doc.count("serve reset") == 1 and "Never run `tailscale serve reset`" in doc
    ips = set(re.findall(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", doc))
    assert ips <= {"127.0.0.1"}, ips                          # loopback only, no LAN addresses
    assert not re.search(r"\bssh \S", doc)
