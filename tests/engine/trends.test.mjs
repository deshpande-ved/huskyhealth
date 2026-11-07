// E02S02: fitness/fatigue, monotony, load spike, VO2 trend, sport view.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitnessFatigue, monotony, loadSpike, vo2Trend, sportView } from "../../web/js/engine.js";

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("fitnessFatigue hand-worked", () => {
  // seed 10; 7 days of 10 keep both at 10; then 80: fitness 10 + 70/42 = 11.667, fatigue 10 + 70/7 = 20.
  const r = fitnessFatigue([10, 10, 10, 10, 10, 10, 10, 80]);
  close(r.fitness, 11.667);
  close(r.fatigue, 20);
  close(r.form, -8.333);
  assert.equal(r.series.length, 8);
  assert.equal(r.source.id, "fitness-fatigue");
});

test("monotony", () => {
  const a = monotony([100, 0, 100, 0, 100, 0, 100]);   // mean 57.14, pop SD 49.49
  close(a.value, 1.155);
  assert.equal(a.flag, false);
  assert.deepEqual([monotony(Array(7).fill(50)).value, monotony(Array(7).fill(50)).flag], [null, true]);
  assert.deepEqual([monotony(Array(7).fill(0)).value, monotony(Array(7).fill(0)).flag], [null, false]);
  const high = monotony([100, 90, 100, 90, 100, 90, 100]);
  assert.ok(high.value > 2 && high.flag);
  assert.equal(a.source.id, "monotony");
});

test("loadSpike", () => {
  const r = loadSpike([...Array(21).fill(100), ...Array(7).fill(200)]);   // 1400 / (3500 / 4)
  close(r.value, 1.6);
  assert.equal(r.flag, true);
  assert.equal(r.info, true);
  assert.equal(loadSpike(Array(27).fill(100)).value, null);
  assert.equal(r.source.status, "disputed");
  assert.equal(r.source.citation, "Gabbett 2016, Br J Sports Med");
});

test("vo2Trend", () => {
  close(vo2Trend([{ day: -28, vo2: 45 }, { day: -10, vo2: null }, { day: 0, vo2: 47 }]).value, 2);
  assert.equal(vo2Trend([{ day: 0, vo2: 47 }]).value, null);
  assert.equal(vo2Trend([]).source.status, "descriptive");
});

test("sportView", () => {
  const ws = [{ day: -9, sport: "squash", trimp: 100 }, { day: -6, sport: "squash", trimp: 120 },
              { day: -3, sport: "squash", trimp: 140 }, { day: 0, sport: "squash", trimp: 160 },
              { day: -1, sport: "running", trimp: 999 }];
  const r = sportView(ws, "squash");
  assert.equal(r.mean, 120);
  assert.equal(r.sd, 20);
  assert.equal(r.z, 2);
  assert.equal(r.source.status, "ours");
  assert.equal(sportView(ws.slice(2), "squash").z, null);
});
