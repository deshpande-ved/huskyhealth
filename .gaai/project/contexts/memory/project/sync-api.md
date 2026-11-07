---
type: memory
category: project
id: PROJECT-SYNC-001
tags:
  - sync
  - convenience-mode
  - opt-in
  - encryption
  - shortcut
  - relay
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (section 5.4)
---

# Convenience mode: automatic sync (opt-in, OFF by default) — feature F13

Why: re-exporting Health is the weakest rubric row ("would anyone use it"). This removes the chore for users who opt in, without touching the default airplane-mode story.

## Off by default
Nothing below exists for a user until they turn it on.

## Turning it on
1. Consent screen states:
   - what is sent: new workouts since last sync with their heart rate, plus last 3 days of resting HR, HRV and effort
   - who can read it: the Pi, in memory, for milliseconds
   - how long kept: until the phone collects it, max 24 h, memory only
   - how to turn it off
2. App generates an RSA-OAEP key pair with WebCrypto; private key non-extractable, stays in IndexedDB.
3. `POST /v1/box` registers the public key; relay returns box ID, write secret (for the Shortcut), read secret (for the app).
4. App shows a pairing code (box ID + write secret) to paste into the **HuskyHealth Sync** Shortcut once.

## Each sync
1. **Trigger.** iOS has no "when iPhone is unlocked" automation. Closest equivalent:
   - **App → Is Opened** with several everyday apps selected (Messages, Safari, Instagram…): opening one means the phone is unlocked, so Health is readable. **Run Immediately**, **Notify When Run** off.
   - Also **Apple Watch Workout → Ends** and **Charger → Is Disconnected.** If locked when these fire, the Health read fails quietly; the next app open catches up.
   - (Apple's trigger families: events — time, alarm, Watch workout, sound recognition; travel — arrive, leave, CarPlay; settings — Wi-Fi, Bluetooth, Focus, charger, battery, NFC, app opened/closed.)
2. **Cheap check first; no network unless something is new.** Shortcut keeps `state.json` (last check time, end time of last synced workout) in On My iPhone → HuskyHealth.
   - Last check < 15 min ago → stop.
   - *Find Health Samples:* Workouts after last synced end time, limit 1. None → save check time, stop.
   - Only with a new workout: build payload (new workouts + HR, last 3 days resting HR, HRV, effort).
3. Shortcut posts to `POST /v1/drop/<box>` with the write secret; on success updates `state.json`.
4. Relay immediately encrypts to the box's public key (AES-256-GCM, AES key wrapped by RSA-OAEP), keeps only ciphertext in memory, drops plaintext.
5. Next app open: `GET /v1/drop/<box>` (read secret) returns ciphertext and deletes it. Phone decrypts and merges new days.

## Turning it off
App deletes its keys and calls `DELETE /v1/box/<box>`; relay forgets the box.

## Limits
One pending drop per box, 24 h expiry, 64 KB max. All in RAM (restart wipes it). No logs.

## Honest caveats (pitch)
- With the mode on, plaintext exists on the Pi for milliseconds, and recent raw heart rate leaves the phone (encrypted at rest).
- The Shortcut holds the write secret; users shouldn't share their copy.
- Show both threat-model rows: mode off and mode on (plan 9.5).

**Battery/noise:** runs on many app opens, but it's a local query that stops early; notifications off, nothing shown unless a sync happens.

**Cost (F13):** ~3.5–4.5 h (pairing + keys 1 h, drop box + encryption 1 h, Shortcut with state check 1.5–2.5 h).

## Code sketches

```python
# relay/dropbox.py: the relay keeps only ciphertext; plaintext never outlives the request
import base64
import os
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

BOXES: dict[str, dict] = {}            # box_id → {"pub", "write", "read", "drop", "exp"}; RAM only
TTL = 24 * 3600


def seal(pub_spki_der: bytes, plaintext: bytes) -> dict:
    key, nonce = AESGCM.generate_key(bit_length=256), os.urandom(12)
    pub = serialization.load_der_public_key(pub_spki_der)
    wrapped = pub.encrypt(key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                                            algorithm=hashes.SHA256(), label=None))
    b64 = lambda b: base64.b64encode(b).decode()
    return {"key": b64(wrapped), "nonce": b64(nonce), "ct": b64(AESGCM(key).encrypt(nonce, plaintext, None))}
```

```js
// web/js/box.js: keys are made and used only on the phone
export async function makeKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false, ["encrypt", "decrypt"]);                         // private key can't be exported
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return { pair, publicKeyB64: btoa(String.fromCharCode(...spki)) };
}

export async function openDrop(privateKey, { key, nonce, ct }) {
  const b = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const raw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, b(key));
  const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b(nonce) }, aes, b(ct));
  return JSON.parse(new TextDecoder().decode(plain));
}
```
