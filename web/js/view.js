// web/js/view.js: pure screen model. Engine output -> figures (rows of {ch, cls}), labels, plain text, lines.
// No DOM, no network. app.js paints what this returns.
import { bar } from "./ascii.js";
import { source } from "./engine.js";

export const WIDTH = 44;

// engine SOURCES id -> References card id (every card exists in index.html)
export const REF = {
  "zone-minutes": "ref-zone-minutes", trimp: "ref-trimp", srpe: "ref-srpe",
  "fitness-fatigue": "ref-fitness-fatigue", monotony: "ref-monotony", readiness: "ref-readiness",
  "data-check": "ref-data-check", baseline: "ref-baseline", "load-spike": "ref-load-spike",
  "vo2-trend": "ref-vo2-trend", "load-call": "ref-load-call", "sport-view": "ref-sport-view",
  "hr-density": "ref-zone-minutes", "max-hr": "ref-zone-minutes", "rate-effort": "ref-srpe",
};

const round = (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; };
const cells = (text, cls = "") => [...text].map((ch) => ({ ch, cls }));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const SPORT = { squash: "Squash", running: "Run", walking: "Walk", cycling: "Ride", strength: "Strength", hiit: "HIIT", other: "Workout" };
export const sportName = (s) => SPORT[s] || "Workout";
export const ago = (d) => (d === 0 ? "today" : d === -1 ? "yesterday" : `${-d} days ago`);

// 1. Today's call, in plain words. Never "no call": thin HRV falls back to load (engine todayCall).
function callBlock(t) {
  const headline = t.call === "hard" ? "Train hard" : "Go easy";
  const cls = t.call === "hard" ? "z3" : "z1";
  let reason;
  if (t.basis === "hrv") {
    reason = t.call === "hard"
      ? "Your heart-rate variability this week is inside your normal range, so a hard session is fine."
      : t.z < 0
        ? "Your heart-rate variability this week is below your normal range: you may still be recovering."
        : "Your heart-rate variability this week is above your normal range, which can also mean you are not fully recovered.";
  } else if (t.ratio == null) {
    reason = "No training in the last 4 weeks, so ease back in.";
  } else {
    const pct = Math.round(t.ratio * 100);
    reason = t.call === "hard"
      ? `This week's load is ${pct} % of your usual week, so there is room for a hard session.`
      : `This week's load is already ${pct} % of your usual week. Keep today easy.`;
  }
  const basis = t.basis === "hrv" ? "from your HRV" : "from your training load (not enough HRV yet)";
  const ref = t.basis === "hrv" ? REF.readiness : REF["load-call"];
  return { id: "call", ref, source: t.source, headline, cls, reason, basis,
    label: `Today's call: ${headline}, ${basis}. ${reason}`, rows: [] };
}

// 2. This week against your usual week: two bars on one scale.
function weekBlock(features, t) {
  const last7 = features.workouts.filter((w) => w.day > -7);
  const top = Math.max(t.acute, t.usual, 1);
  const line = (name, v, cls) => cells(`${name.padEnd(10)} ${bar((v / top) * 100)} ${String(round(v)).padStart(5)}`, cls);
  const label = `This week: load ${round(t.acute)} from ${plural(last7.length, "session")}; your usual week is ${round(t.usual)}`;
  const kcal = last7.reduce((n, w) => n + (w.kcal || 0), 0);
  const burned = kcal ? `, ${round(kcal)} kcal` : "";
  const summary = t.usual
    ? `Load ${round(t.acute)} from ${plural(last7.length, "session")}${burned}, against a usual week of ${round(t.usual)}.`
    : `Load ${round(t.acute)} from ${plural(last7.length, "session")}${burned}. No usual week yet.`;
  return { id: "week", ref: REF.trimp, source: source("trimp"), title: "This week", summary,
    explain: "Load = minutes weighted by heart-rate zone. Usual = your average week over the last 4.",
    stats: [{ k: "sessions", v: String(last7.length) }, { k: "minutes", v: String(round(last7.reduce((s, w) => s + w.min, 0))) }],
    label, plain: label, rows: [line("this week", t.acute, "z2"), line("usual", t.usual, "muted")] };
}

