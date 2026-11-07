// E02S04: data gates and analyze().
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hrDensityGate, maxHrGate, effortGate, analyze } from "../../web/js/engine.js";

const fixture = () => JSON.parse(readFileSync(new URL("../fixtures/features-engine.json", import.meta.url), "utf8"));
const w = (o) => ({ day: 0, sport: "squash", zone_min: [0, 0, 0, 0, 0], effort: 5, hr_sample_ok: true, ...o });

test("HR density gate", () => {
  assert.deepEqual(hrDensityGate([w({ day: -2, hr_sample_ok: false }), w({})]),
    [{ day: -2, sport: "squash", status: "low_confidence" }]);
  assert.deepEqual(hrDensityGate([w({}), w({})]), []);
});

test("max HR gate: 2 sessions in zone 4-5 raise it, 3 don't", () => {
  const hi = w({ zone_min: [0, 0, 0, 1, 0] });
  const hi5 = w({ zone_min: [0, 0, 0, 0, 2] });
  assert.equal(maxHrGate([hi, hi5, w({})]).raised, true);
  assert.equal(maxHrGate([hi, hi5, hi]).raised, false);
});

test("effort gate", () => {
  assert.deepEqual(effortGate([w({ day: -1, sport: "running", effort: null }), w({})]), [{ day: -1, sport: "running" }]);
  assert.deepEqual(effortGate([w({}), w({})]), []);
});

test("analyze on the 60-day fixture", () => {
  const f = fixture();
  const before = JSON.stringify(f);
  const r = analyze(f);
  assert.equal(JSON.stringify(f), before, "analyze mutated its input");
  for (const k of ["readiness", "fitnessFatigue", "monotony", "loadSpike", "vo2Trend", "sportView", "gates"]) assert.ok(k in r, k);
  assert.ok(["hard", "easy"].includes(r.readiness.call));
  assert.deepEqual(Object.keys(r.sportView).sort(), ["running", "squash"]);
  assert.ok(Array.isArray(r.gates));
});

test("analyze: HRV blanked to 2 of the last 7 -> not_enough_data and the HRV gate", () => {
  const f = fixture();
  for (const d of f.days) if (d.day > -7 && d.day !== 0 && d.day !== -3) d.ln_hrv = null;
  const r = analyze(f);
  assert.equal(r.readiness.call, "not_enough_data");
  const g = r.gates.find((x) => x.id === "hrv");
  assert.ok(g);
  assert.deepEqual(g.items, [{ check: "data-check" }]);
});

test("every metric and gate in analyze() carries a full source", () => {
  const f = fixture();
  f.workouts[0].hr_sample_ok = false;
  f.workouts[1].effort = null;
  const r = analyze(f);
  const ok = (s, where) => { for (const k of ["method", "status", "version"]) assert.ok(s && s[k], `${where}.source.${k}`); };
  for (const k of ["readiness", "fitnessFatigue", "monotony", "loadSpike", "vo2Trend"]) ok(r[k].source, k);
  for (const [s, v] of Object.entries(r.sportView)) ok(v.source, `sportView.${s}`);
  assert.ok(r.gates.length >= 2);
  for (const g of r.gates) ok(g.source, `gate ${g.id}`);
  const ours = Object.fromEntries(r.gates.map((g) => [g.id, g.source.status]));
  assert.equal(ours["hr-density"], "ours");
  assert.equal(ours["rate-effort"], "ours");
});
