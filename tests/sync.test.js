// E06S02/S03/S05: keys, pairing, collect-on-open, merge, turn-off. Network is a stub; the relay crypto is real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeKeys, openDrop } from "../web/js/box.js";
import { pair, unpair, isOn, CONSENT } from "../web/js/sync-settings.js";
import { collect } from "../web/js/sync-collect.js";
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
from dropbox import seal
print(json.dumps(seal(base64.b64decode(sys.argv[1]), sys.argv[2].encode())))`, pubB64, JSON.stringify(payload)], { encoding: "utf8" }));

const DROP = { v: 1, workouts: [{ sport: "squash", start_s: 7200, end_s: 3600, kcal: 500, src: "watch",
  hr: Array.from({ length: 241 }, (_, i) => ({ t_s: 7200 - i * 15, v: 150 })) }],
  rhr: [{ t_s: 20000, v: 51 }], hrv: [{ t_s: 30000, v: 60 }], effort: [{ t_s: 3600, v: 7 }] };

test("makeKeys: RSA-OAEP 2048 / SHA-256, private key not extractable", async () => {
  const { pair: kp, publicKeyB64 } = await makeKeys();
  assert.equal(kp.privateKey.extractable, false);
  assert.equal(kp.privateKey.algorithm.modulusLength, 2048);
  assert.equal(kp.privateKey.algorithm.hash.name, "SHA-256");
  await assert.rejects(crypto.subtle.exportKey("pkcs8", kp.privateKey));
  assert.ok(publicKeyB64.length > 300);
});

test("cross-language round trip: Python seal() -> WebCrypto openDrop()", async () => {
  const { pair: kp, publicKeyB64 } = await makeKeys();
  const sealed = seal(publicKeyB64, DROP);
  assert.deepEqual(await openDrop(kp.privateKey, sealed), DROP);
});

test("off by default: no keys, no network; consent wording", async () => {
  const db = memDb();
  const fetchFn = stubFetch(() => { throw new Error("no network allowed"); });
  const r = await collect({ db, fetchFn });
  assert.deepEqual([r.called, fetchFn.calls.length, await isOn(db), db.recs.size], [false, 0, false, 0]);
  const text = CONSENT.join(" ");
  for (const s of ["What is sent", "Who can read it", "How long it is kept", "How to turn it off", "with their times", "24 hours"]) assert.ok(text.includes(s), s);
  assert.ok(!/anonymous|anonymi[sz]|injury|diagnos|medical/i.test(text));
});

test("pair: one POST with only the public key; write secret never stored", async () => {
  const db = memDb();
  const fetchFn = stubFetch(() => json({ box: "BOX123", write: "W-secret-xyz", read: "R-secret-abc" }));
  const r = await pair({ db, fetchFn, nowMs: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.code, "BOX123:W-secret-xyz");
  assert.equal(fetchFn.calls.length, 1);
  assert.match(fetchFn.calls[0].url, /\/v1\/box$/);
  assert.deepEqual(Object.keys(JSON.parse(fetchFn.calls[0].body)), ["pub"]);
  const rec = db.recs.get("sync");
  assert.equal(rec.box, "BOX123");
  assert.equal(rec.read, "R-secret-abc");
  assert.ok(!JSON.stringify({ ...rec, privateKey: 0, publicKey: 0 }).includes("W-secret"));
  assert.deepEqual(db.recs.get("settings"), { convenience: true });
});

test("pair failure discards keys and stays off", async () => {
  for (const handler of [() => json({}, 500), () => { throw new Error("offline"); }]) {
    const db = memDb();
    const r = await pair({ db, fetchFn: stubFetch(handler), nowMs: NOW });
    assert.equal(r.ok, false);
    assert.match(r.status, /stays off/);
    assert.equal(await isOn(db), false);
  }
});

test("collect: one GET, decrypts and merges; 404 / errors leave features unchanged", async () => {
  const { pair: kp, publicKeyB64 } = await makeKeys();
  const db = memDb(emptyFeatures());
  await db.saveRecord("sync", { privateKey: kp.privateKey, box: "B1", read: "R1", ref_day: dayNumber(NOW) });
  const sealed = { ...seal(publicKeyB64, DROP), age_s: 0 };
  const ok = stubFetch(() => json(sealed));
  const r = await collect({ db, fetchFn: ok, nowMs: NOW });
  assert.equal(ok.calls.length, 1);
  assert.equal(ok.calls[0].headers.Authorization, "Bearer R1");
  assert.equal(r.status, "Synced 1 new workout.");
  assert.equal(db.features.workouts.length, 1);
  assert.equal(db.features.workouts[0].sport, "squash");
  assert.equal(db.features.workouts[0].effort, 7);
  assert.deepEqual(Object.keys(db.features).sort(), ["days", "max_hr", "source", "v", "window_days", "workouts"]);
  assert.ok(!/\d{4}-\d{2}-\d{2}|\d{12,}/.test(JSON.stringify(db.features)));
  const before = JSON.stringify(db.features);
  for (const h of [() => json({}, 404), () => { throw new Error("offline"); }, () => json({ key: "AAAA", nonce: "AAAA", ct: "AAAA" }),
                   () => json({ ...seal(publicKeyB64, { v: 2 }), age_s: 0 })]) {
    const res = await collect({ db, fetchFn: stubFetch(h), nowMs: NOW });
    assert.equal(JSON.stringify(db.features), before);
    assert.equal(await isOn(db), true);
    assert.ok(res.status === null || typeof res.status === "string");
  }
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

test("turn off: DELETE with read secret, keys gone even if the Pi is unreachable", async () => {
  for (const [handler, failed] of [[() => ({ ok: true, status: 204 }), false], [() => { throw new Error("offline"); }, true], [() => ({ ok: false, status: 500 }), true]]) {
    const db = memDb();
    await db.saveRecord("sync", { privateKey: {}, box: "B9", read: "R9", ref_day: 1 });
    const fetchFn = stubFetch(handler);
    const r = await unpair({ db, fetchFn });
    assert.equal(fetchFn.calls[0].method, "DELETE");
    assert.match(fetchFn.calls[0].url, /\/v1\/box\/B9$/);
    assert.equal(fetchFn.calls[0].headers.Authorization, "Bearer R9");
    assert.equal(await isOn(db), false);
    assert.equal(Boolean(r.status && /24 hours/.test(r.status)), failed);
  }
});

test("Forget everything runs unpair first; UI has no inline code", () => {
  const app = readFileSync(new URL("../web/js/app.js", import.meta.url), "utf8");
  const forget = app.slice(app.indexOf('$("forget")'));
  assert.ok(forget.indexOf("await unpair({ db })") < forget.indexOf("await db.forgetAll()"));
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  assert.ok(html.includes('id="sync-toggle"') && html.includes("off by default"));
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
