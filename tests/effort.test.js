// E04S10: typed effort entry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { effortList, srpeLine } from "../web/js/view.js";
import { withEffort } from "../web/js/db.js";

const f = JSON.parse(readFileSync(new URL("./fixtures/synthetic-features.expected.json", import.meta.url), "utf8"));

test("unrated workouts listed by sport and age, no dates", () => {
  const list = effortList(f);
  assert.deepEqual(list, [{ index: 0, sport: "strength", age: "3 days ago" }]);
  assert.ok(!/\d{4}-\d{2}/.test(JSON.stringify(list)));
});

test("withEffort validates and recomputes sRPE", () => {
  for (const bad of [0, 11, 3.5, "7", null]) {
    const r = withEffort(f, 0, bad);
    assert.equal(r.features, f);
    assert.ok(r.error);
  }
  const { features: g, error } = withEffort(f, 0, 6);
  assert.equal(error, null);
  assert.equal(g.workouts[0].effort, 6);
  assert.equal(g.workouts[0].srpe, 12);   // 6 x 2 min
  assert.equal(g.days.find((d) => d.day === -3).srpe, 12);
  assert.deepEqual(Object.keys(g.workouts[0]).sort(), Object.keys(f.workouts[0]).sort());
  assert.deepEqual(effortList(g), []);
});

test("7-day session-RPE line updates after a rating", () => {
  assert.equal(srpeLine(f).text, "Session-RPE load, last 7 days: 24");   // 10 + 14
  const { features: g } = withEffort(f, 0, 6);
  assert.equal(srpeLine(g).text, "Session-RPE load, last 7 days: 36");
  assert.equal(srpeLine(g).ref, "ref-srpe");
});
