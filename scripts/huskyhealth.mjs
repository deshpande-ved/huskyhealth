#!/usr/bin/env node
// scripts/huskyhealth.mjs: command-line client for your HuskyHealth personal API.
//   node scripts/huskyhealth.mjs records --user <name> [--after N]   decrypt and print your records as JSON
//   node scripts/huskyhealth.mjs token   --user <name>               make a device write token (shown once)
// The password is read without echo and never leaves this machine: it derives the auth key and the vault key
// here (same code as the website), and records are decrypted here with the private key from your vault.
import { createInterface } from "node:readline";
import { signIn, fetchRecords, newToken, RELAY } from "../web/js/account.js";

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k) => { const i = args.indexOf(`--${k}`); return i > 0 ? args[i + 1] : undefined; };
const user = opt("user") || process.env.HUSKYHEALTH_USER;
const relay = opt("relay") || RELAY;
if (!["records", "token"].includes(cmd) || !user) {
  console.error("usage: huskyhealth.mjs records|token --user <name> [--after N] [--relay URL]");
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

const password = await askHidden("password: ");
const acct = await signIn({ username: user, password, relay });
if (!acct.ok) { console.error(acct.status); process.exit(1); }

if (cmd === "token") {
  const t = await newToken({ account: acct, relay });
  if (!t.ok) { console.error(t.status); process.exit(1); }
  console.error("Device write token (shown once; it can add records, never read them):");
  console.log(t.token);
} else {
  const r = await fetchRecords({ account: acct, after: Number(opt("after") || 0), relay });
  if (!r.ok) { console.error(r.status); process.exit(1); }
  console.log(JSON.stringify({ records: r.records.map((x) => ({ id: x.id, received: new Date(x.at * 1000).toISOString(), ...x.drop })), last: r.last }, null, 2));
}
