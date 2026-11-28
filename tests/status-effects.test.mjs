// Draft status effects (content/experimental/status-effects.json, engine/status-effects.mjs).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyStatus, canAct, createCatalog, createCombatant, effectiveSpeed, endRound, isFrozen, statusOf, strike } from "../engine/status-effects.mjs";

const catalog = createCatalog(JSON.parse(readFileSync(new URL("../content/experimental/status-effects.json", import.meta.url), "utf8")));
const pair = (over = {}) => [createCombatant({ id: "a", name: "A", atk: 3, def: 2, ...over.a }), createCombatant({ id: "b", name: "B", atk: 3, def: 2, ...over.b })];
const types = (events) => events.map((event) => event.type);

test("burn stacks to 3, ignores DEF, lasts 2 rounds and refreshes", () => {
  const [, b] = pair();
  applyStatus(catalog, b, "burn", { stacks: 2 });
  applyStatus(catalog, b, "burn", { stacks: 2 });
  assert.equal(statusOf(b, "burn").stacks, 3);
  const first = endRound(catalog, [b]);
  assert.equal(b.hp, 22);
  assert.deepEqual(types(first), ["tick"]);
  applyStatus(catalog, b, "burn");
  endRound(catalog, [b]);
  assert.ok(statusOf(b, "burn"), "reapplying refreshed the 2-round timer");
  endRound(catalog, [b]);
  assert.equal(statusOf(b, "burn"), null);
});

test("poison ticks its stacks then decays: 3 stacks cost 3 + 2 + 1", () => {
  const [, b] = pair();
  applyStatus(catalog, b, "poison", { stacks: 3 });
  endRound(catalog, [b]); endRound(catalog, [b]); endRound(catalog, [b]);
  assert.equal(b.hp, 25 - 6);
  assert.equal(statusOf(b, "poison"), null);
  applyStatus(catalog, b, "poison", { stacks: 9 });
  assert.equal(statusOf(b, "poison").stacks, 4, "capped at 4");
});

test("freeze blocks Attacks and Reactions, cuts Speed, and shatters on the first Hit", () => {
  const [a, b] = pair();
  applyStatus(catalog, a, "freeze");
  assert.equal(isFrozen(a), true);
  assert.equal(canAct(catalog, a, "attack"), false);
  assert.equal(canAct(catalog, a, "reaction"), false);
  assert.equal(effectiveSpeed(catalog, a), 1);
  assert.deepEqual(types(strike(catalog, a, b)), ["blocked"]);
  const hit = strike(catalog, b, a, { power: 3 });
  assert.deepEqual(types(hit), ["strike", "shatter", "damage"]);
  assert.equal(a.hp, 25 - (3 + 3 - 2 + 2), "ATK 3 + power 3 - DEF 2, plus 2 shatter");
  assert.equal(isFrozen(a), false);
});

test("freeze thaws at Honor, then the fighter cannot be frozen again for a round", () => {
  const [a] = pair();
  applyStatus(catalog, a, "freeze");
  assert.deepEqual(types(endRound(catalog, [a])), ["thaw"]);
  assert.deepEqual(types(applyStatus(catalog, a, "freeze")), ["resisted"], "grace round");
  endRound(catalog, [a]);
  assert.deepEqual(types(applyStatus(catalog, a, "freeze")), ["applied"]);
});

test("fire thaws a frozen fighter and still burns", () => {
  const [, b] = pair();
  applyStatus(catalog, b, "freeze");
  const events = applyStatus(catalog, b, "burn");
  assert.deepEqual(types(events), ["thaw", "applied"]);
  assert.equal(isFrozen(b), false);
});

test("an Attack fully absorbed by DEF deals nothing and does not shatter ice", () => {
  const [a, b] = pair({ a: { atk: 0 }, b: { def: 9 } });
  applyStatus(catalog, b, "freeze");
  const events = strike(catalog, a, b, { power: 3 });
  assert.deepEqual(types(events), ["strike", "absorbed"]);
  assert.equal(isFrozen(b), true);
});

test("Reimburse heals 1 on a Hit of 2+, once per round, never above Max HP", () => {
  const [a, b] = pair({ a: { hp: 20, maxHp: 25, keywords: ["reimburse"] } });
  assert.ok(types(strike(catalog, a, b, { power: 3 })).includes("heal"));
  assert.equal(a.hp, 21);
  assert.ok(types(strike(catalog, a, b, { power: 3 })).includes("heal-capped"));
  assert.equal(a.hp, 21);
  endRound(catalog, [a, b]);
  a.hp = a.maxHp;
  strike(catalog, a, b, { power: 3 });
  assert.equal(a.hp, 25, "no overheal");
  const [c, d] = pair({ a: { keywords: ["reimburse"], atk: 0 }, b: { def: 2 } });
  c.hp = 10;
  assert.ok(!types(strike(catalog, c, d, { power: 3 })).includes("heal"), "a 1 HP Hit is under the minimum");
});

test("poison blunts Reimburse", () => {
  const [a, b] = pair({ a: { hp: 20, keywords: ["reimburse"] } });
  applyStatus(catalog, a, "poison");
  assert.ok(types(strike(catalog, a, b, { power: 3 })).includes("heal-reduced"));
  assert.equal(a.hp, 20);
});

test("a KO stops further ticks and strikes", () => {
  const [a, b] = pair({ b: { hp: 1 } });
  applyStatus(catalog, b, "burn");
  const events = endRound(catalog, [b]);
  assert.deepEqual(types(events), ["tick", "ko"]);
  assert.deepEqual(strike(catalog, a, b), []);
});
