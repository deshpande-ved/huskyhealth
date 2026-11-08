---
type: memory_index
id: MEMORY-INDEX
updated_at: YYYY-MM-DD
---

# Memory Map

> Always keep this index current. Agents use it to know what exists before calling `memory-retrieve`.
> Update when files are added, archived, or compacted.

---

## Active Files

| File | Category | ID | Last updated |
|---|---|---|---|
| `project/context.md` | project | PROJECT-001 | 2026-11-07 |
| `decisions/_log.md` | decisions | DECISIONS-LOG | 2026-11-07 |
| `patterns/conventions.md` | patterns | PATTERNS-001 | 2026-11-07 |
| `project/architecture.md` | project | PROJECT-ARCH-001 | 2026-11-07 |
| `project/sync-api.md` | project | PROJECT-SYNC-001 | 2026-11-07 |
| `project/design-ascii.md` | project | PROJECT-DESIGN-001 | 2026-11-07 |
| `project/data-parsers-apple.md` | project | PROJECT-PARSERS-001 | 2026-11-07 |
| `project/data-parsers-garmin.md` | project | PROJECT-PARSERS-002 | 2026-11-07 |
| `project/data-parsers-features.md` | project | PROJECT-PARSERS-003 | 2026-11-07 |
| `project/engine.md` | project | PROJECT-ENGINE-001 | 2026-11-07 |
| `project/ai-voice.md` | project | PROJECT-AI-001 | 2026-11-07 |
| `project/ai-brief-relay.md` | project | PROJECT-AI-002 | 2026-11-07 |
| `project/evidence.md` | project | PROJECT-EVIDENCE-001 | 2026-11-07 |
| `project/infra-files.md` | project | PROJECT-INFRA-001 | 2026-11-07 |
| `project/infra-deploy.md` | project | PROJECT-INFRA-002 | 2026-11-07 |
| `project/infra-pwa.md` | project | PROJECT-INFRA-003 | 2026-11-07 |
| `project/infra-relay.md` | project | PROJECT-INFRA-004 | 2026-11-07 |
| `project/prizes-and-demo.md` | project | PROJECT-PRIZES-001 | 2026-11-07 |
| `project/build-status.md` | project | PROJECT-STATUS-001 | 2026-11-08 |

## Project Memory Topics

Load only what the story needs.

| File | Topic |
|---|---|
| `project/architecture.md` | plan 5–5.3: system diagram, user flow, Goose borrowings, ports and hosts |
| `project/sync-api.md` | plan 5.4: convenience mode (opt-in auto-sync), encrypted dropbox |
| `project/design-ascii.md` | plan 5.5: ASCII design language, palette, components, ascii.js |
| `project/data-parsers-apple.md` | plan 6.1, 6.3: Apple Health export and parser worker |
| `project/data-parsers-garmin.md` | plan 6.2, 6.4: Garmin paths and .FIT parser worker |
| `project/data-parsers-features.md` | plan 6.5: features JSON engine contract |
| `project/engine.md` | plan 7: published methods, engine.js, References, validation |
| `project/ai-voice.md` | plan 8.1, 8.2, 8.4: AI privacy rules, feature IDs, Gradium |
| `project/ai-brief-relay.md` | plan 8.3: readiness brief, relay schema.py and ai.py |
| `project/evidence.md` | plan 9: Presidio, mitmproxy, Safe Harbor, threat model |
| `project/infra-files.md` | plan 10.2: Docker, nginx, compose infra files |
| `project/infra-deploy.md` | plan 10.3, 10.3b: Pi deploy, Funnel, Cloudflare Pages |
| `project/infra-pwa.md` | plan 10.4: PWA files, service worker, offline |
| `project/infra-relay.md` | plan 10.5: relay app, tokens, routes |
| `project/prizes-and-demo.md` | plan 0, 12: prize strategy, demo video, expo, pitch |
| `project/build-status.md` | built, session decisions, roadmap: accounts, personal API, hardening, iOS app, ASCII design, Gradium voice |

---

## Decision Registry

23 files in `decisions/` (`DEC-{N}.md`). Next ID: DEC-24.

| ID | Domain | Level | Topic | Status |
|---|---|---|---|---|
| DEC-1 | architecture | strategic | PWA for the hackathon, native app after | active 2026-11-07 |
| DEC-2 | architecture | architectural | Import and scoring run in the browser | active 2026-11-07 |
| DEC-3 | architecture | architectural | Apple Health export is the main import | active 2026-11-07 |
| DEC-4 | architecture | architectural | Garmin via Apple Health sync and .FIT; never Garmin credentials | active 2026-11-07 |
| DEC-5 | architecture | architectural | Borrow Goose's architecture, not its code | active 2026-11-07 |
| DEC-6 | architecture | strategic | Engine on published methods only | active 2026-11-07 |
| DEC-7 | architecture | architectural | Two-state training call from the HRV band | active 2026-11-07 |
| DEC-8 | architecture | architectural | Session-RPE alongside TRIMP | active 2026-11-07 |
| DEC-9 | infrastructure | architectural | Tailscale Funnel on :10000 for the relay, not Cloudflare Tunnel | active 2026-11-07 |
| DEC-10 | architecture | architectural | Relay evidence stack: allowlist, Presidio, mitmweb, single-use tokens | active 2026-11-07 |
| DEC-11 | architecture | architectural | Voice out by default; Gradium plus phone voice | active 2026-11-07 |
| DEC-12 | architecture | operational | No Rust | active 2026-11-07 |
| DEC-13 | architecture | architectural | Never open routes, ECGs or clinical records | active 2026-11-07 |
| DEC-14 | strategy | strategic | Prize tracks: Privacy-First, Most Startup-able, Best Use of Gradium | superseded 2026-11-07 |
| DEC-15 | strategy | strategic | Use all three Gradium capabilities, each with a privacy rule | active 2026-11-07 |
| DEC-16 | architecture | strategic | Convenience mode opt-in, OFF by default, encrypted at rest | active 2026-11-07 |
| DEC-17 | governance | strategic | Voice in only by opt-in; clone only a consenting coach | active 2026-11-07 |
| DEC-18 | governance | operational | Solo build; every feature stays in the plan as a menu | active 2026-11-07 |
| DEC-19 | infrastructure | architectural | PWA on Cloudflare Pages, relay on the Pi | active 2026-11-07 |
| DEC-20 | architecture | strategic | ASCII design language | active 2026-11-07 |
| DEC-21 | architecture | architectural | App-opened automation with a local new-workout check | active 2026-11-07 |
| DEC-22 | governance | operational | Engine validated by tests, scenarios, GoldenCheetah cross-check and data gates | active 2026-11-07 |
| DEC-23 | strategy | strategic | Tracks are guidelines: three tracks, Surge if F19 ships, no Signal-to-Dose; supersedes DEC-14 | active 2026-11-07 |

---

## Memory Principles

- **Retrieve selectively** — never load entire folders
- **Prefer summaries** over raw session notes
- **Archive aggressively** — move compacted content to `archive/`
- **Sessions are temporary** — always summarize before closing
- **Memory is distilled knowledge — not history**
