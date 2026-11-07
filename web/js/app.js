// web/js/app.js: app entry and the only DOM wiring. No inline JS anywhere (CSP script-src 'self').
import { analyze } from "./engine.js";
import { paint } from "./ascii.js";
import { createDb, withEffort } from "./db.js";
import { screenModel, zoneBars, infoLines, storedLine, effortList, onImportMessage } from "./view.js";

const HEX_COMMIT = /^[0-9a-f]{7,40}$/;
const WORKER = "/js/parse-apple.worker.js";

// Format the deployed commit from /version.txt for the About line.
export function formatVersion(text) {
  const t = typeof text === "string" ? text.trim() : "";
  return HEX_COMMIT.test(t) ? `version ${t.slice(0, 7)}` : "version unknown";
}

// The analysis the screen shows; empty features -> NO DATA.
export const EMPTY = { v: 1, source: "apple_health", window_days: 60, max_hr: null,
  days: Array.from({ length: 60 }, (_, i) => ({ day: i - 59, trimp: 0, srpe: null, rhr: null, ln_hrv: null, vo2: null })),
  workouts: [] };

async function showVersion() {
  const el = document.getElementById("version");
  if (!el) return;
  let text = "";
  try {
    const res = await fetch("/version.txt", { cache: "no-store" });
    if (res.ok) text = await res.text();
  } catch {
    // offline or local dev: keep "version unknown"
  }
  el.textContent = formatVersion(text);
}

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };

function figureNode(fig) {
  const pre = el("pre", { className: "fig" });
  pre.setAttribute("role", "img");
  pre.setAttribute("aria-label", fig.label);
  paint(pre, fig.rows);
  return el("a", { className: "fig-link", href: `#${fig.ref}` }, pre);
}

// A terminal-window panel: title in the border, one-line explanation, figure, legend, key numbers, method link.
function panelNode(fig, extraClass = "") {
  const kids = [el("h3", { textContent: fig.title })];
  if (fig.explain) kids.push(el("p", { className: "explain", textContent: fig.explain }));
  if (fig.rows && fig.rows.length) kids.push(figureNode(fig), el("p", { className: "plain-text", textContent: fig.plain }));
  if (fig.legend) kids.push(el("ul", { className: "legend" }, ...fig.legend.map(([ch, cls, text]) =>
    el("li", {}, el("b", { className: cls, textContent: ch }), text))));
  if (fig.stats && fig.stats.length) kids.push(el("dl", { className: "stats" }, ...fig.stats.map((s) =>
    el("div", {}, el("dd", { className: s.cls || "", textContent: s.v }), el("dt", { textContent: s.k })))));
  if (fig.source) kids.push(el("p", { className: "method" },
    el("a", { href: `#${fig.ref}`, textContent: `method: ${fig.source.citation} \u00b7 ${fig.source.status}` })));
  return el("article", { className: `panel ${extraClass}`.trim() }, ...kids);
}

let state = { features: null, imp: { progress: null, error: null, done: null } };
let db = null;

function render() {
  const f = state.features || EMPTY;
  const a = analyze(f);
  const [call, gaugeFig, cal, fitFat] = screenModel(a, f);
  $("hero").replaceChildren(
    el("div", {},
      el("p", { className: "eyebrow", textContent: "today's call" }),
      el("h2", { className: `verdict ${call.cls}`, textContent: call.headline }),
      el("p", { className: "reason", textContent: call.reason }),
      el("p", { className: "method" }, el("a", { href: `#${call.ref}`, textContent: `method: ${call.source.citation} \u00b7 ${call.source.status}` }))),
    panelNode(gaugeFig));
  const panels = [panelNode(cal), panelNode(fitFat), panelNode(zoneBars(f))];
  if (state.features) {
    const notes = infoLines(a, f);
    panels.push(el("article", { className: "panel" }, el("h3", { textContent: "Notes" }),
      el("ul", { className: "notes" }, ...notes.map((l) =>
        el("li", { className: l.cls }, el("a", { href: `#${l.ref}`, textContent: l.text }))))));
  } else {
    panels.push(el("article", { className: "panel" }, el("h3", { textContent: "Get started" }),
      el("p", { className: "explain", textContent: "Nothing imported yet. Export your Health data on your iPhone and pick the file below; everything is computed on this phone." }),
      el("a", { className: "button", href: "#import", textContent: "import your export" })));
  }
  $("panels").replaceChildren(...panels);
  $("stored").textContent = storedLine(state.features);
  const todo = effortList(state.features);
  $("effort").classList.toggle("hidden", todo.length === 0);
  $("effort-list").replaceChildren(...todo.map((w) => {
    const buttons = Array.from({ length: 10 }, (_, k) => {
      const b = el("button", { type: "button", className: "rate", textContent: String(k + 1) });
      b.setAttribute("aria-label", `Rate ${k + 1} of 10`);
      b.addEventListener("click", () => rate(w.index, k + 1));
      return b;
    });
    return el("li", {}, el("span", { textContent: `${w.sport} \u00b7 ${w.age}` }), ...buttons);
  }));
}

// The ASCII husky mark in the header (same art as the icons); purely decorative.
async function showMark() {
  try {
    const res = await fetch("/art/husky.json");
    if (!res.ok) return;
    const art = await res.json();
    paint($("mark"), art.chars.map((line) => [...line].map((ch) => ({ ch, cls: "" }))));
    const spans = $("mark").querySelectorAll("span");
    let i = 0;
    art.chars.forEach((line, r) => [...line].forEach((_, c) => { spans[i++].style.color = art.rgb[r][c]; }));
  } catch {
    // offline before first cache: no mark, nothing else changes
  }
}

async function rate(index, rpe) {
  const { features, error } = withEffort(state.features, index, rpe);
  if (error) return;
  state.features = features;
  await db.saveFeatures(features);
  render();
}

function renderImport() {
  const { progress, error } = state.imp;
  const pre = $("progress");
  pre.classList.toggle("hidden", !progress);
  if (progress) { pre.setAttribute("aria-label", progress.label); paint(pre, progress.rows); }
  $("import-error").classList.toggle("hidden", !error);
  $("import-error").textContent = error || "";
}

function startImport(file) {
  const worker = new Worker(WORKER, { type: "module" });
  worker.onmessage = async ({ data }) => {
    state.imp = onImportMessage(state.imp, data);
    renderImport();
    if (data.done || data.error) worker.terminate();
    if (data.done) {
      await db.saveFeatures(data.features);
      state.features = await db.loadFeatures();
      render();
      location.hash = "#today";
    }
  };
  worker.onerror = () => { state.imp = onImportMessage(state.imp, { error: "could not read this file" }); renderImport(); };
  worker.postMessage({ file });
}

async function start() {
  db = createDb();
  try { state.features = await db.loadFeatures(); } catch { state.features = null; }
  render();
  $("import-file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) startImport(f); e.target.value = ""; });
  $("plain-view").addEventListener("click", (e) => {
    const on = document.body.classList.toggle("plain");
    e.currentTarget.setAttribute("aria-pressed", String(on));
  });
  $("forget").addEventListener("click", async () => {
    if (!confirm("Forget everything stored on this phone? This cannot be undone.")) return;
    await db.forgetAll();
    state.features = null;
    render();
  });
}

if (typeof document !== "undefined") {
  showVersion();
  showMark();
  addEventListener("online", showVersion);   // offline at launch -> refresh the About line when back online
  start();
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}
