// The mat's live damage previews, worded from the engine's own numbers.
import assert from "node:assert/strict";
import test from "node:test";
import { EngineSession } from "../app/engine-session.ts";
import { livePreviews } from "../app/mat-view.ts";
import { clashData } from "../app/clash-engine.ts";

const fighters = clashData().cards.filter((card) => card.cardType === "Character").map((card) => card.catalogId);
const setup = (seed) => ({ mode: "quick-duel", seed, fighters: [fighters[0], fighters[7]], humanSeats: [0], rulesVersion: "test", difficulty: "certified" });

/** Play the human's turns by passing until `stop(session)` is true. */
function playUntil(session, stop, limit = 400) {
  for (let step = 0; step < limit && !session.over; step += 1) {
    if (stop(session)) return true;
    if (!session.humanToAct()) { session.stepBots(); continue; }
    const { game } = session;
    if (game.pendingChoice) { session.choose(game.defaultChoice().optionId); continue; }
    const legal = session.legalFor(0);
    const pass = legal.find((action) => action.type === "pass" || action.type === "hide");
    if (!pass || !session.act(pass)) return false;
  }
  return stop(session);
}

test("your Attack cards show what they would do to the opponent", () => {
  let found = null;
  for (let seed = 1; seed <= 30 && !found; seed += 1) {
    const session = new EngineSession(setup(seed));
    const reached = playUntil(session, (s) => s.game.phase === "Yell" && s.game.activePlayer === 0 && !s.game.pendingChoice && s.legalFor(0).some((action) => action.type === "play-attack"));
    if (reached) found = session;
  }
  assert.ok(found, "some seed reaches a Yell with an Attack to play");
  const previews = livePreviews(found.game, 0, 1);
  const attacks = found.legalFor(0).filter((action) => action.type === "play-attack");
  assert.equal(Object.keys(previews.byCard).length, attacks.length, "every playable Attack has a preview");
  for (const action of attacks) {
    const line = previews.byCard[action.cardId];
    assert.equal(line.whose, "opponent");
    assert.match(line.headline, /dmg/);
    assert.equal(typeof line.amount, "number");
    assert.ok(line.hpBefore >= line.hpAfter);
  }
});

test("while a strike is incoming, each answer shows what you would take", () => {
  let found = null;
  for (let seed = 1; seed <= 60 && !found; seed += 1) {
    const session = new EngineSession(setup(seed));
    const reached = playUntil(session, (s) => s.game.pendingChoice?.playerId === 0 && s.game.pendingChoice.kind === "defense" && s.game.pendingChoice.options.length > 1);
    if (reached) found = session;
  }
  assert.ok(found, "some seed has the computer strike while you hold a Defense");
  const previews = livePreviews(found.game, 0);
  assert.ok(previews.takeTheHit, "taking the hit is previewed");
  assert.equal(previews.takeTheHit.whose, "you");
  const defenses = found.game.pendingChoice.options.filter((option) => option.id !== "pass");
  for (const option of defenses) {
    const line = previews.byCard[option.id];
    assert.ok(line, "every Defense option has a preview");
    assert.ok(line.amount <= previews.takeTheHit.amount, "a legal Defense never makes it worse");
  }
});

test("there is nothing to preview on the computer's turn", () => {
  const session = new EngineSession(setup(3));
  session.stepBots();
  const { game } = session;
  if (!session.humanToAct()) assert.deepEqual(livePreviews(game, 0), { byCard: {}, takeTheHit: null });
});
