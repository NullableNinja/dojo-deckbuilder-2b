// Core combat rules the headless engine enforces in every mode (rules glossary and Ch. 6).
// Fixtures pick cards by canonical properties, not by name.
import assert from "node:assert/strict";
import test from "node:test";
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game } from "../engine/core.mjs";

const data = await loadGameData();
const guard = (card) => Number.parseInt(String(card.stats?.Guard ?? 0), 10) || 0;
const singleZone = (zone) => ["High", "Mid", "Low"].includes(zone);
// Starter cards: a plain High attack and the printed single-zone and Any-zone guards.
const starter = (type, zone) => data.cards.find((card) => card.cardType === "Starter" && card.details?.Type === type && card.zone === zone);
const highAttack = starter("Attack", "High");
const defenseFor = (zone) => starter("Defense", zone);
const defenseEquipment = data.cards.find((card) => card.subtype === "Defense Equipment" && guard(card) > 0);

/** A two-player game paused at the start of player 0's Yell, with chosen hands. */
function yellWith(attackerHand, defenderHand) {
  const game = new Game(data, { seed: 5, mode: "standard-clash", players: 2 });
  while (!(game.phase === "Yell" && game.activePlayer === 0)) {
    game.advanceAutomaticEvents();
    if (game.pendingChoice) { game.resolveChoice(game.defaultChoice()); continue; }
    if (game.phase === "Yell" && game.activePlayer === 0) break;
    game.applyAction({ type: "pass", playerId: game.activePlayer });
  }
  const [attacker, defender] = game.players;
  attacker.hand = attackerHand.map((card) => game.cardInstance(card));
  defender.hand = defenderHand.map((card) => game.cardInstance(card));
  return { game, attacker, defender };
}

test("fixtures exist", () => {
  assert.ok(highAttack && singleZone(highAttack.zone));
  assert.ok(defenseFor("High") && defenseFor("Low") && defenseFor("Any") && defenseEquipment);
});

test("a Defense can only block an attack in a zone it covers", () => {
  const { game, attacker, defender } = yellWith([highAttack], [defenseFor("High"), defenseFor("Low"), defenseEquipment, defenseFor("Any")]);
  assert.ok(game.applyAction({ type: "play-attack", playerId: 0, cardId: attacker.hand[0].instanceId, targetId: 1 }));
  assert.equal(game.pendingChoice.kind, "defense");
  const offered = game.pendingChoice.options.map((option) => option.id);
  const [high, low, equipment, any] = defender.hand;
  assert.ok(offered.includes(high.instanceId), "a matching High Defense is offered");
  assert.ok(offered.includes(any.instanceId), "an Any-zone Defense covers every zone");
  assert.ok(!offered.includes(low.instanceId), "a Low Defense cannot block a High attack");
  assert.ok(!offered.includes(equipment.instanceId), "Defense Equipment is not played from hand as a Defense");
  assert.equal(game.resolveChoice({ optionId: low.instanceId }), false);
  assert.equal(game.resolveChoice(game.defaultChoice()), true, "the bot only picks offered Defenses");
});

test("a knockout voids a pending choice about the knocked-out fighter's cards", () => {
  const game = new Game(data, { seed: 9, mode: "standard-clash", players: 3 });
  const [chooser, victim] = game.players;
  victim.hand = [game.cardInstance(highAttack)];
  game.pendingChoice = { kind: "card-movement", playerId: chooser.id, targetPlayerId: victim.id, movement: "discard", amount: 1, sourceZones: ["hand"], options: [{ id: victim.hand[0].instanceId, label: highAttack.name }] };
  victim.hp = 0;
  game.processKnockouts();
  assert.equal(game.pendingChoice, null);
});
