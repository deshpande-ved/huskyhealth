---
type: rules
category: privacy
id: RULES-PRIVACY-001
tags:
  - privacy
  - security
  - relay
  - consent
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/rules-normalize/SKILL.md
source: docs/PLAN.md ("Claude Code: start here", sections 4, 9)
---

# Privacy Rules

> Project rules. Loaded for every story. Enforcement: **blocking** = QA FAIL if violated.
> These encode the product's core promise; a violation is never a "minor" finding.

---

## PRIV-1 — No network during import or scoring (blocking)

- **Condition:** Code on the import, parse, feature-extraction and scoring paths (`web/js/parse-*.worker.js`, `web/js/features.js`, `web/js/engine.js`, and anything they import) makes no network request: no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, or dynamic `import()` of a remote URL.
- **Scope:** `web/` import + scoring modules and Web Workers.
- **Check:** `grep -nE "fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import\(['\"]https?:" <those files>` returns nothing; the airplane-mode import works on the installed PWA with zero requests in the Network tab.

## PRIV-2 — Workouts never leave the phone (blocking)

- **Condition:** Raw workouts, samples, dates, GPS, device names and any per-workout record stay on the device. The only thing that may leave by default is the relay brief request (`BriefIn`: ~20 rounded, de-identified numbers), and only after the user taps.
- **Scope:** all of `web/`, `relay/`.
- **Check:** relay request schemas reject unknown fields (pydantic allowlist → 422); mitmweb capture shows numbers only.

## PRIV-3 — Collect less (blocking)

- **Condition:** Parsers read only the record types the engine needs. They never open GPS routes, ECGs or clinical records in the export.
- **Scope:** `web/js/parse-*.worker.js`.
- **Check:** the parser's record-type allowlist is explicit in code; no reads of `workout-routes/`, `electrocardiograms/`, or clinical record files.

## PRIV-4 — Opt-in modes are OFF by default (blocking)

- **Condition:** Convenience mode (Sync API / auto-sync) and voice check-ins (speech-to-text, mic) default to OFF on first run and after Forget. Turning one on requires an explicit user action. Even when on, the Pi stores only data encrypted to a key held on the phone, in RAM only.
- **Scope:** `web/` settings defaults, `relay/` sync endpoints.
- **Check:** a test asserts default settings have both modes `false`; no code path requests mic permission unless voice check-ins are on.

## PRIV-5 — AI by consent, per provider (blocking)

- **Condition:** Before anything goes to an AI or voice provider (Anthropic, Gradium), the user consents for that provider and sees a preview of exactly what it gets. Gradium needs its own, second consent. Voice cloning is only ever of a consenting coach, labeled as an AI voice and deletable; never a user's voice.
- **Scope:** `web/` AI/voice UI, `relay/` AI routes.

## PRIV-6 — The relay never logs content (blocking)

- **Condition:** The relay never logs request bodies, brief text, prompts, audio, or pydantic `ValidationError` details (they echo input). Presidio results are logged as **counts only**. nginx runs with `access_log off` and strips `X-Forwarded-For` before the relay.
- **Scope:** `relay/`, `nginx/`.
- **Check:** `grep -rnE "log(ger)?\.\w+\(.*(body|request\.json|brief|prompt|audio|errors\(\))" relay/` returns nothing; error handlers return a generic 422 without echoing `exc.errors()`.

## PRIV-7 — Relay is stateless, tokens single-use (blocking)

- **Condition:** The relay has no volumes and writes no user data to disk. Brief tokens live in process RAM, are random, single-use, unlinked and deleted on use (replay → 410). Gunicorn runs exactly one worker.
- **Scope:** `relay/`, relay container config.
- **Check:** the replay proof script returns 200 then 410; `docker diff` shows no user data.

## PRIV-8 — Presidio tripwire on every outbound path (blocking)

- **Condition:** Presidio scans keys and string values of incoming JSON, the outbound prompt, and Claude's brief (not number arrays). `DATE_TIME` is excluded; the custom `DEVICE_NAME` recognizer is registered. Any finding blocks the request.
- **Scope:** `relay/pii.py` and callers.
- **Check:** the smuggle fixture (device name hidden in a brief) → 422 with `pii=["DEVICE_NAME"]`.

## PRIV-9 — CSP locks egress (blocking)

- **Condition:** The PWA's Content-Security-Policy restricts `connect-src` to `'self'` plus the relay origin. No third-party analytics, scripts, or fonts are added.
- **Scope:** `web/_headers`.
- **Check:** `curl -I` on the deployed app shows the CSP.
