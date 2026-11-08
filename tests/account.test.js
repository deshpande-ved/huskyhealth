// Accounts, browser side: keys derived here, vault sealed here; the relay only ever sees an id hash, an auth key and ciphertext.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveKeys, seal, unseal, signIn, saveVault, deleteAccount, addToVault, makeReport, workoutSummaries, emptyVault } from "../web/js/account.js";

const R = 1000;                                   // fast rounds for tests; the app uses 600 000
const MARK = "MARKER-plaintext-77aa";

// A tiny relay that behaves like relay/accounts.py and records everything it is sent.
function fakeRelay() {
  const store = new Map(); const sessions = new Map(); const seen = [];
  const fetchFn = async (url, { headers, body }) => {
    seen.push({ url, body: body || "" });
    const path = url.split("/v1/account/")[1];
    const b = body ? JSON.parse(body) : {};
    const res = (status, json) => ({ status, json: async () => json });
    if (path === "create") {
      if (store.has(b.id)) return res(409, { error: "conflict" });
      store.set(b.id, { auth: b.auth, vault: null }); sessions.set("s-" + b.id, b.id);
      return res(201, { session: "s-" + b.id, vault: null });
    }
    if (path === "open") {
      const rec = store.get(b.id);
      if (!rec || rec.auth !== b.auth) return res(401, { error: "unauthorized" });
      sessions.set("s-" + b.id, b.id);
      return res(200, { session: "s-" + b.id, vault: rec.vault, has_pub: Boolean(rec.pub) });
    }
    const id = sessions.get((headers.Authorization || "").slice(7));
    if (!id) return res(401, { error: "unauthorized" });
    if (path === "vault") { store.get(id).vault = b.vault; return res(204); }
    if (path === "pubkey") { store.get(id).pub = b.pub; return res(204); }
    if (path === "delete") { store.delete(id); return res(204); }
    return res(404, {});
  };
  return { fetchFn, store, seen };
}

test("derived keys: stable per user+password, id is a hash, auth differs from the vault key", async () => {
  const a = await deriveKeys("Ved ", "pw-1", R);
  const b = await deriveKeys("ved", "pw-1", R);
  const c = await deriveKeys("ved", "pw-2", R);
  assert.equal(a.id, b.id); assert.equal(a.auth, b.auth);
  assert.notEqual(a.auth, c.auth); assert.equal(a.id, c.id);
  assert.match(a.id, /^[0-9a-f]{64}$/);
  assert.equal(Buffer.from(a.auth, "base64").length, 32);
});

test("seal/unseal round trip; wrong password or wrong account cannot open it", async () => {
  const k = await deriveKeys("ved", "pw", R);
  const v = { ...emptyVault(), reports: [{ call: MARK }] };
  const blob = await seal(k, v);
  assert.ok(!Buffer.from(blob, "base64").toString("latin1").includes(MARK));
  assert.deepEqual(await unseal(k, blob), v);
  await assert.rejects(unseal(await deriveKeys("ved", "nope", R), blob));
  await assert.rejects(unseal(await deriveKeys("someone", "pw", R), blob));
});

test("sign up, save, log in elsewhere: history comes back; the relay never saw username, password or plaintext", async () => {
  const relay = fakeRelay();
  const opts = { fetchFn: relay.fetchFn, relay: "https://r", rounds: R };
  const up = await signIn({ username: "ved", password: "correct horse", create: true, ...opts });
  assert.ok(up.ok);
  const vault = addToVault(up.vault, { at: "2026-11-07T20:00:00Z", call: MARK }, [{ date: "2026-11-07", sport: "squash", min: 45, trimp: 169 }]);
  assert.ok((await saveVault({ account: up, vault, ...opts })).ok);

  const again = await signIn({ username: "VED", password: "correct horse", ...opts });
  assert.ok(again.ok);
  assert.equal(again.vault.reports[0].call, MARK);
  assert.equal(again.vault.workouts[0].sport, "squash");

  assert.ok(relay.store.values().next().value.pub, "public key reached the relay");
  assert.ok(again.privateKey && again.vault.rsa, "private key only inside the vault");
  const wire = relay.seen.map((s) => s.body).join("\n");
  assert.ok(!wire.includes(again.vault.rsa), "private key never sent in clear");
  for (const secret of ["ved", "correct horse", MARK, "squash"]) assert.ok(!wire.includes(secret), `relay saw ${secret}`);

  assert.equal((await signIn({ username: "ved", password: "wrong", ...opts })).status, "Wrong username or password.");
  assert.match((await signIn({ username: "ved", password: "x", create: true, ...opts })).status, /taken/);
});

