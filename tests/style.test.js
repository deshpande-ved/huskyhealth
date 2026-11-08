// E04S02: Rose Pine palette, classes, font, no light theme.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../web/css/style.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));

test("ten colours defined once in :root, no hex elsewhere", () => {
  const want = { base: "#191724", surface: "#1f1d2e", text: "#e0def4", muted: "#6e6a86", foam: "#9ccfd8",
                 pine: "#31748f", gold: "#f6c177", rose: "#ebbcba", love: "#eb6f92", iris: "#c4a7e7" };
  for (const [k, v] of Object.entries(want)) assert.ok(root.includes(`--${k}: ${v};`), k);
  assert.equal((css.replace(root, "").match(/#[0-9a-f]{3,8}\b/gi) || []).length, 0);
});

test("colour-role classes use variables", () => {
  const map = { z0: "muted", z1: "foam", z2: "pine", z3: "gold", z4: "rose", z5: "love", alert: "love", ai: "iris", muted: "muted" };
  for (const [cls, v] of Object.entries(map)) {
    const re = new RegExp(`\\.${cls}\\b[^{]*\\{[^}]*var\\(--${v}\\)`);
    assert.ok(re.test(css), cls);
  }
});

test("system monospace only; no fonts, imports or light theme", () => {
  assert.ok(css.includes('font-family: ui-monospace, "SF Mono", Menlo, monospace;'));
  assert.ok(!/@font-face|@import|url\(|prefers-color-scheme:\s*light/.test(css));
});
