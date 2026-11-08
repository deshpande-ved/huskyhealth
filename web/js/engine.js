// web/js/engine.js: pure functions; same inputs -> same outputs; the References page mirrors this file.
// No DOM, no network, no imports. Training insight only.

export const VERSION = { load: "husky_load_v1", readiness: "husky_readiness_v1", gates: "husky_gates_v1" };

// One entry per published / adapted / own method (plan 7.1 + data gates 7.4).
export const SOURCES = {
  "zone-minutes":    { method: "Time in 50-60 / 60-70 / 70-80 / 80-90 / 90-100 % of max HR", citation: "Edwards 1993", status: "published", version: VERSION.load },
  "trimp":           { method: "TRIMP = sum of zone minutes x weights 1..5", citation: "Edwards 1993", status: "published", version: VERSION.load },
  "srpe":            { method: "Session-RPE = effort x minutes", citation: "Foster et al. 2001", status: "published", version: VERSION.load },
  "fitness-fatigue": { method: "42-day and 7-day impulse-response averages of daily TRIMP; form = fitness - fatigue", citation: "Banister et al. 1975", status: "published", version: VERSION.load },
  "monotony":        { method: "Mean / SD of the last 7 daily loads; flag above 2", citation: "Foster 1998", status: "published", version: VERSION.load },
  "readiness":       { method: "7-day rolling mean of daily ln(HRV) vs baseline mean +/- 0.5 SD; inside: hard is fine, outside: easy", citation: "Plews et al. 2013-14", status: "adapted", version: VERSION.readiness },
  "data-check":      { method: "At least 3 days with HRV in the last 7", citation: "Plews et al. 2014", status: "published", version: VERSION.readiness },
  "baseline":        { method: "At least 14 days with HRV before the last 7", citation: "HuskyHealth", status: "ours", version: VERSION.readiness },
  "load-call":       { method: "When HRV is too thin for a call: last 7 days' load / your usual week (last 28 days / 4); above 1.3: easy, else hard is fine", citation: "Gabbett 2016, Br J Sports Med (acute:chronic)", status: "disputed", version: VERSION.readiness },
  "load-spike":      { method: "Last 7 days / (last 28 days / 4); info only above 1.5", citation: "Gabbett 2016, Br J Sports Med", status: "disputed", version: VERSION.load },
  "sleep":           { method: "Minutes asleep per night (core, deep, REM; never in bed or awake), last night against your 7-night average", citation: "Apple sleep stages", status: "descriptive", version: VERSION.load },
  "vo2-trend":       { method: "Least-squares slope of VO2 max x 28 days", citation: "Apple VO2 max estimate", status: "descriptive", version: VERSION.load },
  "sport-view":      { method: "Latest session vs your own history in the same sport (mean, SD, z); no multipliers", citation: "HuskyHealth", status: "ours", version: VERSION.load },
  "hr-density":      { method: "Workout HR averages at least 1 sample per 15 s, else zones are low-confidence", citation: "HuskyHealth", status: "ours", version: VERSION.gates },
  "max-hr":          { method: "Fewer than 3 sessions reaching zone 4-5: max HR may be underestimated", citation: "HuskyHealth", status: "ours", version: VERSION.gates },
  "rate-effort":     { method: "Workouts without an effort rating have no session-RPE", citation: "HuskyHealth", status: "ours", version: VERSION.gates },
};

export const source = (id) => {
  const s = SOURCES[id];
  if (!s) throw new Error(`unknown source: ${id}`);
  return { id, ...s };
};
export const withSource = (id, value) => ({ value, source: source(id) });

const ZONE_W = [1, 2, 3, 4, 5];
const sum = (a) => a.reduce((s, v) => s + v, 0);
const mean = (a) => sum(a) / a.length;
const popSd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const sampleSd = (a) => { const m = mean(a); return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1)); };

// Edwards zone index 0..4 for a bpm, or -1 below 50 %. Integer math so 60/70/80/90 % land in the higher zone.
function zoneOf(bpm, maxHr) {
  if (bpm * 2 < maxHr) return -1;
  return Math.min(4, Math.floor((bpm * 10) / maxHr + 1e-9) - 5);
}

