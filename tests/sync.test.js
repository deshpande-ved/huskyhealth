// E06S02/S03/S05: keys, pairing, collect-on-open, merge, turn-off. Network is a stub; the relay crypto is real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openDrop } from "../web/js/box.js";
import { makeAccountKeys, fetchRecords } from "../web/js/account.js";
import { dropToVault } from "../web/js/sync-merge.js";
import { addToVault, featuresFromVault, emptyVault, workoutSummaries } from "../web/js/vault.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PY = existsSync(`${ROOT}.venv/bin/python`) ? `${ROOT}.venv/bin/python` : "python3";
const NOW = new Date(2026, 10, 7, 18).getTime();

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

test("UI has no inline code", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  assert.ok(!/ on[a-z]+=|style="/.test(html));
  for (const f of readdirSync(new URL("../web/js/", import.meta.url))) {
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(readFileSync(new URL(`../web/js/${f}`, import.meta.url), "utf8")), f);
  }
});

// The vault is the one source: the app writes Apple Health workouts into it, the website folds records into it.
const DAY = 86400000;
const timed = (start, min, extra = {}) => ({ date: start.slice(0, 10), start, sport: "squash", min, trimp: 100, kcal: 400,
  zone_min: [0, 0, 30, 15, 0], effort: null, srpe: null, ...extra });

test("one record is one workout, with the start time the watch recorded", () => {
  const v = dropToVault(DROP, NOW, NOW);
  assert.equal(v.workouts.length, 1);
  assert.equal(v.workouts[0].start, new Date(NOW - 7200 * 1000).toISOString().slice(0, 16));
  assert.equal(v.workouts[0].min, 60);
  assert.equal(v.workouts[0].kcal, 500);
});

test("the app's copy and the record of the same workout are kept once; the app's numbers win", () => {
  const rec = dropToVault(DROP, NOW, NOW).workouts[0];
  const app = { ...rec, start: new Date(Date.parse(`${rec.start}Z`) + 60000).toISOString().slice(0, 16), trimp: 123 };
  let v = addToVault(emptyVault(), null, [rec], [], { prefer: "existing" });      // the website folds the record first
  v = addToVault(v, null, [app]);                                                  // then the app writes its own
  assert.deepEqual(v.workouts.map((w) => w.trimp), [123]);
  v = addToVault(v, null, [rec], [], { prefer: "existing" });                      // a resent record changes nothing
  assert.deepEqual(v.workouts.map((w) => w.trimp), [123]);
});

test("old untimed duplicates (an export filed a day off) heal when the app writes the timed workout", () => {
  const old = [{ date: "2026-10-20", sport: "squash", min: 45, trimp: 90, zone_min: [0, 0, 30, 15, 0] },
               { date: "2026-10-21", sport: "squash", min: 46, trimp: 95, zone_min: [0, 0, 30, 15, 0] }];
  const v = addToVault({ ...emptyVault(), workouts: old }, null, [timed("2026-10-21T00:30", 45)]);
  assert.equal(v.workouts.length, 1);
  assert.equal(v.workouts[0].start, "2026-10-21T00:30");
  // two real sessions on the same day stay two
  const two = addToVault(emptyVault(), null, [timed("2026-10-21T07:00", 45), timed("2026-10-21T18:00", 45)]);
  assert.equal(two.workouts.length, 2);
});

test("the website and the app draw the same today from the same vault", async () => {
  const { analyze } = await import("../web/js/engine.js");
  const { todayModel } = await import("../web/js/view.js");
  const ws = [0, 2, 4, 9, 11, 16, 23].map((d) => timed(new Date(NOW - d * DAY).toISOString().slice(0, 16), 40 + d));
  const vault = addToVault(emptyVault(), null, ws);
  const site = featuresFromVault(JSON.parse(JSON.stringify(vault)), NOW);         // the browser's copy
  const app = featuresFromVault(JSON.parse(JSON.stringify(vault)), NOW);          // the app's copy
  assert.deepEqual(todayModel(analyze(app), app), todayModel(analyze(site), site));
  assert.equal(site.workouts.length, 7);
  assert.ok(!JSON.stringify(workoutSummaries(site, NOW)).includes("undefined"));
});

test("fetchRecords unwraps the exact receive time sealed inside; deleteRecords sends DELETE upto", async () => {
  const { deleteRecords } = await import("../web/js/account.js");
  const { pub, pkcs8 } = await makeAccountKeys();
  const account = { session: "s1", privateKey: await importPriv(pkcs8) };
  const wrapped = { received: 1794103242, record: DROP };
  const fetchFn = stubFetch(() => json({ records: [{ id: 9, at: 1794099600, ...seal(pub, wrapped) }], last: 9 }));
  const r = await fetchRecords({ account, fetchFn, relay: "https://r" });
  assert.deepEqual(r.records.map((x) => [x.id, x.at]), [[9, 1794103242]]);
  assert.deepEqual(r.records[0].drop, DROP);
  const del = stubFetch(() => ({ ok: true, status: 204, json: async () => null }));
  assert.ok((await deleteRecords({ account, upto: 9, fetchFn: del, relay: "https://r" })).ok);
  assert.equal(del.calls[0].url, "https://r/v1/me/records?upto=9");
  assert.equal(del.calls[0].method, "DELETE");
});

test("calories survive the API and show in today's summaries", async () => {
  const { todayModel } = await import("../web/js/view.js");
  const { analyze } = await import("../web/js/engine.js");
  const v = dropToVault(DROP, NOW, NOW);
  const features = featuresFromVault(addToVault(emptyVault(), null, v.workouts, v.days), NOW);
  assert.equal(features.workouts.length, 1);
  assert.equal(features.workouts[0].kcal, 500);
  const m = todayModel(analyze(features), features);
  assert.match(m.week.summary, /500 kcal/);
  assert.match(m.last.summary, /500 kcal/);
});
