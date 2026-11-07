// web/js/db.js: the only module that touches IndexedDB. Stores the Features JSON summary only (plan 6.5).
// No network. Forget everything deletes the whole database.
import { srpe } from "./engine.js";

const DB = "huskyhealth";
const STORE = "features";
const KEY = "current";

const DAY_KEYS = ["day", "trimp", "srpe", "rhr", "ln_hrv", "vo2"];
const WORKOUT_KEYS = ["day", "sport", "min", "kcal", "zone_min", "trimp", "effort", "srpe", "source", "hr_sample_ok"];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

// Allowlist: only the 6.5 contract survives (drops dates, device names, raw text, anything else).
export function sanitize(f) {
  return {
    v: f.v, source: f.source, window_days: f.window_days, max_hr: f.max_hr,
    days: (f.days || []).map((d) => pick(d, DAY_KEYS)),
    workouts: (f.workouts || []).map((w) => ({ ...pick(w, WORKOUT_KEYS), zone_min: [...(w.zone_min || [])] })),
  };
}

const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export function createDb(idb = globalThis.indexedDB) {
  const open = () => {
    const r = idb.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    return req(r);
  };
  const tx = async (mode, fn) => {
    const db = await open();
    try { return await req(fn(db.transaction(STORE, mode).objectStore(STORE))); } finally { db.close(); }
  };
  return {
    saveFeatures: (f) => tx("readwrite", (s) => s.put(sanitize(f), KEY)),
    loadFeatures: async () => (await tx("readonly", (s) => s.get(KEY))) ?? null,
    forgetAll: () => req(idb.deleteDatabase(DB)),
  };
}

// Set one workout's effort (whole number 1..10) and recompute its sRPE and that day's sRPE.
export function withEffort(features, index, rpe) {
  const w = features && features.workouts[index];
  if (!w || !Number.isInteger(rpe) || rpe < 1 || rpe > 10) return { features, error: "effort must be a whole number from 1 to 10" };
  const next = sanitize(features);
  const nw = next.workouts[index];
  nw.effort = rpe;
  nw.srpe = srpe(rpe, nw.min);
  const day = next.days.find((d) => d.day === nw.day);
  if (day) {
    const rated = next.workouts.filter((x) => x.day === nw.day && x.srpe != null);
    day.srpe = rated.length ? Math.round(rated.reduce((s, x) => s + x.srpe, 0) * 10) / 10 : null;
  }
  return { features: next, error: null };
}
