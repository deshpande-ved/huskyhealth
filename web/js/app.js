// web/js/app.js: app entry and the only DOM wiring. No inline JS anywhere (CSP script-src 'self').
import { analyze } from "./engine.js";
import { paint } from "./ascii.js";
import { createDb } from "./db.js";
import { todayModel, storedLine, onImportMessage } from "./view.js";
import { signIn, saveVault, deleteAccount, addToVault, makeReport, workoutSummaries } from "./account.js";

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

let state = { features: null, imp: { progress: null, error: null, done: null }, account: null };   // account: RAM only
let db = null;

function render() {
  const f = state.features || EMPTY;
  const { call, week, last, zones } = todayModel(analyze(f), f);
  const method = (fig) => el("p", { className: "method" },
    el("a", { href: `#${fig.ref}`, textContent: `method: ${fig.source.citation} \u00b7 ${fig.source.status}` }));
  $("hero").replaceChildren(el("div", {},
    el("p", { className: "eyebrow", textContent: "today's call" }),
    el("h2", { className: `verdict ${call.cls}`, textContent: call.headline }),
    el("p", { className: "reason", textContent: call.reason }),
    el("p", { className: "basis", textContent: call.basis }),
    method(call)));
  const panels = state.features ? [panelNode(week), ...(last ? [panelNode(last)] : []), panelNode(zones)]
    : [el("article", { className: "panel" }, el("h3", { textContent: "Get started" }),
        el("p", { className: "explain", textContent: "Nothing imported yet. Export your Health data on your iPhone and pick the file here; everything is computed on this phone." }),
        el("a", { className: "button", href: "#import", textContent: "import your export" }))];
  $("panels").replaceChildren(...panels);
  $("stored").textContent = storedLine(state.features);
}

// One page at a time. Method links (#ref-*) open the methods page at that card.
function route() {
  const h = location.hash.slice(1) || "today";
  const page = h.startsWith("ref-") ? "references" : ["today", "import", "account", "references"].includes(h) ? h : "today";
  for (const s of document.querySelectorAll("section.page")) s.classList.toggle("active", s.id === page);
  for (const a of document.querySelectorAll("nav.tabs a")) {
    if (a.getAttribute("href") === `#${page}`) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  const target = h.startsWith("ref-") && document.getElementById(h);
  if (target) target.scrollIntoView(); else scrollTo(0, 0);
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
      autoSave("import");
      location.hash = "#today";
    }
  };
  worker.onerror = () => { state.imp = onImportMessage(state.imp, { error: "could not read this file" }); renderImport(); };
  worker.postMessage({ file });
}

// ---- account: past reports + workout summaries, encrypted here; the Pi keeps ciphertext only ----
const acctSay = (t) => { $("acct-status").textContent = t || ""; };
const fmtAt = (iso) => iso.slice(0, 16).replace("T", " ");

function renderAccount() {
  const a = state.account;
  $("acct-out").classList.toggle("hidden", Boolean(a));
  $("acct-in").classList.toggle("hidden", !a);
  if (!a) return;
  $("acct-name").textContent = a.username;
  const { reports, workouts } = a.vault;
  $("acct-reports").replaceChildren(...(reports.length ? reports.map((r) => el("li", {
    textContent: `${fmtAt(r.at)} \u00b7 ${r.call} \u00b7 fitness ${r.fitness} \u00b7 fatigue ${r.fatigue} \u00b7 form ${r.form} \u00b7 ${r.workouts} workouts, ${r.minutes} min \u00b7 from ${r.source}` }))
    : [el("li", { className: "muted", textContent: "No reports yet. Import your export or save today's report." })]));
  const sports = [...new Set(workouts.map((w) => w.sport))];
  $("acct-wsum").textContent = workouts.length
    ? `${workouts.length} workouts, ${workouts[workouts.length - 1].date} to ${workouts[0].date}: ${sports.map((s) => `${workouts.filter((w) => w.sport === s).length} ${s}`).join(", ")}. Zones are minutes in Z1/Z2/Z3/Z4/Z5.`
    : "No workouts saved yet.";
  $("acct-workouts").textContent = workouts.map((w) =>
    `${w.date}  ${w.sport.padEnd(9)}${String(Math.round(w.min)).padStart(4)} min  load ${String(Math.round(w.trimp)).padStart(4)}  zones ${w.zone_min.map(Math.round).join("/")}${w.effort != null ? `  effort ${w.effort}` : ""}`).join("\n");
}

async function autoSave(source) {
  const a = state.account;
  if (!a || !state.features) return;
  const f = state.features;
  const an = analyze(f);
  const report = makeReport(an, f, todayModel(an, f).call, { source });
  const vault = addToVault(a.vault, report, workoutSummaries(f));
  acctSay("Encrypting and saving\u2026");
  const r = await saveVault({ account: a, vault });
  if (r.ok) { a.vault = vault; acctSay(`Saved: report ${fmtAt(report.at)}, ${vault.workouts.length} workouts in your history.`); }
  else acctSay(r.status);
  renderAccount();
}

function wireAccount() {
  const go = async (create) => {
    const username = $("acct-user").value; const password = $("acct-pass").value;
    if (create && password.length < 10) return acctSay("Use at least 10 characters. A passphrase of a few words is best.");
    if (create && !confirm("There is no password reset: the Pi cannot read your history, so a forgotten password loses it. Create the account?")) return;
    acctSay(create ? "Making your key and creating the account\u2026" : "Making your key and logging in\u2026");
    const r = await signIn({ username, password, create });
    $("acct-pass").value = "";
    if (!r.ok) return acctSay(r.status);
    state.account = { username: username.trim().toLowerCase(), session: r.session, keys: r.keys, vault: r.vault };
    acctSay(create ? "Account created. Reports save here after each import or sync." : `Logged in. ${r.vault.reports.length} reports, ${r.vault.workouts.length} workouts.`);
    renderAccount();
    if (create || !r.vault.reports.length) autoSave("import");
  };
  $("acct-login").addEventListener("click", () => go(false));
  $("acct-create").addEventListener("click", () => go(true));
  $("acct-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") go(false); });
  $("acct-save").addEventListener("click", () => (state.features ? autoSave("manual") : acctSay("Nothing to report yet: import your export first.")));
  $("acct-logout").addEventListener("click", () => { state.account = null; acctSay("Logged out. The key is gone from this page."); renderAccount(); });
  $("acct-delete").addEventListener("click", async () => {
    if (!confirm("Delete your account? The Pi deletes your encrypted history. This cannot be undone.")) return;
    const r = await deleteAccount({ account: state.account });
    if (!r.ok) return acctSay(r.status);
    state.account = null;
    acctSay("Account deleted. The Pi no longer has your history.");
    renderAccount();
  });
}

async function start() {
  db = createDb();
  try { state.features = await db.loadFeatures(); } catch { state.features = null; }
  render();
  route();
  addEventListener("hashchange", route);
  wireAccount();
  renderAccount();
  $("import-file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) startImport(f); e.target.value = ""; });
  $("forget").addEventListener("click", async () => {
    if (!confirm("Forget everything stored on this phone? This cannot be undone.")) return;
    await db.forgetAll();
    state.account = null;                                       // log out too; the account itself stays until deleted
    renderAccount();
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
