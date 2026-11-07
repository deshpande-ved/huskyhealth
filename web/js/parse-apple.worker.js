// web/js/parse-apple.worker.js: Apple Health import, off the main thread. Nothing here touches the network.
// A line scanner, not an XML DOM: every attribute we need is on the opening-tag line of <Record / <Workout,
// and <WorkoutStatistics lines inside a workout carry calories. In a zip, only export.xml is decompressed.
import { Unzip, UnzipInflate } from "../vendor/fflate.esm.js";
import { toFeatures } from "./features.js";

// The only record types read (plan 6.1). Everything else, including ECG and clinical data, is ignored.
export const KEEP = {
  HKQuantityTypeIdentifierHeartRate: "hr",
  HKQuantityTypeIdentifierRestingHeartRate: "rhr",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
  HKQuantityTypeIdentifierVO2Max: "vo2",
  HKQuantityTypeIdentifierWorkoutEffortScore: "effort",
  HKQuantityTypeIdentifierEstimatedWorkoutEffortScore: "effortEst",
};
const ACTIVE_KCAL = "HKQuantityTypeIdentifierActiveEnergyBurned";
const ATTR = /(\w+)="([^"]*)"/g;
const EXPORT_XML = /(^|\/)export\.xml$/;

export function attrs(line) {
  const out = {};
  for (const [, k, v] of line.matchAll(ATTR)) out[k] = v;
  return out;
}

// "2026-10-12 18:02:11 -0400" -> epoch ms (NaN when unparseable)
export function toMs(s) {
  if (typeof s !== "string") return NaN;
  return Date.parse(s.replace(" ", "T").replace(" ", "").replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
}

// Local midnight of day -(days-1) relative to `now`.
export function windowStart(now, days) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (days - 1)).getTime();
}

export function createScanner({ now = Date.now(), days = 60 } = {}) {
  const cutoff = windowStart(now, days);
  const samples = { hr: [], rhr: [], hrv: [], vo2: [], effort: [], effortEst: [] };
  const workouts = [];
  const stats = { lines: 0, splitTags: 0, skipped: 0 };
  let current = null;

  function openWorkout(t) {
    const a = attrs(t);
    const start = toMs(a.startDate);
    const end = toMs(a.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < cutoff) return null;
    const dur = Number(a.duration);
    const min = Number.isFinite(dur) && (!a.durationUnit || a.durationUnit === "min") ? dur : (end - start) / 60000;
    const kcal = Number(a.totalEnergyBurned);
    return { type: a.workoutActivityType || "", start, end, min,
             kcal: Number.isFinite(kcal) && a.totalEnergyBurned !== "" ? kcal : null,
             sourceName: a.sourceName || "", device: a.device || "" };
  }

  function onLine(raw) {
    stats.lines++;
    const t = raw.trim();
    if (!t.startsWith("<")) return;
    const isRecord = t.startsWith("<Record ");
    const isWorkout = t.startsWith("<Workout ");
    if ((isRecord || isWorkout) && !t.includes(">")) { stats.splitTags++; return; }   // attributes continue on the next line
    if (isRecord) {
      const a = attrs(t);
      const key = KEEP[a.type];
      if (!key) return;
      const ms = toMs(a.startDate);
      const v = Number(a.value);
      if (!Number.isFinite(ms) || a.value === undefined || a.value === "" || !Number.isFinite(v)) { stats.skipped++; return; }
      if (ms >= cutoff) samples[key].push([ms, v]);
    } else if (isWorkout) {
      current = openWorkout(t);
      if (current && t.endsWith("/>")) { workouts.push(current); current = null; }
    } else if (current && t.startsWith("<WorkoutStatistics ")) {
      const a = attrs(t);
      const sum = Number(a.sum);
      if (a.type === ACTIVE_KCAL && Number.isFinite(sum)) current.kcal = sum;
    } else if (current && t.startsWith("</Workout>")) {
      workouts.push(current);
      current = null;
    }
  }

  return { onLine, result: () => ({ samples, workouts, stats, now, days }) };
}

// Split a text stream into lines and scan them.
function lineFeeder(scanner) {
  const decoder = new TextDecoder();
  let carry = "";
  return (chunk, final) => {
    carry += decoder.decode(chunk, { stream: !final });
    const parts = carry.split("\n");
    carry = parts.pop();
    for (const p of parts) scanner.onLine(p);
    if (final && carry) { scanner.onLine(carry); carry = ""; }
  };
}

async function pump(file, sink, onBytes) {
  const reader = file.stream().getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return sink(new Uint8Array(0), true);
    onBytes(value.length);
    sink(value, false);
  }
}

// Import a File-like ({ name, size, stream() }) .xml or .zip; streams, never reads it whole.
// opts: now, days, onProgress({progress, bytes, total}), progressEvery (lines), trace (array of started zip entries)
export async function importFile(file, opts = {}) {
  const { now = Date.now(), days = 60, onProgress = () => {}, progressEvery = 250_000, trace } = opts;
  const scanner = createScanner({ now, days });
  let bytes = 0;
  let lastReport = 0;
  const report = () => onProgress({ progress: scanner.result().stats.lines, bytes, total: file.size });
  const onBytes = (n) => {
    bytes += n;
    const lines = scanner.result().stats.lines;
    if (lines - lastReport >= progressEvery) { lastReport = lines; report(); }
  };
  const feed = lineFeeder(scanner);

  if (file.name.toLowerCase().endsWith(".xml")) {
    await pump(file, feed, onBytes);
  } else {
    await new Promise((resolve, reject) => {
      let found = false;
      let finished = false;
      const unzip = new Unzip();
      unzip.register(UnzipInflate);
      unzip.onfile = (f) => {
        if (found || !EXPORT_XML.test(f.name)) return;   // never start any other entry
        found = true;
        if (trace) trace.push(f.name);
        f.ondata = (err, chunk, final) => {
          if (err) return reject(err);
          try { feed(chunk, final); } catch (e) { return reject(e); }
          if (final) { finished = true; resolve(); }
        };
        f.start();
      };
      pump(file, (chunk, final) => unzip.push(chunk, final), onBytes)
        .then(() => {
          if (!found) reject(new Error("export.xml not found in this zip"));
          else if (!finished) reject(new Error("export.xml is incomplete in this zip"));
        })
        .catch(reject);
    });
  }
  report();
  const scan = scanner.result();
  const featureStats = {};
  const features = toFeatures({ ...scan, source: "apple_health" }, featureStats);
  return { features, stats: { ...scan.stats, ...featureStats, kept: Object.fromEntries(
    Object.entries(scan.samples).map(([k, v]) => [k, v.length])) } };
}

// Worker entry: { file, days?, now? } -> { progress, bytes, total }* then { done: true, features } or { error }.
if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  self.onmessage = async ({ data }) => {
    try {
      const { features } = await importFile(data.file, {
        now: data.now ?? Date.now(), days: data.days ?? 60,
        onProgress: (p) => self.postMessage(p),
      });
      self.postMessage({ done: true, features });
    } catch (e) {
      self.postMessage({ error: e && e.message ? e.message : "could not read this file" });
    }
  };
}
