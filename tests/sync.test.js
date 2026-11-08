// E06S02/S03/S05: keys, pairing, collect-on-open, merge, turn-off. Network is a stub; the relay crypto is real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openDrop } from "../web/js/box.js";
import { makeAccountKeys, fetchRecords } from "../web/js/account.js";
import { mergeDrop, shiftFeatures, emptyFeatures, dayNumber } from "../web/js/sync-merge.js";
import { sanitize } from "../web/js/db.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PY = existsSync(`${ROOT}.venv/bin/python`) ? `${ROOT}.venv/bin/python` : "python3";
const NOW = new Date(2026, 10, 7, 18).getTime();

function memDb(features = null) {
  const recs = new Map();
  return { features, recs,
    loadFeatures: async function () { return this.features; },
    saveFeatures: async function (f) { this.features = sanitize(f); },
    loadRecord: async (k) => recs.get(k) ?? null,
    saveRecord: async (k, v) => { if (v == null) recs.delete(k); else recs.set(k, v); } };
}
function stubFetch(handler) {
  const calls = [];
  const fn = async (url, opts = {}) => { calls.push({ url, ...opts }); return handler(url, opts); };
  fn.calls = calls;
  return fn;
}
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const seal = (pubB64, payload) => JSON.parse(execFileSync(PY, ["-c", `
import sys, json, base64; sys.path.insert(0, ${JSON.stringify(`${ROOT}relay`)})
from records import seal
print(json.dumps(seal(base64.b64decode(sys.argv[1]), sys.argv[2].encode())))`, pubB64, JSON.stringify(payload)], { encoding: "utf8" }));

const DROP = { v: 1, workouts: [{ sport: "squash", start_s: 7200, end_s: 3600, kcal: 500, src: "watch",
  hr: Array.from({ length: 241 }, (_, i) => ({ t_s: 7200 - i * 15, v: 150 })) }],
  rhr: [{ t_s: 20000, v: 51 }], hrv: [{ t_s: 30000, v: 60 }], effort: [{ t_s: 3600, v: 7 }] };

const importPriv = (pkcs8) => crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pkcs8), (c) => c.charCodeAt(0)),
  { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);

test("account keys: RSA-OAEP 2048; cross-language round trip Python seal() -> WebCrypto openDrop()", async () => {
  const { pub, pkcs8 } = await makeAccountKeys();
  const priv = await importPriv(pkcs8);
  assert.equal(priv.algorithm.modulusLength, 2048);
  assert.equal(priv.extractable, false);
  assert.deepEqual(await openDrop(priv, seal(pub, DROP)), DROP);
});

test("fetchRecords: GET with the session, opens each record, skips unreadable ones", async () => {
  const { pub, pkcs8 } = await makeAccountKeys();
  const account = { session: "s1", privateKey: await importPriv(pkcs8) };
  const fetchFn = stubFetch(() => json({ records: [{ id: 4, at: 100, ...seal(pub, DROP) }, { id: 5, at: 101, key: "AA==", nonce: "AA==", ct: "AA==" }], last: 5 }));
  const r = await fetchRecords({ account, after: 3, fetchFn, relay: "https://r" });
  assert.equal(fetchFn.calls[0].url, "https://r/v1/me/records?after=3");
  assert.equal(fetchFn.calls[0].method, "GET");
  assert.equal(fetchFn.calls[0].headers.Authorization, "Bearer s1");
  assert.deepEqual(r.records.map((x) => [x.id, x.at]), [[4, 100]]);
  assert.deepEqual(r.records[0].drop, DROP);
  assert.equal(r.last, 5);
});

test("merge is idempotent and shifts offsets by elapsed days", () => {
  const once = mergeDrop(emptyFeatures(), DROP, { nowMs: NOW, refDay: dayNumber(NOW) });
  const twice = mergeDrop(once.features, DROP, { nowMs: NOW, refDay: once.refDay });
  assert.deepEqual(twice.features, once.features);
  assert.equal(twice.added, 0);
  const shifted = shiftFeatures(once.features, 2);
  assert.equal(shifted.workouts[0].day, once.features.workouts[0].day - 2);
  assert.equal(shifted.days.length, 60);
  assert.deepEqual(shifted.days.map((d) => d.day), Array.from({ length: 60 }, (_, i) => i - 59));
  const later = mergeDrop(once.features, { v: 1, workouts: [], rhr: [], hrv: [], effort: [] },
                          { nowMs: NOW + 2 * 86400000, refDay: once.refDay });
  assert.equal(later.features.workouts[0].day, once.features.workouts[0].day - 2);
});

test("UI has no inline code", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  assert.ok(!/ on[a-z]+=|style="/.test(html));
  for (const f of readdirSync(new URL("../web/js/", import.meta.url))) {
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(readFileSync(new URL(`../web/js/${f}`, import.meta.url), "utf8")), f);
  }
});

// Heart-rate-only drops (the Shortcut can't read workouts): sessions come from dense readings.
import { splitSessions, dropToScan } from "../web/js/sync-merge.js";

function hrWindow({ sessions = [], hours = 3 }) {
  // sparse readings every 5 min across the window, plus dense 5 s readings for each [startMinAgo, endMinAgo]
  const hr = [];
  for (let s = hours * 3600; s >= 0; s -= 300) hr.push({ t_s: s, v: 70 });
  for (const [a, b] of sessions) for (let s = a * 60; s >= b * 60; s -= 5) hr.push({ t_s: s, v: 150 });
  return { v: 1, workouts: [{ sport: "squash", start_s: hours * 3600, end_s: 0, kcal: null, src: "watch", hr }], rhr: [], hrv: [], effort: [] };
}