// 3. Last session: what it was, how hard, where the time went.
function lastBlock(features) {
  const w = [...features.workouts].sort((a, b) => a.day - b.day).at(-1);
  if (!w) return null;
  const zones = w.zone_min.map((m, k) => cells(`Z${k + 1} ${bar((m / Math.max(w.min, 1)) * 100)} ${String(round(m)).padStart(3)} min`, `z${k + 1}`));
  const stats = [{ k: "minutes", v: String(round(w.min)) }, { k: "load", v: String(round(w.trimp)) }];
  if (w.effort != null) stats.push({ k: "effort", v: `${round(w.effort)}/10` });
  const label = `Last session: ${sportName(w.sport)}, ${ago(w.day)}, ${round(w.min)} min, load ${round(w.trimp)}${w.effort != null ? `, effort ${round(w.effort)} of 10` : ""}`;
  const summary = `${sportName(w.sport)}, ${ago(w.day)}: ${round(w.min)} minutes, load ${round(w.trimp)}${w.kcal != null ? `, ${round(w.kcal)} kcal` : ""}${w.effort != null ? `, effort ${round(w.effort)}/10` : ""}.`;
  return { id: "last", ref: REF["zone-minutes"], source: source("zone-minutes"), title: "Last session", summary,
    explain: "Minutes in each heart-rate zone. Effort is your rating on the Watch.", stats, label, plain: label, rows: zones };
}

// The whole today screen. Website, iOS app and API share this one model.
export function todayModel(analysis, features) {
  const call = callBlock(analysis.today);
  return { call: { ...call, plain: call.label }, week: weekBlock(features, analysis.today), last: lastBlock(features), zones: zoneBars(features) };
}

export const figureText = (fig) => fig.rows.map((r) => r.map((c) => c.ch).join(""));

const ZONE_NAMES = ["recovery", "endurance", "tempo", "threshold", "maximum"];
// 4. Zone bars from 60-day zone minutes.
export function zoneBars(features) {
  const tot = [0, 0, 0, 0, 0];
  for (const w of features.workouts) w.zone_min.forEach((m, k) => { tot[k] += m; });
  const all = tot.reduce((s, v) => s + v, 0);
  const base = { id: "zones", ref: REF["zone-minutes"], source: source("zone-minutes"), title: "Heart-rate zones", summary: "No heart-rate workouts yet.",
    explain: "Share of workout time in each zone, as % of your max heart rate: Z1 is 50–60 %, Z5 is 90–100 %." };
  if (!all) return { ...base, label: "Zone minutes: no heart-rate workouts yet", plain: "Zone minutes: no heart-rate workouts yet",
                     stats: [], rows: [cells("no heart-rate workouts yet", "muted")] };
  const pct = tot.map((m) => Math.round((m / all) * 100));
  const label = `Zone minutes: ${pct.map((p, k) => `z${k + 1} ${p}%`).join(", ")}`;
  const top = pct.indexOf(Math.max(...pct));
  const summary = `${round(all)} minutes of workout heart rate, most of it Z${top + 1} ${ZONE_NAMES[top]} (${pct[top]} %).`;
  return { ...base, label, plain: label, summary, stats: [{ k: "workout time", v: `${round(all)} min` }],
           rows: pct.map((p, k) => cells(`Z${k + 1} ${ZONE_NAMES[k].padEnd(9)} ${bar(p)} ${String(p).padStart(3)}%`, `z${k + 1}`)) };
}

export const storedLine = (features) =>
  features ? `Local copy: ${features.days.length} days of summaries` : "No local copy";

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

// ---- detail views: real numbers behind each block (pure; dates from day offsets, local time) ----
const DAY_MS = 86_400_000;
export const dateLabel = (day, nowMs = Date.now()) =>
  new Date(nowMs + day * DAY_MS).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const sum = (a) => a.reduce((s, v) => s + v, 0);
const weekBlocks = (features, n = 8) => Array.from({ length: n }, (_, k) => {
  const hi = -7 * k, lo = hi - 6;                                   // k = 0: the last 7 days
  return { k, ws: features.workouts.filter((w) => w.day <= hi && w.day >= lo),
           load: sum(features.days.filter((d) => d.day <= hi && d.day >= lo).map((d) => d.trimp || 0)) };
}).filter((b) => -7 * b.k - 6 > -features.window_days - 6);
const weekName = (k) => (k === 0 ? "this week" : k === 1 ? "last week" : `${k} weeks ago`);

