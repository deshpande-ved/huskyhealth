---
type: memory
category: project
id: PROJECT-AI-002
tags:
  - ai
  - claude
  - relay
  - schema
  - privacy
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (section 8.3)
related:
  - project/ai-voice.md   # rest of section 8
---

# Readiness Brief: the Claude Call (relay)

> Part 2 of section 8. Code sketches copied exactly from the plan.

- **What Claude gets:** rounded derived numbers plus the call and flags. No dates, no per-workout timeline, no source, no identity.
- **Model:** `claude-haiku-5-5`, `max_tokens` 300.

## Rounding

| Field | Rounded to |
|---|---|
| call, flags | sent as-is (fixed words) |
| hrv_z | 0.25 |
| hrv_days7 | exact (0–7) |
| fitness, fatigue, form | 10 |
| load7, load_prev7, srpe7 | 50 |
| monotony | 0.5 |
| ramp | 0.1 |
| zone % | 5 |
| VO2 trend | 0.5 |
| RHR delta | 1 |
| sport mix % | 10 |

## `relay/schema.py`

```python
# relay/schema.py
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field

Sport = Literal["squash", "running", "cycling", "strength", "hiit", "walking", "other"]
Pct = Annotated[int, Field(ge=0, le=100)]


class BriefIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)    # unknown field → 422; "47" ≠ 47

    v: Literal[1]
    call: Literal["hard", "easy", "not_enough_data"]
    flags: list[Literal["monotony", "load_spike"]] = Field(default_factory=list, max_length=2)
    hrv_z: float | None = Field(default=None, ge=-6, le=6)
    hrv_days7: int = Field(ge=0, le=7)
    fitness: float = Field(ge=0, le=500)
    fatigue: float = Field(ge=0, le=1000)
    form: float = Field(ge=-1000, le=500)
    load7: float = Field(ge=0, le=7000)
    load_prev7: float = Field(ge=0, le=7000)
    srpe7: float | None = Field(default=None, ge=0, le=10000)
    monotony: float | None = Field(default=None, ge=0, le=20)
    ramp: float | None = Field(default=None, ge=0, le=10)
    zone_pct7: list[Pct] = Field(min_length=5, max_length=5)
    zone_pct42: list[Pct] = Field(min_length=5, max_length=5)
    vo2_trend_4w: float | None = Field(default=None, ge=-20, le=20)
    rhr_delta: int | None = Field(default=None, ge=-40, le=40)
    sport_mix: dict[Sport, Pct] = Field(default_factory=dict)


class SpeakIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str = Field(min_length=1, max_length=600)
```

## `relay/ai.py`

```python
# relay/ai.py
import json, os
from anthropic import Anthropic

CLIENT = Anthropic(base_url=os.environ["ANTHROPIC_BASE_URL"])   # http://egress:8080 → mitmweb → Claude

SYSTEM = ("You are a sports coach writing a readiness brief for one unidentified athlete. You get "
          "rounded training signals and a call that is already decided: 'hard' (heart-rate "
          "variability is inside the athlete's normal band, so a hard session is fine), 'easy' "
          "(it is outside the band), or 'not_enough_data'. Explain the call, never change it. Write "
          "2-3 short sentences a person can hear in under 30 seconds: the call, the one or two signals "
          "behind it, and one concrete suggestion for today. Mention flags as load alerts, never as "
          "injury risk. No medical advice or diagnoses, no names, no dates, no questions back.")


def r(x, step):
    return None if x is None else round(round(x / step) * step, 2)


def bucketize(s) -> dict:
    return {
        "call": s.call, "flags": s.flags,
        "hrv_z": r(s.hrv_z, 0.25), "hrv_days7": s.hrv_days7,
        "fitness": r(s.fitness, 10), "fatigue": r(s.fatigue, 10), "form": r(s.form, 10),
        "load7": r(s.load7, 50), "load_prev7": r(s.load_prev7, 50), "srpe7": r(s.srpe7, 50),
        "monotony": r(s.monotony, 0.5), "ramp": r(s.ramp, 0.1),
        "zone_pct7": [r(z, 5) for z in s.zone_pct7], "zone_pct42": [r(z, 5) for z in s.zone_pct42],
        "vo2_trend_4w": r(s.vo2_trend_4w, 0.5), "rhr_delta": r(s.rhr_delta, 1),
        "sport_mix": {k: r(v, 10) for k, v in s.sport_mix.items()},
    }


def claude_brief(prompt: str) -> str:
    msg = CLIENT.messages.create(model="claude-haiku-5-5", max_tokens=300, system=SYSTEM,
                                 messages=[{"role": "user", "content": prompt}])
    return "".join(b.text for b in msg.content if b.type == "text")
```
