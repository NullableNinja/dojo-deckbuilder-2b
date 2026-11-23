// Browser Boss Blitz rules (app/boss-blitz.ts): ladder, stage stats, Arsenal reveals, Boss Guard,
// Enraged, the Enrage-threshold ruling and Boss strike outcomes.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BOSS_RULES, applyBossStrikeOutcome, bossAttacksAllowed, bossGuardFor, drawBossLadder, isEnraged, loadBossStage, revealBossAttack, spendBossGuard, stageFits } from "../app/boss-blitz.ts";

const cards = JSON.parse(readFileSync(new URL("../app/data/cards.json", import.meta.url), "utf8")).cards;
const effects = JSON.parse(readFileSync(new URL("../app/data/card-effects.json", import.meta.url), "utf8")).cards;
const byId = new Map(cards.map((card) => [card.id, card]));
const cardFor = (id) => byId.get(id);
const keep = (items) => [...items];
const profiles = cards.filter((card) => card.subtype === "Boss Profile");
const arsenal = cards.filter((card) => BOSS_RULES.arsenal.subtypes.includes(card.subtype)).map((card) => card.id);
const bySubtype = (subtype, predicate = () => true) => cards.find((card) => card.subtype === subtype && predicate(card));
const withResolver = (resolver) => cards.find((card) => effects[card.catalogId]?.effects.some((effect) => effect.resolver === resolver));
const blankBoss = (ladder) => ({ fighterId: ladder[0], hp: 1, maxHp: 1, tempSpeed: 0, nextAttackBonus: 0, tempo: true, hand: ["x"], deck: ["y"], discard: [], playArea: [], equipment: ["z"], bossProfiles: ladder });
const player = () => ({ hp: 25, maxHp: 25, tempSpeed: 0, nextAttackBonus: 0, nextDefenseCardBonus: 0, tempo: true });

test("the ladder draws three distinct Profiles that fit their stages", () => {
  let seed = 7; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let run = 0; run < 25; run += 1) {
    const ladder = drawBossLadder(profiles, random);
    assert.equal(new Set(ladder).size, 3);
    ladder.forEach((id, index) => assert.ok(stageFits(cardFor(id), BOSS_RULES.stages[index])));
  }
});

test("loading a stage uses the Profile, Stage HP and bonus, and a fresh 32-card Arsenal with no hand or gear", () => {
  const ladder = drawBossLadder(profiles);
  BOSS_RULES.stages.forEach((stage, index) => {
    const boss = loadBossStage(blankBoss(ladder), index, arsenal, keep);
    assert.equal(boss.fighterId, ladder[index]);
    assert.equal(boss.hp, stage.hp); assert.equal(boss.maxHp, stage.hp);
    assert.equal(boss.bossAttackBonus, stage.attackBonus);
    assert.equal(boss.bossArsenal.deck.length, BOSS_RULES.arsenal.size);
    assert.deepEqual([boss.hand, boss.deck, boss.equipment], [[], [], []]);
    assert.equal(boss.tempo, false, "Bosses never use Tempo");
  });
});

test("reveals: Techniques resolve, a new Boss Defense replaces the old Guard, the first Attack is returned", () => {
  const ladder = drawBossLadder(profiles);
  const [oldGuard, newGuard] = cards.filter((card) => card.subtype === "Boss Defense").slice(0, 2);
  const heal = withResolver("boss.technique.heal");
  const attack = bySubtype("Boss Attack");
  const boss = { ...loadBossStage(blankBoss(ladder), 0, arsenal, keep), hp: 10, bossGuardId: oldGuard.id, bossArsenal: { deck: [heal.id, newGuard.id, attack.id], discard: [] } };
  const result = revealBossAttack(boss, player(), cardFor, keep);
  assert.equal(result.attackId, attack.id);
  assert.equal(result.boss.bossGuardId, newGuard.id);
  assert.ok(result.boss.bossArsenal.discard.includes(oldGuard.id));
  assert.ok(result.boss.hp > 10, "the healing Technique resolved");
});

test("Boss Guard adds its Guard only to a matching zone and is spent by it", () => {
  const guard = bySubtype("Boss Defense");
  const other = ["High", "Mid", "Low"].find((zone) => zone !== guard.zone);
  const boss = { bossGuardId: guard.id, bossArsenal: { deck: [], discard: [] } };
  assert.equal(bossGuardFor(boss, other, cardFor), 0);
  assert.equal(spendBossGuard(boss, other, cardFor).bossGuardId, guard.id);
  assert.equal(bossGuardFor(boss, guard.zone, cardFor), Number(guard.stats.Guard));
  const spent = spendBossGuard(boss, guard.zone, cardFor);
  assert.equal(spent.bossGuardId, null);
  assert.ok(spent.bossArsenal.discard.includes(guard.id));
});

test("only the solo Final Boss Enrages, at 30 HP or less, for two Attacks", () => {
  const ladder = drawBossLadder(profiles);
  const final = loadBossStage(blankBoss(ladder), BOSS_RULES.stages.length - 1, arsenal, keep);
  assert.equal(bossAttacksAllowed(final), 1);
  const enraged = { ...final, hp: 30 };
  assert.ok(isEnraged(enraged)); assert.equal(bossAttacksAllowed(enraged), 2);
  const rival = { ...loadBossStage(blankBoss(ladder), 0, arsenal, keep), hp: 3 };
  assert.ok(!isEnraged(rival)); assert.equal(bossAttacksAllowed(rival), 1);
});

test("a threshold Technique gives +1 below a Boss with no Enrage Threshold, +2 when Enraged (DDB-RUL-108)", () => {
  const ladder = drawBossLadder(profiles);
  const bell = withResolver("boss.technique.conditionalNextAttackPower");
  const attack = bySubtype("Boss Attack");
  const rival = { ...loadBossStage(blankBoss(ladder), 0, arsenal, keep), hp: 5, bossArsenal: { deck: [bell.id, attack.id], discard: [] } };
  assert.equal(revealBossAttack(rival, player(), cardFor, keep).boss.nextAttackBonus, 1);
  const final = { ...loadBossStage(blankBoss(ladder), 2, arsenal, keep), hp: 20, bossArsenal: { deck: [bell.id, attack.id], discard: [] } };
  assert.equal(revealBossAttack(final, player(), cardFor, keep).boss.nextAttackBonus, 2);
});

test("Boss Attack hit effects land on the player; block effects empower the Boss", () => {
  const ladder = drawBossLadder(profiles);
  const boss = loadBossStage(blankBoss(ladder), 0, arsenal, keep);
  const speed = withResolver("boss.attack.hitSpeedPenalty");
  assert.equal(applyBossStrikeOutcome(boss, player(), speed, "hit", false, cardFor).player.tempSpeed, -1);
  const lock = withResolver("boss.attack.hitTempoLock");
  assert.equal(applyBossStrikeOutcome(boss, player(), lock, "hit", false, cardFor).player.tempo, false);
  const empower = withResolver("boss.attack.blockNextPower");
  assert.equal(applyBossStrikeOutcome(boss, player(), empower, "block", true, cardFor).boss.nextAttackBonus, 1);
  assert.equal(applyBossStrikeOutcome(boss, player(), empower, "hit", false, cardFor).boss.nextAttackBonus, 0);
});
