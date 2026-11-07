// E02S03: the readiness band.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readiness } from "../../web/js/engine.js";

const base = Array.from({ length: 14 }, (_, i) => (i % 2 ? 4.2 : 4.0));   // mean 4.1, sample SD ~0.1038

test("HARD inside the band", () => {
  const r = readiness([...base, ...Array(7).fill(4.1)]);
  assert.equal(r.call, "hard");
  assert.ok(Math.abs(r.z) < 1e-9);
  assert.equal(r.n7, 7);
  assert.equal(r.nBase, 14);
  assert.equal(r.source.status, "adapted");
});

test("EASY both ways", () => {
  const lo = readiness([...base, ...Array(7).fill(4.0)]);
  const hi = readiness([...base, ...Array(7).fill(4.2)]);
  assert.equal(lo.call, "easy");
  assert.equal(hi.call, "easy");
  assert.ok(Math.abs(lo.z + 0.964) < 1e-3);
  assert.ok(Math.abs(hi.z - 0.964) < 1e-3);
});

test("data check: 3 readings give a call, 2 don't", () => {
  const three = readiness([...base, 4.1, null, 4.1, null, 4.1, null, null]);
  assert.ok(["hard", "easy"].includes(three.call));
  const two = readiness([...base, 4.1, null, null, null, 4.1, null, null]);
  assert.equal(two.call, "not_enough_data");
  assert.equal(two.n7, 2);
  assert.deepEqual(two.failed, ["data-check"]);
  assert.equal(two.failedSources[0].status, "published");
});

test("baseline: 13 days fail, 14 pass; only days before the last 7 count", () => {
  const r13 = readiness([...base.slice(1), ...Array(7).fill(4.1)]);
  assert.equal(r13.call, "not_enough_data");
  assert.equal(r13.nBase, 13);
  assert.deepEqual(r13.failed, ["baseline"]);
  assert.equal(r13.failedSources[0].status, "ours");
  assert.ok(["hard", "easy"].includes(readiness([...base, ...Array(7).fill(4.1)]).call));
});

test("both checks fail", () => {
  const r = readiness([...base.slice(1), 4.1, null, null, null, null, null, 4.1]);
  assert.deepEqual(r.failed, ["data-check", "baseline"]);
});
