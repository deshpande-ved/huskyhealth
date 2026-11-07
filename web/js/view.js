// web/js/view.js: pure screen model. Engine output -> figures (rows of {ch, cls}), labels, plain text, lines.
// No DOM, no network. app.js paints what this returns.
import { banner, gauge, calendar, plot, bar } from "./ascii.js";

export const WIDTH = 44;

// engine SOURCES id -> References card id (every card exists in index.html)
export const REF = {
  "zone-minutes": "ref-zone-minutes", trimp: "ref-trimp", srpe: "ref-srpe",
  "fitness-fatigue": "ref-fitness-fatigue", monotony: "ref-monotony", readiness: "ref-readiness",
  "data-check": "ref-data-check", baseline: "ref-baseline", "load-spike": "ref-load-spike",
  "vo2-trend": "ref-vo2-trend", "sport-view": "ref-sport-view",
  "hr-density": "ref-zone-minutes", "max-hr": "ref-zone-minutes", "rate-effort": "ref-srpe",
};

const round = (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; };
const signed = (x, d = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(round(x, d))}`;
const cells = (text, cls = "") => [...text].map((ch) => ({ ch, cls }));
const clip = (s) => (s.length > WIDTH ? `${s.slice(0, WIDTH - 1)}…` : s);
const sourceRow = (src) => cells(clip(`src: ${src.citation} (${src.version})`), "muted");

function bannerFigure(r) {
  const word = r.call === "hard" ? "HARD" : r.call === "easy" ? "EASY" : "NO DATA";
  const cls = r.call === "hard" ? "z3" : r.call === "easy" ? "z1" : "muted";
  const label = r.call === "not_enough_data"
    ? `Not enough data: ${r.n7} HRV days in the last 7 (need 3), ${r.nBase} baseline days (need 14)`
    : `Today's call: ${word}. HRV 7-day mean ${signed(r.z)} SD from baseline, ${r.n7} readings in the last 7 days, ${r.nBase} baseline days`;
  return { id: "banner", ref: REF.readiness, label,
           rows: [...banner(word).map((l) => cells(l, cls)), sourceRow(r.source)] };
}

function gaugeFigure(r) {
  const ok = r.call !== "not_enough_data";
  const label = ok
    ? `HRV band: 7-day mean ${signed(r.z)} SD from baseline (band is ±0.5 SD); ${r.n7} of the last 7 days have HRV, ${r.nBase} baseline days`
    : `HRV band unavailable: ${r.n7} of the last 7 days have HRV (need 3), ${r.nBase} baseline days (need 14)`;
  const line = ok ? gauge(r.z) : "[ not enough HRV yet ]";
  return { id: "gauge", ref: REF.readiness, label,
           rows: [cells("-2 SD          baseline          +2 SD", "muted"), cells(line, ok ? "z2" : "muted"), sourceRow(r.source)] };
}

function dominantZones(features) {
  const n = features.window_days;
  const sums = Array.from({ length: n }, () => [0, 0, 0, 0, 0]);
  for (const w of features.workouts) {
    const i = w.day + n - 1;
    if (i >= 0 && i < n) w.zone_min.forEach((m, k) => { sums[i][k] += m; });
  }
  return sums.map((z) => (Math.max(...z) > 0 ? z.indexOf(Math.max(...z)) + 1 : 0));
}

function calendarFigure(features, ff) {
  const load = features.days.map((d) => d.trimp || 0);
  const total = round(load.reduce((s, v) => s + v, 0));
  const max = round(Math.max(0, ...load));
  return { id: "calendar", ref: REF.trimp,
           label: `Training calendar, last ${load.length} days: total load ${total}, highest day ${max}`,
           rows: [...calendar(load, dominantZones(features)), sourceRow(ff.source)] };
}

function plotFigure(ff) {
  const fit = ff.series.map((s) => s.fitness);
  const fat = ff.series.map((s) => s.fatigue);
  const label = `Fitness ${round(ff.fitness)}, fatigue ${round(ff.fatigue)}, form ${signed(ff.form, 0)}`;
  const grid = fit.length ? plot(fit, fat, WIDTH, 10).split("\n") : Array(10).fill(" ".repeat(WIDTH));
  return { id: "plot", ref: REF["fitness-fatigue"], label,
           rows: [...grid.map((l) => [...l].map((ch) => ({ ch, cls: ch === "+" ? "z1" : ch === "o" ? "z4" : "" }))),
                  cells("+ fitness  o fatigue", "muted"), sourceRow(ff.source)] };
}

