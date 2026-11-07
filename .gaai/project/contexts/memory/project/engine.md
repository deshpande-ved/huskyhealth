---
type: memory
category: project
id: PROJECT-ENGINE-001
tags:
  - engine
  - science
  - readiness
  - load
  - validation
  - references
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (sections 7.1–7.4)
related:
  - project/data-parsers-features.md
---

# Engine (published methods, versioned)

## 7.1 Each number and its source
| Piece | Method | Source | Status |
|---|---|---|---|
| Zone minutes | time in 50–60 / 60–70 / 70–80 / 80–90 / 90–100 % of max HR | Edwards 1993 | published |
| Session load (HR) | TRIMP = Σ zone minutes × 1…5 | Edwards 1993 | published |
| Session load (effort) | session-RPE = effort × minutes | Foster et al. 2001 | published; independent of wrist HR (noisy in racket sports) |
| Fitness / fatigue / form | 42-day and 7-day impulse-response averages of daily TRIMP; form = fitness − fatigue | Banister et al. 1975 | published, standard constants |
| Repetitive training | monotony = mean ÷ SD of last 7 daily loads; flag > 2 | Foster 1998 | published |
| **Readiness call** | 7-day rolling mean of daily ln(HRV) vs. baseline mean ± 0.5 SD. Inside → hard is fine; outside either way → easy | Plews et al. 2013–14; HRV-guided training studies | **adapted** (Watch gives SDNN at random times; studies used morning rMSSD) |
| Data check | ≥ 3 days with HRV in last 7, else "not enough data" | Plews et al. 2014 | published |
| Baseline length | ≥ 14 days with HRV before the last 7 | ours | labeled as ours |
| Load spike | last 7 days ÷ (last 28 days ÷ 4) | acute:chronic ratio (Gabbett) | disputed: info only, never "injury risk" |
| VO2 max trend | least-squares slope × 28 days | Apple's estimate (outdoor walks, runs, hikes) | descriptive |
| Sport-specific view | your squash sessions vs. your own squash history | ours (statistics, no invented multipliers) | labeled as ours |

**Removed (uncitable):** HuskyScore 0–100 weights, squash × 1.10 multiplier, resting-HR/HRV-drop thresholds.

## 7.2 `web/js/engine.js` (sketch)
```js
// web/js/engine.js: pure functions; same inputs → same outputs; the References page mirrors this file
export const VERSION = { load: "husky_load_v1", readiness: "husky_readiness_v1" };
const ZONE_W = [1, 2, 3, 4, 5];                          // Edwards: 50–60 … 90–100 % of max HR

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// minutes in each Edwards zone from HR samples [ms, bpm] inside a workout window
export function zoneMinutes(hr, start, end, maxHr) {
  const w = hr.filter(([t]) => t >= start && t <= end).sort((a, b) => a[0] - b[0]);
  const z = [0, 0, 0, 0, 0];
  for (let i = 0; i < w.length - 1; i++) {
    const dtMin = Math.min((w[i + 1][0] - w[i][0]) / 60000, 1);   // cap sensor gaps at 1 min
    const pct = w[i][1] / maxHr;
    if (pct >= 0.5) z[Math.min(4, Math.floor((pct - 0.5) * 10))] += dtMin;
  }
  return z;
}

export const trimp = (zoneMin) => zoneMin.reduce((s, m, i) => s + m * ZONE_W[i], 0);
export const srpe = (effort, minutes) => (effort ? effort * minutes : null);   // Foster et al. 2001

// Banister impulse-response; dailyLoad is oldest → today
export function fitnessFatigue(dailyLoad) {
  let fitness = mean(dailyLoad.slice(0, 7));              // seed with week 1 to soften the cold start
  let fatigue = fitness;
  const series = dailyLoad.map((x) => {
    fitness += (x - fitness) / 42;
    fatigue += (x - fatigue) / 7;
    return { fitness, fatigue };
  });
  return { fitness, fatigue, form: fitness - fatigue, series };
}

// Foster: mean ÷ SD of the last 7 daily loads
export function monotony(last7) {
  const m = mean(last7);
  const sd = Math.sqrt(mean(last7.map((x) => (x - m) ** 2)));
  return sd ? m / sd : null;
}

// Readiness, adapted from Plews et al.: rolling 7-day ln(HRV) vs. baseline mean ± 0.5 SD
export function readiness(dailyLnHrv) {                  // oldest → today; null where no reading
  const last7 = dailyLnHrv.slice(-7).filter((v) => v != null);
  const base = dailyLnHrv.slice(0, -7).filter((v) => v != null);
  if (last7.length < 3 || base.length < 14) {
    return { call: "not_enough_data", n7: last7.length, nBase: base.length };
  }
  const mu = mean(base);
  const sd = Math.sqrt(base.reduce((s, v) => s + (v - mu) ** 2, 0) / (base.length - 1));
  const roll = mean(last7);
  return {
    call: Math.abs(roll - mu) <= 0.5 * sd ? "hard" : "easy",
    z: sd ? (roll - mu) / sd : 0, n7: last7.length, nBase: base.length,
  };
}
```

## 7.3 References page
- One card per 7.1 row: what it measures, one-line formula, citation, published / adapted / ours.
- Plain caveats: SDNN vs. morning rMSSD; max HR observed not tested; Garmin-only users have no HRV; "training insight, not medical advice".
- Every main-screen metric links to its card ("backup science" judges can tap).

## 7.4 Validity and eligibility
- **Eligibility:** formulas are published science; all code written after 11:00 Saturday. Libraries open source and credited: fflate (MIT), Garmin FIT SDK (Garmin's license), Presidio (MIT), mitmproxy (MIT).
- **Claim:** training insight, not medical advice. No diagnosis, disease or "injury risk" → general-wellness tool, not a medical device. Use this wording everywhere.
- **Validity, four layers:**
  1. **Unit tests:** hand-worked examples for every 7.1 row (Edwards weights, Foster sRPE + monotony, Banister 42/7, Plews band). Must pass before any UI work.
  2. **Reference cross-check (F15):** import the same `.FIT` files into GoldenCheetah (GPL v2), zones at 50/60/70/80/90 % of the same max HR; PMC from **TRIMP Zonal Points**; compare CTL/ATL vs. our fitness/fatigue day by day. Target: curves overlap after seeding windows; report correlation on References. No GPL code enters HuskyHealth.
  3. **Scenario tests:** 2-week taper raises form; doubled week sets `load_spike` and drops form; 7 identical loads, no rest → monotony flag; HRV 1 SD below baseline for a week → "easy"; 3 HRV readings in a week suffice, 2 don't.
  4. **Data gates (shown in UI):** workout HR averages ≥ 1 sample / 15 s else zones low-confidence; < 3 sessions reaching zone 4–5 → "max HR may be underestimated"; HRV ≥ 3 of last 7 days + 14 baseline days else "not enough data"; missing effort → "rate your effort".
- **Can't claim this weekend:** that following the call improves users' training (method is supported, product untested); Ved's 60 days are an anecdote (n = 1). Next: semester pilot with Club Squash (calls vs. session ratings and match results, with consent); also the Startup slide's ask.
