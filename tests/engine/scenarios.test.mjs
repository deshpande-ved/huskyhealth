// E02S05: scenario tests (plan 7.4 layer 3). Synthetic, test-only data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitnessFatigue, monotony, loadSpike, readiness } from "../../web/js/engine.js";

const steady = (n, x) => Array(n).fill(x);
const base = Array.from({ length: 14 }, (_, i) => (i % 2 ? 4.2 : 4.0));
const baseSd = Math.sqrt(base.reduce((s, v) => s + (v - 4.1) ** 2, 0) / 13);

test("2-week taper raises form", () => {
  const before = steady(56, 100);
  const formBefore = fitnessFatigue(before).form;
  const formAfter = fitnessFatigue([...before, ...steady(14, 50)]).form;
  assert.ok(formAfter > formBefore, `${formAfter} <= ${formBefore}`);
});

test("doubled week flags load spike and drops form", () => {
  const before = steady(21, 100);
  const loads = [...before, ...steady(7, 200)];
  assert.equal(loadSpike(loads).flag, true);
  assert.ok(fitnessFatigue(loads).form < fitnessFatigue(before).form);
});

test("7 identical loads, no rest -> monotony flag", () => {
  assert.equal(monotony(steady(7, 80)).flag, true);
});

test("HRV 1 SD below baseline for a week -> easy", () => {
  assert.equal(readiness([...base, ...steady(7, 4.1 - baseSd)]).call, "easy");
});

test("3 HRV readings in a week suffice, 2 don't", () => {
  assert.ok(["hard", "easy"].includes(readiness([...base, 4.1, 4.1, 4.1, null, null, null, null]).call));
  assert.equal(readiness([...base, 4.1, 4.1, null, null, null, null, null]).call, "not_enough_data");
});
