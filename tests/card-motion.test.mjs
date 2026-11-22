import assert from "node:assert/strict";
import test from "node:test";
import { cardMotionDisabled, diffCardZones, motionFor } from "../app/card-motion.ts";

test("discarding from hand crumples the card", () => {
  const motions = diffCardZones({ hand: ["A", "B"], discard: [] }, { hand: ["A"], discard: ["B"] });
  assert.deepEqual(motions, [{ cardId: "B", copy: 0, from: "hand", to: "discard", motion: "crumple" }]);
});

test("unchanged zones produce no motion", () => {
  assert.deepEqual(diffCardZones({ hand: ["A", "B"], market: ["C"] }, { hand: ["B", "A"], market: ["C"] }), []);
});

test("duplicate copies are tracked separately", () => {
  const motions = diffCardZones({ hand: ["BadHabit", "BadHabit"] }, { hand: ["BadHabit"], discard: ["BadHabit"] });
  assert.equal(motions.length, 1);
  assert.equal(motions[0].motion, "crumple");
});

test("drawn cards slide in; cards leaving the screen still report", () => {
  const motions = diffCardZones({ deck: ["A"], hand: [] }, { deck: [], hand: ["A"] });
  assert.equal(motions[0].motion, "draw");
  const drawnFromHidden = diffCardZones({ hand: [] }, { hand: ["Z"] });
  assert.deepEqual(drawnFromHidden[0], { cardId: "Z", copy: 0, from: null, to: "hand", motion: "draw" });
});

test("motion names cover reveal, restock and destroy", () => {
  assert.equal(motionFor("hand", "playArea"), "fold-in");
  assert.equal(motionFor(null, "filing"), "fold-in");
  assert.equal(motionFor(null, "market"), "restock");
  assert.equal(motionFor("playArea", "destroyed"), "destroy");
  assert.equal(motionFor("discard", "deck"), "move");
});

test("in-game Motion off or reduced disables card motion", () => {
  assert.equal(cardMotionDisabled("off"), true);
  assert.equal(cardMotionDisabled("reduced"), true);
  assert.equal(cardMotionDisabled("full"), false);
});
