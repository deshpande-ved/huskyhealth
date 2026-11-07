---
id: DEC-4
domain: architecture
level: architectural
title: "Garmin via Apple Health sync and .FIT; never Garmin credentials"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - import
  - garmin
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-4 — Garmin via Apple Health sync and .FIT; never Garmin credentials

## Context
Garmin users must be covered without handling their account.

## Decision
Garmin comes in through Apple Health sync (P0) and on-device `.FIT` decoding with Garmin's SDK (P1). Never ask for Garmin credentials.

## Impact
Covers Garmin-on-iPhone for free; `.FIT` decoding stays on the device.
