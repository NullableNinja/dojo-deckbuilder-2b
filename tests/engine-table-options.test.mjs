// Table options (definition.tableOptions) and the Weapon Hand limit (definition.equipment.weaponHands).
// Fixtures pick cards by canonical properties, never by name or id.
import assert from "node:assert/strict";
import test from "node:test";
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game } from "../engine/core.mjs";
import { replayGame, replayMatches } from "../engine/replay.mjs";
import { tableOption } from "../engine/table-options.mjs";

const data = await loadGameData();
const definition = data.definition;
const num = (value) => Number.parseInt(String(value ?? 0), 10) || 0;
const hands = (card) => num(card.stats?.Hands);
const oneHanded = data.cards.filter((card) => card.subtype === "Weapon" && hands(card) === 1);
const twoHanded = data.cards.filter((card) => card.subtype === "Weapon" && hands(card) === 2);
const gear = data.cards.find((card) => card.subtype === "Gear");
const restrictionCarrier = (value) => data.cards.find((card) => (data.cardEffectById.get(card.catalogId)?.effects ?? []).some((effect) => effect.trigger === "passive" && (effect.conditions ?? []).some((condition) => condition.kind === "equipmentRestriction" && condition.value === value)));
// A fighter whose own text does not forbid Weapons.
const armedFighter = data.cards.find((card) => card.cardType === "Character" && !(data.cardEffectById.get(card.catalogId)?.effects ?? []).some((effect) => effect.resolver === "character.cannotEquipWeapons"));
const starterAttack = data.cards.find((card) => card.cardType === "Starter" && card.details?.Type === "Attack" && card.zone === "High");
const plainDefense = data.cards.find((card) => card.cardType === "Starter" && card.details?.Type === "Defense" && card.zone === "Low");

function advanceTo(game, phase, seat = 0) {
  for (let step = 0; step < 500 && !(game.phase === phase && game.activePlayer === seat && !game.pendingChoice); step += 1) {
    game.advanceAutomaticEvents();
    if (game.pendingChoice) { game.resolveChoice(game.defaultChoice()); continue; }
    if (game.phase === phase && game.activePlayer === seat) break;
    game.applyAction({ type: "pass", playerId: game.activePlayer });
  }
  assert.equal(game.phase, phase);
  return game.players[seat];
}

function clash(table = {}, seed = 5) {
  return new Game(data, { seed, mode: "standard-clash", players: 2, characters: [armedFighter, armedFighter], table });
}

function equipDirectly(game, player, card) {
  const instance = game.cardInstance(card);
  player.played.push(instance); player.equipment.push(instance);
  return instance;
}

test("fixtures exist", () => {
  assert.ok(oneHanded.length >= 3 && twoHanded.length >= 1 && gear && armedFighter && starterAttack && plainDefense);
  assert.ok(restrictionCarrier("noTwoHandedWeapon"), "an equipment card carries the no-two-handed-Weapon restriction");
});

// ---- Options and defaults -------------------------------------------------------------

test("every table option is declared canonically with a label, default and description", () => {
  for (const id of ["tempo", "locations", "balancedMarket", "houseRules"]) {
    const option = tableOption(definition, id);
    assert.ok(option?.label && option.description && option.default !== undefined, `${id} is declared`);
  }
});

test("defaults reproduce the canonical declaration and are exposed and recorded", () => {
  const game = new Game(data, { seed: 3 });
  const declared = Object.fromEntries(definition.tableOptions.map((option) => [option.id, option.default]));
  assert.deepEqual(game.tableOptions, declared);
  assert.deepEqual(game.tableOptions, { tempo: true, locations: true, balancedMarket: false, houseRules: [] });
  assert.deepEqual(game.setup.table, game.tableOptions);
  assert.equal(game.definition, data.definition, "without house rules the canonical definition is used as is");
});

test("unknown options, unknown house rules and non-boolean switches are rejected", () => {
  assert.throws(() => new Game(data, { table: { tempoo: false } }), /Unknown table option/);
  assert.throws(() => new Game(data, { table: { houseRules: ["no-such-rule"] } }), /no engine variant/);
  const withVariant = new Set(tableOption(definition, "houseRules").variants.map((variant) => variant.id));
  const unsupported = data.rules.houseRules.find((rule) => !withVariant.has(rule.id));
  assert.throws(() => new Game(data, { table: { houseRules: [unsupported.id] } }), /no engine variant/);
  assert.throws(() => new Game(data, { table: { tempo: "no" } }), /true or false/);
});

