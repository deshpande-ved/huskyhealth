---
type: memory
category: project
id: PROJECT-ARCH-001
tags:
  - architecture
  - pwa
  - relay
  - data-flow
  - hosting
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (sections 5, 5.1, 5.2, 5.3)
---

# Architecture

## System diagram (plan 5)

```
Apple Watch ─▶ iPhone Health ──"Export All Health Data"──▶ export.zip ─┐
Garmin ─▶ Garmin Connect ──Apple Health sync──▶ (same export)          │
Garmin ─▶ .FIT files (Garmin Connect "Export Original", or USB) ───────┤
                                                                        ▼  user picks the file
┌─ HuskyHealth PWA · huskyhealth.vedsite.com (Cloudflare Pages, from the public repo) ─┐
│ Web Worker: stream-unzip + scan export.xml  /  Garmin FIT SDK                        │
│   → features JSON (60 days)                                  nothing leaves here     │
│ Engine (JS, versioned, pure): TRIMP · sRPE · Banister · Foster · HRV band            │
│ ASCII UI: call banner, HRV gauge, load calendar, fitness/fatigue plot, References    │
│ IndexedDB: derived daily features only · one-tap "Forget everything"                │
└──────────────────────────────┬────────────────────────────────────────────────────────┘
                               │ optional, after consent: ~20 rounded numbers
                               ▼  HTTPS; TLS ends on the Pi (Funnel relays can't decrypt)
veds-pi5 · Funnel :10000 → gateway (nginx: /v1/ only, CORS) → relay (Flask, read-only)
                                    relay → mitmweb egress → Claude (:8080)
                                                           → Gradium (:8082)
```

## User flow (5.1)

1. **Install:** open `https://huskyhealth.vedsite.com` in Safari → Share → Add to Home Screen. Install first: the Home Screen app has its own storage, separate from Safari's.
2. **Export (iPhone):** Health → profile picture → Export All Health Data → save `export.zip` to Files (a few minutes on a big store).
3. **Import:** tap Import, pick `export.zip` (Garmin: `.FIT` files). A Web Worker streams and parses on the phone with progress; keeps 60 days of needed record types.
4. **Scores:** engine computes today's call, load, fitness/fatigue, HRV band. Every value shows source and method.
5. **Clean up:** app suggests deleting `export.zip` from Files (it contains everything Health knows).
6. **Optional coaching brief:**
   1. Page previews the rounded numbers; **Get coaching brief** sends them to `POST /v1/brief`.
   2. Relay validates, runs Presidio, calls Claude through mitmweb. Brief text returns with a speak token bound to that exact text.
   3. **Read it aloud** → `POST /v1/speak` → Gradium through mitmweb. **Use phone voice** speaks on-device instead.

## Borrowed from Goose (5.2)

Goose: local-first WHOOP 5.0 companion (Swift app → one JSON-over-C function → Rust core; SQLite on phone; versioned scores: recovery 0–100, sleep 0–100, strain 0–21).

| Goose | HuskyHealth PWA |
|---|---|
| Bluetooth ingest from the strap | file import (Apple Health export, `.FIT`) in a Web Worker |
| Swift ↔ Rust through one JSON-over-C function | page ↔ worker and page ↔ engine through one JSON contract (`postMessage`) |
| SQLite on the phone | IndexedDB on the phone, derived features only |
| versioned formulas (`goose_recovery_v0` …) | versioned formulas (`husky_load_v1`, `husky_readiness_v1`) |
| each value shows where it came from; empty states | same: source + method on every value, "not enough data" instead of guesses |
| Algorithms / References / Calibration screens | References page listing every method and paper |
| coach reads the same local summaries | brief built from the same numbers the screen shows |

**Not borrowed:**
- **Code:** Goose repo has no license; can't be reused.
- **Bluetooth:** Apple doesn't expose the Watch over Bluetooth.
- **Rust bridge:** not needed in a browser.
- **WHOOP-calibrated weights:** some forks' coefficients came from disassembling WHOOP's app. Never touch those.

## Ports and hosts (5.3)

| Thing | Value | Note |
|---|---|---|
| App (PWA) | `https://huskyhealth.vedsite.com` | Cloudflare Pages, built from the public repo; previews at `<branch>.huskyhealth.pages.dev` |
| Relay API | `https://veds-pi5.polecat-nominal.ts.net:10000` | Funnel allows only a few ports; 10000 is HuskyHealth's |
| gateway (nginx) | `127.0.0.1:8090` | Funnel target; `/v1/` only, CORS for the app's origins |
| mitmweb UI | `127.0.0.1:8091` | local to the Pi only |
| relay | `relay:8000` | internal network only |
| egress → Claude | `egress:8080` | reverse proxy to `https://api.anthropic.com` |
| egress → Gradium | `egress:8082` | reverse proxy to the Gradium region host |
