---
id: DEC-2
domain: architecture
level: architectural
title: "Import and scoring run in the browser"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - privacy
  - on-device
  - engine
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-2 — Import and scoring run in the browser

## Context
For every user but Ved, the Pi is someone else's server.

## Decision
Import, parsing and scoring run in the browser on the phone; the Pi never sees a workout.

## Impact
Enforced by privacy rules PRIV-1/PRIV-2. The relay only handles the optional AI brief.
