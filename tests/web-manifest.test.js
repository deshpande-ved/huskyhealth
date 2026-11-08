// E01S02: manifest and placeholder icons.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../web/${p}`, import.meta.url));

test("manifest matches the plan", () => {
  assert.deepEqual(JSON.parse(read("manifest.webmanifest").toString("utf8")), {
    name: "HuskyHealth",
    short_name: "HuskyHealth",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3efe3",
    theme_color: "#f3efe3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  });
});

function ihdr(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "PNG signature");
  assert.equal(buf.subarray(12, 16).toString("ascii"), "IHDR");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colorType: buf[25] };
}

for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512]]) {
  test(`${name} is a ${size}x${size} PNG`, () => {
    const { w, h } = ihdr(read(`icons/${name}`));
    assert.equal(w, size);
    assert.equal(h, size);
  });
}

test("apple-touch-icon is an opaque 180x180 PNG", () => {
  const { w, h, colorType } = ihdr(read("icons/apple-touch-icon.png"));
  assert.equal(w, 180);
  assert.equal(h, 180);
  assert.ok(colorType === 2 || colorType === 0, `colour type ${colorType} has alpha`);
});

// Tab icons (favicon set, like vedsite): linked from index.html, files present and valid.
test("favicon set is linked and valid", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  for (const tag of ['<link rel="icon" href="/favicon.ico" sizes="48x48">',
                     '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
                     '<link rel="icon" href="/icons/favicon-96x96.png" type="image/png" sizes="96x96">']) {
    assert.ok(html.includes(tag), tag);
  }
  const ico = read("favicon.ico");
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 3]);
  assert.deepEqual([0, 1, 2].map((i) => ico[6 + i * 16]), [16, 32, 48]);
  const svg = read("favicon.svg").toString("utf8");
  assert.ok(svg.startsWith("<svg") && !/<script|https?:\/\/(?!www\.w3\.org)/.test(svg));
  const { w, h } = ihdr(read("icons/favicon-96x96.png"));
  assert.deepEqual([w, h], [96, 96]);
});

// Header logo: the husky cropped to itself (scripts/make_icons.py), bright in dark mode; fixed square viewBox.
test("header logo is the fixed-viewBox ASCII husky SVG", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  assert.ok(html.includes(`<a class="mark-link" href="#today" aria-label="HuskyHealth, today"><picture><source srcset="/art/husky-bright.svg" media="(prefers-color-scheme: dark)"><img id="mark" src="/art/husky-mark.svg" alt="" width="72" height="72"></picture></a>`));
  for (const f of ["art/husky-mark.svg", "art/husky-bright.svg"]) {
    const svg = read(f).toString("utf8");
    assert.match(svg, /^<svg [^>]*viewBox="0 0 512 512"/);
    assert.ok(!/<script|<rect/.test(svg));   // transparent background, no script
  }
  const css = readFileSync(new URL("../web/css/style.css", import.meta.url), "utf8");
  assert.match(css, /#mark \{[^}]*aspect-ratio: 1 \/ 1;[^}]*object-fit: contain;/);
});
