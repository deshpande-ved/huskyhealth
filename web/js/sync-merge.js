// web/js/sync-merge.js: fold a decrypted sync drop into the stored features. Day offsets only; no dates kept.
import { toFeatures } from "./features.js";

const SPORT_TYPE = { squash: "HKWorkoutActivityTypeSquash", running: "HKWorkoutActivityTypeRunning", other: "HKWorkoutActivityTypeOther" };
const SRC = { watch: { device: "Apple Watch", sourceName: "" }, garmin: { device: "", sourceName: "Garmin" }, other: { device: "", sourceName: "" } };

// Local day number (days since 1970-01-01 in local time); the only "calendar" value, kept in the sync record.
export function dayNumber(ms) {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

export function emptyFeatures(days = 60) {
  return { v: 1, source: "apple_health", window_days: days, max_hr: null,
    days: Array.from({ length: days }, (_, i) => ({ day: i - (days - 1), trimp: 0, srpe: null, rhr: null, ln_hrv: null, vo2: null })),
    workouts: [] };
}

// Re-anchor offsets after `shift` days have passed since they were computed; trim to the window.
export function shiftFeatures(f, shift) {
  const w = f.window_days;
  if (!shift || shift < 0) return structuredClone(f);
  const keep = (d) => d.day - shift >= -(w - 1);
  const days = f.days.filter(keep).map((d) => ({ ...d, day: d.day - shift }));
  const have = new Set(days.map((d) => d.day));
  for (let day = -(w - 1); day <= 0; day++) if (!have.has(day)) days.push({ day, trimp: 0, srpe: null, rhr: null, ln_hrv: null, vo2: null });
  days.sort((a, b) => a.day - b.day);
  const workouts = f.workouts.filter(keep).map((x) => ({ ...x, day: x.day - shift, zone_min: [...x.zone_min] }));
  return { ...f, days, workouts };
}

// Drop (times in seconds before sending) -> the scanner's shape, in absolute ms on this phone only.
export function dropToScan(drop, sentAt) {
  const at = (s) => sentAt - s * 1000;
  const pts = (list) => (list || []).map((x) => [at(x.t_s), x.v]);
  const hr = drop.workouts.flatMap((w) => pts(w.hr)).sort((a, b) => a[0] - b[0]);
  return {
    samples: { hr, rhr: pts(drop.rhr), hrv: pts(drop.hrv), vo2: [], effort: pts(drop.effort), effortEst: [] },
    workouts: drop.workouts.map((w) => ({ type: SPORT_TYPE[w.sport] || SPORT_TYPE.other, start: at(w.start_s), end: at(w.end_s),
      min: (w.start_s - w.end_s) / 60, kcal: w.kcal ?? null, ...(SRC[w.src] || SRC.other) })),
  };
}

export function validDrop(d) {
  return d && d.v === 1 && Array.isArray(d.workouts) && ["rhr", "hrv", "effort"].every((k) => d[k] === undefined || Array.isArray(d[k]))
    && d.workouts.every((w) => typeof w.start_s === "number" && typeof w.end_s === "number" && w.start_s >= w.end_s);
}

const sameWorkout = (a, b) => a.day === b.day && a.sport === b.sport && a.min === b.min && a.trimp === b.trimp;
const r1 = (x) => Math.round(x * 10) / 10;

// Returns { features, refDay, added }. Merging the same drop twice changes nothing.
export function mergeDrop(features, drop, { nowMs, ageS = 0, refDay }) {
  const today = dayNumber(nowMs);
  const base = shiftFeatures(features || emptyFeatures(), refDay == null ? 0 : today - refDay);
  const scan = { ...dropToScan(drop, nowMs - ageS * 1000), now: nowMs, days: base.window_days, maxHr: base.max_hr };
  const fresh = toFeatures(scan);
  const added = fresh.workouts.filter((w) => !base.workouts.some((b) => sameWorkout(b, w)));
  const workouts = [...base.workouts, ...added].sort((a, b) => a.day - b.day);
  const touched = new Set([...fresh.workouts.map((w) => w.day),
    ...fresh.days.filter((d) => d.rhr != null || d.ln_hrv != null).map((d) => d.day)]);
  const days = base.days.map((d) => {
    if (!touched.has(d.day)) return d;
    const f = fresh.days.find((x) => x.day === d.day) || {};
    const ws = workouts.filter((w) => w.day === d.day);
    const rated = ws.filter((w) => w.srpe != null);
    return { day: d.day, trimp: r1(ws.reduce((s, w) => s + w.trimp, 0)),
      srpe: rated.length ? r1(rated.reduce((s, w) => s + w.srpe, 0)) : null,
      rhr: f.rhr ?? d.rhr, ln_hrv: f.ln_hrv ?? d.ln_hrv, vo2: d.vo2 };
  });
  const maxes = [base.max_hr, fresh.max_hr].filter((x) => x != null);
  return { features: { ...base, max_hr: maxes.length ? Math.max(...maxes) : null, days, workouts }, refDay: today, added: added.length };
}
