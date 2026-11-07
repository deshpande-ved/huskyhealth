---
id: DEC-7
domain: architecture
level: architectural
title: "Two-state training call from the HRV band"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - engine
  - hrv
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-7 — Two-state training call from the HRV band

## Context
A readiness call needs a defensible decision rule.

## Decision
The call is two-state (HARD / EASY, plus NO DATA), derived from the HRV band, mirroring the published HRV-guided protocol.

## Impact
No invented middle state.
