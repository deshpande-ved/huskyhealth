// web/js/sync-settings.js: turning convenience mode on (pairing) and off. OFF by default; nothing exists until consent.
import { makeKeys } from "./box.js";
import { dayNumber } from "./sync-merge.js";

export const RELAY = "https://veds-pi5.polecat-nominal.ts.net:10000";

// The consent screen, in the plan's wording (5.4). De-identified, never "anonymous"; no medical claims.
export const CONSENT = [
  "What is sent: new workouts since the last sync with their heart rate, plus the last 3 days of resting heart rate, HRV and effort. De-identified: no names, dates, places or device names.",
  "Who can read it: the relay on the Pi, in memory, for milliseconds; it then encrypts it to a key that only this phone holds.",
  "How long it is kept: until this phone collects it, at most 24 hours, in memory only.",
  "How to turn it off: tap “Turn off convenience mode” here; this phone deletes its key and the Pi forgets the box.",
];

export const pairingCode = (box, write) => `${box}:${write}`;

export async function isOn(db) {
  return Boolean(await db.loadRecord("sync"));
}

// Confirmed on the consent screen -> keys, one POST /v1/box, store keys + box + read secret (never the write secret).
export async function pair({ db, fetchFn = fetch, keys = makeKeys, relay = RELAY, nowMs = Date.now() }) {
  let k;
  try {
    k = await keys();
    const res = await fetchFn(`${relay}/v1/box`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pub: k.publicKeyB64 }),
    });
    if (!res.ok) throw new Error("relay refused");
    const { box, write, read } = await res.json();
    if (!box || !write || !read) throw new Error("bad reply");
    await db.saveRecord("sync", { privateKey: k.pair.privateKey, publicKey: k.pair.publicKey, box, read, ref_day: dayNumber(nowMs) });
    await db.saveRecord("settings", { convenience: true });
    return { ok: true, code: pairingCode(box, write) };
  } catch {
    k = null;                                                // discard the keys
    await db.saveRecord("sync", null);
    await db.saveRecord("settings", { convenience: false });
    return { ok: false, status: "Could not reach the relay, so convenience mode stays off. Nothing was sent." };
  }
}

// Turn off: DELETE the box (best effort), then always delete the local keys and records.
export async function unpair({ db, fetchFn = fetch, relay = RELAY }) {
  const rec = await db.loadRecord("sync");
  let status = null;
  if (rec) {
    try {
      const res = await fetchFn(`${relay}/v1/box/${encodeURIComponent(rec.box)}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${rec.read}` } });
      if (!res.ok && res.status !== 404) throw new Error("delete failed");
    } catch {
      status = "Convenience mode is off. The Pi could not be reached; any pending drop there expires within 24 hours and can no longer be opened.";
    }
  }
  await db.saveRecord("sync", null);
  await db.saveRecord("settings", { convenience: false });
  return { ok: true, status };
}
