// Reversal window and rich combat records (rules Ch. 8 "Reversal", glossary "Reversal").
// Fixtures pick cards by canonical properties and structured effects, never by name or ID.
import assert from "node:assert/strict";
import test from "node:test";
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game } from "../engine/core.mjs";

const data = await loadGameData();
const starter = (type, zone) => data.cards.find((card) => card.cardType === "Starter" && card.details?.Type === type && card.zone === zone);
const highAttack = starter("Attack", "High");
const lowAttack = starter("Attack", "Low");
const highGuard = starter("Defense", "High");
const anyGuard = starter("Defense", "Any");
const withEffect = (predicate) => data.cards.find((card) => (data.cardEffectById.get(card.catalogId)?.effects ?? []).some(predicate));
const reversalBonusDefense = withEffect((effect) => effect.trigger === "onBlock" && effect.resolver === "defense.reversalBonus");
const reversalOnlyAttack = withEffect((effect) => effect.trigger === "onAttackDeclared" && (effect.conditions ?? []).some((condition) => condition.kind === "playedAsReversal" && condition.value === true));
const reversalBonusOf = (card) => data.cardEffectById.get(card.catalogId).effects.find((effect) => effect.resolver === "defense.reversalBonus").amount;
const reversalOnlyPowerOf = (card) => data.cardEffectById.get(card.catalogId).effects.find((effect) => (effect.conditions ?? []).some((condition) => condition.kind === "playedAsReversal")).amount;
const sum = (parts) => parts.reduce((total, part) => total + part.value, 0);

/** A two-player game at player 0's Yell with chosen hands and neutral combat stats. */
function yellWith(attackerHand, defenderHand, { mode = "standard-clash" } = {}) {
  const game = new Game(data, { seed: 5, mode, players: 2 });
  while (!(game.phase === "Yell" && game.activePlayer === 0)) {
    game.advanceAutomaticEvents();
    if (game.pendingChoice) { game.resolveChoice(game.defaultChoice()); continue; }
    if (game.phase === "Yell" && game.activePlayer === 0) break;
    game.applyAction({ type: "pass", playerId: game.activePlayer });
  }
  game.currentLocation = null;
  for (const [player, hand] of [[game.players[0], attackerHand], [game.players[1], defenderHand]]) {
    player.hand = hand.map((card) => game.cardInstance(card));
    Object.assign(player, { atk: 0, def: 2, tempo: false, nextAttackPower: 0, nextAttackFlow: false, statuses: [], equipment: [], exhaustedEquipment: [], hp: 20, maxHp: 20, reversalUsedThisRound: false });
  }
  return { game, attacker: game.players[0], defender: game.players[1] };
}

/** Player 0 attacks with its first card; player 1 answers with `defense` (a card or null). */
function strike(game, defense) {
  assert.ok(game.applyAction({ type: "play-attack", playerId: 0, cardId: game.players[0].hand[0].instanceId, targetId: 1 }));
  assert.equal(game.pendingChoice.kind, "defense");
  assert.ok(game.resolveChoice({ optionId: defense ? defense.instanceId : "pass" }));
}

const lastAttack = (game) => game.events.filter((event) => event.type === "attack").at(-1);

test("fixtures exist", () => {
  assert.ok(highAttack && lowAttack && highGuard && anyGuard && reversalBonusDefense && reversalOnlyAttack);
});

test("a Block with a played Defense opens a Reversal window offering the defender's Attacks", () => {
  const { game, defender } = yellWith([highAttack], [highGuard, lowAttack, anyGuard]);
  const [guardCard, counter] = defender.hand;
  strike(game, guardCard);
  assert.equal(lastAttack(game).damage, 0);
  assert.deepEqual(game.pendingChoice, {
    kind: "reversal", playerId: 1, attackerId: 0, zone: "High",
    options: [{ id: "pass", label: "Decline the Reversal" }, { id: counter.instanceId, label: counter.name }],
  });
  assert.equal(game.getLegalActions(0)[0].choiceId, "reversal");
});

