// Equipment, Reactions, Consumables and choice plumbing in the shared engine
// (rules: Armor and Gear, Consumables, Items and Tools, The Reaction Window; glossary: Ready, Anytime).
// Fixtures pick cards by canonical properties and structured effects, never by name or ID.
import assert from "node:assert/strict";
import test from "node:test";
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game, HEADLESS_RESOLVER_ACTIONS } from "../engine/core.mjs";
import { randomLegalPolicy } from "../engine/policies.mjs";
import { difficultyPolicy } from "../engine/difficulty.mjs";

const data = await loadGameData();
const effectsOf = (card) => data.cardEffectById.get(card.catalogId)?.effects ?? [];
const kinds = (effect) => (effect.conditions ?? []).map((condition) => condition.kind);
const find = (predicate) => data.cards.find(predicate);
const withEffect = (filter, predicate) => find((card) => filter(card) && effectsOf(card).some(predicate));
const starter = (type, zone) => find((card) => card.cardType === "Starter" && card.details?.Type === type && card.zone === zone);

const highAttack = starter("Attack", "High");
const lowAttack = starter("Attack", "Low");
const highGuard = starter("Defense", "High");
const lowGuard = starter("Defense", "Low");
const consumable = (timing, predicate = () => true) => find((card) => card.subtype === "Consumable" && card.timing === timing && predicate(card));
const lowOnlyReaction = withEffect((card) => card.subtype === "Reaction Item", (effect) => effect.trigger === "onAttackDeclared" && effect.resolver === "reaction.reduceDeclaredAttackPower" && JSON.stringify(effect.conditions ?? []).includes("\"Low\""));
const blockReaction = withEffect((card) => card.subtype === "Reaction Item", (effect) => effect.trigger === "onBlock");
const preventConsumable = consumable("Reaction", (card) => effectsOf(card).length === 1 && effectsOf(card)[0].action === "preventDamage" && !effectsOf(card)[0].duration);
const untargetableConsumable = consumable("Reaction", (card) => effectsOf(card).some((effect) => HEADLESS_RESOLVER_ACTIONS[effect.resolver] === "untargetable"));
const turnConsumable = consumable("Turn");
const anytimeHeal = consumable("Anytime", (card) => effectsOf(card).every((effect) => effect.action === "heal" && !kinds(effect).length) && effectsOf(card).length === 1);
const ascendDestroying = consumable("Ascend", (card) => effectsOf(card).some((effect) => effect.action === "destroy" && effect.target === "source"));
const firstAttackWeapon = withEffect((card) => card.subtype === "Weapon", (effect) => effect.trigger === "onAttackDeclared" && effect.action === "modifyAttackPower" && kinds(effect).join() === "firstAttackThisTurn");
const incomingPenaltyArmor = withEffect((card) => card.subtype === "Defense Equipment" && effectsOf(card).every((effect) => effect.trigger === "onAttackDeclared"), (effect) => effect.target === "opponent" && effect.action === "modifyAttackPower" && kinds(effect).includes("firstIncomingAttackThisRound"));
const afterDefenseWeapon = withEffect((card) => card.subtype === "Weapon", (effect) => effect.trigger === "onDefenseDeclared" && effect.action === "modifyAttackPower" && effect.duration === "nextAttack");
const afterKataGear = withEffect((card) => card.subtype === "Gear", (effect) => effect.trigger === "afterResolve" && kinds(effect).includes("resolvedCardType"));
const zoneCallGear = withEffect((card) => card.subtype === "Gear", (effect) => effect.trigger === "onAttackDeclared" && JSON.stringify(effect.conditions ?? []).includes("incoming-zone"));
const discardOrRetargetArmor = withEffect(() => true, (effect) => JSON.stringify(effect.conditions ?? []).includes("discard-or-retarget"));
const blockCycleWeapon = withEffect((card) => card.subtype === "Weapon", (effect) => effect.trigger === "onBlock" && kinds(effect).includes("choiceKind") && kinds(effect).includes("draw"));
const dodgeDefense = find((card) => card.subtype === "Defense" && (card.tags ?? []).includes("Dodge") && ["High", "Any"].includes(card.zone) && !effectsOf(card).some((effect) => effect.trigger === "onBlock"));
const kata = find((card) => card.subtype === "Kata" && !effectsOf(card).some((effect) => effect.trigger === "onPlay" && ["discard", "moveCard", "custom"].includes(effect.action)));

