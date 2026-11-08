#!/usr/bin/env node
// scripts/huskyhealth.mjs: command-line client for your HuskyHealth personal API.
//   node scripts/huskyhealth.mjs records --user <name> [--after N]   decrypt and print your records as JSON
//   node scripts/huskyhealth.mjs history --user <name> [--sport S] [--last N]
//                                                                    your whole saved history (workouts and days), decrypted here
//   node scripts/huskyhealth.mjs token   --user <name>               make a device write token (shown once)
//   node scripts/huskyhealth.mjs session --user <name>               a session token for curl (1 hour, RAM only on the Pi)
//   node scripts/huskyhealth.mjs open <file> --user <name> [--sport S] [--last N]
//                                                                    decrypt a vault you fetched with curl; no network
// The password is read without echo and never leaves this machine: it derives the auth key and the vault key
// here (same code as the website), and records are decrypted here with the private key from your vault.
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { signIn, fetchRecords, newToken, deriveKeys, unseal, RELAY } from "../web/js/account.js";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k) => { const i = args.indexOf(`--${k}`); return i > 0 ? args[i + 1] : undefined; };
const user = opt("user") || process.env.HUSKYHEALTH_USER;
const relay = opt("relay") || RELAY;
if (!["records", "history", "token", "session", "open"].includes(cmd) || !user || (cmd === "open" && !args[1])) {
  console.error("usage: huskyhealth.mjs records|history|token|session --user <name> [--after N] [--sport S] [--last N] [--relay URL]\n" +
    "       huskyhealth.mjs open <file from curl> --user <name> [--sport S] [--last N]");
  process.exit(2);
}

function askHidden(q) {
  if (process.env.HUSKYHEALTH_PASSWORD) return Promise.resolve(process.env.HUSKYHEALTH_PASSWORD);
  return new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) process.stderr.write(q); };   // echo nothing typed
    rl.question(q, (a) => { rl.close(); process.stderr.write("\n"); done(a); });
  });
}

// Saved workouts, newest first, optionally one sport and the last N; days only for the full history.
function printHistory(vault) {
  const sport = opt("sport"), last = Number(opt("last") || 0);
  let workouts = [...(vault.workouts || [])].sort((a, b) => (b.start || b.date).localeCompare(a.start || a.date));
  if (sport) workouts = workouts.filter((w) => w.sport === sport);
  if (last > 0) workouts = workouts.slice(0, last);
  const days = sport || last ? undefined : [...(vault.days || [])].sort((a, b) => b.date.localeCompare(a.date));
  console.log(JSON.stringify({ workouts, ...(days ? { days } : {}) }, null, 2));
}

const password = await askHidden("password: ");

if (cmd === "open") {
  // {"vault": "<ciphertext>"} as curl saved it from GET /v1/account/vault. Decrypted here, offline.
  let blob;
  try { blob = JSON.parse(readFileSync(args[1], "utf8")).vault; } catch { console.error("could not read a vault from that file"); process.exit(1); }
  if (!blob) { console.error("that file has no vault (was the curl logged in?)"); process.exit(1); }
  try { printHistory(await unseal(await deriveKeys(user, password), blob)); }
  catch { console.error("Could not decrypt: wrong username or password."); process.exit(1); }
  process.exit(0);
}

const acct = await signIn({ username: user, password, relay });
if (!acct.ok) { console.error(acct.status); process.exit(1); }

if (cmd === "session") {
  console.error("Session token (1 hour; lets curl fetch your encrypted vault):");
  console.log(acct.session);
  process.exit(0);
}

if (cmd === "history") {
  printHistory(acct.vault);   // the vault came back from the Pi as ciphertext and was opened here by signIn
} else if (cmd === "token") {
  const t = await newToken({ account: acct, relay });
  if (!t.ok) { console.error(t.status); process.exit(1); }
  console.error("Device write token (shown once; it can add records, never read them):");
  console.log(t.token);
} else {
  const r = await fetchRecords({ account: acct, after: Number(opt("after") || 0), relay });
  if (!r.ok) { console.error(r.status); process.exit(1); }
  console.log(JSON.stringify({ records: r.records.map((x) => ({ id: x.id, received: new Date(x.at * 1000).toISOString(), ...x.drop })), last: r.last }, null, 2));
}
