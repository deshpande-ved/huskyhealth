// web/js/vault.js: the account's history, as one model the website and the iPhone app both read.
// The vault (encrypted in account.js, never readable on the Pi) is the single source of truth: the app writes
// its Apple Health workouts into it, the website folds records and imports into it, and both draw today with
// featuresFromVault(vault). Same data, same code, same numbers on every screen.
export const MAX_REPORTS = 365;
const DAY = 86_400_000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const r1 = (x) => Math.round(x * 10) / 10;

export const emptyVault = () => ({ v: 1, reports: [], workouts: [], inbox: 0, rsa: null });

// One report: what the screen said, as numbers and words. No raw heart rate.
export function makeReport(analysis, features, call, { nowMs = Date.now(), source = "import", brief = null } = {}) {
  const ff = analysis.fitnessFatigue;
  const ws = features.workouts || [];
  return {
    at: new Date(nowMs).toISOString(), source,
    call: call.headline, reason: call.reason,
    fitness: Math.round(ff.fitness), fatigue: Math.round(ff.fatigue), form: Math.round(ff.form),
    workouts: ws.length, minutes: Math.round(ws.reduce((s, w) => s + (w.min || 0), 0)),
    load: Math.round(ws.reduce((s, w) => s + (w.trimp || 0), 0)),
    brief,
  };
}

// Per-workout summaries with real dates (inside the vault only). `start` (ISO, to the minute) identifies a
// workout across sources, so the same session from the export, the app and a record is kept once.
export function workoutSummaries(features, nowMs = Date.now()) {
  return (features.workouts || []).map((w) => ({
    date: w.start ? isoDay(w.start) : isoDay(nowMs + w.day * DAY),
    ...(w.start ? { start: new Date(Math.round(w.start / 60000) * 60000).toISOString().slice(0, 16) } : {}),
    sport: w.sport, min: w.min, trimp: w.trimp, kcal: w.kcal ?? null,
    zone_min: w.zone_min, effort: w.effort ?? null, srpe: w.srpe ?? null,
  }));
}

// Day summaries for the vault (sleep, VO2 max, resting HR, HRV), only days that have any.
export function daySummaries(features, nowMs = Date.now()) {
  return (features.days || []).filter((d) => d.sleep_min != null || d.vo2 != null || d.rhr != null || d.ln_hrv != null)
    .map((d) => ({ date: isoDay(nowMs + d.day * DAY), sleep_min: d.sleep_min ?? null, vo2: d.vo2 ?? null, rhr: d.rhr ?? null, ln_hrv: d.ln_hrv ?? null }));
}

const startMs = (w) => (w.start ? Date.parse(`${w.start}Z`) : NaN);
const dateGap = (a, b) => Math.abs(Date.parse(a.date) - Date.parse(b.date)) / DAY;

// Is b the same session as a? With start times on both: starts within 3 minutes. An older entry without a
// start (from before start times were kept) matches a timed one of the same sport and length (±3 min) within a
// day either side, because exports and syncs could file a late-evening session under different dates.
// Two untimed entries match only on the same date, sport and length (the rule the vault always used).
export function sameSession(a, b) {
  const sa = startMs(a), sb = startMs(b);
  if (Number.isFinite(sa) && Number.isFinite(sb)) return Math.abs(sa - sb) <= 3 * 60000;
  if (a.sport !== b.sport || Math.abs(a.min - b.min) > 3) return false;
  return Number.isFinite(sa) || Number.isFinite(sb) ? dateGap(a, b) <= 1 : a.date === b.date;
}

