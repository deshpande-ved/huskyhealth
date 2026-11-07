---
id: DEC-6
domain: architecture
level: strategic
title: "Engine on published methods only"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - engine
  - science
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-6 — Engine on published methods only

## Context
Earlier versions had a made-up HuskyScore, a squash multiplier and invented thresholds.

## Decision
Drop HuskyScore, the squash multiplier and made-up thresholds; every number cites a published source or is labeled as ours.

## Impact
Enforced by FE-2 and CLAIM-3. References page lists every formula.
