---
id: DEC-13
domain: architecture
level: architectural
title: "Never open routes, ECGs or clinical records"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - privacy
  - import
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-13 — Never open routes, ECGs or clinical records

## Context
Collect less, even locally.

## Decision
The importer never opens GPS routes, ECGs or clinical records in the export.

## Impact
Enforced by PRIV-3.
