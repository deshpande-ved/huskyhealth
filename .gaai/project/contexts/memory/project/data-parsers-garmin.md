---
type: memory
category: project
id: PROJECT-PARSERS-002
tags:
  - data
  - parser
  - garmin
  - fit
  - web-worker
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (sections 6.2, 6.4)
related:
  - project/data-parsers-apple.md
  - project/data-parsers-features.md
---

# Data: Garmin

## 6.2 Paths in
- **Garmin on iPhone (P0, covered):** Garmin Connect for iOS can write HR, workouts, sleep etc. into Apple Health → those users export Health like everyone else.
  - Detail varies: check that Garmin workouts in Health show heart rate.
  - HRV may not come across → readiness shows "not enough data"; load still works.
- **Any Garmin (P1):** `.FIT` activity files decoded on the device with Garmin's official FIT JavaScript SDK (`@garmin/fitsdk`, browser-compatible).
  - Sources: Garmin Connect web → activity → **Export Original**, or the watch's `GARMIN/Activity` folder over USB.
  - Garmin's full account export arrives later by email: too slow for a demo.
  - Activity files have HR and sessions but no overnight HRV → Garmin-only users get load, fitness, fatigue; readiness needs HRV.
  - Check how sample files label squash. Unknown sports map to `other`.
- **Never** log into Garmin Connect on the user's behalf. Unofficial scrapers need the password on a server: the opposite of this project.

## 6.4 Parser (`web/js/parse-fit.worker.js`, sketch)
```js
// web/js/parse-fit.worker.js: Garmin .FIT files, decoded on the device with Garmin's official SDK
import { Decoder, Stream } from "../vendor/fitsdk/index.js";
import { toFeatures } from "./features.js";

self.onmessage = async ({ data: { files, days = 60 } }) => {
  const samples = { hr: [], rhr: [], hrv: [], vo2: [], effort: [], effortEst: [] };
  const workouts = [];
  for (const file of files) {
    const decoder = new Decoder(Stream.fromByteArray(new Uint8Array(await file.arrayBuffer())));
    if (!decoder.isFIT()) continue;
    const { messages } = decoder.read();                    // FIT dates come back as JS Date objects
    for (const r of messages.recordMesgs ?? []) {
      if (r.heartRate) samples.hr.push([r.timestamp.getTime(), r.heartRate]);
    }
    for (const s of messages.sessionMesgs ?? []) {
      const start = s.startTime.getTime();
      workouts.push({ type: String(s.sport), start, end: start + s.totalTimerTime * 1000,
                      min: s.totalTimerTime / 60, kcal: s.totalCalories ?? null, source: "Garmin" });
    }
  }
  self.postMessage({ done: true, features: toFeatures({ samples, workouts, days, source: "garmin_fit" }) });
};
```
