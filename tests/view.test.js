// E04S04: main screen figures from fixture features.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, SOURCES } from "../web/js/engine.js";
import { screenModel, figureText, REF, WIDTH } from "../web/js/view.js";
import { EMPTY } from "../web/js/app.js";

const f = JSON.parse(readFileSync(new URL("./fixtures/features-60d.json", import.meta.url), "utf8"));
const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const a = analyze(f);
const figs = screenModel(a, f, 4);

test("four figures; banner shows the engine's call", () => {
  assert.deepEqual(figs.map((x) => x.id), ["banner", "gauge", "calendar", "plot"]);
  assert.ok(["hard", "easy"].includes(a.readiness.call));
  assert.ok(figs[0].label.includes(a.readiness.call.toUpperCase()));
  assert.equal(figs[0].headline, a.readiness.call === "hard" ? "Train hard" : "Go easy");
});

test("labels carry the engine's numbers", () => {
  const ff = a.fitnessFatigue;
  assert.ok(figs[3].label.startsWith(`Fitness ${Math.round(ff.fitness)}, fatigue ${Math.round(ff.fatigue)}, form `));
  assert.ok(figs[1].label.includes(`${a.readiness.n7} of the last 7 days`));
  const total = Math.round(f.days.reduce((s, d) => s + d.trimp, 0));
  assert.ok(figs[2].label.includes(`total load ${total}`));
});

test("source row, refs exist, every SOURCE maps to a card", () => {
  for (const fig of figs) {
    for (const k of ["method", "citation", "status", "version"]) assert.ok(fig.source[k], `${fig.id}.source.${k}`);
    assert.ok(html.includes(`id="${fig.ref}"`), fig.ref);
  }
  for (const fig of figs.slice(1)) assert.ok(fig.title && fig.explain && fig.stats.length, fig.id);
  for (const id of Object.keys(SOURCES)) assert.ok(html.includes(`id="${REF[id]}"`), id);
});

test("every line <= 44 columns; empty features -> NO DATA with counts", () => {
  for (const fig of figs) assert.ok(figureText(fig).every((l) => l.length <= WIDTH), fig.id);
  const e = screenModel(analyze(EMPTY), EMPTY);
  assert.equal(e[0].headline, "No call yet");
  assert.match(e[0].reason, /0 of the last 7 days \(need 3\)/);
  assert.match(e[0].label, /Not enough data: 0 HRV days in the last 7 \(need 3\), 0 baseline days \(need 14\)/);
  for (const fig of e) assert.ok(figureText(fig).every((l) => l.length <= WIDTH), fig.id);
});

test("calendar: weekday header, one mark per day, legend", () => {
  const cal = figs[2];
  const lines = figureText(cal);
  assert.match(lines[0], /^\s+M\s+T\s+W\s+T\s+F\s+S\s+S$/);
  const marks = lines.slice(1).join("").replace(/^(now|-\d+w)/gm, "").replace(/now|-\d+w/g, "").replace(/\s/g, "");
  assert.equal(marks.length, 60);
  assert.ok(/^[.:=#@]+$/.test(marks));
  assert.deepEqual(cal.legend.map((l) => l[2]), ["rest", "light", "moderate", "hard", "max"]);
  assert.ok(lines.at(-1).startsWith("now"));
});
