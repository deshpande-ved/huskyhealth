// web/js/account.js: zero-knowledge accounts. Everything readable stays in this browser.
//   username -> id = SHA-256("huskyhealth:" + username)            (the Pi never sees the username)
//   password -> PBKDF2-SHA256, 600 000 rounds -> 64 bytes:
//                 first 32 = AES-256-GCM vault key (never leaves this browser, non-extractable)
//                 last 32  = auth key, sent to the Pi, which stores only a scrypt hash of it
//   vault    -> JSON -> gzip -> AES-GCM (id as associated data) -> base64 -> the Pi
//   records  -> any device POSTs to /v1/me/records with a write token; the Pi seals each one to this account's
//               RSA public key. The private key is kept only inside the vault, so only you can read them.
// Forget the password and the vault cannot be opened by anyone, including us.
import { openDrop } from "./box.js";
import { emptyVault } from "./vault.js";
export { emptyVault, makeReport, workoutSummaries, daySummaries, featuresFromVault, addToVault, mergeWorkouts, sameSession, MAX_REPORTS } from "./vault.js";

export const RELAY = "https://veds-pi5.polecat-nominal.ts.net:10000";

export const ROUNDS = 600_000;                 // OWASP 2023 guidance for PBKDF2-HMAC-SHA256
const te = new TextEncoder();
const td = new TextDecoder();

const b64 = (u8) => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const normalize = (username) => String(username || "").trim().toLowerCase();

export async function deriveKeys(username, password, rounds = ROUNDS) {
  const u = normalize(username);
  if (!u || !password) throw new Error("username and password are required");
  const id = hex(await crypto.subtle.digest("SHA-256", te.encode(`huskyhealth:${u}`)));
  const base = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: te.encode(`huskyhealth-v1:${u}`), iterations: rounds }, base, 512));
  const key = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
  const auth = b64(bits.slice(32));
  bits.fill(0);
  return { id, key, auth };
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function seal(keys, vault) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = await pipe(te.encode(JSON.stringify(vault)), new CompressionStream("gzip"));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(keys.id) }, keys.key, packed));
  const out = new Uint8Array(1 + iv.length + ct.length);
  out.set([1]); out.set(iv, 1); out.set(ct, 13);               // version byte | iv | ciphertext+tag
  return b64(out);
}

export async function unseal(keys, blob) {
  const raw = unb64(blob);
  if (raw[0] !== 1) throw new Error("unknown vault version");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(1, 13), additionalData: te.encode(keys.id) }, keys.key, raw.slice(13));
  return JSON.parse(td.decode(await pipe(new Uint8Array(pt), new DecompressionStream("gzip"))));
}

// ---- relay calls. All return { ok, ... } and never throw. ----
async function call(fetchFn, relay, path, body, session, method = "POST") {
  const headers = { "Content-Type": "application/json" };
  if (session) headers.Authorization = `Bearer ${session}`;
  const url = path.startsWith("/") ? `${relay}${path}` : `${relay}/v1/account/${path}`;
  try {
    const res = await fetchFn(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  }
}

const SAY = {
  0: "Could not reach the relay. Nothing was sent.",
  401: "Wrong username or password.",
  409: "That username is taken. Log in instead, or pick another.",
  413: "Your history is too big to save. Older reports need trimming.",
  429: "Too many tries. Wait a minute.",
};
const say = (s) => SAY[s] || "The relay refused that. Nothing was saved.";

// Create or open. Returns { ok, session, keys, vault } with the vault already decrypted here.
export async function signIn({ username, password, create = false, fetchFn = fetch, relay = RELAY, rounds = ROUNDS }) {
  let keys;
  try { keys = await deriveKeys(username, password, rounds); } catch (e) { return { ok: false, status: e.message }; }
  const r = await call(fetchFn, relay, create ? "create" : "open", { id: keys.id, auth: keys.auth });
  if (r.status !== 200 && r.status !== 201) return { ok: false, status: say(r.status) };
  let vault = emptyVault();
  if (r.json.vault) {
    try { vault = { ...emptyVault(), ...(await unseal(keys, r.json.vault)) }; } catch { return { ok: false, status: "Could not decrypt your history." }; }
  }
  const account = { session: r.json.session, keys: { id: keys.id, key: keys.key } };
  // First login since the personal API: make the account keypair here; only the public half goes to the Pi.
  if (!vault.rsa || !r.json.has_pub) {
    const pair = await makeAccountKeys();
    const k = await call(fetchFn, relay, "pubkey", { pub: pair.pub }, account.session);
    if (k.status !== 204) return { ok: false, status: say(k.status) };
    vault = { ...vault, rsa: pair.pkcs8 };
    const saved = await saveVault({ account, vault, fetchFn, relay });
    if (!saved.ok) return { ok: false, status: saved.status };
  }
  account.privateKey = await crypto.subtle.importKey("pkcs8", unb64(vault.rsa), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  return { ok: true, ...account, vault };
}

// RSA-OAEP 2048 keypair for the inbox. The private key is exported once, straight into the vault (encrypted).
export async function makeAccountKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  return { pub: b64(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey))),
           pkcs8: b64(new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))) };
}

