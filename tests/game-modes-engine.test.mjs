// Standard Clash and Tag Team rules in the headless engine (rules Ch. 3, 13, 16 and
// rulings DDB-RUL-101..115). Fixtures pick cards by canonical properties, not by name.
import assert from "node:assert/strict";
import test from "node:test";
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game } from "../engine/core.mjs";
import { executableModes } from "../engine/modes.mjs";
import { baselinePolicy } from "../engine/policies.mjs";

const data = await loadGameData();
const fighters = data.cards.filter((card) => card.cardType === "Character");
const roster = (offset) => fighters.slice(offset, offset + 3).map((card) => card.catalogId);
const permanentEquipment = data.cards.find((card) => ["Gear", "Defense Equipment"].includes(card.subtype) && card.deck !== "Combo Deck");
const toInitiate = (game) => { if (game.phase === "Honor") game.applyAction({ type: "pass", playerId: game.activePlayer }); assert.equal(game.phase, "Initiate"); };
const instance = (game, card) => game.cardInstance(card);

test("canonical modes declare which ones the engine can run", () => {
  const ids = executableModes(data).map((mode) => mode.id);
  assert.ok(ids.includes("quick-duel"));
  assert.ok(ids.includes("standard-clash"));
  assert.ok(ids.includes("tag-team"));
  assert.ok(ids.includes("dojo-drama"));
});

test("player counts are validated against the mode", () => {
  assert.throws(() => new Game(data, { mode: "quick-duel", players: 3 }), /does not support 3 players/);
  assert.throws(() => new Game(data, { mode: "standard-clash", players: 7 }), /does not support 7 players/);
  assert.equal(new Game(data, { mode: "standard-clash", players: 6 }).players.length, 6);
});

test("Standard Clash plays to a last-fighter-standing winner with eliminations", () => {
  for (const seed of [3, 11, 27]) {
    const result = new Game(data, { seed, mode: "standard-clash", players: 4 }).run({ policy: baselinePolicy });
    assert.notEqual(result.winner, null);
    assert.deepEqual(result.invariantFailures, []);
    if (result.reason === "last-fighter-standing") assert.equal(result.events.filter((event) => event.type === "elimination").length, 3);
  }
});

test("attacks name any legal opposing fighter, never yourself, an eliminated player, or a teammate", () => {
  const clash = new Game(data, { seed: 5, mode: "standard-clash", players: 3 });
  const attacker = clash.players[0];
  assert.deepEqual(clash.legalTargets(attacker).map((player) => player.id), [1, 2]);
  clash.players[2].eliminated = true; clash.players[2].hp = 0;
  assert.deepEqual(clash.legalTargets(attacker).map((player) => player.id), [1]);
  const war = new Game(data, { seed: 5, mode: "tag-team", teams: [[0, 2], [1, 3]] });
  assert.deepEqual(war.legalTargets(war.players[0]).map((player) => player.id), [1, 3]);
  assert.equal(war.players[0].team, war.players[2].team);
});

test("Tag Team: tag once during Initiate, before equipping; Equipment stays with its Character", () => {
  const game = new Game(data, { seed: 8, mode: "tag-team", rosters: [roster(0), roster(3)] });
  toInitiate(game);
  const player = game.players[game.activePlayer];
  const gear = instance(game, permanentEquipment);
  player.equipment.push(gear); player.played.push(gear);
  const firstCharacter = player.character.catalogId;
  const tag = game.getLegalActions(player.id).find((action) => action.type === "tag");
  assert.ok(tag, "a conscious benched fighter can tag in");
  assert.ok(game.applyAction(tag));
  assert.notEqual(player.character.catalogId, firstCharacter);
  assert.ok(!player.equipment.includes(gear), "the incoming fighter does not inherit Equipment");
  assert.ok(player.played.includes(gear), "benched Equipment stays in play with its Character");
  assert.ok(!game.getLegalActions(player.id).some((action) => action.type === "tag"), "only one tag per turn");
  game.hide(player);
  assert.ok(player.played.includes(gear), "Hide keeps a benched fighter's Equipment");
  game.swapActive(player, 0);
  assert.ok(player.equipment.includes(gear), "Equipment returns with its Character");
});

test("Tag Team: no tagging after equipping this Initiate", () => {
  const game = new Game(data, { seed: 9, mode: "tag-team", rosters: [roster(0), roster(3)] });
  toInitiate(game);
  const player = game.players[game.activePlayer];
  player.equippedThisInitiate = true;
  assert.ok(!game.getLegalActions(player.id).some((action) => action.type === "tag"));
});

