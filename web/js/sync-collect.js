// web/js/sync-collect.js: on app open with convenience mode on, collect the one pending drop, decrypt, merge.
import { openDrop } from "./box.js";
import { mergeDrop, validDrop } from "./sync-merge.js";
import { RELAY } from "./sync-settings.js";

export async function collect({ db, fetchFn = fetch, relay = RELAY, nowMs = Date.now(), open = openDrop }) {
  const rec = await db.loadRecord("sync");
  if (!rec) return { called: false, status: null };          // mode off: no network at all
  let res;
  try {
    res = await fetchFn(`${relay}/v1/drop/${encodeURIComponent(rec.box)}`, { headers: { Authorization: `Bearer ${rec.read}` } });
  } catch {
    return { called: true, status: "Sync: the relay could not be reached." };
  }
  if (res.status === 404) return { called: true, status: null };   // nothing new
  if (!res.ok) return { called: true, status: "Sync: the relay could not be reached." };
  try {
    const sealed = await res.json();
    const drop = await open(rec.privateKey, sealed);
    if (!validDrop(drop)) throw new Error("schema");
    const current = await db.loadFeatures();
    const { features, refDay, added } = mergeDrop(current, drop, { nowMs, ageS: sealed.age_s || 0, refDay: rec.ref_day });
    await db.saveFeatures(features);
    await db.saveRecord("sync", { ...rec, ref_day: refDay });
    return { called: true, status: added ? `Synced ${added} new workout${added === 1 ? "" : "s"}.` : null, features };
  } catch {
    return { called: true, status: "Sync: a drop arrived but could not be opened; nothing changed." };
  }
}
