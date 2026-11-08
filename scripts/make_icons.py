"""Bright husky mark and icons, from the saved ASCII grid (web/art/husky.json; no photo needed).

The grid is cropped to the husky (the photo left empty margins) and its colours lifted with a gamma curve, so the
mark is very bright on dark paper but keeps its shading. The iPhone app's mark uses the same curve
(mobile/src/components/mark.tsx BRIGHT_GAMMA).

  python3 scripts/make_icons.py

writes web/art/husky-bright.svg and husky-mark.svg (the header mark, dark and light mode), web/icons/icon-192.png, icon-512.png,
apple-touch-icon.png, and the iOS app icon (mobile/assets/icon.png, 1024 px). Needs rsvg-convert and ffmpeg.
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
from make_mark import render  # noqa: E402  (rsvg-convert + ffmpeg, opaque output)

ROOT = os.path.join(os.path.dirname(__file__), "..")
PAPER_DARK = "#16140f"          # --paper in dark mode (web/css/style.css)
GAMMA = 0.42                    # < 1 lifts dark greys strongly, keeps their order (shading)


def bright(hex_color: str, gamma: float = GAMMA) -> str:
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return "#" + "".join(f"{round(255 * (c / 255) ** gamma):02x}" for c in (r, g, b))


def crop(art):
    rows = [i for i, line in enumerate(art["chars"]) if line.strip()]
    cols = [j for line in art["chars"] for j, ch in enumerate(line) if ch != " "]
    r0, r1, c0, c1 = rows[0], rows[-1] + 1, min(cols), max(cols) + 1
    return ([line[c0:c1] for line in art["chars"][r0:r1]], [row[c0:c1] for row in art["rgb"][r0:r1]])


def svg(chars, colors, size, inset, bg=None):
    """Monospace cells: advance 0.6 em, line height twice the advance (as make_mark.py), centred in the square."""
    cols, rows = max(len(l) for l in chars), len(chars)
    box = size * (1 - 2 * inset)
    adv = min(box / cols, box / (rows * 2))
    lh = adv * 2
    left, top = (size - adv * cols) / 2, (size - lh * rows) / 2
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">']
    if bg:
        out.append(f'<rect width="{size}" height="{size}" fill="{bg}"/>')
    out.append(f'<g font-family="Menlo, SF Mono, monospace" font-size="{adv / 0.6:.3f}" font-weight="700">')
    esc = {"&": "&amp;", "<": "&lt;", ">": "&gt;"}
    for r, line in enumerate(chars):
        for c, ch in enumerate(line):
            if ch != " ":
                out.append(f'<text x="{left + adv * c:.2f}" y="{top + lh * (r + 0.78):.2f}" fill="{colors[r][c]}">{esc.get(ch, ch)}</text>')
    out.append("</g></svg>")
    return "\n".join(out)


if __name__ == "__main__":
    with open(os.path.join(ROOT, "web", "art", "husky.json")) as fh:
        art = json.load(fh)
    chars, colors = crop(art)
    lit = [[bright(c) for c in row] for row in colors]
    with open(os.path.join(ROOT, "web", "art", "husky-bright.svg"), "w") as fh:
        fh.write(svg(chars, lit, 512, 0.0))
    with open(os.path.join(ROOT, "web", "art", "husky-mark.svg"), "w") as fh:
        fh.write(svg(chars, colors, 512, 0.0))
    print("wrote web/art/husky-bright.svg, web/art/husky-mark.svg")
    with tempfile.TemporaryDirectory() as tmp:
        for dest, size, inset in [("web/icons/icon-192.png", 192, 0.06), ("web/icons/icon-512.png", 512, 0.14),
                                  ("web/icons/apple-touch-icon.png", 180, 0.06), ("mobile/assets/icon.png", 1024, 0.06)]:
            render(svg(chars, lit, size, inset, bg=PAPER_DARK), size, os.path.join(ROOT, dest), tmp)
            print(f"wrote {dest}")
