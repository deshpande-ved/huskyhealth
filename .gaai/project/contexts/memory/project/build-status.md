---
type: memory
category: project
id: PROJECT-STATUS-001
tags:
  - status
  - roadmap
  - mobile
  - api
  - voice
created_at: 2026-11-07
updated_at: 2026-11-08
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: build session 2026-11-07/08 (Ved + Claude); PRs #20-#47
---

# Build status (HACK1984, Sunday ~00:15; freeze 09:15, Devpost 11:00)

Live: website https://huskyhealth.pages.dev (main) = staging; relay on the Pi behind Funnel
https://veds-pi5.polecat-nominal.ts.net:10000. Ved runs Pi restarts himself (auto mode blocks remote deploys).

## What the product is now
"Zero knowledge, personal API." A zero-knowledge personal REST API for watch workouts, a daily
training call from published science, voice from Gradium, an iOS companion. Works for Apple Watch and for
Garmin (Garmin Connect writes into Apple Health; the app tags those workouts `garmin`). Anything else that writes
workouts to Apple Health (Whoop, Oura, Polar) comes along partially; no native Whoop or Garmin connector.

## Built (all merged; main == staging at #47)
- **Accounts (zero-knowledge, #23):** browser derives PBKDF2-SHA256 600k -> vault key (never leaves) + auth key;
  Pi stores sha256(username) file: scrypt(auth), salt, encrypted vault, public key, token hashes. No password reset.
- **Personal API (#27, #39, #42):** devices `POST /v1/me/records` with write-only device tokens (`hhw_<id>_<secret>`,
  expire 1-365 days, last-used day). Relay validates (strict schema, no names/GPS/devices), seals to the account's
  RSA public key (exact receive time sealed inside, hour-rounded outside), stores ciphertext; the website/CLI
  decrypts with the private key from the vault, folds into the vault, then `DELETE /v1/me/records?upto=N`;
  uncollected records expire after 30 days. OpenAPI at /v1/openapi.json, docs at /api, CLI scripts/huskyhealth.mjs.
- **API hardening (#42, #43):** per-key limits (10 log-ins per account per 15 min, 120 records per token and 300 per
  account per hour, 120 per session per minute), global backstops, JSON errors {error,status}, Retry-After,
  API-Version, 415 for non-JSON; nginx gateway: method allowlist (incl. HEAD), per-client limits keyed on the
  Funnel-appended address (verified: Funnel passes real client IPs), strict log-in limit, timeouts, HSTS, CSP,
  nosniff, DENY, no-referrer, server_tokens off. Not done: OAuth2, WebAuthn/passkeys (PRF), edge DDoS protection.
- **iOS companion (#20, #22, #29, #37, #40, #44):** Expo SDK 58 + local Swift modules (health-kit, duo-display).
  Swift does all data work: HealthKit reads, account login (PBKDF2 byte-identical to the browser), Keychain
  device token, 60-day backfill on first login (one record per workout + daily RHR/HRV), background delivery
  (HKObserverQuery), Retry-After handling, Garmin tagging. Screens are React Native and reuse web/js engine/view.
  Verified on the iPhone Duo simulator; not yet built to Ved's iPhone (free Apple ID: 7-day installs; HealthKit
  on a free team unconfirmed; TestFlight needs the $99 program).
- **Website design (#40):** dot-matrix ASCII printout: Space Mono only (self-hosted), paper bands and tractor-feed
  holes, ribbon ink, one Northeastern red, intentional dark mapping; all text >= 4.7:1. The call is printed in
  ASCII block letters that decode from noise; figures print left to right. Pages: ./today ./api; log in top
  right (sheet); account page holds API tokens, history, import, data. No import page, no helper text, no
  "details" labels, no device-specific copy ("this phone"). Design docs: .design/huskyhealth-web/.
- **Today model (#26, #34):** call (HRV band, else load fallback: this week vs usual week, ratio > 1.3 = easy),
  this week, last session, 60-day zones; detail pages #week #session #zones; calories everywhere (#40).
  A browser with no data rebuilds today from the vault on log in.
- **Voice, Gradium (#44, #46):** `POST /v1/speak` (TTS, pcm_24000 + word timings, privacy filter: plain brief text
  only, <= 600 chars) and `POST /v1/listen` (STT, <= 5 s WAV). Both session-only, rate-limited, through the egress
  proxy, never stored. Website: listen button (word highlighting, browser-voice fallback) and "talk to your API"
  ask box: keyword intents on the device (call, week, last session, zones, calories, count), spoken answers, and
  the curl request behind each answer ("send a 30 minute run" -> the exact POST). Verified live end to end.
- **Tests:** 124 web (node --test), 73 relay (pytest).

## Decisions taken in session (not yet DEC files)
- One source of truth (#53, 2026-11-08): the encrypted account vault. The app writes its Apple Health workouts into
  it (vault key in the phone's Keychain, AES-GCM+gzip byte-compatible with the browser); app and website both draw
  today with featuresFromVault (web/js/vault.js). Workouts keep a start time inside the vault so each session is
  kept once (sameSession). Cause it fixed: the site used its own local copy with double-counted export workouts.
  Verified: app and staging show the same numbers. Never reintroduce a second data path for today.
- App looks like the website piece for piece (banded paper, Space Mono, mark, listen, ask, method, rows, same copy).
- Native iOS companion replaces the Shortcut path (Shortcuts cannot read workouts on iOS 26/27).
- Zero-knowledge accounts + personal API replace convenience mode and drop boxes; rule is now "nothing readable
  stored on the Pi"; records are a short-lived encrypted queue (delete after sync, 30-day expiry).
- Keep Expo (TypeScript UI + Swift data layer) for the hackathon; SwiftUI rewrite is post-hackathon.
- Dot-matrix ASCII design, Space Mono, tagline "Zero knowledge, personal API." (was "Your workouts, as an API only you can read." until 2026-11-08)
- No location of any kind (DEC-13 stands; Ved said "no location").
- No Goose code or reverse-engineered Whoop protocol (DEC-5 stands); Whoop/Garmin native connectors run on the
  phone (tokens stay on the device) or via sealed-on-arrival push, post-hackathon.
- AI report: send ~30 aggregate numbers through the egress proxy only once Ved has an Anthropic key; templates
  otherwise. The spoken brief is template-written (no AI reads data).

## Roadmap
1. Duo layouts in the iOS app (from Colère Nu's use-duo-layout: single / columns / rows).
2. Demo video (recorded 09:15) and Devpost write-up.
3. Build to Ved's iPhone (signing; HealthKit on a free team?).
4. Phonon (Gradium's on-device TTS, Apache 2.0, Swift package, Core ML, iOS 18+) in the app: speech without
   anything leaving the phone. ~2-3 h, build risk.
5. AI report (needs ANTHROPIC_API_KEY in the Pi's .env).
6. Post-hackathon: public feeds for personal sites (vedsite.com, "Strava API without the paywall"), coach team
   view from opted-in feeds, .FIT upload, Garmin Health API push, Whoop official API via the phone, Android
   Health Connect, passkeys, OAuth2, Cloudflare in front for DDoS.
