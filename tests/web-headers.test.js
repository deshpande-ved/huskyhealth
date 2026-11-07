// E01S04: Cloudflare Pages _headers (CSP lives here).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = readFileSync(new URL("../web/_headers", import.meta.url), "utf8");
const RELAY = "https://veds-pi5.polecat-nominal.ts.net:10000";

const EXPECTED = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' ${RELAY}; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Permissions-Policy: microphone=(self), camera=(), geolocation=()
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff

/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Content-Type: application/manifest+json
`;

test("_headers is exactly the plan's block", () => {
  assert.equal(file, EXPECTED);
});

test("CSP directives are locked down", () => {
  const csp = file.match(/Content-Security-Policy: (.*)/)[1];
  const dir = Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(dir["connect-src"], ["'self'", RELAY]);
  for (const k of ["script-src", "style-src", "worker-src"]) assert.deepEqual(dir[k], ["'self'"], k);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
});

test("LF endings and two-space indentation", () => {
  assert.ok(!file.includes("\r"));
  for (const line of file.split("\n")) {
    if (line && !line.startsWith("/")) assert.match(line, /^ {2}\S/, line);
  }
});
