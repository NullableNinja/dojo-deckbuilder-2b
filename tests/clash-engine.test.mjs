// The browser Standard Clash table runs the canonical headless engine from the generated JSON.
import assert from "node:assert/strict";
import test from "node:test";
import { clashData, createClashGame } from "../app/clash-engine.ts";

test("the browser loader builds the same engine data the Node loader does", () => {
  const data = clashData();
  assert.ok(data.definition.modes.some((mode) => mode.id === "standard-clash" && mode.executable.engine));
  assert.ok(data.byId.size > 500);
  assert.ok(data.cardEffectById.size > 500);
});

test("a browser Clash seats you plus the chosen number of bots and plays to a legal finish", () => {
  for (const [opponents, seed] of [[2, 4], [3, 9], [5, 17]]) {
    const game = createClashGame({ fighterId: "", opponents, seed });
    assert.equal(game.players.length, opponents + 1);
    assert.equal(new Set(game.players.map((player) => player.character.catalogId)).size, opponents + 1, "every seat has its own fighter");
    const result = game.run({ maxSteps: 400000 });
    assert.notEqual(result.winner, null);
    assert.deepEqual(result.invariantFailures, []);
  }
});
