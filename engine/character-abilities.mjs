// Character abilities for the headless engine (rules Ch. 12, "Character Card Information" and
// "Ability Types & Limits").
//
// Each canonical Character effect names a resolver (content/card-effects/characters.json). This
// module is the generic implementation of those resolvers: when it fires (`on`, an engine event),
// how often (`limit`: once per turn, round or game) and what it does (`resolve`). Several effects
// that share one resolver form one ability; the first effect's amount is the printed number.
// Green abilities (the `character.green.` namespace in the data) unlock at the Belt named in
// `definition.progression.greenAbility`.
//
// Events, with the fields the engine passes:
//   initiate        start of the controller's Yell (after Initiate)
//   cardPlayed      { card, zone }            a card the controller played or equipped
//   discarded       { card, junk, forced }     a card the controller discarded outside Hide
//   speedChanged    { amount }
//   attackDeclared  { card, zone, context }    the controller's Attack, before Defense
//   hit / block     { card, damage }           the controller's Attack Hit / Defense card Blocked
//   damageIncoming  { damage, attacker } -> returns the reduced damage
//   incomingAttack  { attacker, context }      an opposing Attack resolves against the controller
//   equip           { card, fromHand }
//   promotion, sceneChange, examRequirement
//
// A `resolve` returns true when the ability was used (that spends its limit).

const ZONES = ["High", "Mid", "Low"];
const hasTag = (card, tag) => (card?.tags ?? []).some((value) => String(value).toLowerCase() === tag.toLowerCase());
const isAttackCard = (card) => Number.parseInt(String(card?.stats?.["Attack Power"] ?? card?.attackPower ?? 0), 10) > 0;

/** "Your next Attack this turn gets +X": consumed by the next Attack, gone at the end of the turn. */
function nextAttackBonus(game, player, amount, { mark, zone = null, targetId = null, expires = "endOfTurn" } = {}) {
  game.addStatus(player, { action: "modifyAttackPower", amount, duration: "nextAttack", expires, zone, targetId, mark, source: "character" });
}

const flag = (player, key, value = true) => { player.characterMarks[key] = value; };
const marked = (player, key) => player.characterMarks[key];
/** The current strike's record of which Character marks its Attack consumed or set. */
const strikeHas = (game, key) => Boolean(game.combat?.marks?.includes(key));
const markStrike = (game, key) => { if (game.combat) (game.combat.marks ??= []).push(key); };

