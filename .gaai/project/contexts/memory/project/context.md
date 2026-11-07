---
type: memory
category: project
id: PROJECT-001
tags:
  - product
  - vision
  - scope
  - privacy
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/codebase-scan/SKILL.md
  - .gaai/core/skills/cross/architecture-extract/SKILL.md
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md ("Claude Code: start here", sections 0 and 2)
depends_on:
  code_paths: []
  decisions: []
  epics: []
refresh_tier: 2
---

# Project Memory

> Loaded at the start of every session. Concise and high-signal.
> Source of truth: `docs/PLAN.md` (private, gitignored). Never load it whole; read only named sections.

---

## Project Overview

**Name:** HuskyHealth (HACK1984 hackathon build, solo: Ved).

**Purpose:** Training insight from your watch, from an app that can't see your data. An installable web app (PWA) imports Apple Watch / Garmin history and computes a WHOOP-style readiness score from published sports science, on the phone. Bevel-like, specialized for sports, squash first.

**Target Users:** Club and varsity athletes and their coaches. First customer: NEU Club Squash.

---

## Core Problems Being Solved

- Watch data is useful but today's tools ship it to someone's cloud; here it is never stored on a server.
- Squash is poorly served: Apple does not estimate effort for squash.
- Scores in consumer apps are opaque; every number here shows its source and links to a References card.

---

## Success Metrics

- Import and scoring work on the installed PWA in **airplane mode** (the headline demo).
- The optional AI brief sends only ~20 rounded, de-identified numbers, after the user taps, and the egress capture proves it.
- Judging: Privacy-First (what leaves the device, who can read it, can you prove it; would anyone use it), Most Startup-able, Best Use of Gradium.
- Devpost submission complete by **Sunday 11:00**: demo video (required), repo link, write-up, tracks.

---

## Tech Stack & Conventions

- **Client:** static PWA in `web/` (vanilla JS, Web Workers for parsers, IndexedDB), hosted on Cloudflare Pages from the public repo.
- **Relay:** small Python service on a Raspberry Pi (`relay/`), only for the optional AI brief; reached over Tailscale Funnel.
- **AI / voice:** Claude for the readiness brief; Gradium for TTS, voice cloning and opt-in STT.
- **Evidence:** Presidio (PII tripwire on the relay), mitmproxy (egress capture).
- **Key conventions:** see `patterns/conventions.md` and `contexts/rules/`.

---

## Architectural Boundaries

- **Phone (browser):** import, parsing and scoring. Workouts never leave it.
- **Relay (Pi):** stateless; sees only the de-identified numbers of a brief request; stores nothing.
- **Engine boundary:** one JSON contract (features JSON), versioned formulas, a source on every value (pattern borrowed from Goose, not its code).

---

## Known Constraints

- **Hackathon window:** Sat 11:00 → Sun 11:00; no code before or after.
- **Solo build:** every feature stays in the plan's feature menu with its hours until Ved decides the cuts.
- **Privacy:** AI only ever sees de-identified numbers; opt-in modes (convenience sync, voice check-ins) are OFF by default.
- **Never show API keys or perk codes** in the video, on Devpost, or in the repo.
- **Public repo:** this memory folder is committed publicly; no homelab hosts, LAN addresses, private ports or personal emails here.

---

## Out of Scope (Permanent)

- Native iOS app (moves to "after HACK1984").
- Server-side storage or publication of workouts (the pre-hackathon design did this; HACK1984 inverts it).
- Medical claims or injury-risk language.
- Surge (unless the optional evidence agent F19 is picked) and Signal-to-Dose prize tracks.
