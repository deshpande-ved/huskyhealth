# HuskyHealth

**Your workouts, as an API only you can read.**

Your Apple Watch (or Garmin) workouts reach your own private REST API, automatically, and nobody can read them
on the way, not even the server that stores them. On top of that API: a daily training call from published
sports science, a website and an iPhone app that show the same numbers, and a voice you can talk to.

Built solo at HACK1984 (Northeastern, Nov 7–8, 2026).

- Website: https://huskyhealth.pages.dev
- How the API works: https://huskyhealth.pages.dev/api

## The problem

Your watch knows how hard you trained, how you slept and how fit you are. Getting that data out means one of two
bad options. You can export a zip by hand, or you can hand your health history to a company whose server reads
it: Strava, Terra, Health Auto Export and the rest all decrypt your data on their side. There was no way for a
student athlete, a coach or a developer to get their own workouts as an API without giving them away.

## What it does

1. **Watch to API, by itself.** Finish a workout. The iPhone app sees it (HealthKit background delivery), seals it on
   the phone and posts it to your personal API. Garmin works too, through Garmin Connect's Apple Health sync.
2. **Zero knowledge.** Your password never leaves your device. The relay (a Raspberry Pi) stores only ciphertext and
   a hash; the keys to open your history exist only on your phone and in your browser.
3. **Today's call.** "Train hard" or "Go easy", from your heart-rate variability band, or from this week's load
   against your usual week when there isn't enough HRV yet. Every number links to the published method behind it.
4. **The same on every screen.** The website and the app draw today from the same encrypted history with the same
   code: this week, last session, sleep, VO2 max, heart-rate zones, calories.
5. **Talk to your API (Gradium).** Tap *listen* and today's call is spoken, with each word highlighted as it's said.
   Ask "how many calories did I burn this week?" out loud. It's answered from your data, and you see the exact
   `curl` request behind the answer.

## How it works

```
Apple Watch / Garmin ──> Apple Health ──> HuskyHealth iPhone app
                                            │  seals each workout to your account key
                                            ▼
                         Raspberry Pi relay (behind Tailscale Funnel, HTTPS)
                           stores ciphertext only · per-key rate limits · strict schema
                                            │
                            ┌───────────────┴───────────────┐
                            ▼                               ▼
                 Website (Cloudflare Pages)       iPhone app (Expo + Swift)
                 decrypts in your browser         decrypts on your phone
                            └──── same engine, same numbers ┘
```

- **Accounts:** the browser or phone runs PBKDF2-SHA256 (600,000 rounds) on your password. Half of the result is
  the vault key, which never leaves your device. The other half logs you in; the Pi keeps only a scrypt hash of it.
- **Your history** (the "vault") is JSON, gzipped, then encrypted with AES-256-GCM before it leaves the device.
- **Records from devices** go to `POST /v1/me/records` with a write-only token: it can add, never read. Each record
  is sealed to your account's RSA public key (AES-256-GCM, key wrapped with RSA-OAEP); the private key lives only
  inside your encrypted vault.
- **The engine** (`web/js/engine.js`) uses published methods only: Banister TRIMP and fitness-fatigue, session-RPE,
  HRV bands (Plews et al.), and the acute:chronic load ratio (Gabbett, labelled disputed). It runs in the browser
  and, as the same file, in the app.
- **No location, ever.** Routes, ECGs and clinical records are never read.

## Sponsor tools

- **Gradium**: text-to-speech for the spoken daily call (with word timings for highlighting) and speech-to-text
  for "talk to your API". Both run through the relay's egress proxy (mitmproxy), so you can see exactly what
  leaves: one short passage of the brief, or at most five seconds of your question, never stored.

## Run it

You need Node 20+, Python 3.12+, and Docker for the relay. The iPhone app needs a Mac with Xcode.

### Website

```bash
python3 -m http.server 8770 -d web
```

Open http://localhost:8770. You can import an Apple Health export (`export.zip`) offline. It's parsed in a Web
Worker and nothing leaves the browser. Logging in talks to the hosted relay, which only accepts the HuskyHealth
domains; to log in locally, run your own relay (below) and point `RELAY` in `web/js/account.js` at it.

### Tests

```bash
npm test
```

```bash
python3 -m venv .venv && .venv/bin/pip install -r relay/requirements.txt -r relay/requirements-dev.txt && npm run test:relay
```

The web suite covers the engine, parser, vault model, views and service worker; the relay suite covers accounts,
records, rate limits, voice and a no-logging check.

### Relay (API)

```bash
cp .env.example .env && chmod 600 .env
```

Fill in `GRADIUM_API_KEY` by hand in an editor (optional: voice works only with it). Then:

```bash
docker compose up -d --build
```

The API gateway listens on http://127.0.0.1:8090 (try `/v1/healthz` and `/v1/openapi.json`); mitmweb shows
outbound traffic on http://127.0.0.1:8091. Deploying on a Raspberry Pi with Tailscale Funnel:
[docs/relay-deploy.md](docs/relay-deploy.md).

### iPhone app

```bash
cd mobile && npm install && npx expo run:ios --configuration Release
```

Add `--device` to install on a plugged-in iPhone (Xcode → Signing & Capabilities → your team; a free Apple ID
works for 7-day installs). Log in, allow Health access, and your last 60 days arrive on the website.

### Use the API yourself

Make a device token on the website (account page), then send a workout from anything:

```bash
curl -X POST https://veds-pi5.polecat-nominal.ts.net:10000/v1/me/records \
  -H "Authorization: Bearer $HH_TOKEN" -H "Content-Type: application/json" \
  -d '{"v":1,"workouts":[{"sport":"running","start_s":3600,"end_s":1800,"kcal":320}]}'
```

It appears on your website within 30 seconds, encrypted the whole way. Full reference: `/api` and `/v1/openapi.json`.

## Repository

| Path | What's there |
|---|---|
| `web/` | Website (PWA): engine, parser worker, vault model, views, dot-matrix ASCII design |
| `mobile/` | iPhone app: Expo screens reusing `web/js`, Swift module for HealthKit, Keychain, crypto, voice |
| `relay/` | Flask API: accounts, sealed records, Gradium voice, OpenAPI spec |
| `nginx/` | Gateway: method allowlist, per-client limits, security headers |
| `egress/` | mitmproxy: every outbound request visible |
| `tests/` | Node and pytest suites |
| `.gaai/` | Project memory and decisions (GAAI governance) |

## Limits, honestly

- No password reset: nobody can read your history, so a forgotten password loses it.
- Background sync on a free Apple developer account is not guaranteed by iOS; opening the app always syncs.
- The demo workout button writes a sample workout to Health for the demo; it would be removed before App Store
  submission.
- Training insight, not medical advice.

## Credits

Space Mono by Colophon Foundry, SIL Open Font License 1.1 (`web/fonts/`, `mobile/assets/fonts/`). Voice by Gradium.