test("Belt stat rewards belong to the player and follow every active fighter", () => {
  const game = new Game(data, { seed: 10, mode: "tag-team", rosters: [roster(0), roster(3)] });
  const player = game.players[0];
  const baseAtk = player.atk; const benchAtk = player.roster[1].atkBase;
  const orange = data.definition.progression.belts.findIndex((belt) => belt.reward?.stat === "ATK");
  player.beltIndex = orange - 1; player.xp = 99;
  game.phase = "Ascend"; game.activePlayer = 0; game.canPromote = () => true;
  assert.ok(game.promote(player));
  assert.equal(player.atk, baseAtk + 1);
  game.swapActive(player, 1);
  assert.equal(player.atk, benchAtk + 1);
  game.swapActive(player, 0);
  assert.equal(player.atk, baseAtk + 1);
});

test("Knockout procedure: +2 XP to the responsible player, Equipment discarded, owner's replacement, then elimination", () => {
  const game = new Game(data, { seed: 12, mode: "tag-team", rosters: [roster(0), roster(3)] });
  const [attacker, victim] = game.players;
  const gear = instance(game, permanentEquipment);
  victim.equipment.push(gear); victim.played.push(gear);
  const xpBefore = attacker.xp;
  victim.hp = 0; victim.lastDamagedBy = attacker.id;
  game.checkWinner();
  assert.equal(attacker.xp, xpBefore + 2);
  assert.ok(victim.discard.includes(gear) && !victim.played.includes(gear));
  assert.equal(victim.roster.filter((fighter) => fighter.knockedOut).length, 1);
  assert.ok(victim.hp > 0, "a conscious benched fighter became active");
  assert.equal(game.winner, null);
  for (let knock = 0; knock < 2; knock += 1) { victim.hp = 0; victim.lastDamagedBy = attacker.id; game.checkWinner(); }
  assert.ok(victim.eliminated);
  assert.equal(game.winner, attacker.id);
  assert.equal(game.reason, "last-fighter-standing");
});

test("a Location KO awards no KO XP", () => {
  const game = new Game(data, { seed: 13, mode: "standard-clash", players: 3 });
  const xp = game.players.map((player) => player.xp);
  game.players[1].hp = 0; game.players[1].lastDamagedBy = null;
  game.checkWinner();
  assert.ok(game.players[1].eliminated);
  assert.deepEqual(game.players.map((player) => player.xp), xp);
});

test("Black Belt Victory ends Standard Clash and Tag Team but never Quick Duel", () => {
  for (const mode of ["standard-clash", "tag-team"]) {
    const game = new Game(data, { seed: 14, mode, players: 2 });
    const player = game.players[0];
    const black = data.definition.progression.belts.length - 1;
    player.beltIndex = black - 1; player.xp = 99;
    game.canPromote = () => true; game.phase = "Ascend";
    assert.ok(game.promote(player));
    assert.equal(game.winner, 0);
    assert.equal(game.reason, "black-belt");
  }
  const duel = new Game(data, { seed: 14 });
  const player = duel.players[0];
  player.beltIndex = data.definition.progression.belts.length - 2; player.xp = 99;
  duel.canPromote = () => true; duel.phase = "Ascend";
  assert.ok(duel.promote(player));
  assert.equal(duel.winner, null);
});

test("2v2 Dojo War: one team survives, victory is shared", () => {
  const result = new Game(data, { seed: 21, mode: "tag-team", teams: [[0, 2], [1, 3]] }).run({ policy: baselinePolicy });
  assert.deepEqual(result.invariantFailures, []);
  const game = new Game(data, { seed: 21, mode: "tag-team", teams: [[0, 2], [1, 3]] });
  const final = game.run({ policy: baselinePolicy });
  assert.equal(final.winner, result.winner);
  assert.ok([0, 1].includes(game.winningTeam));
});

test("round cap ranks by conscious fighters, then total HP (DDB-RUL-102)", () => {
  const game = new Game(data, { seed: 30, mode: "tag-team", players: 2 });
  const [left, right] = game.players;
  right.roster[1].knockedOut = true; right.roster[1].hp = 0;
  assert.equal(game.rankByTiebreakers([left, right]).id, left.id);
  right.roster[1].knockedOut = false; right.roster[1].hp = 25; left.hp = 10;
  assert.equal(game.rankByTiebreakers([left, right]).id, right.id);
});

test("Speed ties: Quick Duel keeps seat order; other modes pass the referee marker", () => {
  const clash = new Game(data, { seed: 31, mode: "standard-clash", players: 3 });
  clash.referee = 2;
  assert.deepEqual(clash.players.map((player) => clash.seatTiebreak(player)), [1, 2, 0]);
  const duel = new Game(data, { seed: 31 });
  duel.referee = 1;
  assert.deepEqual(duel.players.map((player) => duel.seatTiebreak(player)), [0, 1]);
});
