# Design Brief: HuskyHealth web

## Problem
Your Apple Watch knows how hard you trained, but the data is locked on your iPhone. Apple ships no web API; Strava paywalled theirs. Athletes and coaches end up screenshotting the Fitness app, and every service that offers to help wants to read your heart data.

## Solution
Log in once on the iPhone app and your last 60 days of workouts arrive on the web, encrypted so only you can read them. The page answers one question first (train hard or go easy today), then shows this week, the last session and where your heart rate went. Underneath sits your own REST API.

## Experience Principles
1. **One answer, then evidence.** The call is the only loud thing; everything else is a ruled line of data you can open.
2. **Nothing the page already says.** No labels explaining what a row is, no "details" links on rows that already react to a pointer, no device-specific copy.
3. **One account, every screen.** Phone and laptop show the same thing in the same words. Never "this phone".

## Aesthetic Direction
- **Philosophy:** a dot-matrix printout. Continuous-form paper with faint bands and tractor-feed holes, black ribbon ink, one Northeastern red. ASCII is the medium, not decoration: the call is printed in block letters, charts are characters.
- **Tone:** precise, warm, a little playful.
- **Reference points:** dot-matrix receipts and fan-fold printouts, terminal ASCII art, train departure boards.
- **Anti-references:** purple/indigo gradients, muted amber, neon on dark, glass cards, emoji, stacked same-size cards, verbose helper text (the article's slop tells).
- **Type:** Space Mono only (400, 700), self-hosted.
- **Motion:** made of characters. The call decodes from random ASCII into its letters; figures print left to right. Nothing floats.

## Existing Patterns
- ASCII primitives in `web/js/ascii.js` (bar, banner, paint), view models in `web/js/view.js`, hash routing in `web/js/app.js`.
- Strict CSP: no inline script or style, fonts self-hosted.

## Component Inventory
| Component | Status | Notes |
|---|---|---|
| Masthead (mark, wordmark, tagline, nav, account) | Modify | log in moves top right |
| Log-in sheet | New | popover on desktop, full-width sheet on phones |
| ASCII banner call | New | full A–Z block font, decode animation |
| Readout row | Modify | title, one sentence, figure; the row is the link |
| Detail pages (week, session, zones) | Exists | restyle, no helper text |
| Account page | Modify | API and devices, history, import, data |
| Import | Modify | no page of its own; in account and the empty state |
| Methods | Exists | reached only from method links |

## Key Interactions
- Log in from the top right on any page; the sheet closes on success and today fills.
- Rows lift to the band colour and underline their title in red on hover or focus; Enter opens the detail.
- Import shows an ASCII progress bar in the masthead strip, on any page.

## Responsive Behavior
375 px: single column; the banner scales to fit its longest line; the log-in sheet spans the width. 1280 px: content column 1040 px; tractor-feed holes appear in the margins.

## Accessibility Requirements
WCAG 2.2 AA. Text ≥ 4.5:1 on paper. The banner has a real heading for screen readers; every ASCII figure has an accessible name. Zones are never colour-only (labels Z1–Z5). Keyboard focus visible in red. Reduced motion: no decode, no print-in.

## Out of Scope
The iOS app's fonts (palette and copy only), public feeds, team view, AI report.