test("house rules are de-duplicated into canonical order", () => {
  const ids = tableOption(definition, "houseRules").variants.map((variant) => variant.id);
  const game = new Game(data, { table: { houseRules: [...ids].reverse().concat(ids) } });
  assert.deepEqual(game.tableOptions.houseRules, ids);
});

// ---- Tempo --------------------------------------------------------------------------------

function firstAttackPower(table) {
  const game = clash(table);
  const [attacker, defender] = [advanceTo(game, "Yell"), game.players[1]];
  attacker.hand = [game.cardInstance(starterAttack)];
  defender.hand = [];
  attacker.speed = defender.speed + 1; // Tempo needs the faster fighter
  assert.ok(game.applyAction({ type: "play-attack", playerId: 0, cardId: attacker.hand[0].instanceId, targetId: 1 }));
  if (game.pendingChoice) game.resolveChoice({ optionId: "pass" });
  return { attack: game.events.findLast((event) => event.type === "attack").attack, attacker };
}

test("Tempo off: no fighter has Tempo, and the first Attack gets no Tempo bonus", () => {
  const on = firstAttackPower({});
  const off = firstAttackPower({ tempo: false });
  assert.equal(on.attack - off.attack, definition.turn.tempoAttackPower);
  assert.equal(off.attacker.tempo, false);
  const game = clash({ tempo: false });
  advanceTo(game, "Initiate");
  assert.ok(game.players.every((player) => player.tempo === false), "Honor does not refresh Tempo");
});

// ---- Locations ------------------------------------------------------------------------------

test("Locations off: no Location is in play and the scene never changes", () => {
  const game = new Game(data, { seed: 11, table: { locations: false } });
  assert.equal(game.currentLocation, null);
  const result = game.run({ maxSteps: 200000 });
  assert.equal(result.state.location, null);
  assert.equal(result.events.filter((event) => event.type === "scene-change").length, 0);
  assert.equal(result.invariantFailures.length, 0);
  const normal = new Game(data, { seed: 11 }).run({ maxSteps: 200000 });
  assert.ok(normal.events.filter((event) => event.type === "scene-change").length > 1, "Locations on keep changing scenes");
});

// ---- Market -----------------------------------------------------------------------------------

test("a balanced opening Market guarantees an affordable card of each declared kind", () => {
  const guarantees = tableOption(definition, "balancedMarket").whenOn.openingRowGuarantees;
  const matches = (card, kind) => kind === "Attack" ? num(card.stats?.["Attack Power"]) > 0 : kind === "Defense" ? card.subtype === "Defense" : card.subtype === kind;
  let unbalancedMisses = 0;
  for (let seed = 1; seed <= 25; seed += 1) {
    const game = new Game(data, { seed, table: { balancedMarket: true } });
    assert.equal(game.market.length, definition.economy.market.rowSize);
    for (const { kind, maxCost } of guarantees) assert.ok(game.market.some((card) => matches(card, kind) && num(card.fpCost) <= maxCost), `seed ${seed} offers an affordable ${kind}`);
    const plain = new Game(data, { seed });
    if (!guarantees.every(({ kind, maxCost }) => plain.market.some((card) => matches(card, kind) && num(card.fpCost) <= maxCost))) unbalancedMisses += 1;
  }
  assert.ok(unbalancedMisses > 0, "the unbalanced opening row sometimes misses a kind");
});

function endRoundAfterPurchase(table) {
  const game = new Game(data, { seed: 4, table });
  advanceTo(game, "Initiate", game.turnOrder[0]);
  const before = game.market.map((card) => card.instanceId);
  game.marketPurchasedThisRound = true;
  game.turnOrderPosition = game.turnOrder.length - 1; game.activePlayer = game.turnOrder.at(-1);
  game.finishTurn();
  return { before, after: game.market.map((card) => card.instanceId) };
}

test("Market Scramble refreshes the whole row every round; the default keeps a bought-from row", () => {
  const kept = endRoundAfterPurchase({});
  assert.deepEqual(kept.after, kept.before);
  const scrambled = endRoundAfterPurchase({ houseRules: ["market-scramble"] });
  assert.equal(scrambled.after.length, definition.economy.market.rowSize);
  assert.ok(!scrambled.after.some((id) => scrambled.before.includes(id)), "all seven cards are replaced");
});

