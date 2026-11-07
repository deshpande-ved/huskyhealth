// E01S03: service worker, run in a node:vm context with stubs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../web/sw.js", import.meta.url), "utf8");
const webPath = (p) => new URL(`../web${p === "/" ? "/index.html" : p}`, import.meta.url);

// E01's own entries. Later stories add theirs here when they grow SHELL.
const EXPECTED = ["/", "/index.html", "/css/style.css", "/js/app.js",
                  "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

function load() {
  const handlers = {};
  const calls = { opened: [], addAll: [], deleted: [], fetched: [] };
  const cacheStore = new Map([["/index.html", "cached-index"]]);
  const ctx = {
    URL,
    self: { addEventListener: (type, fn) => { handlers[type] = fn; } },
    caches: {
      open: async (name) => { calls.opened.push(name); return { addAll: async (list) => calls.addAll.push(list) }; },
      keys: async () => ["huskyhealth-v0", "other", ctx.__CACHE],
      delete: async (k) => { calls.deleted.push(k); return true; },
      match: async (req) => cacheStore.get(new URL(req.url).pathname),
    },
    fetch: async (req) => { calls.fetched.push(req.url); return "network"; },
  };
  vm.createContext(ctx);
  vm.runInContext(`${src}\n;globalThis.__CACHE = CACHE; globalThis.__SHELL = SHELL;`, ctx);
  return { ctx, handlers, calls };
}

function event(url) {
  const e = { request: { url }, responded: null, waited: null };
  e.respondWith = (p) => { e.responded = p; };
  e.waitUntil = (p) => { e.waited = p; };
  return e;
}

test("CACHE and SHELL", () => {
  const { ctx } = load();
  assert.match(ctx.__CACHE, /^huskyhealth-v\d+$/);
  for (const p of EXPECTED) assert.ok(ctx.__SHELL.includes(p), `SHELL missing ${p}`);
  for (const p of ctx.__SHELL) assert.ok(existsSync(webPath(p)), `SHELL entry ${p} has no file under web/`);
});

test("install caches SHELL; activate deletes old caches", async () => {
  const { ctx, handlers, calls } = load();
  const i = event("https://x/");
  handlers.install(i);
  await i.waited;
  assert.deepEqual(calls.opened, [ctx.__CACHE]);
  assert.deepEqual([...calls.addAll[0]], [...ctx.__SHELL]);
  const a = event("https://x/");
  handlers.activate(a);
  await a.waited;
  assert.deepEqual(calls.deleted.sort(), ["huskyhealth-v0", "other"]);
});

test("/v1/ requests are never answered by the worker", () => {
  const { handlers } = load();
  for (const u of ["https://relay.example/v1/brief", "https://x/v1/token"]) {
    const e = event(u);
    handlers.fetch(e);
    assert.equal(e.responded, null, u);
  }
});

test("other requests are cache-first with network fallback", async () => {
  const { handlers, calls } = load();
  const hit = event("https://x/index.html");
  handlers.fetch(hit);
  assert.equal(await hit.responded, "cached-index");
  const miss = event("https://x/css/style.css");
  handlers.fetch(miss);
  assert.equal(await miss.responded, "network");
  assert.deepEqual(calls.fetched, ["https://x/css/style.css"]);
});
