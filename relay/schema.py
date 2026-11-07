# relay/schema.py: strict request schemas. Unknown field -> 422; "47" is not 47. Never echo ValidationError.
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field

Sport = Literal["squash", "running", "cycling", "strength", "hiit", "walking", "other"]
Pct = Annotated[int, Field(ge=0, le=100)]


class BriefIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

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