/** A two-player game at player 0's Yell with chosen hands and neutral combat stats. */
function yellWith(attackerHand, defenderHand, { seed = 5, definition = null } = {}) {
  const game = new Game(definition ? { ...data, definition } : data, { seed, mode: "standard-clash", players: 2 });
  advanceTo(game, "Yell", 0);
  game.currentLocation = null;
  for (const [player, hand] of [[game.players[0], attackerHand], [game.players[1], defenderHand]]) {
    player.hand = hand.map((card) => game.cardInstance(card));
    Object.assign(player, { atk: 0, def: 2, tempo: false, nextAttackPower: 0, nextAttackFlow: false, statuses: [], equipment: [], exhaustedEquipment: [], hp: 20, maxHp: 20, reversalUsedThisRound: false, focus: 0 });
  }
  return { game, attacker: game.players[0], defender: game.players[1] };
}

function advanceTo(game, phase, playerId, guard = 400) {
  for (let step = 0; step < guard; step += 1) {
    game.advanceAutomaticEvents();
    if (game.pendingChoice) { game.resolveChoice(game.defaultChoice()); continue; }
    if (game.phase === phase && game.activePlayer === playerId) return;
    game.applyAction(game.phase === "Hide" ? { type: "hide", playerId: game.activePlayer } : { type: "pass", playerId: game.activePlayer });
  }
  throw new Error(`never reached ${phase} for player ${playerId}`);
}

function equip(game, player, card) {
  const instance = game.cardInstance(card);
  player.equipment.push(instance); player.played.push(instance);
  return instance;
}

const declare = (game, card, extra = {}) => game.applyAction({ type: "play-attack", playerId: 0, cardId: card.instanceId, targetId: 1, ...extra });
const lastAttack = (game) => game.events.filter((event) => event.type === "attack").at(-1);
const optionIds = (game) => game.pendingChoice.options.map((option) => option.id);

test("fixtures exist", () => {
  for (const [name, card] of Object.entries({ highAttack, lowAttack, highGuard, lowGuard, lowOnlyReaction, blockReaction, preventConsumable, untargetableConsumable, turnConsumable, anytimeHeal, ascendDestroying, firstAttackWeapon, incomingPenaltyArmor, afterDefenseWeapon, afterKataGear, zoneCallGear, discardOrRetargetArmor, blockCycleWeapon, dodgeDefense, kata })) assert.ok(card, name);
});

test("a Reaction Item resolves once, is destroyed as printed and generates no Focus off-turn (E-R1, E-R3)", () => {
  const { game, defender } = yellWith([lowAttack], [lowOnlyReaction]);
  const [reaction] = defender.hand;
  assert.ok(declare(game, game.players[0].hand[0]));
  assert.equal(game.pendingChoice.kind, "reaction");
  assert.ok(game.resolveChoice({ optionId: reaction.instanceId }));
  assert.equal(game.pendingChoice.kind, "defense");
  assert.ok(game.resolveChoice({ optionId: "pass" }));
  assert.deepEqual(game.checkInvariants(), []);
  assert.ok(defender.destroyed.includes(reaction));
  assert.ok(!defender.discard.includes(reaction) && !defender.played.includes(reaction));
  assert.equal(defender.focus, 0);
  const amount = effectsOf(lowOnlyReaction).find((effect) => effect.trigger === "onAttackDeclared").amount;
  assert.equal(lastAttack(game).breakdown.attackParts.find((part) => part.label === "Reaction").value, amount);
});

