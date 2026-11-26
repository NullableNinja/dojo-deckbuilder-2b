// Combat math in the headless engine: the Final Combat Formula (rules Ch. 8), Weapons and Armor
// (Ch. 9), Piercing, combat XP and current Speed. Fixtures pick cards by canonical properties.
import assert from "node:assert/strict";
import test from "node:test";
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game } from "../engine/core.mjs";

const data = await loadGameData();
const num = (value) => Number.parseInt(String(value ?? 0), 10) || 0;
const effectsOf = (card) => data.cardEffectById.get(card.catalogId)?.effects ?? [];
const conditionKinds = (effect) => (effect.conditions ?? []).map((condition) => condition.kind);
const onlyConditions = (effect, kinds) => conditionKinds(effect).every((kind) => kinds.includes(kind));
const sum = (parts) => parts.reduce((total, part) => total + part.value, 0);

const starter = (type, zone) => data.cards.find((card) => card.cardType === "Starter" && card.details?.Type === type && card.zone === zone);
const highAttack = starter("Attack", "High");
const midAttack = starter("Attack", "Mid");
const highGuard = starter("Defense", "High");
const midGuard = starter("Defense", "Mid");

// An Attack whose own text gives its first Attack each turn a flat bonus when declared.
const declaredBonusAttack = data.cards.find((card) => card.subtype === "Attack" && card.zone !== "Any" && effectsOf(card).some((effect) => effect.trigger === "onAttackDeclared" && effect.action === "modifyAttackPower" && num(effect.amount) > 0 && onlyConditions(effect, ["firstAttackThisTurn"])) && effectsOf(card).every((effect) => effect.trigger !== "passive"));
const declaredBonus = num(effectsOf(declaredBonusAttack).find((effect) => effect.trigger === "onAttackDeclared").amount);
// A Location whose only Attack rule is an unconditional Attack Power change.
const flatAttackLocation = data.cards.find((card) => card.cardType === "Location" && effectsOf(card).filter((effect) => effect.conditions?.some((condition) => condition.kind === "locationEvent" && condition.value === "attack")).length === 1 && effectsOf(card).some((effect) => effect.action === "modifyAttackPower" && onlyConditions(effect, ["locationEvent"])));
const flatAttackAmount = num(effectsOf(flatAttackLocation).find((effect) => effect.action === "modifyAttackPower").amount);
// A Location whose Defense rule is an unconditional Guard change.
const flatGuardLocation = data.cards.find((card) => card.cardType === "Location" && effectsOf(card).some((effect) => effect.action === "modifyGuard" && num(effect.amount) < 0 && onlyConditions(effect, ["locationEvent"]) && effect.conditions.some((condition) => condition.value === "defense")));
// A Location whose only Attack rule needs an Attack tag, and a plain Attack carrying that tag.
const attackRules = (card) => effectsOf(card).filter((effect) => effect.conditions?.some((condition) => condition.kind === "locationEvent" && condition.value === "attack"));
const taggedAttackLocation = data.cards.find((card) => card.cardType === "Location" && attackRules(card).length === 1 && attackRules(card)[0].action === "modifyAttackPower" && onlyConditions(attackRules(card)[0], ["locationEvent", "attackTagAny"]));
const taggedEffect = attackRules(taggedAttackLocation)[0];
const requiredTags = taggedEffect.conditions.find((condition) => condition.kind === "attackTagAny").value;
const taggedAttack = data.cards.find((card) => card.subtype === "Attack" && card.zone !== "Any" && requiredTags.some((tag) => card.tags?.includes(tag)) && effectsOf(card).every((effect) => !["passive", "onAttackDeclared"].includes(effect.trigger)));
// A Location that changes the Attack Bonus of Weapons with a given tag.
const weaponTagLocation = data.cards.find((card) => card.cardType === "Location" && effectsOf(card).some((effect) => conditionKinds(effect).includes("equipmentTagAny") && num(effect.amount) > 0 && data.cards.some((weapon) => weapon.subtype === "Weapon" && effect.conditions.find((condition) => condition.kind === "equipmentTagAny").value.some((tag) => weapon.tags?.includes(tag)))));
const weaponTagEffect = effectsOf(weaponTagLocation).find((effect) => conditionKinds(effect).includes("equipmentTagAny"));
const weaponTags = weaponTagEffect.conditions.find((condition) => condition.kind === "equipmentTagAny").value;

