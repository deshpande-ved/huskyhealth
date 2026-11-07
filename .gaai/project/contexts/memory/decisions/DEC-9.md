---
id: DEC-9
domain: infrastructure
level: architectural
title: "Tailscale Funnel on :10000 for the relay, not Cloudflare Tunnel"
status: active
created_by: bootstrap
created_at: 2026-11-07
last_updated_by: bootstrap
last_updated_at: 2026-11-07
supersedes: null
superseded_by: null
tags:
  - relay
  - tailscale
  - network
related_to: []
skills_invoked:
  - .gaai/core/skills/cross/decision-extraction/SKILL.md
source: docs/PLAN.md (section 15)
---

# DEC-9 — Tailscale Funnel on :10000 for the relay, not Cloudflare Tunnel

## Context
The relay must be reachable publicly over TLS from the Pi.

## Decision
Expose the relay via Tailscale Funnel on port 10000; TLS ends on the Pi. The standard HTTPS ports are already in use there.

## Impact
Venue Wi-Fi blocking 10000 only affects the AI step.
