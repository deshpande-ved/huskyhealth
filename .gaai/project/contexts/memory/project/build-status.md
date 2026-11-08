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
- History of reports lives on the phone (complete file protection). Accounts were requested by Ved later the same evening; see the accounts decision when written.
- Every relay restart forgets drop boxes (RAM only): re-pair after redeploying the Pi.

## Not done yet
- App → relay → website sync verified end to end; build on Ved's iPhone (signing, Background App Refresh).
- AI brief (E05 rest), Gradium voice (E07), Presidio/proof (E08), demo video + Devpost (due Sun 11:00, freeze 09:15).
- Real export: 19 squash workouts, 9 HRV days in 60 → readiness shows "No call yet" on real data.
