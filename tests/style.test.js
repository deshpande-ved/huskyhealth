// E04S02: Rose Pine palette, classes, font, no light theme.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../web/css/style.css", import.meta.url), "utf8");
const roots = [...css.matchAll(/:root\s*\{[^}]*\}/g)].map((m) => m[0]);
const root = roots[0];

test("palette tokens defined in :root (light) and remapped for dark; no hex anywhere else", () => {
  for (const k of ["paper", "band", "ink", "ink-2", "ink-3", "rule", "red", "z1", "z2", "z3", "z4", "z5"]) {
    assert.match(root, new RegExp(`--${k}: #[0-9a-f]{6};`), k);
    assert.match(roots[1], new RegExp(`--${k}: #[0-9a-f]{6};`), `dark ${k}`);
  }
  let rest = css; for (const r of roots) rest = rest.replace(r, "");
  assert.equal((rest.match(/#[0-9a-f]{3,8}\b/gi) || []).length, 0);
});

test("colour-role classes use variables", () => {
  const map = { z0: "ink-3", z1: "z1", z2: "z2", z3: "z3", z4: "z4", z5: "z5", alert: "z5", ai: "ink-2", muted: "ink-3" };
  for (const [cls, v] of Object.entries(map)) {
    const re = new RegExp(`\\.${cls}\\b[^{]*\\{[^}]*var\\(--${v}\\)`);
    assert.ok(re.test(css), cls);
  }
});

test("one self-hosted face (Space Mono) from /fonts; no imports", () => {
  const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1].replace(/["']/g, ""));
  assert.deepEqual(urls, ["/fonts/space-mono-latin-400-normal.woff2", "/fonts/space-mono-latin-700-normal.woff2"]);
  assert.ok(!/@import/.test(css));
});