test("a Reaction Item is offered only when its declaration trigger applies", () => {
  const { game } = yellWith([highAttack], [lowOnlyReaction]);
  assert.ok(declare(game, game.players[0].hand[0]));
  assert.equal(game.pendingChoice.kind, "defense");
});

test("used Consumables return to the box unless their own text destroys them (E-C1)", () => {
  const { game, attacker } = yellWith([anytimeHeal], []);
  const [card] = attacker.hand;
  assert.ok(game.applyAction({ type: "play-card", playerId: 0, cardId: card.instanceId }));
  assert.ok(attacker.box.includes(card));
  assert.ok(!attacker.played.includes(card) && !attacker.discard.includes(card));
  assert.ok(game.events.some((event) => event.type === "card-boxed" && event.card === card.catalogId));

  const ascend = yellWith([ascendDestroying], []);
  ascend.game.applyAction({ type: "pass", playerId: 0 });
  assert.equal(ascend.game.phase, "Ascend");
  const voucher = ascend.attacker.hand[0];
  assert.ok(ascend.game.getLegalActions(0).some((action) => action.type === "play-card" && action.cardId === voucher.instanceId));
  assert.ok(ascend.game.applyAction({ type: "play-card", playerId: 0, cardId: voucher.instanceId }));
  assert.ok(ascend.attacker.destroyed.includes(voucher) && !ascend.attacker.box.includes(voucher));
  assert.deepEqual(ascend.game.checkInvariants(), []);
});

test("Consumables are offered in the windows their timing names (E-C2)", () => {
  const { game } = yellWith([turnConsumable, anytimeHeal, preventConsumable, ascendDestroying, highAttack], []);
  const playable = new Set(game.getLegalActions(0).filter((action) => action.type === "play-card").map((action) => game.players[0].hand.find((card) => card.instanceId === action.cardId).timing));
  assert.deepEqual([...playable].sort(), ["Anytime", "Turn"]);
  game.applyAction({ type: "pass", playerId: 0 });
  const ascendTimings = new Set(game.getLegalActions(0).filter((action) => action.type === "play-card").map((action) => game.players[0].hand.find((card) => card.instanceId === action.cardId).timing));
  assert.deepEqual([...ascendTimings].sort(), ["Anytime", "Ascend"]);
});

test("Reaction and Anytime Consumables answer an incoming Attack in the defender's window (E-R4)", () => {
  const { game, defender } = yellWith([highAttack], [preventConsumable, anytimeHeal, turnConsumable]);
  const [prevent, heal, turn] = defender.hand;
  assert.ok(declare(game, game.players[0].hand[0]));
  assert.equal(game.pendingChoice.kind, "reaction");
  assert.deepEqual(optionIds(game).sort(), ["pass", prevent.instanceId, heal.instanceId].sort());
  assert.ok(!optionIds(game).includes(turn.instanceId));
  assert.ok(game.resolveChoice({ optionId: prevent.instanceId }));
  // The window stays open until the defender passes.
  assert.equal(game.pendingChoice.kind, "reaction");
  assert.deepEqual(optionIds(game).sort(), ["pass", heal.instanceId].sort());
  assert.ok(game.resolveChoice({ optionId: "pass" }));
  assert.equal(game.pendingChoice.reactionPrevention, effectsOf(preventConsumable)[0].amount);
  assert.ok(game.resolveChoice({ optionId: "pass" }));
  assert.ok(defender.box.includes(prevent));
  assert.equal(defender.focus, 0);
  assert.equal(lastAttack(game).breakdown.prevented, Math.min(effectsOf(preventConsumable)[0].amount, lastAttack(game).attack - lastAttack(game).block));
});

