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

test("removed screens stay removed; log in lives top right; no device-specific copy", () => {
  for (const id of ["settings", "effort", "caveats", "plain-view", "sync-toggle", "import"]) assert.ok(!html.includes(`id="${id}"`), id);
  assert.match(html, /<nav class="tabs" aria-label="Pages"><a href="#today">today<\/a><a href="\/api">api<\/a><\/nav>/);
  assert.ok(html.indexOf('id="who-btn"') > html.indexOf('<nav class="tabs"') && html.includes('<form id="login" class="sheet hidden"'));
  const app = readFileSync(new URL("../web/js/app.js", import.meta.url), "utf8");
  const view = readFileSync(new URL("../web/js/view.js", import.meta.url), "utf8");
  for (const [name, src] of [["index.html", html], ["app.js", app], ["view.js", view]]) {
    assert.ok(!/this phone|on your phone/i.test(src), `${name} mentions a phone`);
    assert.ok(!/>\s*(open|details)\s*(&rarr;|\u2192)?\s*</i.test(src), `${name} labels a row "open/details"`);
  }
});

test("spoken brief: written from the page's numbers, passes the relay's privacy filter, at most 600 characters", async () => {
  const { briefText } = await import("../web/js/view.js");
  const text = briefText(m);
  assert.ok(text.startsWith(`${m.call.headline}. ${m.call.reason}`));
  assert.ok(text.includes("This week: load") && text.length <= 600);
  assert.match(text, /^[A-Za-z0-9 .,;:%'()/\-’–—]+$/);          // the relay's ALLOWED pattern
  assert.ok(!/\d{5,}|https?|www\.|@/i.test(text));                             // and its SUSPECT pattern
  assert.ok(briefText(m, 60).length <= 60);
});

test("talk to your API: keyword intents answer from the page's data and show the request behind them", async () => {
  const { answerQuestion, weekDetail, sessionDetail, zoneDetail } = await import("../web/js/view.js");
  const a = analyze(f);
  const ctx = { model: m, week: weekDetail(a, f), session: sessionDetail(a, f), zones: zoneDetail(f), features: f, relay: "https://r" };
  const ask = (q) => answerQuestion(q, ctx);
  assert.equal(ask("how was my week?").intent, "week");
  assert.equal(ask("should I train hard today").intent, "call");
  assert.equal(ask("what did my heart rate zones look like").intent, "zones");
  assert.equal(ask("how many calories did I burn").intent, "calories");
  assert.equal(ask("tell me about my last workout").intent, "last");
  assert.equal(ask("how many sessions do I have").intent, "count");
  assert.equal(ask("sing me a song").intent, "unknown");
  assert.match(ask("how was my week?").curl, /^curl -H "Authorization: Bearer \$HH_SESSION"/);
  const w = ask("send a 30 minute run to my API");
  assert.equal(w.intent, "write");
  assert.match(w.answer, /adds a 30 minute run to your API/);
  assert.match(w.curl, /curl -X POST "https:\/\/r\/v1\/me\/records"/);
  assert.ok(w.curl.includes('"sport":"running","start_s":1800,"end_s":0'));
  for (const q of ["how was my week?", "calories", "zones", "last session", "should I train"]) {
    const t = ask(q).answer;
    assert.match(t, /^[A-Za-z0-9 .,;:%'()/\-’–—]+$/, q);              // passes the relay's speech filter
    assert.ok(!/\d{5,}/.test(t) && t.length <= 600, q);
  }
});