// The four main figures. plain === label (same numbers, no drawing characters).
export function screenModel(analysis, features) {
  const figs = [bannerFigure(analysis.readiness), gaugeFigure(analysis.readiness),
                calendarFigure(features, analysis.fitnessFatigue), plotFigure(analysis.fitnessFatigue)];
  return figs.map((f) => ({ ...f, plain: f.label }));
}

export const figureText = (fig) => fig.rows.map((r) => r.map((c) => c.ch).join(""));

// Zone bars from 60-day zone minutes.
export function zoneBars(features) {
  const tot = [0, 0, 0, 0, 0];
  for (const w of features.workouts) w.zone_min.forEach((m, k) => { tot[k] += m; });
  const all = tot.reduce((s, v) => s + v, 0);
  if (!all) return { id: "zones", ref: REF["zone-minutes"], label: "Zone minutes: no heart-rate workouts yet",
                     plain: "Zone minutes: no heart-rate workouts yet", rows: [cells("no heart-rate workouts yet", "muted")] };
  const pct = tot.map((m) => Math.round((m / all) * 100));
  const label = `Zone minutes: ${pct.map((p, k) => `z${k + 1} ${p}%`).join(", ")}`;
  return { id: "zones", ref: REF["zone-minutes"], label, plain: label,
           rows: pct.map((p, k) => cells(`z${k + 1} ${bar(p)} ${String(p).padStart(3)}%`, `z${k + 1}`)) };
}

// Info lines (wrapping <p> text), each linked to its References card.
export function infoLines(analysis, features) {
  const out = [];
  const m = analysis.monotony;
  if (m.flag) out.push({ ref: REF.monotony, cls: "alert", text: m.value == null
    ? "Monotony: no variation in last 7 days (info only)"
    : `Monotony ${round(m.value, 1)} (info only): the last 7 days' loads are very even` });
  const ls = analysis.loadSpike;
  if (ls.flag) out.push({ ref: REF["load-spike"], cls: "alert",
    text: `Load spike ${round(ls.value, 1)} (info only): last 7 days' average load is ${round(ls.value, 1)} times the 28-day average` });
  for (const g of analysis.gates) {
    if (g.id === "hr-density") out.push({ ref: REF["hr-density"], cls: "muted",
      text: `Zones are low-confidence for ${g.items.length} workouts: heart rate was sparse (ours)` });
    if (g.id === "max-hr") out.push({ ref: REF["max-hr"], cls: "muted",
      text: "Max HR may be underestimated: fewer than 3 sessions reached zone 4 or 5 (ours)" });
    if (g.id === "rate-effort") out.push({ ref: REF["rate-effort"], cls: "muted",
      text: `Rate your effort for ${g.items.length} workouts (ours)` });
  }
  out.push(srpeLine(features));
  return out;
}

export function srpeLine(features) {
  const last7 = (features ? features.days.slice(-7) : []).map((d) => d.srpe).filter((v) => v != null);
  const sum = round(last7.reduce((s, v) => s + v, 0));
  return { ref: REF.srpe, cls: "", text: `Session-RPE load, last 7 days: ${last7.length ? sum : "none rated"}` };
}

export const storedLine = (features) =>
  features ? `Stored on this phone: ${features.days.length} days of summaries` : "Nothing stored on this phone";

// Workouts without effort, newest first: sport + age, no dates.
export function effortList(features) {
  if (!features) return [];
  const age = (d) => (d === 0 ? "today" : d === -1 ? "1 day ago" : `${-d} days ago`);
  return features.workouts.map((w, index) => ({ index, sport: w.sport, age: age(w.day), effort: w.effort }))
    .filter((w) => w.effort == null).map(({ index, sport, age: a }) => ({ index, sport, age: a })).reverse();
}

export function progressLine(lines, bytes, total) {
  const text = `Reading export: ${Math.round((lines || 0) / 1000)}k lines`;
  // with the 20-cell bar the line must still fit 44 columns, so the text shortens to "412k lines"
  return bytes && total ? `[${bar((bytes / total) * 100)}] ${Math.round((lines || 0) / 1000)}k lines` : text;
}

// One worker message -> next import state.
export function onImportMessage(state, msg) {
  if (msg.error) return { ...state, progress: null, error: msg.error, done: null };
  if (msg.done) return { ...state, progress: null, error: null, done: msg.features };
  if (msg.progress != null) {
    const pct = msg.bytes && msg.total ? Math.round((msg.bytes / msg.total) * 100) : null;
    const label = `Import progress: ${Math.round(msg.progress / 1000)} thousand lines read${pct == null ? "" : `, ${pct} percent`}`;
    return { ...state, error: null, progress: { id: "progress", label, plain: label,
             rows: [cells(progressLine(msg.progress, msg.bytes, msg.total), "z2")] } };
  }
  return state;
}
