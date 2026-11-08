// E04S01: ASCII primitives and banner font.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RAMP, rampChar, gauge, bar, calendar, plot, banner } from "../web/js/ascii.js";

test("RAMP: 70 chars, dense -> light, clamped", () => {
  assert.equal(RAMP.length, 70);
  assert.equal(rampChar(1), RAMP[0]);
  assert.equal(rampChar(0), RAMP[69]);
  assert.equal(rampChar(5), RAMP[0]);
  assert.equal(rampChar(-1), RAMP[69]);
});

test("gauge and bar", () => {
  assert.equal(gauge(0), "[...........|====o====|...........]");
  assert.equal(gauge(-3)[1], "o");
  assert.equal(gauge(3).at(-2), "o");
  assert.equal(bar(31), "######..............");
  assert.equal(bar(0), ".".repeat(20));
  assert.equal(bar(100), "#".repeat(20));
});

test("calendar and plot", () => {
  const load = Array.from({ length: 60 }, (_, i) => (i % 3 ? 0 : i));
  const zones = load.map((x, i) => (x ? (i % 5) + 1 : 0));
  const rows = calendar(load, zones);
  assert.equal(rows.length, 7);
  assert.equal(rows.reduce((s, r) => s + r.length, 0), 60);
  assert.equal(rows[1][0].ch, RAMP[69]);   // day 1 has 0 load
  assert.ok(rows.flat().every((c) => /^z[0-5]$/.test(c.cls)));
  const lines = plot([1, 2, 3, 4], [4, 3, 2, 1], 44, 10).split("\n");
  assert.equal(lines.length, 10);
  assert.ok(lines.every((l) => l.length === 44));
  assert.ok(lines.join("").includes("+") && lines.join("").includes("o"));
});

test("banner: 5 rows, every letter A-Z, the call and wordmark fit; unknown characters throw", () => {
  for (const w of ["GO EASY", "TRAIN HARD", "HUSKY", "HEALTH", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"]) {
    const rows = banner(w);
    assert.equal(rows.length, 5);
    assert.ok(rows.every((r) => /^[# ]*$/.test(r)), w);
  }
  assert.ok(Math.max(...banner("TRAIN HARD").map((r) => r.length)) <= 64);
  assert.throws(() => banner("GO!"));
});

test("ascii.js: DOM only in paint(), no network", () => {
  const src = readFileSync(new URL("../web/js/ascii.js", import.meta.url), "utf8");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|fetch\(|XMLHttpRequest|WebSocket/.test(src));
  const outside = src.slice(0, src.indexOf("export function paint"));
  assert.ok(!/document\./.test(outside));
});
