// The public hash routes: the game lives at #play, and old #playtest links still resolve to it.
import assert from "node:assert/strict";
import test from "node:test";
import { parseRoute, serializeRoute } from "../app/routing.ts";

test("the game page is published as #play", () => {
  assert.equal(serializeRoute({ page: "playtest" }), "#play");
  assert.deepEqual(parseRoute("#play"), { page: "playtest" });
  assert.deepEqual(parseRoute("https://example.test/dojo/#play"), { page: "playtest" });
});

test("legacy #playtest links and deep links land on the game page", () => {
  for (const hash of ["#playtest", "#playtest/", "#/playtest", "#PLAYTEST", "#playtest/quick-duel", "#playtest/anything/else"]) {
    assert.deepEqual(parseRoute(hash), { page: "playtest" }, hash);
  }
});

test("other routes are unchanged", () => {
  assert.equal(serializeRoute({ page: "cards", cardId: "DDB-ATK-CORE-001" }), "#cards/DDB-ATK-CORE-001");
  assert.deepEqual(parseRoute("#rules/8-combat/reversal"), { page: "rules", chapterId: "8-combat", sectionId: "reversal" });
  assert.deepEqual(parseRoute("#players"), { page: "home" });
});
