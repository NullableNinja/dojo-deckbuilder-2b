// The browser's engine session: computer seats play legal moves, and setup + decisions
// replays to the identical game (save/resume, and later peer-to-peer lockstep).
import assert from "node:assert/strict";
import test from "node:test";
import { EngineSession } from "../app/engine-session.ts";
import { clashData } from "../app/clash-engine.ts";

const fighters = clashData().cards.filter((card) => card.cardType === "Character").map((card) => card.catalogId);
const setup = (seed, humanSeats = []) => ({ mode: "quick-duel", seed, fighters: [fighters[0], fighters[5]], humanSeats, rulesVersion: "test" });
const snapshot = (session) => JSON.stringify({ round: session.game.round, phase: session.game.phase, winner: session.game.winner, players: session.game.players.map((seat) => [seat.hp, seat.xp, seat.focus, seat.hand.map((card) => card.instanceId), seat.deck.length]) });

test("two computer seats play a Quick Duel to a winner", () => {
  const session = new EngineSession(setup(7));
  for (let beat = 0; beat < 5000 && !session.over; beat += 1) session.stepBots();
  assert.notEqual(session.game.winner, null);
  assert.equal(session.stuck, null);
});

test("a saved session replays to the identical game", () => {
  const session = new EngineSession(setup(21));
  for (let beat = 0; beat < 60 && !session.over; beat += 1) session.stepBots();
  const saved = JSON.parse(JSON.stringify(session.save()));
  const restored = EngineSession.restore(saved);
  assert.ok(restored);
  assert.equal(snapshot(restored), snapshot(session));
  assert.ok(saved.decisions.length > 20);
});

test("the human seat is never moved by the computer", () => {
  const session = new EngineSession(setup(3, [0]));
  for (let beat = 0; beat < 50 && !session.humanToAct(); beat += 1) session.stepBots();
  assert.ok(session.humanToAct());
  const before = session.decisions.length;
  session.stepBots();
  assert.equal(session.decisions.length, before);
  const legal = session.legalFor(0);
  if (session.game.pendingChoice) assert.equal(session.game.pendingChoice.playerId, 0);
  else assert.ok(legal.length > 0);
});

test("a corrupted save does not replay", () => {
  const session = new EngineSession(setup(5));
  for (let beat = 0; beat < 20; beat += 1) session.stepBots();
  const saved = session.save();
  saved.decisions.splice(3, 0, { kind: "action", action: { type: "purchase", playerId: 0, cardId: "nope" } });
  assert.equal(EngineSession.restore(saved), null);
});
