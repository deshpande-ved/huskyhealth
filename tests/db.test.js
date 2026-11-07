// E04S06: store features only; load; Forget everything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createDb, sanitize } from "../web/js/db.js";
import { storedLine } from "../web/js/view.js";

const f = JSON.parse(readFileSync(new URL("./fixtures/features-60d.json", import.meta.url), "utf8"));

// Minimal IndexedDB stand-in: one database, one store.
function fakeIdb() {
  const dbs = new Map();
  const done = (r, v) => queueMicrotask(() => { r.result = v; r.onsuccess && r.onsuccess(); });
  const api = {
    deleted: 0,
    open(name) {
      const r = {};
      queueMicrotask(() => {
        const fresh = !dbs.has(name);
        if (fresh) dbs.set(name, new Map());
        const data = dbs.get(name);
        r.result = { createObjectStore() {}, close() {},
          transaction: () => ({ objectStore: () => ({
            put(v, k) { const q = {}; data.set(k, structuredClone(v)); done(q, k); return q; },
            get(k) { const q = {}; done(q, data.has(k) ? structuredClone(data.get(k)) : undefined); return q; },
          }) }) };
        if (fresh && r.onupgradeneeded) r.onupgradeneeded();
        r.onsuccess && r.onsuccess();
      });
      return r;
    },
    deleteDatabase(name) { api.deleted++; dbs.delete(name); const r = {}; done(r, undefined); return r; },
  };
  return api;
}

test("sanitize keeps only the 6.5 contract", () => {
  const dirty = { ...f, date: "2026-11-07", device: "X", name: "Y",
    days: [{ ...f.days[0], date: "2026-09-09", note: "raw" }], workouts: [{ ...f.workouts[0], start: 1, sourceName: "Pat" }] };
  const s = sanitize(dirty);
  assert.deepEqual(Object.keys(s).sort(), ["days", "max_hr", "source", "v", "window_days", "workouts"]);
  assert.deepEqual(Object.keys(s.days[0]).sort(), ["day", "ln_hrv", "rhr", "srpe", "trimp", "vo2"]);
  assert.ok(!("start" in s.workouts[0]) && !("sourceName" in s.workouts[0]));
});

test("save, load, stored line, forget", async () => {
  const idb = fakeIdb();
  const db = createDb(idb);
  assert.equal(await db.loadFeatures(), null);
  assert.equal(storedLine(null), "Nothing stored on this phone");
  await db.saveFeatures(f);
  const back = await db.loadFeatures();
  assert.deepEqual(back, sanitize(f));
  assert.equal(storedLine(back), "Stored on this phone: 60 days of summaries");
  await db.forgetAll();
  assert.equal(idb.deleted, 1);
  assert.equal(await db.loadFeatures(), null);
});

test("Forget button in #settings; IndexedDB only in db.js; no web storage", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  const settings = html.slice(html.indexOf('<section id="settings"'), html.indexOf("</section>", html.indexOf('<section id="settings"')));
  assert.ok(settings.includes('id="forget"') && settings.includes("Forget everything"));
  const dir = new URL("../web/js/", import.meta.url);
  for (const name of readdirSync(dir)) {
    const src = readFileSync(new URL(name, dir), "utf8");
    assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(src), name);
    if (name !== "db.js") assert.ok(!/indexedDB/.test(src), name);
  }
});
