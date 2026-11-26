// Dojo Drama: Boss Blitz in the headless engine (rules Ch. 14, rulings DDB-RUL-001..008, 107..111).
import assert from "node:assert/strict";
import test from "node:test";
import { loadGameData } from "../engine/rules-loader.mjs";
import { BossBlitzGame } from "../engine/boss-blitz.mjs";
import { createModeGame } from "../engine/game-factory.mjs";
import { replayGame, replayMatches } from "../engine/replay.mjs";
import { baselinePolicy } from "../engine/policies.mjs";

const data = await loadGameData();
const drama = data.definition.modes.find((mode) => mode.id === "dojo-drama");
const bossCard = (subtype, predicate = () => true) => data.cards.find((card) => card.subtype === subtype && predicate(card));
const conditionalTechnique = Object.entries(data.cardEffects.cards).find(([, entry]) => entry.effects.some((effect) => effect.resolver === "boss.technique.conditionalNextAttackPower"))[0];

test("Quick Boss Blitz draws distinct Profiles that fit each stage", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const game = new BossBlitzGame(data, { seed });
    assert.equal(new Set(game.bossProfiles.map((card) => card.catalogId)).size, 3);
    game.bossProfiles.forEach((profile, index) => assert.ok(game.stageFits(profile, drama.boss.stages[index]), `${profile.name} fits ${drama.boss.stages[index].title}`));
  }
});

test("each stage uses printed Profile stats plus the Stage bonus, with solo or co-op HP", () => {
  const solo = new BossBlitzGame(data, { seed: 7 });
  const coop = new BossBlitzGame(data, { seed: 7, players: 2 });
  drama.boss.stages.forEach((stage, index) => {
    solo.loadStage(index); coop.loadStage(index);
    const profile = solo.bossProfiles[index];
    assert.equal(solo.boss.maxHp, stage.hp);
    assert.equal(coop.boss.maxHp, stage.coopHp);
    assert.equal(solo.boss.atk, Number(profile.stats.ATK) + stage.attackBonus);
    assert.equal(solo.boss.def, Number(profile.stats.DEF));
    assert.equal(solo.boss.deck.length, drama.boss.arsenal.size, "a fresh 32-card Arsenal each stage");
  });
});

test("the Boss never earns XP and never uses Tempo", () => {
  const game = new BossBlitzGame(data, { seed: 8 });
  assert.equal(game.gainXp(game.boss, 5, "test"), 0);
  assert.equal(game.boss.xp, 0);
  game.advanceAutomaticEvents();
  assert.equal(game.boss.tempo, false);
});

test("players win Speed ties with the Boss", () => {
  const game = new BossBlitzGame(data, { seed: 9 });
  const [player] = game.humans();
  assert.ok(game.seatTiebreak(player) < game.seatTiebreak(game.boss));
});

test("Boss Guard reduces a matching Attack's damage, then is discarded (DDB-RUL-117)", () => {
  const game = new BossBlitzGame(data, { seed: 10 });
  const boss = game.boss; const [player] = game.humans();
  const guardCard = game.cardInstance(bossCard("Boss Defense"));
  const attack = player.hand.find((card) => Number(card.stats?.["Attack Power"]) > 0) ?? game.cardInstance(data.cards.find((card) => card.subtype === "Attack"));
  if (!player.hand.includes(attack)) player.hand.push(attack);
  const otherZone = ["High", "Mid", "Low"].find((zone) => zone !== guardCard.zone);
  boss.guardCard = guardCard;
  game.resolveAttack(player, boss, attack, { zone: otherZone });
  assert.equal(boss.guardCard, guardCard, "an unmatched Attack leaves Boss Guard in place");
  const second = game.cardInstance(attack); player.hand.push(second);
  const hpBefore = boss.hp; const defBefore = boss.def;
  const result = game.resolveAttack(player, boss, second, { zone: guardCard.zone });
  assert.equal(boss.guardCard, null, "a matched Attack spends Boss Guard");
  assert.ok(boss.discard.includes(guardCard));
  const guardAmount = Number(guardCard.stats.Guard);
  assert.ok(result.block < defBefore + guardAmount || guardAmount === 0, "Guard no longer adds to the Boss's Defense");
  assert.equal(hpBefore - boss.hp, Math.max(0, result.attack - result.block - guardAmount), "Guard reduces the damage by its amount");
});

