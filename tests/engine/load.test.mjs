// E02S01: zone minutes, TRIMP, session-RPE, sources, dailySeries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { zoneMinutes, trimp, srpe, sessionLoad, dailySeries, SOURCES, VERSION } from "../../web/js/engine.js";

test("zoneMinutes anchor", () => {
  // max 200: 100 bpm = 50 % -> z1 (1 min); 130 = 65 % -> z2 (1 min); 150 = 75 % -> z3 (3-min gap capped to 1);
  // 190 = 95 % -> z5 (1 min); 210 is the last sample, so it adds nothing.
  const hr = [[0, 100], [60000, 130], [120000, 150], [300000, 190], [360000, 210]];
  assert.deepEqual(zoneMinutes(hr, 0, 360000, 200), [1, 1, 1, 0, 1]);
});

test("zoneMinutes: below 50 % adds nothing; samples outside the range ignored", () => {
  const hr = [[-60000, 190], [0, 99], [60000, 99], [120000, 190], [999999, 190]];
  assert.deepEqual(zoneMinutes(hr, 0, 120000, 200), [0, 0, 0, 0, 0]);
});

test("zoneMinutes: exact 60/70/80/90 % go to the higher zone; >= 100 % is zone 5", () => {
  for (const [bpm, zone] of [[120, 1], [140, 2], [160, 3], [180, 4], [200, 4], [230, 4]]) {
    const z = zoneMinutes([[0, bpm], [60000, bpm]], 0, 60000, 200);
    const want = [0, 0, 0, 0, 0];
    want[zone] = 1;
    assert.deepEqual(z, want, `${bpm} bpm`);
  }
});

test("trimp and srpe", () => {
  assert.equal(trimp([3, 11, 21, 18, 7]), 195);   // 3 + 22 + 63 + 72 + 35
  assert.equal(srpe(7, 60), 420);
  assert.equal(srpe(null, 60), null);
  assert.equal(srpe(undefined, 60), null);
});

test("SOURCES covers every 7.1 row with valid fields", () => {
  const ids = ["zone-minutes", "trimp", "srpe", "fitness-fatigue", "monotony", "readiness",
               "data-check", "baseline", "load-spike", "vo2-trend", "sport-view"];
  const status = { "zone-minutes": "published", trimp: "published", srpe: "published", "fitness-fatigue": "published",
    monotony: "published", readiness: "adapted", "data-check": "published", baseline: "ours",
    "load-spike": "disputed", "vo2-trend": "descriptive", "sport-view": "ours" };
  for (const id of ids) {
    const s = SOURCES[id];
    assert.ok(s, id);
    for (const k of ["method", "citation", "status", "version"]) assert.ok(s[k], `${id}.${k}`);
    assert.equal(s.status, status[id], id);
  }
  assert.ok(VERSION.load && VERSION.readiness);
});

test("sessionLoad attaches sources", () => {
  const r = sessionLoad([[0, 150], [60000, 150]], 0, 60000, 200, 5);
  assert.deepEqual(r.zone_min.value, [0, 0, 1, 0, 0]);
  assert.equal(r.trimp.value, 3);
  assert.equal(r.srpe.value, 5);
  assert.equal(r.zone_min.source.id, "zone-minutes");
  assert.equal(r.trimp.source.id, "trimp");
  assert.equal(r.srpe.source.id, "srpe");
});

test("dailySeries fills missing days oldest-first; rejects v != 1", () => {
  const f = { v: 1, window_days: 4, days: [{ day: -3, trimp: 10 }, { day: -1, trimp: null }, { day: 0, trimp: 30 }] };
  assert.deepEqual(dailySeries(f, "trimp", 0), [10, 0, 0, 30]);
  assert.deepEqual(dailySeries(f, "trimp", null), [10, null, null, 30]);
  assert.throws(() => dailySeries({ ...f, v: 2 }, "trimp", 0));
});
