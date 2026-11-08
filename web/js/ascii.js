// web/js/ascii.js: data drawn as characters; no canvas, no chart library.
// Pure functions except paint(), which is the only DOM access (createElement / textContent / replaceChildren).

// terminalcam's 70-step ramp, dense -> light (same string as make_art.py / scripts/make_mark.py)
export const RAMP = "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ";

export function rampChar(v) {                        // v: 0 (light) ... 1 (dense)
  const t = Math.min(Math.max(Number(v) || 0, 0), 1);
  return RAMP[Math.round((1 - t) * (RAMP.length - 1))];
}

// 60-day training calendar: 7 rows x N weeks; sqrt stretches low loads like make_art's contrast stretch
export function calendar(dailyLoad, dominantZone) {
  const max = Math.max(...dailyLoad, 1);
  const rows = Array.from({ length: 7 }, () => []);
  dailyLoad.forEach((x, i) => rows[i % 7].push({ ch: rampChar(Math.sqrt(x / max)), cls: `z${dominantZone[i] ?? 0}` }));
  return rows;
}

// two series on a character grid, oldest -> newest left -> right
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

// HRV band gauge: z in SD units, clamped to +/-2; the band is +/-0.5 SD
export function gauge(z, width = 33) {
  const mid = (width - 1) / 2;
  const toX = (sd) => Math.round(mid + (Math.max(-2, Math.min(2, sd)) / 2) * mid);
  const cells = Array.from({ length: width }, (_, x) => (x >= toX(-0.5) && x <= toX(0.5) ? "=" : "."));
  cells[toX(-0.5) - 1] = "|";
  cells[toX(0.5) + 1] = "|";
  cells[toX(z)] = "o";
  return `[${cells.join("")}]`;
}

export const bar = (pct, width = 20) =>
  "#".repeat(Math.round((Math.min(Math.max(pct, 0), 100) / 100) * width)).padEnd(width, ".");

// Hand-drawn 5-row block font, A-Z: the call ("GO EASY", "TRAIN HARD") and the wordmark are printed with it.
const FONT = {
  A: [" ### ", "#   #", "#####", "#   #", "#   #"], B: ["#### ", "#   #", "#### ", "#   #", "#### "],
  C: [" ####", "#    ", "#    ", "#    ", " ####"], D: ["#### ", "#   #", "#   #", "#   #", "#### "],
  E: ["#####", "#    ", "#### ", "#    ", "#####"], F: ["#####", "#    ", "#### ", "#    ", "#    "],
  G: [" ####", "#    ", "#  ##", "#   #", " ####"], H: ["#   #", "#   #", "#####", "#   #", "#   #"],
  I: ["#####", "  #  ", "  #  ", "  #  ", "#####"], J: ["  ###", "    #", "    #", "#   #", " ### "],
  K: ["#   #", "#  # ", "###  ", "#  # ", "#   #"], L: ["#    ", "#    ", "#    ", "#    ", "#####"],
  M: ["#   #", "## ##", "# # #", "#   #", "#   #"], N: ["#   #", "##  #", "# # #", "#  ##", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", " ### "], P: ["#### ", "#   #", "#### ", "#    ", "#    "],
  Q: [" ### ", "#   #", "# # #", "#  # ", " ## #"], R: ["#### ", "#   #", "#### ", "#  # ", "#   #"],
  S: [" ####", "#    ", " ### ", "    #", "#### "], T: ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", " ### "], V: ["#   #", "#   #", "#   #", " # # ", "  #  "],
  W: ["#   #", "#   #", "# # #", "## ##", "#   #"], X: ["#   #", " # # ", "  #  ", " # # ", "#   #"],
  Y: ["#   #", " # # ", "  #  ", "  #  ", "  #  "], Z: ["#####", "   # ", "  #  ", " #   ", "#####"],
  " ": ["  ", "  ", "  ", "  ", "  "],
};

export function banner(word) {
  const glyphs = [...String(word).toUpperCase()].map((c) => {
    if (!FONT[c]) throw new Error(`banner font has no glyph for "${c}"`);
    return FONT[c];
  });
  return Array.from({ length: 5 }, (_, r) => glyphs.map((g) => g[r]).join(" ").replace(/\s+$/, ""));
}

// paint colored cells as spans built with createElement + textContent: rows = [[{ ch, cls }]]
export function paint(pre, rows) {
  pre.replaceChildren(...rows.flatMap((row, r) => [
    ...row.map(({ ch, cls }) => Object.assign(document.createElement("span"), { textContent: ch, className: cls || "" })),
    ...(r < rows.length - 1 ? [document.createTextNode("\n")] : []),
  ]));
}