test("a defender who becomes Untargetable spends the incoming strike", () => {
  const { game, attacker, defender } = yellWith([highAttack, highAttack], [untargetableConsumable]);
  const [strike] = attacker.hand;
  assert.ok(declare(game, strike));
  assert.ok(game.resolveChoice({ optionId: defender.hand[0].instanceId }));
  assert.equal(game.pendingChoice, null);
  assert.ok(attacker.played.includes(strike));
  assert.equal(defender.hp, 20);
  assert.ok(game.events.some((event) => event.type === "attack-spent"));
  assert.ok(!game.getLegalActions(0).some((action) => action.type === "play-attack"));
});

test("after-Block Reaction Items are offered before the Reversal window", () => {
  const { game, defender } = yellWith([highAttack], [highGuard, blockReaction, highAttack]);
  const [guardCard, reaction] = defender.hand;
  defender.def = 5;
  assert.ok(declare(game, game.players[0].hand[0]));
  assert.ok(game.resolveChoice({ optionId: guardCard.instanceId }));
  assert.equal(lastAttack(game).damage, 0);
  assert.equal(game.pendingChoice.kind, "reaction");
  assert.equal(game.pendingChoice.window, "after-block");
  assert.ok(game.resolveChoice({ optionId: reaction.instanceId }));
  assert.ok(defender.destroyed.includes(reaction));
  assert.equal(game.pendingChoice.kind, "reversal");
  assert.ok(defender.statuses.some((status) => status.action === "reversalAttackPower"));
});

test("exhausted Equipment readies at its controller's Initiate (E-T5)", () => {
  const { game, attacker, defender } = yellWith([], []);
  const mine = equip(game, attacker, afterKataGear); const theirs = equip(game, defender, afterKataGear);
  game.setEquipmentReady(attacker, mine, false); game.setEquipmentReady(defender, theirs, false);
  advanceTo(game, "Initiate", 1);
  assert.ok(game.equipmentIsExhausted(attacker, mine));
  assert.ok(!game.equipmentIsExhausted(defender, theirs));
  advanceTo(game, "Initiate", 0);
  assert.ok(!game.equipmentIsExhausted(attacker, mine));

  // With readiness set to "honor", every fighter's Equipment readies at Honor instead.
  for (const readyAt of ["honor", "own-initiate"]) {
    const table = yellWith([], [], { definition: { ...data.definition, equipment: { ...data.definition.equipment, readiness: { readyAt } } } });
    const cards = table.game.players.map((player) => equip(table.game, player, afterKataGear));
    for (let step = 0; step < 200 && table.game.phase !== "Honor"; step += 1) table.game.applyAction(table.game.pendingChoice ? { type: "resolve-choice", choice: table.game.defaultChoice() } : table.game.phase === "Hide" ? { type: "hide", playerId: table.game.activePlayer } : { type: "pass", playerId: table.game.activePlayer });
    table.game.players.forEach((player, index) => table.game.setEquipmentReady(player, cards[index], false));
    table.game.advanceAutomaticEvents();
    const ready = table.game.players.filter((player, index) => !table.game.equipmentIsExhausted(player, cards[index])).map((player) => player.id);
    assert.deepEqual(ready, readyAt === "honor" ? [0, 1] : [table.game.activePlayer]);
  }
});

test("Equipment fires on Attack declaration, for the attacker and for the defender (E-A15)", () => {
  const base = yellWith([highAttack], []);
  declare(base.game, base.attacker.hand[0]); base.game.resolveChoice({ optionId: "pass" });
  const plain = lastAttack(base.game).attack;

  const armed = yellWith([highAttack], []);
  equip(armed.game, armed.attacker, firstAttackWeapon);
  declare(armed.game, armed.attacker.hand[0]); armed.game.resolveChoice({ optionId: "pass" });
  // The Weapon's printed Attack Bonus is its own part; the declaration effect lands in "Equipment".
  const part = (label) => lastAttack(armed.game).breakdown.attackParts.find((entry) => entry.label === label)?.value ?? 0;
  assert.equal(part("Equipment"), effectsOf(firstAttackWeapon).find((effect) => effect.trigger === "onAttackDeclared").amount);
  assert.equal(lastAttack(armed.game).attack, plain + part("Weapon") + part("Equipment"));

  const guarded = yellWith([highAttack], []);
  equip(guarded.game, guarded.defender, incomingPenaltyArmor);
  declare(guarded.game, guarded.attacker.hand[0]); guarded.game.resolveChoice({ optionId: "pass" });
  assert.equal(lastAttack(guarded.game).attack, plain + effectsOf(incomingPenaltyArmor).find((effect) => effect.action === "modifyAttackPower").amount);
});