// This week: each of the last 7 days, then 8 weekly totals against your usual week.
export function weekDetail(analysis, features, nowMs = Date.now()) {
  const t = analysis.today;
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = i - 6;
    const ws = features.workouts.filter((w) => w.day === day);
    return { day, date: dateLabel(day, nowMs), load: round(sum(ws.map((w) => w.trimp))), kcal: round(sum(ws.map((w) => w.kcal || 0))),
      sessions: ws.map((w) => ({ sport: sportName(w.sport), min: round(w.min), load: round(w.trimp), effort: w.effort, kcal: w.kcal })) };
  });
  const weeks = weekBlocks(features).map((b) => ({ name: weekName(b.k), load: round(b.load), sessions: b.ws.length,
    minutes: round(sum(b.ws.map((w) => w.min))), kcal: round(sum(b.ws.map((w) => w.kcal || 0))) }));
  const top = Math.max(1, ...weeks.map((w) => w.load), t.usual);
  return { days, weeks: weeks.map((w) => ({ ...w, bar: bar((w.load / top) * 100) })), usual: round(t.usual), acute: round(t.acute),
    ratio: t.usual ? round((t.acute / t.usual) * 100) : null, source: source("trimp"), ref: REF.trimp };
}

// Sessions: the last one in full against your history in that sport, then the recent list.
export function sessionDetail(analysis, features, nowMs = Date.now()) {
  const ws = [...features.workouts].sort((a, b) => a.day - b.day);
  const last = ws.at(-1) || null;
  const sv = last ? analysis.sportView[last.sport] : null;
  const row = (w) => ({ date: dateLabel(w.day, nowMs), ago: ago(w.day), sport: sportName(w.sport), min: round(w.min), load: round(w.trimp),
    effort: w.effort, kcal: w.kcal, srpe: w.srpe, zones: w.zone_min.map((m) => round(m)) });
  return {
    last: last && { ...row(last), vsSport: sv && sv.mean != null ? { mean: round(sv.mean), count: sv.count, pct: sv.mean ? round((last.trimp / sv.mean) * 100) : null } : null },
    recent: ws.slice(-12).reverse().map(row),
    source: source("zone-minutes"), ref: REF["zone-minutes"],
  };
}

// Zones: 60-day share, week by week, and by sport. Each stacked bar is 24 cells coloured by zone.
const STACK = 24;
function stack(z) {
  const tot = sum(z);
  if (!tot) return [{ ch: "·".repeat(STACK), cls: "muted" }];
  const cellsN = z.map((m) => Math.round((m / tot) * STACK));
  const fix = STACK - sum(cellsN);
  cellsN[cellsN.indexOf(Math.max(...cellsN))] += fix;
  return cellsN.flatMap((n, k) => (n > 0 ? [{ ch: "█".repeat(n), cls: `z${k + 1}` }] : []));
}
export function zoneDetail(features) {
  const add = (acc, w) => acc.map((m, k) => m + (w.zone_min[k] || 0));
  const total = features.workouts.reduce(add, [0, 0, 0, 0, 0]);
  const weeks = weekBlocks(features).map((b) => { const z = b.ws.reduce(add, [0, 0, 0, 0, 0]); return { name: weekName(b.k), minutes: round(sum(z)), zones: z.map((m) => round(m)), stack: stack(z) }; });
  const sports = [...new Set(features.workouts.map((w) => w.sport))].map((s) => {
    const sw = features.workouts.filter((w) => w.sport === s);
    const z = sw.reduce(add, [0, 0, 0, 0, 0]);
    return { sport: sportName(s), sessions: sw.length, minutes: round(sum(z)), zones: z.map((m) => round(m)), stack: stack(z) };
  });
  return { total: total.map((m) => round(m)), minutes: round(sum(total)), stack: stack(total), weeks, sports, names: ZONE_NAMES,
    source: source("zone-minutes"), ref: REF["zone-minutes"] };
}

// The spoken brief: written from the same numbers the page shows, with fixed templates (no AI reads your data).
// Plain words only, so it passes the relay's privacy filter (letters, digits, plain punctuation, at most 600 characters).
export function briefText(model, max = 600) {
  const strip = (s) => String(s || "").replace(/[^A-Za-z0-9 .,;:%'()/\-’–—]/g, "");
  const parts = [`${model.call.headline}.`, model.call.reason];
  if (model.week && model.week.summary) parts.push(`This week: ${model.week.summary.replace(/^Load/, "load")}`);
  if (model.last && model.last.summary) parts.push(`Last session: ${model.last.summary}`);
  let text = "";
  for (const p of parts.map(strip)) {
    const next = text ? `${text} ${p}` : p;
    if (next.length > max) break;
    text = next;
  }
  return text;
}