const weapons = data.cards.filter((card) => card.subtype === "Weapon" && num(card.stats?.["Attack Bonus"]) > 0 && num(card.stats?.Hands) === 1 && !effectsOf(card).some((effect) => effect.trigger === "passive" || effect.trigger === "onAttackDeclared"));
const matchingWeapon = weapons.find((card) => weaponTags.some((tag) => card.tags?.includes(tag)));
const otherWeapon = weapons.find((card) => !weaponTags.some((tag) => card.tags?.includes(tag)));

// Armor whose printed Guard is not restated by an effect, protecting exactly one zone.
const restates = (card) => effectsOf(card).some((effect) => effect.effect === "equipment.modifyDefenseContribution" && effect.duration === "whileEquipped" && num(effect.amount) === num(card.stats?.Guard));
const printedOnlyArmor = data.cards.find((card) => card.subtype === "Defense Equipment" && card.zone === "Mid" && num(card.stats?.Guard) > 0 && !restates(card) && effectsOf(card).every((effect) => effect.trigger !== "passive"));
const restatedArmor = data.cards.find((card) => card.subtype === "Defense Equipment" && card.zone === "Mid" && num(card.stats?.Guard) > 0 && restates(card) && effectsOf(card).every((effect) => effect.trigger === "passive" && conditionKinds(effect).every((kind) => kind === "incomingZones")));
// An Attack whose Hit lowers the target's Speed for a while.
const speedPenaltyAttack = data.cards.find((card) => card.subtype === "Attack" && card.zone !== "Any" && effectsOf(card).some((effect) => effect.trigger === "onHit" && effect.action === "modifySpeed" && effect.target === "opponent" && effect.duration && effect.duration !== "immediate"));
const speedPenalty = effectsOf(speedPenaltyAttack).find((effect) => effect.action === "modifySpeed");
// Equipment with a static Speed change and one with a Speed floor.
const slowArmor = data.cards.find((card) => card.subtype === "Defense Equipment" && effectsOf(card).some((effect) => effect.action === "modifySpeed" && effect.duration === "whileEquipped" && !(effect.conditions ?? []).length));
const speedFloorWeapon = data.cards.find((card) => card.subtype === "Weapon" && effectsOf(card).some((effect) => effect.action === "minimumSpeed" && effect.duration === "whileEquipped"));

/** A two-player game paused in player 0's Yell, with no Location, Equipment or statuses. */
function table() {
  const game = new Game(data, { seed: 5, mode: "standard-clash", players: 2 });
  while (!(game.phase === "Yell" && game.activePlayer === 0)) {
    game.advanceAutomaticEvents();
    if (game.pendingChoice) { game.resolveChoice(game.defaultChoice()); continue; }
    if (game.phase === "Yell" && game.activePlayer === 0) break;
    game.applyAction({ type: "pass", playerId: game.activePlayer });
  }
  game.currentLocation = null;
  for (const player of game.players) Object.assign(player, { equipment: [], played: [], statuses: [], exhaustedEquipment: [], hand: [], tempSpeed: 0, attackCount: 0, nextAttackPower: 0, nextAttackFlow: false, tempo: false });
  const [attacker, defender] = game.players;
  return { game, attacker, defender };
}
const equip = (game, player, card) => { const instance = game.cardInstance(card); player.equipment.push(instance); player.played.push(instance); return instance; };
function strike(game, attacker, defender, attackCard, defenseCard = null) {
  const card = game.cardInstance(attackCard); attacker.hand.push(card);
  const defense = defenseCard ? game.cardInstance(defenseCard) : undefined; if (defense) defender.hand.push(defense);
  const result = game.resolveAttack(attacker, defender, card, { defenseCard: defense, zone: card.zone, useTempo: false });
  assert.equal(result.block, Math.max(0, sum(result.breakdown.blockParts) - result.breakdown.piercing), "the Defense breakdown adds up");
  assert.equal(result.attack, sum(result.breakdown.attackParts), "the Attack breakdown adds up");
  return result;
}
const part = (parts, label) => parts.find((entry) => entry.label === label)?.value ?? 0;

