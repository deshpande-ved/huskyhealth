#!/usr/bin/env node
// The website's API page (web/api.html) Methods page (web/index.html #references) and Privacy page (#privacy), as data for the iPhone app,
// so the app shows the same pages inside the app, word for word. tests/app-pages.test.js fails if
// mobile/src/content/pages.json no longer matches the HTML; run `node scripts/build-app-pages.mjs` after editing
// either page.
//
// Blocks: { t: "h2" | "h3" | "pre", text } · { t: "p", cls, runs } · { t: "ol", items: [runs] }
//         { t: "table", head: [runs], rows: [[runs]] } · { t: "card", id, title, paras: [runs] }
// Runs:   [{ text, b?, code?, href?, muted?, status? }]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${ROOT}mobile/src/content/pages.json`;

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', rarr: "→", larr: "←", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–", nbsp: " " };
const decode = (s) => s.replace(/&(#\d+|[a-z]+);/g, (m, e) => (e[0] === "#" ? String.fromCodePoint(Number(e.slice(1))) : ENT[e] ?? m));

// HTML -> a small tree: { tag, attrs, kids } and strings. Enough for these two hand-written pages.
function parse(html) {
  const root = { tag: "root", attrs: {}, kids: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-z0-9]+)([^>]*?)(\/?)>|([^<]+)/gi;
  for (const m of html.matchAll(re)) {
    const top = stack[stack.length - 1];
    if (m[5] != null) { top.kids.push(decode(m[5])); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) { while (stack.length > 1 && stack.pop().tag !== tag); continue; }
    const attrs = Object.fromEntries([...m[3].matchAll(/([a-z-]+)="([^"]*)"/gi)].map((a) => [a[1], decode(a[2])]));
    const node = { tag, attrs, kids: [] };
    top.kids.push(node);
    if (!m[4] && !["br", "img", "input", "meta", "link"].includes(tag)) stack.push(node);
  }
  return root;
}

const textOf = (n) => (typeof n === "string" ? n : n.kids.map(textOf).join(""));
const squash = (s) => s.replace(/\s+/g, " ");

// Inline content -> runs, whitespace collapsed like a browser does.
function runs(node, style = {}) {
  const out = [];
  for (const k of node.kids) {
    if (typeof k === "string") { out.push({ text: k, ...style }); continue; }
    const cls = k.attrs.class || "";
    const s = { ...style };
    if (k.tag === "b" || k.tag === "strong") s.b = true;
    if (k.tag === "code") s.code = true;
    if (k.tag === "a") s.href = k.attrs.href;
    if (cls.includes("muted")) s.muted = true;
    if (cls.includes("status")) s.status = true;
    out.push(...runs(k, s));
  }
  return out;
}
function tidy(rs) {
  const merged = [];
  for (const r of rs.map((r) => ({ ...r, text: squash(r.text) }))) {
    const prev = merged[merged.length - 1];
    const same = prev && JSON.stringify({ ...prev, text: 0 }) === JSON.stringify({ ...r, text: 0 });
    if (same) prev.text += r.text; else merged.push(r);
  }
  if (merged.length) { merged[0].text = merged[0].text.trimStart(); merged[merged.length - 1].text = merged[merged.length - 1].text.trimEnd(); }
  return merged.filter((r) => r.text);
}
const find = (n, pred) => {
  if (typeof n === "string") return null;
  if (pred(n)) return n;
  for (const k of n.kids) { const f = find(k, pred); if (f) return f; }
  return null;
};
const all = (n, pred, out = []) => { if (typeof n !== "string") { if (pred(n)) out.push(n); n.kids.forEach((k) => all(k, pred, out)); } return out; };

function blocks(section) {
  const out = [];
  const walk = (n) => {
    if (typeof n === "string") return;
    const cls = n.attrs.class || "";
    if (n.tag === "h2" || n.tag === "h3") return void out.push({ t: n.tag, text: squash(textOf(n)).trim() });
    if (n.tag === "p" && !cls.includes("back")) return void out.push({ t: "p", cls: cls.split(" ").find((c) => ["lede", "note"].includes(c)) || "", runs: tidy(runs(n)) });
    if (n.tag === "pre") return void out.push({ t: "pre", text: textOf(n).replace(/^\n+|\s+$/g, "") });
    if (n.tag === "ol") return void out.push({ t: "ol", items: all(n, (x) => x.tag === "li").map((li) => tidy(runs(li))) });
    if (n.tag === "table") {
      return void out.push({ t: "table", head: all(n, (x) => x.tag === "th").map((th) => tidy(runs(th))),
        rows: all(n, (x) => x.tag === "tr").filter((tr) => all(tr, (x) => x.tag === "td").length).map((tr) => all(tr, (x) => x.tag === "td").map((td) => tidy(runs(td)))) });
    }
    if (n.tag === "article" && cls.includes("card")) {
      const h = find(n, (x) => x.tag === "h3");
      return void out.push({ t: "card", id: n.attrs.id, title: squash(textOf(h)).trim(), paras: all(n, (x) => x.tag === "p").map((p) => tidy(runs(p))) });
    }
    n.kids.forEach(walk);
  };
  walk(section);
  return out;
}

export function buildPages() {
  const api = parse(readFileSync(`${ROOT}web/api.html`, "utf8"));
  const index = parse(readFileSync(`${ROOT}web/index.html`, "utf8"));
  const apiSection = find(api, (n) => n.tag === "main");
  const refs = find(index, (n) => n.attrs.id === "references");
  const privacy = find(index, (n) => n.attrs.id === "privacy");
  return { api: blocks(apiSection), methods: blocks(refs), privacy: blocks(privacy) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, `${JSON.stringify(buildPages(), null, 1)}\n`);
  console.log(`wrote ${OUT.replace(ROOT, "")}`);
}
