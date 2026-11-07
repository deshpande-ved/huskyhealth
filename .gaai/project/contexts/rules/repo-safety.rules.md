---
type: rules
category: security
id: RULES-REPO-SAFETY-001
tags:
  - git
  - secrets
  - ops
  - safety
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/rules-normalize/SKILL.md
source: docs/PLAN.md ("Claude Code: start here")
---

# Repo & Ops Safety Rules

> Applies to every agent, every story. Enforcement: **blocking**.

---

## SAFE-1 — Never commit secrets, health data or the plan (blocking)

- **Condition:** Never stage or commit secrets (`.env`, keys, tokens, `*.pem`, `*.key`), real health data (`*.zip`, `*.fit`, `export*.xml`, `apple_health_export/`, `tests/fixtures/real_*`), `docs/PLAN.md`, or the private runbook. Test fixtures are synthetic.
- **Scope:** all commits.
- **Check:** the pre-commit gate (`.githooks/pre-commit`) passes and is never bypassed (`--no-verify` is forbidden); `git diff --cached --name-only` shows none of the above.

## SAFE-2 — Public-repo hygiene for committed context (blocking)

- **Condition:** `.gaai/project/` is public. It contains no homelab host names other than the public relay URL, no LAN IPs, no ports other than 8090, 8091, 8000, 8080, 8082, 8083 (internal-only search egress, Ved 2026-11-07), 10000, no SSH aliases, and no personal email addresses.
- **Scope:** `.gaai/project/`, `README.md`, docs.
- **Check:** the runbook's D5 scrub grep prints `clean`.

## SAFE-3 — Ask before risky commands (blocking)

- **Condition:** Ask Ved first before any git identity or remote change, clone, Pages connection, destructive command (force push, reset, branch delete, `rm -rf`), or any command run on the Pi. Explain any destructive command before suggesting it.
- **Scope:** all agents, all sessions.

## SAFE-4 — Never run `tailscale serve reset` (blocking)

- **Condition:** Never run or suggest `tailscale serve reset`; it wipes other services' Funnel config on the Pi. Change only the relay's own serve entry.
- **Scope:** all agents, all sessions.

## SAFE-5 — Keys never on screen (blocking)

- **Condition:** API keys and perk codes never appear in the demo video, Devpost, screenshots or logs. Use dedicated hackathon keys; show mitmweb's Request body tab, not headers; revoke keys after judging.
- **Scope:** demo, docs, relay logs.
