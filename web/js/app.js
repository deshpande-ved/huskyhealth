// web/js/app.js: app entry and the only DOM wiring. No inline JS anywhere (CSP script-src 'self').
import { analyze } from "./engine.js";
import { paint, banner } from "./ascii.js";
import { createDb } from "./db.js";
import { todayModel, storedLine, onImportMessage, weekDetail, sessionDetail, zoneDetail, dateLabel, briefText, answerQuestion, hm } from "./view.js";
import { recordQuestion } from "./voice.js";
import { signIn, saveVault, deleteAccount, addToVault, makeReport, workoutSummaries, daySummaries, fetchRecords, deleteRecords, newToken, listTokens, revokeToken, featuresFromVault, speakBrief, listenQuestion, RELAY } from "./account.js";
import { dayNumber, mergeDrop, validDrop } from "./sync-merge.js";

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
  return pre;
}

const methodNode = (src, ref) => el("p", { className: "method" },
  el("a", { href: `#${ref}`, textContent: `method \u00b7 ${src.citation} \u00b7 ${src.status}` }));

// A row of the printout: title and one plain sentence, the figure. The whole row is the link.
function panelNode(fig, { href }) {
  const a = el("a", { className: "row", href },
    el("div", {}, el("h3", { textContent: fig.title }), el("p", { textContent: fig.summary || fig.label })),
    fig.rows && fig.rows.length ? figureNode(fig) : el("span"));
  a.setAttribute("aria-label", `${fig.title}. ${fig.summary || fig.label}`);
  return a;
}

// Listen: Gradium speaks the brief through the relay and each word lights up as it is said. If Gradium is not
// available, the browser's own voice reads it (on the device, so nothing leaves at all).
let playing = null;
async function playBrief(text, btn) {
  if (playing) { playing.stop(); return; }
  const cap = $("caption");
  btn.textContent = "\u2026"; btn.disabled = true;
  const r = state.account ? await speakBrief({ account: state.account, text }) : { ok: false };
  btn.disabled = false;
  const words = r.ok && r.words.length ? r.words : text.split(/\s+/).map((w) => ({ text: w }));
  const spans = words.map((w) => el("span", { textContent: `${w.text} ` }));
  cap.replaceChildren(...spans); cap.classList.remove("hidden");
  const done = () => { playing = null; btn.textContent = "listen"; spans.forEach((s) => s.classList.remove("on")); };
  btn.textContent = "stop";
  if (r.ok) {
    const bytes = Uint8Array.from(atob(r.audio), (ch) => ch.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: r.mime || "audio/wav" }));
    const audio = new Audio(url);
    let raf = 0;
    const tick = () => {
      const t = audio.currentTime;
      words.forEach((w, i) => spans[i].classList.toggle("on", t >= w.start_s && t < w.stop_s + 0.05));
      raf = requestAnimationFrame(tick);
    };
    const finish = () => { cancelAnimationFrame(raf); URL.revokeObjectURL(url); done(); };
    audio.addEventListener("ended", finish);
    playing = { stop: () => { audio.pause(); finish(); } };
    audio.play().then(() => { raf = requestAnimationFrame(tick); }).catch(finish);
  } else if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(text);
    let i = 0;
    u.addEventListener("boundary", (e) => { if (e.name === "word") { spans.forEach((s) => s.classList.remove("on")); if (spans[i]) spans[i].classList.add("on"); i++; } });
    u.addEventListener("end", done);
    playing = { stop: () => { speechSynthesis.cancel(); done(); } };
    speechSynthesis.speak(u);
  } else {
    done();
  }
}

