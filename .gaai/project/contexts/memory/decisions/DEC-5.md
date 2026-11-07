---
id: DEC-5
domain: architecture
level: architectural
title: "Borrow Goose's architecture, not its code"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - engine
  - licensing
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-5 — Borrow Goose's architecture, not its code

## Context
Goose has a good engine pattern but its repo has no license and targets WHOOP.

## Decision
Adopt the pattern only: one JSON engine contract, versioned formulas, a source on every value, a References page.

## Impact
No Goose code is copied into the repo.
