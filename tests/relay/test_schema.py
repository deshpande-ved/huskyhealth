# E05S01: strict schemas.
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from schema import BriefIn, SpeakIn

SAMPLE = json.loads((Path(__file__).resolve().parents[1] / "fixtures" / "briefin-sample.json").read_text())


def bad(**change):
    d = dict(SAMPLE)
    d.update(change)
    return json.dumps(d)


def test_sample_validates():
    assert BriefIn.model_validate_json(json.dumps(SAMPLE)).call == "hard"


@pytest.mark.parametrize("payload", [
    bad(name="Pat"),                         # unknown field
    bad(fitness="47"),                       # string for a number
    bad(hrv_days7=8),                        # out of range
    bad(zone_pct7=[25, 25, 25, 25]),         # wrong length
    bad(flags=["monotony", "load_spike", "monotony"]),
    bad(flags=["injury"]),
])
def test_brief_rejects(payload):
    with pytest.raises(ValidationError):
        BriefIn.model_validate_json(payload)


@pytest.mark.parametrize("payload", ['{"text": ""}', json.dumps({"text": "x" * 601}), '{"text": "hi", "voice": "x"}'])
def test_speak_rejects(payload):
    with pytest.raises(ValidationError):
        SpeakIn.model_validate_json(payload)