test("delete removes the account", async () => {
  const relay = fakeRelay();
  const opts = { fetchFn: relay.fetchFn, relay: "https://r", rounds: R };
  const up = await signIn({ username: "a", password: "b", create: true, ...opts });
  assert.ok((await deleteAccount({ account: up, ...opts })).ok);
  assert.equal(relay.store.size, 0);
});

test("relay unreachable: clear message, never throws", async () => {
  const r = await signIn({ username: "a", password: "b", fetchFn: async () => { throw new Error("offline"); }, relay: "https://r", rounds: R });
  assert.equal(r.ok, false); assert.match(r.status, /Could not reach/);
});

test("vault merge: workouts deduped by date+sport+minutes, newest first; reports newest first", () => {
  let v = emptyVault();
  v = addToVault(v, { at: "1" }, [{ date: "2026-11-01", sport: "squash", min: 45 }, { date: "2026-11-03", sport: "running", min: 30 }]);
  v = addToVault(v, { at: "2" }, [{ date: "2026-11-03", sport: "running", min: 30.2 }, { date: "2026-11-05", sport: "squash", min: 50 }]);
  assert.deepEqual(v.reports.map((r) => r.at), ["2", "1"]);
  assert.deepEqual(v.workouts.map((w) => w.date), ["2026-11-05", "2026-11-03", "2026-11-01"]);
});

test("report and summaries carry no heart-rate streams", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  const features = { workouts: [{ day: -2, sport: "squash", min: 45, trimp: 169, zone_min: [0, 7, 12, 11, 15], effort: 7, srpe: 315, kcal: 500 }] };
  const analysis = { fitnessFatigue: { fitness: 40.4, fatigue: 55.6, form: -15.2 } };
  const r = makeReport(analysis, features, { headline: "Go easy", reason: "HRV below band" }, { nowMs: now });
  assert.deepEqual([r.call, r.fitness, r.fatigue, r.form, r.workouts, r.load], ["Go easy", 40, 56, -15, 1, 169]);
  const [w] = workoutSummaries(features, now);
  assert.deepEqual(Object.keys(w).sort(), ["date", "effort", "min", "sport", "srpe", "trimp", "zone_min"]);
  assert.equal(w.date, "2026-11-05");
});

test("featuresFromVault: a new browser gets today back from the account (workouts in the window, day offsets from today)", async () => {
  const { featuresFromVault } = await import("../web/js/account.js");
  const { analyze } = await import("../web/js/engine.js");
  const { todayModel } = await import("../web/js/view.js");
  const now = Date.parse("2026-11-07T20:00:00Z");
  const vault = { ...emptyVault(), workouts: [
    { date: "2026-11-07", sport: "squash", min: 45, trimp: 169, zone_min: [0, 7, 12, 11, 15], effort: 7, srpe: 315 },
    { date: "2026-11-05", sport: "squash", min: 50, trimp: 150, zone_min: [5, 10, 15, 10, 10], effort: null, srpe: null },
    { date: "2026-08-01", sport: "running", min: 30, trimp: 60, zone_min: [10, 10, 10, 0, 0] },   // outside 60 days
  ] };
  const f = featuresFromVault(vault, now);
  assert.deepEqual(f.workouts.map((w) => [w.day, w.sport]), [[-2, "squash"], [0, "squash"]]);
  assert.equal(f.days.length, 60);
  assert.equal(f.days.at(-1).trimp, 169);
  assert.equal(f.days.at(-1).srpe, 315);
  const m = todayModel(analyze(f), f);
  assert.equal(m.call.basis, "from your training load (not enough HRV yet)");
  assert.match(m.last.label, /^Last session: Squash, today, 45 min, load 169, effort 7 of 10$/);
});
