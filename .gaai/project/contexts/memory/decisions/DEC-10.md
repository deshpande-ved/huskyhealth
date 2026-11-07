---
id: DEC-10
domain: architecture
level: architectural
title: "Relay evidence stack: allowlist, Presidio, mitmweb, single-use tokens"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - relay
  - privacy
  - evidence
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-10 — Relay evidence stack: allowlist, Presidio, mitmweb, single-use tokens

## Context
Privacy claims must be provable with reputed tools.

## Decision
The relay uses a pydantic allowlist, a Presidio tripwire, mitmweb egress capture and RAM-only single-use tokens.

## Impact
Nothing to link or breach. Enforced by PRIV-6..PRIV-8.
