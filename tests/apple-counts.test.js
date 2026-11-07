// E03S05: counts-only CLI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "../web/vendor/fflate.esm.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = join(ROOT, "scripts", "apple-counts.mjs");
const FIXTURE = join(ROOT, "tests", "fixtures", "synthetic-export.xml");
const NOW = String(Date.parse("2026-11-07T18:00:00-05:00"));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, HH_NOW: NOW } });
const status = () => execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });

const EXPECTED = [
  "lines scanned: 66",
  "split-attribute tags: 0",
  "kept samples: hr=21 rhr=3 hrv=3 vo2=1 effort=1 effortEst=1",
  "workouts: 3 (deduped 1)",
  "by sport: other=1 running=1 squash=1",
  "by source: Other app=1 Apple Watch=2",
  "effort: user=1 estimated=1 none=1",
  "hr_sample_ok: true=2 false=1",
  "days with HRV: 2",
].join("\n");

test("fixture .xml and a temp .zip print the known counts, nothing else, and write nothing", () => {
  const before = status();
  const a = run(FIXTURE);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.stdout.trim(), EXPECTED);
  const dir = mkdtempSync(join(tmpdir(), "hh-"));
  const zipPath = join(dir, "export.zip");
  writeFileSync(zipPath, zipSync({ "apple_health_export/export.xml": new Uint8Array(readFileSync(FIXTURE)) }));
  const b = run(zipPath);
  assert.equal(b.status, 0, b.stderr);
  assert.equal(b.stdout.trim(), EXPECTED);
  for (const out of [a.stdout, b.stdout]) {
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(out));
    for (const s of ["Alex Sample", "Trailmix", "Liftbook", "Test Apple Watch"]) assert.ok(!out.includes(s), s);
  }
  assert.equal(status(), before);
});

test("refuses real exports inside the repo", () => {
  const r = run(join(ROOT, "package.json"));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /keep real exports outside the repo/);
});

test("usage and errors exit non-zero", () => {
  assert.notEqual(run().status, 0);
  assert.notEqual(run(join(tmpdir(), "does-not-exist.zip")).status, 0);
  const dir = mkdtempSync(join(tmpdir(), "hh-"));
  const p = join(dir, "export.zip");
  writeFileSync(p, zipSync({ "notes.txt": strToU8("x") }));
  const r = run(p);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /export\.xml not found/);
});