test("a newly revealed Boss Defense replaces the old Boss Guard", () => {
  const game = new BossBlitzGame(data, { seed: 11 });
  const boss = game.boss;
  const [first, second] = data.cards.filter((card) => card.subtype === "Boss Defense").slice(0, 2).map((card) => game.cardInstance(card));
  const attack = game.cardInstance(bossCard("Boss Attack"));
  boss.guardCard = first; boss.deck = [attack, second];
  assert.equal(game.revealUntilAttack(game.humans()[0]), attack);
  assert.equal(boss.guardCard, second);
  assert.ok(boss.discard.includes(first));
});

test("Enraged solo Final Boss makes two Attacks at 30 HP or less; co-op always two, never Enraged", () => {
  const solo = new BossBlitzGame(data, { seed: 12 });
  const final = drama.boss.stages.length - 1;
  solo.loadStage(final);
  assert.equal(solo.bossAttacksAllowed(), 1);
  solo.boss.hp = drama.boss.stages[final].enrage.hpAtMost;
  assert.equal(solo.bossAttacksAllowed(), 2);
  solo.loadStage(0); solo.boss.hp = 5;
  assert.equal(solo.bossAttacksAllowed(), 1, "Rival and Mini-Boss never Enrage");
  const coop = new BossBlitzGame(data, { seed: 12, players: 2 });
  coop.loadStage(final); coop.boss.hp = 1;
  assert.equal(coop.bossAttacksAllowed(), 2);
});

test("a Boss with no Enrage Threshold takes the 'otherwise' branch (DDB-RUL-108)", () => {
  const game = new BossBlitzGame(data, { seed: 13 });
  game.loadStage(0); game.boss.hp = 10;
  game.resolveTechnique(game.cardInstance(data.byId.get(conditionalTechnique)), game.humans()[0]);
  assert.equal(game.statusValue(game.boss, "modifyAttackPower", { consumeDuration: "nextAttack" }), 1);
  const final = new BossBlitzGame(data, { seed: 13 });
  final.loadStage(drama.boss.stages.length - 1); final.boss.hp = 20;
  final.resolveTechnique(final.cardInstance(data.byId.get(conditionalTechnique)), final.humans()[0]);
  assert.equal(final.statusValue(final.boss, "modifyAttackPower", { consumeDuration: "nextAttack" }), 2);
});

test("stage victory: +5 XP instead of +2, heal the active fighter 8, refresh the Market, next Boss at Honor", () => {
  const game = new BossBlitzGame(data, { seed: 14 });
  const [player] = game.humans();
  player.hp = 10; const xp = player.xp; const market = game.market.map((card) => card.instanceId);
  game.activePlayer = player.id; game.phase = "Yell";
  game.boss.hp = 0; game.boss.lastDamagedBy = player.id;
  game.checkWinner();
  assert.equal(player.xp, xp + drama.boss.stageVictory.xp);
  assert.equal(player.hp, 18);
  assert.notDeepEqual(game.market.map((card) => card.instanceId), market);
  assert.equal(game.pendingStage, 1);
  assert.equal(game.winner, null);
  game.phase = "Honor";
  game.advanceAutomaticEvents();
  assert.equal(game.stageIndex, 1);
  assert.equal(game.boss.hp, drama.boss.stages[1].hp);
});

test("KO the Final Boss to win; lose when every player fighter is KO'd", () => {
  const win = new BossBlitzGame(data, { seed: 15 });
  win.loadStage(drama.boss.stages.length - 1);
  const [player] = win.humans();
  win.boss.hp = 0; win.boss.lastDamagedBy = player.id;
  win.checkWinner();
  assert.equal(win.winner, player.id);
  assert.equal(win.reason, "final-boss");
  const lose = new BossBlitzGame(data, { seed: 16 });
  const [doomed] = lose.humans();
  for (let knock = 0; knock < 3; knock += 1) { doomed.hp = 0; doomed.lastDamagedBy = lose.boss.id; lose.checkWinner(); }
  assert.ok(doomed.eliminated);
  assert.equal(lose.winner, lose.boss.id);
  assert.equal(lose.reason, "boss-victory");
});

test("full solo and co-op runs complete legally and replay exactly", () => {
  for (const players of [1, 2]) {
    const original = createModeGame(data, { seed: 21, mode: "dojo-drama", players }).run({ policy: baselinePolicy });
    assert.deepEqual(original.invariantFailures, []);
    assert.notEqual(original.winner, null);
    assert.ok(replayMatches(original, replayGame(data, original)));
  }
});
