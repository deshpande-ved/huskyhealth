// E04S08: zone bars, info-only flags, gate messages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zoneBars, figureText, WIDTH } from "../web/js/view.js";

const f = JSON.parse(readFileSync(new URL("./fixtures/features-60d.json", import.meta.url), "utf8"));

test("five zone bars from 60-day totals; none -> message", () => {
  const z = zoneBars(f);
  const lines = figureText(z);
  assert.equal(lines.length, 5);
  lines.forEach((l, k) => assert.match(l, new RegExp(`^Z${k + 1} [a-z]+ +[#.]{20} +\\d+%$`)));
  assert.ok(lines.every((l) => l.length <= WIDTH));
  assert.match(z.label, /^Zone minutes: z1 \d+%, z2 \d+%, z3 \d+%, z4 \d+%, z5 \d+%$/);
  const none = zoneBars({ ...f, workouts: [] });
  assert.equal(none.label, "Zone minutes: no heart-rate workouts yet");
});



test("training language only in view.js", () => {
  assert.ok(!/injury|diagnos|medical/i.test(readFileSync(new URL("../web/js/view.js", import.meta.url), "utf8")));
});