test("fixtures exist", () => {
  for (const fixture of [highAttack, midAttack, highGuard, midGuard, declaredBonusAttack, flatAttackLocation, flatGuardLocation, taggedAttackLocation, taggedAttack, weaponTagLocation, matchingWeapon, otherWeapon, printedOnlyArmor, restatedArmor, speedPenaltyAttack, slowArmor, speedFloorWeapon]) assert.ok(fixture);
});

test("a Location's Attack modifier applies once and the Attack card keeps its own effects", () => {
  const plain = table();
  const baseline = strike(plain.game, plain.attacker, plain.defender, declaredBonusAttack);
  assert.equal(part(baseline.breakdown.attackParts, "Effect"), declaredBonus);
  const scene = table();
  scene.game.currentLocation = scene.game.cardInstance(flatAttackLocation);
  const result = strike(scene.game, scene.attacker, scene.defender, declaredBonusAttack);
  assert.equal(part(result.breakdown.attackParts, "Location"), flatAttackAmount);
  assert.equal(part(result.breakdown.attackParts, "Effect"), declaredBonus, "the card's own bonus is not replaced by the Location's");
  assert.equal(result.attack, baseline.attack + flatAttackAmount);
});

test("Location Guard changes apply only to a played Defense card, and Guard never goes below 0", () => {
  const bare = table();
  bare.game.currentLocation = bare.game.cardInstance(flatGuardLocation);
  assert.equal(strike(bare.game, bare.attacker, bare.defender, highAttack).block, bare.defender.def, "no Defense card: standing DEF only");
  const guarded = table();
  guarded.game.currentLocation = guarded.game.cardInstance(flatGuardLocation);
  const amount = num(effectsOf(flatGuardLocation).find((effect) => effect.action === "modifyGuard").amount);
  const result = strike(guarded.game, guarded.attacker, guarded.defender, highAttack, highGuard);
  assert.equal(result.block, guarded.defender.def + Math.max(0, num(highGuard.stats.Guard) + amount));
});

test("a tagged Location Attack rule applies only to Attacks with the tag", () => {
  assert.ok(!requiredTags.some((tag) => highAttack.tags.includes(tag)));
  const plain = table();
  const baseline = strike(plain.game, plain.attacker, plain.defender, highAttack);
  const scene = table(); scene.game.currentLocation = scene.game.cardInstance(taggedAttackLocation);
  assert.equal(strike(scene.game, scene.attacker, scene.defender, highAttack).attack, baseline.attack);
  const tagged = table(); tagged.game.currentLocation = tagged.game.cardInstance(taggedAttackLocation);
  assert.equal(part(strike(tagged.game, tagged.attacker, tagged.defender, taggedAttack).breakdown.attackParts, "Location"), num(taggedEffect.amount));
});

test("every equipped Weapon adds its printed Attack Bonus to each Attack", () => {
  const { game, attacker, defender } = table();
  equip(game, attacker, matchingWeapon); equip(game, attacker, otherWeapon);
  const bonus = num(matchingWeapon.stats["Attack Bonus"]) + num(otherWeapon.stats["Attack Bonus"]);
  const first = strike(game, attacker, defender, highAttack);
  const second = strike(game, attacker, defender, highAttack);
  assert.equal(part(first.breakdown.attackParts, "Weapon"), bonus);
  assert.equal(part(second.breakdown.attackParts, "Weapon"), bonus, "the bonus applies to every Attack, not just the first");
});

