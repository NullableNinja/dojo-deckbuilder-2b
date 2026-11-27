// The Ascend desk's belt checklist, read from the engine's own state.
import assert from "node:assert/strict";
import test from "node:test";
import { EngineSession } from "../app/engine-session.ts";
import { beltRequirements, examSteps } from "../app/belt-progress.ts";
import { clashData } from "../app/clash-engine.ts";

const fighters = clashData().cards.filter((card) => card.cardType === "Character").map((card) => card.catalogId);
const session = () => new EngineSession({ mode: "quick-duel", seed: 7, fighters: [fighters[0], fighters[7]], humanSeats: [0], rulesVersion: "test" });

test("a fresh fighter needs XP and the Gold exam, and may not promote yet", () => {
  const { game } = session();
  const req = beltRequirements(game, game.players[0]);
  assert.equal(req.next.name, "Gold");
  assert.equal(req.xp.met, false);
  assert.equal(req.exam.done, false);
  assert.deepEqual(req.exam.steps.map((step) => step.label), ["High Attack made", "Mid Attack made", "Low Attack made"]);
  assert.equal(req.ready, false);
  assert.match(req.nextStep, /XP/);
});

test("ready follows the engine: both requirements met and the Belt Check unused", () => {
  const { game } = session();
  const seat = game.players[0];
  seat.xp = 3;
  seat.completedTasks.push(1);
  game.phase = "Ascend";
  assert.equal(beltRequirements(game, seat).ready, true);
  assert.equal(beltRequirements(game, seat).ready, game.canPromote(seat));
  seat.beltCheckActionUsed = true;
  const used = beltRequirements(game, seat);
  assert.equal(used.ready, false);
  assert.equal(used.checkUsed, true);
  assert.match(used.nextStep, /next Ascend/);
});

test("exam steps report engine facts", () => {
  const { game } = session();
  const seat = game.players[0];
  seat.examProgress.zones = ["High", "Low"];
  assert.deepEqual(examSteps("three-zones", seat).map((step) => step.met), [true, false, true]);
  assert.equal(examSteps("equipment-count", seat)[0].met, false);
  assert.equal(examSteps("market-types", seat)[0].label, "Market card types bought: 0 of 2");
});

test("the top Belt has nothing left to earn", () => {
  const { game } = session();
  const seat = game.players[0];
  seat.beltIndex = game.definition.progression.belts.length - 1;
  const req = beltRequirements(game, seat);
  assert.equal(req.next, null);
  assert.equal(req.ready, false);
});
