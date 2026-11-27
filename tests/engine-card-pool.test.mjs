// The cardPool table option: a table plays only with the cards its seated players own
// (the shared-pool model of docs/packs-and-progression-plan.md). Fixtures come from
// content/packs.json and card properties, never from a card name or id.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game } from "../engine/core.mjs";
import { BossBlitzGame } from "../engine/boss-blitz.mjs";
import { replayGame, replayMatches } from "../engine/replay.mjs";
import { createEconomy } from "../engine/collection.mjs";
import { pooledDecks } from "../engine/table-options.mjs";
import { EngineSession } from "../app/engine-session.ts";

const data = await loadGameData();
const packs = JSON.parse(readFileSync(new URL("../content/packs.json", import.meta.url), "utf8"));
const economy = createEconomy(packs, data.cards);
const recruit = economy.newCareer({ profileId: "pool-test", createdAt: "2026-11-27T00:00:00Z", rngSeed: 99 });
const recruitPool = economy.resolveMatchPool([economy.manifest(recruit)]);
const poolSet = new Set(recruitPool);
const pooled = new Set(pooledDecks(data.definition));
const fighters = data.cards.filter((card) => card.cardType === "Character");
const allIds = (cards) => cards.map((card) => card.catalogId);
const tableCards = (game) => [...game.market, ...game.marketDeck, ...game.comboDeck, ...game.locationDeck, ...(game.currentLocation ? [game.currentLocation] : [])];

test("the cardPool option is declared canonically and pools the collectible decks plus Boss Profiles", () => {
  const option = data.definition.tableOptions.find((entry) => entry.id === "cardPool");
  assert.equal(option.default, null);
  for (const deck of packs.collection.collectibleDecks) assert.ok(pooled.has(deck), `${deck} is pooled`);
  assert.ok(pooled.has(packs.unlockables.bosses.deck));
});

test("without a pool the setup and the game are exactly as before", () => {
  const plain = new Game(data, { seed: 12, mode: "standard-clash", players: 2 });
  const explicitNull = new Game(data, { seed: 12, mode: "standard-clash", players: 2, table: { cardPool: null } });
  assert.equal("cardPool" in plain.setup.table, false);
  assert.deepEqual(explicitNull.setup, plain.setup);
  assert.deepEqual(allIds(explicitNull.marketDeck), allIds(plain.marketDeck));
});

test("a pool builds the Market, Combo and Location decks only from pooled cards", () => {
  const game = new Game(data, { seed: 4, mode: "standard-clash", players: 2, table: { cardPool: recruitPool } });
  const cards = tableCards(game);
  assert.ok(cards.length > 0);
  for (const card of cards) assert.ok(!pooled.has(card.deck) || poolSet.has(card.catalogId), `${card.catalogId} is in the pool`);
  const ownedCombos = recruitPool.filter((id) => data.byId.get(id)?.deck === "Combo Deck");
  assert.equal(game.comboDeck.length, ownedCombos.length);
  assert.equal(game.market.length, data.definition.economy.market.rowSize);
});

test("the pool is recorded sorted and de-duplicated, so arrival order never matters", () => {
  const shuffled = [...recruitPool].reverse().concat(recruitPool.slice(0, 5));
  const left = new Game(data, { seed: 8, mode: "standard-clash", players: 2, table: { cardPool: shuffled } });
  const right = new Game(data, { seed: 8, mode: "standard-clash", players: 2, table: { cardPool: recruitPool } });
  assert.deepEqual(left.setup.table.cardPool, [...recruitPool].sort());
  assert.deepEqual(allIds(left.marketDeck), allIds(right.marketDeck));
});

test("a pool must name real cards and still fill the Market row", () => {
  assert.throws(() => new Game(data, { table: { cardPool: ["NOT-A-CARD-001"] } }), /unknown card/);
  const tooThin = recruitPool.filter((id) => data.byId.get(id)?.deck === "Combo Deck");
  assert.throws(() => new Game(data, { table: { cardPool: tooThin } }), /Market row needs/);
  assert.throws(() => new Game(data, { table: { cardPool: "everything" } }), /array of Catalog IDs/);
});

test("Boss Blitz draws its ladder only from pooled Boss Profiles", () => {
  const starting = new Set(packs.unlockables.bosses.starting.map((entry) => entry.catalogId));
  for (let seed = 1; seed <= 12; seed += 1) {
    const game = new BossBlitzGame(data, { seed, players: 1, rosters: [allIds(fighters.slice(0, 3))], table: { cardPool: recruitPool } });
    for (const profile of game.setup.bossProfiles) assert.ok(starting.has(profile), `${profile} is a starting Boss`);
  }
  const noBosses = recruitPool.filter((id) => data.byId.get(id)?.deck !== packs.unlockables.bosses.deck);
  assert.throws(() => new BossBlitzGame(data, { seed: 1, players: 1, rosters: [allIds(fighters.slice(0, 3))], table: { cardPool: noBosses } }), /no Boss Profile/);
});

test("results carry the pool and replays reproduce the pooled game", () => {
  const quick = new Game(data, { seed: 17, table: { cardPool: recruitPool } }).run({ maxSteps: 200000 });
  assert.deepEqual(quick.setup.table.cardPool, recruitPool);
  assert.ok(replayMatches(quick, replayGame(data, quick)));
  const clash = new Game(data, { seed: 23, mode: "standard-clash", players: 3, table: { cardPool: recruitPool } }).run({ maxSteps: 200000 });
  assert.ok(replayMatches(clash, replayGame(data, clash)));
});

test("an EngineSession records the collection pool in its setup, and save/restore replays it", () => {
  const original = EngineSession.cardPoolSource;
  EngineSession.cardPoolSource = () => recruitPool;
  try {
    const session = new EngineSession({ mode: "quick-duel", seed: 31, fighters: [fighters[0].catalogId, fighters[1].catalogId], humanSeats: [], rulesVersion: "test" });
    assert.deepEqual(session.setup.table.cardPool, recruitPool);
    for (let beat = 0; beat < 40 && !session.over; beat += 1) session.stepBots();
    const saved = JSON.parse(JSON.stringify(session.save()));
    EngineSession.cardPoolSource = () => null; // the collection changed (or Open Dojo) after the save
    const restored = EngineSession.restore(saved);
    assert.ok(restored);
    assert.deepEqual(restored.setup.table.cardPool, recruitPool);
    assert.deepEqual(allIds(restored.game.market), allIds(session.game.market));
    assert.equal(restored.game.round, session.game.round);
    for (const card of tableCards(restored.game)) assert.ok(!pooled.has(card.deck) || poolSet.has(card.catalogId));
  } finally {
    EngineSession.cardPoolSource = original;
  }
});

test("Open Dojo (no pool from the source) plays the full catalog, and old saves without a pool restore unchanged", () => {
  const original = EngineSession.cardPoolSource;
  EngineSession.cardPoolSource = () => null;
  try {
    const session = new EngineSession({ mode: "quick-duel", seed: 5, fighters: [fighters[2].catalogId, fighters[3].catalogId], humanSeats: [], rulesVersion: "test" });
    assert.equal(session.setup.table, undefined);
    EngineSession.cardPoolSource = () => recruitPool;
    const restored = EngineSession.restore(JSON.parse(JSON.stringify(session.save())));
    assert.deepEqual(allIds(restored.game.marketDeck), allIds(session.game.marketDeck));
  } finally {
    EngineSession.cardPoolSource = original;
  }
});
