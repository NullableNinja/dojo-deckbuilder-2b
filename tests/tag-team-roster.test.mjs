// Browser Tag Team roster rules (app/tag-team.ts): tagging, knockouts, replacement, standing.
import assert from "node:assert/strict";
import test from "node:test";
import { botTagChoice, canTag, consciousBench, createRoster, fightersRemaining, isStanding, knockOutActive, liveRoster, replacementIndex, swapActive, tagIn } from "../app/tag-team.ts";

const blank = () => ({ fighterId: "A", hp: 25, maxHp: 25, equipment: [], exhaustedEquipment: [], tempSpeed: 0, stage3cStatuses: [], abilityUsedRound: false, characterMarks: {}, discard: [], playArea: [], cardsThisTurn: [], xp: 1, hand: ["h1"], deck: ["d1"], belt: 2 });
const team = () => createRoster(blank(), ["A", "B", "C"], 25);

test("a roster starts with the first fighter active and two conscious on the bench", () => {
  const board = team();
  assert.equal(board.fighterId, "A");
  assert.deepEqual(consciousBench(board), [1, 2]);
  assert.equal(fightersRemaining(board), 3);
});

test("tag once during Initiate, before anything is equipped; player-owned state never moves", () => {
  const board = { ...team(), equipment: ["gear-a"], hp: 9 };
  assert.ok(canTag(board, true));
  assert.ok(!canTag(board, false), "only during your Initiate");
  assert.ok(!canTag({ ...board, cardsThisTurn: ["gear-x"] }, true), "not after equipping");
  const tagged = tagIn(board, 2);
  assert.equal(tagged.fighterId, "C");
  assert.deepEqual(tagged.equipment, [], "the incoming fighter brings their own Equipment");
  assert.equal(tagged.hp, 25);
  assert.deepEqual(tagged.hand, ["h1"]); assert.equal(tagged.belt, 2); assert.equal(tagged.xp, 1);
  assert.ok(!canTag(tagged, true), "one tag per turn");
  const back = swapActive(tagged, 0);
  assert.equal(back.hp, 9, "damage stays with the benched fighter");
  assert.deepEqual(back.equipment, ["gear-a"], "Equipment stays with its Character");
});

test("a knockout discards that fighter's Equipment and brings in the healthiest, unless the owner chose", () => {
  let board = swapActive({ ...team() }, 1);
  board = { ...swapActive({ ...board, hp: 12 }, 2), hp: 20 }; // B at 12, C at 20 active
  board = swapActive(board, 0); // A active at 25
  board = { ...board, hp: 0, equipment: ["armor-a"], playArea: ["armor-a", "x"] };
  const result = knockOutActive(board);
  assert.equal(result.knockedOutId, "A");
  assert.equal(result.replacementId, "C", "healthiest conscious bench by default");
  assert.ok(result.board.discard.includes("armor-a"));
  assert.ok(!result.board.playArea.includes("armor-a"));
  assert.equal(liveRoster(result.board)[0].knockedOut, true);
  const chosen = knockOutActive({ ...board, nextInIndex: 1 });
  assert.equal(chosen.replacementId, "B", "the owner's Next in choice wins (DDB-RUL-115)");
});

test("a side stands while any fighter is conscious and falls when the roster is gone", () => {
  let board = team();
  for (let knock = 0; knock < 2; knock += 1) { board = knockOutActive({ ...board, hp: 0 }).board; assert.ok(isStanding(board)); }
  const last = knockOutActive({ ...board, hp: 0 });
  assert.equal(last.replacementId, null);
  assert.ok(!isStanding(last.board));
  assert.equal(fightersRemaining(last.board), 0);
  assert.equal(replacementIndex(last.board), null);
  assert.equal(knockOutActive(last.board), null, "settling an already-eliminated roster is a no-op");
});

test("bots tag a badly hurt fighter out only for a clearly healthier one", () => {
  const board = team();
  assert.equal(botTagChoice({ ...board, hp: 20 }), null);
  assert.equal(botTagChoice({ ...board, hp: 6 }), 1);
  assert.equal(botTagChoice({ ...board, hp: 6, taggedThisTurn: true }), null);
});

test("boards without a roster behave exactly like Quick Duel", () => {
  const solo = blank();
  assert.equal(knockOutActive({ ...solo, hp: 0 }), null);
  assert.equal(isStanding({ ...solo, hp: 0 }), false);
  assert.equal(isStanding(solo), true);
  assert.ok(!canTag(solo, true));
});
