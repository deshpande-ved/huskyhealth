// E01S01: index.html shell, About line version formatting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatVersion } from "../web/js/app.js";

const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");

test("index.html has the required head tags", () => {
  for (const tag of [
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="theme-color" content="#191724">',
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
    '<link rel="stylesheet" href="/css/style.css">',
    '<script type="module" src="/js/app.js">',
  ]) assert.ok(html.includes(tag), `missing: ${tag}`);
});

test("formatVersion shows the short commit for a hex sha", () => {
  assert.equal(formatVersion("5229c57a1b2c3d4e5f60718293a4b5c6d7e8f901\n"), "version 5229c57");
  assert.equal(formatVersion("  abcdef1  "), "version abcdef1");
});

test("formatVersion falls back to unknown", () => {
  for (const v of [undefined, null, "", "   ", "abc", "not-a-commit", "<!doctype html><html></html>", "ABCDEF1"]) {
    assert.equal(formatVersion(v), "version unknown", String(v));
  }
});