export const CHARACTER_ABILITIES = Object.freeze({
  // ---- Abilities the engine applies at a fixed step (zone offers, prices, Combo reveal) --------
  // Their limits live here; the engine reads them through characterAbilityAvailable().
  "character.firstSpinAttackRound": { on: "zoneGrant", limit: "round" },
  "character.firstHighAttackToMid": { on: "zoneGrant", limit: "turn" },
  "character.declaredAttackZoneChange": { on: "zoneGrant", limit: "round" },
  "character.discardToChangeDeclaredZone": { on: "zoneGrant", limit: "round" },
  "character.incomingAttackSlowChoice": { on: "incomingDeclaration", limit: "round" },
  "character.marketDiscountFloor": { on: "purchasePrice", limit: "round" },
  "character.comboRevealChoice": {
    on: "comboReveal", limit: "round",
    resolve: ({ game, player, resolver }) => {
      const first = player.comboOffered;
      const second = game.comboDeck.pop();
      if (!first || !second) { if (second) game.comboDeck.push(second); return false; }
      player.comboRevealed = [first, second];
      game.emit({ type: "combo-offered", player: player.id, combo: second.catalogId, cost: Number.parseInt(String(second.fpCost ?? 0), 10) || 0 });
      return game.offerCharacterChoice(player, resolver, [first, second].map((card) => ({ id: card.instanceId, label: card.name })));
    },
    // "Choose one to attempt to learn; return the other face down to the bottom of the Combo Deck."
    choose: ({ game, player, selected }) => {
      const revealed = player.comboRevealed ?? [];
      const chosen = revealed.find((card) => card.instanceId === selected) ?? revealed[0];
      for (const card of revealed) if (card !== chosen) game.comboDeck.unshift(card);
      player.comboOffered = chosen;
      player.comboRevealed = null;
      return true;
    },
  },
  // ---- Zone changes at declaration (the engine offers the zones; these record the change) ----
  "character.speedChangeNextAttackZone": {
    on: "speedChanged", limit: "round",
    resolve: ({ game, player }) => {
      if (!game.isActive(player) || game.phase !== "Yell") return false;
      player.anyZoneGrant = "character.speedChangeNextAttackZone";
      return true;
    },
  },
  "character.green.linkedChangedAttackHit": {
    on: "hit", limit: "turn",
    resolve: ({ game, player, amount }) => {
      const source = game.combat?.zoneChangedBy;
      if (!["character.speedChangeNextAttackZone", "character.discardToChangeDeclaredZone"].includes(source) || !game.characterHasResolver(player, source)) return false;
      game.gainFocusFor(player, amount);
      return true;
    },
  },
  "character.green.linkedZoneChangePower": {
    on: "attackDeclared", limit: null,
    resolve: ({ game, event, amount }) => {
      if (game.combat?.zoneChangedBy !== "character.declaredAttackZoneChange") return false;
      event.context.attackPowerModifier = (event.context.attackPowerModifier ?? 0) + amount;
      return true;
    },
  },
  "character.green.linkedChangedAttackHitCycle": {
    on: "hit", limit: "turn",
    resolve: ({ game, player }) => game.combat?.zoneChangedBy === "character.firstHighAttackToMid" && game.drawThenDiscard(player, 1, 1),
  },

  // ---- Incoming Attacks -----------------------------------------------------------------------
  "character.green.linkedReducedAttackBlockCycle": {
    on: "block", limit: "round",
    resolve: ({ game, player }) => strikeHas(game, `mark:reducedBy:${player.id}`) && game.drawThenDiscard(player, 1, 1),
  },
  "character.ignoreTemporaryAttackBonusesOnceGame": {
    on: "incomingAttack", limit: "game",
    // Provisional: the ability is spent on the first strike that has a temporary bonus to ignore.
    resolve: ({ event }) => {
      const temporary = event.temporaryAttackBonus;
      if (temporary <= 0) return false;
      event.context.attackPowerAdjustment = (event.context.attackPowerAdjustment ?? 0) - temporary;
      return true;
    },
  },
  "character.reduceLargeAttackModifier": {
    on: "incomingAttack", limit: "round",
    resolve: ({ game, player, event, amount }) => {
      if (event.modifierBonus < 2) return false;
      event.context.attackPowerAdjustment = (event.context.attackPowerAdjustment ?? 0) - amount;
      flag(player, "round:reducedBonusFrom", event.attacker.id);
      return true;
    },
  },
  "character.green.linkedReductionRetaliation": {
    on: "incomingAttack", limit: "round",
    resolve: ({ game, player, event, amount }) => {
      if (marked(player, "round:reducedBonusFrom") !== event.attacker.id) return false;
      nextAttackBonus(game, player, amount, { targetId: event.attacker.id, expires: "endOfRound" });
      return true;
    },
  },
  "character.damageThreshold": {
    on: "damageIncoming", limit: "round",
    resolve: ({ player, event, amount }) => {
      if (event.damage < 4) return false;
      event.damage -= amount;
      flag(player, "round:reducedDamage");
      return true;
    },
  },
  "character.green.delayedDamagePreventionFocus": {
    on: "damageIncoming", limit: "round",
    resolve: ({ game, player, amount }) => {
      if (!marked(player, "round:reducedDamage")) return false;
      game.addStatus(player, { action: "initiateFocus", amount, duration: "nextInitiate" });
      return true;
    },
  },
  "character.firstHitDamagePrevention": {
    on: "damageIncoming", limit: "round",
    resolve: ({ player, event, amount }) => {
      if (event.damage <= 0) return false;
      event.damage = Math.max(0, event.damage - amount);
      flag(player, "round:preventedHitFrom", event.attacker.id);
      return true;
    },
  },
  "character.green.linkedPreventedHitRetaliation": {
    on: "damageIncoming", limit: "round",
    resolve: ({ game, player, event, amount }) => {
      if (marked(player, "round:preventedHitFrom") !== event.attacker.id) return false;
      nextAttackBonus(game, player, amount, { targetId: event.attacker.id, expires: "endOfRound" });
      return true;
    },
  },

  // ---- The controller's own Attacks -------------------------------------------------------------
  "character.firstAttackAfterConsumable": {
    on: "attackDeclared", limit: "turn",
    resolve: ({ game, player, event, amount }) => {
      if (event.context.isReversal || player.attackCount !== 1 || !player.turnStats.usedConsumableThisTurn) return false;
      event.context.attackPowerModifier = (event.context.attackPowerModifier ?? 0) + amount;
      markStrike(game, "consumableAttack");
      return true;
    },
  },
  "character.green.linkedAttackHitPenalty": {
    on: "hit", limit: "turn",
    resolve: ({ game, player, opponent, amount }) => {
      if (!strikeHas(game, "consumableAttack")) return false;
      game.addStatus(opponent, { action: "modifyAttackPower", amount, duration: "nextAttack", expires: "endOfRound", source: "character" });
      game.characterEvent(opponent, "cardModified", { modifiedCardType: "Attack" });
      return true;
    },
  },
  "character.firstKickDifferentZone": {
    on: "attackDeclared", limit: "turn",
    resolve: ({ game, player, event, amount }) => {
      if (event.context.isReversal || !hasTag(event.card, "Kick")) return false;
      const previousZone = player.turnStats.previousZone;
      // "Your first Kick each turn": a later Kick never qualifies, even if the first one did not.
      if (player.turnStats.kickCount > 1) return "spent";
      if (!previousZone || previousZone === event.zone) return "spent";
      event.context.attackPowerModifier = (event.context.attackPowerModifier ?? 0) + amount;
      markStrike(game, "kickBonus");
      return true;
    },
  },
  "character.green.linkedKickHitSpeed": {
    on: "hit", limit: "round",
    resolve: ({ game, player, amount }) => strikeHas(game, "kickBonus") && game.changeSpeed(player, amount, "nextHonor"),
  },
  "character.firstUnarmedAttack": {
    on: "attackDeclared", limit: "turn",
    resolve: ({ event, amount }) => {
      if (event.context.isReversal || hasTag(event.card, "Weapon")) return false;
      event.context.attackPowerModifier = (event.context.attackPowerModifier ?? 0) + amount;
      return true;
    },
  },
  "character.conditionalAttackPower": {
    on: "attackDeclared", limit: "turn",
    // The printed conditions live in the canonical data (e.g. firstAttackThisTurn, playedKataThisTurn).
    resolve: ({ game, player, effects, event, amount }) => {
      if (!game.characterConditionsPass(player, effects[0], event.context)) return false;
      event.context.attackPowerModifier = (event.context.attackPowerModifier ?? 0) + amount;
      markStrike(game, "conditionalAttack");
      return true;
    },
  },
  "character.green.linkedAttackHitRewardChoice": {
    on: "hit", limit: "turn",
    resolve: ({ game, player, resolver }) => strikeHas(game, "conditionalAttack") && game.offerCharacterChoice(player, resolver, [{ id: "focus", label: "Gain 1 Focus" }, { id: "cycle", label: "Draw 1 card, then discard 1 card" }]),
    choose: ({ game, player, selected }) => selected === "focus" ? game.gainFocusFor(player, 1) : game.drawThenDiscard(player, 1, 1),
  },
  "character.xpTrailFirstHit": {
    on: "hit", limit: "turn",
    resolve: ({ game, player, opponent, amount }) => {
      if (opponent.xp <= player.xp) return false;
      game.dealDirectDamage(player, opponent, amount);
      return true;
    },
  },
  "character.green.linkedAttackHitRecycle": {
    on: "hit", limit: "turn",
    resolve: ({ game, player, resolver }) => {
      if (!strikeHas(game, "mark:discardPowered")) return false;
      const discarded = player.discard.filter((card) => player.turnStats.discardedThisTurn?.includes(card.instanceId));
      return discarded.length > 0 && game.offerCharacterChoice(player, resolver, [{ id: "skip", label: "Keep the discard pile" }, ...discarded.map((card) => ({ id: card.instanceId, label: card.name }))]);
    },
    choose: ({ game, player, selected }) => {
      const card = player.discard.find((candidate) => candidate.instanceId === selected);
      if (card) game.putOnDeckBottom(player, card);
      return true;
    },
  },
  "character.green.linkedAttackHitFocus": {
    on: "hit", limit: "turn",
    resolve: ({ game, player, amount }) => strikeHas(game, "mark:noNumericAttack") && game.gainFocusFor(player, amount),
  },
  "character.green.linkedChosenCardOutcomeCycle": {
    on: ["hit", "block"], limit: "round",
    resolve: ({ game, player, eventType }) => strikeHas(game, `mark:mimen-${eventType === "hit" ? "attack" : "defense"}:${player.id}`) && game.drawThenDiscard(player, 1, 1),
  },
  "character.linkedDefenseBlockCycle": {
    on: "block", limit: "round",
    resolve: ({ game, player }) => strikeHas(game, `mark:clipDefense:${player.id}`) && game.drawThenDiscard(player, 1, 1),
  },

  // ---- Cards played ---------------------------------------------------------------------------
  "character.twoZoneSpeed": {
    on: "cardPlayed", limit: "turn",
    resolve: ({ game, player, amount }) => {
      if (!game.isActive(player) || player.turnStats.zones.size < 2) return false;
      game.changeSpeed(player, amount, "endOfRound");
      flag(player, "turn:twoZoneSpeed");
      return true;
    },
  },
  "character.green.linkedSpeedTempoFlow": {
    on: "cardPlayed", limit: "turn",
    resolve: ({ player }) => {
      if (!marked(player, "turn:twoZoneSpeed") || !player.tempo) return false;
      player.nextAttackFlow = true;
      return true;
    },
  },
  "character.noNumericEffectNextAttack": {
    on: "cardPlayed", limit: "round",
    resolve: ({ game, player, event, amount }) => {
      if (/\d/.test(String(event.card?.rulesText ?? ""))) return false;
      nextAttackBonus(game, player, amount, { mark: "noNumericAttack" });
      return true;
    },
  },
  "character.firstKataSpeed": {
    on: "cardPlayed", limit: "turn",
    resolve: ({ game, player, event, amount }) => event.card?.subtype === "Kata" && game.changeSpeed(player, amount, "endOfRound"),
  },
  "character.green.secondKataCycle": {
    on: "cardPlayed", limit: "round",
    resolve: ({ game, player, event, amount }) => {
      if (event.card?.subtype !== "Kata" || player.turnStats.kataCount !== 2) return false;
      game.gainFocusFor(player, amount);
      return game.drawThenDiscard(player, 1, 1);
    },
  },
  "character.firstKataDefenseZone": {
    on: "cardPlayed", limit: "turn",
    resolve: ({ game, player, event, resolver }) => event.card?.subtype === "Kata" && game.offerCharacterChoice(player, resolver, ZONES.map((zone) => ({ id: zone, label: zone }))),
    choose: ({ game, player, selected }) => { game.addStatus(player, { action: "extraDefenseZone", value: selected, duration: "nextTurn" }); return true; },
  },
  "character.secondKickNextKickFlow": {
    on: "cardPlayed", limit: "turn",
    resolve: ({ game, player, event }) => {
      if (!hasTag(event.card, "Kick") || player.turnStats.kickCount !== 2) return false;
      game.addStatus(player, { action: "grantFlow", duration: "nextAttack", tag: "Kick", expires: "endOfTurn" });
      return true;
    },
  },
  "character.thirdDifferentCardTypeCycle": {
    on: "cardPlayed", limit: "turn",
    resolve: ({ game, player }) => (player.turnStats.cardTypesThisTurn?.length ?? 0) >= 3 && game.drawThenDiscard(player, 1, 1),
  },
  "character.afterAttackDifferentZone": {
    on: "cardPlayed", limit: "turn",
    resolve: ({ game, player, event }) => {
      if (!isAttackCard(event.card) || !game.isActive(player)) return false;
      player.anyZoneGrant = "character.afterAttackDifferentZone";
      return true;
    },
  },
  "character.equipFromHandNextDefense": {
    on: "equip", limit: "round",
    resolve: ({ game, player, event, amount }) => {
      if (!event.fromHand) return false;
      game.addStatus(player, { action: "modifyGuard", amount, duration: "nextDefense", expires: "endOfRound", mark: `clipDefense:${player.id}` });
      return true;
    },
  },

  // ---- Discards and Junk ------------------------------------------------------------------------
  "character.discardOutsideHideNextAttack": {
    on: "discarded", limit: "round",
    resolve: ({ game, player, amount }) => { nextAttackBonus(game, player, amount, { mark: "discardPowered" }); return true; },
  },
  "character.discardJunkDestroyChoice": {
    on: "discarded", limit: "round",
    resolve: ({ game, player, event }) => event.junk && game.isActive(player) && game.queueDiscardOrDestroyChoice(player, { id: "character.discardJunkDestroyChoice" }, { discardedCard: event.card }),
  },
  "character.forcedJunkDiscardDestroyChoice": {
    on: "discarded", limit: "round",
    resolve: ({ game, player, event }) => event.junk && event.forced && game.isActive(player) && game.queueDiscardOrDestroyChoice(player, { id: "character.forcedJunkDiscardDestroyChoice" }, { discardedCard: event.card }),
  },
  "character.green.linkedJunkDestroyCycle": {
    on: "junkDestroyed", limit: "round",
    resolve: ({ game, player }) => game.drawThenDiscard(player, 1, 1),
  },
  "character.junkDiscardToBottomCycle": {
    on: "initiate", limit: "round",
    resolve: ({ game, player, resolver }) => {
      const junk = player.discard.filter((card) => [card.cardType, card.subtype, card.category].includes("Junk"));
      return junk.length > 0 && game.offerCharacterChoice(player, resolver, [{ id: "skip", label: "Leave the discard pile" }, ...junk.map((card) => ({ id: card.instanceId, label: card.name }))]);
    },
    choose: ({ game, player, selected }) => {
      const card = player.discard.find((candidate) => candidate.instanceId === selected);
      if (!card) return true;
      game.putOnDeckBottom(player, card);
      game.characterEvent(player, "junkRecycled", {});
      return game.drawThenDiscard(player, 1, 1);
    },
  },
  "character.green.linkedRecycleLowAttack": {
    on: "junkRecycled", limit: "turn",
    resolve: ({ game, player, amount }) => { nextAttackBonus(game, player, amount, { zone: "Low" }); return true; },
  },

  // ---- Initiate -------------------------------------------------------------------------------
  "character.revealConsumableCycle": {
    on: "initiate", limit: "turn",
    resolve: ({ game, player, resolver }) => {
      const consumables = player.hand.filter((card) => card.subtype === "Consumable");
      return consumables.length > 0 && game.offerCharacterChoice(player, resolver, [{ id: "skip", label: "Keep your hand hidden" }, ...consumables.map((card) => ({ id: card.instanceId, label: `Reveal ${card.name}` }))]);
    },
    choose: ({ game, player, selected }) => {
      const card = player.hand.find((candidate) => candidate.instanceId === selected);
      if (!card) return true;
      game.emit({ type: "card-revealed", player: player.id, card: card.catalogId });
      return game.drawThenDiscard(player, 1, 1);
    },
  },
  "character.noWeaponOffenseDefenseChoice": {
    on: "initiate", limit: "turn",
    resolve: ({ game, player, resolver }) => !player.equipment.some((card) => card.subtype === "Weapon") && game.offerCharacterChoice(player, resolver, [{ id: "attack", label: "First Attack this turn +1" }, { id: "defense", label: "First Defense this round +1 Guard" }]),
    choose: ({ game, player, selected }) => {
      if (selected === "attack") nextAttackBonus(game, player, 1, { mark: `mimen-attack:${player.id}` });
      else game.addStatus(player, { action: "modifyGuard", amount: 1, duration: "nextDefense", expires: "endOfRound", mark: `mimen-defense:${player.id}` });
      return true;
    },
  },
  "character.noCombatDamagePreviousTurnCycle": {
    on: "initiate", limit: "turn",
    resolve: ({ game, player }) => !player.dealtCombatDamageLastTurn && game.drawThenDiscard(player, 1, 1),
  },
  "character.equipDiscardPermanentUntilHide": {
    on: "initiate", limit: "round",
    resolve: ({ game, player, effects }) => game.queueZoneChoice(player, { ...effects[0], sourceCardId: player.character.instanceId }, { zones: ["discard"], operation: "equip-from-discard" }),
  },
  "character.exhaustReadyEquipmentLock": {
    on: "initiate", limit: "round",
    resolve: ({ game, player, resolver }) => {
      const ready = player.equipment.filter((card) => !game.equipmentIsExhausted(player, card));
      return ready.length > 0 && game.offerCharacterChoice(player, resolver, [{ id: "skip", label: "Leave your Equipment" }, ...ready.map((card) => ({ id: card.instanceId, label: card.name }))]);
    },
    choose: ({ game, player, selected }) => {
      const card = player.equipment.find((candidate) => candidate.instanceId === selected);
      if (!card) return true;
      game.setEquipmentReady(player, card, false); game.setEquipmentReady(player, card, true);
      player.turnStats.rebootedEquipment = true;
      game.characterEvent(player, "reboot", {});
      return true;
    },
  },
  "character.green.linkedRebootCycle": {
    on: "reboot", limit: "round",
    resolve: ({ game, player }) => game.drawThenDiscard(player, 1, 1),
  },

  // ---- Speed, Scene, exams, promotion, opposing modifications --------------------------------
  "character.speedChangeCycle": { on: "speedChanged", limit: "round", resolve: ({ game, player }) => game.drawThenDiscard(player, 1, 1) },
  "character.sceneChangeCycle": { on: "sceneChange", limit: "round", resolve: ({ game, player }) => game.drawThenDiscard(player, 1, 1) },
  "character.examRequirementSpeed": { on: "examRequirement", limit: "round", resolve: ({ game, player, amount }) => game.changeSpeed(player, amount, "endOfRound") },
  "character.green.promotionCycle": {
    on: "promotion", limit: null,
    resolve: ({ game, player, effects }) => game.drawThenDiscard(player, Number(effects[0].amount ?? 2), Number(effects[1]?.amount ?? 1)),
  },
  "character.opponentModificationCycle": {
    on: "cardModified", limit: "round",
    resolve: ({ game, player, event }) => { flag(player, "round:modifiedCardType", event.modifiedCardType); return game.drawThenDiscard(player, 1, 1); },
  },
  "character.green.repeatModifiedCardTypeBonus": {
    on: "cardModified", limit: "round",
    resolve: ({ game, player, amount }) => {
      const type = marked(player, "round:modifiedCardType");
      if (type === "Attack") nextAttackBonus(game, player, amount, { expires: "endOfRound" });
      else if (type === "Defense") game.addStatus(player, { action: "modifyGuard", amount, duration: "nextDefense", expires: "endOfRound" });
      else return false;
      return true;
    },
  },
});