// Merge workout lists, one entry per session. `prefer`: "incoming" replaces a match (the phone is the authority
// on its own Apple Health workouts); "existing" keeps it (records folded in by the website). A timed entry always
// replaces an untimed one, so old duplicates heal the first time the phone writes.
export function mergeWorkouts(existing, incoming, prefer = "incoming") {
  const timed = (x) => Number.isFinite(startMs(x));
  let out = [];
  for (const w of [...existing, ...incoming.map((x) => ({ ...x, _in: true }))]) {
    if (timed(w)) out = out.filter((k) => timed(k) || !sameSession(k, w));          // absorbs every untimed copy
    else if (out.some((k) => timed(k) && sameSession(k, w))) continue;              // already known with its start
    const i = out.findIndex((k) => sameSession(k, w));
    if (i === -1) { out.push(w); continue; }
    if (w._in && !out[i]._in ? prefer === "incoming" : w._in === out[i]._in) out[i] = w;
  }
  return out.map(({ _in, ...w }) => w).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.start || "") < (a.start || "") ? -1 : 1));
}

// Deleted in Apple Health -> deleted here. `phone` is everything the app just read from Apple Health. A workout
// the app wrote earlier (by: "app") that is no longer there is removed, but only inside the span the phone can see
// (from its oldest workout on), so a 30-day Health permission never erases older history, and an empty read
// deletes nothing. Workouts from the API (curl, other devices) or an export are never removed this way.
export function pruneDeleted(vault, phone) {
  const starts = phone.map(startMs).filter(Number.isFinite);
  if (!starts.length) return vault;
  const from = Math.min(...starts);
  const gone = (w) => w.by === "app" && Number.isFinite(startMs(w)) && startMs(w) >= from && !phone.some((p) => sameSession(p, w));
  const workouts = (vault.workouts || []).filter((w) => !gone(w));
  return workouts.length === (vault.workouts || []).length ? vault : { ...vault, workouts };
}

// Merge a new report, its workouts and day summaries into the vault. Newest report first.
export function addToVault(vault, report, workouts, days = [], { prefer = "incoming" } = {}) {
  const byDate = new Map((vault.days || []).map((d) => [d.date, d]));
  for (const d of days) byDate.set(d.date, { ...(byDate.get(d.date) || {}), ...Object.fromEntries(Object.entries(d).filter(([, v]) => v != null)) });
  return {
    ...vault,
    v: 1,
    reports: report ? [report, ...(vault.reports || [])].slice(0, MAX_REPORTS) : (vault.reports || []),
    workouts: mergeWorkouts(mergeWorkouts([], vault.workouts || []), workouts, prefer),
    days: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-120),
  };
}

// Today's features from the vault: what the website and the app both show. Day offsets count from today.
export function featuresFromVault(vault, nowMs = Date.now(), windowDays = 60) {
  const today = Date.parse(isoDay(nowMs));
  const workouts = mergeWorkouts([], vault.workouts || [])
    .map((w) => ({ day: Math.round((Date.parse(w.date) - today) / DAY), sport: w.sport, min: w.min, kcal: w.kcal ?? null,
      zone_min: [...(w.zone_min || [0, 0, 0, 0, 0])], trimp: w.trimp, effort: w.effort ?? null, srpe: w.srpe ?? null,
      ...(w.start ? { start: startMs(w) } : {}), source: "account", hr_sample_ok: true }))
    .filter((w) => Number.isFinite(w.day) && w.day <= 0 && w.day > -windowDays)
    .sort((a, b) => a.day - b.day || (a.start || 0) - (b.start || 0));
  const dayInfo = new Map((vault.days || []).map((d) => [Math.round((Date.parse(d.date) - today) / DAY), d]));
  const days = Array.from({ length: windowDays }, (_, i) => {
    const day = i - (windowDays - 1);
    const info = dayInfo.get(day) || {};
    const ws = workouts.filter((w) => w.day === day);
    const rated = ws.filter((w) => w.srpe != null);
    return { day, trimp: r1(ws.reduce((s, w) => s + (w.trimp || 0), 0)), srpe: rated.length ? r1(rated.reduce((s, w) => s + w.srpe, 0)) : null,
             rhr: info.rhr ?? null, ln_hrv: info.ln_hrv ?? null, vo2: info.vo2 ?? null, sleep_min: info.sleep_min ?? null };
  });
  return { v: 1, source: "account", window_days: windowDays, max_hr: null, days, workouts };
}
