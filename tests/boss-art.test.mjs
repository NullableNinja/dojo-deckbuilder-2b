// Every Boss Profile has a standee cutout (scripts/make-boss-cutouts.py or hand-drawn), so the mat never
// falls back to showing a printed card in the Boss's place.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const cards = JSON.parse(readFileSync(new URL("../app/data/cards.json", import.meta.url), "utf8")).cards;
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

test("each Boss Profile has a fighter cutout named after it", () => {
  const bosses = cards.filter((card) => card.catalogId.startsWith("DDB-BPR-"));
  assert.ok(bosses.length >= 10);
  const missing = bosses.filter((card) => !existsSync(new URL(`../app/assets/fighters/${slug(card.name)}.webp`, import.meta.url))).map((card) => card.name);
  assert.deepEqual(missing, []);
});
