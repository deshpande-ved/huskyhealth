---
id: DEC-3
domain: architecture
level: architectural
title: "Apple Health export is the main import"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - import
  - apple-health
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-3 — Apple Health export is the main import

## Context
Users need their full existing history without installing anything.

## Decision
Import Apple Health's own export file as the primary data source.

## Impact
All history, no install, works on any iPhone. Parser lives in a Web Worker.
