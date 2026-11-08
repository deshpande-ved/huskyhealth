// web/js/view.js: pure screen model. Engine output -> figures (rows of {ch, cls}), labels, plain text, lines.
// No DOM, no network. app.js paints what this returns.
import { gauge, plot, bar } from "./ascii.js";

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
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Hero: today's call in plain words, with the reason. The block-letter banner() stays in ascii.js for the mark.
function bannerFigure(r) {
  const nde = r.call === "not_enough_data";
  const headline = r.call === "hard" ? "Train hard" : r.call === "easy" ? "Go easy" : "No call yet";
  const cls = r.call === "hard" ? "z3" : r.call === "easy" ? "z1" : "muted";
  const reason = nde
    ? `Not enough HRV readings yet: ${r.n7} of the last 7 days (need 3) and ${plural(r.nBase, "baseline day")} (need 14). Wear your Watch to sleep and the call appears.`
    : r.call === "hard"
      ? "Your heart-rate variability this week is inside your normal range, so a hard session is fine."
      : r.z < 0
        ? "Your heart-rate variability this week is below your normal range: you may still be recovering. Keep it easy."
        : "Your heart-rate variability this week is above your normal range, which can also mean you are not fully recovered. Keep it easy.";
  const label = nde
    ? `Not enough data: ${r.n7} HRV days in the last 7 (need 3), ${r.nBase} baseline days (need 14)`
    : `Today's call: ${headline.toUpperCase()}. HRV 7-day mean ${signed(r.z)} SD from baseline, ${r.n7} readings in the last 7 days, ${r.nBase} baseline days`;
  return { id: "banner", ref: REF.readiness, source: r.source, headline, cls, reason, label, rows: [] };
}

