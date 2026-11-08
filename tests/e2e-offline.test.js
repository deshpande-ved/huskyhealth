// E04S07: import -> features -> engine -> screen, with every network API trapped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("fixture export renders four figures with zero network calls", async () => {
  let calls = 0;
  const trap = () => { calls++; throw new Error("network used"); };
  const saved = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest, WebSocket: globalThis.WebSocket,
                  EventSource: globalThis.EventSource, navigator: globalThis.navigator };
  globalThis.fetch = trap;
  globalThis.XMLHttpRequest = function () { trap(); };
  globalThis.WebSocket = function () { trap(); };
  globalThis.EventSource = function () { trap(); };
  Object.defineProperty(globalThis, "navigator", { value: { sendBeacon: trap }, configurable: true });
  try {
    const { importFile } = await import("../web/js/parse-apple.worker.js");
    const { analyze } = await import("../web/js/engine.js");
    const { screenModel } = await import("../web/js/view.js");
    const u8 = readFileSync(new URL("./fixtures/synthetic-export.xml", import.meta.url));
    const { features } = await importFile({ name: "export.xml", size: u8.length, stream: () => new Blob([u8]).stream() },
                                          { now: Date.parse("2026-11-07T18:00:00-05:00") });
    const figs = screenModel(analyze(features), features);
    assert.equal(figs.length, 4);
    assert.equal(calls, 0);
  } finally {
    for (const k of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"]) globalThis[k] = saved[k];
    Object.defineProperty(globalThis, "navigator", { value: saved.navigator, configurable: true });
  }
});

test("PRIV-1 grep over the scoring path", () => {
  for (const f of ["parse-apple.worker.js", "features.js", "engine.js", "db.js", "view.js", "ascii.js"]) {
    const src = readFileSync(new URL(`../web/js/${f}`, import.meta.url), "utf8");
    assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import\(['"]https?:/.test(src), f);
  }
});
