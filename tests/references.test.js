// E04S03: References page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const card = (id) => { const i = html.indexOf(`id="${id}"`); return html.slice(i, html.indexOf("</article>", i)); };
const STATUS = { "zone-minutes": "published", trimp: "published", srpe: "published", "fitness-fatigue": "published",
  monotony: "published", readiness: "adapted", "data-check": "published", baseline: "ours", "load-spike": "disputed",
  "vo2-trend": "descriptive", "sport-view": "ours", "load-call": "disputed", sleep: "descriptive" };

test("exactly 13 cards with the right ids", () => {
  assert.equal((html.match(/id="ref-/g) || []).length, 13);
  for (const id of Object.keys(STATUS)) assert.ok(html.includes(`id="ref-${id}"`), id);
});

test("each card: measures, formula, source, status", () => {
  for (const [id, st] of Object.entries(STATUS)) {
    const c = card(`ref-${id}`);
    assert.ok(c.includes("Measures:") && c.includes("Formula:") && c.includes("Source:"), id);
    assert.ok(c.includes(`<span class="status">${st}</span>`), `${id} ${st}`);
  }
  assert.ok(card("ref-load-spike").includes("info only"));
});

test("footer says training insight, not medical advice", () => {
  assert.ok(html.includes("Training insight, not medical advice"));
});

test("wording rules", () => {
  assert.ok(!/injury risk|diagnos|treat(s|ment)?\b|anonymous|anonymi[sz]/i.test(html));
  assert.equal((html.match(/medical advice/gi) || []).length, 1);
});

test("every published, adapted or disputed method links to its original paper or book", () => {
  const cards = [...html.matchAll(/<article id="(ref-[a-z0-9-]+)" class="card">([\s\S]*?)<\/article>/g)];
  for (const [, id, body] of cards) {
    const status = (body.match(/<span class="status">([a-z]+)<\/span>/) || [])[1];
    if (!["published", "adapted", "disputed"].includes(status)) continue;
    const source = body.match(/<p>Source:([\s\S]*?)<\/p>/)[1];
    assert.match(source, /<a href="https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov|openlibrary\.org)\/[^"]+" target="_blank" rel="noopener">/, id);
  }
});
