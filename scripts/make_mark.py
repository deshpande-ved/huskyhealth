"""Make the ASCII husky mark and the app icons from one photo.

    python3 scripts/make_mark.py <image> [crop w:h:x:y] [--knockout] [--cols=N]

--knockout blanks near-white background connected to the image edge (for logo
art on white), so the mark sits on the dark base instead of a block of '$'.

Same method as art/make_art.py (vedsite): ffmpeg crops, sharpens and boosts
saturation at the exact cell grid (cell aspect 0.5), one contrast stretch from
the 1st/99th percentile, then each cell becomes a character from terminalcam's
70-step ramp (bright -> dense), coloured by its pixel, on Rose Pine base.

Writes:
  web/art/husky.json            {cols, rows, chars: [str], rgb: [hex...]} for the UI
  web/icons/icon-192.png        192x192
  web/icons/icon-512.png        512x512, mark inside the maskable safe zone
  web/icons/apple-touch-icon.png 180x180, opaque
  web/favicon.svg, web/favicon.ico (16/32/48), web/icons/favicon-96x96.png  tab icons, from a coarser grid
Needs ffmpeg and rsvg-convert. Reads only the photo; no network.
"""
import json, os, subprocess, sys, tempfile
from xml.sax.saxutils import escape

ASPECT = 0.5                      # cell width / height, as make_art.py
COLS = 40                         # 40 x 20 cells for a square crop
GAMMA = 1.0
RAMP = "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. "  # dense -> light
BASE = "#191724"
KNOCKOUT = False
FAV_COLS = 24                     # coarser grid so the mark survives at tab size
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def grab(src, crop, cols, rows, fmt):
    pre = f"crop={crop}," if crop else "crop='min(iw,ih)':'min(iw,ih)',"
    vf = f"{pre}format=yuv444p,scale={cols}:{rows}:flags=lanczos,unsharp=3:3:1.2,eq=saturation=1.25,format={fmt}"
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", src, "-frames:v", "1", "-vf", vf,
                          "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    return raw[: cols * rows * (3 if fmt == "rgb24" else 1)]


def knockout(gray, rgb, cols, rows):
    """Cells of near-white background connected to the image edge (flood fill), for logo art."""
    def white(i):
        r, g, b = rgb[i * 3: i * 3 + 3]
        return gray[i] > 215 and max(r, g, b) - min(r, g, b) < 40
    seen, stack = set(), [r * cols + c for r in range(rows) for c in range(cols)
                          if r in (0, rows - 1) or c in (0, cols - 1)]
    while stack:
        i = stack.pop()
        if i in seen or not white(i):
            continue
        seen.add(i)
        r, c = divmod(i, cols)
        stack += [n for n, ok in ((i - cols, r > 0), (i + cols, r < rows - 1),
                                  (i - 1, c > 0), (i + 1, c < cols - 1)) if ok]
    return seen


