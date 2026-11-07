---
type: memory
category: project
id: PROJECT-PARSERS-003
tags:
  - data
  - features
  - contract
  - engine
  - privacy
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (sections 6.3 features.js, 6.5)
related:
  - project/data-parsers-apple.md
  - project/data-parsers-garmin.md
  - project/engine.md
---

# Data: `features.js` and the Features JSON contract

## `features.js` → `toFeatures()` (shared by both parsers)
- `max_hr`: highest HR sample in the window, rounded. Underestimates if you never max out → say so on the References page.
- **Per workout:**
  - sport from activity type (`…Squash` → `squash`, `…Running` → `running`, else `other`)
  - zone minutes (engine 7.2) and TRIMP
  - effort: user's score inside the workout window, else Apple's estimate, else none
  - session-RPE load = effort × minutes
  - relative day
  - source label normalized to "Apple Watch", "Garmin" or "Other app"; **never the owner's name**
  - `hr_sample_ok`: true when the window has ≥ floor(duration_s / 15) HR samples (≥ 1 per 15 s); feeds the engine's HR-density data gate (Ved, 2026-11-07)
- **Per day:** TRIMP, session-RPE load, mean resting HR, mean ln(SDNN) of that day's readings, VO2 max if any.
- Everything stays in the browser. **IndexedDB keeps only this features JSON.**

## 6.5 Features JSON (the engine contract; never leaves the phone)
```json
{
  "v": 1,
  "source": "apple_health",
  "window_days": 60,
  "max_hr": 196,
  "days": [
    { "day": -1, "trimp": 195, "srpe": 420, "rhr": 52, "ln_hrv": 4.11, "vo2": null },
    { "day": 0, "trimp": 0, "srpe": null, "rhr": 53, "ln_hrv": 4.02, "vo2": 47.5 }
  ],
  "workouts": [
    { "day": -1, "sport": "squash", "min": 60, "kcal": 555, "zone_min": [3, 11, 21, 18, 7],
      "trimp": 195, "effort": 7, "srpe": 420, "source": "Apple Watch", "hr_sample_ok": true }
  ]
}
```
