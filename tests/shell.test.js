// E04S07: every module the app loads is in the service worker SHELL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const web = (p) => new URL(`../web${p}`, import.meta.url);
const sw = readFileSync(web("/sw.js"), "utf8");
const shell = new Set(sw.slice(sw.indexOf("const SHELL"), sw.indexOf("];")).match(/"\/[^"]*"/g).map((s) => s.slice(1, -1)));

function walk(path, seen = new Set()) {
  if (seen.has(path)) return seen;
  seen.add(path);
  const src = readFileSync(web(path), "utf8");
  const dir = path.slice(0, path.lastIndexOf("/") + 1);
  for (const [, spec] of src.matchAll(/(?:import|from)\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    walk(new URL(spec, `https://x${dir}`).pathname, seen);
  }
  for (const [, w] of src.matchAll(/["'](\/js\/[^"']+\.worker\.js)["']/g)) walk(w, seen);
  return seen;
}

test("app.js import graph and workers are all cached", () => {
  const files = walk("/js/app.js");
  for (const f of files) assert.ok(shell.has(f), `${f} missing from SHELL`);
  assert.ok(files.has("/js/parse-apple.worker.js") && files.has("/vendor/fflate.esm.js"));
});