test("Location text changes the Attack Bonus of matching Weapons only", () => {
  const { game, attacker, defender } = table();
  game.currentLocation = game.cardInstance(weaponTagLocation);
  equip(game, attacker, matchingWeapon); equip(game, attacker, otherWeapon);
  const result = strike(game, attacker, defender, highAttack);
  assert.equal(part(result.breakdown.attackParts, "Weapon"), num(matchingWeapon.stats["Attack Bonus"]) + num(weaponTagEffect.amount) + num(otherWeapon.stats["Attack Bonus"]));
  const unarmed = table(); unarmed.game.currentLocation = unarmed.game.cardInstance(weaponTagLocation);
  assert.equal(part(strike(unarmed.game, unarmed.attacker, unarmed.defender, highAttack).breakdown.attackParts, "Weapon"), 0, "no Weapon, nothing to modify");
});

test("Armor adds its printed DEF in its zone only, without doubling a restated value", () => {
  const { game, attacker, defender } = table();
  equip(game, defender, printedOnlyArmor);
  assert.equal(part(strike(game, attacker, defender, midAttack).breakdown.blockParts, "Armor"), num(printedOnlyArmor.stats.Guard));
  assert.equal(part(strike(game, attacker, defender, highAttack).breakdown.blockParts, "Armor"), 0, "Armor does not cover another zone");
  const restated = table();
  equip(restated.game, restated.defender, restatedArmor);
  assert.equal(part(strike(restated.game, restated.attacker, restated.defender, midAttack).breakdown.blockParts, "Armor"), num(restatedArmor.stats.Guard));
});

test("Piercing ignores Armor DEF only, never Character DEF or Guard", () => {
  const bare = table();
  bare.attacker.statuses.push({ id: "test:pierce", action: "piercing", amount: 5, duration: "nextAttack" });
  const unarmored = strike(bare.game, bare.attacker, bare.defender, midAttack, midGuard);
  assert.equal(unarmored.block, bare.defender.def + num(midGuard.stats.Guard));
  assert.equal(unarmored.breakdown.piercing, 0);
  const armored = table();
  equip(armored.game, armored.defender, printedOnlyArmor);
  armored.attacker.statuses.push({ id: "test:pierce", action: "piercing", amount: 1, duration: "nextAttack" });
  const result = strike(armored.game, armored.attacker, armored.defender, midAttack, midGuard);
  assert.equal(result.breakdown.piercing, 1);
  assert.equal(result.block, armored.defender.def + num(midGuard.stats.Guard) + num(printedOnlyArmor.stats.Guard) - 1);
});

test("every legal Attack and every legal Defense card earn XP, Hit or Block", () => {
  const { game, attacker, defender } = table();
  const xp = () => [attacker.xp, defender.xp];
  const before = xp();
  attacker.atk = 0; defender.def = 10;
  assert.equal(strike(game, attacker, defender, highAttack, highGuard).damage, 0);
  assert.deepEqual(xp(), [before[0] + 1, before[1] + 1], "a Blocked Attack still earns the attacker XP");
  attacker.atk = 5; defender.def = 0;
  const mid = xp();
  assert.ok(strike(game, attacker, defender, highAttack, highGuard).damage > 0);
  assert.deepEqual(xp(), [mid[0] + 1, mid[1] + 1], "a failed Defense still earns the defender XP");
  defender.hp = defender.maxHp;
  const late = xp();
  assert.ok(strike(game, attacker, defender, highAttack).damage < defender.maxHp);
  assert.deepEqual(xp(), [late[0] + 1, late[1]], "no Defense card, no Defense XP");
});

test("an opponent-targeted Speed penalty lowers the target's current Speed, not the attacker's", () => {
  const { game, attacker, defender } = table();
  attacker.atk = 20;
  const [attackerSpeed, defenderSpeed] = [game.currentSpeed(attacker), game.currentSpeed(defender)];
  assert.ok(strike(game, attacker, defender, speedPenaltyAttack).damage > 0);
  assert.equal(game.currentSpeed(attacker), attackerSpeed);
  assert.equal(game.currentSpeed(defender), defenderSpeed + num(speedPenalty.amount));
  game.expireStatuses(defender, speedPenalty.duration);
  assert.equal(game.currentSpeed(defender), defenderSpeed, "the penalty ends with its duration");
});

