# Project Rule Overrides

Rule files here override or extend the framework rules in `.gaai/core/contexts/rules/`.

## Resolution Order

Agents load `core/contexts/rules/` first, then `project/contexts/rules/`. A project rule with the same filename as a core rule overrides it entirely.

## When to Add an Override

- When the project needs stricter or relaxed constraints on a specific rule
- When a domain-specific governance rule applies only to this project

## Active Project Rules

| File | ID | Covers |
|---|---|---|
| `privacy.rules.md` | RULES-PRIVACY-001 | No network in import/scoring, data stays on phone, opt-in OFF, consent, relay logging, Presidio, CSP |
| `frontend.rules.md` | RULES-FRONTEND-001 | No innerHTML / inline CSS+JS, sources on metrics, ASCII design, accessibility |
| `claims.rules.md` | RULES-CLAIMS-001 | Training language only, "de-identified", rules decide / AI explains |
| `repo-safety.rules.md` | RULES-REPO-SAFETY-001 | No secrets/health data/plan in commits, public-repo scrub, ask-first, no `tailscale serve reset`, keys off screen |
