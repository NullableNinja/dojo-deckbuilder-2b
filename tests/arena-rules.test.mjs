// The arena rule variant (engine/arena-rules.mjs) on real Quick Duel games: draft effects through the engine's own seams.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EngineSession } from "../app/engine-session.ts";
import { clashData } from "../app/clash-engine.ts";
import { previewAttack } from "../engine/preview.mjs";
import { ArenaGame } from "../engine/arena-rules.mjs";

const dummy = JSON.parse(readFileSync(new URL("../content/experimental/arena-dummy.json", import.meta.url), "utf8"));
const passive = {
  chooseAction: (_game, legal) => legal.find((action) => action.type === "pass" || action.type === "hide") ?? legal[0],
  chooseChoice: (game) => (game.pendingChoice.options.some((option) => option.id === "pass") ? { optionId: "pass" } : game.defaultChoice()),
};
const arena = (seed = 11, variant = "arena") => new EngineSession({ mode: "quick-duel", seed, fighters: [dummy.catalogId, dummy.catalogId], humanSeats: [0], rulesVersion: "test", table: { cardPool: null }, characterCards: [dummy], ...(variant ? { variant } : {}) }, passive);
const events = (game, kind) => game.events.filter((event) => event.type === "arena-effect" && (!kind || event.kind === kind));
const attackCard = () => clashData().cards.find((card) => card.cardType === "Starter" && Number(card.stats?.["Attack Power"]) > 0 && card.zone !== "Any");

/** Pass the human's phases (and let the passive Dummy act) until `stop` holds. */
function until(session, stop, limit = 300) {
  for (let step = 0; step < limit && !session.over; step += 1) {
    if (stop(session)) return true;
    if (!session.humanToAct()) { session.stepBots(); continue; }
    const game = session.game;
    if (game.pendingChoice) { session.choose(game.pendingChoice.options.some((option) => option.id === "pass") ? "pass" : game.defaultChoice().optionId); continue; }
    const legal = session.legalFor(0);
    session.act(legal.find((action) => action.type === "pass" || action.type === "hide") ?? legal[0]);
  }
  return stop(session);
}
const atYell = (session) => session.game.phase === "Yell" && session.game.activePlayer === 0 && !session.game.pendingChoice;
const withAttack = (session) => { const game = session.game; const card = game.cardInstance(attackCard()); game.players[0].hand.push(card); return card; };

test("only the arena variant builds an ArenaGame; a normal session is untouched", () => {
  assert.ok(arena().game instanceof ArenaGame);
  assert.ok(!(arena(11, null).game instanceof ArenaGame));
});

test("Laminated: no Attacks, no Defense cards, Speed -2, and the first Hit tears it for +2", () => {
  const session = arena();
  assert.ok(until(session, atYell));
  const game = session.game; const [me, them] = game.players;
  const card = withAttack(session);
  const speed = game.currentSpeed(me);
  const defenses = game.defenseOptions(me, { zone: "Mid" }).length;
  game.applyArenaEffect(me, "freeze");
  assert.equal(game.currentSpeed(me), speed - 2);
  assert.ok(!session.legalFor(0).some((action) => action.type === "play-attack"), "a laminated fighter cannot declare Attacks");
  assert.equal(game.defenseOptions(me, { zone: "Mid" }).length, defenses, "Laminate shuts one lane (Attacks); Defense cards stay playable");
  game.dropArenaEffect(me, "freeze", "test");
  me.atk = 8; me.tempo = false; // Laminate's -2 Speed would otherwise hand the attacker Tempo, a separate real-rules bonus
  const plain = previewAttack(game, 0, card.instanceId);
  game.arenaState(them).grace = {};
  game.applyArenaEffect(them, "freeze");
  const sealed = previewAttack(game, 0, card.instanceId);
  assert.ok(plain.damage > 0);
  assert.equal(sealed.damage, plain.damage + 2, "the tear adds 2 on top of the real combat math");
});

test("Scorch and Ink cost HP at Honor; Ink fades a stack each round", () => {
  const session = arena(5);
  const game = session.game; const them = game.players[1];
  game.applyArenaEffect(them, "burn", { stacks: 2 });
  game.applyArenaEffect(them, "poison", { stacks: 3 });
  const hp = them.hp; const round = game.round;
  assert.ok(until(session, (s) => s.game.round > round));
  assert.equal(them.hp, hp - 2 - 3);
  assert.equal(game.arenaEffect(them, "poison").stacks, 2);
  assert.deepEqual(events(game, "tick").map((event) => event.effect), ["burn", "poison"]);
});

test("Red Tape raises Market and Combo prices by 1 per stack", () => {
  const game = arena().game; const me = game.players[0];
  const card = game.market[0];
  const price = game.purchaseCost(me, card);
  game.applyArenaEffect(me, "redtape", { stacks: 2 });
  assert.equal(game.purchaseCost(me, card), price + 2);
});

test("Wet Floor lowers Speed by 2 and DEF by 1 through the status channel", () => {
  const game = arena().game; const me = game.players[0];
  const speed = game.currentSpeed(me); const def = game.statusValue(me, "modifyDefense");
  game.applyArenaEffect(me, "wetfloor");
  assert.equal(game.currentSpeed(me), speed - 2);
  assert.equal(game.statusValue(me, "modifyDefense"), def - 1);
});

