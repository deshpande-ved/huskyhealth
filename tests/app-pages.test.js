// The app's API, Methods and Privacy pages are the website's, word for word: pages.json must match the HTML it came from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildPages } from "../scripts/build-app-pages.mjs";

test("app pages match the website's API, Methods and Privacy pages (run scripts/build-app-pages.mjs after editing them)", () => {
  const saved = JSON.parse(readFileSync(new URL("../mobile/src/content/pages.json", import.meta.url), "utf8"));
  assert.deepEqual(saved, buildPages());
  assert.equal(saved.methods.filter((b) => b.t === "card").length, 13);
  assert.ok(saved.privacy.some((b) => b.t === "table") && saved.privacy.some((b) => b.t === "h2" && b.text === "Privacy"));
  assert.ok(saved.api.some((b) => b.t === "table") && saved.api.some((b) => b.t === "pre"));
});

test("no screen in the app sends you out to a browser", () => {
  const dir = new URL("../mobile/src/app/", import.meta.url);
  const files = readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith(".tsx"));
  for (const f of files) assert.ok(!/openBrowserAsync|Linking\.openURL/.test(readFileSync(new URL(String(f), dir), "utf8")), String(f));
});