test("Equipment fires when its owner plays a Defense, and after a card resolves (E-A15)", () => {
  const { game, defender } = yellWith([highAttack], [highGuard]);
  equip(game, defender, afterDefenseWeapon);
  declare(game, game.players[0].hand[0]); game.resolveChoice({ optionId: defender.hand[0].instanceId });
  assert.equal(defender.nextAttackPower, 1);

  const kataGame = yellWith([kata, kata], []);
  const gear = equip(kataGame.game, kataGame.attacker, afterKataGear);
  const focusBefore = kataGame.attacker.focus;
  kataGame.game.applyAction({ type: "play-card", playerId: 0, cardId: kataGame.attacker.hand[0].instanceId });
  while (kataGame.game.pendingChoice) kataGame.game.resolveChoice(kataGame.game.defaultChoice());
  const gained = kataGame.attacker.focus - focusBefore - Number(kata.focusValue ?? 0);
  assert.equal(gained, 1);
  assert.ok(kataGame.game.equipmentIsExhausted(kataGame.attacker, gear));
  // Exhausted, the ability cannot be used again until the card readies.
  const before = kataGame.attacker.focus;
  kataGame.game.applyAction({ type: "play-card", playerId: 0, cardId: kataGame.attacker.hand[0].instanceId });
  while (kataGame.game.pendingChoice) kataGame.game.resolveChoice(kataGame.game.defaultChoice());
  assert.equal(kataGame.attacker.focus - before, Number(kata.focusValue ?? 0));
});

test("an incoming-zone call (exhaust in the Reaction Window) weakens the Attack only in the called zone", () => {
  const penalty = effectsOf(zoneCallGear).find((effect) => effect.action === "modifyAttackPower").amount;
  for (const [called, expected] of [["High", penalty], ["Low", 0]]) {
    const { game, defender } = yellWith([highAttack], []);
    const gear = equip(game, defender, zoneCallGear);
    declare(game, game.players[0].hand[0]);
    assert.equal(game.pendingChoice.kind, "reaction");
    assert.ok(optionIds(game).includes(`activate:${gear.instanceId}`));
    assert.ok(game.resolveChoice({ optionId: `activate:${gear.instanceId}` }));
    assert.equal(game.pendingChoice.kind, "structured");
    assert.equal(game.pendingChoice.choiceKind, "incoming-zone");
    assert.ok(game.resolveChoice({ optionId: called }));
    assert.equal(game.pendingChoice.kind, "defense");
    assert.ok(game.equipmentIsExhausted(defender, gear));
    assert.ok(game.resolveChoice({ optionId: "pass" }));
    const reaction = lastAttack(game).breakdown.attackParts.find((part) => part.label === "Reaction")?.value ?? 0;
    assert.equal(reaction, expected);
    assert.ok(!defender.statuses.some((status) => status.action === "incoming-zone"));
  }
});