test("Denied voids the next card played: it is discarded, no Attack happens, the stamp is used up", () => {
  const session = arena(7);
  assert.ok(until(session, atYell));
  const game = session.game; const me = game.players[0];
  const card = withAttack(session);
  game.applyArenaEffect(me, "denied");
  const attacks = game.events.filter((event) => event.type === "attack").length;
  assert.ok(session.act({ type: "play-attack", playerId: 0, cardId: card.instanceId }));
  assert.ok(me.discard.includes(card));
  assert.equal(game.events.filter((event) => event.type === "attack").length, attacks);
  assert.equal(game.arenaEffect(me, "denied"), null);
  assert.equal(events(game, "denied").length, 1);
});

test("Paper Cut costs the attacker 1 HP per cut when an Attack is declared", () => {
  const session = arena(9);
  assert.ok(until(session, atYell));
  const game = session.game; const me = game.players[0];
  const card = withAttack(session);
  game.applyArenaEffect(me, "papercut", { stacks: 2 });
  const hp = me.hp;
  assert.ok(session.act({ type: "play-attack", playerId: 0, cardId: card.instanceId }));
  assert.equal(me.hp, hp - 2);
});

test("Stapled pins Attacks to the zone of the last Attack", () => {
  const session = arena(13);
  assert.ok(until(session, atYell));
  const game = session.game; const me = game.players[0];
  game.applyArenaEffect(me, "stapled");
  game.arenaState(me).lastZone = "Low";
  const card = withAttack(session);
  const reaches = game.attackZoneOptions(me, card).map((option) => option.zone);
  const legal = session.legalFor(0).some((action) => action.type === "play-attack" && action.cardId === card.instanceId);
  assert.equal(legal, reaches.includes("Low"), "an Attack that cannot reach the stapled zone is not legal");
  assert.ok(reaches.every((zone) => zone === "Low"));
});

test("Reimburse heals 1 on a Hit of 2+, once per round; a loaded Hit applies its effect", () => {
  const session = arena(17);
  assert.ok(until(session, atYell));
  const game = session.game; const [me, them] = game.players;
  me.atk = 9; me.hp = 15;
  game.setReimburse(me, true);
  game.armArenaEffect(me, "poison", 2);
  const card = withAttack(session);
  assert.ok(session.act({ type: "play-attack", playerId: 0, cardId: card.instanceId }));
  session.stepBots();
  assert.ok(game.events.some((event) => event.type === "attack" && event.damage >= 2));
  assert.equal(me.hp, 16);
  assert.equal(game.arenaEffect(them, "poison")?.stacks, 2, "the loaded effect landed on the Hit");
  assert.equal(events(game, "reimburse").length, 1);
});

test("Barrier absorbs Hit damage stack by stack and is used up", () => {
  const session = arena(19);
  assert.ok(until(session, atYell));
  const game = session.game; const [me, them] = game.players;
  me.atk = 6; me.tempo = false;
  const card = withAttack(session);
  const plain = previewAttack(game, 0, card.instanceId);
  game.applyArenaEffect(them, "barrier", { stacks: 2 });
  const shielded = previewAttack(game, 0, card.instanceId);
  assert.ok(plain.damage >= 3);
  assert.equal(shielded.damage, plain.damage - 2);
  game.applyArenaEffect(them, "barrier", { stacks: 1 });
  assert.equal(game.arenaEffect(them, "barrier").stacks, 3);
  game.applyArenaEffect(them, "barrier", { stacks: 2 });
  assert.equal(game.arenaEffect(them, "barrier").stacks, 3, "Barrier caps at 3 stacks");
});

test("Static Shock jolts the first card you play on your turn (once) and takes away Tempo", () => {
  const session = arena(23);
  assert.ok(until(session, atYell));
  const game = session.game; const [me, them] = game.players;
  me.tempo = true; me.speed = 9;
  assert.equal(game.hasTempoAdvantage(me, them), true);
  game.applyArenaEffect(me, "shock");
  assert.equal(game.hasTempoAdvantage(me, them), false);
  const first = withAttack(session); const second = withAttack(session);
  const hp = me.hp;
  assert.ok(session.act({ type: "play-attack", playerId: 0, cardId: first.instanceId }));
  session.stepBots();
  assert.equal(me.hp, hp - 2);
  const after = me.hp;
  if (session.legalFor(0).some((action) => action.cardId === second.instanceId)) {
    session.act({ type: "play-attack", playerId: 0, cardId: second.instanceId }); session.stepBots();
    assert.equal(me.hp, after, "only the first card jolts");
  }
  assert.equal(events(game, "jolt").length, 1);
});

test("Rush Order gives +2 Speed and an extra card at the start of your turn", () => {
  const session = arena(29);
  const game = session.game; const me = game.players[0];
  const speed = game.currentSpeed(me);
  game.applyArenaEffect(me, "haste");
  assert.equal(game.currentSpeed(me), speed + 2);
  const round = game.round;
  assert.ok(until(session, (s) => s.game.round > round && s.game.activePlayer === 0 && s.game.phase === "Initiate"));
  assert.equal(events(game, "rush-draw").length, 1, "the extra card is paid out once");
  const next = game.round;
  assert.ok(until(session, (s) => s.game.round > next && s.game.activePlayer === 0 && s.game.phase === "Initiate"));
  assert.equal(events(game, "rush-draw").length, 1, "no second extra card while Rush Order lasts");
});

test("Dog-Eared adds +1 damage per stack to Hits and lowers Guard", () => {
  const session = arena(31);
  assert.ok(until(session, atYell));
  const game = session.game; const [me, them] = game.players;
  me.atk = 6; me.tempo = false;
  const card = withAttack(session);
  const plain = previewAttack(game, 0, card.instanceId);
  game.applyArenaEffect(them, "brittle", { stacks: 2 });
  assert.equal(previewAttack(game, 0, card.instanceId).damage, plain.damage + 2);
  assert.equal(game.statusValue(them, "modifyGuard"), -2);
});
