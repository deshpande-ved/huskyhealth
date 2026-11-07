---
type: memory
category: project
id: PROJECT-DESIGN-001
tags:
  - design
  - ascii
  - ui
  - accessibility
  - palette
created_at: 2026-11-07
updated_at: 2026-11-07
skills_invoked:
  - .gaai/core/skills/cross/memory-ingest/SKILL.md
source: docs/PLAN.md (section 5.5)
---

# Design language: ASCII

Borrowed from Ved's SSH portfolio and `art/make_art.py`:
- Everything drawn on a monospace character grid.
- Brightness → characters from terminalcam's 70-step ramp.
- Each character takes its color from the data.

## Grid and type
- System monospace only: `ui-monospace, "SF Mono", Menlo, monospace`. No web fonts.
- Cell aspect 0.5 (width/height), same as `make_art.py`.
- Layouts measured in columns: ~44 on a phone, 100 on desktop.

## Palette: Rosé Pine, CSS variables, dark only

| Role | Color | Hex |
|---|---|---|
| background | base | `#191724` |
| panels | surface | `#1f1d2e` |
| text | text | `#e0def4` |
| secondary | muted | `#6e6a86` |
| zone 1 | foam | `#9ccfd8` |
| zone 2 | pine | `#31748f` |
| zone 3 | gold | `#f6c177` |
| zone 4 | rose | `#ebbcba` |
| zone 5, load alerts | love | `#eb6f92` |
| AI and voice | iris | `#c4a7e7` |

## Components (`web/js/ascii.js`)
- **The call:** 5-row block-letter banner (`HARD` / `EASY` / `NO DATA`). Hand-draw a small font covering A D E H N O R S T Y.
- **HRV band gauge:** `[...........|====o====|...........]`; `o` = 7-day mean, `=` = ±0.5 SD band.
- **Training calendar:** last 60 days as a 7-row grid; each day's load → ramp char (light → dense), colored by dominant zone (make_art's lum → char mapping applied to load).
- **Fitness / fatigue:** two-series plot on a char grid (`+` fitness, `o` fatigue).
- **Zone bars:** `z4 ########............ 31%`.
- **Import progress:** `[#########...........] 412k lines`.
- **Speaking captions:** current word (from Gradium word timestamps) inverts colors like a terminal cursor.
- **Mark:** ASCII husky made with `make_art.py` from an original photo (Ved's own, or CC0). Not Northeastern's Paws logo (trademark).
- **Icons:** 192/512 PNGs and Apple touch icon, rendered from the ASCII mark.

## Rendering rules
- `<pre>` blocks filled by JS.
- Colors from CSS classes, or `element.style` set in JS (both allowed under `style-src 'self'`); inline `style=""` attributes are not.
- No chart library; no images except icons.

## Accessibility
- Every ASCII figure is `role="img"` with an `aria-label` carrying the real numbers ("Fitness 62, fatigue 71, form −9").
- **Plain view** toggle swaps every figure for plain text.
- **Listen** buttons read any card aloud (Gradium, or the phone's voice). Screen readers never read raw ASCII.

## Code sketch

```js
// web/js/ascii.js: data drawn as characters; no canvas, no chart library
// 70-step ramp, dense → light. Paste the exact string from terminalcam / main.go if it differs.
export const RAMP = "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ";

export function rampChar(v) {                        // v: 0 (light) … 1 (dense)
  const t = Math.min(Math.max(v, 0), 1);
  return RAMP[Math.round((1 - t) * (RAMP.length - 1))];
}

// 60-day training calendar: 7 rows × N weeks; sqrt stretches low loads like make_art's contrast stretch
export function calendar(dailyLoad, dominantZone) {
  const max = Math.max(...dailyLoad, 1);
  const rows = Array.from({ length: 7 }, () => []);
  dailyLoad.forEach((x, i) => rows[i % 7].push({ ch: rampChar(Math.sqrt(x / max)), cls: `z${dominantZone[i] ?? 0}` }));
  return rows;
}

// two series on a character grid, oldest → newest left → right
export function plot(a, b, width = 44, height = 10) {
  const all = [...a, ...b];
  const lo = Math.min(...all);
  const hi = Math.max(...all, lo + 1);
  const grid = Array.from({ length: height }, () => Array(width).fill(" "));
  const put = (series, ch) => series.forEach((v, i) => {
    const x = Math.round((i / Math.max(series.length - 1, 1)) * (width - 1));
    const y = height - 1 - Math.round(((v - lo) / (hi - lo)) * (height - 1));
    grid[y][x] = ch;
  });
  put(a, "+");
  put(b, "o");
  return grid.map((r) => r.join("")).join("\n");
}

// HRV band gauge: z in SD units, clamped to ±2; the band is ±0.5 SD
export function gauge(z, width = 33) {
  const mid = (width - 1) / 2;
  const toX = (sd) => Math.round(mid + (Math.max(-2, Math.min(2, sd)) / 2) * mid);
  const cells = Array.from({ length: width }, (_, x) => (x >= toX(-0.5) && x <= toX(0.5) ? "=" : "."));
  cells[toX(-0.5) - 1] = "|";
  cells[toX(0.5) + 1] = "|";
  cells[toX(z)] = "o";
  return `[${cells.join("")}]`;
}

export const bar = (pct, width = 20) => "#".repeat(Math.round((pct / 100) * width)).padEnd(width, ".");

// paint colored cells without innerHTML: rows = [[{ ch, cls }]]
export function paint(pre, rows) {
  pre.replaceChildren(...rows.flatMap((row, r) => [
    ...row.map(({ ch, cls }) => Object.assign(document.createElement("span"), { textContent: ch, className: cls })),
    ...(r < rows.length - 1 ? [document.createTextNode("\n")] : []),
  ]));
}
```