// Talk to your API: type or say a question; the answer comes from your own data on this device, is spoken, and shows
// the API request behind it. Typed questions never leave the page; a spoken one (at most 5 s) goes to Gradium for text.
let recording = null;
let micConsent = false;
function askNode(ctx) {
  const input = el("input", { type: "text", placeholder: "how was my week?", autocomplete: "off" });
  input.setAttribute("aria-label", "Ask your API");
  const ask = el("button", { type: "submit", className: "primary", textContent: "ask" });
  const mic = el("button", { type: "button", className: "mic", textContent: "speak" });
  mic.classList.toggle("hidden", !state.account || !navigator.mediaDevices || typeof MediaRecorder === "undefined");
  const heard = el("p", { className: "note hidden" });
  const curl = el("pre", { className: "log curl hidden" });
  const copy = el("button", { type: "button", className: "hidden", textContent: "copy curl" });
  copy.addEventListener("click", () => navigator.clipboard && navigator.clipboard.writeText(curl.textContent));
  const answer = (q) => {
    const r = answerQuestion(q, ctx());
    heard.textContent = `You asked: ${q}`;
    curl.textContent = r.curl;
    for (const n of [heard, curl, copy]) n.classList.remove("hidden");
    if (playing) playing.stop();
    playBrief(r.answer, ask);
  };
  const form = el("form", { className: "ask" }, el("label", { className: "visually-hidden", htmlFor: "ask-q", textContent: "Ask your API" }), input, ask, mic);
  input.id = "ask-q";
  form.addEventListener("submit", (e) => { e.preventDefault(); const q = input.value.trim(); if (q) answer(q); });
  mic.addEventListener("click", async () => {
    if (recording) { recording.stop(); return; }
    if (!micConsent && !confirm("Your spoken question (at most 5 seconds) goes to Gradium through the relay to become text. Nothing is stored. Continue?")) return;
    micConsent = true;
    heard.classList.remove("hidden"); heard.textContent = "Listening\u2026 (tap again to stop)";
    mic.textContent = "stop";
    try {
      recording = await recordQuestion(async (wav) => {
        recording = null; mic.textContent = "speak";
        if (!wav) { heard.textContent = "Did not catch that. Try again or type it."; return; }
        heard.textContent = "Turning your question into text\u2026";
        const t = await listenQuestion({ account: state.account, wav });
        if (!t.ok || !t.text) { heard.textContent = t.status === 503 ? "Speech is not set up on the relay. Type it instead." : "Did not catch that. Try again or type it."; return; }
        input.value = t.text;
        answer(t.text);
      });
    } catch {
      recording = null; mic.textContent = "speak";
      heard.textContent = "No microphone access. Type your question instead.";
    }
  });
  return el("div", { className: "askbox" }, form, heard, curl, copy);
}

