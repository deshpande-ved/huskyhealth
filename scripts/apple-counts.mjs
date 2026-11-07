// scripts/apple-counts.mjs: run the real importer on an Apple Health export and print COUNTS ONLY.
//   node scripts/apple-counts.mjs ~/Downloads/export.zip
// No dates, names, sources or values are printed, and nothing is written. Keep real exports outside the repo.
import { openAsBlob, existsSync, realpathSync } from "node:fs";
import { resolve, relative, basename, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { importFile } from "../web/js/parse-apple.worker.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => { console.error(msg); process.exit(1); };

const arg = process.argv[2];
if (!arg) fail("usage: node scripts/apple-counts.mjs <export.zip | export.xml>");
const path = resolve(arg);
if (!existsSync(path)) fail(`no such file: ${arg}`);
const rel = relative(realpathSync(ROOT), realpathSync(path));
const inside = rel && !rel.startsWith("..") && !rel.startsWith(sep);
if (inside && !(rel.startsWith(`tests${sep}fixtures${sep}`) && basename(rel).startsWith("synthetic-"))) {
  fail("keep real exports outside the repo");
}

const blob = await openAsBlob(path);
const file = { name: basename(path), size: blob.size, stream: () => blob.stream() };
let res;
try {
  res = await importFile(file, { now: process.env.HH_NOW ? Number(process.env.HH_NOW) : Date.now() });
} catch (e) {
  fail(`error: ${e.message}`);
}
const { features: f, stats: s } = res;
const tally = (key) => f.workouts.reduce((m, w) => ({ ...m, [w[key]]: (m[w[key]] || 0) + 1 }), {});
const ok = f.workouts.filter((w) => w.hr_sample_ok).length;
const lines = [
  `lines scanned: ${s.lines}`,
  `split-attribute tags: ${s.splitTags}`,
  `kept samples: ${Object.entries(s.kept).map(([k, n]) => `${k}=${n}`).join(" ")}`,
  `workouts: ${f.workouts.length} (deduped ${s.deduped})`,
  `by sport: ${Object.entries(tally("sport")).map(([k, n]) => `${k}=${n}`).join(" ")}`,
  `by source: ${Object.entries(tally("source")).map(([k, n]) => `${k}=${n}`).join(" ")}`,
  `effort: user=${s.effort.user} estimated=${s.effort.estimated} none=${s.effort.none}`,
  `hr_sample_ok: true=${ok} false=${f.workouts.length - ok}`,
  `days with HRV: ${s.daysWithHrv}`,
];
console.log(lines.join("\n"));
