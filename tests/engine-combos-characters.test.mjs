// Combos, Character abilities, status durations, Market prices and Belt rows of
// docs/engine-parity-audit.md (E-CB2, E-CH1, E-CH2, E-S1, E-S3, E-S4, E-M1-E-M4, E-B2, E-B6).
import assert from "node:assert/strict";
import test from "node:test";
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game } from "../engine/core.mjs";

const data = await loadGameData();
const byName = (name) => { const card = data.cards.find((candidate) => candidate.name === name); assert.ok(card, name); return card; };
const anyOther = (character) => data.cards.find((card) => card.cardType === "Character" && card.catalogId !== character.catalogId && !(data.cardEffectById.get(card.catalogId)?.effects ?? []).length) ?? byName("Gramma Uppercut");
const greenIndex = data.definition.progression.belts.findIndex((belt) => belt.id === "green");

/** A two-player Quick Duel at player 0's Yell, with chosen Characters and empty hands. */
function yellTable({ character = null, opponent = null, seed = 41 } = {}) {
  const first = character ? byName(character) : byName("Gramma Uppercut");
  const second = opponent ? byName(opponent) : anyOther(first);
  const game = new Game(data, { seed, characters: [first, second] });
  game.advanceAutomaticEvents();
  game.activePlayer = 0; game.turnOrder = [0, 1]; game.turnOrderPosition = 0;
  game.beginComboTurn(game.players[0]);
  game.phase = "Yell";
  for (const player of game.players) { player.hand = []; player.focus = 0; player.statuses = []; }
  return { game, me: game.players[0], foe: game.players[1] };
}
const give = (game, player, name) => { const card = game.cardInstance(byName(name)); player.hand.push(card); return card; };
const learn = (game, player, name) => { const combo = game.cardInstance(byName(name)); player.learnedCombos.push(combo); return combo; };
const kataPlayed = (game, player, name) => game.markComboCardPlayed(player, game.cardInstance(byName(name)));
const strike = (game, attacker, defender, card, options = {}) => game.resolveAttack(attacker, defender, card, { zone: printedZone(card), useTempo: false, ...options });
// A Kata whose own effect is a Flow grant: no Speed, Focus or choices of its own.
const plainKata = byName("Breath Control");
const printedZone = (card) => (/any/i.test(card.zone) ? "Mid" : card.zone.split(",")[0].trim());

// ---- E-CB2: a Combo that completes at declaration still pays its later parts ---------------------

test("a Combo completed at Attack declaration pays its on-Hit part in the same strike", () => {
  const { game, me, foe } = yellTable();
  learn(game, me, "Breathe In, Violence Out");
  kataPlayed(game, me, "Breathing Drill");
  foe.def = 0;
  const result = strike(game, me, foe, give(game, me, "Back Kick"));
  assert.ok(result.damage > 0);
  assert.equal(result.breakdown.attackParts.find((part) => part.label === "Combo")?.value, 2, "the modifier part");
  assert.equal(me.nextAttackFlow, true, "the on-Hit part: your next Attack gains Flow");
  assert.equal(game.events.filter((event) => event.type === "combo-completed").length, 1, "one completion, not two");
});

test("an Aftermath Combo whose requirement completes at declaration pays on Hit, and not on a Block", () => {
  const hit = yellTable();
  learn(hit.game, hit.me, "Paperwork and Pain");
  kataPlayed(hit.game, hit.me, "Footwork Drill");
  hit.foe.def = 0;
  const before = hit.me.focus;
  const card = give(hit.game, hit.me, "Back Kick");
  strike(hit.game, hit.me, hit.foe, card);
  assert.equal(hit.me.focus - before, Number(card.focusValue) + 1, "printed Focus plus the Combo's +1");

  const blocked = yellTable();
  learn(blocked.game, blocked.me, "Paperwork and Pain");
  kataPlayed(blocked.game, blocked.me, "Footwork Drill");
  blocked.foe.def = 30;
  const focusBefore = blocked.me.focus;
  const kick = give(blocked.game, blocked.me, "Back Kick");
  strike(blocked.game, blocked.me, blocked.foe, kick);
  assert.equal(blocked.me.focus - focusBefore, Number(kick.focusValue));
});

test("Clock In, Block Out needs a Reversal (owner-approved requirement)", () => {
  const { game, me, foe } = yellTable();
  learn(game, me, "Clock In, Block Out");
  me.comboFacts.speedGainedSinceLastTurn = true;
  me.comboFacts.sinceLastTurnBlocks.push({ defenseCardId: null, defenseTags: [], incomingZone: "Mid" });
  foe.def = 30;
  strike(game, me, foe, give(game, me, "Back Kick"));
  assert.equal(game.events.some((event) => event.type === "combo-completed"), false, "a normal Attack does not complete it");
  strike(game, me, foe, give(game, me, "Back Kick"), { reversal: true });
  assert.equal(game.events.some((event) => event.type === "combo-completed"), true);
});