test("a Hit or a block by standing DEF alone opens no Reversal window", () => {
  const hit = yellWith([highAttack], [lowAttack]);
  hit.defender.def = 0;
  strike(hit.game, null);
  assert.ok(lastAttack(hit.game).damage > 0);
  assert.equal(hit.game.pendingChoice, null);

  const standing = yellWith([highAttack], [lowAttack]);
  standing.defender.def = 9;
  strike(standing.game, null);
  assert.equal(lastAttack(standing.game).damage, 0);
  assert.equal(standing.game.pendingChoice, null, "no Defense card was played");
});

test("a Reversal resolves against the original attacker, who may defend; no Focus, no turn count", () => {
  const { game, attacker, defender } = yellWith([highAttack, highGuard], [highGuard, lowAttack]);
  const counter = defender.hand[1];
  strike(game, defender.hand[0]);
  const focusBefore = defender.focus; const attackCountBefore = defender.attackCount;
  assert.ok(game.resolveChoice({ optionId: counter.instanceId }));
  assert.equal(game.pendingChoice.kind, "defense");
  assert.equal(game.pendingChoice.playerId, attacker.id, "the original attacker answers the Reversal");
  assert.equal(game.pendingChoice.reversal, true);
  assert.equal(game.pendingChoice.zone, "Low");
  assert.ok(game.resolveChoice({ optionId: "pass" }));
  const event = lastAttack(game);
  assert.equal(event.attacker, defender.id);
  assert.equal(event.defender, attacker.id);
  assert.equal(event.reversal, true);
  assert.equal(event.zone, "Low");
  assert.equal(defender.focus, focusBefore, "a Reversal generates no Focus");
  assert.equal(defender.attackCount, attackCountBefore, "a Reversal is not an Attack in its owner's turn");
  assert.equal(defender.reversalUsedThisRound, true);
  assert.equal(game.activePlayer, attacker.id, "play returns to the attacker's turn");
  assert.equal(game.pendingChoice, null);
});

test("a Reversal that is Blocked cannot trigger another Reversal", () => {
  const { game, attacker, defender } = yellWith([highAttack, anyGuard, highAttack], [highGuard, lowAttack]);
  strike(game, defender.hand[0]);
  game.resolveChoice({ optionId: defender.hand[0].instanceId });
  attacker.def = 9;
  game.resolveChoice({ optionId: attacker.hand.find((card) => card.catalogId === anyGuard.catalogId).instanceId });
  assert.equal(lastAttack(game).damage, 0);
  assert.equal(lastAttack(game).reversal, true);
  assert.equal(game.pendingChoice, null);
});

test("Reversals are once per round and the limit resets at the end of the round", () => {
  const { game, attacker, defender } = yellWith([highAttack, highAttack], [highGuard, highGuard, lowAttack, lowAttack]);
  strike(game, defender.hand[0]);
  game.resolveChoice({ optionId: defender.hand.find((card) => card.catalogId === lowAttack.catalogId).instanceId });
  game.resolveChoice({ optionId: "pass" });
  strike(game, defender.hand.find((card) => card.catalogId === highGuard.catalogId));
  assert.equal(lastAttack(game).damage, 0);
  assert.equal(game.pendingChoice, null, "the second Block this round opens no window");
  attacker.hand = [];
  while (game.round === 1) game.applyAction({ type: "pass", playerId: game.activePlayer }) || game.resolveChoice(game.defaultChoice());
  assert.equal(defender.reversalUsedThisRound, false);
});

test("declining keeps the once-per-round Reversal available for a later Block", () => {
  const { game, defender } = yellWith([highAttack, highAttack], [highGuard, highGuard, lowAttack]);
  strike(game, defender.hand[0]);
  assert.ok(game.resolveChoice({ optionId: "pass" }));
  assert.ok(game.events.some((event) => event.type === "reversal-declined" && event.player === 1));
  assert.equal(defender.reversalUsedThisRound, false);
  strike(game, defender.hand[0]);
  assert.equal(game.pendingChoice.kind, "reversal");
});

test("bots take an offered Reversal with their best Attack", () => {
  const { game, defender } = yellWith([highAttack], [highGuard, lowAttack]);
  strike(game, defender.hand[0]);
  assert.deepEqual(game.defaultChoice(), { optionId: defender.hand[0].instanceId });
});

