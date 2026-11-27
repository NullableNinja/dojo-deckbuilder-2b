// Damage previews: they agree with what really happens, and they never touch the real game.
import assert from "node:assert/strict";
import test from "node:test";
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game } from "../engine/core.mjs";
import { previewAttack, previewDefense } from "../engine/preview.mjs";

const data = await loadGameData();
const starter = (type, zone) => data.cards.find((card) => card.cardType === "Starter" && card.details?.Type === type && card.zone === zone);
const jab = starter("Attack", "High");
const wildSwing = starter("Attack", "Any");
const highGuard = starter("Defense", "High");
const lowGuard = starter("Defense", "Low");

/** A two-player game paused at player 0's Yell with chosen hands. */
function yellWith(attackerHand, defenderHand, seed = 5) {
  const game = new Game(data, { seed, mode: "standard-clash", players: 2 });
  while (!(game.phase === "Yell" && game.activePlayer === 0)) {
    game.advanceAutomaticEvents();
    if (game.pendingChoice) { game.resolveChoice(game.defaultChoice()); continue; }
    if (game.phase === "Yell" && game.activePlayer === 0) break;
    game.applyAction({ type: "pass", playerId: game.activePlayer });
  }
  game.players[0].hand = attackerHand.map((card) => game.cardInstance(card));
  game.players[1].hand = defenderHand.map((card) => game.cardInstance(card));
  return game;
}

const fingerprint = (game) => JSON.stringify({ state: game.getState(), rng: game.rng.state ?? game.rng, events: game.events.length, pending: game.pendingChoice });

test("fixtures exist", () => {
  assert.ok(jab && wildSwing && highGuard && lowGuard);
});

test("an Attack preview matches the real unblocked result and changes nothing", () => {
  const game = yellWith([jab], [highGuard]);
  const [card] = game.players[0].hand;
  const before = fingerprint(game);
  const preview = previewAttack(game, 0, card.instanceId, { targetId: 1 });
  assert.equal(fingerprint(game), before, "the real game is untouched, dice included");
  assert.equal(preview.kind, "attack");
  assert.equal(preview.zone, "High");
  assert.equal(preview.targetHpAfter, preview.targetHp - preview.damage);
  assert.ok(preview.attackParts.length > 0 && preview.blockParts.length > 0, "the numbers come with a breakdown");
  // Now play it for real, with the defender passing.
  assert.ok(game.applyAction({ type: "play-attack", playerId: 0, cardId: card.instanceId, targetId: 1 }));
  while (game.pendingChoice) assert.ok(game.resolveChoice({ optionId: "pass" }));
  const real = game.events.find((event) => event.type === "attack");
  assert.equal(preview.damage, real.damage);
  assert.equal(preview.attack, real.attack);
  assert.equal(preview.block, real.block);
});

test("an Any-zone Attack reports every zone and picks the best", () => {
  const game = yellWith([wildSwing], []);
  const preview = previewAttack(game, 0, game.players[0].hand[0].instanceId, { targetId: 1 });
  assert.deepEqual(preview.byZone.map((entry) => entry.zone).sort(), ["High", "Low", "Mid"]);
  assert.equal(preview.damage, Math.max(...preview.byZone.map((entry) => entry.damage)));
});

test("a Defense preview shows each option's result and matches what really happens", () => {
  const game = yellWith([jab], [highGuard, lowGuard]);
  game.players[0].nextAttackPower = 5; // a real engine mechanic: a bonus that makes the Jab land
  const attack = game.players[0].hand[0];
  assert.ok(game.applyAction({ type: "play-attack", playerId: 0, cardId: attack.instanceId, targetId: 1 }));
  assert.equal(game.pendingChoice.playerId, 1);
  const before = fingerprint(game);
  const preview = previewDefense(game, 1);
  assert.equal(fingerprint(game), before, "previewing never changes the pending choice or the dice");
  const [good, wrongZone] = game.players[1].hand;
  assert.ok(preview.byOption.pass && preview.byOption[good.instanceId]);
  assert.equal(preview.byOption[wrongZone.instanceId], undefined, "a Defense that does not cover the zone is not an option");
  assert.ok(preview.byOption[good.instanceId].damage < preview.byOption.pass.damage, "the matching Defense helps");
  assert.equal(preview.takeTheHit.damage, preview.byOption.pass.damage);
  // Choose it for real.
  const hpBefore = game.players[1].hp;
  assert.ok(game.resolveChoice({ optionId: good.instanceId }));
  assert.equal(hpBefore - game.players[1].hp, preview.byOption[good.instanceId].damage);
});

test("previews are empty when there is nothing to preview", () => {
  const game = yellWith([highGuard], []);
  assert.equal(previewDefense(game, 1), null, "no strike is incoming");
  assert.equal(previewAttack(game, 0, "nope#1"), null, "unknown card");
});
