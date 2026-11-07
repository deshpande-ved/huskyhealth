// PRIV-1: engine.js has no DOM, no network, no imports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../web/js/engine.js", import.meta.url), "utf8");

test("engine.js is pure", () => {
  const bad = /\b(document|window|navigator|localStorage|sessionStorage|indexedDB)\.|fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|^\s*import\b|import\(/m;
  assert.ok(!bad.test(src), `forbidden token: ${src.match(bad)?.[0]}`);
});

test("engine.js uses training language only", () => {
  assert.ok(!/injury|diagnos|medical/i.test(src));
});