// ---- Fast Belts ----------------------------------------------------------------------------------

test("Fast Belts lowers later Belt thresholds from canonical data without touching the shared definition", () => {
  const { fromBelt, reduceBy, minimumAbovePrevious } = tableOption(definition, "houseRules").variants.find((variant) => variant.id === "fast-belts").beltThresholds;
  const game = new Game(data, { seed: 1, table: { houseRules: ["fast-belts"] } });
  const canonical = definition.progression.belts.map((belt) => belt.xp);
  const effective = game.definition.progression.belts.map((belt) => belt.xp);
  const start = definition.progression.belts.findIndex((belt) => belt.name === fromBelt);
  assert.deepEqual(effective.slice(0, start), canonical.slice(0, start), "earlier thresholds are unchanged");
  for (let index = start; index < effective.length; index += 1) assert.equal(effective[index], Math.max(effective[index - 1] + minimumAbovePrevious, canonical[index] - reduceBy));
  assert.ok(effective.at(-1) < canonical.at(-1));
  assert.deepEqual(data.definition.progression.belts.map((belt) => belt.xp), canonical, "canonical data is not mutated");
  // Promotion reads the reduced threshold.
  const player = game.players[0];
  player.beltIndex = start - 1; player.xp = effective[start]; player.completedTasks.push(start);
  assert.equal(game.canPromote(player), effective[start] < canonical[start]);
});

// ---- Replays -----------------------------------------------------------------------------------------

test("Quick Duel results carry table options only when they differ, and replays reproduce them", () => {
  const plain = new Game(data, { seed: 7 }).run({ maxSteps: 200000 });
  assert.equal(plain.setup, undefined, "default Quick Duel output is unchanged");
  const table = { tempo: false, locations: false, balancedMarket: true, houseRules: ["market-scramble", "fast-belts"] };
  const original = new Game(data, { seed: 7, table }).run({ maxSteps: 200000 });
  assert.deepEqual(original.setup.table, table);
  assert.ok(replayMatches(original, replayGame(data, original)));
  const clashResult = clash(table, 8).run({ maxSteps: 200000 });
  assert.deepEqual(clashResult.setup.table, table);
  assert.ok(replayMatches(clashResult, replayGame(data, clashResult)));
});

// ---- Weapon Hands ----------------------------------------------------------------------------------------

test("a Weapon that fits is equipped normally, and Gear never uses a Hand", () => {
  const game = clash();
  const player = advanceTo(game, "Initiate");
  equipDirectly(game, player, oneHanded[0]);
  player.hand = [game.cardInstance(oneHanded[1]), game.cardInstance(gear)];
  const actions = game.getLegalActions(0).filter((action) => action.type === "play-card");
  assert.deepEqual(actions.map((action) => action.cardId), player.hand.map((card) => card.instanceId));
  assert.ok(actions.every((action) => !action.replaceCardIds));
  assert.equal(game.handsOccupied(player), 1);
  assert.equal(game.weaponHands(player.hand[1]), 0);
});

test("with both Hands full, a one-handed Weapon must replace one equipped Weapon, which is discarded", () => {
  const game = clash();
  const player = advanceTo(game, "Initiate");
  const [left, right] = [equipDirectly(game, player, oneHanded[0]), equipDirectly(game, player, oneHanded[1])];
  const incoming = game.cardInstance(oneHanded[2]);
  player.hand = [incoming];
  const actions = game.getLegalActions(0).filter((action) => action.type === "play-card");
  assert.deepEqual(actions.map((action) => action.replaceCardIds), [[left.instanceId], [right.instanceId]]);
  assert.equal(game.applyAction({ type: "play-card", playerId: 0, cardId: incoming.instanceId }), false, "equipping past the Hand limit without a replacement is illegal");
  assert.equal(game.playCard(player, incoming), false);
  assert.ok(game.applyAction(actions[1]));
  assert.deepEqual(player.equipment.map((card) => card.instanceId), [left.instanceId, incoming.instanceId]);
  assert.ok(player.discard.includes(right) && !player.played.includes(right));
  assert.ok(game.events.some((event) => event.type === "equipment-replaced" && event.card === right.catalogId));
  assert.equal(game.handsOccupied(player), definition.equipment.weaponHands.capacity);
});