// The call, printed in block letters. It decodes from random ASCII into its letters (skipped with reduced motion).
const NOISE = "@#%&*+=-:;.";
function bannerNode(words, label) {
  const lines = words.flatMap((w, i) => [...(i ? [""] : []), ...banner(w)]);
  const pre = el("pre", { className: "banner", textContent: lines.join("\n") });
  pre.setAttribute("aria-hidden", "true");
  pre.style.setProperty("--cols", String(Math.max(...lines.map((l) => l.length))));
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const cols = Math.max(...lines.map((l) => l.length));
    const t0 = performance.now(), D = 720;
    const frame = (t) => {
      const p = (t - t0) / D;
      pre.textContent = lines.map((l) => [...l].map((ch, i) =>
        ch === " " || p >= 0.25 + (i / cols) * 0.7 ? ch : NOISE[(Math.random() * NOISE.length) | 0]).join("")).join("\n");
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  return [el("h2", { className: "visually-hidden", textContent: label }), pre];
}

// Small table helper: headers, rows of cells (strings or nodes); numeric columns right-aligned.
function table(headers, rows, numeric = [], narrow = false) {
  const cell = (tag, v, i) => { const c = el(tag, {}, v ?? "\u2014"); if (numeric.includes(i)) c.className = "num"; return c; };
  return el("div", { className: "scroll" }, el("table", { className: narrow ? "data narrow" : "data" },
    el("thead", {}, el("tr", {}, ...headers.map((h, i) => cell("th", h, i)))),
    el("tbody", {}, ...rows.map((r) => el("tr", {}, ...r.map((v, i) => cell("td", v, i)))))));
}
const cellsSpan = (cells) => el("span", { className: "stack" }, ...cells.map((c) => el("span", { className: c.cls, textContent: c.ch })));
const sectionTitle = (text) => el("h3", { className: "subhead", textContent: text });
const emptyNote = () => el("p", { className: "explain", textContent: "Nothing here yet. Import your export or log in to your account." });

function renderWeek(a, f) {
  if (!state.features) return $("week-body").replaceChildren(emptyNote());
  const w = weekDetail(a, f);
  $("week-body").replaceChildren(
    el("p", { className: "lede", textContent: w.ratio == null ? "No training in the last four weeks yet."
      : `This week's load is ${w.acute}, ${w.ratio} % of your usual week (${w.usual}).` }),
    sectionTitle("Day by day"),
    table(["day", "sessions", "load", "kcal"], w.days.map((d) => [d.date,
      d.sessions.length ? d.sessions.map((x) => `${x.sport} ${x.min} min${x.effort != null ? ` \u00b7 effort ${x.effort}` : ""}`).join(", ") : "rest",
      d.load ? String(d.load) : "\u2014", d.kcal ? String(d.kcal) : "\u2014"]), [2, 3]),
    sectionTitle("Week by week"),
    table(["week", "load", "", "sessions", "minutes", "kcal"], w.weeks.map((x, i) => [x.name, String(x.load),
      cellsSpan([{ ch: x.bar, cls: i === 0 ? "z1" : "z2" }]), String(x.sessions), String(x.minutes), x.kcal ? String(x.kcal) : "\u2014"]), [1, 3, 4, 5]),
    methodNode(w.source, w.ref));
}

function renderSession(a, f) {
  if (!state.features || !f.workouts.length) return $("session-body").replaceChildren(emptyNote());
  const s = sessionDetail(a, f);
  const L = s.last;
  const facts = [["date", `${L.date} (${L.ago})`], ["sport", L.sport], ["minutes", String(L.min)], ["load", String(L.load)],
    ["effort", L.effort != null ? `${L.effort}/10 (Watch)` : "not rated"], ["session-RPE", L.srpe != null ? String(L.srpe) : "\u2014"],
    ["calories", L.kcal != null ? `${L.kcal} kcal` : "\u2014"],
    ["vs your " + L.sport.toLowerCase(), L.vsSport ? `${L.vsSport.pct} % of your average load (${L.vsSport.mean}, ${L.vsSport.count} sessions)` : "first one"]];
  $("session-body").replaceChildren(
    sectionTitle("Last session"),
    el("dl", { className: "facts" }, ...facts.map(([k, v]) => el("div", {}, el("dt", { textContent: k }), el("dd", { textContent: v })))),
    table(["zone", "minutes"], L.zones.map((m, k) => [el("span", { className: `z${k + 1}`, textContent: `Z${k + 1}` }), String(m)]), [1], true),
    sectionTitle("Recent sessions"),
    table(["date", "sport", "min", "load", "kcal", "effort", "Z1", "Z2", "Z3", "Z4", "Z5"],
      s.recent.map((r) => [r.date, r.sport, String(r.min), String(r.load), r.kcal != null ? String(r.kcal) : "\u2014",
        r.effort != null ? String(r.effort) : "\u2014", ...r.zones.map(String)]),
      [2, 3, 4, 5, 6, 7, 8, 9, 10]),
    methodNode(s.source, s.ref));
}

function renderSleep(an, f) {
  const nights = f.days.filter((d) => d.sleep_min != null).slice(-14).reverse();
  if (!state.features || !nights.length) return $("sleep-body").replaceChildren(emptyNote());
  const s = an.sleep;
  $("sleep-body").replaceChildren(
    el("p", { className: "lede", textContent: `Last night ${hm(s.last)}. Your 7-night average is ${hm(s.avg7)}${s.avg28 != null ? `, 28-night ${hm(s.avg28)}` : ""}.` }),
    table(["night", "asleep", "vs 7-night average"], nights.map((d) => [dateLabel(d.day), hm(d.sleep_min),
      `${d.sleep_min >= s.avg7 ? "+" : "\u2212"}${hm(Math.abs(d.sleep_min - s.avg7))}`]), [1, 2]),
    methodNode(s.source, "ref-sleep"));
}

function renderFitness(an, f) {
  const pts = f.days.filter((d) => d.vo2 != null).reverse();
  if (!state.features || !pts.length) return $("fitness-body").replaceChildren(emptyNote());
  const t = an.vo2Trend.value;
  $("fitness-body").replaceChildren(
    el("p", { className: "lede", textContent: `Apple estimates VO2 max after outdoor walks, runs and hikes. ${t == null ? "" : `Over four weeks it moved ${t >= 0 ? "up" : "down"} ${Math.abs(Math.round(t * 10) / 10)} ml/kg/min.`}` }),
    table(["day", "VO2 max (ml/kg/min)"], pts.map((d) => [dateLabel(d.day), String(Math.round(d.vo2 * 10) / 10)]), [1], true),
    methodNode(an.vo2Trend.source, "ref-vo2-trend"));
}

function renderZones(f) {
  if (!state.features || !f.workouts.length) return $("zones-body").replaceChildren(emptyNote());
  const z = zoneDetail(f);
  const pct = (m, tot) => (tot ? `${Math.round((m / tot) * 100)} %` : "\u2014");
  $("zones-body").replaceChildren(
    el("p", { className: "lede", textContent: `${z.minutes} minutes of workout heart rate in the last 60 days. Zones are % of your highest recorded heart rate: Z1 50\u201360 %, up to Z5 90\u2013100 %.` }),
    el("p", {}, cellsSpan(z.stack)),
    table(["zone", "", "minutes", "share"], z.total.map((m, k) => [el("span", { className: `z${k + 1}`, textContent: `Z${k + 1}` }), z.names[k], String(m), pct(m, z.minutes)]), [2, 3], true),
    sectionTitle("Week by week"),
    table(["week", "mix", "minutes"], z.weeks.map((w) => [w.name, cellsSpan(w.stack), String(w.minutes)]), [2]),
    sectionTitle("By sport"),
    table(["sport", "mix", "sessions", "minutes"], z.sports.map((x) => [x.sport, cellsSpan(x.stack), String(x.sessions), String(x.minutes)]), [2, 3]),
    methodNode(z.source, z.ref));
}

let state = { features: null, imp: { progress: null, error: null, done: null }, account: null };   // account: RAM only
let db = null;

function render() {
  const f = state.features || EMPTY;
  const an = analyze(f);
  const { call, week, last, zones } = todayModel(an, f);
  if (state.features) {
    const listen = el("button", { type: "button", className: "listen", textContent: "listen" });
    listen.addEventListener("click", () => playBrief(briefText({ call, week, last, sleep: todayModel(an, f).sleep }), listen));
    listen.classList.toggle("hidden", !state.account);
    $("hero").replaceChildren(
      ...bannerNode([call.headline.toUpperCase()], call.headline),
      el("p", { className: "reason", textContent: call.reason }),
      el("p", { className: "basis", textContent: `${dateLabel(0)}, ${call.basis}.` }),
      el("div", { className: "speak" }, listen, el("p", { id: "caption", className: "caption hidden" })),
      askNode(() => ({ model: { call, week, last, ...(({ sleep, fitness }) => ({ sleep, fitness }))(todayModel(an, f)) }, week: weekDetail(an, f), session: sessionDetail(an, f), zones: zoneDetail(f),
        features: state.features, relay: RELAY })),
      methodNode(call.source, call.ref));
    const { sleep, fitness } = todayModel(an, f);
    $("panels").replaceChildren(panelNode(week, { href: "#week" }), ...(last ? [panelNode(last, { href: "#session" })] : []),
      ...(sleep ? [panelNode(sleep, { href: "#sleep" })] : []), ...(fitness ? [panelNode(fitness, { href: "#fitness" })] : []),
      panelNode(zones, { href: "#zones" }));
  } else {
    const login = el("button", { type: "button", className: "primary", textContent: "log in" });
    login.addEventListener("click", () => openSheet(true));
    $("hero").replaceChildren(
      ...bannerNode(["HUSKY", "HEALTH"], "HuskyHealth"),
      el("p", { className: "reason", textContent: "Log in on the HuskyHealth iPhone app and your last 60 days of Apple Watch or Garmin workouts arrive here, encrypted so only you can read them." }),
      el("div", { className: "cta" }, login, el("label", { className: "button", htmlFor: "import-file", textContent: "import an Apple Health export" }),
        el("a", { href: "/api", textContent: "how the API works" })));
    $("panels").replaceChildren();
  }
  renderWeek(an, f);
  renderSession(an, f);
  renderZones(f);
  renderSleep(an, f);
  renderFitness(an, f);
  $("stored").textContent = storedLine(state.features);
}

// One page at a time. Method links (#ref-*) open the methods page at that card.
function route() {
  const h = location.hash.slice(1) || "today";
  const page = h.startsWith("ref-") ? "references" : ["today", "week", "session", "zones", "sleep", "fitness", "import", "account", "references"].includes(h) ? h : "today";
  const tab = ["week", "session", "zones", "sleep", "fitness", "references"].includes(page) ? "today" : page;   // details live under ./today
  if (page === "account" && !state.account) openSheet(true);
  for (const s of document.querySelectorAll("section.page")) s.classList.toggle("active", s.id === page);
  for (const a of document.querySelectorAll("nav.tabs a")) {
    if (a.getAttribute("href") === `#${tab}`) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  const target = h.startsWith("ref-") && document.getElementById(h);
  requestAnimationFrame(() => (target ? target.scrollIntoView() : scrollTo(0, 0)));   // after the browser's own anchor jump
}

function renderImport() {
  const { progress, error } = state.imp;
  const pre = $("progress");
  $("strip").classList.toggle("hidden", !progress && !error);
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
      await db.saveRecord("ref", { day: dayNumber(Date.now()) });   // offsets now count from today
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
const loginSay = (t) => { $("login-status").textContent = t || ""; };
function openSheet(open) {
  $("login").classList.toggle("hidden", !open);
  $("who-btn").setAttribute("aria-expanded", String(open));
  if (open) $("acct-user").focus();
}
const fmtAt = (iso) => iso.slice(0, 16).replace("T", " ");

function renderAccount() {
  const a = state.account;
  $("acct-out").classList.toggle("hidden", Boolean(a));
  $("acct-in").classList.toggle("hidden", !a);
  $("who-btn").classList.toggle("hidden", Boolean(a));
  $("who-link").classList.toggle("hidden", !a);
  $("who-link").textContent = a ? a.username : "";
  $("acct-name").textContent = a ? a.username : "Account";
  const listen = document.querySelector("#hero .listen");
  if (listen) listen.classList.toggle("hidden", !a);
  // the microphone needs a session too (Gradium speech-to-text through the relay): show it as soon as you log in
  const mic = document.querySelector("#hero .mic");
  if (mic) mic.classList.toggle("hidden", !a || !navigator.mediaDevices || typeof MediaRecorder === "undefined");
  if (!a) return;
  const { reports, workouts } = a.vault;
  $("acct-reports").replaceChildren(...(reports.length ? reports.map((r) => el("li", {
    textContent: `${fmtAt(r.at)} \u00b7 ${r.call} \u00b7 fitness ${r.fitness} \u00b7 fatigue ${r.fatigue} \u00b7 form ${r.form} \u00b7 ${r.workouts} workouts, ${r.minutes} min \u00b7 from ${r.source}` }))
    : [el("li", { className: "muted", textContent: "No reports yet." })]));
  const sports = [...new Set(workouts.map((w) => w.sport))];
  $("acct-wsum").textContent = workouts.length
    ? `${workouts.length} workouts, ${workouts[workouts.length - 1].date} to ${workouts[0].date}: ${sports.map((s) => `${workouts.filter((w) => w.sport === s).length} ${s}`).join(", ")}. Zones: minutes in Z1/Z2/Z3/Z4/Z5.`
    : "No workouts saved yet.";
  $("acct-workouts").textContent = workouts.map((w) =>
    `${w.date}  ${w.sport.padEnd(9)}${String(Math.round(w.min)).padStart(4)} min  load ${String(Math.round(w.trimp)).padStart(4)}  ${w.kcal != null ? `${String(Math.round(w.kcal)).padStart(4)} kcal` : "        "}  zones ${w.zone_min.map(Math.round).join("/")}${w.effort != null ? `  effort ${w.effort}` : ""}`).join("\n");
}

async function autoSave(source) {
  const a = state.account;
  if (!a || !state.features) return;
  const f = state.features;
  const an = analyze(f);
  const report = makeReport(an, f, todayModel(an, f).call, { source });
  const vault = addToVault(a.vault, report, workoutSummaries(f), daySummaries(f));
  acctSay("Encrypting and saving\u2026");
  const r = await saveVault({ account: a, vault });
  if (r.ok) { a.vault = vault; acctSay(`Saved: report ${fmtAt(report.at)}, ${vault.workouts.length} workouts in your history.`); }
  else acctSay(r.status);
  renderAccount();
  return r;
}

// Records your devices sent since last time: open them here, fold them into today, remember the cursor in the vault.
let pulling = false;
async function pullInbox(quiet = false) {
  const a = state.account;
  if (!a || pulling) return;
  pulling = true;
  try {
    const r = await fetchRecords({ account: a, after: a.vault.inbox || 0 });
    if (!r.ok) { if (!quiet) acctSay(r.status); return; }
    if (!r.records.length) { if (!quiet) acctSay("No new records from your devices."); return; }
    const now = Date.now();
    let f = state.features;
    let ref = (await db.loadRecord("ref"))?.day ?? null;
    let added = 0;
    for (const x of r.records) {
      if (!validDrop(x.drop)) continue;
      const m = mergeDrop(f, x.drop, { nowMs: now, ageS: Math.max(0, now / 1000 - x.at), refDay: ref });
      f = m.features; ref = m.refDay; added += m.added;
    }
    await db.saveFeatures(f);
    await db.saveRecord("ref", { day: ref });
    state.features = await db.loadFeatures();
    render();
    a.vault = { ...a.vault, inbox: r.last };
    acctSay(`${r.records.length} new record${r.records.length === 1 ? "" : "s"} from your devices, ${added} new workout${added === 1 ? "" : "s"}.`);
    const saved = added ? await autoSave("sync") : await saveVault({ account: a, vault: a.vault });
    if (saved && saved.ok) await deleteRecords({ account: a, upto: r.last });   // safely in the vault: the Pi forgets them
  } finally {
    pulling = false;
  }
}

async function renderTokens() {
  const a = state.account;
  if (!a) return;
  const r = await listTokens({ account: a });
  if (!r.ok) return;
  $("api-tokens").replaceChildren(...r.tokens.map((t) => {
    const b = el("button", { type: "button", className: "danger", textContent: "revoke" });
    b.addEventListener("click", async () => {
      if (!confirm("Revoke this device token? That device can no longer send records.")) return;
      const x = await revokeToken({ account: a, id: t.id });
      acctSay(x.ok ? "Token revoked." : x.status);
      renderTokens();
    });
    return el("li", {}, el("span", { textContent: `device token \u2026${t.id} \u00b7 ${t.scope} \u00b7 made ${t.created}${t.expires ? ` \u00b7 expires ${t.expires}` : ""} \u00b7 ${t.last_used ? `last used ${t.last_used}` : "never used"} ` }), b);
  }));
}

function wireAccount() {
  const go = async (create) => {
    const username = $("acct-user").value; const password = $("acct-pass").value;
    if (create && password.length < 10) return loginSay("Use at least 10 characters. A passphrase of a few words is best.");
    if (create && !confirm("There is no password reset: nobody can read your history, so a forgotten password loses it. Create the account?")) return;
    loginSay(create ? "Making your key and creating the account\u2026" : "Making your key and logging in\u2026");
    for (const b of ["acct-login", "acct-create"]) $(b).disabled = true;
    const r = await signIn({ username, password, create });
    for (const b of ["acct-login", "acct-create"]) $(b).disabled = false;
    $("acct-pass").value = "";
    if (!r.ok) return loginSay(r.status);
    loginSay("");
    openSheet(false);
    state.account = { username: username.trim().toLowerCase(), session: r.session, keys: r.keys, vault: r.vault };
    // A browser with no data of its own (a new device, or the other site address): rebuild today from the account.
    if (!state.features && r.vault.workouts.length) {
      await db.saveFeatures(featuresFromVault(r.vault));
      await db.saveRecord("ref", { day: dayNumber(Date.now()) });
      state.features = await db.loadFeatures();
      render();
    }
    acctSay(create ? "Account created. Reports save here after each import or sync."
      : `Logged in. ${r.vault.reports.length} reports, ${r.vault.workouts.length} workouts${state.features && state.features.source === "account" ? "; today rebuilt from your account" : ""}.`);
    renderAccount();
    renderTokens();
    if (create || !r.vault.reports.length) await autoSave("import");
    await pullInbox(true);
  };
  setInterval(() => { if (!document.hidden) pullInbox(true); }, 30_000);   // while logged in: new records within 30 s
  $("api-pull").addEventListener("click", () => pullInbox(false));
  $("api-new").addEventListener("click", async () => {
    const r = await newToken({ account: state.account });
    if (!r.ok) return acctSay(r.status);
    $("api-token-text").textContent = r.token;
    $("api-token").classList.remove("hidden");
    renderTokens();
  });
  $("api-copy").addEventListener("click", () => navigator.clipboard && navigator.clipboard.writeText($("api-token-text").textContent));
  const hideToken = () => { $("api-token-text").textContent = ""; $("api-token").classList.add("hidden"); };
  addEventListener("hashchange", hideToken);                        // shown once: gone when you leave the page
  document.addEventListener("visibilitychange", () => { if (document.hidden) hideToken(); });
  $("login").addEventListener("submit", (e) => { e.preventDefault(); go(false); });
  $("acct-create").addEventListener("click", () => go(true));
  $("who-btn").addEventListener("click", () => openSheet($("login").classList.contains("hidden")));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") openSheet(false); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".who") && !e.target.closest(".cta")) openSheet(false); });
  $("acct-save").addEventListener("click", () => (state.features ? autoSave("manual") : acctSay("Nothing to report yet.")));
  $("acct-logout").addEventListener("click", () => { state.account = null; hideToken(); renderAccount(); location.hash = "#today"; });
  $("acct-delete").addEventListener("click", async () => {
    if (!confirm("Delete your account? The Pi deletes your encrypted history. This cannot be undone.")) return;
    const r = await deleteAccount({ account: state.account });
    if (!r.ok) return acctSay(r.status);
    state.account = null;
    renderAccount();
    location.hash = "#today";
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
    if (!confirm("Clear the local copy of your workouts and log out? Your account and records are not affected.")) return;
    await db.forgetAll();
    state.account = null;                                       // log out too; the account itself stays until deleted
    renderAccount();
    state.features = null;
    render();
    location.hash = "#today";
  });
}

if (typeof document !== "undefined") {
  showVersion();
  addEventListener("online", showVersion);   // offline at launch -> refresh the About line when back online
  start();
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {   // a new version just took over
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register("/sw.js").then((r) => r.update()).catch(() => {});
  }
}
