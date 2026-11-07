---
type: memory
category: patterns
id: PATTERNS-001
tags:
  - patterns
  - conventions
  - procedural
  - git
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md ("Claude Code: start here")
depends_on:
  code_paths: []
  decisions: []
  epics: []
refresh_tier: 2
---

# Patterns & Conventions

> Procedural memory: how things are done in this project.
> Hard constraints (privacy, security, CSP) live in `contexts/rules/`; this file is the working style.

---

## Git

- Branch prefixes: `feat/`, `fix/`, `infra/`, `chore/`. Squash-merge to `main`; `staging` fast-forwards from `main`.
- Develop on the Mac; the Pi only pulls.
- The `.gitignore` and pre-commit gate (`.githooks/`) are never bypassed.
- Ask Ved which GitHub identity to use before any clone, remote change or Pages connection.

## Commands

- Multi-line terminal commands are given as paste-ready heredocs.
- Explain any destructive command before suggesting it.

## Code Patterns

- Complete files, not fragments. Minimal, surgical edits to existing files.
- ASCII is the design language (plan 5.5); no chart library.

## Test Patterns

- JS: `node --test`. Parser tests use synthetic fixtures only; real exports stay local.
- Test on desktop and on the iPhone (installed PWA).
- Verify against primary sources (docs, real API responses), never by analogy.

## Build Order (each step ends with its check)

1. Repo hygiene → 2. PWA skeleton on Pages → 3. Engine + tests → 4. Apple parser + features → 5. ASCII design system, UI, References, IndexedDB + Forget → 6. Airplane-mode end to end → 7. Pi relay → 8. Brief → 9. Gradium speak + coach's voice → 10. Presidio → 11. Ved's feature picks → 12. Proof scripts.

## Anti-Patterns (Avoid)

- Shipping workout data to the relay or any server.
- Chart.js or other chart libraries (removed in v3.2).