test("a two-handed Weapon replaces every Weapon in the way; a one-handed Weapon replaces a two-handed one", () => {
  const game = clash();
  const player = advanceTo(game, "Initiate");
  const held = equipDirectly(game, player, oneHanded[0]);
  const big = game.cardInstance(twoHanded[0]);
  player.hand = [big];
  assert.deepEqual(game.equipActions(player).map((action) => action.replaceCardIds), [[held.instanceId]]);
  assert.ok(game.applyAction(game.equipActions(player)[0]));
  const small = game.cardInstance(oneHanded[1]);
  player.hand = [small];
  assert.deepEqual(game.equipActions(player).map((action) => action.replaceCardIds), [[big.instanceId]]);
});

test("a no-two-handed-Weapon restriction on equipped gear forbids two-handed Weapons", () => {
  const game = clash();
  const player = advanceTo(game, "Initiate");
  equipDirectly(game, player, restrictionCarrier("noTwoHandedWeapon"));
  player.hand = [game.cardInstance(twoHanded[0]), game.cardInstance(oneHanded[0])];
  assert.deepEqual(game.equipActions(player).map((action) => action.cardId), [player.hand[1].instanceId]);
});

test("whenFull: block makes an over-limit Weapon unequippable instead of replacing", () => {
  const blocking = { ...data, definition: { ...definition, equipment: { weaponHands: { ...definition.equipment.weaponHands, whenFull: "block" } } } };
  const game = new Game(blocking, { seed: 5, mode: "standard-clash", players: 2, characters: [armedFighter, armedFighter] });
  const player = advanceTo(game, "Initiate");
  equipDirectly(game, player, twoHanded[0]);
  player.hand = [game.cardInstance(oneHanded[0])];
  assert.deepEqual(game.equipActions(player), []);
});

test("equip effects offer replacement options and discard the replaced Weapon", () => {
  const game = clash();
  const player = advanceTo(game, "Initiate");
  const held = equipDirectly(game, player, twoHanded[0]);
  const incoming = game.cardInstance(oneHanded[0]);
  player.hand = [incoming, game.cardInstance(gear)];
  assert.ok(game.queueZoneChoice(player, { id: "test-equip" }, { zones: ["hand"], operation: "equip-from-hand" }));
  const replacing = game.pendingChoice.options.find((option) => option.cardId === incoming.instanceId);
  assert.deepEqual(replacing.replaceCardIds, [held.instanceId]);
  assert.ok(game.resolveChoice({ optionId: replacing.id }));
  assert.ok(player.equipment.includes(incoming) && player.discard.includes(held));
});

test("Steal the Belt: a KO of an opposing fighter at your Belt or higher completes your current task", () => {
  const game = new Game(data, { seed: 21, mode: "standard-clash", players: 3, table: { houseRules: ["steal-the-belt"] } });
  const [hero, victim] = game.players;
  victim.beltIndex = hero.beltIndex;
  victim.lastDamagedBy = hero.id; victim.hp = 0;
  const taskBefore = hero.completedTasks.length;
  game.processKnockouts();
  assert.equal(hero.completedTasks.length, taskBefore + 1);
  const plain = new Game(data, { seed: 21, mode: "standard-clash", players: 3 });
  const [other, target] = plain.players;
  target.lastDamagedBy = other.id; target.hp = 0;
  const before = other.completedTasks.length;
  plain.processKnockouts();
  assert.equal(other.completedTasks.length, before, "off by default");
});

test("Friendly Fire: an ally may be attacked once per round, for no rewards", () => {
  const game = new Game(data, { seed: 22, mode: "tag-team", teams: [[0, 2], [1, 3]], table: { houseRules: ["friendly-fire"] } });
  const [attacker, , ally] = game.players;
  assert.ok(game.isLegalTarget(attacker, ally), "allies are targetable with Friendly Fire");
  attacker.alliedAttacksThisRound = 1;
  assert.ok(!game.isLegalTarget(attacker, ally), "once per round");
  const plain = new Game(data, { seed: 22, mode: "tag-team", teams: [[0, 2], [1, 3]] });
  assert.ok(!plain.isLegalTarget(plain.players[0], plain.players[2]), "off by default");
  assert.equal(plain.defaultTargetId(0) % 2, 1, "default targeting never picks an ally");
});
