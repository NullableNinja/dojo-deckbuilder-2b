// content/packs.json (collection / booster / Clearance Level proposal) stays valid against the catalog.
import assert from "node:assert/strict";
import test from "node:test";
import { checkPacks, loadPackInputs, validateSchema } from "../scripts/check-packs.mjs";

const canonical = loadPackInputs();
const fresh = () => structuredClone(canonical);
const errorsOf = (inputs) => checkPacks(inputs).errors;
const assertFlags = (inputs, pattern) => {
  const errors = errorsOf(inputs);
  assert.ok(errors.some((error) => pattern.test(error)), `expected an error matching ${pattern}, got:\n${errors.join("\n") || "(none)"}`);
};
const pack = (inputs, id) => inputs.packs.packs.find((candidate) => candidate.id === id);
const firstBooster = (inputs) => inputs.packs.packs.find((candidate) => candidate.kind === "booster");

test("the canonical packs proposal passes every check", () => {
  assert.deepEqual(errorsOf(fresh()), []);
});

test("every collectible card is assigned to exactly one pack", () => {
  const { packs, cards } = fresh();
  const collectible = cards.filter((card) => packs.collection.collectibleDecks.includes(card.deck)).map((card) => card.catalogId).sort();
  const assigned = packs.packs.flatMap((candidate) => candidate.cards.map((entry) => entry.catalogId)).sort();
  assert.deepEqual(assigned, collectible);
  assert.equal(packs.status, "approved");
});

test("a card assigned twice is reported", () => {
  const inputs = fresh();
  firstBooster(inputs).cards.push({ ...pack(inputs, "orientation").cards[0] });
  assertFlags(inputs, /assigned more than once/);
});

test("an unassigned collectible card is reported", () => {
  const inputs = fresh();
  firstBooster(inputs).cards.pop();
  assertFlags(inputs, /is collectible but in no pack/);
});

test("unknown Catalog IDs, renamed cards and non-collectible cards are reported", () => {
  const unknown = fresh();
  firstBooster(unknown).cards[0].catalogId = "DDB-ATK-CORE-999";
  assertFlags(unknown, /DDB-ATK-CORE-999 is not in content\/cards.json/);

  const renamed = fresh();
  firstBooster(renamed).cards[0].name = "Not The Printed Name";
  assertFlags(renamed, /is named ".*" in cards.json/);

  const starterCard = fresh();
  firstBooster(starterCard).cards.push({ catalogId: "DDB-STA-CORE-002", name: "Basic Body Kick" });
  assertFlags(starterCard, /which is not collectible/);
});

test("packs carry no rarity, and every booster holds at least one pack", () => {
  const rarity = fresh();
  firstBooster(rarity).cards[0].rarity = "common";
  assertFlags(rarity, /unexpected property "rarity"/);

  const tiny = fresh();
  firstBooster(tiny).cards.splice(4);
  assertFlags(tiny, /fewer than one pack of 5/);
});

test("every Character and Boss Profile starts available or is unlocked exactly once", () => {
  const { packs, cards } = fresh();
  const rewards = [...packs.levelTrack.levels.flatMap((level) => level.rewards), ...packs.packs.map((candidate) => candidate.completionReward).filter(Boolean)];
  for (const [kind, rewardKind] of [["characters", "unlock-character"], ["bosses", "unlock-boss"]]) {
    const { deck, starting } = packs.unlockables[kind];
    const available = [...starting.map((ref) => ref.catalogId), ...rewards.filter((reward) => reward.kind === rewardKind).map((reward) => reward.catalogId)].sort();
    assert.deepEqual(available, cards.filter((card) => card.deck === deck).map((card) => card.catalogId).sort(), kind);
  }

  const forgotten = fresh();
  for (const level of forgotten.packs.levelTrack.levels) level.rewards = level.rewards.filter((reward) => reward.catalogId !== "DDB-CHR-CORE-024");
  assertFlags(forgotten, /DDB-CHR-CORE-024 \(Master Mimen\) is neither starting nor unlocked/);

  const twice = fresh();
  twice.packs.levelTrack.levels[1].rewards.push({ kind: "unlock-boss", catalogId: "DDB-BPR-CORE-002", name: "Captain Cone, Prophet of the Double-Parked Path" });
  assertFlags(twice, /DDB-BPR-CORE-002 is made available more than once/);

  const wrongDeck = fresh();
  wrongDeck.packs.levelTrack.levels[1].rewards.push({ kind: "unlock-character", catalogId: "DDB-BPR-CORE-001", name: "Archive of Practical Fighting Wisdom, Now Upright" });
  assertFlags(wrongDeck, /is in Boss Profile Deck, not Character Deck/);
});