// Minutes in each Edwards zone from HR samples [ms, bpm] inside a workout's time range.
export function zoneMinutes(hr, start, end, maxHr) {
  const w = hr.filter(([t]) => t >= start && t <= end).sort((a, b) => a[0] - b[0]);
  const z = [0, 0, 0, 0, 0];
  for (let i = 0; i < w.length - 1; i++) {
    const dtMin = Math.min((w[i + 1][0] - w[i][0]) / 60000, 1);   // cap sensor gaps at 1 min
    const k = zoneOf(w[i][1], maxHr);
    if (k >= 0) z[k] += dtMin;
  }
  return z;
}

export const trimp = (zoneMin) => zoneMin.reduce((s, m, i) => s + m * ZONE_W[i], 0);
export const srpe = (effort, minutes) => (effort ? effort * minutes : null);

// Session load with sources attached (for UI and tests).
export function sessionLoad(hr, start, end, maxHr, effort) {
  const zm = zoneMinutes(hr, start, end, maxHr);
  const minutes = (end - start) / 60000;
  return {
    zone_min: withSource("zone-minutes", zm),
    trimp: withSource("trimp", trimp(zm)),
    srpe: withSource("srpe", srpe(effort, minutes)),
  };
}

function checkFeatures(features) {
  if (!features || features.v !== 1) throw new Error(`unsupported features version: ${features && features.v}`);
}

// Values for day offsets -(window_days-1)..0, oldest first; `fill` where a day is missing or null.
export function dailySeries(features, key, fill) {
  checkFeatures(features);
  const byDay = new Map(features.days.map((d) => [d.day, d[key]]));
  const n = features.window_days;
  return Array.from({ length: n }, (_, i) => {
    const v = byDay.get(i - (n - 1));
    return v == null ? fill : v;
  });
}

// Banister impulse-response; dailyLoad is oldest -> today.
export function fitnessFatigue(dailyLoad) {
  let fitness = dailyLoad.length ? mean(dailyLoad.slice(0, 7)) : 0;   // seed with week 1 to soften the cold start
  let fatigue = fitness;
  const series = dailyLoad.map((x) => {
    fitness += (x - fitness) / 42;
    fatigue += (x - fatigue) / 7;
    return { fitness, fatigue, form: fitness - fatigue };
  });
  return { fitness, fatigue, form: fitness - fatigue, series, source: source("fitness-fatigue") };
}

// Foster: mean / population SD of the last 7 daily loads; identical non-zero loads flag (no variation).
export function monotony(last7) {
  const m = mean(last7);
  const sd = popSd(last7);
  const value = sd ? m / sd : null;
  return { value, flag: value == null ? m > 0 : value > 2, source: source("monotony") };
}

// Acute:chronic ratio, info only.
export function loadSpike(dailyLoad) {
  if (dailyLoad.length < 28) return { value: null, flag: false, info: true, source: source("load-spike") };
  const acute = sum(dailyLoad.slice(-7));
  const chronic = sum(dailyLoad.slice(-28)) / 4;
  const value = chronic ? acute / chronic : null;
  return { value, flag: value != null && value > 1.5, info: true, source: source("load-spike") };
}

// Least-squares slope of non-null vo2 against day, per 28 days.
export function vo2Trend(days) {
  const pts = days.filter((d) => d.vo2 != null);
  if (pts.length < 2) return { value: null, source: source("vo2-trend") };
  const mx = mean(pts.map((p) => p.day));
  const my = mean(pts.map((p) => p.vo2));
  const sxx = sum(pts.map((p) => (p.day - mx) ** 2));
  const sxy = sum(pts.map((p) => (p.day - mx) * (p.vo2 - my)));
  return { value: sxx ? (sxy / sxx) * 28 : null, source: source("vo2-trend") };
}

// Sleep, descriptive: last night, the 7-night and 28-night averages, and the last 7 nights (oldest first).
export function sleepSummary(days) {
  const nights = days.filter((d) => d.sleep_min != null);
  const avg = (a) => (a.length ? mean(a.map((d) => d.sleep_min)) : null);
  const last = nights.length ? nights[nights.length - 1] : null;
  return { last: last ? last.sleep_min : null, lastDay: last ? last.day : null, avg7: avg(nights.slice(-7)), avg28: avg(nights.slice(-28)),
           nights7: days.slice(-7).map((d) => ({ day: d.day, min: d.sleep_min ?? null })), source: source("sleep") };
}