test("one dense session inside 3 h of sparse heart rate becomes one squash workout", () => {
  const scan = dropToScan(hrWindow({ sessions: [[100, 55]] }), NOW);
  assert.equal(scan.workouts.length, 1);
  assert.equal(scan.workouts[0].type, "HKWorkoutActivityTypeSquash");
  assert.ok(Math.abs(scan.workouts[0].min - 45) < 0.2);
  const merged = mergeDrop(emptyFeatures(), hrWindow({ sessions: [[100, 55]] }), { nowMs: NOW, refDay: dayNumber(NOW) });
  assert.equal(merged.features.workouts.length, 1);
  assert.equal(merged.features.workouts[0].hr_sample_ok, true);
  assert.ok(merged.features.workouts[0].trimp > 0);
});

test("two sessions, a too-short burst, and a session still in progress", () => {
  const scan = dropToScan(hrWindow({ sessions: [[170, 140], [100, 70], [40, 35], [8, 0]] }), NOW);
  assert.deepEqual(scan.workouts.map((w) => Math.round(w.min)), [30, 30]);   // 5-min burst too short; last one still going
});

test("no dense readings -> no workout; resending the same window changes nothing", () => {
  assert.equal(dropToScan(hrWindow({}), NOW).workouts.length, 0);
  const d = hrWindow({ sessions: [[100, 55]] });
  const once = mergeDrop(emptyFeatures(), d, { nowMs: NOW, refDay: dayNumber(NOW) });
  const again = mergeDrop(once.features, d, { nowMs: NOW, refDay: once.refDay });
  assert.deepEqual(again.features, once.features);
  assert.equal(again.added, 0);
  assert.deepEqual(splitSessions([]), []);
});

// Real workout types from the "workout starts" automation: a mark labels the session that starts near it.
test("marks label sessions with the Watch's workout type; unmarked sessions keep the window's sport", () => {
  const d = hrWindow({ sessions: [[170, 140], [100, 70]], hours: 24 });
  d.workouts[0].sport = "other";
  d.marks = [{ sport: "walking", t_s: 100 * 60 + 30 }];          // started 100 min ago (30 s before the readings)
  const scan = dropToScan(d, NOW);
  assert.deepEqual(scan.workouts.map((w) => w.type), ["HKWorkoutActivityTypeOther", "HKWorkoutActivityTypeWalking"]);
  const merged = mergeDrop(emptyFeatures(), d, { nowMs: NOW, refDay: dayNumber(NOW) });
  assert.deepEqual(merged.features.workouts.map((w) => w.sport), ["other", "walking"]);
  // the same sessions resent with a different mark don't duplicate
  const again = mergeDrop(merged.features, { ...d, marks: [{ sport: "squash", t_s: 170 * 60 }] }, { nowMs: NOW, refDay: merged.refDay });
  assert.equal(again.features.workouts.length, 2);
  assert.equal(again.added, 0);
});

test("per-minute averaged heart rate (Shortcut 'Group by Minute') still finds the session, densely enough", () => {
  const hr = [];
  for (let s = 86400; s >= 0; s -= 300) hr.push({ t_s: s, v: 70 });          // background every 5 min
  for (let s = 100 * 60; s >= 55 * 60; s -= 60) hr.push({ t_s: s, v: 150 });  // 45 min of per-minute averages
  const drop = { v: 1, workouts: [{ sport: "squash", start_s: 86400, end_s: 0, kcal: null, src: "watch", hr }], rhr: [], hrv: [], effort: [] };
  const { features } = mergeDrop(emptyFeatures(), drop, { nowMs: NOW, refDay: dayNumber(NOW) });
  assert.equal(features.workouts.length, 1);
  assert.ok(Math.abs(features.workouts[0].min - 45) < 1.1);
  assert.equal(features.workouts[0].hr_sample_ok, true);
});

test("list format (hr_t ISO times + hr_v) from a loop-free Shortcut finds the same session", () => {
  const sent = NOW;
  const hr_t = [], hr_v = [];
  const iso = (ms) => new Date(ms).toISOString();
  for (let s = 86400; s >= 0; s -= 300) { hr_t.push(iso(sent - s * 1000)); hr_v.push(70); }
  for (let s = 100 * 60; s >= 55 * 60; s -= 5) { hr_t.push(iso(sent - s * 1000)); hr_v.push(150); }
  const drop = { v: 1, workouts: [{ sport: "squash", start_s: 86400, end_s: 0, kcal: null, src: "watch", hr_t, hr_v }], rhr: [], hrv: [], effort: [] };
  const { features } = mergeDrop(emptyFeatures(), drop, { nowMs: NOW, refDay: dayNumber(NOW) });
  assert.equal(features.workouts.length, 1);
  assert.ok(Math.abs(features.workouts[0].min - 45) < 0.2);
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(JSON.stringify(features)), "no dates stored on the phone");
});

test("an imported workout and its backfilled copy are the same workout", async () => {
  const { sameWorkout } = await import("../web/js/sync-merge.js");
  assert.ok(sameWorkout({ day: -3, min: 45, trimp: 169 }, { day: -3, min: 46.5, trimp: 171 }));
  assert.ok(!sameWorkout({ day: -3, min: 45 }, { day: -3, min: 60 }));
  assert.ok(!sameWorkout({ day: -3, min: 45 }, { day: -2, min: 45 }));
});