// ---- E-CH1: Green abilities unlock at Green Belt --------------------------------------------------

test("a Green ability does nothing below Green Belt and works from Green Belt", () => {
  for (const [belt, expected] of [[0, false], [greenIndex, true]]) {
    const { game, me, foe } = yellTable({ character: "Ink Fist" });
    me.beltIndex = belt;
    // White: a card with no printed number gives the next Attack +1; Green: that Attack's Hit gains 1 Focus.
    const plain = data.cards.find((card) => card.subtype === "Kata" && card.rulesText && !/\d/.test(card.rulesText));
    me.hand.push(game.cardInstance(plain));
    game.playCard(me, me.hand[0]);
    foe.def = 0;
    const focusBefore = me.focus;
    const card = give(game, me, "Back Kick");
    const result = strike(game, me, foe, card);
    assert.equal(result.breakdown.attackParts.find((part) => part.label === "Status")?.value, 1, "the White ability works at any Belt");
    assert.equal(me.focus - focusBefore - Number(card.focusValue), expected ? 1 : 0, `belt ${belt}`);
  }
});

// ---- E-CH2: Character events --------------------------------------------------------------------

test("Attack-declaration abilities read their canonical conditions (Wavey Davey)", () => {
  const { game, me, foe } = yellTable({ character: "Wavey Davey" });
  foe.def = 0;
  me.lastTurnWasHit = true;
  const result = strike(game, me, foe, give(game, me, "Back Kick"));
  assert.equal(result.breakdown.attackParts.find((part) => part.label === "Character")?.value, 1);
  const second = strike(game, me, foe, give(game, me, "Back Kick"));
  assert.equal(second.breakdown.attackParts.find((part) => part.label === "Character"), undefined, "first Attack each turn only");
});

test("being Hit sets 'Hit since your last turn' until your next Hide", () => {
  const { game, me, foe } = yellTable();
  me.def = 0;
  strike(game, foe, me, give(game, foe, "Back Kick"));
  assert.equal(me.lastTurnWasHit, true);
  game.hide(me);
  assert.equal(me.lastTurnWasHit, false);
});

test("Doodle Bopper may change a declared zone; at Green the changed Attack gets +1", () => {
  const { game, me, foe } = yellTable({ character: "Doodle Bopper" });
  me.beltIndex = greenIndex;
  const kick = give(game, me, "Back Kick");
  assert.equal(game.applyAction({ type: "play-attack", playerId: 0, cardId: kick.instanceId }), true);
  const zoneChoice = game.getPendingChoice();
  assert.equal(zoneChoice.kind, "attack-zone");
  assert.deepEqual(zoneChoice.options.map((option) => option.id), ["Low", "High", "Mid"], "printed zone first");
  assert.equal(game.resolveChoice({ optionId: "High" }), true);
  assert.equal(game.getPendingChoice().zone, "High");
  game.resolveChoice({ optionId: "pass" });
  const attack = game.events.findLast((event) => event.type === "attack");
  assert.equal(attack.zone, "High");
  assert.equal(attack.breakdown.attackParts.find((part) => part.label === "Character")?.value, 1);
  // Once per round: the next Attack keeps its printed zone without a choice.
  const second = give(game, me, "Back Kick");
  game.applyAction({ type: "play-attack", playerId: 0, cardId: second.instanceId });
  assert.equal(game.getPendingChoice().kind, "defense");
});

test("Miss Direction pays a discard to change the zone before any Defense", () => {
  const { game, me } = yellTable({ character: "Miss Direction" });
  const kick = give(game, me, "Back Kick");
  const fodder = give(game, me, "Bad Habit");
  game.applyAction({ type: "play-attack", playerId: 0, cardId: kick.instanceId });
  game.resolveChoice({ optionId: "Mid" });
  const discard = game.getPendingChoice();
  assert.equal(discard.kind, "card-movement");
  assert.deepEqual(discard.options.map((option) => option.id), [fodder.instanceId], "the Attack itself is not a cost");
  game.resolveChoice({ optionId: fodder.instanceId });
  assert.equal(game.getPendingChoice().kind, "defense");
  assert.equal(game.getPendingChoice().zone, "Mid");
  assert.ok(me.discard.includes(fodder));
});

