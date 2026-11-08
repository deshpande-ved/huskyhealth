// Today page: one shared model (call, this week, last session, zones) for the website, the iOS app and the API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, todayCall, SOURCES } from "../web/js/engine.js";
import { todayModel, figureText, REF, WIDTH } from "../web/js/view.js";
import { EMPTY } from "../web/js/app.js";

const f = JSON.parse(readFileSync(new URL("./fixtures/features-60d.json", import.meta.url), "utf8"));
const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const m = todayModel(analyze(f), f);
const thin = { call: "not_enough_data", source: SOURCES.readiness };
const load = (last7, before) => [...Array(32).fill(0), ...Array(21).fill(before), ...Array(7).fill(last7)];

test("never 'no call': empty data still gets a call with a reason", () => {
  const e = todayModel(analyze(EMPTY), EMPTY);
  assert.ok(["Train hard", "Go easy"].includes(e.call.headline));
  assert.match(e.call.reason, /No training in the last 4 weeks/);
  assert.equal(e.last, null);
  assert.ok(!JSON.stringify(e).includes("No call yet"));
});

test("load fallback: heavy week -> easy, light week -> hard, labelled disputed", () => {
  const heavy = todayCall(thin, load(60, 20));
  assert.equal(heavy.call, "easy"); assert.equal(heavy.basis, "load"); assert.equal(heavy.source.status, "disputed");
  assert.equal(todayCall(thin, load(10, 40)).call, "hard");
  const v = todayModel({ ...analyze(f), today: heavy }, f).call;
  assert.equal(v.headline, "Go easy");
  assert.match(v.basis, /training load/);
  assert.equal(v.ref, "ref-load-call");
});

test("HRV call is used when there is enough HRV", () => {
  const t = todayCall({ call: "hard", z: 0.1, source: SOURCES.readiness }, load(10, 10));
  assert.equal(t.basis, "hrv");
  assert.equal(todayModel({ ...analyze(f), today: t }, f).call.headline, "Train hard");
});

test("blocks: this week vs usual, last session, zones; every line fits 44 columns", () => {
  assert.deepEqual([m.week.id, m.last.id, m.zones.id], ["week", "last", "zones"]);
  assert.match(m.week.label, /^This week: load \d+ from \d+ sessions?; your usual week is \d+$/);
  assert.match(m.last.label, /^Last session: \w+, .+, \d+ min, load \d+/);
  for (const b of [m.week, m.last, m.zones]) {
    assert.equal(b.plain, b.label);
    assert.ok(figureText(b).every((l) => l.length <= WIDTH), b.id);
  }
});

test("every method link points at a card on the methods page", () => {
  for (const b of [m.call, m.week, m.last, m.zones]) assert.ok(html.includes(`id="${b.ref}"`), b.ref);
  assert.equal(m.week.source.id, "trimp");
  assert.equal(m.last.source.id, "zone-minutes");
  for (const id of Object.keys(SOURCES)) assert.ok(html.includes(`id="${REF[id]}"`), id);
});

test("removed screens stay removed", () => {
  for (const id of ["settings", "effort", "caveats", "plain-view", "sync-toggle"]) assert.ok(!html.includes(`id="${id}"`), id);
  assert.match(html, /<nav class="tabs" aria-label="Pages"><a href="#today">today<\/a><a href="#import">import<\/a><a href="#account">account<\/a><\/nav>/);
});