/** The zones a Character lets this Attack be declared in, beyond its printed zones, with the granting resolver. */
export function characterZoneGrants(game, player, card) {
  const grants = [];
  const available = (resolver) => game.characterAbilityAvailable(player, resolver);
  if (player.anyZoneGrant) grants.push({ resolver: player.anyZoneGrant, zones: ZONES });
  if (available("character.firstSpinAttackRound") && hasTag(card, "Spin")) grants.push({ resolver: "character.firstSpinAttackRound", zones: ZONES });
  if (available("character.firstHighAttackToMid") && String(card.zone ?? "").includes("High")) grants.push({ resolver: "character.firstHighAttackToMid", zones: ["Mid"] });
  if (available("character.declaredAttackZoneChange")) grants.push({ resolver: "character.declaredAttackZoneChange", zones: ZONES });
  if (available("character.discardToChangeDeclaredZone") && player.hand.length > 1) grants.push({ resolver: "character.discardToChangeDeclaredZone", zones: ZONES, cost: "discard" });
  return grants;
}

/** First-of-their-kind zone abilities spend their limit on the first matching Attack, changed or not. */
export const ZONE_GRANT_SPENT_ON_ELIGIBLE_ATTACK = Object.freeze(["character.firstSpinAttackRound", "character.firstHighAttackToMid"]);