def to_grid(src, crop, cols=None):
    cols = cols or COLS
    rows = round(cols * ASPECT)
    gray = grab(src, crop, cols, rows, "gray")
    rgb = grab(src, crop, cols, rows, "rgb24")
    px = sorted(gray)
    lo = px[len(px) // 100]
    hi = max(px[len(px) * 99 // 100], lo + 1)
    bg = knockout(gray, rgb, cols, rows) if KNOCKOUT else set()
    chars, colors = [], []
    for r in range(rows):
        line, cl = [], []
        for c in range(cols):
            i = r * cols + c
            if i in bg:
                line.append(" ")
                cl.append(BASE)
                continue
            v = min(max((gray[i] - lo) / (hi - lo), 0), 1) ** GAMMA
            px3 = tuple(rgb[i * 3: i * 3 + 3])
            if KNOCKOUT:
                # logo art on a dark base: every mark cell gets a solid glyph; black ink -> Rose Pine muted
                v = 0.3 + 0.7 * v
                if max(px3) < 70:
                    px3 = (0x6e, 0x6a, 0x86)
            line.append(RAMP[round((1 - v) * (len(RAMP) - 1))])
            cl.append("#%02x%02x%02x" % px3)
        chars.append("".join(line))
        colors.append(cl)
    return cols, rows, chars, colors


def svg(cols, rows, chars, colors, size, inset):
    # monospace advance ~0.6em; cell aspect 0.5 -> line height = 2 x advance
    box = size * (1 - 2 * inset)
    adv = box / cols
    fs = adv / 0.6
    lh = adv / ASPECT
    top = (size - lh * rows) / 2
    left = (size - adv * cols) / 2
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">',
           f'<rect width="{size}" height="{size}" fill="{BASE}"/>',
           f'<g font-family="Menlo, SF Mono, monospace" font-size="{fs:.3f}" font-weight="700">']
    for r in range(rows):
        y = top + lh * (r + 0.78)
        for c, ch in enumerate(chars[r]):
            if ch == " ":
                continue
            out.append(f'<text x="{left + adv * c:.2f}" y="{y:.2f}" fill="{colors[r][c]}">{escape(ch)}</text>')
    out.append("</g></svg>")
    return "\n".join(out)


def write_ico(pngs, dest):
    # ICO container holding PNG images (16/32/48), as browsers and Windows accept
    import struct
    head = struct.pack("<HHH", 0, 1, len(pngs))
    entries, blobs, offset = b"", b"", 6 + 16 * len(pngs)
    for size, data in pngs:
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    with open(dest, "wb") as fh:
        fh.write(head + entries + blobs)


def render(svg_text, size, dest, tmp, pix_fmt="rgb24"):
    s = os.path.join(tmp, f"{size}.svg")
    p = os.path.join(tmp, f"{size}.png")
    with open(s, "w") as fh:
        fh.write(svg_text)
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", p, s], check=True)
    # flatten to opaque RGB (iOS rejects transparency in the touch icon)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", p, "-pix_fmt", pix_fmt, dest], check=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for a in sys.argv[1:]:
        if a.startswith("--cols="):
            COLS = int(a.split("=", 1)[1])
    KNOCKOUT = "--knockout" in sys.argv
    src = os.path.expanduser(args[0])
    crop = args[1] if len(args) > 1 else None
    cols, rows, chars, colors = to_grid(src, crop)
    os.makedirs(os.path.join(ROOT, "web", "art"), exist_ok=True)
    with open(os.path.join(ROOT, "web", "art", "husky.json"), "w") as fh:
        json.dump({"cols": cols, "rows": rows, "chars": chars, "rgb": colors}, fh, separators=(",", ":"))
    with tempfile.TemporaryDirectory() as tmp:
        for name, size, inset in [("icon-192.png", 192, 0.04), ("icon-512.png", 512, 0.12),
                                  ("apple-touch-icon.png", 180, 0.04)]:
            render(svg(cols, rows, chars, colors, size, inset), size, os.path.join(ROOT, "web", "icons", name), tmp)
            print(f"wrote web/icons/{name}")
        fc, fr, fch, fco = to_grid(src, crop, FAV_COLS)
        with open(os.path.join(ROOT, "web", "favicon.svg"), "w") as fh:
            fh.write(svg(fc, fr, fch, fco, 64, 0.02))
        render(svg(fc, fr, fch, fco, 96, 0.02), 96, os.path.join(ROOT, "web", "icons", "favicon-96x96.png"), tmp)
        pngs = []
        for size in (16, 32, 48):
            dest = os.path.join(tmp, f"ico-{size}.png")
            render(svg(fc, fr, fch, fco, size, 0.0), size, dest, tmp, "rgba")
            with open(dest, "rb") as fh:
                pngs.append((size, fh.read()))
        write_ico(pngs, os.path.join(ROOT, "web", "favicon.ico"))
        print("wrote web/favicon.svg, web/favicon.ico, web/icons/favicon-96x96.png")
    print("\n".join(chars))
