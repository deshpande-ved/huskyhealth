// E04S08: zone bars, info-only flags, gate messages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "../web/js/engine.js";
import { zoneBars, infoLines, figureText, WIDTH } from "../web/js/view.js";

const f = JSON.parse(readFileSync(new URL("./fixtures/features-60d.json", import.meta.url), "utf8"));
const src = (id) => ({ id, method: "m", status: "s", version: "v", citation: "c" });
const base = analyze(f);

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

test("monotony and load-spike lines only when flagged", () => {
  const off = infoLines({ ...base, monotony: { value: 1.2, flag: false }, loadSpike: { value: 1, flag: false }, gates: [] }, f);
  assert.ok(!off.some((l) => /Monotony|Load spike/.test(l.text)));
  const on = infoLines({ ...base, monotony: { value: 2.31, flag: true }, loadSpike: { value: 1.6, flag: true }, gates: [] }, f);
  assert.ok(on.some((l) => l.text === "Monotony 2.3 (info only): the last 7 days' loads are very even" && l.ref === "ref-monotony"));
  assert.ok(on.some((l) => l.text.startsWith("Load spike 1.6 (info only)") && l.ref === "ref-load-spike"));
  const flat = infoLines({ ...base, monotony: { value: null, flag: true }, loadSpike: { value: null, flag: false }, gates: [] }, f);
  assert.ok(flat.some((l) => l.text === "Monotony: no variation in last 7 days (info only)"));
});

test("gate messages link to their cards", () => {
  const gates = [{ id: "hr-density", items: [{}, {}], source: src("hr-density") }, { id: "max-hr", items: [{}], source: src("max-hr") },
                 { id: "rate-effort", items: [{}, {}, {}], source: src("rate-effort") }];
  const lines = infoLines({ ...base, monotony: { flag: false }, loadSpike: { flag: false }, gates }, f);
  assert.ok(lines.some((l) => l.text === "Zones are low-confidence for 2 workouts: heart rate was sparse (ours)" && l.ref === "ref-zone-minutes"));
  assert.ok(lines.some((l) => l.text.startsWith("Max HR may be underestimated") && l.ref === "ref-zone-minutes"));
  assert.ok(lines.some((l) => l.text === "Rate your effort for 3 workouts (ours)" && l.ref === "ref-srpe"));
});

test("training language only in view.js", () => {
  assert.ok(!/injury|diagnos|medical/i.test(readFileSync(new URL("../web/js/view.js", import.meta.url), "utf8")));
});
