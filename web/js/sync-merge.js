// web/js/sync-merge.js: a decrypted record from the personal API, read into vault entries (in the browser only).
import { toFeatures } from "./features.js";
import { workoutSummaries, daySummaries } from "./vault.js";

const SPORT_TYPE = { squash: "HKWorkoutActivityTypeSquash", running: "HKWorkoutActivityTypeRunning",
  walking: "HKWorkoutActivityTypeWalking", cycling: "HKWorkoutActivityTypeCycling",
  strength: "HKWorkoutActivityTypeTraditionalStrengthTraining", hiit: "HKWorkoutActivityTypeHighIntensityIntervalTraining",
  other: "HKWorkoutActivityTypeOther" };
const SRC = { watch: { device: "Apple Watch", sourceName: "" }, garmin: { device: "", sourceName: "Garmin" }, other: { device: "", sourceName: "" } };

// Local day number (days since 1970-01-01 in local time); the only "calendar" value, kept in the sync record.
export function dayNumber(ms) {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

// Drop (times in seconds before sending) -> the scanner's shape, in absolute ms, on the device only.
// Each drop workout is one workout, exactly as the watch recorded it: its own start, end, sport and heart rate.
export function dropToScan(drop, sentAt) {
  const at = (s) => sentAt - s * 1000;
  const pts = (list) => (list || []).map((x) => [at(x.t_s), x.v]).sort((a, b) => a[0] - b[0]);
  const hr = drop.workouts.flatMap((w) => pts(w.hr)).sort((a, b) => a[0] - b[0]);
  const workouts = drop.workouts.map((w) => {
    const start = at(w.start_s), end = at(w.end_s);
    return { type: SPORT_TYPE[w.sport] || SPORT_TYPE.other, start, end, min: Math.round((end - start) / 6000) / 10,
             kcal: w.kcal ?? null, ...(SRC[w.src] || SRC.other) };
  });
  return { samples: { hr, rhr: pts(drop.rhr), hrv: pts(drop.hrv), vo2: pts(drop.vo2), effort: pts(drop.effort), effortEst: [],
                      sleep: pts(drop.sleep) }, workouts };
}

export function validDrop(d) {
  return d && d.v === 1 && Array.isArray(d.workouts) && ["rhr", "hrv", "effort", "vo2", "sleep"].every((k) => d[k] === undefined || Array.isArray(d[k]))
    && d.workouts.every((w) => typeof w.start_s === "number" && typeof w.end_s === "number" && w.start_s >= w.end_s);
}

// A record from a device, as vault entries: each workout keeps its start time, so the vault holds it once even
// when the app also writes the same Apple Health workout directly.
// maxHr: the max heart rate the app found over 60 days (vault.max_hr), so a record's zones match the app's.
export function dropToVault(drop, receivedMs, nowMs = Date.now(), maxHr = null) {
  const f = toFeatures({ ...dropToScan(drop, receivedMs), now: nowMs, days: 60, hrEvery: 60, keepStart: true, maxHr });
  return { workouts: workoutSummaries(f, nowMs), days: daySummaries(f, nowMs) };
}
