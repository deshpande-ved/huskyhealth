// E04S05: Plain view.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "../web/js/engine.js";
import { screenModel, zoneBars } from "../web/js/view.js";

const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../web/js/app.js", import.meta.url), "utf8");
const f = JSON.parse(readFileSync(new URL("./fixtures/features-60d.json", import.meta.url), "utf8"));

test("one Plain view button with aria-pressed", () => {
  assert.equal((html.match(/id="plain-view"/g) || []).length, 1);
  assert.ok(html.includes('<button id="plain-view" type="button" aria-pressed="false">Plain view</button>'));
});

test("plain text = label numbers, no drawing characters", () => {
  for (const fig of [...screenModel(analyze(f), f), zoneBars(f)]) {
    assert.equal(fig.plain, fig.label);
    assert.ok(!/[#=|+]{2,}|\[\.|\.\]/.test(fig.plain), fig.id);
  }
});

test("wired with addEventListener and a class toggle", () => {
  assert.ok(/\$\("plain-view"\)\.addEventListener\("click"/.test(app));
  assert.ok(app.includes('document.body.classList.toggle("plain")'));
  assert.ok(!/ on[a-z]+=|style="/.test(html));
});
