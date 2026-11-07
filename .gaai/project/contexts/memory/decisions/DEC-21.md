---
id: DEC-21
domain: architecture
level: architectural
title: "App-opened automation with a local new-workout check"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - sync
  - ios
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-21 — App-opened automation with a local new-workout check

## Context
iOS has no 'when iPhone is unlocked' automation trigger.

## Decision
Convenience mode runs when an everyday app is opened, plus a local new-workout check that only touches the network when there is one.

## Impact
Keeps the network silent unless there is something new.
