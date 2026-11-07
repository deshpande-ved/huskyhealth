---
type: rules
category: frontend
id: RULES-FRONTEND-001
tags:
  - frontend
  - csp
  - design
  - accessibility
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/rules-normalize/SKILL.md
source: docs/PLAN.md ("Claude Code: start here", section 5.5)
---

# Frontend Rules

> Project rules for `web/`. Enforcement: **blocking** = QA FAIL if violated; **required** = must be fixed before merge.

---

## FE-1 — No `innerHTML`; no inline CSS or JS (blocking)

- **Condition:** No `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`. Use `textContent`, `createElement`, `replaceChildren`. No `<script>` bodies or `on*=` handler attributes in HTML; no `style=""` attributes. Setting `element.style` / `className` from JS is allowed (permitted by `style-src 'self'`).
- **Scope:** all of `web/`.
- **Check:** `grep -rnE "innerHTML|outerHTML|insertAdjacentHTML|document\.write" web/` returns nothing; `grep -rnE " on[a-z]+=|style=\"" web/ --include=*.html` returns nothing, and every `<script` tag in `web/**/*.html` has a `src` (`grep -rn "<script" web/ --include=*.html | grep -v "src="` returns nothing).

## FE-2 — Every metric shows its source (blocking)

- **Condition:** Every number shown to the user carries its source (formula name + version) and links to its References card. Anything that is our own (not published) is labeled as ours.
- **Scope:** `web/` UI, `web/js/engine.js` output contract.
- **Check:** each engine output value has a `source` field; each rendered metric has a link to `#ref-<id>` that exists on the References page.

## FE-3 — ASCII is the design language (required)

- **Condition:** Figures are drawn on a monospace character grid in `<pre>` blocks filled by JS (`web/js/ascii.js`). No chart library, no canvas charts, no images except icons. System monospace only (`ui-monospace, "SF Mono", Menlo, monospace`); no web fonts. Colors are the Rosé Pine palette as CSS variables, dark only.
- **Scope:** `web/`.
- **Check:** no chart library in `web/`; no `@font-face` or font URLs; palette defined once as CSS variables.

## FE-4 — ASCII figures are accessible (required)

- **Condition:** Every ASCII figure has `role="img"` and an `aria-label` with the real numbers. A Plain view toggle swaps every figure for plain text. Screen readers never read raw ASCII.
- **Scope:** `web/`.
- **Check:** every `<pre>` figure in the DOM has `role="img"` and a non-empty `aria-label`.

## FE-5 — No third-party trademarks as the mark (required)

- **Condition:** The ASCII husky mark comes from an original or CC0 photo. Never Northeastern's Paws logo.
- **Scope:** `web/` icons and mark.