test("Blurred Monk may slow itself to weaken an incoming Attack, then defends as usual", () => {
  const { game, me, foe } = yellTable({ opponent: "Blurred Monk" });
  const kick = give(game, me, "Back Kick");
  game.applyAction({ type: "play-attack", playerId: 0, cardId: kick.instanceId });
  const choice = game.getPendingChoice();
  assert.equal(choice.kind, "incoming-attack-choice");
  assert.equal(choice.playerId, 1);
  const speed = game.currentSpeed(foe);
  game.resolveChoice({ optionId: "accept" });
  assert.equal(game.currentSpeed(foe), speed - 1);
  assert.equal(game.getPendingChoice().kind, "defense");
  game.resolveChoice({ optionId: "pass" });
  const attack = game.events.findLast((event) => event.type === "attack");
  assert.equal(attack.breakdown.attackParts.find((part) => part.label === "Status")?.value, -1);
  game.finishTurn(); game.finishTurn();
  assert.equal(game.currentSpeed(foe), speed, "until end of round");
});

test("Crash Test Dummy trims a 4+ damage Hit; at Green it gains 1 Focus at its next Initiate", () => {
  const { game, me, foe } = yellTable({ opponent: "Crash Test Dummy" });
  foe.beltIndex = greenIndex; foe.def = 0;
  me.atk = 10;
  const result = strike(game, me, foe, give(game, me, "Back Kick"));
  assert.equal(result.damage, result.attack - result.block - 1);
  assert.ok(result.attack - result.block >= 4);
  assert.equal(foe.statuses.some((status) => status.action === "initiateFocus" && status.duration === "nextInitiate"), true);
  game.finishTurn();
  assert.equal(game.activePlayer, 1);
  assert.equal(foe.focus, 1);
});

test("Paper Crane's Kata Speed is current Speed and feeds Speed-gain Combo requirements", () => {
  const { game, me } = yellTable({ character: "Paper Crane" });
  const speed = game.currentSpeed(me);
  me.hand.push(game.cardInstance(plainKata));
  game.playCard(me, me.hand.at(-1));
  assert.equal(game.currentSpeed(me), speed + 1);
  assert.equal(me.comboFacts.speedGainedSinceLastTurn, true, "Speed gains feed Combo requirements");
});

test("Librarian Lin reveals two Combos, keeps one on offer and returns the other to the bottom", () => {
  const { game, me } = yellTable({ character: "Librarian Lin" });
  game.phase = "Ascend";
  const top = game.comboDeck.at(-1); const next = game.comboDeck.at(-2);
  game.beginAscend(me);
  const choice = game.getPendingChoice();
  assert.equal(choice.kind, "structured");
  assert.deepEqual(choice.options.map((option) => option.id).sort(), [top.instanceId, next.instanceId].sort());
  game.resolveChoice({ optionId: next.instanceId });
  assert.equal(me.comboOffered, next);
  assert.equal(game.comboDeck[0], top);
});

test("the comboRevealChoice resolver offers real Learned Combos, not only 'skip'", () => {
  const { game, me } = yellTable();
  const effect = data.cardEffectById.get(byName("Librarian Lin").catalogId).effects[0];
  game.applyStructuredEffect(me, me.character, effect, { opponent: game.players[1] });
  const options = game.getPendingChoice().options.map((option) => option.id);
  assert.equal(options.length, 2);
  assert.ok(options.every((id) => data.byId.get(id)?.subtype === "Learned Combo"));
});

// ---- E-S1 / E-S3 / E-S4: status durations ----------------------------------------------------------

test("status durations end at the moments the rulebook names", () => {
  const { game, me, foe } = yellTable();
  game.addStatus(foe, { action: "modifyDefense", amount: 1, duration: "nextTurn" });
  game.addStatus(foe, { action: "modifySpeed", amount: -2, duration: "nextRound" });
  game.addStatus(foe, { action: "delayedDamage", amount: 3, duration: "endOfTargetNextTurn", sourcePlayerId: me.id });
  game.addStatus(foe, { action: "initiateFocus", amount: 2, duration: "nextInitiate" });
  game.addStatus(me, { action: "modifyAttackPower", amount: 1, duration: "turn" });
  const speed = game.currentSpeed(foe);
  assert.equal(game.statusValue(foe, "modifySpeed"), 0, "next round's Speed waits");
  const hp = foe.hp;
  game.hide(me); game.finishTurn();
  assert.equal(game.statusValue(me, "modifyAttackPower"), 0, "engine 'turn' statuses end with the turn");
  assert.equal(game.statusValue(foe, "modifyDefense"), 0, "'until your next turn' ends at that player's Initiate");
  assert.equal(foe.focus, 2, "next-Initiate Focus arrives");
  game.hide(foe);
  assert.equal(foe.hp, hp - 3, "delayed damage lands at the end of the target's turn");
  game.finishTurn();
  game.advanceAutomaticEvents();
  assert.equal(game.currentSpeed(foe), speed - 2, "next round's Speed is current Speed now");
});

