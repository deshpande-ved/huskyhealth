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
    background_color: "#191724",
    theme_color: "#191724",
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
