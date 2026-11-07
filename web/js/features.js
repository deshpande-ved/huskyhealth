// web/js/features.js: scan result -> Features JSON (plan 6.5). Shared by the Apple and Garmin parsers.
// Day offsets only: no timestamps, dates or raw source names leave this function. No DOM, no network.
import { zoneMinutes, trimp, srpe } from "./engine.js";

const DAY = 86_400_000;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

export function sportOf(type) {
  if (type === "HKWorkoutActivityTypeSquash") return "squash";
  if (type === "HKWorkoutActivityTypeRunning") return "running";
  return "other";
}

// Normalized source label; the raw sourceName (often the owner's name) is never kept.
export function sourceOf({ device = "", sourceName = "" }) {
  if (/Watch/.test(device) && /Apple/.test(device)) return "Apple Watch";
  if (/garmin/i.test(sourceName) || /^connect$/i.test(sourceName)) return "Garmin";
  return "Other app";
}

const localMidnight = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
// 0 = the local day of `now`, -1 = yesterday (round absorbs DST shifts)
export const dayOffset = (ms, now) => Math.round((localMidnight(ms) - localMidnight(now)) / DAY);

const inWindow = (list, start, end) => list.filter(([t]) => t >= start && t <= end);
const overlaps = (a, b) => a.start < b.end && b.start < a.end;

// One row per overlapping group from different sources: the Watch wins; else more HR samples, then earlier start.
function dedupe(ws) {
  const better = (a, b) => {
    const aw = a.src === "Apple Watch", bw = b.src === "Apple Watch";
    if (aw !== bw) return aw ? a : b;
    if (a.nHr !== b.nHr) return a.nHr > b.nHr ? a : b;
    return a.start <= b.start ? a : b;
  };
  const kept = [];
  let dropped = 0;
  for (const w of [...ws].sort((a, b) => a.start - b.start)) {
    const i = kept.findIndex((k) => k.src !== w.src && overlaps(k, w));
    if (i === -1) { kept.push(w); continue; }
    kept[i] = better(kept[i], w);
    dropped++;
  }
  return { kept, dropped };
}

// scan: { samples, workouts, now, days, source }. `stats` (optional) receives counts for the CLI.
export function toFeatures(scan, stats = {}) {
  const { samples, workouts, now, days, source = "apple_health" } = scan;
  const hrMax = samples.hr.reduce((m, [, v]) => Math.max(m, v), -Infinity);
  const maxHr = Number.isFinite(hrMax) ? Math.round(hrMax) : null;

  const rows = workouts.map((w) => {
    const hr = inWindow(samples.hr, w.start, w.end);
    const user = inWindow(samples.effort, w.start, w.end);
    const est = inWindow(samples.effortEst, w.start, w.end);
    const effort = user.length ? user[user.length - 1][1] : est.length ? est[est.length - 1][1] : null;
    const zm = maxHr ? zoneMinutes(hr, w.start, w.end, maxHr) : [0, 0, 0, 0, 0];
    const needed = Math.floor((w.end - w.start) / 1000 / 15);
    return {
      start: w.start, end: w.end, src: sourceOf(w), nHr: hr.length,
      effortKind: user.length ? "user" : est.length ? "estimated" : "none",
      row: {
        day: dayOffset(w.start, now), sport: sportOf(w.type), min: r1(w.min),
        kcal: w.kcal == null ? null : Math.round(w.kcal), zone_min: zm.map(r2), trimp: r1(trimp(zm)),
        effort, srpe: srpe(effort, r1(w.min)), source: sourceOf(w), hr_sample_ok: hr.length > 0 && hr.length >= needed,
      },
    };
  });
  const { kept, dropped } = dedupe(rows);
  const out = kept.map((k) => k.row);

  stats.deduped = dropped;
  stats.effort = { user: 0, estimated: 0, none: 0 };
  for (const k of kept) stats.effort[k.effortKind]++;

  const byDay = (list) => {
    const m = new Map();
    for (const [t, v] of list) { const d = dayOffset(t, now); if (!m.has(d)) m.set(d, []); m.get(d).push(v); }
    return m;
  };
  const rhr = byDay(samples.rhr);
  const hrv = byDay(samples.hrv.filter(([, v]) => v > 0));
  const vo2 = byDay(samples.vo2);

  const dayRows = Array.from({ length: days }, (_, i) => {
    const day = i - (days - 1);
    const ws = out.filter((w) => w.day === day);
    const rated = ws.filter((w) => w.srpe != null);
    return {
      day,
      trimp: r1(ws.reduce((s, w) => s + w.trimp, 0)),
      srpe: rated.length ? r1(rated.reduce((s, w) => s + w.srpe, 0)) : null,
      rhr: rhr.has(day) ? r1(mean(rhr.get(day))) : null,
      ln_hrv: hrv.has(day) ? r3(mean(hrv.get(day).map(Math.log))) : null,
      vo2: vo2.has(day) ? r1(vo2.get(day)[vo2.get(day).length - 1]) : null,
    };
  });
  stats.daysWithHrv = dayRows.filter((d) => d.ln_hrv != null).length;

  return { v: 1, source, window_days: days, max_hr: maxHr, days: dayRows, workouts: out };
}