function gaugeFigure(r) {
  const ok = r.call !== "not_enough_data";
  const label = ok
    ? `HRV band: 7-day mean ${signed(r.z)} SD from baseline (band is ±0.5 SD); ${r.n7} of the last 7 days have HRV, ${r.nBase} baseline days`
    : `HRV band unavailable: ${r.n7} of the last 7 days have HRV (need 3), ${r.nBase} baseline days (need 14)`;
  const g = ok ? gauge(r.z) : `[${" waiting for HRV ".padStart(25, ".").padEnd(33, ".")}]`;
  return { id: "gauge", ref: REF.readiness, source: r.source, title: "HRV vs your normal",
    explain: "The = band is your normal range. o is your average for the last 7 days.",
    stats: ok ? [{ k: "7-day average", v: `${signed(r.z)} SD` }, { k: "HRV days", v: `${r.n7}/7 recent · ${r.nBase} baseline` }]
              : [{ k: "HRV days", v: `${r.n7}/7 recent · ${r.nBase} baseline` }],
    label,
    rows: [cells("low           normal          high", "muted"), cells(g, ok ? "z2" : "muted")] };
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

// Week grid, Monday first: one cell per day, a 4-step load scale everyone can read.
const LOAD = [".", ":", "=", "#", "@"];   // rest, light, moderate, hard, max
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
export function loadMark(x, max) {
  if (!x) return LOAD[0];
  return LOAD[Math.min(4, 1 + Math.floor((x / Math.max(max, 1)) * 4 - 1e-9))];
}

function calendarFigure(features, ff, todayDow) {
  const load = features.days.map((d) => d.trimp || 0);
  const zones = dominantZones(features);
  const n = load.length;
  const max = Math.max(0, ...load);
  const oldestDow = (((todayDow - (n - 1)) % 7) + 7) % 7;
  const slots = [...Array(oldestDow).fill(null), ...load.map((x, i) => ({ x, z: zones[i] }))];
  const weeks = Math.ceil(slots.length / 7);
  const rows = [cells(`     ${DOW.map((d) => d.padEnd(4)).join("")}`.trimEnd(), "muted")];
  for (let w = 0; w < weeks; w++) {
    const ago = weeks - 1 - w;
    const row = cells(ago === 0 ? "now  " : `-${ago}w`.padEnd(5), "muted");
    for (let d = 0; d < 7; d++) {
      const s = slots[w * 7 + d];
      const mark = s ? loadMark(s.x, max) : " ";
      row.push({ ch: mark, cls: s && s.x ? `z${s.z}` : "muted" }, ...cells("   "));
    }
    rows.push(row.slice(0, row.length - 3));
  }
  const total = round(load.reduce((s, v) => s + v, 0));
  const sessions = features.workouts.length;
  return { id: "calendar", ref: REF.trimp, source: ff.source, title: "Training load · 60 days",
    explain: "One mark per day, Monday first. Heavier mark = harder day; colour = the zone you spent most time in.",
    legend: [[".", "muted", "rest"], [":", "z1", "light"], ["=", "z2", "moderate"], ["#", "z3", "hard"], ["@", "z5", "max"]],
    stats: [{ k: "sessions", v: String(sessions) }, { k: "total load", v: String(total) }, { k: "hardest day", v: String(round(max)) }],
    label: `Training calendar, last ${n} days: ${plural(sessions, "session")}, total load ${total}, highest day ${round(max)}`,
    rows };
}

function plotFigure(ff) {
  const fit = ff.series.map((s) => s.fitness);
  const fat = ff.series.map((s) => s.fatigue);
  const W = 38, H = 8;
  const all = [...fit, ...fat];
  const lo = all.length ? Math.floor(Math.min(...all)) : 0;
  const hi = all.length ? Math.ceil(Math.max(...all, lo + 1)) : 1;
  const grid = fit.length ? plot(fit, fat, W, H).split("\n") : Array(H).fill(" ".repeat(W));
  const rows = grid.map((l, i) => [
    ...cells(i === 0 ? `${String(hi).padStart(4)}|` : i === H - 1 ? `${String(lo).padStart(4)}|` : "    |", "muted"),
    ...[...l].map((ch) => ({ ch, cls: ch === "+" ? "z1" : ch === "o" ? "z4" : "" })),
  ]);
  rows.push(cells(`    +${"-".repeat(W)}`, "muted"), cells(`     60 days ago${" ".repeat(W - 15 - 5)}today`, "muted"));
  const form = round(ff.form);
  return { id: "plot", ref: REF["fitness-fatigue"], source: ff.source, title: "Fitness vs fatigue",
    explain: "Fitness (+) builds over weeks; fatigue (o) jumps after hard days and fades fast. Form = fitness − fatigue: above 0 means fresh.",
    legend: [["+", "z1", "fitness"], ["o", "z4", "fatigue"]],
    stats: [{ k: "fitness", v: String(round(ff.fitness)) }, { k: "fatigue", v: String(round(ff.fatigue)) },
            { k: "form", v: signed(ff.form, 0), cls: form >= 0 ? "z1" : "z4" }],
    label: `Fitness ${round(ff.fitness)}, fatigue ${round(ff.fatigue)}, form ${signed(ff.form, 0)}`, rows };
}

// The four main figures. plain === label (same numbers, no drawing characters).
export function screenModel(analysis, features, todayDow = (new Date().getDay() + 6) % 7) {
  const figs = [bannerFigure(analysis.readiness), gaugeFigure(analysis.readiness),
                calendarFigure(features, analysis.fitnessFatigue, todayDow), plotFigure(analysis.fitnessFatigue)];
  return figs.map((f) => ({ ...f, plain: f.label }));
}

export const figureText = (fig) => fig.rows.map((r) => r.map((c) => c.ch).join(""));

const ZONE_NAMES = ["recovery", "endurance", "tempo", "threshold", "maximum"];
// Zone bars from 60-day zone minutes.
export function zoneBars(features) {
  const tot = [0, 0, 0, 0, 0];
  for (const w of features.workouts) w.zone_min.forEach((m, k) => { tot[k] += m; });
  const all = tot.reduce((s, v) => s + v, 0);
  const base = { id: "zones", ref: REF["zone-minutes"], title: "Heart-rate zones · 60 days",
    explain: "Share of workout time in each zone, as % of your max heart rate: Z1 is 50–60 %, Z5 is 90–100 %." };
  if (!all) return { ...base, label: "Zone minutes: no heart-rate workouts yet", plain: "Zone minutes: no heart-rate workouts yet",
                     stats: [], rows: [cells("no heart-rate workouts yet", "muted")] };
  const pct = tot.map((m) => Math.round((m / all) * 100));
  const label = `Zone minutes: ${pct.map((p, k) => `z${k + 1} ${p}%`).join(", ")}`;
  return { ...base, label, plain: label, stats: [{ k: "workout time", v: `${round(all)} min` }],
           rows: pct.map((p, k) => cells(`Z${k + 1} ${ZONE_NAMES[k].padEnd(9)} ${bar(p)} ${String(p).padStart(3)}%`, `z${k + 1}`)) };
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
      text: `Zones are low-confidence for ${plural(g.items.length, "workout")}: heart rate was sparse (ours)` });
    if (g.id === "max-hr") out.push({ ref: REF["max-hr"], cls: "muted",
      text: "Max HR may be underestimated: fewer than 3 sessions reached zone 4 or 5 (ours)" });
    if (g.id === "rate-effort") out.push({ ref: REF["rate-effort"], cls: "muted",
      text: `Rate your effort for ${plural(g.items.length, "workout")} (ours)` });
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
