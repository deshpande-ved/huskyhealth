# E05S01: single-use RAM tokens.
import re
from pathlib import Path

import tokens


def test_single_use():
    t = tokens.mint("brief")
    assert tokens.burn(t, "brief") is True
    assert tokens.burn(t, "brief") is False


def test_wrong_kind_and_expiry_remove_the_token(monkeypatch):
    t = tokens.mint("brief")
    assert tokens.burn(t, "listen") is False
    assert t not in tokens._TOKENS
    now = [1000.0]
    monkeypatch.setattr(tokens.time, "monotonic", lambda: now[0])
    t2 = tokens.mint("brief", ttl=600)
    now[0] += 601
    assert tokens.burn(t2, "brief") is False
    assert t2 not in tokens._TOKENS


def test_speak_token_bound_to_text():
    t = tokens.mint("speak", bound=tokens.digest("hello"))
    assert tokens.burn(t, "speak", bound=tokens.digest("other")) is False
    t = tokens.mint("speak", bound=tokens.digest("hello"))
    assert tokens.burn(t, "speak", bound=tokens.digest("hello")) is True


def test_ram_only():
    src = (Path(tokens.__file__)).read_text()
    assert "threading.Lock()" in src and "secrets.token_urlsafe(16)" in src
    assert not re.search(r"open\(|write|pickle|shelve|sqlite", src)