// New records since `after`, opened here. Returns { ok, records: [{ id, at, drop }], last }.
export async function fetchRecords({ account, after = 0, fetchFn = fetch, relay = RELAY, open = openDrop }) {
  const r = await call(fetchFn, relay, `/v1/me/records?after=${Number(after) || 0}`, null, account.session, "GET");
  if (r.status !== 200) return { ok: false, status: r.status === 401 ? "Session expired. Log in again." : say(r.status) };
  const records = [];
  for (const x of r.json.records) {
    try {
      const o = await open(account.privateKey, x);
      // Current records carry the exact receive time inside the ciphertext; the clear `at` is rounded to the hour.
      records.push(o && o.record ? { id: x.id, at: o.received, drop: o.record } : { id: x.id, at: x.at, drop: o });
    } catch { /* unreadable: skip */ }
  }
  return { ok: true, records, last: r.json.last };
}

// The spoken brief: one passage of text to the relay, which asks Gradium and returns audio plus word timings.
export async function speakBrief({ account, text, fetchFn = fetch, relay = RELAY }) {
  const r = await call(fetchFn, relay, "/v1/speak", { text }, account.session);
  return r.status === 200 && r.json && r.json.audio ? { ok: true, ...r.json } : { ok: false, status: r.status };
}

// Talk to your API: up to 5 s of a spoken question (WAV) to the relay, which asks Gradium for the words.
export async function listenQuestion({ account, wav, fetchFn = fetch, relay = RELAY }) {
  try {
    const res = await fetchFn(`${relay}/v1/listen`, { method: "POST", body: wav,
      headers: { "Content-Type": "audio/wav", Authorization: `Bearer ${account.session}` } });
    const j = await res.json().catch(() => null);
    return res.status === 200 && j ? { ok: true, text: j.text } : { ok: false, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// Delete-after-sync: once records are folded into the encrypted vault, remove them from the Pi.
export async function deleteRecords({ account, upto, fetchFn = fetch, relay = RELAY }) {
  const r = await call(fetchFn, relay, `/v1/me/records?upto=${Number(upto) || 0}`, null, account.session, "DELETE");
  return { ok: r.status === 204 };
}

// Device write tokens: shown once; the Pi keeps a hash. Any device holding one can POST /v1/me/records.
export async function newToken({ account, fetchFn = fetch, relay = RELAY }) {
  const r = await call(fetchFn, relay, "tokens", { scope: "write" }, account.session);
  return r.status === 201 ? { ok: true, ...r.json } : { ok: false, status: r.status === 409 ? "Ten tokens is the limit. Revoke one first." : say(r.status) };
}
export async function listTokens({ account, fetchFn = fetch, relay = RELAY }) {
  const r = await call(fetchFn, relay, "tokens", null, account.session, "GET");
  return r.status === 200 ? { ok: true, tokens: r.json.tokens } : { ok: false, status: say(r.status) };
}
export async function revokeToken({ account, id, fetchFn = fetch, relay = RELAY }) {
  const r = await call(fetchFn, relay, `tokens/${encodeURIComponent(id)}`, null, account.session, "DELETE");
  return r.status === 204 ? { ok: true } : { ok: false, status: say(r.status) };
}

// The latest vault (another device, such as the iPhone app, may have written it since log in).
export async function fetchVault({ account, fetchFn = fetch, relay = RELAY }) {
  const r = await call(fetchFn, relay, "vault", null, account.session, "GET");
  if (r.status !== 200) return { ok: false, status: r.status === 401 ? "Session expired. Log in again." : say(r.status) };
  if (!r.json.vault) return { ok: true, vault: null };
  try { return { ok: true, vault: { ...emptyVault(), ...(await unseal(account.keys, r.json.vault)) } }; }
  catch { return { ok: false, status: "Could not decrypt your history." }; }
}

export async function saveVault({ account, vault, fetchFn = fetch, relay = RELAY }) {
  const blob = await seal(account.keys, vault);
  const r = await call(fetchFn, relay, "vault", { vault: blob }, account.session);
  return r.status === 204 ? { ok: true } : { ok: false, status: r.status === 401 ? "Session expired. Log in again." : say(r.status) };
}

export async function deleteAccount({ account, fetchFn = fetch, relay = RELAY }) {
  const r = await call(fetchFn, relay, "delete", null, account.session);
  return r.status === 204 ? { ok: true } : { ok: false, status: say(r.status) };
}
