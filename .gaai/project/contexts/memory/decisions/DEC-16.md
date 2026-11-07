---
id: DEC-16
domain: architecture
level: strategic
title: "Convenience mode opt-in, OFF by default, encrypted at rest"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - sync
  - privacy
  - consent
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-16 — Convenience mode opt-in, OFF by default, encrypted at rest

## Context
'Would anyone use it' is the weakest rubric row; auto-sync helps but risks the privacy story.

## Decision
Offer automatic sync as opt-in, OFF by default; the Pi stores only data encrypted to a key on the phone.

## Impact
Keeps the default airplane-mode story intact. Enforced by PRIV-4.
