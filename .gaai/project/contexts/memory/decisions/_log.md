---
type: memory
category: decisions
id: DECISIONS-LOG
tags:
  - decisions
  - governance
created_at: 2026-11-07
updated_at: 2026-11-07
---

# Decision Log

> Append-only. Never delete or overwrite decisions.
> Only the Discovery Agent may add entries (or Bootstrap Agent during initialization).
> Format: one entry per decision, newest at top.
> For large projects, split by domain: `decisions/auth.md`, `decisions/api.md`, etc.

---

## Entry Template

```markdown
### DEC-YYYY-MM-DD-NN — [Decision Title]

**Context:** Why a decision was needed.
**Decision:** What was chosen.
**Rationale:** Why this option.
**Impact:** What it affects.
**Date:** YYYY-MM-DD
```

---

## Entries

> Bootstrap 2026-11-07: DEC-1..DEC-22 extracted from docs/PLAN.md section 15.
> IDs numbered locally (max+1), not via allocate-id.sh: solo build, one Discovery session at a time (Ved's choice).

- DEC-22 — Engine validated by tests, scenarios, GoldenCheetah cross-check and data gates (governance, operational) — 2026-11-07
- DEC-21 — App-opened automation with a local new-workout check (architecture, architectural) — 2026-11-07
- DEC-20 — ASCII design language (architecture, strategic) — 2026-11-07
- DEC-19 — PWA on Cloudflare Pages, relay on the Pi (infrastructure, architectural) — 2026-11-07
- DEC-18 — Solo build; every feature stays in the plan as a menu (governance, operational) — 2026-11-07
- DEC-17 — Voice in only by opt-in; clone only a consenting coach (governance, strategic) — 2026-11-07
- DEC-16 — Convenience mode opt-in, OFF by default, encrypted at rest (architecture, strategic) — 2026-11-07
- DEC-15 — Use all three Gradium capabilities, each with a privacy rule (strategy, strategic) — 2026-11-07
- DEC-14 — Prize tracks: Privacy-First, Most Startup-able, Best Use of Gradium (strategy, strategic) — 2026-11-07
- DEC-13 — Never open routes, ECGs or clinical records (architecture, architectural) — 2026-11-07
- DEC-12 — No Rust (architecture, operational) — 2026-11-07
- DEC-11 — Voice out by default; Gradium plus phone voice (architecture, architectural) — 2026-11-07
- DEC-10 — Relay evidence stack: allowlist, Presidio, mitmweb, single-use tokens (architecture, architectural) — 2026-11-07
- DEC-9 — Tailscale Funnel on :10000 for the relay, not Cloudflare Tunnel (infrastructure, architectural) — 2026-11-07
- DEC-8 — Session-RPE alongside TRIMP (architecture, architectural) — 2026-11-07
- DEC-7 — Two-state training call from the HRV band (architecture, architectural) — 2026-11-07
- DEC-6 — Engine on published methods only (architecture, strategic) — 2026-11-07
- DEC-5 — Borrow Goose's architecture, not its code (architecture, architectural) — 2026-11-07
- DEC-4 — Garmin via Apple Health sync and .FIT; never Garmin credentials (architecture, architectural) — 2026-11-07
- DEC-3 — Apple Health export is the main import (architecture, architectural) — 2026-11-07
- DEC-2 — Import and scoring run in the browser (architecture, architectural) — 2026-11-07
- DEC-1 — PWA for the hackathon, native app after (architecture, strategic) — 2026-11-07

<!-- Add decisions above this line, newest first -->
