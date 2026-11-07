---
type: rules
category: product
id: RULES-CLAIMS-001
tags:
  - wording
  - science
  - ai
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/rules-normalize/SKILL.md
source: docs/PLAN.md (section 4)
---

# Claims & Wording Rules

> Applies to UI copy, AI prompts and outputs, README, Devpost text and the pitch. Enforcement: **blocking**.

---

## CLAIM-1 — Training language only (blocking)

- **Condition:** Never say "injury risk" and never make medical or diagnostic claims. Describe load, fitness, fatigue, readiness and training calls.
- **Scope:** `web/`, `relay/` prompts, docs, Devpost text.
- **Check:** `grep -rniE "injury risk|diagnos|medical advice|treat(s|ment)?\b" web/ relay/ README.md` has no user-facing hits.

## CLAIM-2 — "De-identified", never "anonymous" (blocking)

- **Condition:** Say "de-identified" for data that leaves the device. Never "anonymous" or "anonymized".
- **Scope:** same as CLAIM-1.
- **Check:** `grep -rniE "anonymous|anonymi[sz]" web/ relay/ README.md` returns nothing user-facing.

## CLAIM-3 — Rules decide, AI explains (blocking)

- **Condition:** The engine makes every training call with published, named, versioned methods. AI only explains, from a fixed list of rounded numbers; it never makes or overrides the call.
- **Scope:** `web/js/engine.js`, `relay/` AI routes and prompts.