test("the starting roster covers every mode", () => {
  const fewFighters = fresh();
  fewFighters.packs.unlockables.characters.starting.splice(2);
  assertFlags(fewFighters, /only 2 starting Characters; the largest roster needs 3/);

  const noFinalBoss = fresh();
  const byId = new Map(noFinalBoss.cards.map((card) => [card.catalogId, card]));
  noFinalBoss.packs.unlockables.bosses.starting = noFinalBoss.packs.unlockables.bosses.starting.filter((ref) => !byId.get(ref.catalogId).tags.includes("Final Boss"));
  assertFlags(noFinalBoss, /cannot field a different starting Boss Profile for every stage/);
});

test("unlockEverything is the single switch that turns packs and unlocks off", () => {
  const open = fresh();
  open.packs.unlockEverything = true;
  firstBooster(open).cards.pop();
  for (const level of open.packs.levelTrack.levels) level.rewards = level.rewards.filter((reward) => reward.kind !== "unlock-character" && reward.kind !== "unlock-boss");
  for (const candidate of open.packs.packs) delete candidate.completionReward;
  assert.deepEqual(errorsOf(open), []);
});

test("the starter pool must play a full game and its Combos must be completable", () => {
  const noLowAttack = fresh();
  const orientation = pack(noLowAttack, "orientation");
  const byId = new Map(noLowAttack.cards.map((card) => [card.catalogId, card]));
  const coversLow = (entry) => byId.get(entry.catalogId).subtype === "Attack" && /Low|Any/.test(byId.get(entry.catalogId).zone);
  orientation.cards = orientation.cards.filter((entry) => !coversLow(entry));
  assertFlags(noLowAttack, /no Low Attack/);

  const deadCombo = fresh();
  const comboEntry = pack(deadCombo, "orientation").cards.find((entry) => entry.catalogId.startsWith("DDB-CMB"));
  deadCombo.comboRequirements[comboEntry.catalogId] = { requirements: [{ kind: "currentCardMatches", family: "Attack", tags: ["No Such Tag"] }] };
  assertFlags(deadCombo, new RegExp(`Combo ${comboEntry.catalogId} .* is guaranteed to have matches it`));
});

test("the level track and earn rules reference real modes, belts, currencies and boosters", () => {
  const merit = fresh();
  merit.packs.levelTrack.levels[3].meritTotal = merit.packs.levelTrack.levels[2].meritTotal;
  assertFlags(merit, /level 4 meritTotal must be greater/);

  const belt = fresh();
  belt.packs.levelTrack.diplomas[1].belt = "plaid";
  assertFlags(belt, /unknown belt "plaid"/);

  const mode = fresh();
  mode.packs.earnRules.modes[0].mode = "arm-wrestling";
  assertFlags(mode, /unknown mode "arm-wrestling"/);

  const currency = fresh();
  currency.packs.earnRules.matchResults.win = { doubloons: 1 };
  assertFlags(currency, /unknown currency "doubloons"/);

  const neverUnlocked = fresh();
  for (const level of neverUnlocked.packs.levelTrack.levels) level.rewards = level.rewards.filter((reward) => reward.pack !== "iron-wall");
  assertFlags(neverUnlocked, /booster "iron-wall" is unlocked 0 times/);
});

test("the schema rejects unknown properties and the checker rejects unknown schema keywords", () => {
  const extra = fresh();
  extra.packs.packs[0].setSymbol = "star";
  assertFlags(extra, /unexpected property "setSymbol"/);
  assert.match(validateSchema(1, { type: "integer", oneOf: [] }).join("\n"), /unsupported keyword "oneOf"/);
});