test("equipped Speed changes count once while equipped, and a Speed floor never raises printed Speed", () => {
  const { game, attacker, defender } = table();
  const printed = defender.speed;
  const armor = equip(game, defender, slowArmor);
  const change = num(effectsOf(slowArmor).find((effect) => effect.action === "modifySpeed").amount);
  strike(game, attacker, defender, highAttack); strike(game, attacker, defender, highAttack);
  assert.equal(game.currentSpeed(defender), Math.max(0, printed + change), "two strikes do not stack the Armor's Speed change");
  defender.equipment = defender.equipment.filter((card) => card !== armor);
  assert.equal(game.currentSpeed(defender), printed);
  const floor = num(effectsOf(speedFloorWeapon).find((effect) => effect.action === "minimumSpeed").amount);
  const weapon = equip(game, attacker, speedFloorWeapon);
  attacker.speed = floor - 1; attacker.tempSpeed = -3;
  strike(game, attacker, defender, highAttack);
  assert.equal(game.currentSpeed(attacker), floor);
  attacker.equipment = attacker.equipment.filter((card) => card !== weapon);
  assert.equal(attacker.speed, floor - 1, "the floor does not rewrite printed Speed");
});

test("Defense Practice is not a played Defense: the first Defense card each round is still the first", () => {
  const { game, attacker } = table();
  const practiced = game.cardInstance(highGuard); attacker.hand.push(practiced);
  assert.ok(game.practice(attacker, practiced));
  assert.equal(attacker.turnStats.defenseCount ?? 0, 0);
  assert.equal(Boolean(attacker.turnStats.playedDefenseSinceLastTurn), false);
});

test("Tempo gives +1 Attack Power only to the faster attacker", () => {
  const faster = table();
  faster.attacker.tempo = true; faster.attacker.speed = faster.defender.speed + 1;
  const card = faster.game.cardInstance(highAttack); faster.attacker.hand.push(card);
  const result = faster.game.resolveAttack(faster.attacker, faster.defender, card, { zone: card.zone });
  assert.equal(part(result.breakdown.attackParts, "Tempo"), data.definition.turn.tempoAttackPower);
  assert.equal(faster.attacker.tempo, false, "Tempo is spent");
  for (const gap of [0, -1]) {
    const slower = table();
    slower.attacker.tempo = true; slower.attacker.speed = slower.defender.speed + gap;
    const attack = slower.game.cardInstance(highAttack); slower.attacker.hand.push(attack);
    assert.equal(part(slower.game.resolveAttack(slower.attacker, slower.defender, attack, { zone: attack.zone }).breakdown.attackParts, "Tempo"), 0, "a tie or a slower attacker gets no Tempo");
    assert.equal(slower.attacker.tempo, true, "unused Tempo is kept");
  }
});

test("Tempo gives +1 Guard to the faster defender's Defense card", () => {
  const { game, attacker, defender } = table();
  defender.tempo = true; defender.speed = attacker.speed + 1;
  assert.equal(part(strike(game, attacker, defender, highAttack).breakdown.blockParts, "Tempo"), 0, "no Defense card, no Tempo Guard");
  assert.equal(defender.tempo, true);
  const result = strike(game, attacker, defender, highAttack, highGuard);
  assert.equal(part(result.breakdown.blockParts, "Tempo"), data.definition.turn.tempoDefenseGuard);
  assert.equal(defender.tempo, false);
});

test("Tempo compares current Speed, and a Boss by its printed Speed", () => {
  const { game, attacker, defender } = table();
  attacker.tempo = true; attacker.speed = defender.speed + 1;
  defender.statuses.push({ id: "test:speed", action: "modifySpeed", amount: 2, duration: "endOfRound" });
  assert.equal(game.hasTempoAdvantage(attacker, defender), false, "a timed Speed bonus counts");
  const boss = { isBoss: true, speed: attacker.speed - 1, tempSpeed: 5, statuses: [], equipment: [] };
  assert.equal(game.hasTempoAdvantage(attacker, boss), true, "the Boss's printed Speed is used");
});
