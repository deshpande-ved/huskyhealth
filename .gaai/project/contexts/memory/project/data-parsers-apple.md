---
type: memory
category: project
id: PROJECT-PARSERS-001
tags:
  - data
  - parser
  - apple-health
  - web-worker
  - privacy
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (sections 6.1, 6.3)
related:
  - project/data-parsers-garmin.md
  - project/data-parsers-features.md
  - project/engine.md
---

# Data: Apple Health export + parser

## 6.1 The Health export
- Health → profile → **Export All Health Data** → `export.zip`. Inside: `apple_health_export/export.xml`, `export_cda.xml`, workout-route GPX files, ECG CSVs.
- **Only `export.xml` is opened.** Never routes, ECGs or clinical records.
- Size: big (published example: 79 MB zip → 2.45 GB, ~2 years of Watch data). **Stream it; never load whole.**
- `export.xml` contents:
  - one `<Record …>` per sample (type, sourceName, unit, startDate, endDate, value)
  - one `<Workout …>` per workout (workoutActivityType, duration, dates), with `<WorkoutStatistics>` children (type, sum, unit) carrying active calories
  - older exports put `totalEnergyBurned` on the Workout itself: handle both
- Records kept (60 days):

  | Record type | Used for |
  |---|---|
  | `HKQuantityTypeIdentifierHeartRate` | zone minutes inside workout windows; observed max HR |
  | `HKQuantityTypeIdentifierRestingHeartRate` | resting-HR context |
  | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | HRV readiness band |
  | `HKQuantityTypeIdentifierVO2Max` | VO2 max trend |
  | `HKQuantityTypeIdentifierWorkoutEffortScore` | session-RPE load (user-rated effort, 1–10) |
  | `HKQuantityTypeIdentifierEstimatedWorkoutEffortScore` | fallback effort (Apple only estimates walking, running, hiking, cycling) |

- Spike TODO: verify effort scores appear in the export as records (in HealthKit they're tied to a workout by time window).
- Export can't give: Apple's zone minutes and Training Load (computed here instead); squash effort unless rated on the Watch after each session (pre-watchOS 11 workouts have no effort).
- Squash arrives as `HKWorkoutActivityTypeSquash`.
- Other apps' workouts (Strava, Garmin Connect) have their own `sourceName`: dedupe overlaps, preferring the Watch.

## 6.3 Parser (`web/js/parse-apple.worker.js`, sketch)
Line scanner, not an XML DOM: every needed attribute is on the opening-tag line of `<Record` / `<Workout`; `<WorkoutStatistics` lines inside a workout carry calories. `fflate` streams the unzip; only the `export.xml` entry is decompressed.

```js
// web/js/parse-apple.worker.js: runs off the main thread; nothing here touches the network
import { Unzip, UnzipInflate } from "../vendor/fflate.esm.js";
import { toFeatures } from "./features.js";

const KEEP = {
  HKQuantityTypeIdentifierHeartRate: "hr",
  HKQuantityTypeIdentifierRestingHeartRate: "rhr",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
  HKQuantityTypeIdentifierVO2Max: "vo2",
  HKQuantityTypeIdentifierWorkoutEffortScore: "effort",
  HKQuantityTypeIdentifierEstimatedWorkoutEffortScore: "effortEst",
};
const ATTR = /(\w+)="([^"]*)"/g;

export function attrs(line) {
  const out = {};
  for (const [, k, v] of line.matchAll(ATTR)) out[k] = v;
  return out;
}

// "2026-10-12 18:02:11 -0400" → epoch ms
export function toMs(s) {
  return Date.parse(s.replace(" ", "T").replace(" ", "").replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
}

self.onmessage = async ({ data: { file, days = 60 } }) => {
  const cutoff = Date.now() - days * 86_400_000;
  const samples = { hr: [], rhr: [], hrv: [], vo2: [], effort: [], effortEst: [] };
  const workouts = [];
  const decoder = new TextDecoder();
  let current = null, carry = "", lines = 0;

  const onLine = (raw) => {
    const t = raw.trimStart();
    if (t.startsWith("<Record ")) {
      const a = attrs(t);
      const key = KEEP[a.type];
      if (key && toMs(a.startDate) >= cutoff) samples[key].push([toMs(a.startDate), Number(a.value)]);
    } else if (t.startsWith("<Workout ")) {
      const a = attrs(t);
      const start = toMs(a.startDate);
      current = start < cutoff ? null : {
        type: a.workoutActivityType, start, end: toMs(a.endDate),
        min: Number(a.duration), kcal: Number(a.totalEnergyBurned) || null, source: a.sourceName,
      };
      if (current && t.endsWith("/>")) { workouts.push(current); current = null; }
    } else if (current && t.startsWith("<WorkoutStatistics ")) {
      const a = attrs(t);
      if (a.type === "HKQuantityTypeIdentifierActiveEnergyBurned") current.kcal = Number(a.sum);
    } else if (current && t.startsWith("</Workout>")) {
      workouts.push(current);
      current = null;
    }
    if (++lines % 250_000 === 0) self.postMessage({ progress: lines });
  };

  const feed = (chunk, final) => {
    carry += decoder.decode(chunk, { stream: !final });
    const parts = carry.split("\n");
    carry = parts.pop();
    for (const p of parts) onLine(p);
    if (final && carry) onLine(carry);
  };

  const pump = async (sink) => {
    const reader = file.stream().getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return sink(new Uint8Array(0), true);
      sink(value, false);
    }
  };

  if (file.name.toLowerCase().endsWith(".xml")) {
    await pump(feed);                                       // already unzipped (e.g. on a Mac)
  } else {
    await new Promise((resolve, reject) => {
      const unzip = new Unzip();
      unzip.register(UnzipInflate);
      let found = false;
      unzip.onfile = (f) => {
        if (!/(^|\/)export\.xml$/.test(f.name)) return;     // skip routes, ECGs, clinical records
        found = true;
        f.ondata = (err, chunk, final) => {
          if (err) return reject(err);
          feed(chunk, final);
          if (final) resolve();
        };
        f.start();
      };
      pump((chunk, final) => unzip.push(chunk, final))
        .then(() => { if (!found) reject(new Error("export.xml not found in this zip")); })
        .catch(reject);
    });
  }
  self.postMessage({ done: true, features: toFeatures({ samples, workouts, days, source: "apple_health" }) });
};
```
