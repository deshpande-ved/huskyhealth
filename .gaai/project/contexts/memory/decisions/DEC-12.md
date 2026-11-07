---
id: DEC-12
domain: architecture
level: operational
title: "No Rust"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - stack
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-12 — No Rust

## Context
Considered Rust/WASM for performance.

## Decision
Do not use Rust.

## Impact
Nothing is CPU-bound; the slow part is reading the export.
