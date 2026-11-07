// E03S02: streamed .xml and in-memory .zip imports, progress, errors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "../web/vendor/fflate.esm.js";
import { importFile } from "../web/js/parse-apple.worker.js";

const NOW = Date.parse("2026-11-07T18:00:00-05:00");
const xml = readFileSync(new URL("./fixtures/synthetic-export.xml", import.meta.url));
const asFile = (name, u8) => ({ name, size: u8.length, stream: () => new Blob([u8]).stream() });
const zip = (entries) => asFile("export.zip", zipSync(entries));
const fullZip = () => zip({
  "apple_health_export/export.xml": new Uint8Array(xml),
  "apple_health_export/export_cda.xml": strToU8("<ClinicalDocument>SECRET-CDA</ClinicalDocument>"),
  "apple_health_export/workout-routes/route_1.gpx": strToU8("<gpx>SECRET-ROUTE</gpx>"),
  "apple_health_export/electrocardiograms/ecg_1.csv": strToU8("SECRET-ECG,1,2,3"),
});

test(".xml streams and .zip gives the same result", async () => {
  const a = await importFile(asFile("export.xml", xml), { now: NOW });
  const b = await importFile(fullZip(), { now: NOW });
  assert.deepEqual(b.features, a.features);
  assert.equal(a.stats.lines, b.stats.lines);
});

test("only export.xml is started in the zip", async () => {
  const trace = [];
  const r = await importFile(fullZip(), { now: NOW, trace });
  assert.deepEqual(trace, ["apple_health_export/export.xml"]);
  const out = JSON.stringify(r);
  for (const s of ["SECRET-CDA", "SECRET-ROUTE", "SECRET-ECG"]) assert.ok(!out.includes(s), s);
});

test("progress is posted before done, with bytes and total", async () => {
  const msgs = [];
  const f = asFile("export.xml", xml);
  await importFile(f, { now: NOW, onProgress: (p) => msgs.push(p), progressEvery: 10 });
  assert.ok(msgs.length >= 1);
  const last = msgs[msgs.length - 1];
  assert.equal(last.total, f.size);
  assert.equal(last.bytes, f.size);
  assert.ok(last.progress > 0);
});

test("zip without export.xml, corrupt zip, unreadable file -> errors, no hang", async () => {
  await assert.rejects(importFile(zip({ "other.txt": strToU8("hi") }), { now: NOW }), /export\.xml not found in this zip/);
  await assert.rejects(importFile(asFile("export.zip", new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 9])), { now: NOW }));
  const broken = { name: "export.xml", size: 10, stream: () => new ReadableStream({ pull(c) { c.error(new Error("read failed")); } }) };
  await assert.rejects(importFile(broken, { now: NOW }), /read failed/);
});
