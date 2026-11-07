// E03S04: full Features JSON on the fixture, in two time zones; privacy deep scan; empty export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "../web/vendor/fflate.esm.js";
import { importFile } from "../web/js/parse-apple.worker.js";

const NOW = Date.parse("2026-11-07T18:00:00-05:00");
const xml = readFileSync(new URL("./fixtures/synthetic-export.xml", import.meta.url));
const expected = JSON.parse(readFileSync(new URL("./fixtures/synthetic-features.expected.json", import.meta.url), "utf8"));
const asFile = (name, u8) => ({ name, size: u8.length, stream: () => new Blob([u8]).stream() });
const workerUrl = new URL("../web/js/parse-apple.worker.js", import.meta.url).href;
const fixturePath = fileURLToPath(new URL("./fixtures/synthetic-export.xml", import.meta.url));

for (const tz of ["UTC", "America/New_York"]) {
  test(`fixture -> expected features (TZ=${tz}), as .xml and .zip`, () => {
    const script = `
      import { readFileSync } from "node:fs";
      import { zipSync } from ${JSON.stringify(new URL("../web/vendor/fflate.esm.js", import.meta.url).href)};
      import { importFile } from ${JSON.stringify(workerUrl)};
      const u8 = new Uint8Array(readFileSync(${JSON.stringify(fixturePath)}));
      const f = (n, b) => ({ name: n, size: b.length, stream: () => new Blob([b]).stream() });
      const a = await importFile(f("export.xml", u8), { now: ${NOW} });
      const b = await importFile(f("export.zip", zipSync({ "apple_health_export/export.xml": u8 })), { now: ${NOW} });
      console.log(JSON.stringify([a.features, b.features]));`;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ: tz } });
    const [a, b] = JSON.parse(out);
    assert.deepEqual(a, expected);
    assert.deepEqual(b, expected);
  });
}

test("every workout has a boolean hr_sample_ok; the sparse one is false", () => {
  assert.ok(expected.workouts.every((w) => typeof w.hr_sample_ok === "boolean"));
  assert.deepEqual(expected.workouts.map((w) => w.hr_sample_ok), [false, true, true]);
});

test("no timestamps, dates, raw names, route/ECG/clinical content, or extra keys", async () => {
  const { features } = await importFile(asFile("export.xml", xml), { now: NOW });
  const text = JSON.stringify(features);
  assert.ok(!/\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/.test(text), "date/time string");
  for (const s of ["Alex Sample", "Trailmix", "Liftbook", "Test Apple Watch", "HKDevice", "Fictional Clinic", "route", "ecg", "clinical"]) {
    assert.ok(!text.toLowerCase().includes(s.toLowerCase()), s);
  }
  const walk = (v) => { if (typeof v === "number") assert.ok(Math.abs(v) < 1e9, `epoch-like number ${v}`);
    else if (v && typeof v === "object") Object.values(v).forEach(walk); };
  walk(features);
  assert.deepEqual(Object.keys(features).sort(), ["days", "max_hr", "source", "v", "window_days", "workouts"]);
  for (const d of features.days) assert.deepEqual(Object.keys(d).sort(), ["day", "ln_hrv", "rhr", "srpe", "trimp", "vo2"]);
  for (const w of features.workouts) assert.deepEqual(Object.keys(w).sort(),
    ["day", "effort", "hr_sample_ok", "kcal", "min", "source", "sport", "srpe", "trimp", "zone_min"]);
});

test("an export with no kept records gives 60 empty days", async () => {
  const { features } = await importFile(asFile("export.xml", strToU8("<HealthData/>\n")), { now: NOW });
  assert.equal(features.days.length, 60);
  assert.equal(features.max_hr, null);
  assert.deepEqual(features.workouts, []);
  assert.ok(features.days.every((d) => d.trimp === 0 && d.rhr === null && d.ln_hrv === null && d.vo2 === null && d.srpe === null));
  assert.ok(zipSync);
});