test("\"your Reversal against that attacker gets +X\" applies only to that Reversal", () => {
  const { game, defender } = yellWith([highAttack, highAttack], [reversalBonusDefense, lowAttack]);
  strike(game, defender.hand[0]);
  assert.equal(game.pendingChoice.kind, "reversal");
  game.resolveChoice({ optionId: defender.hand[0].instanceId });
  game.resolveChoice({ optionId: "pass" });
  const event = lastAttack(game);
  assert.equal(event.reversal, true);
  assert.deepEqual(event.breakdown.attackParts.find((part) => part.label === "Reversal"), { label: "Reversal", value: Number(reversalBonusOf(reversalBonusDefense)) });
  assert.ok(!defender.statuses.some((status) => status.action === "reversalAttackPower"), "the bonus is consumed");
});

test("\"if played as a Reversal\" effects apply to Reversals only", () => {
  const normal = yellWith([reversalOnlyAttack], [lowAttack]);
  normal.defender.def = 0;
  strike(normal.game, null);
  assert.equal(lastAttack(normal.game).attack, Number(reversalOnlyAttack.stats["Attack Power"]));

  const { game, defender } = yellWith([highAttack], [highGuard, reversalOnlyAttack]);
  strike(game, defender.hand[0]);
  game.resolveChoice({ optionId: defender.hand[0].instanceId });
  if (game.pendingChoice?.kind === "attack-zone") game.resolveChoice({ optionId: "Mid" });
  game.resolveChoice({ optionId: "pass" });
  assert.equal(lastAttack(game).attack, Number(reversalOnlyAttack.stats["Attack Power"]) + Number(reversalOnlyPowerOf(reversalOnlyAttack)));
});

test("a fighter protected from Reversals cannot be targeted by one", () => {
  const { game, attacker, defender } = yellWith([highAttack], [highGuard, lowAttack]);
  game.addStatus(attacker, { action: "reversalProtection", duration: "startOfTurn" });
  strike(game, defender.hand[0]);
  assert.equal(lastAttack(game).damage, 0);
  assert.equal(game.pendingChoice, null);
});

test("the attack event carries zone, reversal and a breakdown that adds up", () => {
  const { game, attacker, defender } = yellWith([highAttack], [highGuard]);
  // Tempo needs the faster fighter (rules: Tempo Advantage).
  attacker.atk = 1; attacker.tempo = true; defender.def = 1; attacker.speed = defender.speed + 1;
  strike(game, defender.hand[0]);
  const event = lastAttack(game);
  assert.equal(event.zone, "High");
  assert.equal(event.reversal, false);
  assert.deepEqual(event.breakdown.attackParts, [{ label: "Card", value: 2 }, { label: "ATK", value: 1 }, { label: "Tempo", value: 1 }]);
  assert.deepEqual(event.breakdown.blockParts, [{ label: "Guard", value: 2 }, { label: "DEF", value: 1 }]);
  assert.equal(event.attack, sum(event.breakdown.attackParts));
  assert.equal(event.block, Math.max(0, sum(event.breakdown.blockParts) - event.breakdown.piercing));
  assert.equal(event.breakdown.prevented, 0);
  assert.equal(event.breakdown.piercing, 0);
  for (const key of ["attacker", "defender", "card", "defense", "attack", "block", "damage", "defenseFocus"]) assert.ok(key in event, key);
});

test("breakdowns add up across a full seeded game, and Reversals happen in play", () => {
  const result = new Game(data, { seed: 3 }).run();
  const attacks = result.events.filter((event) => event.type === "attack");
  for (const event of attacks) {
    assert.equal(event.attack, sum(event.breakdown.attackParts));
    assert.equal(event.block, Math.max(0, sum(event.breakdown.blockParts) - event.breakdown.piercing));
    assert.equal(event.damage, Math.max(0, event.attack - event.block - event.breakdown.prevented));
  }
  assert.ok(attacks.some((event) => event.reversal));
  assert.equal(result.telemetry.reversals, attacks.filter((event) => event.reversal).length);
});
