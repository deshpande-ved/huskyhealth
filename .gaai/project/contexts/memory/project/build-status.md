---
type: memory
category: project
id: PROJECT-STATUS-001
tags:
  - status
  - roadmap
  - mobile
  - sync
created_at: 2026-11-07
updated_at: 2026-11-07
# evening: sync verified, accounts shipped
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: build session 2026-11-07 (Ved + Claude)
---

# Build status (HACK1984, Saturday evening)

## Built and on `staging` (PRs merged; staging deploys to staging.huskyhealth.pages.dev)
- **Web PWA (`web/`)**: shell (E01), engine (E02), Apple export parser (E03), ASCII UI with References, IndexedDB, Forget (E04), terminal-dashboard redesign, ASCII husky favicons/logo (`scripts/make_mark.py`, fixed-viewBox `web/art/husky.svg`).
- **Relay (`relay/`, on the Pi via Funnel :10000)**: schema, single-use tokens, `/v1/healthz`, encrypted drop box for convenience mode (ciphertext only, RAM, 24 h, read once). Deployed and checked with `scripts/check-gateway.sh`.
- **iOS companion (`mobile/`)**: Expo SDK 58 app built from the Colère Nu mobile setup; local Expo modules `health-kit` (Swift, HealthKit: real workout types, HR, background delivery, drop POST, on-phone history) and `duo-display` (from Colère Nu). Runs the website's own engine/view code. Verified on the iPhone Duo simulator.

## Decisions taken in session (not yet DEC files)
- Shortcuts cannot read workouts on iOS 26/27 and loop slowly; Group-by sums heart rate. The Shortcut path is superseded by the native companion (HealthKit reads workouts with real types).
- Sync drop format accepts explicit workout windows, `hr[]` offsets or `hr_t[]` ISO + `hr_v[]` lists; marks[] for types; sports squash/running/walking/cycling/strength/hiit/other.
- History of reports lives on the phone (complete file protection) in the iOS app.
- Accounts (PR #23, Ved chose "Pi, ciphertext only" + "reports + workout summaries"): zero-knowledge. Browser: PBKDF2-SHA256 600k -> AES-GCM vault key (never leaves) + auth key. Pi: `/data/vaults/<sha256(username)>.json` = scrypt(auth) + ciphertext only, named Docker volume. Vault = reports + per-workout summaries, never raw HR. No password reset by design. Rule is now "nothing readable stored on the Pi".
- Every relay restart forgets drop boxes (RAM only): re-pair after redeploying the Pi.

## Personal API (PR #27, live on the Pi)
- Zero-knowledge REST API replaced the drop box, pairing codes, convenience mode and the Shortcut. Devices POST /v1/me/records with a write-only token (hhw_<account id>_<secret>, only SHA-256 stored); the relay seals each record to the account's RSA public key and stores ciphertext in `<id>.inbox.json` (cap 400). GET needs a password session; the private key lives in the vault. OpenAPI at /v1/openapi.json, docs at /api.html, CLI scripts/huskyhealth.mjs.
- iOS app logs in with the account (Swift PBKDF2, byte-identical to the browser's) and keeps only a write token. Verified live: curl 201, token cannot read (401), app background post decrypted by password.
- Today page (PR #26): call (HRV, else load fallback, never "No call yet"), this week vs usual, last session, zones; ./today ./import ./account ./api.

## Not done yet
- App -> relay -> website sync verified end to end on the simulator (PR #22). Still to do: build on Ved's iPhone (signing, Background App Refresh); the iOS app does not use accounts yet.
- Ved's own account: he creates it on staging (import export.zip, then Account -> Create) with his own password.
- AI brief (E05 rest), Gradium voice (E07), Presidio/proof (E08), demo video + Devpost (due Sun 11:00, freeze 09:15).
- Real export: 19 squash workouts, 9 HRV days in 60 → readiness shows "No call yet" on real data.