// Latest session of a sport vs the earlier ones (by TRIMP).
export function sportView(workouts, sport) {
  const ws = workouts.filter((w) => w.sport === sport).slice().sort((a, b) => a.day - b.day);
  const latest = ws.length ? ws[ws.length - 1].trimp : null;
  const earlier = ws.slice(0, -1).map((w) => w.trimp);
  const out = { sport, count: ws.length, latest, mean: null, sd: null, z: null, source: source("sport-view") };
  if (earlier.length >= 1) out.mean = mean(earlier);
  if (earlier.length >= 2) {
    out.sd = sampleSd(earlier);
    out.z = out.sd ? (latest - out.mean) / out.sd : null;
  }
  return out;
}

// Readiness, adapted from Plews et al.: rolling 7-day ln(HRV) vs baseline mean +/- 0.5 SD.
export function readiness(dailyLnHrv) {   // oldest -> today; null where no reading
  const last7 = dailyLnHrv.slice(-7).filter((v) => v != null);
  const base = dailyLnHrv.slice(0, -7).filter((v) => v != null);
  const failed = [];
  if (last7.length < 3) failed.push("data-check");
  if (base.length < 14) failed.push("baseline");
  if (failed.length) {
    return { call: "not_enough_data", n7: last7.length, nBase: base.length,
             failed, failedSources: failed.map(source), source: source("readiness") };
  }
  const mu = mean(base);
  const sd = sampleSd(base);
  const roll = mean(last7);
  return {
    call: Math.abs(roll - mu) <= 0.5 * sd ? "hard" : "easy",
    z: sd ? (roll - mu) / sd : 0, n7: last7.length, nBase: base.length, source: source("readiness"),
  };
}

// Today's call: the HRV band when there is enough HRV, else this week's load against your usual week.
export function todayCall(ready, dailyLoad) {
  const acute = sum(dailyLoad.slice(-7));
  const usual = sum(dailyLoad.slice(-28)) / 4;
  if (ready.call !== "not_enough_data") return { call: ready.call, basis: "hrv", z: ready.z, acute, usual, source: ready.source };
  const ratio = usual ? acute / usual : null;
  return { call: ratio == null || ratio > 1.3 ? "easy" : "hard", basis: "load", ratio, acute, usual, source: source("load-call") };
}

// Data gates (plan 7.4 layer 4).
export const hrDensityGate = (workouts) =>
  workouts.filter((w) => w.hr_sample_ok === false).map((w) => ({ day: w.day, sport: w.sport, status: "low_confidence" }));

export function maxHrGate(workouts) {
  const high = workouts.filter((w) => w.zone_min && w.zone_min[3] + w.zone_min[4] > 0).length;
  return { raised: high < 3, sessions: high };
}

export const effortGate = (workouts) =>
  workouts.filter((w) => w.effort == null).map((w) => ({ day: w.day, sport: w.sport }));

// Everything the UI shows, each value with its source. Does not mutate `features`.
export function analyze(features) {
  checkFeatures(features);
  const workouts = features.workouts || [];
  const load = dailySeries(features, "trimp", 0);
  const ready = readiness(dailySeries(features, "ln_hrv", null));

  const gates = [];
  const lowHr = hrDensityGate(workouts);
  if (lowHr.length) gates.push({ id: "hr-density", items: lowHr, source: source("hr-density") });
  const mh = maxHrGate(workouts);
  if (mh.raised) gates.push({ id: "max-hr", items: [{ sessions: mh.sessions }], source: source("max-hr") });
  if (ready.call === "not_enough_data") {
    gates.push({ id: "hrv", items: ready.failed.map((id) => ({ check: id })), source: source(ready.failed[0]) });
  }
  const noEffort = effortGate(workouts);
  if (noEffort.length) gates.push({ id: "rate-effort", items: noEffort, source: source("rate-effort") });

  const sports = [...new Set(workouts.map((w) => w.sport))];
  return {
    readiness: ready,
    today: todayCall(ready, load),
    fitnessFatigue: fitnessFatigue(load),
    monotony: monotony(load.slice(-7)),
    loadSpike: loadSpike(load),
    vo2Trend: vo2Trend(features.days),
    sleep: sleepSummary(features.days),
    sportView: Object.fromEntries(sports.map((s) => [s, sportView(workouts, s)])),
    gates,
  };
}
