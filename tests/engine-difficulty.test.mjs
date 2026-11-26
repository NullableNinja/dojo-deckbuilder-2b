// Engine difficulty policies (Student / Certified / Master) choose only from what the engine
// offers, never mutate the table, finish games cleanly in every mode and replay move for move.
import assert from "node:assert/strict";
import test from "node:test";
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game } from "../engine/core.mjs";
import { createModeGame } from "../engine/game-factory.mjs";
import { replayGame, replayMatches } from "../engine/replay.mjs";
import { DIFFICULTIES, difficultyPolicy } from "../engine/difficulty.mjs";

const data = await loadGameData();

const sameAction = (left, right) => left.type === right.type && left.cardId === right.cardId && left.fighterIndex === right.fighterIndex;

/** Wraps per-seat policies and checks every decision against what the engine offered. */
function checkedTable(policiesBySeat, violations, { checkMutation = true } = {}) {
  const snapshot = (game) => (checkMutation ? JSON.stringify(game.getState()) : "");
  return {
    chooseAction(game, legal) {
      const before = snapshot(game);
      const action = policiesBySeat[game.activePlayer].chooseAction(game, legal);
      if (snapshot(game) !== before) violations.push("chooseAction mutated the game");
      if (!legal.some((offered) => sameAction(offered, action))) violations.push(`action not offered: ${JSON.stringify(action)}`);
      if (action.targetId !== undefined && !game.legalTargets(game.players[game.activePlayer]).some((target) => target.id === action.targetId)) violations.push(`illegal target ${action.targetId}`);
      return action;
    },
    chooseChoice(game, pending) {
      const before = snapshot(game);
      const choice = policiesBySeat[pending.playerId].chooseChoice(game, pending);
      if (snapshot(game) !== before) violations.push("chooseChoice mutated the game");
      if (!pending.options.some((option) => option.id === choice?.optionId)) violations.push(`choice not offered in ${pending.kind}: ${JSON.stringify(choice)}`);
      return choice;
    },
  };
}

const seatsOf = (game, level) => game.players.map(() => difficultyPolicy(level));

test("the module exposes the three difficulty levels and rejects unknown ones", () => {
  assert.deepEqual(DIFFICULTIES, ["student", "certified", "master"]);
  for (const level of DIFFICULTIES) {
    const policy = difficultyPolicy(level);
    assert.equal(typeof policy.chooseAction, "function");
    assert.equal(typeof policy.chooseChoice, "function");
  }
  assert.throws(() => difficultyPolicy("grandmaster"), /Unknown difficulty/);
});

test("every level only chooses offered actions and options and never mutates the game", () => {
  for (const level of DIFFICULTIES) {
    for (const seed of [3, 11]) {
      const violations = [];
      const game = new Game(data, { seed });
      const result = game.run({ policy: checkedTable(seatsOf(game, level), violations) });
      assert.deepEqual(violations, [], `${level} seed ${seed}`);
      assert.notEqual(result.winner, null);
    }
  }
});

test("mixed tables of different levels play legal Quick Duels with no invariant failures", () => {
  for (const [index, seats] of [["student", "certified"], ["certified", "master"], ["master", "student"]].entries()) {
    const violations = [];
    const game = new Game(data, { seed: 40 + index });
    const result = game.run({ policy: checkedTable(seats.map(difficultyPolicy), violations) });
    assert.deepEqual(violations, []);
    assert.deepEqual(result.invariantFailures, []);
  }
});

test("each level finishes Quick Duels, multiplayer Clash, Tag Team and Boss Blitz with 0 invariant failures", () => {
  const setups = [{}, { mode: "standard-clash", players: 3 }, { mode: "tag-team", players: 4, teams: [[0, 2], [1, 3]] }, { mode: "dojo-drama", players: 2 }];
  for (const level of DIFFICULTIES) {
    setups.forEach((setup, index) => {
      const violations = [];
      const game = createModeGame(data, { seed: 70 + index, ...setup });
      const result = game.run({ policy: checkedTable(seatsOf(game, level), violations, { checkMutation: false }), maxSteps: 400000 });
      assert.notEqual(result.winner, null, `${level} ${setup.mode ?? "quick-duel"}`);
      assert.deepEqual(result.invariantFailures, [], `${level} ${setup.mode ?? "quick-duel"}`);
      assert.deepEqual(violations, [], `${level} ${setup.mode ?? "quick-duel"}`);
    });
  }
});

test("a fixed seed gives the same game every time, and the recorded decisions replay exactly", () => {
  for (const level of DIFFICULTIES) {
    const play = () => new Game(data, { seed: 21 }).run({ policy: difficultyPolicy(level) });
    const first = play();
    const second = play();
    assert.deepEqual(second.decisions, first.decisions, level);
    assert.equal(second.winner, first.winner);
    // Policies read the seeded RNG without advancing it, so setup + decisions is the whole game.
    assert.ok(replayMatches(first, replayGame(data, first)), `${level} replay`);
  }
});

test("Master beats Student and Certified beats Student on fixed seeds", () => {
  const winsFor = (stronger, weaker, games) => {
    let wins = 0;
    for (let index = 0; index < games; index += 1) {
      const seats = index % 2 === 0 ? [stronger, weaker] : [weaker, stronger];
      const policies = seats.map(difficultyPolicy);
      const result = new Game(data, { seed: 500 + Math.floor(index / 2) }).run({ policy: { chooseAction: (game, legal) => policies[game.activePlayer].chooseAction(game, legal), chooseChoice: (game, pending) => policies[pending.playerId].chooseChoice(game, pending) } });
      if (seats[result.winner] === stronger) wins += 1;
    }
    return wins;
  };
  assert.ok(winsFor("master", "student", 60) > 30);
  assert.ok(winsFor("certified", "student", 60) > 30);
});

test("a Bad Habit cash-in is taken when the engine offers it", () => {
  const game = new Game(data, { seed: 8 });
  game.advanceAutomaticEvents();
  game.applyAction({ type: "pass", playerId: game.activePlayer });
  assert.equal(game.phase, "Yell");
  const player = game.players[game.activePlayer];
  // Use the engine's own offer when this hand holds a Bad Habit; otherwise inject one.
  const legal = game.getLegalActions();
  const offer = legal.find((action) => action.type === "bad-habit-focus") ?? { type: "bad-habit-focus", playerId: player.id, cardId: player.hand[0].instanceId };
  const actions = legal.includes(offer) ? legal : [...legal, offer];
  for (const level of DIFFICULTIES) assert.deepEqual(difficultyPolicy(level).chooseAction(game, actions), offer, level);
});
