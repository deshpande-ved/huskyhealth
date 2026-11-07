---
id: DEC-19
domain: infrastructure
level: architectural
title: "PWA on Cloudflare Pages, relay on the Pi"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - hosting
  - cloudflare
  - relay
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-19 — PWA on Cloudflare Pages, relay on the Pi

## Context
The PWA needs simple deploys and a verifiable build.

## Decision
Host the PWA on Cloudflare Pages built from the public repo; the Pi runs only the AI relay.

## Impact
Git-push deploys, branch previews, a clean URL, a verifiable deployed commit.