test("a next-Kata Focus bonus waits for a Kata", () => {
  const { game, me } = yellTable();
  game.addStatus(me, { action: "kataFocusBonus", amount: 1, duration: "nextKata", expires: "endOfTurn" });
  give(game, me, "Back Kick");
  assert.equal(me.statuses.length, 1);
  me.hand.push(game.cardInstance(plainKata));
  const kata = me.hand.at(-1);
  const before = me.focus;
  game.playCard(me, kata);
  assert.equal(me.focus - before, Number(kata.focusValue) + 1 + (data.cardEffectById.get(kata.catalogId).effects.filter((effect) => effect.action === "gainFocus").reduce((sum, effect) => sum + Number(effect.amount ?? 0), 0)));
  assert.equal(me.statuses.filter((status) => status.action === "kataFocusBonus").length, 0);
});

test("Speed statuses change initiative (current Speed)", () => {
  const { game, me, foe } = yellTable();
  me.speed = 3; foe.speed = 3; me.tempSpeed = 0; foe.tempSpeed = 0;
  game.addStatus(foe, { action: "modifySpeed", amount: 2, duration: "endOfRound" });
  game.phase = "Honor";
  game.advanceAutomaticEvents();
  assert.equal(game.turnOrder[0], foe.id);
});

// ---- E-M1-E-M4: prices -----------------------------------------------------------------------------

test("discounts carry their qualifiers and floors, and a purchase consumes only the ones it used", () => {
  const { game, me } = yellTable();
  game.phase = "Ascend";
  const cheap = game.market.find((card) => Number(card.fpCost) <= 3);
  const pricey = game.market.find((card) => Number(card.fpCost) >= 6);
  assert.ok(cheap && pricey);
  game.addStatus(me, { action: "modifyCost", amount: -1, duration: "nextPurchase", minimumPrintedCost: 5, floor: 4 });
  game.addStatus(me, { action: "modifyCost", amount: -1, duration: "nextTurn" });
  assert.equal(game.purchaseCost(me, cheap), Number(cheap.fpCost) - 1, "only the unqualified discount applies to a cheap card");
  assert.equal(game.purchaseCost(me, pricey), Number(pricey.fpCost) - 2);
  me.focus = 20;
  game.buy(me, cheap);
  assert.equal(me.statuses.filter((status) => status.action === "modifyCost").length, 2, "the 5+ discount was not used, so it stays");
});

test("a purchase refills its own Market slot", () => {
  const { game, me } = yellTable();
  game.phase = "Ascend"; me.focus = 30;
  const card = game.market[2];
  const nextFromDeck = game.marketDeck.at(-1);
  game.buy(me, card);
  assert.equal(game.market[2], nextFromDeck);
});

test("an end-slot Equipment discount is in the price before buying, and exhausts the Equipment", () => {
  const { game, me } = yellTable();
  game.phase = "Ascend";
  const map = game.cardInstance(byName("Market Aisle Map"));
  me.played.push(map); me.equipment.push(map);
  const end = game.market.at(-1); const middle = game.market[3];
  assert.equal(game.purchaseCost(me, end), Math.max(Math.min(2, Number(end.fpCost)), Number(end.fpCost) - 1));
  assert.equal(game.purchaseCost(me, middle), Number(middle.fpCost));
  me.focus = 30;
  game.buy(me, end);
  assert.equal(game.equipmentIsExhausted(me, map), true);
});

test("Coupon Carl: once per round during Ascend, a 5+ card costs 1 less, to a minimum of 4", () => {
  const { game, me } = yellTable({ character: "Coupon Carl, Black Belt in Fine Print" });
  game.phase = "Ascend"; me.focus = 40;
  const five = game.cardInstance(data.cards.find((card) => Number(card.fpCost) === 5 && game.definition.economy.market.decks.includes(card.deck)));
  const seven = game.cardInstance(data.cards.find((card) => Number(card.fpCost) === 7 && game.definition.economy.market.decks.includes(card.deck)));
  game.market.push(five, seven);
  assert.equal(game.purchaseCost(me, five), 4);
  assert.equal(game.purchaseCost(me, seven), 6);
  game.buy(me, seven);
  assert.equal(game.purchaseCost(me, five), 5, "once per round");
});

// ---- Belts ------------------------------------------------------------------------------------------

test("Attacks count toward the Brown exam's four cards in one turn (E-B2)", () => {
  const { game, me, foe } = yellTable();
  foe.def = 30;
  for (let index = 0; index < 2; index += 1) strike(game, me, foe, give(game, me, "Back Kick"));
  assert.equal(me.turnStats.playsThisTurn, 2);
});

test("Training Stripes follow the mode flag (E-B6)", () => {
  const game = new Game(data, { seed: 3, mode: "standard-clash", players: 2 });
  const player = game.players[0];
  player.xp = 99;
  game.phase = "Ascend";
  assert.equal(game.awardTrainingStripe(player), false);
});