test("structured choices never stall and never overwrite a pending choice", () => {
  // discard-or-retarget: every option resolves, then the Attack continues to the defender's window.
  const { game, attacker, defender } = yellWith([highAttack, lowAttack, highGuard], []);
  equip(game, defender, discardOrRetargetArmor);
  assert.ok(declare(game, attacker.hand[0]));
  assert.equal(game.pendingChoice.choiceKind, "discard-or-retarget");
  assert.equal(game.pendingChoice.playerId, 0);
  assert.ok(!optionIds(game).includes(`discard:${attacker.hand[0].instanceId}`), "the declared Attack cannot be discarded");
  assert.ok(game.resolveChoice({ optionId: optionIds(game)[0] }));
  assert.equal(attacker.discard.length, 1);
  assert.equal(game.pendingChoice.kind, "defense");

  // An optional draw-then-discard cycle on Block (choiceKind with draw/discard parameters).
  const cycle = yellWith([highAttack], [dodgeDefense]);
  equip(cycle.game, cycle.defender, blockCycleWeapon);
  cycle.defender.def = 9;
  declare(cycle.game, cycle.attacker.hand[0]); cycle.game.resolveChoice({ optionId: cycle.defender.hand[0].instanceId });
  assert.equal(cycle.game.pendingChoice.kind, "structured");
  assert.deepEqual(optionIds(cycle.game), ["accept", "skip"]);
  const handBefore = cycle.defender.hand.length;
  assert.ok(cycle.game.resolveChoice({ optionId: "accept" }));
  assert.equal(cycle.game.pendingChoice.kind, "card-movement");
  assert.equal(cycle.defender.hand.length, handBefore + 1);

  // Two choices offered at once are answered one after the other.
  const queue = yellWith([], []);
  queue.game.offerChoice({ kind: "structured", playerId: 0, resolver: "kata.choice", options: [{ id: "nextAttackPower:+1", label: "+1" }] });
  queue.game.offerChoice({ kind: "structured", playerId: 0, resolver: "kata.choice", options: [{ id: "nextDefenseGuard:+1", label: "+1 Guard" }] });
  assert.ok(queue.game.resolveChoice({ optionId: "nextAttackPower:+1" }));
  assert.deepEqual(optionIds(queue.game), ["nextDefenseGuard:+1"]);
  assert.ok(queue.game.resolveChoice({ optionId: "nextDefenseGuard:+1" }));
  assert.equal(queue.game.pendingChoice, null);
});

test("play-attack checks the zone against the card's printed zones and zone grants", () => {
  const { game, attacker } = yellWith([highAttack, highAttack], []);
  assert.equal(declare(game, attacker.hand[0], { zone: "Low" }), false);
  assert.equal(game.pendingChoice, null);
  attacker.nextAttackAnyZone = true;
  assert.ok(declare(game, attacker.hand[0], { zone: "Low" }));
  assert.equal(game.pendingChoice.zone, "Low");
  assert.equal(attacker.nextAttackAnyZone, false);

  // "The attacker's next Attack this round must use that zone if able."
  const forced = yellWith([highAttack], []);
  forced.attacker.nextAttackAnyZone = true;
  forced.game.addStatus(forced.attacker, { action: "forcedAttackZone", value: "Mid", duration: "endOfRound" });
  assert.equal(declare(forced.game, forced.attacker.hand[0], { zone: "High" }), false);
  assert.ok(declare(forced.game, forced.attacker.hand[0]));
  assert.equal(forced.game.pendingChoice.zone, "Mid");
});

test("random legal play never offers an option the engine refuses and keeps every card in one place", () => {
  const characters = data.cards.filter((card) => card.cardType === "Character");
  for (let seed = 1; seed <= 60; seed += 1) {
    const game = new Game(data, { seed, characters: [characters[seed % characters.length], characters[(seed * 7 + 3) % characters.length]] });
    const result = game.run({ policy: randomLegalPolicy, maxSteps: 60000 });
    assert.deepEqual(result.invariantFailures, [], `seed ${seed}`);
  }
});

test("difficulty policies keep choosing legal decisions with the new windows", () => {
  for (const level of ["student", "certified"]) {
    for (let seed = 1; seed <= 6; seed += 1) {
      const result = new Game(data, { seed }).run({ policy: difficultyPolicy(level), maxSteps: 60000 });
      assert.ok(result.winner !== null);
    }
  }
});
