// E03S03/E03S04: feature rows and days.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toFeatures, sportOf, sourceOf, dayOffset } from "../web/js/features.js";

const NOW = new Date(2026, 10, 7, 18).getTime();
const at = (dd, h, m = 0, s = 0) => new Date(2026, 10, dd, h, m, s).getTime();
const empty = () => ({ hr: [], rhr: [], hrv: [], vo2: [], effort: [], effortEst: [] });
const watch = { sourceName: "Pat Example Watch", device: "<<HKDevice>, name:Test Apple Watch, manufacturer:Apple Inc., model:Watch>" };
const wk = (o) => ({ type: "HKWorkoutActivityTypeSquash", start: at(6, 12), end: at(6, 12, 2), min: 2, kcal: null, ...watch, ...o });
const run = (samples, workouts, days = 60) => toFeatures({ samples, workouts, now: NOW, days });
const hrEvery15 = (start, n, bpm) => Array.from({ length: n }, (_, i) => [start + i * 15000, bpm]);

test("sport mapping", () => {
  assert.equal(sportOf("HKWorkoutActivityTypeSquash"), "squash");
  assert.equal(sportOf("HKWorkoutActivityTypeRunning"), "running");
  assert.equal(sportOf("HKWorkoutActivityTypeYoga"), "other");
});

test("zones and TRIMP from the engine; hr_sample_ok density", () => {
  // max 200; 9 samples at 150 bpm (75 % -> zone 3) every 15 s over 2 min: 8 x 0.25 = 2 min in z3, TRIMP 6
  const s = empty();
  s.hr = [...hrEvery15(at(6, 12), 9, 150), [at(1, 9), 200]];
  const f = run(s, [wk({})]);
  assert.deepEqual(f.workouts[0].zone_min, [0, 0, 2, 0, 0]);
  assert.equal(f.workouts[0].trimp, 6);
  assert.equal(f.workouts[0].hr_sample_ok, true);
  s.hr = [...hrEvery15(at(6, 12), 7, 150), [at(1, 9), 200]];
  assert.equal(run(s, [wk({})]).workouts[0].hr_sample_ok, false);
});

test("effort: user score, then estimate, then none", () => {
  const s = empty();
  s.effort = [[at(6, 12, 1), 8]];
  s.effortEst = [[at(6, 12, 1), 4]];
  assert.deepEqual([run(s, [wk({})]).workouts[0].effort, run(s, [wk({})]).workouts[0].srpe], [8, 16]);
  s.effort = [];
  assert.equal(run(s, [wk({})]).workouts[0].effort, 4);
  s.effortEst = [];
  const w = run(s, [wk({})]).workouts[0];
  assert.equal(w.effort, null);
  assert.equal(w.srpe, null);
});

test("day offsets only; sources normalized; raw names dropped", () => {
  assert.equal(dayOffset(at(7, 1), NOW), 0);
  assert.equal(dayOffset(at(6, 23), NOW), -1);
  const f = run(empty(), [wk({}), wk({ start: at(5, 12), end: at(5, 12, 2), sourceName: "Garmin Connect", device: "" }),
                          wk({ start: at(4, 12), end: at(4, 12, 2), sourceName: "Pat's Strava", device: "" })]);
  assert.deepEqual(f.workouts.map((w) => [w.day, w.source]), [[-3, "Other app"], [-2, "Garmin"], [-1, "Apple Watch"]]);
  assert.equal(sourceOf({ sourceName: "Connect" }), "Garmin");
  const out = JSON.stringify(f);
  assert.ok(!out.includes("Pat") && !out.includes("HKDevice"));
});

test("overlaps: the Watch wins", () => {
  const f = run(empty(), [wk({}), wk({ start: at(6, 12, 0, 30), end: at(6, 12, 2, 30), sourceName: "Pat's Strava", device: "" })]);
  assert.equal(f.workouts.length, 1);
  assert.equal(f.workouts[0].source, "Apple Watch");
});

test("overlaps without the Watch: more HR samples, then earlier start", () => {
  const a = wk({ sourceName: "App A", device: "" });
  const b = wk({ start: at(6, 12, 0, 30), end: at(6, 12, 2, 30), sourceName: "Garmin Connect", device: "" });
  const s = empty();
  s.hr = hrEvery15(at(6, 12, 2, 5), 2, 120);   // only inside b's window
  assert.equal(run(s, [a, b]).workouts[0].source, "Garmin");
  assert.equal(run(empty(), [a, b]).workouts[0].source, "Other app");   // tie -> earlier start (a)
});

test("no HR in the window; missing kcal", () => {
  const w = run(empty(), [wk({})]).workouts[0];
  assert.deepEqual([w.zone_min, w.trimp, w.hr_sample_ok, w.kcal], [[0, 0, 0, 0, 0], 0, false, null]);
});

test("days: sums, means, nulls", () => {
  const s = empty();
  s.rhr = [[at(6, 8), 52], [at(6, 20), 54]];
  s.hrv = [[at(6, 7), 60], [at(6, 21), 70]];
  s.vo2 = [[at(6, 13), 45.2]];
  const f = run(s, [], 3);
  assert.deepEqual(f.days, [
    { day: -2, trimp: 0, srpe: null, rhr: null, ln_hrv: null, vo2: null },
    { day: -1, trimp: 0, srpe: null, rhr: 53, ln_hrv: 4.171, vo2: 45.2 },   // (ln 60 + ln 70) / 2
    { day: 0, trimp: 0, srpe: null, rhr: null, ln_hrv: null, vo2: null },
  ]);
  assert.equal(f.max_hr, null);
});
