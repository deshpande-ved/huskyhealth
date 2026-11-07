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
  const link = el("a", { href: `#${fig.ref}` }, pre);
  return el("figure", {}, link, el("p", { className: "plain-text", textContent: fig.plain }));
}

let state = { features: null, imp: { progress: null, error: null, done: null } };
let db = null;

function render() {
  const f = state.features || EMPTY;
  const a = analyze(f);
  $("figures").replaceChildren(...screenModel(a, f).map(figureNode));
  $("zone-bars").replaceChildren(figureNode(zoneBars(f)));
  $("lines").replaceChildren(...(state.features ? infoLines(a, f) : []).map((l) =>
    el("p", { className: l.cls }, el("a", { href: `#${l.ref}`, textContent: l.text }))));
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
    return el("li", {}, el("span", { textContent: `${w.sport}, ${w.age}: ` }), ...buttons);
  }));
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
  addEventListener("online", showVersion);   // offline at launch -> refresh the About line when back online
  start();
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}
