// web/js/sync-merge.js: fold a decrypted sync drop into the stored features. Day offsets only; no dates kept.
import { toFeatures } from "./features.js";

const SPORT_TYPE = { squash: "HKWorkoutActivityTypeSquash", running: "HKWorkoutActivityTypeRunning",
  walking: "HKWorkoutActivityTypeWalking", cycling: "HKWorkoutActivityTypeCycling",
  strength: "HKWorkoutActivityTypeTraditionalStrengthTraining", hiit: "HKWorkoutActivityTypeHighIntensityIntervalTraining",
  other: "HKWorkoutActivityTypeOther" };
// A mark (the Watch's workout type, saved when the workout started) labels the session starting within this window.
export const MARK_WINDOW_MS = 20 * 60_000;
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

// Workout sessions from heart rate alone (ours): during a workout the Watch records heart rate every few seconds,
// otherwise every few minutes. A run of readings no more than GAP apart, lasting at least MIN_SESSION, is a session.
// A session that ended less than SETTLE before sending may still be going on, so it waits for the next drop.
export const GAP_MS = 75_000;          // fits raw workout readings (every few s) and Health's per-minute averages
export const MIN_SESSION_MS = 10 * 60_000;
export const SETTLE_MS = 10 * 60_000;

export function splitSessions(hr, sentAt = Infinity) {
  const out = [];
  let run = [];
  const close = () => {
    if (run.length >= 10 && run[run.length - 1][0] - run[0][0] >= MIN_SESSION_MS && sentAt - run[run.length - 1][0] >= SETTLE_MS) {
      out.push({ start: run[0][0], end: run[run.length - 1][0] });
    }
    run = [];
  };
  for (const p of hr) {
    if (run.length && p[0] - run[run.length - 1][0] > GAP_MS) close();
    run.push(p);
  }
  close();
  return out;
}

// Drop (times in seconds before sending) -> the scanner's shape, in absolute ms, on the device only.
// Each drop workout is a window of heart rate; the sessions inside it become the workouts.
export function dropToScan(drop, sentAt) {
  const at = (s) => sentAt - s * 1000;
  const pts = (list) => (list || []).map((x) => [at(x.t_s), x.v]).sort((a, b) => a[0] - b[0]);
  // Two formats: hr[] of {t_s, v} (seconds before sending) or parallel hr_t[] (ISO 8601) + hr_v[] lists.
  const wHr = (w) => (w.hr_t && w.hr_t.length
    ? w.hr_t.map((t, i) => [Date.parse(t), w.hr_v[i]]).filter(([t]) => Number.isFinite(t)).sort((a, b) => a[0] - b[0])
    : pts(w.hr));
  const hr = drop.workouts.flatMap(wHr).sort((a, b) => a[0] - b[0]);
  const marks = (drop.marks || []).map((m) => ({ sport: m.sport, t: at(m.t_s) }));
  const sportFor = (start, fallback) => {
    const near = marks.filter((m) => Math.abs(m.t - start) <= MARK_WINDOW_MS)
      .sort((a, b) => Math.abs(a.t - start) - Math.abs(b.t - start));
    return near.length ? near[0].sport : fallback;
  };
  const workouts = drop.workouts.flatMap((w) => {
    const lo = at(w.start_s), hi = at(w.end_s);
    const sessions = splitSessions(wHr(w).filter(([t]) => t >= lo && t <= hi), sentAt);
    const total = sessions.reduce((n, s) => n + (s.end - s.start), 0);
    return sessions.map((s) => ({
      type: SPORT_TYPE[sportFor(s.start, w.sport)] || SPORT_TYPE.other, start: s.start, end: s.end,
      min: Math.round((s.end - s.start) / 6000) / 10,
      kcal: w.kcal == null || !total ? null : Math.round((w.kcal * (s.end - s.start)) / total),   // the window's calories, by duration
      ...(SRC[w.src] || SRC.other),
    }));
  });
  return { samples: { hr, rhr: pts(drop.rhr), hrv: pts(drop.hrv), vo2: pts(drop.vo2), effort: pts(drop.effort), effortEst: [],
                      sleep: pts(drop.sleep) }, workouts };
}

export function validDrop(d) {
  return d && d.v === 1 && Array.isArray(d.workouts) && ["rhr", "hrv", "effort", "marks", "vo2", "sleep"].every((k) => d[k] === undefined || Array.isArray(d[k]))
    && d.workouts.every((w) => typeof w.start_s === "number" && typeof w.end_s === "number" && w.start_s >= w.end_s);
}

// Same session regardless of its label (a resend may carry a mark the first send didn't). Within 3 minutes on the
// same day counts as the same: an imported workout and its backfilled copy measure duration slightly differently.
export const sameWorkout = (a, b) => a.day === b.day && Math.abs(a.min - b.min) <= 3;
const r1 = (x) => Math.round(x * 10) / 10;

// Returns { features, refDay, added }. Merging the same drop twice changes nothing.
export function mergeDrop(features, drop, { nowMs, ageS = 0, refDay }) {
  const today = dayNumber(nowMs);
  const base = shiftFeatures(features || emptyFeatures(), refDay == null ? 0 : today - refDay);
  // hrEvery 60: the Shortcut may send per-minute averages, so one reading a minute counts as dense
  const scan = { ...dropToScan(drop, nowMs - ageS * 1000), now: nowMs, days: base.window_days, maxHr: base.max_hr, hrEvery: 60 };
  const fresh = toFeatures(scan);
  const added = fresh.workouts.filter((w) => !base.workouts.some((b) => sameWorkout(b, w)));
  const workouts = [...base.workouts, ...added].sort((a, b) => a.day - b.day);
  const touched = new Set([...fresh.workouts.map((w) => w.day),
    ...fresh.days.filter((d) => d.rhr != null || d.ln_hrv != null || d.vo2 != null || d.sleep_min != null).map((d) => d.day)]);
  const days = base.days.map((d) => {
    if (!touched.has(d.day)) return d;
    const f = fresh.days.find((x) => x.day === d.day) || {};
    const ws = workouts.filter((w) => w.day === d.day);
    const rated = ws.filter((w) => w.srpe != null);
    return { day: d.day, trimp: r1(ws.reduce((s, w) => s + w.trimp, 0)),
      srpe: rated.length ? r1(rated.reduce((s, w) => s + w.srpe, 0)) : null,
      rhr: f.rhr ?? d.rhr, ln_hrv: f.ln_hrv ?? d.ln_hrv, vo2: f.vo2 ?? d.vo2, sleep_min: f.sleep_min ?? d.sleep_min ?? null };
  });
  const maxes = [base.max_hr, fresh.max_hr].filter((x) => x != null);
  return { features: { ...base, max_hr: maxes.length ? Math.max(...maxes) : null, days, workouts }, refDay: today, added: added.length };
}
