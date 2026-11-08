// E03S01: line scanner on the synthetic export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createScanner, KEEP, toMs } from "../web/js/parse-apple.worker.js";

const NOW = Date.parse("2026-11-07T18:00:00-05:00");
const xml = readFileSync(new URL("./fixtures/synthetic-export.xml", import.meta.url), "utf8");
const scanText = (text, now = NOW) => { const s = createScanner({ now, days: 60 }); text.split("\n").forEach(s.onLine); return s.result(); };

test("kept samples per allowlisted type", () => {
  const { samples } = scanText(xml);
  assert.deepEqual(Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, v.length])),
    { hr: 21, rhr: 3, hrv: 3, vo2: 1, effort: 1, effortEst: 1 });
  assert.deepEqual(samples.vo2[0], [toMs("2026-11-06 13:00:00 -0500"), 45.2]);
  assert.ok(!samples.hr.some(([, v]) => v === 230 || v === 61), "InstantaneousBeatsPerMinute counted as HR");
  assert.equal(Object.keys(KEEP).length, 6);
});

test("workouts: statistics kcal, old-style kcal, self-closing, none", () => {
  const { workouts } = scanText(xml);
  assert.equal(workouts.length, 4);   // the day -60 workout is dropped
  const squash = workouts.find((w) => w.type === "HKWorkoutActivityTypeSquash");
  assert.equal(squash.kcal, 20);
  assert.equal(squash.min, 2);
  assert.equal(squash.end - squash.start, 120000);
  const old = workouts.find((w) => w.type === "HKWorkoutActivityTypeRunning" && w.kcal === 15);
  assert.ok(old);
  const selfClosing = workouts.find((w) => w.type === "HKWorkoutActivityTypeTraditionalStrengthTraining");
  assert.equal(selfClosing.kcal, null);
});

test("a record on day -60 is dropped (window starts at local midnight of day -59)", () => {
  const line = (d) => `<Record type="HKQuantityTypeIdentifierRestingHeartRate" unit="count/min" startDate="${d}" endDate="${d}" value="50"/>`;
  const now = new Date(2026, 10, 7, 18).getTime();
  const pad = (n) => String(n).padStart(2, "0");
  const local = (y, m, dd, h) => { const t = new Date(y, m, dd, h); const o = -t.getTimezoneOffset(); const s = o >= 0 ? "+" : "-";
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(h)}:00:00 ${s}${pad(Math.floor(Math.abs(o) / 60))}${pad(Math.abs(o) % 60)}`; };
  const r = scanText([line(local(2026, 10, 7 - 60, 23)), line(local(2026, 10, 7 - 59, 0))].join("\n"), now);
  assert.equal(r.samples.rhr.length, 1);
});

test("routes, ECG and clinical entries produce nothing", () => {
  const out = JSON.stringify(scanText(xml));
  for (const s of ["workout-routes", "route_2026", "electrocardiograms", "ecg-sinus", "clinical-records", "Fictional Clinic", "LabResult"]) {
    assert.ok(!out.includes(s), s);
  }
});

test("bad lines are skipped without throwing", () => {
  const bad = [
    `<Record type="HKQuantityTypeIdentifierHeartRate" startDate="2026-11-06 12:00:00 -0500"/>`,
    `<Record type="HKQuantityTypeIdentifierHeartRate" startDate="2026-11-06 12:00:00 -0500" value="abc"/>`,
    `<Record type="HKQuantityTypeIdentifierHeartRate" startDate="not a date" value="120"/>`,
    `<Record type="HKQuantityTypeIdentifierHeartRate" startDate="2026-11-06 12:00:00 -0500" value="12`,
    `<Workout workoutActivityType="HKWorkoutActivityTypeSquash" startDate="garbage" endDate="garbage"/>`,
    `<Record type="HKQuantityTypeIdentifierHeartRate" startDate="2026-11-06 12:00:10 -0500" value="120"/>`,
  ].join("\n");
  const r = scanText(bad);
  assert.equal(r.samples.hr.length, 1);
  assert.equal(r.workouts.length, 0);
  assert.equal(r.stats.splitTags, 1);
});
