import { attackPower, chooseAttack, chooseDefense, choosePractice, choosePurchase, cost, focus, guard } from "./bots.mjs";
import { comboTimingAllows, comboContext, comboEffects, evaluateCombo } from "./combo-runtime.mjs";
import { CHARACTER_ABILITIES, ZONE_GRANT_SPENT_ON_ELIGIBLE_ATTACK, characterZoneGrants } from "./character-abilities.mjs";
import { effectiveDefinition, resolveTableOptions, tableOption, tableOptionsAreDefault } from "./table-options.mjs";

export class Rng {
  constructor(seed = 1) { this.seed = Number(seed) || 1; this.state = this.seed >>> 0; }
  next() { this.state = (1664525 * this.state + 1013904223) >>> 0; return this.state / 2 ** 32; }
  pick(array) { return array.length ? array[Math.floor(this.next() * array.length)] : undefined; }
  shuffle(array) { for (let index = array.length - 1; index > 0; index -= 1) { const other = Math.floor(this.next() * (index + 1)); [array[index], array[other]] = [array[other], array[index]]; } return array; }
}

const num = (value) => Number.parseInt(String(value ?? 0), 10) || 0;
const remove = (array, value) => { const index = array.indexOf(value); if (index >= 0) array.splice(index, 1); };
const isAttack = (card) => attackPower(card) > 0;
// A Defense card is a Technique (or Starter) printed as a Defense; Defense Equipment and
// Reaction Items carry Guard too but are equipped or played through their own windows.
const isDefense = (card) => guard(card) > 0 && (card.subtype === "Defense" || card.details?.Type === "Defense");
// "A Defense or Armor must match that declared zone unless text says otherwise" (rules glossary: Zone).
const coversZone = (card, zone) => { const printed = String(card.zone ?? "").toLowerCase(); return printed.includes("any") || printed.split(",").map((entry) => entry.trim()).includes(String(zone ?? "").toLowerCase()); };
// Armor protects its printed zone(s); a strike with no declared zone yet meets every Armor.
const armorCoversZone = (card, zone) => zone === undefined || zone === null || coversZone(card, zone);
const cardType = (card) => card.subtype === "Kata" ? "Kata" : isAttack(card) ? "Attack" : card.subtype;
const cardIsKind = (card, kind) => kind === "Attack" ? isAttack(card) : kind === "Defense" ? isDefense(card) : cardType(card) === kind;
const PERMANENT_EQUIPMENT = ["Weapon", "Gear", "Defense Equipment"];
const zones = ["High", "Mid", "Low"];
// "That Attack deals 0 damage": prevention large enough to stop any strike.
const ALL_DAMAGE = 999;

const conditionKind = (condition) => typeof condition === "string" ? (condition.match(/kind=([a-zA-Z]+)/)?.[1] ?? "") : String(condition?.kind ?? "");
const effectParam = (effect, kind) => (effect.conditions ?? []).find((condition) => conditionKind(condition) === kind)?.value;
// Conditions that describe an Attack aimed at the effect's owner. An Equipment effect carrying one
// answers the opponent's declared Attack; every other Equipment effect of that trigger belongs to
// the owner's own Attack, Defense or card.
const INCOMING_ATTACK_CONDITIONS = new Set(["incomingAttackTargetsSelf", "firstIncomingAttackThisRound", "incomingZones", "incomingAttackZone", "incomingAttackUsesWeapon", "incomingAttackIsUnarmed"]);
const answersIncomingAttack = (effect) => (effect.conditions ?? []).some((condition) => INCOMING_ATTACK_CONDITIONS.has(conditionKind(condition)));
// Context keys an effect resolution writes for the combat totals.
const COMBAT_MODIFIER_KEYS = ["attackPowerModifier", "opponentAttackPowerModifier", "guardModifier", "defenseModifier", "damagePrevention", "piercing"];
const isZoneCall = (choiceKind) => choiceKind === "incoming-zone" || choiceKind === "next-attack-zone";
// Where the cards named by a choice's options live, by choice kind (when the choice does not say).
const CHOICE_CARD_ZONES = Object.freeze({ "cycle-discard-draw": ["hand"], "deck-look": ["deck"], "equipment-toggle": ["equipment"], reversal: ["hand"], reaction: ["hand"], defense: ["hand"] });
const printedZones = (card) => { const printed = String(card?.zone ?? ""); return /any/i.test(printed) ? [...zones] : zones.filter((zone) => printed.split(",").map((entry) => entry.trim().toLowerCase()).includes(zone.toLowerCase())); };

// Status durations (rules: Status Effects). A status is "standing" (it counts while it lasts) unless
// its duration waits for an event: those are consumed by that event or activate later.
//   endOfTurn / turn       end of the current turn          endOfRound / round   after End-of-Round
//   nextHonor              the next Honor Phase             scene                the next Scene Change
//   nextTurn               "until your next turn": the start of the holder's next turn (Initiate)
//   duringNextTurn         becomes `then` (default endOfTurn) when the holder's next turn starts
//   nextInitiate           resolves its payload at the holder's next Initiate, then ends
//   nextRound              becomes endOfRound at the next Honor ("next round")
//   endOfTargetNextTurn    delayed damage at the end of the holder's next turn
//   nextAttack / nextDefense / nextIncomingAttack / nextKata / nextPurchase   consumed by that event
// Any status may also carry `expires`: a second moment at which it ends unused.
const DEFERRED_DURATIONS = new Set(["nextAttack", "nextDefense", "nextIncomingAttack", "nextKata", "nextPurchase", "nextInitiate", "nextRound", "duringNextTurn", "endOfTargetNextTurn"]);
const DURATION_ALIASES = Object.freeze({ turn: "endOfTurn", round: "endOfRound" });

// Resolvers whose printed text reads "your Reversal against that attacker gets +X Attack Power".
// They arm a bonus that only a Reversal against the blocked attacker consumes (rules: Reversal,
// "Specific card text may improve a Reversal only as written"). A fallback replaces the bonus
// when the Reversal window for that attacker closes without a Reversal.
const REVERSAL_BONUS_RESOLVERS = Object.freeze({
  "defense.reversalBonus": {},
  "character.reversalAfterBlock": {},
  "reaction.reversalOrDefenseFollowup": { fallback: { action: "modifyDefense", duration: "nextHonor" } },
});

// Combo payoffs that land on the opponent later: they need their own target and duration.
const TARGETED_COMBO_RESOLVERS = new Set(["combo.nextRoundSpeed", "combo.nextReactionPenalty"]);

/** Named, signed contributions to one combat total, e.g. "3 Card + 1 ATK + 1 Tempo". */
function combatLedger() {
  const parts = [];
  return {
    add(label, value, { keep = false } = {}) {
      if (!value && !keep) return;
      const existing = parts.find((part) => part.label === label);
      if (existing) existing.value += value; else parts.push({ label, value });
    },
    list() { return parts.map((part) => ({ ...part })); },
  };
}

export const CARD_FAMILIES = Object.freeze([
  "Attacks", "Defenses", "Consumables", "Katas", "Weapons", "Defense Equipment",
  "Gear", "Reaction Items", "Combos", "Other",
]);

export function cardFamily(card) {
  const subtype = String(card?.subtype ?? "");
  if (attackPower(card) > 0) return "Attacks";
  if (guard(card) > 0) return "Defenses";
  if (subtype === "Attack" || card?.cardType === "Attack") return "Attacks";
  if (subtype === "Defense" || card?.cardType === "Defense") return "Defenses";
  if (subtype === "Consumable") return "Consumables";
  if (subtype === "Kata") return "Katas";
  if (subtype === "Weapon") return "Weapons";
  if (subtype === "Defense Equipment") return "Defense Equipment";
  if (subtype === "Gear") return "Gear";
  if (subtype === "Reaction Item") return "Reaction Items";
  if (subtype === "Combo" || subtype === "Learned Combo" || card?.cardType === "Combo") return "Combos";
  return "Other";
}

const cardTelemetryKeys = [
  "offered", "drawn", "purchased", "played", "discarded", "destroyed", "hits", "blocks",
  "damageDealt", "damagePrevented", "effectApplications", "equipmentReadied", "equipmentExhausted", "learned", "activated",
  "heldTurns", "heldBeforePlay", "heldBeforeDiscard", "heldBeforeDestroy",
];

const emptyFamilyTelemetry = () => Object.fromEntries([...cardTelemetryKeys, "winnerGames"].map((key) => [key, 0]));

// These are the contracts shared by the runtime and the coverage auditor.
// Keep resolver names exact: a family prefix is not an implementation.
export const HEADLESS_RESOLVER_ACTIONS = Object.freeze({
  "attack.optionalDiscardDraw": "cycleDiscardDraw", "defense.optionalDiscardDraw": "cycleDiscardDraw", "defense.stepBackCycle": "cycleDiscardDraw",
  "attack.grantNextAttackFlow": "grantFlow", "character.green.linkedSpeedTempoFlow": "grantFlow", "character.secondKickNextKickFlow": "grantFlow",
  "consumable.nextAttackFlowUntilEndOfTurn": "grantFlow", "consumable.gainXp": "gainXP",
  "kata.flowGrant": "grantFlow", "kata.purchaseDiscount": "modifyCost", "kata.deckLook": "deckLook",
  "defense.deckLookChoice": "deckLook", "consumable.topThreeAttackSelection": "deckLook", "consumable.reorderTopThree": "deckLook",
  "reaction.preventIncomingDamage": "preventDamage", "reaction.reduceDeclaredAttackPower": "modifyAttackPower", "reaction.defenseAgainstIncomingAttack": "reactionDefense",
  "consumable.modifyAttackStat": "modifyAttackPower", "consumable.removeTemporaryNegativeStatModifier": "removeTemporaryNegativeStatModifier",
  "consumable.healAndRemoveStatus": "removeTemporaryStatus", "consumable.nextKataFocusBonus": "grantKataFocus", "consumable.preventInterfereOnNextAttack": "restrictReaction",
  "consumable.untargetableUntilTurnOrAttack": "untargetable", "consumable.warrantyIcePop": "restrictConsumable", "attack.final.onlyAttackLock": "restrictAttack",
  "character.cannotEquipWeapons": "restrictWeapon", "character.equipDiscardPermanentUntilHide": "equipFromDiscard", "character.green.linkedAttackHitRecycle": "recycle",
  "character.green.linkedAttackHitRewardChoice": "hitChoice", "character.incomingAttackSlowChoice": "incomingAttackChoice", "character.revealConsumableCycle": "cycleDiscardDraw",
  "character.exhaustReadyEquipmentLock": "equipmentToggle", "character.discardJunkDestroyChoice": "discardOrDestroy", "character.forcedJunkDiscardDestroyChoice": "discardOrDestroy",
  "kata.recoverThenDiscard": "recoverThenDiscard", "kata.recycle": "recycle", "kata.equipFromHand": "equipFromHand",
  "consumable.setSpeedToValue": "setSpeed", "consumable.modifyDefenseUntilNextTurn": "modifyDefenseUntilNextTurn", "consumable.preventAttackUntilNextTurn": "restrictAttack",
});

export const HEADLESS_GENERIC_ACTIONS = new Set([
  "gainFocus", "draw", "modifyAttackPower", "modifySpeed", "modifyGuard", "modifyDefense", "preventDamage", "heal", "dealDamage", "minimumSpeed", "piercing", "chooseZone",
  "discard", "destroy", "ready", "exhaust", "reveal", "gainXP", "spendFocus", "modifyDefenseContribution", "grantFlow", "modifyCost", "cycleDiscardDraw", "deckLook", "structured",
  "removeTemporaryNegativeStatModifier", "removeTemporaryStatus", "recoverThenDiscard", "recycle", "equipFromHand", "equipFromDiscard", "setSpeed", "modifyDefenseUntilNextTurn", "restrictAttack",
  "restrictReaction", "restrictConsumable", "restrictWeapon", "untargetable", "reactionDefense", "grantKataFocus", "hitChoice", "equipmentToggle", "discardOrDestroy", "incomingAttackChoice",
  "moveCard", "starter.gainFocusIfFastest",
]);

export const HEADLESS_STRUCTURED_RESOLVERS = new Set([
  "equipment.structured", "location.structured",
  "attack.final.defensiveReaction", "attack.final.comboMultiplicity", "attack.final.fireDrillFeint", "attack.final.cycle", "attack.final.hitChoice",
  "character.noWeaponOffenseDefenseChoice", "character.ignoreTemporaryAttackBonusesOnceGame", "character.reduceLargeAttackModifier", "character.discardToChangeDeclaredZone",
  "character.revealReplacementOnceGame", "character.comboRevealChoice", "character.junkDiscardToBottomCycle", "character.green.repeatModifiedCardTypeBonus",
  "consumable.cancelReaction", "consumable.raffleTicket", "consumable.replaceDisarmWithSelfDestroy", "consumable.replaceRevealedMarketOrLocation", "consumable.suppressChosenWeaponClause", "consumable.blockedAttackBacklash",
  "defense.playRestriction", "defense.beltExam", "defense.forceNextAttackZone", "defense.blockChoice", "defense.reversalTargetProtection",
  "kata.flowGrant", "kata.attackModifier", "kata.attackRestriction", "kata.branch", "kata.deferredEvent", "kata.variableCycle", "kata.deckLook", "kata.revealUntil", "kata.equipmentChoice", "kata.equipmentActivation", "kata.markCard", "kata.purchaseDiscount", "kata.comboDiscount", "kata.recoverThenDiscard", "kata.recycle", "kata.equipFromHand", "kata.weaponModifier", "kata.damagePrevention",
  "reaction.preventIncomingDamage", "reaction.reduceDeclaredAttackPower", "reaction.secondNormalAttackPenaltyAndInitiateDraw", "reaction.defenseAgainstIncomingAttack", "reaction.forceAttackerDrawDiscardBeforeDefense", "reaction.defenseBeltExamCredit", "reaction.reversalOrDefenseFollowup", "reaction.preventForcedDiscard", "reaction.outOfTurnConsumableShield",
  "combo.grantFlow", "combo.gainXP", "combo.equipmentDefenseSuppression", "combo.discardWeaponChoice",
  "boss.hitTempoLock", "boss.startTurnDiscard", "boss.reveal",
  "boss.attack.hitTempoLock", "boss.profile.kataDefense", "boss.profile.blockDefense", "boss.profile.startTurnDiscardOrPower", "boss.stage.enrage", "boss.stage.stats", "boss.technique.revealNextArsenal", "boss.technique.nextDefense",
  "attack.currentAttackFlow", "attack.nextAttackArmorPenalty", "character.marketDiscountFloor", "consumable.nextIncomingAttackDefense", "consumable.revealTopFocusValue", "consumable.ascendPurchaseDiscount",
  "defense.nextPurchaseDiscount", "defense.nextTurnPurchaseDiscount", "defense.armorDefenseBonus",
  "kata.choice", "kata.controlledEscalation", "kata.discardBranch", "kata.zoneAttackReward", "kata.copyKata", "kata.comboHitReward", "kata.threeZonePlan",
  "reaction.preserveMarketDiscount", "reaction.cancelComboPayoff",
  "combo.nextRoundSpeed", "combo.nextReactionPenalty",
]);

const SEMANTIC_EFFECT_ACTIONS = Object.freeze({ "equipment.modifyDefenseContribution": "modifyDefenseContribution", "combat.modifyDefense": "modifyDefense", "combat.grantFlow": "grantFlow", "core.gainXP": "gainXP", "core.reveal": "reveal", "economy.modifyCost": "modifyCost", "economy.spendFocus": "spendFocus", "core.moveCard": "moveCard" });

/** The engine action an effect resolves as: the dispatch key of `applyCardEffects`. */
function effectAction(effect) {
  const rawAction = effect.action ?? effect.effect;
  const semanticAction = rawAction === "custom" ? effect.effect : rawAction;
  let action = SEMANTIC_EFFECT_ACTIONS[semanticAction] ?? HEADLESS_RESOLVER_ACTIONS[effect.resolver] ?? semanticAction;
  if ((rawAction === "custom" || [undefined, "custom", "core.custom", "core.choice"].includes(action)) && HEADLESS_STRUCTURED_RESOLVERS.has(String(effect.resolver ?? ""))) action = "structured";
  if (effect.resolver === "attack.final.hitChoice") action = "hitChoice";
  if (REVERSAL_BONUS_RESOLVERS[effect.resolver]) action = "reversalBonus";
  if (TARGETED_COMBO_RESOLVERS.has(effect.resolver)) action = "structured";
  return action;
}

/** What an effect does, by its dispatch action and by its printed semantic effect ("combat.preventDamage" -> "preventDamage"). */
const effectMeanings = (effect) => new Set([effectAction(effect), String(effect.effect ?? "").split(".").pop()]);
const isExhaustCost = (effect) => effectAction(effect) === "exhaust" && effect.target === "source";
const structuredParameterKinds = new Set([
  "choiceKind", "choiceOptions", "incomingZones", "discardCost", "nonHonorSceneChangedThisRound",
  "sourceAffectedCountThreshold", "scheduledTiming", "minimumDraw", "firstSwapThisGame", "discardedByEffect",
  "selfIsLowestXp", "speedPenaltyEvent", "forcedDiscardEvent", "sceneChangeOccurred",
  "eventCardType", "nextMatchingEvent", "boughtCardThisTurn", "event", "grantFlowTo", "beltExam",
  "firstNovelPurchasedCardType", "requiresCondition", "attackSpeedBonus", "attackPowerBonus", "optional",
  "onPaidGainFocus", "readyTiming", "maxAttacksAfterSource", "duration", "optionalExhaust", "mustDifferFromFirstAttackZone",
  "matchingZonePowerBonus", "ifHitSinceLastTurn", "otherwise", "revealUntilType", "keepRevealedMatch",
  "sourceAttackMatchesArmedEffect", "firstAttackInChosenZone", "afterResolveFocus", "source", "firstDamageEventBefore",
  "gainFocusIfDamageAfterReduction", "focusAmount", "copySource", "copyPrintedEffect", "preventRecursiveLoop",
  "learnedComboTriggeredThisTurn", "firstMatchingAttack", "minimumDamage", "gainFocus", "redBeltOrHigherCycle",
  "hpAtOrBelowHalfMax", "nextComboLearn", "discardUpTo", "drawEqualDiscarded", "differentCardTypesPlayedThisTurn",
  "triggerOnFirstThresholdCrossing", "chosenZoneFirstAttackPower", "otherZonesRequired", "otherZonesBefore",
  "completionFocus", "equipmentSubtype", "equippedOnly", "attackBonusDelta", "sameRoundOnly", "reactionPlayedAgainstSelf",
  "attackHasTag", "attackUsesSourceEquipment", "attackZones", "firstHitWithSourceThisRound", "defenseOutsideTurn",
  "currentAttackIsNormal", "discardedPrintedFocusValue", "firstNegativeCombatModifierThisRound", "nextPlayOfChosenCardFocus", "equipmentRestriction",
  "firstMatchingEventBefore", "attackIsReversal", "nextQualifyingAttackOnly", "nextAttackHasTag", "draw", "discard",
  "locationEvent", "locationOperation", "minimumFinalValue", "maximumFinalValue", "fixedValue", "choiceOptions", "cardType", "zones", "window", "nextPurchase", "minimumCost", "minimumPrintedCost",
  "destroyCount", "drawCount", "discardCount", "focusGain", "hpLoss", "maximumLoss", "appliesNextRound",
  "xpSourceAny", "isKoXp", "kataGrantedFlowThisAttack", "firstKataFlowThisTurn", "cardTypeAny",
  "attackedThisTurn", "printedCostAtLeast", "isComboFinisher", "healingSourceAny", "usesSceneChosenCounterZone",
  "attackHit", "sameRoundAsSceneChoice", "reductionSourceAny", "firstConsumableThisTurn", "firstItemPurchaseThisAscend",
  "cardSubtypeOrTagAny", "comboIsLearned", "printedFocusAtLeast",
  "firstAcrossPlayersPerRound", "equipmentExhaustedEarlierThisRound", "firstEquipmentExhaustThisRound",
  "equippedCardTagAny", "firstMatchingPerSceneStay", "attackUsesEquipmentTagAny", "equipmentReadiedOutsideInitiate",
  "itemPlayedBeforeFirstAttack", "reveal",
]);

export function resolveMode(definition, requested = null) {
  const id = requested ?? definition.mode?.id;
  const declared = (definition.modes ?? []).find((mode) => mode.id === id);
  if (declared) return declared;
  if (id === definition.mode?.id) return { ...definition.mode, players: { min: 2, max: 2, default: definition.mode.players ?? 2 }, roster: { size: 1, active: 1 }, victory: { lastFighterStanding: true, blackBelt: Boolean(definition.mode.blackBeltVictory) }, tiebreakers: [] };
  throw new Error(`Unknown mode ${id}`);
}

export class Game {
  constructor(data, { seed = 1, strategies = ["balanced", "balanced"], characters = [], mode = null, players: playerCount = null, rosters = [], teams = null, table = {} } = {}) {
    this.data = data;
    // Table options (definition.tableOptions) are resolved first: house rules can change the definition.
    this.tableOptions = resolveTableOptions(data.definition, table);
    this.definition = effectiveDefinition(data.definition, this.tableOptions);
    this.mode = resolveMode(this.definition, mode);
    // Quick Duel keeps its certified headless behaviour bit-for-bit (seat-order Speed ties,
    // HP-then-random round cap, game ends on the KO). See docs/game-modes-design.md.
    this.legacyQuickDuel = this.mode.id === "quick-duel";
    this.rosterSize = Math.max(1, Number(this.mode.roster?.size ?? 1));
    this.playerCount = Number(playerCount ?? (Array.isArray(teams) ? teams.flat().length : null) ?? this.mode.players?.default ?? 2);
    if (!Number.isInteger(this.playerCount) || this.playerCount < (this.mode.players?.min ?? 2) || this.playerCount > (this.mode.players?.max ?? 2)) throw new Error(`Mode ${this.mode.id} does not support ${this.playerCount} players`);
    this.referee = 0; this.combat = null; this.knockouts = []; this.queuedReversal = null;
    this.effects = data.cardEffectById ?? new Map();
    this.seed = Number(seed) || 1;
    this.rng = new Rng(this.seed);
    this.cardSerial = 0;
    this.statusSerial = 0;
    this.round = 1; this.roundLimitReached = false; this.turns = 0; this.winner = null; this.reason = "";
    this.events = []; this.decisions = []; this.lastPresentedChoice = null; this.cardStats = new Map(); this.marketPurchasedThisRound = false;
    this.invariantFailure = null;
    this.phase = this.definition.turn.phases[0]; this.activePlayer = 0; this.turnOrder = Array.from({ length: this.playerCount }, (_, index) => index); this.turnOrderPosition = 0; this.pendingChoice = null; this.choiceQueue = []; this.declaredAttack = null; this.status = "active";
    this.telemetry = {
      attacks: 0, hits: 0, blocks: 0, reversals: 0, totalDamage: 0, damagePrevented: 0,
      cardsPlayed: 0, cardsAcquired: 0, cardsDrawn: 0, cardsDiscarded: 0,
      cardsDestroyed: 0, cardsRevealed: 0, equipmentReadied: 0,
      equipmentExhausted: 0, focusGenerated: 0, focusSpent: 0, xpGenerated: 0,
      defensePractice: 0, promotions: 0, effectApplications: 0,
      comboOpportunities: 0, comboAcquisitions: 0, comboActivations: 0, comboEffectsResolved: 0,
      choicesPresented: 0, choicesResolved: 0, lifecycleEvents: 0,
      unsupportedEffects: 0,
      market: { opportunities: 0, cardsAvailable: 0, affordableCards: 0, skippedAffordableCards: 0, chosenCards: 0 },
      families: Object.fromEntries(CARD_FAMILIES.map((family) => [family, emptyFamilyTelemetry()])),
    };
    const charactersCatalog = data.cards.filter((card) => card.cardType === "Character");
    const rosterCards = Array.from({ length: this.playerCount }, (_, id) => this.rosterCardsFor(id, rosters[id], characters[id], charactersCatalog));
    this.players = rosterCards.map((cards, id) => this.makePlayer(id, cards[0], strategies[id] ?? "balanced"));
    this.setup = { mode: this.mode.id, players: this.playerCount, rosters: rosterCards.map((cards) => cards.map((card) => card?.catalogId ?? null)), teams: Array.isArray(teams) ? structuredClone(teams) : null, table: structuredClone(this.tableOptions) };
    for (const player of this.players) { player.team = Array.isArray(teams) ? Math.max(0, teams.findIndex((team) => team.includes(player.id))) : player.id; player.beltBonus = { atk: 0, def: 0, speed: 0 }; player.eliminated = false; player.lastDamagedBy = null; player.tempo = this.tableOptions.tempo; this.initRoster(player, rosterCards[player.id]); }
    for (const player of this.players) {
      const passive = this.cardEffects(player.character, "passive").filter((effect) => effect.resolver === "character.cannotEquipWeapons");
      if (passive.length) this.applyCardEffects(player, player.character, "passive", { opponent: this.opponentOf(player), sourceCard: player.character, effectOverride: passive });
      if (player.roster) player.roster[player.activeIndex].passivesApplied = true;
    }
    this.marketDeck = this.rng.shuffle(this.marketPool().map((card) => this.cardInstance(card)));
    this.marketDiscard = []; this.market = []; this.dealOpeningMarket();
    this.comboDeck = this.rng.shuffle(data.cards.filter((card) => card.deck === "Combo Deck").map((card) => this.cardInstance(card)));
    this.comboDiscard = [];
    this.locationDeck = this.rng.shuffle(data.cards.filter((card) => card.cardType === "Location").map((card) => this.cardInstance(card)));
    this.locationDiscard = []; this.currentLocation = null; this.sceneChangedThisRound = false;
    if (this.tableOptions.locations) this.revealLocation(); else this.fixLocation();
  }

  // ---- Table setup (definition.tableOptions) -------------------------------------------
  /** Market cards for this table: every card in the Market decks. */
  marketPool() {
    return this.data.cards.filter((card) => this.definition.economy.market.decks.includes(card.deck));
  }

  /** The opening row. A balanced Market first pulls one affordable card of each guaranteed kind, in draw order. */
  dealOpeningMarket() {
    const guarantees = this.tableOptions.balancedMarket ? tableOption(this.definition, "balancedMarket")?.whenOn?.openingRowGuarantees ?? [] : [];
    const rowSize = this.definition.economy.market.rowSize;
    for (const guarantee of guarantees) {
      if (this.market.length >= rowSize) break;
      const drawOrder = [...this.marketDeck].reverse(); // refillMarket draws from the end of the deck
      const card = drawOrder.find((candidate) => cardIsKind(candidate, guarantee.kind) && cost(candidate) <= Number(guarantee.maxCost ?? Infinity));
      if (!card) continue;
      remove(this.marketDeck, card); this.market.push(card); this.track(card, "offered");
    }
    this.refillMarket(false);
  }

  /** Locations off: no Location is in play all game, and there are no Scene Changes (owner decision 5). */
  fixLocation() {
    this.locationDeck = [];
    this.currentLocation = null;
  }

  marketRefreshesAtRoundEnd() {
    return this.definition.economy.market.stagnationRefresh === "after-every-round" || !this.marketPurchasedThisRound;
  }

  cardInstance(card) { const instance = structuredClone(card); instance.instanceId = `${card.catalogId}#${++this.cardSerial}`; return instance; }

  emptyComboFacts() {
    return { startingHandIds: [], turnPlayed: [], roundPlayed: [], sinceLastTurnPlayed: [], turnAttacks: [], roundAttacks: [], sinceLastTurnAttacks: [], roundBlocks: [], sinceLastTurnBlocks: [], speedGainedSinceLastTurn: false, purchasesSinceLastAscend: [], previousAttackBlocked: false, lastDefenseCard: null, lastDefenseBlocked: false };
  }

  makePlayer(id, character, strategy) {
    const deck = [];
    for (const entry of this.definition.starterDeck) for (let copy = 0; copy < entry.copies; copy += 1) deck.push(this.cardInstance(this.data.byId.get(entry.catalogId)));
    this.rng.shuffle(deck);
    const player = { id, name: `Player ${id + 1}`, character, strategy, hp: this.mode.startingHp, maxHp: this.mode.startingHp, atk: num(character?.stats?.ATK), def: num(character?.stats?.DEF), speed: num(character?.stats?.Speed), deck, hand: [], discard: [], destroyed: [], box: [], played: [], equipment: [], exhaustedEquipment: [], statuses: [], revealed: [], learnedCombos: [], comboOffered: null, comboAttemptedThisTurn: false, comboTriggeredTurn: [], comboTriggeredRound: [], comboTriggeredThisGame: false, comboFacts: this.emptyComboFacts(), examProgress: { zones: [], purchasedTypes: [], koWhileBrown: false }, honorStats: { attacked: false, blocked: false }, completedTasks: [], trainingStripes: { held: 0, awarded: 0, provisional: false, spentTurnKey: null, spendsThisTurn: 0 }, beltCheckActionUsed: false, effectUsage: { turn: {}, round: {}, game: {} }, lastTurnWasHit: false, lastTurnWasBlocked: false, lastTurnAttacked: false, dealtCombatDamageLastTurn: true, characterMarks: {}, anyZoneGrant: null, focus: 0, xp: 0, beltIndex: 0, tempo: true, purchases: 0, plays: 0, openingPurchase: false, firstMarketPurchaseRound: null, firstNonStarterCardPlayedRound: null, marketPurchasesThisAscend: 0, badHabitFocusUsed: false, practiceUsed: false, attackCount: 0, nextAttackPower: 0, nextAttackFlow: false, tempSpeed: 0, turnStats: { zones: new Set(), attacked: false, hit: false, blocked: false, damageTaken: 0, hitCount: 0, incomingAttackCount: 0, kataCount: 0, focusGenerated: 0, playedDefenseSinceLastTurn: false, previousAttackHit: false, previousAttackBlocked: false, previousCardType: null, previousZone: null, flowDrawUsed: false, boughtCardThisTurn: false, boughtCardThisAscend: false, usedConsumableThisRound: false, consumableCount: 0, completedBeltExamThisRound: false, playsThisTurn: 0, attacksThisTurn: 0, beltCheckActionUsed: false } };
    this.draw(player, this.definition.turn.handSize);
    player.promotionHistory = [];
    player.reversalUsedThisRound = false;
    const required = this.definition.openingMulligan.requiredTypes;
    if (required.length && !required.some((type) => new Set(player.hand.map(cardType)).has(type))) { player.deck.push(...player.hand); player.hand = []; this.rng.shuffle(player.deck); this.draw(player, this.definition.turn.handSize); }
    return player;
  }

  emit(event) {
    this.events.push({ ...event, round: event.round ?? this.round });
    this.telemetry.lifecycleEvents += 1;
    if (event.type === "attack") {
      this.telemetry.attacks += 1; this.telemetry.totalDamage += event.damage;
      if (event.reversal) this.telemetry.reversals += 1;
      if (event.damage > 0) this.telemetry.hits += 1;
      if (event.defense && event.damage === 0) this.telemetry.blocks += 1;
      this.telemetry.damagePrevented += Math.max(0, event.block - event.attack + event.damage);
    }
  }

  draw(player, amount) {
    for (let count = 0; count < amount; count += 1) {
      if (!player.deck.length && player.discard.length) player.deck = this.rng.shuffle(player.discard.splice(0));
      const card = player.deck.pop(); if (!card) break; player.hand.push(card); this.track(card, "drawn", player);
    }
  }

  // `box`: one-use cards returned to the box after use, out of the game (rules: Consumables).
  playerZones(player) { return ["deck", "hand", "discard", "destroyed", "box", "played"]; }

  cardOwner(card) {
    return this.players.find((player) => this.playerZones(player).some((zone) => player[zone].includes(card)));
  }

  removeFromPlayerZones(player, card) {
    for (const zone of this.playerZones(player)) remove(player[zone], card);
    remove(player.equipment, card);
    remove(player.exhaustedEquipment, card.instanceId);
  }

  moveCard(player, card, destination) {
    if (!player || !card || !this.playerZones(player).includes(destination)) return false;
    this.removeFromPlayerZones(player, card);
    player[destination].push(card);
    return true;
  }

  // Every discardCard call is an effect discarding outside Hide (Hide moves cards directly);
  // replacing Equipment is not "discarding a card" for Character text.
  discardCard(player, card, { replacement = false } = {}) {
    const fromHand = player.hand.includes(card);
    const moved = this.moveCard(player, card, "discard");
    if (moved) {
      this.track(card, "discarded", player);
      player.turnStats.discardedCardType = cardType(card); player.turnStats.discardedFocusValue = focus(card);
      (player.turnStats.discardedThisTurn ??= []).push(card.instanceId);
      if (!replacement) this.characterEvent(player, "discarded", { card, fromHand, junk: [card.cardType, card.subtype, card.category].includes("Junk"), forced: true });
    }
    return moved;
  }

  destroyCard(player, card) {
    if (!this.moveCard(player, card, "destroyed")) return false;
    this.track(card, "destroyed", player);
    this.emit({ type: "card-destroyed", player: player.id, card: card.catalogId });
    return true;
  }

  returnToBox(player, card) {
    if (!this.moveCard(player, card, "box")) return false;
    this.emit({ type: "card-boxed", player: player.id, card: card.catalogId });
    return true;
  }

  /** Where a resolved one-use card goes (definition.equipment.afterUse), or null when it stays in play. */
  afterUseDestination(card) { return this.definition.equipment?.afterUse?.bySubtype?.[card?.subtype] ?? null; }

  /** A resolved one-use card leaves play, unless its own effect already moved it (e.g. "Destroy this"). */
  finishOneUseCard(player, card) {
    const destination = this.afterUseDestination(card);
    if (!destination || !player.played.includes(card)) return false;
    return destination === "destroy" ? this.destroyCard(player, card) : destination === "box" ? this.returnToBox(player, card) : this.discardCard(player, card);
  }

  /** "Cards played outside your own turn do not generate their printed Focus Value" (rules: Focus). */
  gainPrintedFocus(player, card) {
    if (player.id !== this.activePlayer) return 0;
    const gained = focus(card);
    player.focus += gained; this.telemetry.focusGenerated += gained;
    return gained;
  }

  equipmentIsExhausted(player, card) { return player.exhaustedEquipment.includes(card.instanceId); }

  // "All of your exhausted Equipment readies at your Initiate Phase" (rules: Armor and Gear; glossary: Ready).
  equipmentReadyMoment() { return this.definition.equipment?.readiness?.readyAt ?? "own-initiate"; }

  readyExhaustedEquipment(player) {
    for (const card of player.equipment.filter((candidate) => this.equipmentIsExhausted(player, candidate))) this.setEquipmentReady(player, card, true);
    // Equipment stays with its Character on the bench (Ch. 13), and readies with the rest.
    for (const fighter of player.roster ?? []) if (Array.isArray(fighter.exhaustedEquipment) && fighter.exhaustedEquipment !== player.exhaustedEquipment) fighter.exhaustedEquipment.splice(0);
  }

  /** The active player's turn starts: "until your next turn" effects end and, by default, their Equipment readies. */
  startTurn(player) {
    this.startTurnStatuses(player);
    if (this.equipmentReadyMoment() === "own-initiate") this.readyExhaustedEquipment(player);
  }

  setEquipmentReady(player, card, ready) {
    if (!card || !player.equipment.includes(card)) return false;
    if (ready) remove(player.exhaustedEquipment, card.instanceId);
    else if (!this.equipmentIsExhausted(player, card)) player.exhaustedEquipment.push(card.instanceId);
    this.track(card, ready ? "equipmentReadied" : "equipmentExhausted", player);
    this.emit({ type: ready ? "equipment-ready" : "equipment-exhaust", player: player.id, card: card.catalogId });
    return true;
  }

  addStatus(player, status) {
    player.statuses.push({ ...status, id: status.id ?? `${status.action ?? "status"}:${++this.statusSerial}` });
  }

  removeTemporaryNegativeStatModifier(player, amount = 1) {
    const removable = new Set(["modifyAttackPower", "modifyDefense", "modifyGuard", "modifySpeed"]);
    let removed = 0;
    player.statuses = player.statuses.filter((status) => {
      if (removed >= amount || !removable.has(status.action) || num(status.amount) >= 0) return true;
      removed += 1;
      return false;
    });
    player.turnStats.removedTemporaryNegativeStat = removed > 0;
    return removed;
  }

  /** Standing statuses of one action (deferred durations such as nextAttack wait for their event). */
  statusValue(player, action, { consumeDuration = null, match = {} } = {}) {
    let total = consumeDuration ? this.consumeStatuses(player, action, consumeDuration, match) : 0;
    for (const status of player.statuses) {
      if (status.action !== action || status.consumed || DEFERRED_DURATIONS.has(status.duration)) continue;
      if (status.duration === "whileEquipped" && status.sourceId && !player.equipment.some((card) => card.instanceId === status.sourceId)) continue;
      total += num(status.amount);
    }
    return total;
  }

  /** Does a status's qualifier (zone, Attack tag, target) accept this event? */
  statusMatches(status, { card = null, zone = null, targetId = null, sourceId = null } = {}) {
    if (status.sourceId && sourceId && status.sourceId !== sourceId) return false;
    if (status.zone && status.zone !== zone) return false;
    if (status.tag && !(card?.tags ?? []).includes(status.tag)) return false;
    if (status.targetId !== undefined && status.targetId !== null && targetId !== null && status.targetId !== targetId) return false;
    return true;
  }

  /** Removes and returns the statuses an event consumes; marks they carry join the current strike. */
  takeStatuses(player, action, duration, match = {}) {
    const taken = player.statuses.filter((status) => status.action === action && status.duration === duration && !status.consumed && this.statusMatches(status, match));
    for (const status of taken) { status.consumed = true; if (status.mark && this.combat) (this.combat.marks ??= []).push(`mark:${status.mark}`); }
    player.statuses = player.statuses.filter((status) => !status.consumed);
    return taken;
  }

  consumeStatuses(player, action, duration, match = {}) {
    return this.takeStatuses(player, action, duration, match).reduce((total, status) => total + num(status.amount), 0);
  }

  /** Ends every status whose duration (or `expires` qualifier) is this moment. */
  expireStatuses(player, moment) {
    const ends = (status) => status.duration === moment || status.expires === moment || DURATION_ALIASES[status.duration] === moment;
    for (const status of player.statuses) if (ends(status) && status.action === "speedRestore") player.speed = num(status.amount);
    if (moment === "endOfTurn") for (const card of [...player.equipment]) if (card.temporaryUntilHide) { remove(player.equipment, card); remove(player.played, card); player.exhaustedEquipment = player.exhaustedEquipment.filter((entry) => entry !== card && entry !== card.instanceId); player.discard.push(card); delete card.temporaryUntilHide; }
    player.statuses = player.statuses.filter((status) => !ends(status));
  }

  /** A Speed change: "until X" changes become statuses; every change is a Character "speedChanged" event. */
  changeSpeed(player, amount, duration = "immediate", sourceId = null) {
    if (!amount) return false;
    if (duration && duration !== "immediate") this.addStatus(player, { action: "modifySpeed", amount, duration, sourceId });
    else player.tempSpeed += amount;
    if (amount > 0) player.comboFacts.speedGainedSinceLastTurn = true;
    this.characterEvent(player, "speedChanged", { amount });
    return true;
  }

  /** Start of the holder's turn: "until your next turn" ends, delayed payloads resolve. */
  startTurnStatuses(player) {
    this.expireStatuses(player, "startOfTurn");
    this.expireStatuses(player, "nextTurn");
    for (const status of player.statuses) if (status.duration === "duringNextTurn") status.duration = status.then ?? "endOfTurn";
    const due = player.statuses.filter((status) => status.duration === "nextInitiate");
    player.statuses = player.statuses.filter((status) => status.duration !== "nextInitiate");
    for (const status of due) {
      if (status.action === "initiateFocus") this.gainFocusFor(player, num(status.amount));
      else if (status.action === "initiateDraw") this.draw(player, num(status.amount));
    }
  }

  /** Honor: "next round" statuses become this round's. */
  startRoundStatuses(player) {
    this.expireStatuses(player, "nextHonor");
    for (const status of player.statuses) if (status.duration === "nextRound") status.duration = "endOfRound";
  }

  /** End of the holder's turn: delayed damage lands. */
  resolveDelayedDamage(player) {
    const due = player.statuses.filter((status) => status.duration === "endOfTargetNextTurn" && status.action === "delayedDamage");
    player.statuses = player.statuses.filter((status) => !due.includes(status));
    for (const status of due) { const amount = Math.max(0, num(status.amount)); player.hp = Math.max(0, player.hp - amount); if (amount > 0 && status.sourcePlayerId !== undefined) player.lastDamagedBy = status.sourcePlayerId; }
  }

  hasStatus(player, action) { return player.statuses.some((status) => status.action === action && !status.consumed); }

  removeStatus(player, action) {
    const index = player.statuses.findIndex((status) => status.action === action && !status.consumed);
    if (index < 0) return false;
    player.statuses.splice(index, 1);
    return true;
  }

  effectUsageKey(effect) { return String(effect.id ?? effect.resolver ?? effect.action ?? "effect"); }

  hasUsedEffect(player, effect, scope) { return Boolean(player.effectUsage?.[scope]?.[this.effectUsageKey(effect)]); }

  markUsedEffect(player, effect) {
    const key = this.effectUsageKey(effect);
    player.effectUsage.turn[key] = true; player.effectUsage.round[key] = true; player.effectUsage.game[key] = true;
  }

  refillMarket(full = false) {
    const size = this.definition.economy.market.rowSize;
    if (full) { this.marketDiscard.push(...this.market); this.market = []; }
    while (this.market.length < size) {
      if (!this.marketDeck.length && this.marketDiscard.length) this.marketDeck = this.rng.shuffle(this.marketDiscard.splice(0));
      const next = this.marketDeck.pop(); if (!next) break; this.market.push(next); this.track(next, "offered");
    }
  }

  track(card, key, player, amount = 1) {
    const family = cardFamily(card);
    const stats = this.cardStats.get(card.catalogId) ?? {
      id: card.catalogId, name: card.name, family, offered: 0, drawn: 0, purchased: 0,
      played: 0, discarded: 0, destroyed: 0, hits: 0, blocks: 0,
      damageDealt: 0, damagePrevented: 0, effectApplications: 0,
      equipmentReadied: 0, equipmentExhausted: 0, learned: 0, activated: 0, winnerOwned: 0,
      heldTurns: 0, heldBeforePlay: 0, heldBeforeDiscard: 0, heldBeforeDestroy: 0,
    };
    stats.family = family;
    stats[key] = (stats[key] ?? 0) + amount;
    if (key === "drawn") card._heldSinceTurn = this.turns;
    if (player && ["played", "discarded", "destroyed"].includes(key)) {
      stats.heldTurns += Math.max(0, this.turns - Number(card._heldSinceTurn ?? this.turns));
      stats[key === "played" ? "heldBeforePlay" : key === "discarded" ? "heldBeforeDiscard" : "heldBeforeDestroy"] += 1;
    }
    const familyStats = this.telemetry.families[family] ??= emptyFamilyTelemetry();
    familyStats[key] = (familyStats[key] ?? 0) + amount;
    if (player) {
      (player._used ??= new Set()).add(card.catalogId);
      if (key === "played" && card.deck !== "Starter Deck" && player.firstNonStarterCardPlayedRound === null) player.firstNonStarterCardPlayedRound = this.round;
    }
    this.cardStats.set(card.catalogId, stats);
    const telemetryKey = {
      played: "cardsPlayed", purchased: "cardsAcquired", drawn: "cardsDrawn",
      discarded: "cardsDiscarded", destroyed: "cardsDestroyed", learned: "comboAcquisitions", activated: "comboActivations",
      equipmentReadied: "equipmentReadied", equipmentExhausted: "equipmentExhausted",
    }[key];
    if (telemetryKey) this.telemetry[telemetryKey] += amount;
  }

  gainXp(player, amount, source = "effect") {
    const gained = Math.max(0, num(amount));
    if (!gained || !player) return 0;
    player.xp += gained;
    this.telemetry.xpGenerated += gained;
    this.emit({ type: "xp-generated", player: player.id, amount: gained, source });
    return gained;
  }

  nextBelt(player) { return this.definition.progression.belts[player.beltIndex + 1] ?? null; }

  beltRewardAmount(player, rewardId) {
    return this.definition.progression.belts.slice(0, player.beltIndex + 1).filter((belt) => belt.reward?.id === rewardId).reduce((total, belt) => total + Number(belt.reward.amount ?? 0), 0);
  }

  beltExamComplete(player) { return player.completedTasks.includes(player.beltIndex + 1); }

  markBeltExamComplete(player) {
    const nextIndex = player.beltIndex + 1;
    const exam = this.definition.progression.belts[nextIndex]?.exam;
    if (!exam || player.completedTasks.includes(nextIndex)) return false;
    player.completedTasks.push(nextIndex);
    player.turnStats.completedBeltExamThisRound = true;
    this.emit({ type: "belt-exam", player: player.id, belt: nextIndex, exam: exam.kind });
    this.characterEvent(player, "examRequirement", { exam: exam.kind });
    if (player.trainingStripes.provisional) {
      player.trainingStripes.held = Math.max(0, player.trainingStripes.held - 1);
      player.trainingStripes.awarded = Math.max(0, player.trainingStripes.awarded - 1);
      player.trainingStripes.provisional = false;
    }
    return true;
  }

  checkBeltExam(player) {
    const nextIndex = player.beltIndex + 1;
    const exam = this.definition.progression.belts[nextIndex]?.exam;
    if (!exam || player.completedTasks.includes(nextIndex)) return false;
    const progress = player.examProgress;
    const complete = exam.kind === "three-zones"
      ? ["High", "Mid", "Low"].every((zone) => progress.zones.includes(zone))
      : exam.kind === "two-attacks-hit"
        ? player.turnStats.attacksThisTurn >= 2 && player.turnStats.hit
        : exam.kind === "attack-and-defend"
          ? player.honorStats.attacked && player.honorStats.blocked
          : exam.kind === "market-types"
            ? progress.purchasedTypes.length >= 2
            : exam.kind === "equipment-count"
              ? player.equipment.length >= 2
              : exam.kind === "combo"
                ? Boolean(player.comboTriggeredThisGame)
                : exam.kind === "mixed-turn"
                  ? player.turnStats.playsThisTurn >= 4 && player.turnStats.playedAttack && player.turnStats.playedKata && (player.turnStats.equippedThisTurn || player.turnStats.usedConsumableThisTurn)
                  : exam.kind === "ko"
                    ? Boolean(player.examProgress.koWhileBrown)
                    : false;
    return complete && this.markBeltExamComplete(player);
  }

  // A card played outside its owner's turn (a Reversal) joins the round and since-last-turn
  // histories but not the owner's turn sequence.
  markComboCardPlayed(player, card, zone = "", { outsideTurn = false } = {}) {
    const fact = { cardId: card.catalogId, zone };
    if (!outsideTurn) player.comboFacts.turnPlayed.push(fact);
    player.comboFacts.roundPlayed.push(fact);
    player.comboFacts.sinceLastTurnPlayed.push(fact);
    if (isAttack(card) && !outsideTurn) player.turnStats.playedAttack = true;
    if (card.subtype === "Kata") player.turnStats.playedKata = true;
    this.checkBeltExam(player);
  }

  markComboAttack(player, card, zone, { hit, blocked, reversal = false } = {}) {
    const fact = { cardId: card.catalogId, zone, hit: Boolean(hit), blocked: Boolean(blocked), reversal: Boolean(reversal) };
    if (!reversal) player.comboFacts.turnAttacks.push(fact);
    player.comboFacts.roundAttacks.push(fact);
    player.comboFacts.sinceLastTurnAttacks.push(fact);
    if (!reversal) {
      player.comboFacts.previousAttackBlocked = Boolean(blocked);
      player.turnStats.attacksThisTurn = player.comboFacts.turnAttacks.length;
    }
    player.honorStats.attacked = true;
    const newZone = !player.examProgress.zones.includes(zone);
    player.examProgress.zones = [...new Set([...player.examProgress.zones, zone])];
    const completed = this.checkBeltExam(player);
    // A new zone is a completed requirement of an active three-zone exam (The Belt Collector).
    if (!completed && newZone && this.definition.progression.belts[player.beltIndex + 1]?.exam?.kind === "three-zones") this.characterEvent(player, "examRequirement", { exam: "three-zones" });
  }

  markComboBlock(player, defenseCard, incomingZone, blocked) {
    if (!blocked) return;
    const fact = { defenseCardId: defenseCard?.catalogId ?? null, defenseTags: defenseCard?.tags ?? [], incomingZone, equipmentCount: player.equipment.length };
    player.comboFacts.roundBlocks.push(fact);
    player.comboFacts.sinceLastTurnBlocks.push(fact);
    player.comboFacts.lastDefenseCard = defenseCard ?? null;
    player.comboFacts.lastDefenseBlocked = true;
    player.honorStats.blocked = true;
    player.turnStats.blocked = true;
    this.checkBeltExam(player);
  }

  beginComboTurn(player) {
    player.comboFacts.turnPlayed = [];
    player.comboFacts.turnAttacks = [];
    player.comboFacts.previousAttackBlocked = false;
    player.comboTriggeredTurn = [];
    player.turnStats.playsThisTurn = 0;
    player.turnStats.attacksThisTurn = 0;
    player.turnStats.impactFocusUsed = false;
    player.turnStats.playedAttack = false;
    player.turnStats.playedKata = false;
    player.turnStats.equippedThisTurn = false;
    player.turnStats.comboCount = 0;
    player.turnStats.completedBeltExamThisRound = false;
    player.turnStats.kickCount = 0;
    player.turnStats.cardTypesThisTurn = [];
    player.turnStats.discardedThisTurn = [];
    player.turnStats.dealtCombatDamageThisTurn = false;
    player.comboFacts.startingHandIds = player.hand.map((card) => card.instanceId);
    this.activateCombos(player, "onInitiate", null, "", { currentDefense: player.comboFacts.lastDefenseCard, currentDefenseBlocked: player.comboFacts.lastDefenseBlocked });
  }

  closeComboTurn(player) {
    player.comboFacts.sinceLastTurnPlayed = [];
    player.comboFacts.sinceLastTurnAttacks = [];
    player.comboFacts.sinceLastTurnBlocks = [];
    player.comboFacts.lastDefenseCard = null;
    player.comboFacts.lastDefenseBlocked = false;
    player.comboFacts.speedGainedSinceLastTurn = false;
  }

  comboOffer(player) {
    if (player.learnedCombos.length >= 2 || player.comboOffered || !this.comboDeck.length) return false;
    player.comboOffered = this.comboDeck.pop();
    this.track(player.comboOffered, "offered");
    this.telemetry.comboOpportunities += 1;
    this.emit({ type: "combo-offered", player: player.id, combo: player.comboOffered.catalogId, cost: cost(player.comboOffered) });
    this.characterEvent(player, "comboReveal", {});
    return true;
  }

  returnComboOffer(player) {
    if (!player.comboOffered) return false;
    this.comboDeck.unshift(player.comboOffered);
    this.emit({ type: "combo-declined", player: player.id, combo: player.comboOffered.catalogId });
    player.comboOffered = null;
    return true;
  }

  beginAscend(player) {
    player.turnStats.boughtCardThisAscend = false;
    player.marketPurchasesThisAscend = 0;
    player.beltCheckActionUsed = false;
    player.comboAttemptedThisTurn = false;
    this.awardTrainingStripe(player);
    this.comboOffer(player);
  }

  recordMarketDecision(player, chosenCard = null) {
    const available = [...this.market];
    if (!available.length) return;
    const affordable = available.filter((card) => this.purchaseCost(player, card) <= player.focus);
    this.telemetry.market.opportunities += 1;
    this.telemetry.market.cardsAvailable += available.length;
    this.telemetry.market.affordableCards += affordable.length;
    this.telemetry.market.skippedAffordableCards += affordable.filter((card) => card !== chosenCard).length;
    if (chosenCard) this.telemetry.market.chosenCards += 1;
  }

  learnCombo(player) {
    const combo = player.comboOffered;
    if (this.phase !== "Ascend" || !combo || player.learnedCombos.length >= 2 || player.comboAttemptedThisTurn || this.comboLearnCost(player, combo) > player.focus) return false;
    const price = this.comboLearnCost(player, combo);
    player.statuses = player.statuses.filter((status) => status.action !== "comboLearnCost");
    player.focus -= price;
    player.turnStats.focusSpent = (player.turnStats.focusSpent ?? 0) + price;
    this.telemetry.focusSpent += price;
    player.learnedCombos.push(combo);
    player.comboAttemptedThisTurn = true;
    this.track(combo, "learned", player);
    this.emit({ type: "combo-learned", player: player.id, combo: combo.catalogId, cost: price, learned: player.learnedCombos.length });
    player.comboOffered = null;
    return true;
  }

  /** Printed Focus Cost minus "the next Combo you learn costs X less" discounts (kata.comboDiscount). */
  comboLearnCost(player, combo) {
    return Math.max(0, cost(combo) + player.statuses.filter((status) => status.action === "comboLearnCost").reduce((sum, status) => sum + num(status.amount), 0));
  }

  awardTrainingStripe(player) {
    const rule = this.definition.progression.trainingStripes;
    const next = this.nextBelt(player);
    const state = player.trainingStripes;
    // DDB-RUL-114: Training Stripes run only in modes that enable them.
    if (!rule?.enabled || this.mode.trainingStripes === false || !next || player.xp < Number(next.xp) || this.beltExamComplete(player) || state.provisional || state.held >= Number(rule.maxHeld) || state.awarded >= Number(rule.maxAwardsPerBelt)) return false;
    state.held += 1; state.awarded += 1; state.provisional = true;
    this.emit({ type: "training-stripe-awarded", player: player.id, held: state.held, belt: player.beltIndex });
    return true;
  }

  canPromote(player) {
    const next = this.nextBelt(player);
    return Boolean(next && player.xp >= Number(next.xp) && this.beltExamComplete(player) && !player.beltCheckActionUsed);
  }

  promote(player) {
    if (this.phase !== "Ascend" || !this.canPromote(player)) return false;
    const nextIndex = player.beltIndex + 1;
    const next = this.definition.progression.belts[nextIndex];
    player.beltIndex = nextIndex;
    player.beltCheckActionUsed = true;
    player.trainingStripes = { held: 0, awarded: 0, provisional: false, spentTurnKey: null, spendsThisTurn: 0 };
    const reward = next.reward ?? {};
    if (reward.stat === "ATK") { player.atk += Number(reward.amount ?? 0); player.beltBonus.atk += Number(reward.amount ?? 0); }
    if (reward.stat === "DEF") { player.def += Number(reward.amount ?? 0); player.beltBonus.def += Number(reward.amount ?? 0); }
    if (reward.stat === "Speed") { player.speed += Number(reward.amount ?? 0); player.beltBonus.speed += Number(reward.amount ?? 0); }
    if (reward.onPromotionFocus) { player.focus += Number(reward.onPromotionFocus); this.telemetry.focusGenerated += Number(reward.onPromotionFocus); }
    this.telemetry.promotions += 1;
    player.promotionHistory.push({ from: nextIndex - 1, to: nextIndex, belt: next.name, round: this.round, xp: player.xp });
    this.emit({ type: "promotion", player: player.id, from: nextIndex - 1, to: nextIndex, belt: next.name });
    this.characterEvent(player, "promotion", { belt: next.id });
    if (!this.legacyQuickDuel && this.mode.victory?.blackBelt && nextIndex === this.definition.progression.belts.length - 1) this.declareWinner(player, "black-belt");
    return true;
  }

  canRecoverTrainingStripe(player) {
    const rule = this.definition.progression.trainingStripes;
    const state = player.trainingStripes;
    const spend = rule?.spend;
    const turnKey = `${this.round}:${player.id}`;
    const spendsThisTurn = state.spentTurnKey === turnKey ? state.spendsThisTurn : 0;
    return Boolean(this.phase === "Ascend" && !player.beltCheckActionUsed && spend?.enabled && !state.provisional && state.held >= Number(spend.stripeCost ?? 1) && player.hp < player.maxHp && spendsThisTurn < Number(spend.usesPerTurn ?? 1));
  }

  recoverTrainingStripe(player) {
    const rule = this.definition.progression.trainingStripes;
    const state = player.trainingStripes;
    const spend = rule?.spend;
    if (!this.canRecoverTrainingStripe(player)) return false;
    const turnKey = `${this.round}:${player.id}`;
    const spendsThisTurn = state.spentTurnKey === turnKey ? state.spendsThisTurn : 0;
    state.held -= Number(spend.stripeCost ?? 1);
    state.spentTurnKey = turnKey;
    state.spendsThisTurn = spendsThisTurn + 1;
    player.beltCheckActionUsed = true;
    player.hp = Math.min(player.maxHp, player.hp + Number(spend.healHp ?? 0));
    this.emit({ type: "training-stripe-spent", player: player.id, held: state.held, hp: player.hp });
    return true;
  }

  // A Combo completes at the first trigger whose requirements are met. Within the same strike its
  // later parts (on Hit, after the Attack resolves) still pay out at their own timing, without
  // re-checking requirements or counting as a new trigger (rules: Combo Timing — Modifier vs.
  // Aftermath). Its passive part, if any, applies once when it completes.
  activateCombos(player, trigger, currentCard, zone, event = {}) {
    if (!player.learnedCombos.length) return [];
    const activated = [];
    const session = this.combat ? ((this.combat.combos ??= {})[player.id] ??= []) : null;
    for (const combo of player.learnedCombos) {
      if (session?.includes(combo.catalogId)) { this.resolveComboPart(player, combo, trigger, currentCard, zone, event); continue; }
      if (!comboTimingAllows(combo, player)) continue;
      const result = evaluateCombo(this.data, combo, player, currentCard, zone, event);
      if (!result.supported) { this.unsupportedEffect(combo, { id: `combo-requirement:${combo.catalogId}`, resolver: result.reason }); continue; }
      if (!result.eligible) continue;
      session?.push(combo.catalogId);
      player.comboTriggeredTurn.push(combo.catalogId);
      player.comboTriggeredRound.push(combo.catalogId);
      player.comboTriggeredThisGame = true;
      player.turnStats.comboCount = (player.turnStats.comboCount ?? 0) + 1;
      this.track(combo, "activated", player);
      this.emit({ type: "combo-completed", player: player.id, combo: combo.catalogId, trigger });
      const passive = comboEffects(this.data, combo, "passive");
      if (passive.length) this.resolveComboPart(player, combo, "passive", currentCard, zone, event);
      this.resolveComboPart(player, combo, trigger, currentCard, zone, event, result.context);
      activated.push(combo.catalogId);
      this.checkBeltExam(player);
    }
    return activated;
  }

  // ---- Character abilities (engine/character-abilities.mjs) ---------------------------------
  isActive(player) { return player?.id === this.activePlayer; }

  characterEffectGroups(player) {
    const groups = new Map();
    for (const effect of this.effects.get(player?.character?.catalogId)?.effects ?? []) {
      const resolver = String(effect.resolver ?? "");
      if (!groups.has(resolver)) groups.set(resolver, []);
      groups.get(resolver).push(effect);
    }
    return groups;
  }

  characterHasResolver(player, resolver) { return this.characterEffectGroups(player).has(resolver); }

  /** Green abilities unlock at the Belt named in definition.progression.greenAbility (rules: Character Card Information). */
  characterAbilityUnlocked(player, resolver) {
    const rule = this.definition.progression.greenAbility;
    if (!rule || !resolver.startsWith(rule.resolverNamespace)) return true;
    const unlockIndex = this.definition.progression.belts.findIndex((belt) => belt.id === rule.unlockBelt);
    return player.beltIndex >= unlockIndex;
  }

  characterAbilityAvailable(player, resolver) {
    if (!player?.character || player.eliminated || !this.characterHasResolver(player, resolver) || !this.characterAbilityUnlocked(player, resolver)) return false;
    const limit = CHARACTER_ABILITIES[resolver]?.limit;
    return !limit || !player.effectUsage[limit]?.[`character:${resolver}`];
  }

  markCharacterUsed(player, resolver) {
    const key = `character:${resolver}`;
    player.effectUsage.turn[key] = true; player.effectUsage.round[key] = true; player.effectUsage.game[key] = true;
    this.emit({ type: "character-ability", player: player.id, character: player.character?.catalogId ?? null, resolver });
  }

  /** Runs every Character ability of `player` that listens to `type`; returns the (possibly changed) event. */
  characterEvent(player, type, event = {}) {
    if (!player?.character || player.eliminated) return event;
    for (const [resolver, effects] of this.characterEffectGroups(player)) {
      const ability = CHARACTER_ABILITIES[resolver];
      const listens = [ability?.on].flat().includes(type);
      if (!listens || !ability.resolve || !this.characterAbilityAvailable(player, resolver)) continue;
      const used = ability.resolve({ game: this, player, opponent: event.opponent ?? event.attacker ?? this.opponentOf(player), event, effects, amount: num(effects[0].amount) || 1, resolver, eventType: type });
      if (used) { this.markCharacterUsed(player, resolver); this.telemetry.effectApplications += 1; }
    }
    return event;
  }

  /** A card the controller played or equipped this turn (Attacks included). */
  cardPlayedEvent(player, card, zone = null) {
    if (this.isActive(player)) player.turnStats.cardTypesThisTurn = [...new Set([...(player.turnStats.cardTypesThisTurn ?? []), cardType(card)])];
    this.characterEvent(player, "cardPlayed", { card, zone });
  }

  characterConditionsPass(player, effect, context) {
    const result = this.evaluateConditions(effect, { ...context, player, opponent: context.opponent ?? this.opponentOf(player) });
    return result.known && result.pass;
  }

  offerCharacterChoice(player, resolver, options) {
    return this.offerChoice(() => { this.pendingChoice = { kind: "structured", playerId: player.id, characterAbility: resolver, effectId: resolver, options }; return true; });
  }

  resolveCharacterChoice(pending, selected) {
    const player = this.players[pending.playerId];
    this.pendingChoice = null;
    CHARACTER_ABILITIES[pending.characterAbility]?.choose?.({ game: this, player, selected, resolver: pending.characterAbility });
    return true;
  }

  drawThenDiscard(player, draws = 1, discards = 1) {
    this.draw(player, draws);
    if (discards > 0) this.offerChoice(() => this.queueCardChoice(player, player, { id: "character-cycle" }, "discard", discards));
    return true;
  }

  gainFocusFor(player, amount) {
    if (!amount) return false;
    player.focus += amount; player.turnStats.focusGenerated = (player.turnStats.focusGenerated ?? 0) + amount; this.telemetry.focusGenerated += amount;
    return true;
  }

  dealDirectDamage(source, target, amount) {
    target.hp = Math.max(0, target.hp - Math.max(0, amount));
    if (amount > 0 && target !== source) target.lastDamagedBy = source.id;
    return true;
  }

  putOnDeckBottom(player, card) { this.removeFromPlayerZones(player, card); player.deck.unshift(card); return true; }

  resolveComboPart(player, combo, trigger, currentCard, zone, event = {}, requirementContext = null) {
    const effects = comboEffects(this.data, combo, trigger);
    if (!effects.length) return;
    const context = { ...(event.context ?? requirementContext ?? comboContext(this.data, player, currentCard, zone, event)), opponent: this.opponentOf(player), attackCard: currentCard, defenseCard: event.currentDefense, zone, currentAttackHit: event.currentAttackHit, isComboFinisher: true, comboIsLearned: true, effectOverride: effects };
    const before = this.telemetry.effectApplications;
    const resolved = this.applyCardEffects(player, combo, trigger, context);
    delete resolved.effectOverride;
    if (event.context) Object.assign(event.context, resolved);
    this.telemetry.comboEffectsResolved += Math.max(0, this.telemetry.effectApplications - before);
  }

  cardEffects(card, trigger) { return (this.effects.get(card.catalogId)?.effects ?? []).filter((effect) => effect.trigger === trigger); }

  revealLocation() {
    if (!this.tableOptions.locations) return false; // Locations off: no scene ever appears
    if (!this.locationDeck.length && this.locationDiscard.length) this.locationDeck = this.rng.shuffle(this.locationDiscard.splice(0));
    const next = this.locationDeck.pop();
    if (!next) return false;
    if (this.currentLocation) this.locationDiscard.push(this.currentLocation);
    const sceneChange = Boolean(this.currentLocation);
    this.currentLocation = next; this.sceneChangedThisRound = true;
    this.emit({ type: "scene-change", location: next.catalogId });
    if (sceneChange && this.players) for (const player of this.players) { this.expireStatuses(player, "scene"); this.characterEvent(player, "sceneChange", { location: next.catalogId }); }
    return true;
  }

  locationEffects(locationEvent) {
    if (!this.currentLocation) return [];
    return this.cardEffects(this.currentLocation, "passive").filter((effect) => {
      const condition = (effect.conditions ?? []).find((entry) => entry.kind === "locationEvent");
      return !condition || condition.value === locationEvent;
    });
  }

  adjustsWeaponAttackBonus(effect) { return this.structuredParams(effect).locationOperation === "modifyWeaponAttackBonus"; }

  // The Location's effects resolve in their own frame (their source card and effect list); only
  // their results flow back, so the Attack or Defense card that resolves next uses its own effects.
  // Weapon Attack Bonus adjustments are applied per Weapon by weaponAttackBonus().
  applyLocationEvent(player, locationEvent, context = {}) {
    const effects = this.locationEffects(locationEvent).filter((effect) => !this.adjustsWeaponAttackBonus(effect));
    if (!effects.length) return { ...context };
    const result = this.applyCardEffects(player, this.currentLocation, "passive", { ...context, locationEvent, sceneChanged: this.sceneChangedThisRound, sourceCard: this.currentLocation, effectOverride: effects });
    for (const frameKey of ["effectOverride", "locationEvent", "sceneChanged", "sourceCard"]) delete result[frameKey];
    if (context.sourceCard) result.sourceCard = context.sourceCard;
    return result;
  }

  // Printed Weapon Attack Bonus is added to every Attack its wielder makes (rules: Weapons; Final
  // Combat Formula), adjusted per Weapon by Location text such as "Street Weapons gain +1 Attack Bonus".
  weaponAttackBonus(player, context) {
    const adjustments = this.locationEffects("attack").filter((effect) => this.adjustsWeaponAttackBonus(effect));
    let total = 0;
    for (const weapon of (player.equipment ?? []).filter((card) => card.subtype === "Weapon")) {
      let bonus = num(weapon.stats?.["Attack Bonus"]);
      for (const effect of adjustments) {
        const conditions = this.evaluateConditions(effect, { ...context, player, sourceCard: weapon });
        if (!conditions.known || !conditions.pass) continue;
        bonus += num(effect.amount);
        const floor = this.structuredParams(effect).minimumFinalValue;
        if (floor !== undefined) bonus = Math.max(num(floor), bonus);
      }
      total += bonus;
    }
    return total;
  }

  // Armor adds its printed DEF when its zone covers the declared zone; "Any" is Universal (rules:
  // Armor and Gear). Most Armor restates that value as a passive DEF effect of the same amount; that
  // effect is then the printed value (possibly qualified, e.g. "from Weapons") and is not doubled.
  printedArmorDefense(player, zone) {
    let total = 0;
    for (const card of player.equipment ?? []) {
      const printed = card.subtype === "Defense Equipment" ? guard(card) : 0;
      if (!printed || !armorCoversZone(card, zone) || this.restatesPrintedArmor(card, printed)) continue;
      total += Math.max(0, printed - this.defenseSuppression(player, card));
    }
    return total;
  }

  restatesPrintedArmor(card, printed) {
    return this.cardEffects(card, "passive").some((effect) => effect.effect === "equipment.modifyDefenseContribution" && effect.duration === "whileEquipped" && num(effect.amount) === printed);
  }

  evaluateConditions(effect, context) {
    // A Reversal is played outside its owner's turn, so it never counts as an Attack "this turn".
    const isReversal = Boolean(context.isReversal);
    // While an Attack is being declared it already counts as this turn's next Attack.
    const turnAttackCount = isReversal ? 0 : context.player.attackCount + (context.declaring ? 1 : 0);
    const values = {
      isFastest: this.currentSpeed(context.player) > this.currentSpeed(context.opponent),
      firstAttackThisTurn: turnAttackCount === 1,
      firstNormalAttackThisTurn: turnAttackCount === 1,
      focusSpentEarlierThisTurn: (context.player.turnStats.focusSpent ?? 0) > 0,
      usedConsumableThisTurn: Boolean(context.player.turnStats.usedConsumableThisTurn),
      firstCardPlayedThisTurn: (context.player.turnStats.playsThisTurn ?? 0) === 1,
      // A Reaction reads the number of the opponent's Attack it answers.
      attackNumber: context.incomingAttackNumber ?? turnAttackCount,
      defenderPlayedDefense: Boolean(context.defensePlayed),
      afterOpponentCommitsDefense: Boolean(context.defensePlayed),
      targetHpAtMost: context.opponent.hp,
      hasTempo: Boolean(context.player.tempo),
      targetPermanentEquipmentCount: context.opponent.equipment.length,
      hasFewerCardsThanTarget: context.player.hand.length < context.opponent.hand.length,
      alternateZone: context.zone,
      attackZone: context.zone,
      attackZones: context.zone,
      incomingZones: context.zone,
      incomingAttackTargetsSelf: Boolean(context.targetsSelf ?? true),
      sourceExhausted: Boolean(context.sourceCard && context.player && this.equipmentIsExhausted(context.player, context.sourceCard)),
      firstDamageThisRound: (context.player.turnStats.damageTaken ?? 0) === 0 || context.damage > 0 && (context.player.turnStats.damageTaken ?? 0) === context.damage,
      blockedThisRound: Boolean(context.player.turnStats.blocked),
      playedDefenseSinceLastTurn: Boolean(context.player.turnStats.playedDefenseSinceLastTurn),
      previousAttackHit: Boolean(context.player.turnStats.previousAttackHit),
      differentZoneFromPreviousAttack: context.player.turnStats.previousZone ? context.player.turnStats.previousZone !== context.zone : false,
      wasHitSinceLastTurn: Boolean(context.player.lastTurnWasHit),
      firstDefenseThisRound: (context.player.turnStats.defenseCount ?? 0) === 0,
      firstIncomingAttackThisRound: (context.player.turnStats.incomingAttackCount ?? 0) === 1,
      firstKataThisTurn: (context.player.turnStats.kataCount ?? 0) === 0,
      firstHitThisTurn: context.damage > 0 ? context.player.turnStats.hitCount === 1 : !context.player.turnStats.hit,
      oncePerTurn: !this.hasUsedEffect(context.player, effect, "turn"),
      oncePerRound: !this.hasUsedEffect(context.player, effect, "round"),
      oncePerGame: !this.hasUsedEffect(context.player, effect, "game"),
      sameRoundOnly: true,
      sameTurnOnly: true,
      ownTurn: context.player.id === this.activePlayer,
      firstMatchingPerRound: !this.hasUsedEffect(context.player, effect, "round"),
      firstMatchingPerTurn: !this.hasUsedEffect(context.player, effect, "turn"),
      equipmentTagAny: context.sourceCard?.tags ?? context.attackCard?.tags ?? [],
      xpSourceAny: context.xpFromLegalAttackOrDefense ? ["Attack", "Defense"] : [],
      isKoXp: Boolean(context.isKoXp),
      kataGrantedFlowThisAttack: Boolean(context.player.nextAttackFlow),
      firstKataFlowThisTurn: (context.player.turnStats.kataFlowCount ?? 0) === 0,
      cardTypeAny: context.purchasedCard?.cardType ?? context.attackCard?.subtype ?? context.resolvedCardType,
      attackedThisTurn: Boolean(context.player.turnStats.attacked),
      printedCostAtLeast: context.marketCard ? cost(context.marketCard) : context.purchaseCost ?? 0,
      isComboFinisher: Boolean(context.isComboFinisher),
      healingSourceAny: context.healingSource ? [context.healingSource] : [],
      usesSceneChosenCounterZone: Boolean(context.zone && context.sceneChosenZone === context.zone),
      attackHit: Boolean(context.damage > 0),
      sameRoundAsSceneChoice: Boolean(context.sameRoundAsSceneChoice ?? true),
      reductionSourceAny: context.reductionSource ? [context.reductionSource] : [],
      firstConsumableThisTurn: context.player.turnStats.consumableCount === 1,
      firstItemPurchaseThisAscend: context.player.turnStats.boughtCardThisTurn === true && !context.player.turnStats.previousItemPurchase,
      cardSubtypeOrTagAny: context.purchasedCard ? [context.purchasedCard.subtype, ...(context.purchasedCard.tags ?? [])] : [],
      comboIsLearned: Boolean(context.comboIsLearned),
      isSlowest: this.currentSpeed(context.player) < this.currentSpeed(context.opponent),
      selfSpeedAtLeast: this.currentSpeed(context.player),
      firstAcrossPlayersPerRound: !this.hasUsedEffect(context.player, effect, "round"),
      hasWeaponEquipped: context.player.equipment.some((entry) => entry.subtype === "Weapon"),
      equipmentExhaustedEarlierThisRound: Boolean(context.equipmentExhaustedEarlierThisRound),
      firstEquipmentExhaustThisRound: Boolean(context.equipmentExhaustedEarlierThisRound),
      equippedCardTagAny: context.equippedCard?.tags ?? [],
      firstMatchingPerSceneStay: !this.hasUsedEffect(context.player, effect, "game"),
      targetSpeedHigher: this.currentSpeed(context.opponent) > this.currentSpeed(context.player),
      targetXpHigher: context.opponent.xp > context.player.xp,
      targetTempoUsed: !context.opponent.tempo,
      hasWeaponEquipped: context.player.equipment.some((card) => card.subtype === "Weapon"),
      playedKataThisTurn: (context.player.turnStats.kataCount ?? 0) > 0,
      completedBeltExamThisRound: Boolean(context.player.turnStats.completedBeltExamThisRound),
      blockedSinceLastTurn: Boolean(context.player.lastTurnWasBlocked),
      priorLowAttack: context.player.turnStats.previousZone === "Low",
      previousAttackBlocked: Boolean(context.player.turnStats.previousAttackBlocked),
      previousCardIsItemOrConsumable: ["Item", "Consumable"].includes(context.player.turnStats.previousCardType),
      previousCardIsItem: ["Item", "Consumable"].includes(context.player.turnStats.previousCardType),
      previousCardIsKataOrItem: ["Kata", "Item", "Consumable"].includes(context.player.turnStats.previousCardType),
      previousAttackZoneMidOrHigh: ["Mid", "High"].includes(context.player.turnStats.previousZone),
      priorDifferentZoneCount: context.player.turnStats.zones.size,
      priorPunchAttack: Boolean(context.player.turnStats.previousAttackTags?.includes("Punch")),
      priorSpinAttack: Boolean(context.player.turnStats.previousAttackTags?.includes("Spin")),
      priorJumpOrSpinAttack: Boolean(context.player.turnStats.previousAttackTags?.some((tag) => ["Jump", "Spin"].includes(tag))),
      focusGeneratedThisTurn: context.player.turnStats.focusGenerated ?? 0,
      hasImprovisedWeapon: context.player.equipment.some((card) => card.subtype === "Gear" && (card.tags ?? []).includes("Improvised")),
      dealtDamagePreviousTurn: !context.player.lastTurnWasHit,
      nextMatchingAttack: Boolean(context.player.statuses.some((status) => status.duration === "nextAttack")),
      firstAttackAfterKataThisTurn: turnAttackCount === 1 && context.player.turnStats.kataCount > 0,
      equippedThisTurn: Boolean(context.player.turnStats.equippedThisTurn),
      didNotAttackPreviousTurn: !context.player.lastTurnAttacked,
      hasNotAttackedThisTurn: turnAttackCount === 1,
      firstAttackWithTagThisTurn: context.attackCard?.tags ?? [],
      defenseHasTag: context.defenseCard?.tags ?? [],
      defenseTagAny: context.defenseCard?.tags ?? [],
      incomingAttackZone: context.zone,
      defenseZone: context.zone,
      firstLowAttackThisTurn: context.zone === "Low" && Boolean(context.firstAttackInZoneThisTurn),
      attackBlocked: Boolean(context.previousAttackBlocked ?? (context.damage !== undefined && context.damage <= 0)),
      firstComboThisTurn: (context.player.turnStats.comboCount ?? 0) === 1,
      firstConsumableThisTurn: context.player.turnStats.usedConsumableThisTurn === true && (context.player.turnStats.consumableCount ?? 0) === 1,
      firstConsumableUsedThisTurn: context.player.turnStats.usedConsumableThisTurn === true && (context.player.turnStats.consumableCount ?? 0) === 1,
      firstHighAttackThisTurn: context.zone === "High" && turnAttackCount === 1,
      firstHitWithSourceThisRound: Boolean(context.damage > 0 && context.player.turnStats.hitCount === 1),
      hasTwoPairedWeapons: context.player.equipment.filter((card) => card.subtype === "Weapon" && (card.tags ?? []).includes("Paired")).length >= 2,
      marketEndSlot: Boolean(context.marketCard && this.market.at(-1) === context.marketCard),
      playedAsReversal: isReversal,
      boughtCardLastAscend: Boolean(context.player.turnStats.boughtCardThisAscend),
      costPaid: Boolean(context.costPaid ?? context.purchaseCost !== undefined),
      consumableUsedThisRound: Boolean(context.player.turnStats.usedConsumableThisRound || context.player.turnStats.usedConsumableThisTurn),
      purchaseCompleted: Boolean(context.purchaseCompleted),
      purchasedCardCost: context.purchaseCost ?? 0,
      ascendCompleted: Boolean(context.ascendCompleted),
      boughtCardThisAscend: Boolean(context.player.turnStats.boughtCardThisAscend),
      nextAttackDifferentZone: context.player.turnStats.previousZone ? context.player.turnStats.previousZone !== context.zone : false,
      nextAttackHasTag: context.attackCard?.tags ?? [],
      equippedCardIsSource: Boolean(context.equippedCard && context.equippedCard === context.sourceCard),
      incomingDamageAtLeast: context.incomingDamage ?? context.player.turnStats.damageTaken ?? 0,
      xpFromLegalAttackOrDefense: Boolean(context.xpFromLegalAttackOrDefense),
      // In a Block trigger the opponent is, by definition, the attacker whose Attack was Blocked.
      sameOpponentAsBlockedAttack: context.blockedAttackerId !== undefined ? context.blockedAttackerId === context.opponent.id : context.player.turnStats.previousOpponentId === context.opponent.id,
      nextPurchaseOnly: true,
      minimumFinalCost: context.purchaseCost ?? Number.MAX_SAFE_INTEGER,
      manualActivation: Boolean(context.manualActivation),
      pendingFromSource: Boolean(context.sourceCard && this.equipmentIsExhausted(context.player, context.sourceCard)),
      defenseOutsideTurn: Boolean(context.defenseOutsideTurn),
      equippedCardIsOtherPermanentEquipment: Boolean(context.equippedCard && context.equippedCard !== context.sourceCard && ["Weapon", "Gear", "Defense Equipment"].includes(context.equippedCard.subtype)),
      drawAfterCost: 1,
      discardCost: 1,
      draw: 1,
      discard: 1,
      grantFlowTo: "nextAttack",
      window: context.phase ?? this.phase,
      nextPurchase: true,
      discount: 1,
      minimumCost: 0,
      minimumPrintedCost: 0,
      firstMatchingPerRound: !this.hasUsedEffect(context.player, effect, "round"),
      firstMatchingPerTurn: !this.hasUsedEffect(context.player, effect, "turn"),
      targetHasTemporaryNegativeStat: context.opponent.statuses.some((status) => num(status.amount) < 0),
      targetHasExhaustedEquipment: context.opponent.exhaustedEquipment.length > 0,
      selfSpeedChangedThisRound: context.player.tempSpeed !== 0 || context.player.statuses.some((status) => status.action === "modifySpeed"),
      incomingAttackIsUnarmed: !context.opponent.equipment.some((card) => card.subtype === "Weapon"),
      firstCombatDamageThisRound: context.damage > 0 ? context.player.turnStats.damageTaken === context.damage : context.player.turnStats.damageTaken === 0,
      firstDamagingAttackThisRound: context.damage > 0 ? context.player.turnStats.damageTaken === context.damage : context.player.turnStats.damageTaken === 0,
      combatDamageDealt: Number(context.damage ?? 0),
      firstHitWithSourceThisTurn: context.damage > 0 && context.player.turnStats.hitCount === 1,
      firstCombatDamageWithSourceThisTurn: context.damage > 0 && context.player.turnStats.hitCount === 1,
      attackHasAnyTag: context.attackCard?.tags ?? [],
      damageSourceIsWeapon: Boolean(context.attackCard?.tags?.includes("Weapon") || context.attackCard?.subtype === "Weapon"),
      attackedThisTurn: Boolean(context.player.turnStats.attacked),
      firstDifferentZoneSequenceThisTurn: context.player.turnStats.zones.size === 1,
      focusGeneratedBySingleCard: context.player.turnStats.focusGenerated ?? 0,
      firstQualifyingHitThisTurn: context.damage > 0 && context.player.turnStats.hitCount === 1,
      playedAttackThisTurn: Boolean(context.player.turnStats.attacked),
      discardedFocusValue: context.player.turnStats.discardedFocusValue ?? 0,
      discardedCardType: context.player.turnStats.discardedCardType ?? null,
      marketCardsRemaining: this.market?.length ?? 0,
      hpAtOrBelowHalfMax: context.player.hp <= context.player.maxHp / 2,
      beltAtLeast: ["White", "Gold", "Orange", "Green", "Purple", "Blue", "Red", "Brown", "Black"][context.player.beltIndex] ?? "White",
      completesActiveBeltExam: Boolean(context.player.turnStats.completedBeltExamThisRound),
      examRequirementCompleted: Boolean(context.player.turnStats.completedBeltExamThisRound),
      goldBeltExamThirdZone: context.player.beltIndex === 1 && context.player.turnStats.zones.size >= 3,
      sourceArmorHelpedBlock: Boolean(context.sourceCard?.subtype === "Defense Equipment" && context.block > 0),
      firstArmorBlockThisRound: context.sourceCard?.subtype === "Defense Equipment" && (context.player.turnStats.armorBlocksThisRound ?? 0) === 0,
      armedEquipmentZoneMatched: this.armedZoneCall(context.player, context.sourceCard) ? this.armedZoneCall(context.player, context.sourceCard).value === context.zone : Boolean(!context.sourceCard?.zone || context.sourceCard.zone === "Any" || context.sourceCard.zone === context.zone),
      currentCardType: context.sourceCard?.cardType ?? context.sourceCard?.subtype,
      cardType: context.sourceCard?.cardType ?? context.sourceCard?.subtype,
      cardTypeAny: context.sourceCard?.cardType ?? context.sourceCard?.subtype,
      // "After you play a Kata": the type of the card that just resolved.
      resolvedCardType: context.resolvedCard ? cardType(context.resolvedCard) : null,
      attackUsesSourceEquipment: Boolean(context.attackCard?.tags?.includes("Weapon") || context.sourceCard?.subtype === "Weapon"),
      incomingAttackUsesWeapon: Boolean(context.attackCard?.tags?.includes("Weapon") || context.attackCard?.subtype === "Weapon"),
      attackHasTag: context.attackCard?.tags ?? [],
      attackTagAny: context.attackCard?.tags ?? [],
      minimumBelt: ["White", "Gold", "Orange", "Green", "Purple", "Blue", "Red", "Brown", "Black"][context.player.beltIndex] ?? "White",
      currentAttackIsNormal: !isReversal,
      attackIsReversal: isReversal,
      attackIsUnarmed: Boolean(context.attackIsUnarmed) || !context.player.equipment.some((card) => card.subtype === "Weapon"),
      targetHasMatchingArmor: context.opponent.equipment.some((card) => card.subtype === "Defense Equipment" && (card.tags ?? []).some((tag) => (context.attackCard?.tags ?? []).includes(tag))),
    };
    const beltRank = (value) => ["White", "Gold", "Orange", "Green", "Purple", "Blue", "Red", "Brown", "Black"].indexOf(String(value));
    const parse = (condition) => {
      if (typeof condition !== "string") return condition;
      const fields = Object.fromEntries([...condition.matchAll(/([a-zA-Z]+)=([^;}]*)/g)].map((match) => [match[1], match[2]]));
      const value = fields.value === "True" || fields.value === "true" ? true : fields.value === "False" || fields.value === "false" ? false : Number.isNaN(Number(fields.value)) ? fields.value : Number(fields.value);
      return { kind: fields.kind, operator: fields.operator ?? "eq", value };
    };
    const compare = (actual, operator, expected) => {
      if (Array.isArray(expected) && (operator === "eq" || operator === "includes" || operator === "includesAny")) return expected.includes(actual);
      if (operator === "includesAny") return Array.isArray(expected) && (Array.isArray(actual) ? expected.some((value) => actual.includes(value)) : expected.includes(actual));
      if (operator === "includes") return Array.isArray(actual) ? actual.includes(expected) : String(actual ?? "").includes(String(expected ?? ""));
      if (operator === "notIncludes") return Array.isArray(actual) ? !actual.includes(expected) : !String(actual ?? "").includes(String(expected ?? ""));
      if (operator === "gt") return Number(actual) > Number(expected);
      if (operator === "gte") return Number(actual) >= Number(expected);
      if (operator === "lt") return Number(actual) < Number(expected);
      if (operator === "lte") return Number(actual) <= Number(expected);
      if (operator === "neq") return actual !== expected;
      return actual === expected;
    };
    for (const raw of effect.conditions ?? []) {
      const condition = parse(raw); const kind = String(condition?.kind ?? "");
      if (kind === "always") continue;
      // A zone list on an effect that answers an Attack applies only to Attacks in those zones.
      if (kind === "incomingZones" && context.zone && Array.isArray(condition.value) && !condition.value.includes(context.zone)) return { known: true, pass: false };
      // These are structured effect parameters, not predicates over mutable
      // game state. Their consumers validate them when creating the choice.
      if (["choiceKind", "choiceOptions", "sourceZone", "cardFamily", "permanentOnly", "equipNow", "ifSubtype", "gearEntersReady", "gearNextAttackPower", "additionalFocusGenerated", "destination", "thenDiscard", "eligibleSubtypes", "gearBonus", "zones", "drawIfSourceZone", "drawAmount", "lookCount", "eligibleTypes", "keepCount", "restAction", "optionalKeep", "differentCardTypesFocus", "noMatchFocus", "piercingScope", "scope", "duration", "focusGain", "allowedZones", "chooseZone", "discardCount", "drawCount", "maximumLoss", "nextItemOnly", "afterThatConsumable", "attackTiming", "appliesTo", "itemCostPenalty", "defenseGuardPenalty", "minimumDraw", "sourceActivationArmed", "equippedCardSubtypeIn"].includes(kind) || structuredParameterKinds.has(kind)) continue;
      if (!(kind in values)) return { known: false, pass: false };
      if (kind === "nextPurchaseOnly") continue;
      // Boolean condition shorthands such as { kind: "oncePerRound" }
      // mean that the derived fact must be true.  Canonical data uses this
      // form for several lifecycle predicates, so an omitted value is not a
      // comparison against undefined.
      if (condition.value === undefined) {
        if (!values[kind]) return { known: true, pass: false };
        continue;
      }
      if (["minimumCost", "minimumPrintedCost", "discount"].includes(kind) && context.purchaseCost === undefined) continue;
      if (kind === "minimumFinalCost" && context.purchaseCost === undefined) continue;
      if (kind === "minimumBelt") { if (beltRank(values[kind]) < beltRank(condition.value)) return { known: true, pass: false }; continue; }
      if (kind === "selfSpeedAtLeast") { if (values[kind] < Number(condition.value)) return { known: true, pass: false }; continue; }
      if (kind === "beltAtLeast") { if (beltRank(values[kind]) < beltRank(condition.value)) return { known: true, pass: false }; continue; }
      if (["attackTagAny", "attackHasTag", "attackHasAnyTag", "defenseTagAny", "equipmentTagAny"].includes(kind)) { const tags = values[kind]; const expected = Array.isArray(condition.value) ? condition.value : [condition.value]; if (!expected.some((tag) => tags.includes(tag))) return { known: true, pass: false }; continue; }
      if (["firstAttackWithTagThisTurn", "defenseHasTag"].includes(kind)) { const expected = Array.isArray(condition.value) ? condition.value : [condition.value]; if (!expected.some((tag) => values[kind].includes(tag))) return { known: true, pass: false }; continue; }
      if (!compare(values[kind], condition.operator ?? "eq", condition.value)) return { known: true, pass: false };
    }
    return { known: true, pass: true };
  }

  // Passive Equipment modifiers for one strike. DEF that Armor (Defense Equipment) adds is kept
  // apart as `armorDefense`, because Piercing ignores Armor DEF and nothing else.
  applyPassiveEquipment(player, opponent, context = {}) {
    const result = { player, opponent, ...context };
    for (const equipment of player.equipment) {
      const before = Object.fromEntries(["attackPowerModifier", "guardModifier", "defenseModifier", "damagePrevention", "piercing"].map((key) => [key, result[key] ?? 0]));
      const next = this.applyCardEffects(player, equipment, "passive", { ...result, sourceCard: equipment });
      for (const key of Object.keys(before)) if (next[key] !== undefined) result[key] = (result[key] ?? 0) + (next[key] ?? 0) - before[key];
      this.suppressDefenseContribution(player, equipment, result, before.defenseModifier);
      if (equipment.subtype !== "Defense Equipment") continue;
      const armor = (result.defenseModifier ?? 0) - before.defenseModifier;
      result.defenseModifier = before.defenseModifier;
      result.armorDefense = (result.armorDefense ?? 0) + armor;
    }
    return result;
  }

  /** "It provides 1 less DEF": a suppressed Equipment card's own DEF contribution shrinks, never below 0. */
  suppressDefenseContribution(player, equipment, result, defenseBefore) {
    const suppression = this.defenseSuppression(player, equipment);
    const contribution = (result.defenseModifier ?? 0) - defenseBefore;
    if (suppression > 0 && contribution > 0) result.defenseModifier -= Math.min(contribution, suppression);
  }

  defenseSuppression(player, equipment) {
    return player.statuses.filter((status) => status.action === "equipmentDefenseSuppression" && status.cardId === equipment.instanceId).reduce((total, status) => total + num(status.amount), 0);
  }

  applyEquipmentWatchers(player, resolver, context = {}) {
    const result = { ...context };
    for (const equipment of player.equipment) {
      const effects = this.cardEffects(equipment, "passive").filter((effect) => effect.resolver === resolver && (!context.watchCondition || (effect.conditions ?? []).some((condition) => condition.kind === context.watchCondition)));
      if (effects.length) Object.assign(result, this.applyCardEffects(player, equipment, "passive", { opponent: this.opponentOf(player), sourceCard: equipment, ...result, effectOverride: effects }));
    }
    return result;
  }

  /**
   * The effects an equipped card resolves for one trigger. `side` keeps "incoming" (answers an
   * Attack aimed at the owner) or "own" effects. An ability with an exhaust cost is usable only
   * while its card is ready (rules: Armor and Gear).
   */
  usableEquipmentEffects(player, equipment, trigger, side = null) {
    const effects = this.cardEffects(equipment, trigger).filter((effect) => side === null || (side === "incoming") === answersIncomingAttack(effect));
    if (effects.some(isExhaustCost) && this.equipmentIsExhausted(player, equipment)) return [];
    return effects;
  }

  /** Resolve every equipped card's effects for a trigger and return the combat modifiers they added. */
  applyEquipmentTrigger(player, trigger, context = {}, { side = null, skip = [] } = {}) {
    const totals = Object.fromEntries(COMBAT_MODIFIER_KEYS.map((key) => [key, 0]));
    for (const equipment of [...player.equipment]) {
      const effects = this.usableEquipmentEffects(player, equipment, trigger, side).filter((effect) => !skip.includes(effectAction(effect)));
      if (!effects.length) continue;
      const before = this.telemetry.effectApplications;
      const result = this.applyCardEffects(player, equipment, trigger, { opponent: this.opponentOf(player), ...context, sourceCard: equipment, effectOverride: effects });
      for (const key of COMBAT_MODIFIER_KEYS) totals[key] += (result[key] ?? 0) - (context[key] ?? 0);
      if (result.flow) totals.flow = true;
      // "Destroy this after it has affected three Attacks": count each Attack an incoming effect touched.
      if (side === "incoming" && this.telemetry.effectApplications > before) equipment.affectedCount = (equipment.affectedCount ?? 0) + 1;
    }
    return totals;
  }

  /** Add the combat modifiers from `applyEquipmentTrigger` into a context. */
  addCombatModifiers(context, totals) {
    for (const key of COMBAT_MODIFIER_KEYS) if (totals[key]) context[key] = (context[key] ?? 0) + totals[key];
    if (totals.flow) context.flow = true;
    return context;
  }

  equipmentHasManualActivation(card) {
    return this.cardEffects(card, "passive").some((effect) => (effect.conditions ?? []).some((condition) => (typeof condition === "string" ? condition : condition.kind) === "manualActivation"));
  }

  activateEquipment(player, card) {
    if (!card || !player.equipment.includes(card) || this.equipmentIsExhausted(player, card) || !this.equipmentHasManualActivation(card)) return false;
    this.applyCardEffects(player, card, "passive", { opponent: this.opponentOf(player), sourceCard: card, manualActivation: true, attackCard: null });
    this.setEquipmentReady(player, card, false);
    return true;
  }

  unsupportedEffect(card, effect) { this.telemetry.unsupportedEffects += 1; this.emit({ type: "unsupported-effect", player: null, card: card.catalogId, effect: effect.id, action: effect.action ?? null }); }

  queueCardChoice(player, targetPlayer, effect, movement, amount = 1) {
    let effectiveAmount = amount;
    if (movement === "discard" && effect.forcedDiscardEvent === true) {
      const eventContext = { opponent: player, sourceCard: effect.sourceCardId ? this.cardByInstance(player.id, effect.sourceCardId) : null, forcedDiscardEvent: true };
      for (const equipment of targetPlayer.equipment) {
        const result = this.applyCardEffects(targetPlayer, equipment, "passive", { ...eventContext, sourceCard: equipment });
        effectiveAmount = Math.max(0, effectiveAmount - Number(result.forcedDiscardReduction ?? 0));
      }
      if (effectiveAmount === 0) return true;
    }
    const requestedZones = (effect.conditions ?? []).find((condition) => condition.kind === "zones")?.value;
    const sourceZones = Array.isArray(requestedZones) && requestedZones.length ? requestedZones : ["hand"];
    const requestedType = (effect.conditions ?? []).find((condition) => condition.kind === "cardType")?.value;
    const candidates = sourceZones.flatMap((zone) => targetPlayer[zone] ?? []).filter((candidate) => !this.isDeclaredAttackCard(candidate) && (!requestedType || [candidate.cardType, candidate.subtype, candidate.category].includes(requestedType)));
    const options = candidates.map((candidate) => ({ id: candidate.instanceId, label: candidate.name }));
    if (!options.length) return false;
    this.offerChoice({
      kind: "card-movement", playerId: player.id, targetPlayerId: targetPlayer.id, movement, amount: effectiveAmount,
      sourceZones, sourceCardId: effect.sourceCardId ?? null, effectId: effect.id ?? null,
      discardBranch: effect.discardBranch === true, branchDraw: num(effect.branchDraw ?? 0), branchFocus: num(effect.branchFocus ?? 0), branchDefense: num(effect.branchDefense ?? 0),
      drawIfSourceZone: (effect.conditions ?? []).find((condition) => condition.kind === "drawIfSourceZone")?.value ?? null,
      drawAmount: num((effect.conditions ?? []).find((condition) => condition.kind === "drawAmount")?.value ?? 0),
      options,
    });
    return true;
  }

  resolveCardMovementChoice(pending, selected) {
    const targetPlayer = this.players[pending.targetPlayerId];
    const sourceZone = pending.sourceZones.find((zone) => (targetPlayer[zone] ?? []).some((candidate) => candidate.instanceId === selected));
    const card = sourceZone ? targetPlayer[sourceZone].find((candidate) => candidate.instanceId === selected) : null;
    if (!card) return false;
    if (pending.movement === "discard") this.discardCard(targetPlayer, card);
    else if (pending.movement === "destroy") this.destroyCard(targetPlayer, card);
    else if (pending.movement === "bottom-deck") { this.removeFromPlayerZones(targetPlayer, card); targetPlayer.deck.unshift(card); }
    else return false;
    if (pending.drawIfSourceZone === sourceZone && pending.drawAmount > 0) this.draw(targetPlayer, pending.drawAmount);
    const remaining = Number(pending.amount ?? 1) - 1;
    this.pendingChoice = null;
    if (pending.then) return this.beginAttack(pending.playerId, this.cardByInstance(pending.playerId, pending.then.cardId), { ...pending.then, zoneCostPaid: true });
    if (remaining > 0 && this.queueCardChoice(this.players[pending.playerId], targetPlayer, pending, pending.movement, remaining)) return true;
    if (pending.discardBranch) {
      const player = this.players[pending.playerId];
      if (player.lastTurnWasHit && pending.branchDraw > 0) this.draw(player, pending.branchDraw);
      else {
        if (pending.branchFocus > 0) { player.focus += pending.branchFocus; player.turnStats.focusGenerated = (player.turnStats.focusGenerated ?? 0) + pending.branchFocus; this.telemetry.focusGenerated += pending.branchFocus; }
        if (pending.branchDefense > 0) this.addStatus(player, { action: "modifyDefense", amount: pending.branchDefense, duration: "nextHonor", sourceId: pending.sourceCardId });
      }
    }
    return true;
  }

  queueDiscardDrawChoice(player, effect) {
      const candidates = player.hand.filter((card) => !this.isDeclaredAttackCard(card) && (!effect.candidateType || [card.cardType, card.subtype, card.category].includes(effect.candidateType)));
      this.offerChoice({ kind: "cycle-discard-draw", playerId: player.id, drawAmount: num(effect.drawAmount ?? effect.amount ?? 1), postDrawDiscard: effect.postDrawDiscard === true, revealSelected: effect.revealSelected === true, sourceCardId: effect.sourceCardId ?? null, effectId: effect.id ?? null, options: [{ id: "skip", label: "Skip" }, ...candidates.map((card) => ({ id: card.instanceId, label: card.name }))] });
    return true;
  }

  queueIncomingAttackChoice(player, effect, context) {
    this.offerChoice({ kind: "incoming-attack-choice", playerId: player.id, targetPlayerId: context.opponent?.id ?? null, effectId: effect.id ?? null, options: [{ id: "accept", label: "Lose 1 Speed and reduce this Attack by 1" }, { id: "skip", label: "Keep Speed" }] });
    return true;
  }

  queueEquipmentToggleChoice(player, effect) {
    const options = player.equipment.map((card) => ({ id: card.instanceId, label: card.name }));
    if (!options.length) return false;
    this.offerChoice({ kind: "equipment-toggle", playerId: player.id, effectId: effect.id ?? null, options });
    return true;
  }

  queueDiscardOrDestroyChoice(player, effect, context) {
    const card = context.discardedCard;
    if (!card || !player.discard.includes(card)) return false;
    this.offerChoice({ kind: "discard-or-destroy", playerId: player.id, cardId: card.instanceId, effectId: effect.id ?? null, options: [{ id: "destroy", label: "Destroy the discarded Junk" }, { id: "keep", label: "Leave it in the discard pile" }] });
    return true;
  }

  queueDeckLookChoice(player, effect) {
    const lookCount = num((effect.conditions ?? []).find((condition) => condition.kind === "lookCount")?.value ?? (["consumable.topThreeAttackSelection", "consumable.reorderTopThree"].includes(effect.resolver) ? 3 : effect.resolver === "defense.deckLookChoice" ? 2 : 1));
    const eligible = (effect.conditions ?? []).find((condition) => condition.kind === "eligibleTypes")?.value ?? (effect.resolver === "consumable.topThreeAttackSelection" ? ["Attack"] : []);
    const looked = player.deck.slice(-Math.max(0, lookCount));
    const options = looked.filter((card) => !eligible.length || eligible.includes(card.cardType) || eligible.includes(card.subtype) || eligible.includes(card.category)).map((card) => ({ id: card.instanceId, label: card.name }));
    player.revealed.push(...looked); this.telemetry.cardsRevealed += looked.length;
    this.offerChoice({
      kind: "deck-look", playerId: player.id, lookedCardIds: looked.map((card) => card.instanceId),
      restAction: (effect.conditions ?? []).find((condition) => condition.kind === "restAction")?.value ?? (["consumable.topThreeAttackSelection", "defense.deckLookChoice"].includes(effect.resolver) ? "discard" : "reorder"),
      focusIfNoMatch: num((effect.conditions ?? []).find((condition) => condition.kind === "noMatchFocus")?.value ?? 0),
      focusIfDifferentTypes: num((effect.conditions ?? []).find((condition) => condition.kind === "differentCardTypesFocus")?.value ?? 0),
      discardFocusCardType: effect.resolver === "defense.deckLookChoice" ? "Junk" : null,
      options: [{ id: "skip", label: "Keep the revealed cards" }, ...options],
    });
    return true;
  }

  queueZoneChoice(player, effect, { zones: allowedZones = [], operation, destination = null } = {}) {
    const source = allowedZones.flatMap((zone) => player[zone] ?? []);
    const filtered = source.filter((card) => {
      const conditions = effect.conditions ?? [];
      const cardFamily = conditions.find((condition) => condition.kind === "cardFamily")?.value;
      const cardType = conditions.find((condition) => condition.kind === "cardType")?.value;
      const eligibleSubtypes = conditions.find((condition) => condition.kind === "eligibleSubtypes")?.value ?? [];
      const permanentOnly = conditions.some((condition) => condition.kind === "permanentOnly" && condition.value === true);
      if (cardFamily && ![card.cardType, card.subtype, card.category].includes(cardFamily)) return false;
      if (cardType && ![card.cardType, card.subtype, card.category].includes(cardType)) return false;
      if (eligibleSubtypes.length && !eligibleSubtypes.includes(card.subtype)) return false;
      if (permanentOnly && !["Weapon", "Gear", "Defense Equipment"].includes(card.subtype)) return false;
      // Only permanent Equipment can ever be Equipped, whatever the effect forgot to say.
      if (operation === "equip-from-discard" && !["Weapon", "Gear", "Defense Equipment"].includes(card.subtype)) return false;
      return true;
    });
    const equips = operation === "equip-from-hand" || operation === "equip-from-discard";
    const options = equips ? filtered.flatMap((card) => this.equipChoiceOptions(player, card)) : filtered.map((card) => ({ id: card.instanceId, label: card.name }));
    if (!options.length) return false;
    this.offerChoice({
      kind: "zone-choice", playerId: player.id, sourceZones: allowedZones, operation,
      destination, sourceCardId: effect.sourceCardId ?? null, effectId: effect.id ?? null,
      gearBonus: (effect.conditions ?? []).find((condition) => condition.kind === "gearBonus")?.value ?? null,
      gearEntersReady: (effect.conditions ?? []).some((condition) => condition.kind === "gearEntersReady" && condition.value === true),
      gearNextAttackPower: num((effect.conditions ?? []).find((condition) => condition.kind === "gearNextAttackPower")?.value ?? 0),
      additionalFocusGenerated: num((effect.conditions ?? []).find((condition) => condition.kind === "additionalFocusGenerated")?.value ?? 0),
      options,
    });
    return true;
  }

  /** Equip-choice options for one card; a Weapon that needs a replacement gets one option per Weapon set. */
  equipChoiceOptions(player, card) {
    return this.equipReplacementOptions(player, card).map((replaceCardIds) => replaceCardIds.length
      ? { id: `${card.instanceId}>${replaceCardIds.join("+")}`, label: `${card.name} (replaces ${replaceCardIds.map((id) => player.equipment.find((equipped) => equipped.instanceId === id)?.name).join(" and ")})`, cardId: card.instanceId, replaceCardIds }
      : { id: card.instanceId, label: card.name });
  }

  resolveZoneChoice(pending, selected) {
    const player = this.players[pending.playerId];
    const option = pending.options.find((candidate) => candidate.id === selected);
    const card = pending.sourceZones.flatMap((zone) => player[zone] ?? []).find((candidate) => candidate.instanceId === (option?.cardId ?? selected));
    if (!card) return false;
    if (pending.operation === "equip-from-hand" || pending.operation === "equip-from-discard") {
      const replaced = this.equipReplacement(player, card, option?.replaceCardIds ?? []);
      if (!replaced) return false;
      this.discardReplacedEquipment(player, replaced, card);
    }
    if (pending.operation === "recover-then-discard") {
      this.moveCard(player, card, "hand");
      this.pendingChoice = null;
      const discardEffect = { id: `${pending.effectId ?? "recover"}:discard`, sourceCardId: pending.sourceCardId };
      return this.queueCardChoice(player, player, discardEffect, "discard", 1);
    }
    if (pending.operation === "recycle") {
      this.moveCard(player, card, "deck");
      remove(player.deck, card); player.deck.unshift(card);
      if (pending.gearBonus === "readyOneEquipment") {
        const target = player.equipment.find((candidate) => this.equipmentIsExhausted(player, candidate));
        if (target) this.setEquipmentReady(player, target, true);
      }
      this.pendingChoice = null;
      return true;
    }
    if (pending.operation === "equip-from-hand") {
      remove(player.hand, card); player.played.push(card); player.equipment.push(card); player.turnStats.equippedThisTurn = true;
      if (pending.gearEntersReady && card.subtype === "Gear") this.setEquipmentReady(player, card, true);
      if (pending.gearNextAttackPower && card.subtype === "Gear") player.nextAttackPower += pending.gearNextAttackPower;
      if (pending.additionalFocusGenerated) { player.focus += pending.additionalFocusGenerated; player.turnStats.focusGenerated += pending.additionalFocusGenerated; this.telemetry.focusGenerated += pending.additionalFocusGenerated; }
      this.pendingChoice = null;
      this.characterEvent(player, "equip", { card, fromHand: true });
      return true;
    }
    if (pending.operation === "equip-from-discard") {
      remove(player.discard, card); player.played.push(card); player.equipment.push(card); card.temporaryUntilHide = true; player.turnStats.equippedThisTurn = true;
      this.pendingChoice = null;
      return true;
    }
    return false;
  }

  queueHitChoice(player, effect, opponent) {
    const kind = (effect.conditions ?? []).find((condition) => condition.kind === "choiceKind")?.value;
    const options = kind === "courtesy-notice"
      ? [{ id: "item-cost-penalty", label: "Next Item costs +1 Focus" }, { id: "defense-guard-penalty", label: "Next Defense gets -1 Guard" }]
      : kind === "discount-dim-mak"
        ? [{ id: "tempo-loss", label: "Lose Tempo" }, { id: "gain-focus", label: "Gain 1 Focus" }]
        : [{ id: "gain-focus", label: "Gain 1 Focus" }, { id: "cycle", label: "Draw 1, then discard 1" }];
    this.offerChoice({ kind: "hit-choice", playerId: player.id, targetPlayerId: opponent.id, effectId: effect.id ?? null, choiceKind: kind, options });
    return true;
  }

  structuredParams(effect) {
    return Object.fromEntries((effect.conditions ?? []).map((condition) => [String(condition.kind ?? ""), condition.value]));
  }

  applyStructuredEffect(player, card, effect, context) {
    const resolver = String(effect.resolver ?? "");
    const params = this.structuredParams(effect);
    const opponent = context.opponent ?? this.opponentOf(player);
    const amount = num(effect.amount);
    const target = effect.target === "opponent" ? opponent : player;
    const add = (action, value, duration = effect.duration ?? "immediate", subject = target) => {
      if (duration && duration !== "immediate" && duration !== "whileEquipped") this.addStatus(subject, { action, amount: value, duration, sourceId: card.instanceId });
      else {
        const key = action === "modifyAttackPower" ? "attackPowerModifier" : action === "modifyGuard" ? "guardModifier" : action === "modifyDefense" ? "defenseModifier" : action === "preventDamage" ? "damagePrevention" : `${action}Modifier`;
        context[key] = (context[key] ?? 0) + value;
      }
    };

    // Final attack semantics are shared by card, AI, and simulator. Passive
    // attack effects are evaluated in resolveAttack before defense commits.
    if (resolver === "attack.final.defensiveReaction") {
      if ((params.incomingZones ?? []).includes(context.zone)) context.reactionDefense = (context.reactionDefense ?? 0) + amount;
      return true;
    }
    if (resolver === "attack.final.comboMultiplicity") {
      context.comboMultiplicity = Math.max(context.comboMultiplicity ?? 1, amount || 1);
      return true;
    }
    if (resolver === "attack.final.fireDrillFeint") {
      if (player.hand.length) this.queueCardChoice(player, player, { ...effect, sourceCardId: card.instanceId }, "discard", Math.max(1, num(params.discardCost ?? 1)));
      return true;
    }
    if (resolver === "attack.final.cycle") {
      if (context.nonHonorSceneChangedThisRound) {
        if (effect.action === "draw") this.draw(player, amount);
        if (effect.action === "discard") this.queueCardChoice(player, player, effect, "discard", amount);
      }
      return true;
    }
    if (resolver === "attack.currentAttackFlow") { context.flow = true; return true; }
    if (resolver === "attack.nextAttackArmorPenalty") { this.addStatus(opponent, { action: "modifyDefense", amount, duration: "nextAttack", sourceId: card.instanceId }); return true; }
    if (resolver === "character.marketDiscountFloor") { if (cost(context.purchasedCard ?? context.marketCard ?? {}) >= 5 || Number(context.purchaseCost ?? 0) >= 5) context.costModifier = (context.costModifier ?? 0) + amount; return true; }
    if (resolver === "consumable.nextIncomingAttackDefense") { this.addStatus(player, { action: "modifyDefense", amount, duration: "nextIncomingAttack", sourceId: card.instanceId }); return true; }
    if (resolver === "consumable.revealTopFocusValue") {
      if (effect.action === "custom" || effect.effect === "core.reveal") {
        const revealed = this.reveal(player, amount || 1); context.revealedFocusValue = focus(revealed[revealed.length - 1]);
      }
      return true;
    }
    if (resolver === "consumable.ascendPurchaseDiscount") { this.addStatus(player, { action: "modifyCost", amount, duration: "nextPurchase", sourceId: card.instanceId }); return true; }
    if (resolver === "defense.nextPurchaseDiscount") { this.addStatus(player, { action: "modifyCost", amount, duration: "nextPurchase", floor: num(params.minimumFinalCost ?? 1), sourceId: card.instanceId }); return true; }
    // "Gain 1 purchase discount for your next turn": active during that turn, then gone.
    if (resolver === "defense.nextTurnPurchaseDiscount") { this.addStatus(player, { action: "modifyCost", amount, duration: "duringNextTurn", then: "nextPurchase", expires: "endOfTurn", sourceId: card.instanceId }); return true; }
    if (resolver === "defense.armorDefenseBonus") { const matchingArmor = player.equipment.some((candidate) => candidate.subtype === "Defense Equipment" && (candidate.tags ?? []).some((tag) => (context.attackCard?.tags ?? []).includes(tag))); if (matchingArmor) context.defenseModifier = (context.defenseModifier ?? 0) + amount; return true; }
    if (resolver === "kata.choice") {
      if (player.lastTurnWasHit) {
        const options = (params.choiceOptions ?? []).map((option) => ({ id: String(option), label: String(option) }));
        this.offerChoice({ kind: "structured", playerId: player.id, effectId: effect.id ?? null, resolver, options: options.length ? options : [{ id: "nextAttackPower:+1", label: "Next Attack +1" }, { id: "nextDefenseGuard:+1", label: "Next Defense +1" }] });
      }
      return true;
    }
    if (resolver === "kata.controlledEscalation") { this.addStatus(player, { action: "controlledEscalation", amount: Number(params.matchingZonePowerBonus ?? 1), duration: "endOfTurn", sourceId: card.instanceId }); return true; }
    if (resolver === "kata.discardBranch") {
      if (player.hand.length) this.queueCardChoice(player, player, { ...effect, discardBranch: true, branchDraw: 2, branchFocus: 1, branchDefense: 1, sourceCardId: card.instanceId }, "discard", 1);
      return true;
    }
    if (resolver === "kata.zoneAttackReward") { this.addStatus(player, { action: "zoneAttackReward", amount: Number(params.afterResolveFocus ?? 1), duration: "endOfTurn", sourceId: card.instanceId }); return true; }
    if (resolver === "kata.copyKata") {
      const source = [...opponent.played].reverse().find((candidate) => candidate.subtype === "Kata");
      const copied = source ? this.cardEffects(source, "onPlay").filter((candidate) => candidate.resolver !== "kata.copyKata") : [];
      if (copied.length) this.applyCardEffects(player, card, "onPlay", { ...context, sourceCard: card, effectOverride: copied });
      return true;
    }
    if (resolver === "kata.comboHitReward") {
      if (Number(context.damage ?? 0) >= Number(params.minimumDamage ?? 0)) { player.focus += Number(params.gainFocus ?? 1); player.turnStats.focusGenerated = (player.turnStats.focusGenerated ?? 0) + Number(params.gainFocus ?? 1); this.telemetry.focusGenerated += Number(params.gainFocus ?? 1); }
      return true;
    }
    if (resolver === "kata.threeZonePlan") { this.addStatus(player, { action: "threeZonePlan", amount: Number(params.completionFocus ?? 1), duration: "endOfTurn", sourceId: card.instanceId, zones: [] }); return true; }
    if (resolver === "reaction.preserveMarketDiscount") { this.addStatus(player, { action: "preserveMarketDiscount", duration: "nextPurchase", sourceId: card.instanceId }); return true; }
    if (resolver === "reaction.cancelComboPayoff") { this.addStatus(opponent, { action: "cancelComboPayoff", duration: "turn", sourceId: card.instanceId }); return true; }

    if (resolver === "equipment.structured") {
      if (effect.action !== "custom") return false;
      if (effect.effect === "equipment.modifyDefenseContribution" || effect.effect === "combat.modifyDefense") { add("modifyDefense", amount); return true; }
      if (effect.effect === "combat.modifyAttackPower") { add("modifyAttackPower", amount); return true; }
      if (effect.effect === "combat.grantFlow") { player.nextAttackFlow = true; return true; }
      if (effect.effect === "core.gainXP") { this.gainXp(player, amount, "effect"); return true; }
      if (effect.effect === "core.reveal") { this.reveal(effect.target === "opponent" ? opponent : player, amount || 1); return true; }
      if (effect.effect === "economy.spendFocus") { const subject = effect.target === "opponent" ? opponent : player; subject.focus = Math.max(0, subject.focus - Math.max(0, amount)); return true; }
      if (effect.effect === "economy.modifyCost") { this.addStatus(effect.target === "opponent" ? opponent : player, { action: "modifyCost", amount, duration: "nextPurchase", floor: num(params.minimumFinalCost ?? 0), cardType: params.nextItemOnly ? "Item" : null, sourceId: card.instanceId }); return true; }
      if (effect.effect === "core.moveCard") { this.queueCardChoice(player, effect.target === "opponent" ? opponent : player, { ...effect, sourceCardId: card.instanceId }, "bottom-deck", 1); return true; }
      if (params.incomingZones !== undefined) { if (!context.zone || (Array.isArray(params.incomingZones) && params.incomingZones.includes(context.zone))) add("modifyDefense", amount); return true; }
      if (params.equipmentRestriction) { this.addStatus(player, { action: "equipmentRestriction", value: String(params.equipmentRestriction), duration: effect.duration ?? "whileEquipped", sourceId: card.instanceId }); return true; }
      if (params.choiceKind) return this.offerStructuredChoice(player, card, effect, params, context);
      if (params.firstSwapThisGame) { this.addStatus(player, { action: "firstSwapDiscard", amount: Math.max(1, amount || 1), duration: "game", sourceId: card.instanceId }); return true; }
      if (params.discardedPrintedFocusValue !== undefined) { const printed = Number(context.discardedPrintedFocusValue ?? context.player.turnStats.discardedFocusValue ?? 0); if (printed === 0) { player.focus += amount || 1; player.turnStats.focusGenerated = (player.turnStats.focusGenerated ?? 0) + (amount || 1); this.telemetry.focusGenerated += amount || 1; } return true; }
      if (params.sourceAffectedCountThreshold !== undefined) {
        const count = Number(card.affectedCount ?? context.sourceAffectedCount ?? 0);
        if (count >= Number(params.sourceAffectedCountThreshold)) this.destroyCard(player, card);
        return true;
      }
      if (params.selfIsLowestXp) { if (player.xp <= opponent.xp) add("modifyDefense", amount || 1); return true; }
      if (params.forcedDiscardEvent) {
        if (context.forcedDiscardEvent) context.forcedDiscardReduction = (context.forcedDiscardReduction ?? 0) + Math.max(0, amount || 1);
        return true;
      }
      if (params.oncePerGame && effect.trigger === "passive" && !context.attackCard) {
        this.addStatus(player, { action: "preventDamage", amount: 99, duration: "nextAttack", sourceId: card.instanceId });
        this.markUsedEffect(player, effect);
        return true;
      }
      // "Once per game, when you are targeted by an Attack, destroy this. That Attack deals 0 damage to you."
      if (params.oncePerGame && effect.trigger === "onAttackDeclared" && effect.target === "self") { context.damagePrevention = (context.damagePrevention ?? 0) + ALL_DAMAGE; this.destroyCard(player, card); this.markUsedEffect(player, effect); return true; }
      if (params.oncePerGame && resolver === "equipment.structured" && effect.trigger === "passive" && context.attackCard) { add("preventDamage", 99, "nextAttack"); this.markUsedEffect(player, effect); return true; }
      if (effect.trigger === "onHit" && params.attackUsesSourceEquipment) {
        if (effect.target === "opponent" && params.scheduledTiming === "endOfTargetNextTurn") this.addStatus(target, { action: "delayedDamage", amount, duration: "endOfTargetNextTurn", sourcePlayerId: player.id, sourceId: card.instanceId });
        else if (effect.target === "opponent" && params.scheduledTiming === "nextRound") add("modifySpeed", amount, "nextRound");
        else if (effect.target === "opponent" && params.scheduledTiming === "nextInitiate") add("modifyDefense", amount);
        else if (effect.target === "opponent" && amount) target.tempSpeed += amount;
        else if (effect.target === "self" && amount) add("modifyDefense", amount, params.scheduledTiming === "nextInitiate" ? "nextTurn" : effect.duration);
        return true;
      }
      if (effect.trigger === "onHide" && params.minimumDraw !== undefined) { this.draw(player, Math.max(0, Number(params.minimumDraw))); return true; }
      if (effect.trigger === "onBlock" && params.firstArmorBlockThisRound) { player.turnStats.completedBeltExamThisRound = true; return true; }
      if (params.discardedByEffect) { this.moveCard(player, card, "hand"); return true; }
      if (effect.trigger === "passive" && effect.duration === "whileEquipped" && !context.attackCard) { this.addStatus(player, { action: "equipmentRestriction", value: card.catalogId, duration: "whileEquipped", sourceId: card.instanceId }); return true; }
      if (params.firstNegativeCombatModifierThisRound) { this.removeTemporaryNegativeStatModifier(player, 1); return true; }
      if (params.attackHasTag) { context.attackIsUnarmed = (context.attackCard?.tags ?? []).includes(String(params.attackHasTag)); return true; }
      if (params.reactionPlayedAgainstSelf) {
        if (context.reactionPlayedAgainstSelf && params.scheduledTiming === "exchangeEnd") context.defenseModifier = (context.defenseModifier ?? 0) + amount;
        return true;
      }
      if (params.nextQualifyingAttackOnly) { add("modifyAttackPower", amount); return true; }
      // A structured Equipment effect is supported only when one of the
      // explicit semantic branches above consumed its parameters.  Never
      // convert an unknown Equipment operation into a generic attack bonus.
      return false;
    }

    if (resolver.startsWith("location.")) {
      const operation = params.locationOperation;
      if (operation === "modifyPurchaseCost") this.addStatus(player, { action: "modifyCost", amount, duration: "nextPurchase", sourceId: card.instanceId });
      else if (operation === "modifyHealing") this.addStatus(player, { action: "modifyHealing", amount, duration: "scene", sourceId: card.instanceId });
      else if (operation === "modifyXpGain" || operation === "modifyKoXp") this.addStatus(player, { action: operation, amount, duration: "round", sourceId: card.instanceId });
      else if (operation === "modifyStandingAttack" || operation === "modifyWeaponAttackBonus") add("modifyAttackPower", amount);
      else if (operation === "modifyStandingDefense" || operation === "modifyWeaponArmorPrintedBonus" || operation === "modifyReadiedEquipmentPrintedBonus" || operation === "modifyDefensiveEquipmentContribution") add("modifyDefense", amount);
      else if (operation === "modifyComboPrintedNumericEffect") context.comboNumericModifier = (context.comboNumericModifier ?? 0) + amount;
      else if (operation === "increaseDamageReduction") this.addStatus(player, { action: "preventDamage", amount, duration: "round", sourceId: card.instanceId });
      else if (operation === "setKataFocusGeneration") this.addStatus(player, { action: "kataFocusBonus", amount: Number(params.fixedValue ?? amount), duration: "turn", sourceId: card.instanceId });
      else if (operation === "keepUnboughtMarketCards") this.addStatus(player, { action: "keepUnboughtMarketCards", duration: "round", sourceId: card.instanceId });
      else if (operation === "drawThenDiscard" || operation === "discardJunkDrawGainFocus") this.queueDiscardDrawChoice(player, { ...effect, drawAmount: Number(params.drawCount ?? 1) });
      else if (operation === "loseFocusIfAble") target.focus = Math.max(0, target.focus - Math.max(0, amount || 1));
      else if (operation === "destroyJunkGainFocusLoseHp") { const junk = player.hand.find((candidate) => candidate.subtype === "Junk" || candidate.category === "Junk"); if (junk) { this.destroyCard(player, junk); player.focus += Number(params.focusGain ?? 1); player.hp = Math.max(1, player.hp - Number(params.hpLoss ?? 1)); } }
      else if (operation === "readyEquipmentOrSpeedChoice") { const ready = player.equipment.find((candidate) => this.equipmentIsExhausted(player, candidate)); if (ready) this.setEquipmentReady(player, ready, true); else player.tempSpeed += amount || 1; }
      else if (operation === "discardForReadyOrDefenseChoice") { const candidate = player.hand[0]; if (candidate) { this.discardCard(player, candidate); const ready = player.equipment.find((entry) => this.equipmentIsExhausted(player, entry)); if (ready) this.setEquipmentReady(player, ready, true); else add("modifyDefense", amount || 1, "nextHonor"); } }
      else if (operation === "beltExamSpeedOrCycleChoice") player.tempSpeed += amount || 1;
      else if (operation === "nextCounterAttackChosenZone") player.nextAttackAnyZone = true;
      else if (operation === "stateActiveBeltExam") player.turnStats.completedBeltExamThisRound = true;
      else if (effect.action === "gainFocus") { player.focus += amount; player.turnStats.focusGenerated = (player.turnStats.focusGenerated ?? 0) + amount; this.telemetry.focusGenerated += amount; }
      else if (effect.action === "modifyAttackPower") add("modifyAttackPower", amount);
      else if (effect.action === "modifyGuard") add("modifyGuard", amount);
      else if (effect.action === "dealDamage") { target.hp = Math.max(0, target.hp - Math.max(0, amount)); if (target !== player && amount > 0) target.lastDamagedBy = player.id; }
      else return false;
      return true;
    }

    if (resolver === "character.noWeaponOffenseDefenseChoice") {
      if (!player.equipment.some((entry) => entry.subtype === "Weapon")) this.offerChoice({ kind: "structured", playerId: player.id, effectId: effect.id ?? null, resolver, options: [{ id: "attack", label: "Next Attack +1" }, { id: "defense", label: "Next Defense +1 Guard" }] });
      return true;
    }
    if (resolver === "character.ignoreTemporaryAttackBonusesOnceGame") { context.opponentAttackPowerModifier = (context.opponentAttackPowerModifier ?? 0) - Math.max(0, context.attackPowerModifier ?? 0); return true; }
    if (resolver === "character.reduceLargeAttackModifier") { if (Math.abs(context.opponentAttackPowerModifier ?? 0) >= 2) context.opponentAttackPowerModifier -= amount || 1; return true; }
    if (resolver === "character.discardToChangeDeclaredZone") { this.offerChoice({ kind: "structured", playerId: player.id, effectId: effect.id ?? null, resolver, options: zones.map((zone) => ({ id: zone, label: zone })) }); return true; }
    if (resolver === "character.revealReplacementOnceGame") { this.addStatus(player, { action: "revealReplacement", duration: "game", sourceId: card.instanceId }); this.offerChoice({ kind: "structured", playerId: player.id, effectId: effect.id ?? null, resolver, options: [{ id: "accept", label: "Replace the revealed card" }, { id: "skip", label: "Keep the revealed card" }] }); return true; }
    if (resolver === "character.comboRevealChoice") { const options = [...(this.comboDeck ?? [])].reverse().filter((candidate) => candidate.cardType === "Combo" || candidate.subtype === "Learned Combo").slice(0, 2).map((candidate) => ({ id: candidate.catalogId, label: candidate.name })); this.offerChoice({ kind: "structured", playerId: player.id, effectId: effect.id ?? null, resolver, options: options.length ? options : [{ id: "skip", label: "Skip" }] }); return true; }
    if (resolver === "character.junkDiscardToBottomCycle") { if (context.discardedCard) { this.moveCard(player, context.discardedCard, "deck"); player.deck.unshift(context.discardedCard); this.draw(player, 1); } return true; }
    if (resolver === "character.green.repeatModifiedCardTypeBonus") { if (context.modifiedCardType) add(context.modifiedCardType === "Defense" ? "modifyGuard" : "modifyAttackPower", amount || 1, "nextAttack"); return true; }

    if (resolver === "consumable.cancelReaction") { this.addStatus(opponent, { action: "restrictReaction", duration: "nextAttack", sourceId: card.instanceId }); return true; }
    if (resolver === "consumable.raffleTicket") { player.focus += 1; this.telemetry.focusGenerated += 1; return true; }
    if (resolver === "consumable.replaceDisarmWithSelfDestroy") { this.addStatus(player, { action: "preventDisarm", duration: "endOfTurn", sourceId: card.instanceId }); return true; }
    if (resolver === "consumable.replaceRevealedMarketOrLocation") { this.draw(player, 1); return true; }
    if (resolver === "consumable.suppressChosenWeaponClause") { this.addStatus(player, { action: "suppressWeaponClause", duration: "endOfTurn", sourceId: card.instanceId }); return true; }
    if (resolver === "consumable.blockedAttackBacklash") { if (player.turnStats.previousAttackBlocked) player.hp = Math.max(1, player.hp - 1); return true; }

    if (resolver === "defense.playRestriction") { this.addStatus(player, { action: "restrictAttack", duration: "endOfRound", sourceId: card.instanceId }); return true; }
    if (resolver === "defense.beltExam") { player.turnStats.completedBeltExamThisRound = true; this.gainXp(player, 1, "belt-exam"); return true; }
    if (resolver === "defense.forceNextAttackZone") { this.offerChoice({ kind: "structured", playerId: player.id, targetPlayerId: opponent.id, effectId: effect.id ?? null, resolver, options: zones.map((zone) => ({ id: zone, label: zone })) }); return true; }
    if (resolver === "defense.blockChoice") { this.offerChoice({ kind: "structured", playerId: player.id, effectId: effect.id ?? null, resolver, options: [{ id: "counter", label: "Prepare a counterattack" }, { id: "discount", label: "Discount your next purchase" }] }); return true; }
    // "You cannot be targeted by a Reversal until the start of your next turn."
    if (resolver === "defense.reversalTargetProtection") { this.addStatus(player, { action: "reversalProtection", duration: "startOfTurn", sourceId: card.instanceId }); return true; }

    if (resolver.startsWith("kata.")) {
      if (resolver === "kata.flowGrant") { player.nextAttackFlow = true; return true; }
      if (resolver === "kata.attackModifier") { player.nextAttackPower += Number(params.attackPowerBonus ?? amount ?? 0); this.changeSpeed(player, Number(params.attackSpeedBonus ?? 0)); return true; }
      if (resolver === "kata.attackRestriction") { this.addStatus(player, { action: "restrictAttackCount", amount: Number(params.maxAttacksAfterSource ?? 1), duration: params.duration ?? "endOfTurn", sourceId: card.instanceId }); return true; }
      if (resolver === "kata.branch" || resolver === "kata.deferredEvent") {
        if (resolver === "kata.deferredEvent" && params.attackIsReversal) { if (context.isReversal && context.damage > 0) this.queueDiscardDrawChoice(player, { ...effect, drawAmount: Number(params.draw ?? 1), postDrawDiscard: true }); }
        else if (effect.action === "draw") this.draw(player, amount || 1);
        else if (effect.action === "gainFocus") { player.focus += amount || 1; this.telemetry.focusGenerated += amount || 1; }
        else player.nextAttackFlow = true;
        return true;
      }
      if (resolver === "kata.variableCycle") { this.queueDiscardDrawChoice(player, { ...effect, drawAmount: Number(params.discardUpTo ?? 1) }); return true; }
      if (resolver === "kata.deckLook" || resolver === "kata.revealUntil") { this.queueDeckLookChoice(player, { ...effect, conditions: [...(effect.conditions ?? []), { kind: "lookCount", value: Number(params.lookCount ?? 3) }] }); return true; }
      if (resolver === "kata.equipmentChoice" || resolver === "kata.equipmentActivation") { this.queueEquipmentToggleChoice(player, effect); return true; }
      if (resolver === "kata.markCard") { this.addStatus(player, { action: "markedCard", value: params.cardType ?? "Technique", amount: Number(params.nextPlayOfChosenCardFocus ?? 1), duration: "endOfTurn", sourceId: card.instanceId }); return true; }
      if (resolver === "kata.purchaseDiscount") { this.addStatus(player, { action: "modifyCost", amount: -Math.abs(Number(params.discount ?? 1)), duration: "nextPurchase", expires: "endOfTurn", floor: num(params.minimumCost ?? 0), minimumPrintedCost: num(params.minimumPrintedCost ?? 0), cardType: params.cardType ?? null, novelCardType: params.firstNovelPurchasedCardType === true, sourceId: card.instanceId }); return true; }
      // "The next Combo you learn this turn costs X less" (not a Market discount).
      if (resolver === "kata.comboDiscount") { this.addStatus(player, { action: "comboLearnCost", amount: -Math.abs(Number(params.discount ?? 1)), duration: "endOfTurn", sourceId: card.instanceId }); return true; }
      if (resolver === "kata.recoverThenDiscard") { this.queueZoneChoice(player, effect, { zones: ["discard"], operation: "recover-then-discard" }); return true; }
      if (resolver === "kata.recycle") { this.queueZoneChoice(player, effect, { zones: ["discard"], operation: "recycle" }); return true; }
      if (resolver === "kata.equipFromHand") { this.queueZoneChoice(player, effect, { zones: ["hand"], operation: "equip-from-hand" }); return true; }
      if (resolver === "kata.weaponModifier") { this.addStatus(player, { action: "modifyAttackPower", amount: Number(params.attackBonusDelta ?? 1), duration: "nextAttack", sourceId: card.instanceId }); return true; }
      if (resolver === "kata.damagePrevention") { this.addStatus(player, { action: "preventDamage", amount: amount || 1, duration: "nextAttack", sourceId: card.instanceId }); return true; }
      return false;
    }

    if (resolver.startsWith("reaction.")) {
      if (resolver === "reaction.preventIncomingDamage") { context.damagePrevention = (context.damagePrevention ?? 0) + amount; return true; }
      if (resolver === "reaction.reduceDeclaredAttackPower" || resolver === "reaction.secondNormalAttackPenaltyAndInitiateDraw") { context.opponentAttackPowerModifier = (context.opponentAttackPowerModifier ?? 0) + amount; return true; }
      if (resolver === "reaction.defenseAgainstIncomingAttack") { context.defenseModifier = (context.defenseModifier ?? 0) + amount; return true; }
      if (resolver === "reaction.forceAttackerDrawDiscardBeforeDefense") { this.draw(opponent, 1); this.queueCardChoice(opponent, opponent, { ...effect, forcedDiscardEvent: true }, "discard", 1); return true; }
      if (resolver === "reaction.defenseBeltExamCredit") { this.gainXp(player, 1, "reaction-belt-exam"); return true; }
      if (resolver === "reaction.preventForcedDiscard") { this.addStatus(player, { action: "preventForcedDiscard", duration: "round", sourceId: card.instanceId }); return true; }
      if (resolver === "reaction.outOfTurnConsumableShield") { this.addStatus(player, { action: "preventDamage", amount: 1, duration: "nextAttack", sourceId: card.instanceId }); return true; }
      return false;
    }
    // "That opponent gets -X Speed next round" (Combo aftermath).
    if (resolver === "combo.nextRoundSpeed") { this.addStatus(opponent, { action: "modifySpeed", amount, duration: "nextRound", sourceId: card.instanceId }); return true; }
    // "The target's next Reaction card this round gets -2 Guard or -2 Attack Power": recorded on the target.
    if (resolver === "combo.nextReactionPenalty") { this.addStatus(opponent, { action: "reactionPenalty", stat: effect.effect, amount, duration: "endOfRound", sourceId: card.instanceId }); return true; }
    if (resolver.startsWith("combo.")) { if (resolver === "combo.grantFlow") player.nextAttackFlow = true; else if (resolver === "combo.gainXP") this.gainXp(player, amount, "combo"); else if (resolver === "combo.equipmentDefenseSuppression") add("modifyDefense", amount, "nextAttack", opponent); else if (resolver === "combo.discardWeaponChoice") { const weapon = player.equipment.find((entry) => entry.subtype === "Weapon"); if (weapon) this.discardCard(player, weapon); } else return false; return true; }
    if (resolver.startsWith("boss.")) {
      if (resolver.includes("hitTempoLock")) { opponent.tempo = false; this.addStatus(opponent, { action: "tempoLocked", duration: effect.duration ?? "endOfRound", sourceId: card.instanceId }); }
      else if (resolver.includes("startTurnDiscard")) this.queueCardChoice(opponent, opponent, { ...effect, forcedDiscardEvent: true }, "discard", 1);
      else if (resolver.includes("reveal")) this.reveal(player, amount || 1);
      else if (resolver === "boss.profile.kataDefense" || resolver === "boss.profile.blockDefense" || resolver === "boss.technique.nextDefense") this.addStatus(player, { action: "modifyDefense", amount, duration: effect.duration ?? "nextHonor", sourceId: card.instanceId });
      else if (resolver === "boss.stage.enrage") this.addStatus(player, { action: "bossEnrage", amount: 1, duration: "game", sourceId: card.instanceId });
      else if (resolver === "boss.stage.stats") this.addStatus(player, { action: "bossStageStats", amount: 1, duration: "game", sourceId: card.instanceId });
      else return false;
      return true;
    }
    return false;
  }

  resolveHitChoice(pending, selected) {
    const player = this.players[pending.playerId]; const target = this.players[pending.targetPlayerId];
    if (selected === "item-cost-penalty") this.addStatus(target, { action: "nextItemCostPenalty", amount: 1, duration: "endOfRound", sourceId: pending.effectId });
    else if (selected === "defense-guard-penalty") { this.addStatus(target, { action: "modifyGuard", amount: -1, duration: "nextDefense", sourceId: pending.effectId }); this.characterEvent(target, "cardModified", { modifiedCardType: "Defense" }); }
    else if (selected === "tempo-loss") target.tempo = false;
    else if (selected === "gain-focus") { player.focus += 1; player.turnStats.focusGenerated += 1; this.telemetry.focusGenerated += 1; }
    else if (selected === "cycle") { this.pendingChoice = null; return this.queueDiscardDrawChoice(player, { drawAmount: 1, sourceCardId: pending.effectId }); }
    else return false;
    this.pendingChoice = null;
    return true;
  }

  reveal(player, amount = 1) {
    const revealed = player.deck.slice(-Math.max(0, amount));
    player.revealed.push(...revealed);
    this.telemetry.cardsRevealed += revealed.length;
    for (const card of revealed) this.emit({ type: "card-revealed", player: player.id, card: card.catalogId });
    return revealed;
  }

  applyCardEffects(player, card, trigger, context = {}) {
    const effectContext = { player, opponent: context.opponent ?? this.opponentOf(player), sourceCard: card, ...context };
    for (const effect of context.effectOverride ?? this.cardEffects(card, trigger)) {
      const conditions = this.evaluateConditions(effect, effectContext);
      if (!conditions.known) { this.unsupportedEffect(card, effect); continue; }
      if (!conditions.pass) continue;
      const unsupportedBefore = this.telemetry.unsupportedEffects;
      const amount = num(effect.amount); const rawAction = effect.action ?? effect.effect; const semanticAction = rawAction === "custom" ? effect.effect : rawAction;
      let action = ({ "equipment.modifyDefenseContribution": "modifyDefenseContribution", "combat.modifyDefense": "modifyDefense", "combat.grantFlow": "grantFlow", "core.gainXP": "gainXP", "core.reveal": "reveal", "economy.modifyCost": "modifyCost", "economy.spendFocus": "spendFocus", "core.moveCard": "moveCard" })[semanticAction] ?? HEADLESS_RESOLVER_ACTIONS[effect.resolver] ?? semanticAction;
      if ((rawAction === "custom" || [undefined, "custom", "core.custom", "core.choice"].includes(action)) && HEADLESS_STRUCTURED_RESOLVERS.has(String(effect.resolver ?? ""))) action = "structured";
      if (effect.resolver === "attack.final.hitChoice") action = "hitChoice";
      if (REVERSAL_BONUS_RESOLVERS[effect.resolver]) action = "reversalBonus";
      if (TARGETED_COMBO_RESOLVERS.has(effect.resolver)) action = "structured";
      if (action === "gainFocus") { const gained = effect.resolver === "consumable.revealTopFocusValue" ? Math.max(1, Number(effectContext.revealedFocusValue ?? amount)) : amount; player.focus += gained; player.turnStats.focusGenerated = (player.turnStats.focusGenerated ?? 0) + gained; this.telemetry.focusGenerated += gained; }
      else if (action === "draw") this.draw(player, Math.max(0, amount));
      else if (action === "reversalBonus") this.armReversalBonus(player, effectContext.opponent, effect, card);
      else if (action === "reveal") this.reveal(effect.target === "opponent" ? effectContext.opponent : player, Math.max(1, amount));
      else if (action === "moveCard") {
        const targetPlayer = effect.target === "opponent" ? effectContext.opponent : player;
        if (!this.queueCardChoice(player, targetPlayer, { ...effect, sourceCardId: effectContext.sourceCard?.instanceId }, "discard", Math.max(1, amount))) this.markUsedEffect(player, effect);
      }
      else if (action === "structured") { if (!this.applyStructuredEffect(player, card, effect, effectContext)) this.unsupportedEffect(card, effect); }
      else if (action === "gainXP") this.gainXp(player, amount, "effect");
      else if (action === "spendFocus") { const targetPlayer = effect.target === "opponent" ? effectContext.opponent : player; const spent = Math.min(targetPlayer.focus, Math.max(0, amount)); targetPlayer.focus -= spent; targetPlayer.turnStats.focusSpent = (targetPlayer.turnStats.focusSpent ?? 0) + spent; this.telemetry.focusSpent += spent; }
      else if (action === "removeTemporaryNegativeStatModifier") this.removeTemporaryNegativeStatModifier(player, Math.max(1, amount));
      else if (action === "removeTemporaryStatus") this.removeTemporaryNegativeStatModifier(player, Math.max(1, amount));
      else if (action === "hitChoice") this.queueHitChoice(player, effect, effectContext.opponent);
      else if (action === "incomingAttackChoice") this.queueIncomingAttackChoice(player, effect, effectContext);
      else if (action === "equipmentToggle") this.queueEquipmentToggleChoice(player, effect);
      else if (action === "discardOrDestroy") this.queueDiscardOrDestroyChoice(player, effect, effectContext);
      else if (action === "restrictWeapon") this.addStatus(player, { action: "restrictWeapon", duration: "game", sourceId: card.instanceId });
      else if (action === "grantKataFocus") this.addStatus(player, { action: "kataFocusBonus", amount, duration: effect.duration ?? "nextKata", expires: "endOfTurn", sourceId: card.instanceId });
      else if (action === "restrictReaction") this.addStatus(effect.target === "opponent" ? effectContext.opponent : player, { action: "restrictReaction", duration: "nextAttack", sourceId: card.instanceId });
      else if (action === "untargetable") this.addStatus(player, { action: "untargetable", duration: "nextTurn", sourceId: card.instanceId });
      else if (action === "restrictConsumable") this.addStatus(player, { action: "restrictConsumable", duration: effect.duration ?? "endOfTurn", sourceId: card.instanceId });
      else if (action === "setSpeed") { const before = this.currentSpeed(player); this.addStatus(player, { action: "speedRestore", amount: player.speed, duration: effect.duration ?? "endOfRound", sourceId: card.instanceId }); player.speed = amount; if (this.currentSpeed(player) !== before) { if (this.currentSpeed(player) > before) player.comboFacts.speedGainedSinceLastTurn = true; this.characterEvent(player, "speedChanged", { amount: this.currentSpeed(player) - before }); } }
      else if (action === "modifyDefenseUntilNextTurn") this.addStatus(player, { action: "modifyDefense", amount, duration: "nextTurn", sourceId: card.instanceId });
      else if (action === "restrictAttack") this.addStatus(player, { action: "restrictAttack", duration: "nextHonor", sourceId: card.instanceId });
      else if (action === "modifyCost") this.addStatus(player, { action, amount, duration: effect.duration ?? "nextPurchase", sourceId: card.instanceId });
      else if (action === "grantFlow") {
        if (effect.resolver === "character.green.linkedSpeedTempoFlow" && player.turnStats.zones.size >= 2) player.nextAttackFlow = true;
        else if (effect.resolver === "character.secondKickNextKickFlow") { const kicks = (player.turnStats.kickCount ?? 0) + (effectContext.attackCard?.tags?.includes("Kick") ? 1 : 0); player.turnStats.kickCount = kicks; if (kicks === 2) player.nextAttackFlow = true; }
        else player.nextAttackFlow = true;
      }
      else if (action === "cycleDiscardDraw") {
        const drawAmount = (effect.conditions ?? []).find((condition) => ["draw", "drawAfterCost"].includes(condition.kind))?.value ?? 1;
        this.queueDiscardDrawChoice(player, { ...effect, drawAmount, postDrawDiscard: effect.resolver === "defense.stepBackCycle", candidateType: effect.resolver === "character.revealConsumableCycle" ? "Consumable" : null, revealSelected: effect.resolver === "character.revealConsumableCycle" });
      }
      else if (action === "deckLook") this.queueDeckLookChoice(player, effect);
      else if (action === "recoverThenDiscard") this.queueZoneChoice(player, { ...effect, sourceCardId: effectContext.sourceCard?.instanceId }, { zones: ["discard"], operation: "recover-then-discard" });
      else if (action === "recycle") this.queueZoneChoice(player, { ...effect, sourceCardId: effectContext.sourceCard?.instanceId }, { zones: ["discard"], operation: "recycle" });
      else if (action === "equipFromHand") this.queueZoneChoice(player, { ...effect, sourceCardId: effectContext.sourceCard?.instanceId }, { zones: ["hand"], operation: "equip-from-hand" });
      else if (action === "equipFromDiscard") this.queueZoneChoice(player, { ...effect, sourceCardId: effectContext.sourceCard?.instanceId }, { zones: ["discard"], operation: "equip-from-discard" });
      else if (action === "modifyDefenseContribution" || action === "modifyDefense") this.applyCombatStatModifier(effectContext, effect, card, "modifyDefense", amount);
      else if (action === "discard" || action === "destroy") {
        const targetPlayer = effect.target === "opponent" ? effectContext.opponent : player;
        if (effect.target === "source" && effectContext.sourceCard) {
          if (action === "discard") this.discardCard(player, effectContext.sourceCard); else this.destroyCard(player, effectContext.sourceCard);
        } else if (!this.queueCardChoice(player, targetPlayer, { ...effect, sourceCardId: effectContext.sourceCard?.instanceId }, action, Math.max(1, amount))) this.markUsedEffect(player, effect);
      }
      else if (action === "ready" || action === "exhaust") {
        const targetCard = effect.target === "source" ? effectContext.sourceCard : effect.target === "chosen-equipment"
          ? player.equipment.find((candidate) => action === "ready" ? this.equipmentIsExhausted(player, candidate) : !this.equipmentIsExhausted(player, candidate))
          : player.equipment.find((candidate) => candidate.instanceId === effect.cardId);
        if (targetCard && this.setEquipmentReady(player, targetCard, action === "ready")) { /* handled */ }
        else this.markUsedEffect(player, effect);
      }
      else if (action === "modifyAttackPower") { const subject = effect.target === "opponent" ? effectContext.opponent : player; if (subject !== player && amount) this.characterEvent(subject, "cardModified", { modifiedCardType: "Attack" }); if (effect.duration === "nextAttack") subject.nextAttackPower += amount; else if (effect.duration && effect.duration !== "immediate") this.addStatus(subject, { action, amount, duration: effect.duration, sourceId: card.instanceId }); else if (subject === player) effectContext.attackPowerModifier = (effectContext.attackPowerModifier ?? 0) + amount; else effectContext.opponentAttackPowerModifier = (effectContext.opponentAttackPowerModifier ?? 0) + amount; }
      else if (action === "reactionDefense") effectContext.defenseModifier = (effectContext.defenseModifier ?? 0) + amount;
      else if (action === "modifySpeed") this.applySpeedModifier(effectContext, effect, card, amount);
      else if (action === "modifyGuard" || action === "preventDamage") this.applyCombatStatModifier(effectContext, effect, card, action, amount);
      else if (action === "heal") player.hp = Math.min(player.maxHp, player.hp + amount);
      else if (action === "dealDamage") { effectContext.opponent.hp = Math.max(0, effectContext.opponent.hp - Math.max(0, amount)); if (amount > 0) effectContext.opponent.lastDamagedBy = player.id; }
      else if (action === "minimumSpeed") { if (effect.duration !== "whileEquipped") player.speed = Math.max(player.speed, amount); }
      else if (action === "piercing") { if (effect.duration && effect.duration !== "immediate") this.addStatus(player, { action, amount, duration: effect.duration, sourceId: card.instanceId }); else effectContext.piercing = (effectContext.piercing ?? 0) + amount; }
      else if (rawAction === "custom" && effect.resolver === "starter.gainFocusIfFastest") { if (this.currentSpeed(player) > this.currentSpeed(effectContext.opponent)) { player.focus += amount; player.turnStats.focusGenerated = (player.turnStats.focusGenerated ?? 0) + amount; this.telemetry.focusGenerated += amount; } }
      else if (action === "chooseZone") {
        if (effectContext.allowChoice) effectContext.choice = { kind: "attack-zone", options: zones };
        // "This Attack may be declared as …": a declaration-time zone grant, read by attackZoneOptions.
        else if (effect.trigger === "onAttackDeclared") { /* granted when the Attack was declared */ }
        // A passive grant is re-evaluated on every Attack, so it grants once per round, not forever.
        else if (effect.trigger === "passive") { if (!this.hasUsedEffect(player, effect, "round")) player.nextAttackAnyZone = true; this.markUsedEffect(player, effect); }
        else if (effectContext.zone || effect.trigger === "onPlay") { player.nextAttackAnyZone = true; this.markUsedEffect(player, effect); }
        else this.unsupportedEffect(card, effect);
      }
      else this.unsupportedEffect(card, effect);
      if (this.telemetry.unsupportedEffects === unsupportedBefore) {
        this.track(card, "effectApplications", player);
        this.telemetry.effectApplications += 1;
        this.markUsedEffect(player, effect);
      }
    }
    return effectContext;
  }

  // A Speed change lands on the fighter the effect names (rules: Current Speed). Timed changes are
  // statuses; an immediate change lasts until that fighter's Hide. A Speed that lasts while a card
  // is equipped is a static stat of that card, read by currentSpeed(), never stored as a status.
  applySpeedModifier(effectContext, effect, card, amount) {
    const subject = effect.target === "opponent" ? effectContext.opponent : effectContext.player;
    if (effect.duration === "whileEquipped") return;
    this.changeSpeed(subject, amount, effect.duration, card.instanceId);
  }

  // Guard, DEF and damage-prevention changes land on the fighter the effect names. Timed changes
  // are statuses on that fighter; immediate ones change the exchange being resolved.
  applyCombatStatModifier(effectContext, effect, card, action, amount) {
    const towardsOpponent = effect.target === "opponent";
    if (effect.duration && effect.duration !== "immediate" && effect.duration !== "whileEquipped") {
      this.addStatus(towardsOpponent ? effectContext.opponent : effectContext.player, { action, amount, duration: effect.duration, sourceId: card.instanceId });
      return;
    }
    const key = { modifyGuard: "guardModifier", modifyDefense: "defenseModifier", preventDamage: "damagePrevention" }[action];
    const contextKey = towardsOpponent ? `opponent${key[0].toUpperCase()}${key.slice(1)}` : key;
    effectContext[contextKey] = (effectContext[contextKey] ?? 0) + amount;
  }

  // Tempo Advantage (rules: Tempo; DDB-RUL-003): once per round, a fighter whose current Speed is
  // higher than the opposing fighter's spends Tempo for +1 Attack Power on an Attack or +1 Guard on
  // a Defense card. A Boss is compared by its printed Speed. The engine spends it whenever it is legal.
  hasTempoAdvantage(fighter, opposing) {
    const speed = (side) => side.isBoss ? side.speed : this.currentSpeed(side);
    return Boolean(fighter.tempo) && speed(fighter) > speed(opposing);
  }

  // Current Speed (glossary): printed and Belt Speed, changes that last until Hide, timed Speed
  // statuses (a "next round" status counts once Honor activates it) and the static Speed of
  // equipped cards, raised to any equipped Speed floor.
  currentSpeed(player) {
    let modifier = 0; let floor = -Infinity;
    for (const card of player.equipment ?? []) {
      const stats = this.staticEquipmentSpeed(card);
      modifier += stats.modifier; floor = Math.max(floor, stats.floor);
    }
    return Math.max(floor, player.speed + (player.tempSpeed ?? 0) + this.statusValue(player, "modifySpeed") + modifier);
  }

  staticEquipmentSpeed(card) {
    this.staticSpeedByCard ??= new Map();
    if (!this.staticSpeedByCard.has(card.catalogId)) {
      const unconditional = this.cardEffects(card, "passive").filter((effect) => effect.duration === "whileEquipped" && !(effect.conditions ?? []).length);
      const amounts = (action) => unconditional.filter((effect) => effect.action === action).map((effect) => num(effect.amount));
      this.staticSpeedByCard.set(card.catalogId, { modifier: amounts("modifySpeed").reduce((total, value) => total + value, 0), floor: Math.max(-Infinity, ...amounts("minimumSpeed")) });
    }
    return this.staticSpeedByCard.get(card.catalogId);
  }

  // One strike through the full combat pipeline (rules Ch. 8). `reversal` marks an Attack made
  // through the Reversal window: it is played outside its owner's turn, so it generates no
  // Focus, draws no Flow card and stays out of that player's turn sequence. `openWindows` is set
  // by the choice pipeline so a Block can open the Reversal window afterwards.
  resolveAttack(attacker, defender, card, { useTempo = true, defenseCard, zone, reactionPrevention = 0, reactionAttackModifier = 0, reactionDefense = 0, reversal = false, declared = false, openWindows = false, strike = {} } = {}) {
    if (!card || !attacker.hand.includes(card)) return null;
    this.declaredAttack = null;
    zone = zone ?? (card.zone === "Any" ? undefined : card.zone);
    // Tempo is checked when the Attack and the Defense card are played (rules: Tempo Advantage).
    const attackerTempo = useTempo && this.hasTempoAdvantage(attacker, defender);
    const defenderTempo = Boolean(defenseCard) && this.hasTempoAdvantage(defender, attacker);
    const previousCombat = this.combat; this.combat = { attackerId: attacker.id, defenderId: defender.id, zoneChangedBy: strike.zoneChangedBy ?? null, marks: [], combos: {} };
    remove(attacker.hand, card); attacker.played.push(card); attacker.plays += 1;
    const firstAttackInZoneThisTurn = !reversal && !attacker.turnStats.zones.has(zone ?? "Mid");
    if (!reversal) {
      attacker.focus += focus(card); this.telemetry.focusGenerated += focus(card);
      attacker.attackCount += 1; attacker.turnStats.attacked = true; attacker.turnStats.zones.add(zone ?? "Mid");
      // Attacks are cards played this turn (rules: Four-Card Mastery counts them).
      attacker.turnStats.playsThisTurn = (attacker.turnStats.playsThisTurn ?? 0) + 1;
      if ((card.tags ?? []).includes("Kick")) attacker.turnStats.kickCount = (attacker.turnStats.kickCount ?? 0) + 1;
    }
    if (!declared) defender.turnStats.incomingAttackCount = (defender.turnStats.incomingAttackCount ?? 0) + 1;
    const strikeMatch = { card, zone, targetId: defender.id };
    const grantedFlow = !reversal && this.takeStatuses(attacker, "grantFlow", "nextAttack", strikeMatch).length > 0;
    const flow = !reversal && Boolean(card.tags?.includes("Flow") || attacker.nextAttackFlow || grantedFlow); if (!reversal) attacker.nextAttackFlow = false; this.track(card, "played", attacker);

    // Attack Power: each modifier source is measured as it resolves, so the event can say where every point came from.
    const attackParts = combatLedger();
    const nextAttackStatus = this.consumeStatuses(attacker, "modifyAttackPower", "nextAttack", strikeMatch);
    const attackSeed = { attackCard: card, zone, isReversal: reversal, firstAttackInZoneThisTurn, attackPowerModifier: nextAttackStatus, piercing: this.consumeStatuses(attacker, "piercing", "nextAttack", strikeMatch), allowChoice: false };
    const withEquipment = this.addCombatModifiers(this.applyPassiveEquipment(attacker, defender, attackSeed), this.applyEquipmentTrigger(attacker, "onAttackDeclared", { opponent: defender, attackCard: card, zone, isReversal: reversal }, { side: "own", skip: ["chooseZone"] }));
    // Flow granted while this Attack is declared ("your second Attack each turn gains Flow") belongs to this Attack.
    if (!reversal && attacker.nextAttackFlow) { withEquipment.flow = true; attacker.nextAttackFlow = false; }
    const attackContext = this.applyLocationEvent(attacker, "attack", withEquipment);
    const context = this.applyCardEffects(attacker, card, "passive", attackContext);
    Object.assign(context, this.applyCardEffects(attacker, card, "onAttackDeclared", context));
    const afterCard = context.attackPowerModifier ?? 0;
    this.activateCombos(attacker, "onAttackDeclared", card, zone, { context, isReversal: reversal });
    const afterCombos = context.attackPowerModifier ?? 0;
    this.characterEvent(attacker, "attackDeclared", { card, zone, context });
    const modifierAt = (stage) => stage.attackPowerModifier ?? 0;
    attackParts.add("Card", attackPower(card), { keep: true });
    attackParts.add("ATK", attacker.atk);
    const weaponBonus = this.weaponAttackBonus(attacker, { opponent: defender, attackCard: card, zone, isReversal: reversal });
    attackParts.add("Weapon", weaponBonus);
    attackParts.add("Status", nextAttackStatus);
    attackParts.add("Equipment", modifierAt(withEquipment) - nextAttackStatus);
    attackParts.add("Location", modifierAt(attackContext) - modifierAt(withEquipment));
    attackParts.add("Effect", afterCard - modifierAt(attackContext));
    attackParts.add("Combo", afterCombos - afterCard);
    attackParts.add("Character", modifierAt(context) - afterCombos);

    // A one-use card played as a Defense stays in play until the strike resolves, then leaves as printed.
    if (defenseCard) { remove(defender.hand, defenseCard); (this.afterUseDestination(defenseCard) ? defender.played : defender.discard).push(defenseCard); const defenseFocus = defender.id === this.activePlayer ? focus(defenseCard) : 0; /* rulebook: cards played outside your own turn generate no printed Focus */ defender.focus += defenseFocus; this.telemetry.focusGenerated += defenseFocus; this.track(defenseCard, "played", defender); this.takeStatuses(defender, "extraDefenseZone", "nextTurn"); }
    // Defense: Character DEF + matching Armor + one Defense card's Guard + modifiers (Final Combat Formula).
    // Guard belongs to a Defense card (glossary: Guard), so Guard changes wait for, and apply only to, a played Defense card.
    // "Next Attack against you" statuses are consumed by any incoming strike.
    const nextDefenseGuard = defenseCard ? this.consumeStatuses(defender, "modifyGuard", "nextDefense") : 0;
    const incomingAttackDefense = this.consumeStatuses(defender, "modifyDefense", "nextIncomingAttack") + this.consumeStatuses(defender, "modifyDefense", "nextAttack");
    const nextDefensePrevention = (defenseCard ? this.consumeStatuses(defender, "preventDamage", "nextDefense") : 0) + this.consumeStatuses(defender, "preventDamage", "nextAttack");
    const zoneCalls = this.resolveIncomingZoneCalls(defender, attacker, card, zone, reversal);
    reactionAttackModifier += zoneCalls.opponentAttackPowerModifier; reactionPrevention += zoneCalls.damagePrevention; reactionDefense += zoneCalls.defenseModifier;
    const fromAttack = { guard: context.opponentGuardModifier ?? 0, defense: context.opponentDefenseModifier ?? 0 };
    const defenseSeed = { opponent: attacker, attackCard: card, defenseCard, defensePlayed: Boolean(defenseCard), defenseOutsideTurn: defender.id !== this.activePlayer, zone, isReversal: reversal, guardModifier: nextDefenseGuard + fromAttack.guard, defenseModifier: reactionDefense + incomingAttackDefense + fromAttack.defense, damagePrevention: nextDefensePrevention, armorDefense: 0 };
    const defensePassive = this.applyPassiveEquipment(defender, attacker, defenseSeed);
    const defenseEquipment = defenseCard ? this.addCombatModifiers(defensePassive, this.applyEquipmentTrigger(defender, "onDefenseDeclared", defenseSeed, { side: "own" })) : defensePassive;
    const defenseBase = this.applyLocationEvent(defender, "defense", defenseEquipment);
    const defenseContext = defenseCard ? this.applyCardEffects(defender, defenseCard, "onDefenseDeclared", defenseBase) : defenseBase;
    if (defenseCard) defender.turnStats.defenseCount = (defender.turnStats.defenseCount ?? 0) + 1;

    const tempo = attackerTempo ? num(this.definition.turn.tempoAttackPower) : 0; if (attackerTempo) attacker.tempo = false;
    const tempoGuard = defenderTempo ? num(this.definition.turn.tempoDefenseGuard) : 0; if (defenderTempo) defender.tempo = false;
    const reversalBonus = reversal ? this.consumeReversalBonus(attacker, defender) : 0;
    const standingAttackStatus = this.statusValue(attacker, "modifyAttackPower");
    // The defender's Character may answer the strike's modifiers (e.g. ignore or trim temporary bonuses).
    const temporaryAttackBonus = (context.attackPowerModifier ?? 0) - modifierAt(attackContext) + nextAttackStatus + attacker.nextAttackPower + standingAttackStatus + tempo + reversalBonus;
    const answer = this.characterEvent(defender, "incomingAttack", { attacker, card, zone, context: {}, temporaryAttackBonus, modifierBonus: temporaryAttackBonus + modifierAt(attackContext) - nextAttackStatus });
    const defenderCharacter = answer.context.attackPowerAdjustment ?? 0;
    const attack = attackPower(card) + attacker.atk + weaponBonus + tempo + attacker.nextAttackPower + standingAttackStatus + (context.attackPowerModifier ?? 0) + reactionAttackModifier + reversalBonus + defenderCharacter;
    attackParts.add("Tempo", tempo);
    attackParts.add("Next Attack", attacker.nextAttackPower);
    attackParts.add("Status", standingAttackStatus);
    attackParts.add("Reaction", reactionAttackModifier);
    attackParts.add("Reversal", reversalBonus);
    attackParts.add("Defender Character", defenderCharacter);
    attacker.nextAttackPower = 0;

    // Three layers: standing DEF (Character DEF and DEF modifiers), the Defense card's Guard (never
    // below 0) and Armor DEF (printed plus Armor effects), the only layer Piercing ignores.
    const blockParts = combatLedger();
    const guardStatus = defenseCard ? this.statusValue(defender, "modifyGuard") : 0;
    const defenseStatus = this.statusValue(defender, "modifyDefense");
    const counted = (stage) => (defenseCard ? stage.guardModifier ?? 0 : 0) + (stage.defenseModifier ?? 0);
    const printedGuard = defenseCard ? guard(defenseCard) : 0;
    const guardWithModifiers = printedGuard + tempoGuard + guardStatus + (defenseCard ? defenseContext.guardModifier ?? 0 : 0);
    const cardGuard = defenseCard ? Math.max(0, guardWithModifiers) : 0;
    const armor = this.printedArmorDefense(defender, zone) + (defenseContext.armorDefense ?? 0);
    blockParts.add("Guard", printedGuard);
    blockParts.add("DEF", defender.def, { keep: true });
    blockParts.add("Tempo", tempoGuard);
    blockParts.add("Armor", armor);
    blockParts.add("Status", incomingAttackDefense + defenseStatus + nextDefenseGuard + guardStatus);
    blockParts.add("Reaction", reactionDefense);
    blockParts.add("Attack effect", fromAttack.defense + (defenseCard ? fromAttack.guard : 0));
    blockParts.add("Equipment", counted(defenseEquipment) - counted(defenseSeed));
    blockParts.add("Location", counted(defenseBase) - counted(defenseEquipment));
    blockParts.add("Effect", counted(defenseContext) - counted(defenseBase));
    blockParts.add("Guard minimum", cardGuard - (defenseCard ? guardWithModifiers : 0));
    const unpiercedBlock = defender.def + defenseStatus + (defenseContext.defenseModifier ?? 0) + cardGuard + armor;
    const piercing = (context.piercing ?? 0) + this.statusValue(attacker, "piercing");
    const piercedArmor = Math.max(0, Math.min(piercing, armor));
    const prevention = (defenseContext.damagePrevention ?? 0) + this.statusValue(defender, "preventDamage") + reactionPrevention;
    const block = Math.max(0, unpiercedBlock - piercedArmor);
    const unreduced = Math.max(this.definition.combat.damageFloor, attack - block - prevention);
    // Character damage reduction ("when you would take 4 or more damage", "the first time each round you are Hit").
    const damage = unreduced > 0 ? Math.max(this.definition.combat.damageFloor, this.characterEvent(defender, "damageIncoming", { attacker, card, damage: unreduced }).damage) : unreduced;
    defender.hp = Math.max(0, defender.hp - damage); if (damage > 0) { defender.lastDamagedBy = attacker.id; defender.lastTurnWasHit = true; if (!reversal) attacker.turnStats.dealtCombatDamageThisTurn = true; }
    const breakdown = { attackParts: attackParts.list(), blockParts: blockParts.list(), prevented: Math.max(0, Math.min(prevention, attack - block)) + (unreduced - damage), piercing: piercedArmor };

    // Rules Ch. 8 step 8 and "How to Earn XP": every legal Attack and every legal Defense card earns XP, Hit or Block.
    this.awardCombatXp(attacker, this.definition.progression.xpPerLegalAttack, "attack", { attackCard: card, damage });
    if (defenseCard) this.awardCombatXp(defender, this.definition.progression.xpPerLegalDefense, "defense", { attackCard: card, defenseCard, damage });
    if (damage > 0) {
      if (!reversal) { attacker.turnStats.hit = true; attacker.turnStats.hitCount = (attacker.turnStats.hitCount ?? 0) + 1; if (damage >= 3 && attacker.turnStats.hitCount === 1 && !attacker.turnStats.impactFocusUsed) { const impactFocus = this.beltRewardAmount(attacker, "impact-focus"); if (impactFocus > 0) { attacker.focus += impactFocus; attacker.turnStats.focusGenerated += impactFocus; attacker.turnStats.impactFocusUsed = true; this.telemetry.focusGenerated += impactFocus; this.emit({ type: "belt-reward", player: attacker.id, reward: "impact-focus", amount: impactFocus }); } } }
      defender.turnStats.damageTaken = (defender.turnStats.damageTaken ?? 0) + damage;
    } else if (defenseCard) defender.turnStats.blocked = true;
    if (!reversal) { attacker.turnStats.previousAttackHit = damage > 0; attacker.turnStats.previousAttackBlocked = damage === 0; attacker.turnStats.previousZone = zone; attacker.turnStats.previousAttackTags = card.tags ?? []; attacker.turnStats.previousCardType = card.subtype; attacker.turnStats.previousOpponentId = defender.id; }
    if (defenseCard) defender.turnStats.playedDefenseSinceLastTurn = true;
    const blocked = damage === 0 && Boolean(defenseCard);
    this.markComboAttack(attacker, card, zone, { hit: damage > 0, blocked, reversal });
    if (defenseCard) { this.markComboCardPlayed(defender, defenseCard, zone); this.markComboBlock(defender, defenseCard, zone, damage === 0); }
    const hitContext = { opponent: defender, attackCard: card, damage, attack, block, zone, isReversal: reversal };
    if (damage > 0) { this.applyEquipmentTrigger(attacker, "onHit", hitContext); this.characterEvent(attacker, "hit", { card, damage, opponent: defender }); this.applyCardEffects(attacker, card, "onHit", hitContext); }
    else if (defenseCard) this.resolveBlockTriggers(defender, attacker, { attackCard: card, defenseCard, damage, attack, block, zone, defensePlayed: true, isReversal: reversal });
    if (damage > 0) this.activateCombos(attacker, "onHit", card, zone, { currentAttackHit: true, currentDefense: defenseCard, currentDefenseBlocked: false, isReversal: reversal });
    if (blocked) this.activateCombos(defender, "onBlock", card, zone, { currentAttackHit: false, currentDefense: defenseCard, currentDefenseBlocked: true });
    this.applyCardEffects(attacker, card, "afterResolve", hitContext);
    this.applyEquipmentTrigger(attacker, "afterResolve", { ...hitContext, resolvedCard: card, defenseCard, defensePlayed: Boolean(defenseCard) }, { side: "own" });
    if (defenseCard) this.finishOneUseCard(defender, defenseCard);
    // A called zone ("before you play an Attack, choose High, Mid, or Low") lasts for one Attack.
    attacker.statuses = attacker.statuses.filter((status) => status.action !== "next-attack-zone");
    this.markComboCardPlayed(attacker, card, zone, { outsideTurn: reversal });
    this.activateCombos(attacker, "afterResolve", card, zone, { currentAttackHit: damage > 0, currentDefense: defenseCard, currentDefenseBlocked: blocked, isReversal: reversal });
    if (!reversal) this.cardPlayedEvent(attacker, card, zone);
    if (!reversal && (flow || context.flow) && !attacker.turnStats.flowDrawUsed) { this.draw(attacker, 1); attacker.turnStats.flowDrawUsed = true; }
    if (damage > 0) { this.track(card, "damageDealt", attacker, damage); this.track(card, "hits", attacker); }
    if (defenseCard) this.track(defenseCard, damage === 0 ? "blocks" : "damagePrevented", defender, damage === 0 ? 1 : Math.max(0, block - attack + damage));
    this.emit({ type: "attack", attacker: attacker.id, defender: defender.id, card: card.catalogId, defense: defenseCard?.catalogId ?? null, attack, block, damage, defenseFocus: defenseCard && defender.id === this.activePlayer ? focus(defenseCard) : 0, zone: zone ?? card.zone ?? null, reversal, breakdown });
    if (openWindows && blocked) this.afterDefenseBlocked(defender, attacker, { zone, reversal });
    this.combat = previousCombat; this.checkWinner();
    return { attack, block, damage, defense: defenseCard, reversal, breakdown };
  }

  awardCombatXp(player, amount, source, context) {
    this.gainXp(player, amount, source);
    this.applyEquipmentWatchers(player, "equipment.structured", { ...context, xpFromLegalAttackOrDefense: true, watchCondition: "xpFromLegalAttackOrDefense" });
  }

  // "When you Block" triggers: Equipment, Character, the Defense card, and Character text that
  // arms a Reversal bonus against the blocked attacker.
  resolveBlockTriggers(defender, attacker, blockContext) {
    const context = { ...blockContext, opponent: attacker, blockedAttackerId: attacker.id };
    this.applyEquipmentTrigger(defender, "onBlock", context);
    this.characterEvent(defender, "block", { card: blockContext.defenseCard, damage: blockContext.damage, attacker });
    this.applyCardEffects(defender, blockContext.defenseCard, "onBlock", context);
    const reversalPassives = this.cardEffects(defender.character, "passive").filter((effect) => REVERSAL_BONUS_RESOLVERS[effect.resolver] && !this.hasUsedEffect(defender, effect, "round"));
    if (reversalPassives.length) this.applyCardEffects(defender, defender.character, "passive", { ...context, sourceCard: defender.character, effectOverride: reversalPassives });
  }

  // ---- Reversal (rules Ch. 8 "Reversal", glossary "Reversal", ruling "XP and Reversals against a Boss")
  // Once per round, after a Defense card you played Blocks an Attack, you may immediately play one
  // Attack from your hand against that attacker. The window opens once every choice the Block
  // created (draws, discards, "when you Block" picks) has been answered.
  afterDefenseBlocked(defender, attacker, { zone, reversal }) {
    // "A Reversal Attack cannot trigger another Reversal." After-Block Reactions are still offered first.
    this.queuedReversal = { playerId: defender.id, attackerId: attacker.id, zone: zone ?? null, defenderFighter: defender.activeIndex ?? 0, attackerFighter: attacker.activeIndex ?? 0, reversalAllowed: !reversal, blockReactionsOffered: false };
  }

  reversalCandidates(player, target) {
    if (!player || !target || player.reversalUsedThisRound || player.eliminated || player.hp <= 0) return [];
    if (this.hasStatus(player, "restrictAttack") || this.hasStatus(target, "reversalProtection") || !this.isLegalTarget(player, target)) return [];
    return player.hand.filter((card) => isAttack(card) && this.canPlayCard(player, card));
  }

  openQueuedReversal() {
    const queued = this.queuedReversal;
    if (!queued || this.pendingChoice) return false;
    if (this.winner !== null) { this.queuedReversal = null; return false; }
    const player = this.players[queued.playerId]; const target = this.players[queued.attackerId];
    // After a knockout replacement "that attacker" (or the blocker) is no longer on the mat.
    const sameFighters = (player.activeIndex ?? 0) === queued.defenderFighter && (target.activeIndex ?? 0) === queued.attackerFighter && !player.eliminated && !target.eliminated;
    if (!queued.blockReactionsOffered) {
      queued.blockReactionsOffered = true;
      if (sameFighters && this.offerBlockReactions(player, target, queued)) return true;
    }
    this.queuedReversal = null;
    if (!queued.reversalAllowed) { this.closeReversalWindow(player, target); return false; }
    const candidates = sameFighters ? this.reversalCandidates(player, target) : [];
    if (!candidates.length) { this.closeReversalWindow(player, target); return false; }
    this.offerChoice({ kind: "reversal", playerId: player.id, attackerId: target.id, zone: queued.zone, options: [{ id: "pass", label: "Decline the Reversal" }, ...candidates.map((card) => ({ id: card.instanceId, label: card.name }))] });
    this.emit({ type: "reversal-window", player: player.id, attacker: target.id, zone: queued.zone, cards: candidates.map((card) => card.catalogId) });
    return true;
  }

  resolveReversalChoice(pending, selected) {
    const player = this.players[pending.playerId]; const target = this.players[pending.attackerId];
    if (selected === "pass") {
      this.pendingChoice = null;
      this.emit({ type: "reversal-declined", player: player.id, attacker: target.id });
      this.closeReversalWindow(player, target);
      return true;
    }
    const card = player.hand.find((candidate) => candidate.instanceId === selected);
    if (!card) return false;
    this.pendingChoice = null;
    player.reversalUsedThisRound = true;
    // The Reversal resolves through the normal attack pipeline, so the original attacker may defend.
    return this.beginAttack(player.id, card, { targetId: target.id, reversal: true });
  }

  armReversalBonus(player, blockedAttacker, effect, card) {
    const rule = REVERSAL_BONUS_RESOLVERS[effect.resolver];
    const amount = num(effect.amount) || 1;
    this.addStatus(player, { action: "reversalAttackPower", amount, duration: "endOfRound", targetId: blockedAttacker?.id ?? null, sourceId: card.instanceId ?? card.catalogId, ...(rule.fallback ? { fallback: { ...rule.fallback, amount } } : {}) });
  }

  consumeReversalBonus(player, target) {
    let total = 0;
    player.statuses = player.statuses.filter((status) => {
      if (status.action !== "reversalAttackPower" || (status.targetId !== null && status.targetId !== target.id)) return true;
      total += num(status.amount);
      return false;
    });
    return total;
  }

  // "If you do not make a Reversal, ... instead": a bonus with a fallback converts when its window closes unused.
  closeReversalWindow(player, target) {
    const unused = player.statuses.filter((status) => status.action === "reversalAttackPower" && status.fallback && (status.targetId === null || status.targetId === target?.id));
    for (const status of unused) {
      remove(player.statuses, status);
      this.addStatus(player, { ...status.fallback, sourceId: status.sourceId });
    }
  }

  practice(player, card) {
    if (this.definition.economy.defensePractice.usesPerTurn < 1 || player.practiceUsed || !card || !isDefense(card) || !player.hand.includes(card)) return false;
    remove(player.hand, card); player.played.push(card); player.focus += focus(card); this.telemetry.focusGenerated += focus(card); this.telemetry.defensePractice += 1; player.practiceUsed = true; this.track(card, "played", player); this.emit({ type: "defense-practice", player: player.id, card: card.catalogId, focus: focus(card) }); return true;
  }

  badHabitActions(player) {
    const rule = this.definition.economy.badHabitFocus;
    if (!rule || rule.usesPerTurn < 1 || player.badHabitFocusUsed) return [];
    const card = player.hand.find((candidate) => candidate?.catalogId === rule.catalogId);
    return card ? [{ type: "bad-habit-focus", playerId: player.id, cardId: card.instanceId }] : [];
  }

  cashBadHabit(player) {
    const rule = this.definition.economy.badHabitFocus; if (!rule || rule.usesPerTurn < 1 || player.badHabitFocusUsed) return false;
    const card = player.hand.find((candidate) => candidate?.catalogId === rule.catalogId); if (!card) return false; remove(player.hand, card); player.discard.push(card); player.focus += Number(rule.focusGain) || 0; this.telemetry.focusGenerated += Number(rule.focusGain) || 0; player.badHabitFocusUsed = true; this.emit({ type: "bad-habit-focus", player: player.id, card: card.catalogId, focus: Number(rule.focusGain) || 0 }); return true;
  }

  // ---- Weapon Hands (rules Ch. 9 Weapons; definition.equipment.weaponHands) ---------------
  /** Hands a card occupies when equipped: its printed Hands for a Weapon, 0 for anything else. */
  weaponHands(card) {
    const rule = this.definition.equipment?.weaponHands;
    if (!rule || card?.subtype !== "Weapon") return 0;
    const printed = String(card.stats?.[rule.handsStat] ?? card.details?.[rule.handsStat] ?? "").match(/\d+/);
    return printed ? Math.max(1, Number(printed[0])) : Number(rule.defaultHandsPerWeapon ?? 1);
  }

  handsOccupied(player, ignoring = []) {
    return player.equipment.filter((card) => !ignoring.includes(card)).reduce((total, card) => total + this.weaponHands(card), 0);
  }

  /** Restriction ids printed on the fighter's equipped cards (structured `equipmentRestriction` conditions). */
  equipmentRestrictions(player) {
    return player.equipment.flatMap((card) => this.cardEffects(card, "passive").flatMap((effect) => (effect.conditions ?? []).filter((condition) => condition.kind === "equipmentRestriction").map((condition) => String(condition.value))));
  }

  /**
   * The ways a card can be equipped right now: [[]] when it fits; when the Hands are full, one
   * entry per smallest set of equipped Weapons it may replace (by instance id); [] when it cannot.
   */
  equipReplacementOptions(player, card) {
    const rule = this.definition.equipment?.weaponHands;
    const needed = this.weaponHands(card);
    if (!rule || !needed) return [[]];
    const handLimits = this.equipmentRestrictions(player).map((id) => rule.restrictions?.[id]?.maxHandsPerWeapon).filter((limit) => limit !== undefined);
    const capacity = Number(rule.capacity);
    if (needed > capacity || handLimits.some((limit) => needed > Number(limit))) return [];
    if (this.handsOccupied(player) + needed <= capacity) return [[]];
    if (rule.whenFull !== "replace") return [];
    const weapons = player.equipment.filter((equipped) => this.weaponHands(equipped) > 0);
    const subsets = weapons.reduce((all, weapon) => [...all, ...all.map((subset) => [...subset, weapon])], [[]]);
    const freeing = subsets.filter((subset) => subset.length && this.handsOccupied(player, subset) + needed <= capacity);
    const smallest = freeing.filter((subset) => !freeing.some((other) => other.length < subset.length && other.every((equipped) => subset.includes(equipped))));
    return smallest.map((subset) => subset.map((equipped) => equipped.instanceId));
  }

  /** The equipped cards a legal equip must discard first, or null when the requested replacement is not legal. */
  equipReplacement(player, card, replaceCardIds = []) {
    const requested = [...new Set(replaceCardIds ?? [])];
    const option = this.equipReplacementOptions(player, card).find((ids) => ids.length === requested.length && ids.every((id) => requested.includes(id)));
    return option ? option.map((id) => player.equipment.find((equipped) => equipped.instanceId === id)) : null;
  }

  /** "Replacing an occupied slot discards the old Equipment first" (rules Ch. 9). */
  discardReplacedEquipment(player, replaced, incoming) {
    for (const card of replaced) {
      delete card.temporaryUntilHide;
      this.discardCard(player, card, { replacement: true });
      this.emit({ type: "equipment-replaced", player: player.id, card: card.catalogId, replacedBy: incoming.catalogId });
    }
  }

  playCard(player, card, options = {}) { return this.resolvePlayedCard(player, card, options) !== null; }

  /**
   * Play a non-combat card from hand and resolve it: Equipment is equipped, a Kata or Consumable
   * resolves its `onPlay` effects. Returns the effect context (so a Reaction played against an
   * Attack can hand its modifiers to that Attack), or null when the play is illegal.
   */
  resolvePlayedCard(player, card, { replaceCardIds = [], context = {} } = {}) {
    const combatTechnique = card?.cardType === "Technique" || card?.cardType === "Starter";
    if (!card || !player.hand.includes(card) || combatTechnique && (isAttack(card) || isDefense(card))) return null;
    if (!this.canPlayCard(player, card)) return null;
    const replaced = PERMANENT_EQUIPMENT.includes(card.subtype) ? this.equipReplacement(player, card, replaceCardIds) : [];
    if (!replaced) return null;
    this.discardReplacedEquipment(player, replaced, card);
    const ownTurn = player.id === this.activePlayer;
    remove(player.hand, card); player.played.push(card); this.gainPrintedFocus(player, card);
    if (card.subtype === "Kata") { const kataBonus = ["nextKata", "endOfTurn", "turn"].reduce((total, duration) => total + this.consumeStatuses(player, "kataFocusBonus", duration), 0); this.gainFocusFor(player, kataBonus); }
    player.plays += 1;
    if (ownTurn) player.turnStats.playsThisTurn = (player.turnStats.playsThisTurn ?? 0) + 1;
    if (card.subtype === "Consumable") { player.turnStats.usedConsumableThisRound = true; if (ownTurn) { player.turnStats.usedConsumableThisTurn = true; player.turnStats.consumableCount = (player.turnStats.consumableCount ?? 0) + 1; } }
    const equipment = PERMANENT_EQUIPMENT.includes(card.subtype);
    if (equipment) player.equipment.push(card);
    player.turnStats.equippedThisTurn = equipment || player.turnStats.equippedThisTurn;
    this.track(card, "played", player); this.markComboCardPlayed(player, card, "", { outsideTurn: !ownTurn });
    const effectContext = this.applyCardEffects(player, card, "onPlay", { opponent: this.opponentOf(player), attackCard: null, ...context });
    if (card.subtype === "Kata") player.turnStats.kataCount = (player.turnStats.kataCount ?? 0) + 1;
    if (equipment) this.applyCardEffects(player, card, "onEquip", { opponent: this.opponentOf(player), sourceCard: card, equippedCard: card });
    // "After you play a Kata …": Equipment that watches a card resolve.
    this.applyEquipmentTrigger(player, "afterResolve", { opponent: this.opponentOf(player), resolvedCard: card }, { side: "own" });
    this.finishOneUseCard(player, card);
    this.checkBeltExam(player);
    if (equipment) this.characterEvent(player, "equip", { card, fromHand: true });
    this.cardPlayedEvent(player, card);
    return effectContext;
  }

  /**
   * The price of a Market card for this player, before buying it (rules: The Shared Market; card
   * text). Printed cost, plus Item penalties, plus every discount that applies to this card:
   * the Purple Belt first-purchase discount, qualified discount statuses (card type, minimum
   * printed cost, novel card type), Equipment end-slot discounts and the Character price hook.
   * A discount's "minimum X" floors the price it produces; nothing goes below 0. The plan lists
   * the sources so a purchase consumes exactly the discounts it used.
   */
  purchasePlan(player, card) {
    if (!card) return { price: Infinity, statuses: [], equipment: [], character: null };
    const printed = cost(card);
    const isItem = card.cardType === "Item";
    const penalty = isItem ? player.statuses.filter((status) => status.action === "nextItemCostPenalty").reduce((sum, status) => sum + num(status.amount), 0) : 0;
    const discounts = [];
    const beltDiscount = player.turnStats.boughtCardThisAscend ? 0 : this.beltRewardAmount(player, "market-discount");
    if (beltDiscount) discounts.push({ amount: -beltDiscount, floor: 0 });
    const statuses = player.statuses.filter((status) => status.action === "modifyCost" && !["duringNextTurn"].includes(status.duration) && this.discountQualifies(player, status, card));
    for (const status of statuses) discounts.push({ amount: num(status.amount), floor: num(status.floor ?? 0) });
    const equipment = this.marketEndSlotDiscounts(player, card);
    for (const entry of equipment) discounts.push({ amount: entry.amount, floor: entry.floor });
    const character = this.characterPriceHook(player, card);
    if (character) discounts.push(character);
    const base = printed + penalty;
    const floor = Math.min(base, Math.max(0, ...discounts.filter((entry) => entry.amount < 0).map((entry) => entry.floor)));
    const price = Math.max(0, floor, base + discounts.reduce((sum, entry) => sum + entry.amount, 0));
    return { price, statuses, equipment, character };
  }

  purchaseCost(player, card) { return this.purchasePlan(player, card).price; }

  discountQualifies(player, status, card) {
    if (status.cardType && ![card.cardType, card.subtype, card.category].includes(status.cardType)) return false;
    if (status.minimumPrintedCost && cost(card) < status.minimumPrintedCost) return false;
    if (status.novelCardType && player.examProgress.purchasedTypes.includes(cardType(card))) return false;
    return true;
  }

  /** "A card in either end Market slot costs 1 less" (ready Equipment with an end-slot purchase discount). */
  marketEndSlotDiscounts(player, card) {
    const index = this.market.indexOf(card);
    if (index < 0 || (index !== 0 && index !== this.market.length - 1)) return [];
    return player.equipment.filter((equipment) => !this.equipmentIsExhausted(player, equipment)).flatMap((equipment) => this.cardEffects(equipment, "onPurchase")
      .filter((effect) => effect.effect === "economy.modifyCost" && (effect.conditions ?? []).some((condition) => condition.kind === "marketEndSlot" && condition.value === true))
      .map((effect) => ({ source: equipment, amount: num(effect.amount), floor: num(this.structuredParams(effect).minimumFinalCost ?? 0), exhausts: this.cardEffects(equipment, "onPurchase").some((other) => other.action === "exhaust" && other.target === "source") })))
      .slice(0, 1);
  }

  /** Character price hook: "Once per round during Ascend, one Market card costing 5 or more costs you 1 less, to a minimum of 4." */
  characterPriceHook(player, card) {
    const resolver = "character.marketDiscountFloor";
    if (this.phase !== "Ascend" || !this.characterAbilityAvailable(player, resolver)) return null;
    const effect = this.characterEffectGroups(player).get(resolver)[0];
    const params = this.structuredParams(effect);
    if (cost(card) < num(params.minimumPrintedCost ?? 5)) return null;
    return { amount: num(effect.amount) || -1, floor: num(params.minimumFinalCost ?? 4), resolver };
  }

  /** The purchased card's Market slot is refilled from the top of the Market Deck (rules: The Shared Market). */
  refillMarketSlot(index) {
    if (!this.marketDeck.length && this.marketDiscard.length) this.marketDeck = this.rng.shuffle(this.marketDiscard.splice(0));
    const next = this.marketDeck.pop();
    if (!next) return;
    this.market.splice(index, 0, next); this.track(next, "offered");
  }

  buy(player, card) {
    const plan = this.purchasePlan(player, card);
    const finalCost = plan.price;
    if (!card || !this.market.includes(card) || finalCost > player.focus) return false;
    const slot = this.market.indexOf(card);
    player.turnStats.focusSpent = (player.turnStats.focusSpent ?? 0) + finalCost;
    if (card.cardType === "Item") player.statuses = player.statuses.filter((status) => status.action !== "nextItemCostPenalty");
    // A purchase consumes only the one-purchase discounts it used (rules text: "your next purchase").
    const used = new Set(plan.statuses.filter((status) => status.duration === "nextPurchase").map((status) => status.id));
    player.statuses = player.statuses.filter((status) => !used.has(status.id));
    for (const entry of plan.equipment) if (entry.exhausts) this.setEquipmentReady(player, entry.source, false);
    if (plan.character) this.markCharacterUsed(player, plan.character.resolver);
    this.recordMarketDecision(player, card); player.marketPurchasesThisAscend += 1; player.focus -= finalCost; this.telemetry.focusSpent += finalCost; player.turnStats.boughtCardThisTurn = true; player.turnStats.boughtCardThisAscend = true; this.market.splice(slot, 1); player.discard.push(card); player.purchases += 1; this.marketPurchasedThisRound = true; if (this.round === 1) player.openingPurchase = true; if (player.firstMarketPurchaseRound === null) player.firstMarketPurchaseRound = this.round; this.track(card, "purchased", player); player.comboFacts.purchasesSinceLastAscend.push({ cardId: card.catalogId, tags: card.tags ?? [], family: cardType(card), window: "sinceLastAscend" });
    const newType = !player.examProgress.purchasedTypes.includes(cardType(card));
    player.examProgress.purchasedTypes = [...new Set([...player.examProgress.purchasedTypes, cardType(card)])];
    this.applyCardEffects(player, card, "onPurchase", { opponent: this.opponentOf(player), purchaseCost: finalCost, purchaseCompleted: true }); for (const equipment of player.equipment) this.applyCardEffects(player, equipment, "onPurchase", { opponent: this.opponentOf(player), sourceCard: equipment, purchasedCard: card, purchaseCost: finalCost, purchaseCompleted: true });
    const completed = this.checkBeltExam(player);
    if (!completed && newType && this.definition.progression.belts[player.beltIndex + 1]?.exam?.kind === "market-types") this.characterEvent(player, "examRequirement", { exam: "market-types" });
    this.refillMarketSlot(slot); this.emit({ type: "purchase", player: player.id, card: card.catalogId, cost: finalCost, printedCost: cost(card), focusRemaining: player.focus }); return true;
  }

  canPlayCard(player, card) {
    if (!card) return false;
    if (card.subtype === "Consumable" && this.hasStatus(player, "restrictConsumable")) return false;
    if (card.subtype === "Weapon" && this.hasStatus(player, "restrictWeapon")) return false;
    return true;
  }

  canPlayYellCard(card) {
    return card?.subtype === "Kata" || this.consumablePlayableIn(card, "Yell") || (card?.subtype === "Starter" && (card.tags ?? []).includes("Kata"));
  }

  /** "Play them during their printed timing" (rules: Consumables; definition.equipment.consumableWindows). */
  consumablePlayableIn(card, window) {
    if (card?.subtype !== "Consumable") return false;
    const byTiming = this.definition.equipment?.consumableWindows?.byTiming;
    return (byTiming ? byTiming[card.timing ?? "Turn"] ?? [] : ["Yell"]).includes(window);
  }

  /** A Consumable offered in the defender's Reaction Window: Anytime cards always, Reaction cards when they answer the Attack. */
  consumableAnswersAttack(card) {
    if (!this.consumablePlayableIn(card, "incoming-attack")) return false;
    if (card.timing !== "Reaction") return true;
    const answers = new Set(this.definition.equipment?.consumableWindows?.incomingAttackActions ?? []);
    return this.cardEffects(card, "onPlay").some((effect) => [...effectMeanings(effect)].some((meaning) => answers.has(meaning)));
  }

  comboSetupCard(player) {
    for (const card of player.hand) {
      if (isAttack(card) || isDefense(card)) continue;
      const candidate = this.data.comboRequirements?.cards && player.learnedCombos.some((combo) => (this.data.comboRequirements.cards[combo.catalogId]?.requirements ?? []).some((requirement) => {
        const step = requirement.kind === "orderedSequence" ? requirement.steps?.[0] : requirement.kind === "priorCardMatches" ? requirement : null;
        if (!step) return false;
        if (step.family && ((step.family === "Kata" && card.subtype !== "Kata") || (step.family === "Consumable" && card.subtype !== "Consumable") || (step.family === "Equipment" && !["Weapon", "Gear", "Defense Equipment"].includes(card.subtype)))) return false;
        return !(step.tags ?? []).some((tag) => !(card.tags ?? []).some((value) => String(value).toLocaleLowerCase().includes(String(tag).toLocaleLowerCase())));
      }));
      if (candidate) return card;
    }
    return null;
  }

  /** Initiate equips: one action per card that fits, or per Weapon set it may replace when the Hands are full. */
  equipActions(player) {
    if (player.noEquipThisTurn) return [];
    return player.hand.filter((card) => PERMANENT_EQUIPMENT.includes(card.subtype) && this.canPlayCard(player, card)).flatMap((card) => this.equipReplacementOptions(player, card).map((replaceCardIds) => ({ type: "play-card", playerId: player.id, cardId: card.instanceId, ...(replaceCardIds.length ? { replaceCardIds } : {}) })));
  }

  getPendingChoice() { return this.pendingChoice ? structuredClone(this.pendingChoice) : null; }

  // ---- Pending choices ----------------------------------------------------------------------
  /**
   * Present a choice, or queue it behind the one already pending: choices never overwrite each
   * other. A choice is a pending-choice object, or a function that offers it when its turn comes
   * (returning false when there is nothing to offer by then).
   */
  offerChoice(choice) {
    if (!choice) return false;
    if (this.pendingChoice) { this.choiceQueue.push(choice); return true; }
    if (typeof choice === "function") return choice() !== false;
    this.pendingChoice = choice;
    return true;
  }

  /** Once nothing is pending, present the next queued choice that can still be answered. */
  presentQueuedChoice() {
    while (!this.pendingChoice && this.choiceQueue.length && this.winner === null) {
      const next = this.choiceQueue.shift();
      if (typeof next === "function") next(); else this.pendingChoice = this.refreshChoice(next);
    }
  }

  clearChoices() { this.pendingChoice = null; this.choiceQueue = []; }

  /** Drop pending and queued choices that belong to a fighter who left the table. */
  voidChoicesFor(playerId) {
    const involves = (choice) => [choice.playerId, choice.targetPlayerId].includes(playerId);
    if (this.pendingChoice && involves(this.pendingChoice)) this.pendingChoice = null;
    this.choiceQueue = this.choiceQueue.filter((choice) => typeof choice === "function" || !involves(choice));
  }

  /** A queued choice re-checked against the table: attack windows are rebuilt; card options whose card moved drop out. */
  refreshChoice(choice) {
    if (choice.kind === "reaction" && choice.window !== "after-block") return this.attackWindowFor(choice);
    if (choice.kind === "defense") return this.defenseChoiceFor(choice);
    if (choice.kind === "discard-or-destroy" && !this.players[choice.playerId].discard.some((card) => card.instanceId === choice.cardId)) return null;
    const options = choice.options.filter((option) => this.optionStillAvailable(choice, option));
    return options.some((option) => !["pass", "skip"].includes(option.id)) ? { ...choice, options } : null;
  }

  optionStillAvailable(choice, option) {
    const id = String(option.cardId ?? option.id).replace(/^(discard|activate):/, "");
    if (!id.includes("#")) return true;
    const owner = this.players[choice.cardOwnerId ?? choice.targetPlayerId ?? choice.playerId];
    const zoneNames = String(option.id).startsWith("activate:") ? ["equipment"] : choice.cardZones ?? choice.sourceZones ?? CHOICE_CARD_ZONES[choice.kind] ?? ["hand"];
    return zoneNames.some((zone) => (owner?.[zone] ?? []).some((card) => card.instanceId === id));
  }

  /** Remove the windows of an Attack that is no longer aimed where it was (for example after a retarget). */
  withdrawAttackWindows(cardId) {
    this.choiceQueue = this.choiceQueue.filter((choice) => typeof choice === "function" || !(["reaction", "defense"].includes(choice.kind) && choice.cardId === cardId));
  }

  // ---- Structured choices (equipment.structured `choiceKind`) -------------------------------
  /** Offer the choice a structured effect names. Every option offered here is resolved by resolveStructuredChoiceKind. */
  offerStructuredChoice(player, card, effect, params, context) {
    const base = { kind: "structured", playerId: player.id, effectId: effect.id ?? null, resolver: effect.resolver, choiceKind: params.choiceKind, sourceCardId: card.instanceId };
    const opponent = context.opponent ?? this.opponentOf(player);
    if (isZoneCall(params.choiceKind)) return this.offerChoice({ ...base, options: zones.map((zone) => ({ id: zone, label: zone })) });
    if (params.choiceKind === "discard-or-retarget") return this.offerDiscardOrRetarget(player, opponent, base, context);
    if (effect.target === "chosen-equipment") return this.offerEquipmentSuppression(opponent, effect, base, context);
    const draw = num(params.draw); const discard = num(params.discard);
    if (draw > 0 || discard > 0) return this.offerChoice({ ...base, draw, discard, options: [{ id: "accept", label: `Draw ${draw}, then discard ${discard}` }, { id: "skip", label: "Skip" }] });
    // An unknown choice is reported as unsupported instead of being offered without a resolution.
    return false;
  }

  /** "The first opponent to target you each round must discard 1 card or choose another legal target." */
  offerDiscardOrRetarget(owner, attacker, base, context) {
    const discards = attacker.hand.filter((card) => card !== context.attackCard && !this.isDeclaredAttackCard(card)).map((card) => ({ id: `discard:${card.instanceId}`, label: `Discard ${card.name}` }));
    const retargets = context.isReversal ? [] : this.legalTargets(attacker).filter((target) => target.id !== owner.id).map((target) => ({ id: `retarget:${target.id}`, label: `Attack ${target.name} instead` }));
    const options = [...discards, ...retargets];
    if (!options.length) return true; // neither is possible, so the Attack goes on
    return this.offerChoice({ ...base, playerId: attacker.id, targetPlayerId: owner.id, cardOwnerId: attacker.id, cardZones: ["hand"], attackCardId: context.attackCard?.instanceId ?? null, zone: context.zone ?? null, options });
  }

  /** "Choose one matching Armor or Gear card on the target. It provides 1 less DEF until end of turn." */
  offerEquipmentSuppression(target, effect, base, context) {
    const matches = (card) => card.subtype === "Gear" || (card.subtype === "Defense Equipment" && (!context.zone || coversZone(card, context.zone) || !zones.some((zone) => coversZone(card, zone))));
    const options = target.equipment.filter(matches).map((card) => ({ id: card.instanceId, label: card.name }));
    if (!options.length) return true;
    return this.offerChoice({ ...base, targetPlayerId: target.id, cardOwnerId: target.id, cardZones: ["equipment"], amount: Math.abs(num(effect.amount)) || 1, duration: effect.duration ?? "endOfTurn", options });
  }

  resolveStructuredChoiceKind(pending, selected) {
    const player = this.players[pending.playerId];
    this.pendingChoice = null;
    if (isZoneCall(pending.choiceKind)) {
      this.addStatus(player, { action: pending.choiceKind, value: selected, duration: "endOfRound", sourceId: pending.effectId, sourceCardId: pending.sourceCardId });
      return true;
    }
    if (selected.startsWith("discard:")) return this.discardCard(player, player.hand.find((card) => card.instanceId === selected.slice("discard:".length)));
    if (selected.startsWith("retarget:")) {
      const target = this.players[Number(selected.slice("retarget:".length))]; const card = this.cardByInstance(player.id, pending.attackCardId);
      if (!card || !this.isLegalTarget(player, target)) return false;
      this.withdrawAttackWindows(pending.attackCardId);
      player.targetId = target.id;
      return this.declareAttack(player, target, card, pending.zone, false);
    }
    if (pending.cardZones?.includes("equipment")) {
      const target = this.players[pending.targetPlayerId]; const card = target.equipment.find((candidate) => candidate.instanceId === selected);
      if (!card) return false;
      this.addStatus(target, { action: "equipmentDefenseSuppression", cardId: card.instanceId, amount: pending.amount, duration: pending.duration, sourceId: pending.effectId });
      return true;
    }
    if (selected === "accept") {
      this.draw(player, pending.draw);
      if (pending.discard > 0) this.queueCardChoice(player, player, { id: pending.effectId, sourceCardId: pending.sourceCardId }, "discard", pending.discard);
      return true;
    }
    return selected === "skip";
  }

  getLegalActions(playerId = this.activePlayer) {
    if (this.winner !== null || this.status !== "active") return [];
    if (this.pendingChoice) return [{ type: "resolve-choice", playerId: this.pendingChoice.playerId, choiceId: this.pendingChoice.kind, options: this.pendingChoice.options }];
    if (playerId !== this.activePlayer) return [];
    const player = this.players[playerId];
    if (this.phase === "Honor") return [{ type: "pass", playerId }];
    if (this.phase === "Initiate") return [{ type: "pass", playerId }, ...this.tagActions(player), ...this.equipActions(player), ...player.equipment.filter((card) => !this.equipmentIsExhausted(player, card) && this.equipmentHasManualActivation(card)).map((card) => ({ type: "activate-equipment", playerId, cardId: card.instanceId }))];
    if (this.phase === "Yell") return [...(this.hasStatus(player, "restrictAttack") || !this.legalTargets(player).length ? [] : player.hand.filter((card) => isAttack(card) && this.canPlayCard(player, card)).map((card) => ({ type: "play-attack", playerId, cardId: card.instanceId }))), ...player.hand.filter((card) => this.canPlayYellCard(card) && this.canPlayCard(player, card)).map((card) => ({ type: "play-card", playerId, cardId: card.instanceId })), ...(this.definition.economy.defensePractice.usesPerTurn > 0 && !player.practiceUsed ? player.hand.filter(isDefense).map((card) => ({ type: "practice", playerId, cardId: card.instanceId })) : []), ...this.badHabitActions(player), { type: "pass", playerId }];
    if (this.phase === "Ascend") return [
      ...(player.comboOffered ? [{ type: "decline-combo", playerId }, ...(cost(player.comboOffered) <= player.focus && !player.comboAttemptedThisTurn ? [{ type: "learn-combo", playerId, cardId: player.comboOffered.instanceId }] : [])] : []),
      ...(this.canPromote(player) ? [{ type: "promote", playerId }] : []),
      ...(this.canRecoverTrainingStripe(player) ? [{ type: "recover-training-stripe", playerId }] : []),
      ...this.market.filter((card) => this.purchaseCost(player, card) <= player.focus).map((card) => ({ type: "purchase", playerId, cardId: card.instanceId })),
      ...player.hand.filter((card) => this.consumablePlayableIn(card, "Ascend") && this.canPlayCard(player, card)).map((card) => ({ type: "play-card", playerId, cardId: card.instanceId })),
      { type: "pass", playerId },
    ];
    if (this.phase === "Hide") return [{ type: "hide", playerId }];
    return [];
  }

  cardByInstance(playerId, instanceId) { const player = this.players[playerId]; return [...player.hand, ...player.played, ...player.deck, ...player.discard].find((card) => card.instanceId === instanceId); }

  /**
   * The zones this Attack may be declared in, as { zone, grant, cost, use }: its printed zones
   * first, then zones granted by "may be declared as …" effects (next-Attack grants, statuses, the
   * Attack itself, the attacker's Equipment) and Character abilities. A forced zone ("must use that
   * zone if able") narrows the list when this Attack can use it.
   */
  attackZoneOptions(player, card, { defender = this.opponentOf(player), reversal = false } = {}) {
    const printed = printedZones(card);
    const options = printed.map((zone) => ({ zone, grant: null }));
    const grants = [...this.effectZoneGrants(player, defender, card, { reversal }), ...characterZoneGrants(this, player, card)];
    for (const zone of zones) {
      if (printed.includes(zone)) continue;
      const grant = grants.find((candidate) => candidate.zones.includes(zone));
      if (grant) options.push({ zone, grant: grant.resolver, cost: grant.cost ?? null, use: grant.use ?? null });
    }
    const forced = player.statuses.find((status) => status.action === "forcedAttackZone");
    const narrowed = forced ? options.filter((option) => option.zone === forced.value) : [];
    return narrowed.length ? narrowed : options;
  }

  /** Zone grants from statuses, the Attack's own `chooseZone`/`alternateZone` effects and the attacker's Equipment. */
  effectZoneGrants(player, defender, card, { reversal = false } = {}) {
    const grants = [];
    if (player.nextAttackAnyZone) grants.push({ resolver: "next-attack-any-zone", zones });
    for (const status of player.statuses.filter((entry) => entry.action === "nextAttackZone")) grants.push({ resolver: "next-attack-zone", zones: [status.value] });
    const context = { player, opponent: defender, attackCard: card, isReversal: reversal, declaring: true };
    const sources = [[card, this.cardEffects(card, "onAttackDeclared")], ...player.equipment.map((equipment) => [equipment, this.usableEquipmentEffects(player, equipment, "onAttackDeclared", "own")])];
    for (const [source, effects] of sources) {
      for (const effect of effects.filter((candidate) => effectAction(candidate) === "chooseZone")) {
        const alternate = effectParam(effect, "alternateZone");
        const result = this.evaluateConditions({ ...effect, conditions: (effect.conditions ?? []).filter((condition) => conditionKind(condition) !== "alternateZone") }, { ...context, sourceCard: source });
        if (result.known && result.pass) grants.push({ resolver: String(effect.resolver ?? "chooseZone"), zones: alternate ? [alternate] : zones, use: () => this.markUsedEffect(player, effect) });
      }
    }
    return grants;
  }

  /** Declaring the Attack spends the zone grant it used, first-of-their-kind zone abilities it qualified for, and one-Attack grants and forced zones. */
  commitAttackZone(player, card, option) {
    for (const resolver of ZONE_GRANT_SPENT_ON_ELIGIBLE_ATTACK) if (characterZoneGrants(this, player, card).some((grant) => grant.resolver === resolver)) this.markCharacterUsed(player, resolver);
    if (option.grant && CHARACTER_ABILITIES[option.grant] && !ZONE_GRANT_SPENT_ON_ELIGIBLE_ATTACK.includes(option.grant) && option.grant !== player.anyZoneGrant) this.markCharacterUsed(player, option.grant);
    option.use?.();
    player.nextAttackAnyZone = false; player.anyZoneGrant = null;
    player.statuses = player.statuses.filter((status) => !["nextAttackZone", "forcedAttackZone"].includes(status.action));
    return option.grant;
  }

  beginAttack(playerId, card, action = {}) {
    if (!card) return false;
    const attacker = this.players[playerId];
    if (this.hasStatus(attacker, "restrictAttack")) return false;
    const defenderId = action.targetId ?? this.defaultTargetId(playerId);
    if (defenderId === null || defenderId === undefined || !this.isLegalTarget(attacker, this.players[defenderId])) return false;
    const defender = this.players[defenderId];
    const reversal = Boolean(action.reversal);
    const zoneOptions = this.attackZoneOptions(attacker, card, { defender, reversal });
    this.removeStatus(attacker, "untargetable");
    if (!action.zone && zoneOptions.length > 1) return this.offerChoice({ kind: "attack-zone", playerId, cardId: card.instanceId, targetId: defenderId, ...(reversal ? { reversal: true } : {}), options: zoneOptions.map(({ zone }) => ({ id: zone, label: zone })) });
    const paidOption = action.zoneCostPaid ? { zone: action.zone, grant: "character.discardToChangeDeclaredZone", cost: "discard" } : null;
    // A `zone` must be one this Attack may be declared in (printed or granted).
    const zoneOption = paidOption ?? zoneOptions.find((option) => option.zone === (action.zone ?? zoneOptions[0]?.zone)) ?? (zoneOptions.length ? null : { zone: action.zone ?? card.zone, grant: null });
    if (!zoneOption) return false;
    const zone = zoneOption.zone;
    // "You may discard 1 card to change its zone": the discard is paid before any Defense.
    if (zoneOption.cost === "discard" && !action.zoneCostPaid) {
      const options = attacker.hand.filter((candidate) => candidate !== card).map((candidate) => ({ id: candidate.instanceId, label: candidate.name }));
      if (!options.length) return false;
      return this.offerChoice({ kind: "card-movement", playerId, targetPlayerId: playerId, movement: "discard", amount: 1, sourceZones: ["hand"], sourceCardId: null, effectId: zoneOption.grant, options, then: { cardId: card.instanceId, zone, targetId: defenderId, ...(reversal ? { reversal: true } : {}) } });
    }
    const zoneChangedBy = this.commitAttackZone(attacker, card, zoneOption);
    return this.declareAttack(attacker, defender, card, zone, reversal, { zoneChangedBy });
  }

  // ---- Declaration and the defender's Reaction Window (rules Ch. 8 and Ch. 15) -------------
  isDeclaredAttackCard(card) { return Boolean(card && this.declaredAttack?.cardId === card.instanceId); }

  /** The Attack is declared: the defender's Equipment answers it ("when you are targeted"), then the Reaction Window opens. */
  declareAttack(attacker, defender, card, zone, reversal, strike = {}) {
    defender.turnStats.incomingAttackCount = (defender.turnStats.incomingAttackCount ?? 0) + 1;
    this.declaredAttack = { playerId: attacker.id, cardId: card.instanceId };
    const reactionsSuppressed = this.hasStatus(defender, "restrictReaction");
    if (reactionsSuppressed) this.removeStatus(defender, "restrictReaction");
    const window = { playerId: defender.id, attackerId: attacker.id, cardId: card.instanceId, zone, ...(reversal ? { reversal: true } : {}), strike, declared: true, reactionsSuppressed, reactionPrevention: 0, reactionAttackModifier: 0, reactionDefense: 0 };
    const answer = this.applyEquipmentTrigger(defender, "onAttackDeclared", { ...this.incomingAttackContext(window), manualActivation: false }, { side: "incoming" });
    this.addWindowAnswer(window, answer);
    // "After an opponent declares an Attack targeting you, you may lose 1 Speed ... That Attack gets -1."
    if (this.characterAbilityAvailable(defender, "character.incomingAttackSlowChoice")) return this.offerChoice({ kind: "incoming-attack-choice", playerId: defender.id, targetPlayerId: attacker.id, effectId: "character.incomingAttackSlowChoice", options: [{ id: "accept", label: "Lose 1 Speed this round; that Attack gets -1" }, { id: "skip", label: "Keep Speed" }], then: window });
    return this.offerChoice(this.attackWindowFor(window));
  }

  /** Effect context for the defender answering a declared Attack. */
  incomingAttackContext(window) {
    const attacker = this.players[window.attackerId];
    return { opponent: attacker, attackCard: this.cardByInstance(window.attackerId, window.cardId), zone: window.zone, isReversal: Boolean(window.reversal), incomingAttackTargetsSelf: true, defenseOutsideTurn: window.playerId !== this.activePlayer, incomingAttackNumber: window.reversal ? 0 : attacker.attackCount + 1 };
  }

  addWindowAnswer(window, answer) {
    window.reactionPrevention += answer.damagePrevention ?? 0;
    window.reactionAttackModifier += answer.opponentAttackPowerModifier ?? 0;
    window.reactionDefense += (answer.defenseModifier ?? 0) + (answer.guardModifier ?? 0);
  }

  /** The window's carried facts without its options (so a rebuilt window keeps what earlier Reactions added). */
  windowFields(window) {
    const { kind, options, defenseOptions, ...fields } = window;
    return fields;
  }

  attackStillDeclared(window) {
    const attacker = this.players[window.attackerId]; const defender = this.players[window.playerId];
    const card = this.cardByInstance(window.attackerId, window.cardId);
    return Boolean(card && attacker.hand.includes(card) && !defender.eliminated && defender.hp > 0 && attacker.hp > 0);
  }

  /** The Reaction Window, or straight to the Defense choice when the defender has nothing to react with. */
  attackWindowFor(window) {
    if (!this.attackStillDeclared(window)) { this.declaredAttack = null; return null; }
    const defender = this.players[window.playerId];
    const reactions = this.reactionOptions(defender, window);
    if (!reactions.length) return this.defenseChoiceFor(window);
    return { ...this.windowFields(window), kind: "reaction", options: [{ id: "pass", label: "Do not play a Reaction" }, ...reactions], defenseOptions: this.defenseOptions(defender, window) };
  }

  defenseChoiceFor(window) {
    if (!this.attackStillDeclared(window)) { this.declaredAttack = null; return null; }
    return { ...this.windowFields(window), kind: "defense", options: [{ id: "pass", label: "Take the hit" }, ...this.defenseOptions(this.players[window.playerId], window)] };
  }

  /** One Defense card covering the zone; a Reaction Item that is played "as a Defense card" counts as one. */
  defenseOptions(defender, window) {
    const reactionDefense = (card) => !window.reactionsSuppressed && card.subtype === "Reaction Item" && this.cardEffects(card, "onDefenseDeclared").length > 0;
    // "Your next Defense may defend that zone in addition to its printed zones."
    const extraZone = defender.statuses.find((status) => status.action === "extraDefenseZone")?.value;
    return defender.hand.filter((card) => (isDefense(card) || reactionDefense(card)) && (coversZone(card, window.zone) || extraZone === window.zone)).map((card) => ({ id: card.instanceId, label: card.name }));
  }

  /** Reaction Items whose declaration trigger applies, Consumables whose timing allows it, and Equipment the defender may exhaust in answer. */
  reactionOptions(defender, window) {
    if (window.reactionsSuppressed) return [];
    const context = { player: defender, ...this.incomingAttackContext(window) };
    const applies = (card, effects, extra = {}) => effects.some((effect) => { const result = this.evaluateConditions(effect, { ...context, ...extra, sourceCard: card }); return result.known && result.pass; });
    const cards = defender.hand.filter((card) => this.canPlayCard(defender, card) && (card.subtype === "Reaction Item" ? applies(card, this.cardEffects(card, "onAttackDeclared")) : this.consumableAnswersAttack(card)));
    const equipment = defender.equipment.filter((card) => !this.equipmentIsExhausted(defender, card) && applies(card, this.manualIncomingEffects(card), { manualActivation: true }));
    return [...cards.map((card) => ({ id: card.instanceId, label: card.name })), ...equipment.map((card) => ({ id: `activate:${card.instanceId}`, label: `Use ${card.name}` }))];
  }

  /** "Exhaust: after an opponent declares an Attack targeting you, …" (manual activations answering an Attack). */
  manualIncomingEffects(card) {
    return this.cardEffects(card, "onAttackDeclared").filter((effect) => answersIncomingAttack(effect) && (effect.conditions ?? []).some((condition) => conditionKind(condition) === "manualActivation"));
  }

  resolveReactionChoice(pending, selected) {
    if (pending.window === "after-block") return this.resolveBlockReactionChoice(pending, selected);
    const window = this.windowFields(pending);
    const attacker = this.players[pending.attackerId]; const defender = this.players[pending.playerId];
    const attackCard = this.cardByInstance(pending.attackerId, pending.cardId);
    if (!attackCard) return false;
    this.pendingChoice = null;
    if (selected === "pass") return this.offerChoice(this.defenseChoiceFor(window)) || true;
    const context = this.incomingAttackContext(window);
    const equipment = selected.startsWith("activate:") ? defender.equipment.find((card) => card.instanceId === selected.slice("activate:".length)) : null;
    const card = equipment ? null : defender.hand.find((candidate) => candidate.instanceId === selected);
    if (!equipment && !card) return false;
    let answer;
    if (equipment) answer = this.activateEquipmentAgainst(defender, equipment, context);
    else if (card.subtype === "Reaction Item") {
      answer = this.playReactionItem(defender, card, "onAttackDeclared", context);
      this.addWindowAnswer(window, this.applyEquipmentWatchers(defender, "equipment.structured", { opponent: attacker, attackCard, reactionPlayedAgainstSelf: true, scheduledTiming: "exchangeEnd" }));
    } else answer = this.resolvePlayedCard(defender, card, { context }) ?? {};
    this.addWindowAnswer(window, answer);
    this.emit({ type: "reaction", player: defender.id, attacker: attacker.id, card: (equipment ?? card).catalogId, activated: Boolean(equipment) });
    // "You cannot be targeted": an Attack whose target became untargetable is spent without dealing damage.
    if (!this.isLegalTarget(attacker, defender)) return this.spendStrike(attacker, defender, attackCard, window);
    // The window stays open until the defender passes (rules: The Reaction Window).
    this.offerChoice(this.attackWindowFor(window));
    return true;
  }

  /** A Reaction Item is played outside its owner's turn: no printed Focus; it resolves, then leaves play as printed. */
  playReactionItem(player, card, trigger, context) {
    remove(player.hand, card); player.played.push(card); player.plays += 1;
    this.track(card, "played", player);
    const result = this.applyCardEffects(player, card, trigger, context);
    this.finishOneUseCard(player, card);
    return result;
  }

  /** Pay the exhaust cost and make the call now; with a zone call, the payoff waits for the Attack to use that zone. */
  activateEquipmentAgainst(player, equipment, context) {
    const effects = this.manualIncomingEffects(equipment);
    const callsZone = effects.some((effect) => isZoneCall(effectParam(effect, "choiceKind")));
    const now = callsZone ? effects.filter((effect) => isExhaustCost(effect) || effectParam(effect, "choiceKind")) : effects;
    return this.applyCardEffects(player, equipment, "onAttackDeclared", { ...context, manualActivation: true, sourceCard: equipment, effectOverride: now });
  }

  /** Zone calls the defender armed against this Attack: the called card's payoff applies when the Attack uses the called zone. */
  resolveIncomingZoneCalls(defender, attacker, card, zone, reversal) {
    const calls = defender.statuses.filter((status) => status.action === "incoming-zone");
    defender.statuses = defender.statuses.filter((status) => status.action !== "incoming-zone");
    const result = { opponentAttackPowerModifier: 0, damagePrevention: 0, defenseModifier: 0 };
    for (const call of calls.filter((entry) => entry.value === zone)) {
      const equipment = defender.equipment.find((candidate) => candidate.instanceId === call.sourceCardId);
      if (!equipment) continue;
      const payoffs = this.manualIncomingEffects(equipment).filter((effect) => !isExhaustCost(effect) && !effectParam(effect, "choiceKind"));
      const answer = this.applyCardEffects(defender, equipment, "onAttackDeclared", { opponent: attacker, attackCard: card, zone, isReversal: reversal, incomingAttackTargetsSelf: true, manualActivation: true, sourceCard: equipment, effectOverride: payoffs });
      for (const key of Object.keys(result)) result[key] += answer[key] ?? 0;
    }
    return result;
  }

  armedZoneCall(player, card) { return card && player ? player.statuses.find((status) => isZoneCall(status.action) && status.sourceCardId === card.instanceId) ?? null : null; }

  /** The strike is spent without dealing damage: the Attack card was played, so it leaves the hand. */
  spendStrike(attacker, defender, card, window) {
    this.declaredAttack = null;
    remove(attacker.hand, card); attacker.played.push(card); attacker.plays += 1;
    if (!window.reversal) { this.gainPrintedFocus(attacker, card); attacker.attackCount += 1; attacker.turnStats.attacked = true; }
    this.track(card, "played", attacker);
    this.emit({ type: "attack-spent", attacker: attacker.id, defender: defender.id, card: card.catalogId, zone: window.zone ?? null, reason: "untargetable" });
    return true;
  }

  /** "After you Block an Attack": Reaction Items that answer the Block, offered before the Reversal window. */
  offerBlockReactions(defender, attacker, queued) {
    const context = { player: defender, opponent: attacker, blockedAttackerId: attacker.id, zone: queued.zone, defensePlayed: true, isReversal: false };
    const options = defender.hand.filter((card) => card.subtype === "Reaction Item" && this.canPlayCard(defender, card) && this.cardEffects(card, "onBlock").some((effect) => { const result = this.evaluateConditions(effect, { ...context, sourceCard: card }); return result.known && result.pass; }));
    if (!options.length) return false;
    return this.offerChoice({ kind: "reaction", window: "after-block", playerId: defender.id, attackerId: attacker.id, zone: queued.zone, options: [{ id: "pass", label: "Do not play a Reaction" }, ...options.map((card) => ({ id: card.instanceId, label: card.name }))] });
  }

  resolveBlockReactionChoice(pending, selected) {
    const defender = this.players[pending.playerId]; const attacker = this.players[pending.attackerId];
    const card = selected === "pass" ? null : defender.hand.find((candidate) => candidate.instanceId === selected);
    if (selected !== "pass" && !card) return false;
    this.pendingChoice = null;
    if (card) {
      this.playReactionItem(defender, card, "onBlock", { opponent: attacker, blockedAttackerId: attacker.id, zone: pending.zone, defensePlayed: true });
      this.emit({ type: "reaction", player: defender.id, attacker: attacker.id, card: card.catalogId, window: "after-block" });
    }
    return true;
  }


  resolveChoice(choice) {
    const resolved = this.resolveChoiceInner(choice);
    if (resolved && !this.legacyQuickDuel && this.winner === null) this.checkWinner();
    if (resolved) { this.presentQueuedChoice(); this.openQueuedReversal(); }
    return resolved;
  }

  resolveChoiceInner(choice) {
    if (!this.pendingChoice) return false;
    const pending = this.pendingChoice; const selected = choice?.optionId ?? choice?.id ?? choice; if (!pending.options.some((option) => option.id === selected)) return false;
    this.telemetry.choicesResolved += 1; this.lastPresentedChoice = null;
    if (pending.kind === "card-movement") return this.resolveCardMovementChoice(pending, selected);
    if (pending.kind === "zone-choice") return this.resolveZoneChoice(pending, selected);
    if (pending.kind === "hit-choice") return this.resolveHitChoice(pending, selected);
    if (pending.kind === "reversal") return this.resolveReversalChoice(pending, selected);
    if (pending.kind === "structured" && pending.characterAbility) return this.resolveCharacterChoice(pending, selected);
    if (pending.kind === "structured") {
      const player = this.players[pending.playerId];
      if (selected === "nextAttackPower:+1") player.nextAttackPower += 1;
      else if (selected === "nextDefenseGuard:+1") this.addStatus(player, { action: "modifyGuard", amount: 1, duration: "nextDefense", sourceId: pending.effectId });
      else if (pending.resolver === "character.noWeaponOffenseDefenseChoice") {
        if (selected === "attack") player.nextAttackPower += 1;
        else if (selected === "defense") this.addStatus(player, { action: "modifyGuard", amount: 1, duration: "nextDefense", sourceId: pending.effectId });
        else return false;
      } else if (["character.discardToChangeDeclaredZone", "kata.zoneOverride"].includes(pending.resolver)) {
        if (!zones.includes(selected)) return false;
        this.addStatus(player, { action: "nextAttackZone", value: selected, duration: "endOfTurn", sourceId: pending.effectId });
      } else if (pending.resolver === "defense.forceNextAttackZone") {
        // "The attacker's next Attack this round must use that zone if able" (read by attackZoneOptions).
        if (!zones.includes(selected)) return false;
        this.addStatus(this.players[pending.targetPlayerId], { action: "forcedAttackZone", value: selected, duration: "endOfRound", sourceId: pending.effectId });
      } else if (pending.resolver === "defense.blockChoice") {
        if (selected === "counter") player.nextAttackPower += 1;
        else if (selected === "discount") this.addStatus(player, { action: "modifyCost", amount: -1, duration: "nextPurchase", sourceId: pending.effectId });
        else return false;
      } else if (pending.resolver === "character.revealReplacementOnceGame") {
        if (!(selected === "accept" || selected === "skip")) return false;
        if (selected === "accept") this.addStatus(player, { action: "replacementAccepted", duration: "game", sourceId: pending.effectId });
      } else if (pending.resolver === "character.comboRevealChoice") {
        if (selected !== "skip") this.addStatus(player, { action: "comboRevealChoice", value: selected, duration: "turn", sourceId: pending.effectId });
      } else if (pending.choiceKind) return this.resolveStructuredChoiceKind(pending, selected);
      else return false;
      this.pendingChoice = null;
      return true;
    }
    if (pending.kind === "incoming-attack-choice") {
      const player = this.players[pending.playerId];
      this.pendingChoice = null;
      // The declared Attack's window follows, rebuilt for the table as it now stands.
      if (pending.then) this.offerChoice(this.refreshChoice({ ...pending.then, kind: "reaction" }));
      if (selected !== "accept") return true;
      player.turnStats.reducedIncomingAttack = true;
      if (!pending.then) { player.tempSpeed -= 1; return true; }
      // "Lose 1 Speed until end of round. That Attack gets -1 Attack Power."
      const attacker = this.players[pending.targetPlayerId];
      this.markCharacterUsed(player, pending.effectId);
      this.addStatus(attacker, { action: "modifyAttackPower", amount: -1, duration: "nextAttack", targetId: player.id, mark: `reducedBy:${player.id}` });
      this.changeSpeed(player, -1, "endOfRound");
      this.characterEvent(attacker, "cardModified", { modifiedCardType: "Attack" });
      return true;
    }
    if (pending.kind === "equipment-toggle") {
      const player = this.players[pending.playerId]; const card = player.equipment.find((candidate) => candidate.instanceId === selected);
      if (!card) return false;
      this.setEquipmentReady(player, card, false); this.setEquipmentReady(player, card, true); player.turnStats.rebootedEquipment = true; this.pendingChoice = null;
      return true;
    }
    if (pending.kind === "discard-or-destroy") {
      const player = this.players[pending.playerId]; const card = player.discard.find((candidate) => candidate.instanceId === pending.cardId);
      if (!card) return false;
      this.pendingChoice = null;
      if (selected === "destroy") { this.destroyCard(player, card); this.characterEvent(player, "junkDestroyed", { card }); }
      return true;
    }
    if (pending.kind === "cycle-discard-draw") {
      const player = this.players[pending.playerId];
      if (selected !== "skip") {
        const card = player.hand.find((candidate) => candidate.instanceId === selected);
        if (!card) return false;
        if (pending.revealSelected) this.emit({ type: "card-revealed", player: player.id, card: card.catalogId });
        this.discardCard(player, card); this.draw(player, pending.drawAmount);
        if (pending.postDrawDiscard) {
          this.pendingChoice = { kind: "card-movement", playerId: player.id, targetPlayerId: player.id, movement: "discard", amount: 1, sourceCardId: pending.sourceCardId, effectId: pending.effectId, options: player.hand.map((candidate) => ({ id: candidate.instanceId, label: candidate.name })) };
          return true;
        }
      }
      this.pendingChoice = null; return true;
    }
    if (pending.kind === "deck-look") {
      const player = this.players[pending.playerId];
      const looked = pending.lookedCardIds.map((id) => player.deck.find((card) => card.instanceId === id)).filter(Boolean);
      for (const card of looked) remove(player.deck, card);
      const chosen = selected === "skip" ? null : looked.find((card) => card.instanceId === selected);
      if (chosen) player.hand.push(chosen);
      const rest = looked.filter((card) => card !== chosen);
      if (pending.restAction === "discard") player.discard.push(...rest); else player.deck.push(...(pending.restAction === "shuffle" ? this.rng.shuffle(rest) : rest));
      const foundEligible = Boolean(chosen);
      const discardedRequestedType = pending.discardFocusCardType && rest.some((card) => [card.cardType, card.subtype, card.category].includes(pending.discardFocusCardType));
      if ((!foundEligible && pending.focusIfNoMatch) || (pending.focusIfDifferentTypes && new Set(looked.map(cardType)).size >= 2) || (discardedRequestedType && pending.discardFocusCardType)) {
        const amount = discardedRequestedType ? 1 : (pending.focusIfNoMatch || pending.focusIfDifferentTypes);
        player.focus += amount; player.turnStats.focusGenerated += amount; this.telemetry.focusGenerated += amount;
      }
      this.pendingChoice = null; return true;
    }
    if (pending.kind === "reaction") return this.resolveReactionChoice(pending, selected);
    if (pending.kind === "attack-zone") { const card = this.cardByInstance(pending.playerId, pending.cardId); this.pendingChoice = null; return this.beginAttack(pending.playerId, card, { zone: selected, targetId: pending.targetId, reversal: Boolean(pending.reversal) }); }
    const attacker = this.players[pending.attackerId]; const defender = this.players[pending.playerId]; const card = this.cardByInstance(pending.attackerId, pending.cardId); const defense = selected === "pass" ? null : defender.hand.find((candidate) => candidate.instanceId === selected); this.pendingChoice = null; return Boolean(this.resolveAttack(attacker, defender, card, { defenseCard: defense, zone: pending.zone, reactionPrevention: pending.reactionPrevention ?? 0, reactionAttackModifier: pending.reactionAttackModifier ?? 0, reactionDefense: pending.reactionDefense ?? 0, reversal: Boolean(pending.reversal), declared: Boolean(pending.declared), openWindows: true, strike: pending.strike ?? {} }));
  }

  applyAction(action) {
    const applied = this.applyActionInner(action);
    if (applied && !this.legacyQuickDuel && this.winner === null) this.checkWinner();
    if (applied) { this.presentQueuedChoice(); this.openQueuedReversal(); }
    return applied;
  }

  applyActionInner(action) {
    if (!action || this.winner !== null || this.status !== "active") return false;
    if (this.pendingChoice) return action.type === "resolve-choice" && this.resolveChoice(action.choice ?? action.optionId);
    if (action.playerId !== undefined && action.playerId !== this.activePlayer) return false;
    const player = this.players[this.activePlayer];
    if (action.type === "pass") { if (this.phase === "Honor") this.phase = "Initiate"; else if (this.phase === "Initiate") { this.beginComboTurn(player); for (const card of player.equipment) this.applyCardEffects(player, card, "onInitiate", { opponent: this.opponentOf(player) }); this.phase = "Yell"; this.characterEvent(player, "initiate", {}); } else if (this.phase === "Yell") { this.beginAscend(player); this.phase = "Ascend"; } else if (this.phase === "Ascend") { if (player.marketPurchasesThisAscend === 0) this.recordMarketDecision(player); this.returnComboOffer(player); player.trainingStripes.provisional = false; for (const card of player.equipment) this.applyCardEffects(player, card, "passive", { opponent: this.opponentOf(player), sourceCard: card, ascendCompleted: true }); this.phase = "Hide"; } else if (this.phase === "Hide") { this.hide(player); this.finishTurn(); } return true; }
    if (action.type === "hide" && this.phase === "Hide") { this.hide(player); this.finishTurn(); return true; }
    if (action.type === "tag" && this.phase === "Initiate") return this.tag(player, action.fighterIndex);
    if (action.type === "bad-habit-focus" && this.phase === "Yell") return this.cashBadHabit(player);
    if (action.type === "practice" && this.phase === "Yell") return this.practice(player, player.hand.find((card) => card.instanceId === action.cardId));
    if (action.type === "activate-equipment" && this.phase === "Initiate") return this.activateEquipment(player, player.equipment.find((card) => card.instanceId === action.cardId));
    if (action.type === "play-card" && this.phase === "Ascend") { const card = player.hand.find((candidate) => candidate.instanceId === action.cardId); return this.consumablePlayableIn(card, "Ascend") && this.playCard(player, card); }
    if (action.type === "play-card" && this.phase === "Yell") { const card = player.hand.find((candidate) => candidate.instanceId === action.cardId); return this.canPlayYellCard(card) && this.playCard(player, card); }
    if (action.type === "play-card" && this.phase === "Initiate") { const card = player.hand.find((candidate) => candidate.instanceId === action.cardId); if (player.noEquipThisTurn) return false; const equipped = PERMANENT_EQUIPMENT.includes(card?.subtype) && this.playCard(player, card, { replaceCardIds: action.replaceCardIds }); if (equipped) player.equippedThisInitiate = true; return equipped; }
    if (action.type === "play-attack" && this.phase === "Yell") return this.beginAttack(this.activePlayer, player.hand.find((card) => card.instanceId === action.cardId), action);
    if (action.type === "learn-combo" && this.phase === "Ascend" && action.cardId === player.comboOffered?.instanceId) return this.learnCombo(player);
    if (action.type === "decline-combo" && this.phase === "Ascend") { player.comboAttemptedThisTurn = true; return this.returnComboOffer(player); }
    if (action.type === "promote" && this.phase === "Ascend") return this.promote(player);
    if (action.type === "recover-training-stripe" && this.phase === "Ascend") return this.recoverTrainingStripe(player);
    if (action.type === "purchase" && this.phase === "Ascend") return this.buy(player, this.market.find((card) => card.instanceId === action.cardId));
    return false;
  }

  advanceAutomaticEvents() {
    if (this.winner !== null || this.pendingChoice || this.phase !== "Honor") return false;
    this.sceneChangedThisRound = false;
    this.revealLocation();
    for (const player of this.players) { if (player.hp > 0) this.gainXp(player, this.definition.progression.xpPerHonor, "honor"); player.effectUsage.turn = {}; player.tempo = this.tableOptions.tempo; player.practiceUsed = false; player.attackCount = 0; player.comboTriggeredRound = []; player.honorStats = { attacked: false, blocked: false }; this.startRoundStatuses(player); player.turnStats = { zones: new Set(), attacked: false, hit: false, blocked: false, damageTaken: 0, hitCount: 0, defenseCount: 0, incomingAttackCount: 0, kataCount: 0, focusGenerated: 0, playedDefenseSinceLastTurn: false, previousAttackHit: false, previousAttackBlocked: false, previousCardType: null, previousAttackTags: [], previousOpponentId: null, previousZone: null, flowDrawUsed: false, boughtCardThisTurn: false, boughtCardThisAscend: false, usedConsumableThisRound: false, consumableCount: 0, completedBeltExamThisRound: false, playsThisTurn: 0, attacksThisTurn: 0, beltCheckActionUsed: false }; }
    const living = this.players.filter((player) => player.hp > 0).sort((left, right) => this.currentSpeed(right) - this.currentSpeed(left) || this.seatTiebreak(left) - this.seatTiebreak(right)); this.turnOrder = living.map((player) => player.id); this.turnOrderPosition = 0; if (this.equipmentReadyMoment() === "honor") for (const player of this.players) this.readyExhaustedEquipment(player); if (this.turnOrder.length) { this.activePlayer = this.turnOrder[0]; this.startTurn(this.players[this.activePlayer]); } this.phase = "Initiate"; this.emit({ type: "honor", players: this.players.map((player) => ({ id: player.id, xp: player.xp })), turnOrder: [...this.turnOrder] }); this.presentQueuedChoice(); return true;
  }

  clearCharacterMarks(player, prefix) { for (const key of Object.keys(player.characterMarks ?? {})) if (key.startsWith(prefix)) delete player.characterMarks[key]; }

  // "This turn" ends for everyone when the active player's turn ends.
  finishTurn() { this.turns += 1; for (const player of this.players) { this.expireStatuses(player, "endOfTurn"); this.clearCharacterMarks(player, "turn:"); } this.players[this.activePlayer].effectUsage.turn = {}; let nextPosition = this.turnOrderPosition + 1; while (nextPosition < this.turnOrder.length && this.players[this.turnOrder[nextPosition]].eliminated) nextPosition += 1; if (nextPosition < this.turnOrder.length) { this.turnOrderPosition = nextPosition; this.activePlayer = this.turnOrder[nextPosition]; this.startTurn(this.players[this.activePlayer]); this.phase = "Initiate"; } else { const completedRound = this.round; this.round = Math.min(this.round + 1, this.mode.maxRounds); this.roundLimitReached = completedRound >= this.mode.maxRounds; this.referee = (this.referee + 1) % this.playerCount; this.turnOrderPosition = 0; for (const player of this.players) { player.effectUsage.round = {}; player.reversalUsedThisRound = false; this.expireStatuses(player, "endOfRound"); this.clearCharacterMarks(player, "round:"); } if (this.marketRefreshesAtRoundEnd()) this.refillMarket(true); this.marketPurchasedThisRound = false; this.phase = "Honor"; } this.checkWinner(); }

  hide(player) { player.targetId = null; player.taggedThisTurn = false; player.equippedThisInitiate = false; player.noEquipThisTurn = false; const incomingDamage = player.turnStats.damageTaken ?? 0; const benchedGear = this.benchedEquipment(player); for (const card of new Set([...player.played, ...player.equipment])) if (!benchedGear.has(card)) this.applyCardEffects(player, card, "onHide", { opponent: this.opponentOf(player), incomingDamage }); player.lastTurnWasHit = false; player.dealtCombatDamageLastTurn = Boolean(player.turnStats.dealtCombatDamageThisTurn); player.anyZoneGrant = null; player.nextAttackAnyZone = false; player.lastTurnAttacked = Boolean(player.turnStats.attacked); player.lastTurnWasBlocked = Boolean(player.turnStats.blocked); player.discard.push(...player.hand, ...player.played.filter((card) => !player.equipment.includes(card) && !this.benchedEquipment(player).has(card))); player.hand = []; player.played = [...player.equipment, ...this.benchedEquipment(player)]; player.focus = 0; player.badHabitFocusUsed = false; player.practiceUsed = false; player.nextAttackPower = 0; player.tempSpeed = 0; this.expireStatuses(player, "endOfTurn"); this.resolveDelayedDamage(player); this.closeComboTurn(player); this.draw(player, this.definition.turn.handSize + this.beltRewardAmount(player, "hand-size")); this.emit({ type: "hide", player: player.id, handSize: player.hand.length }); }

  checkWinner() { if (!this.legacyQuickDuel) return this.checkModeWinner(); const alive = this.players.filter((player) => player.hp > 0); if (alive.length === 1) { this.winner = alive[0].id; this.reason = "knockout"; const winner = alive[0]; if (winner.beltIndex >= 7) { winner.examProgress.koWhileBrown = true; this.checkBeltExam(winner); } } else if (this.roundLimitReached) { this.winner = this.players[0].hp === this.players[1].hp ? this.rng.pick([0, 1]) : this.players[0].hp > this.players[1].hp ? 0 : 1; this.reason = "round-limit"; } if (this.winner !== null) { this.status = "complete"; this.clearChoices(); this.lastPresentedChoice = null; } return this.winner !== null; }

  defaultAction(legal) {
    const player = this.players[this.activePlayer];
    if (this.phase === "Initiate") { const tag = this.chooseTagAction(player, legal); if (tag) return tag; }
    if (this.phase === "Yell") { const setup = this.comboSetupCard(player); const setupAction = setup && legal.find((action) => action.type === "play-card" && action.cardId === setup.instanceId); if (setupAction) return setupAction; const attack = chooseAttack(player.hand, player.strategy); const attackAction = attack && legal.find((action) => action.type === "play-attack" && action.cardId === attack.instanceId); if (attackAction) return attackAction; const practice = choosePractice(player.hand, player.strategy); const practiceAction = practice && legal.find((action) => action.type === "practice" && action.cardId === practice.instanceId); if (practiceAction && !player.practiceUsed) return practiceAction; const cardAction = legal.find((action) => action.type === "play-card"); if (cardAction) return cardAction; }
    if (this.phase === "Ascend") { const promotion = legal.find((action) => action.type === "promote"); if (promotion) return promotion; const learn = legal.find((action) => action.type === "learn-combo"); if (learn) return learn; const purchase = choosePurchase(this.market, player.focus, player.strategy); const purchaseAction = purchase && legal.find((action) => action.type === "purchase" && action.cardId === purchase.instanceId); if (purchaseAction) return purchaseAction; const recover = legal.find((action) => action.type === "recover-training-stripe"); if (recover) return recover; const decline = legal.find((action) => action.type === "decline-combo"); if (decline) return decline; }
    return legal.find((action) => action.type === "pass" || action.type === "hide") ?? legal[0];
  }

  defaultChoice() {
    if (["attack-zone", "card-movement", "cycle-discard-draw", "deck-look", "zone-choice", "hit-choice", "incoming-attack-choice", "equipment-toggle", "discard-or-destroy"].includes(this.pendingChoice?.kind)) return { optionId: this.pendingChoice.options[0].id };
    if (this.pendingChoice?.kind === "reaction") return { optionId: "pass" };
    if (this.pendingChoice?.kind === "structured") return { optionId: this.pendingChoice.options[0].id };
    if (this.pendingChoice?.kind === "reversal") return this.defaultReversalChoice();
    const defender = this.players[this.pendingChoice.playerId]; const offered = new Set(this.pendingChoice.options.map((option) => option.id)); const defense = chooseDefense(defender.hand.filter((card) => offered.has(card.instanceId))); return { optionId: defense?.instanceId ?? "pass" };
  }

  // Bots take every Reversal they are offered with their best Attack: it costs no Focus and the
  // card would otherwise wait in hand. Deterministic: the same strategy scoring as normal attacks.
  defaultReversalChoice() {
    const player = this.players[this.pendingChoice.playerId]; const offered = new Set(this.pendingChoice.options.map((option) => option.id));
    const attack = chooseAttack(player.hand.filter((card) => offered.has(card.instanceId)), player.strategy);
    return { optionId: attack?.instanceId ?? "pass" };
  }

  assertInvariants(step) {
    const failures = this.checkInvariants();
    if (!failures.length) return;
    this.invariantFailure = { step, round: this.round, phase: this.phase, activePlayer: this.activePlayer, failures, state: this.getState(), decisions: this.decisions.slice(-50), events: this.events.slice(-50) };
    throw new Error(`Invariant failure at seed ${this.seed}: ${failures.join("; ")}`);
  }

  run({ policy = null, maxSteps = 100000 } = {}) {
    const controller = policy ?? { chooseAction: (game, legal) => game.defaultAction(legal), chooseChoice: (game) => game.defaultChoice() }; let steps = 0;
    while (this.winner === null && steps < maxSteps) { steps += 1; this.advanceAutomaticEvents(); this.assertInvariants(steps); if (this.pendingChoice) { const pending = this.getPendingChoice(); if (this.lastPresentedChoice !== this.pendingChoice) { this.telemetry.choicesPresented += 1; this.lastPresentedChoice = this.pendingChoice; } const choice = controller.chooseChoice ? controller.chooseChoice(this, pending) : this.defaultChoice(); this.decisions.push({ step: steps, kind: "choice", pendingKind: pending.kind, choice: structuredClone(choice) }); if (!this.resolveChoice(choice)) throw new Error(`Policy selected illegal choice at seed ${this.seed}`); this.assertInvariants(steps); continue; } const legal = this.getLegalActions(); if (!legal.length) throw new Error(`No legal actions in ${this.phase} for player ${this.activePlayer}`); const action = controller.chooseAction ? controller.chooseAction(this, legal) : this.defaultAction(legal); this.decisions.push({ step: steps, kind: "action", phase: this.phase, action: structuredClone(action) }); if (!this.applyAction(action)) throw new Error(`Policy selected illegal action at seed ${this.seed}: ${JSON.stringify(action)}`); this.assertInvariants(steps); }
    if (this.winner === null) throw new Error(`Game exceeded ${maxSteps} steps at seed ${this.seed}`);
    const winnerFamilies = new Set();
    for (const player of this.players) for (const id of player._used ?? []) if (player.id === this.winner && this.cardStats.has(id)) { const stats = this.cardStats.get(id); stats.winnerOwned += 1; winnerFamilies.add(stats.family); }
    for (const family of winnerFamilies) this.telemetry.families[family].winnerGames += 1;
    return this.result();
  }

  botTurn(index) {
    const player = this.players[index]; let defender = this.opponentOf(player); player.tempo = this.tableOptions.tempo; this.practice(player, choosePractice(player.hand, player.strategy)); this.cashBadHabit(player); let attackNumber = 0;
    while (defender && defender.hp > 0 && !defender.eliminated) { const attack = chooseAttack(player.hand, player.strategy); if (!attack) break; this.resolveAttack(player, defender, attack, { useTempo: attackNumber === 0 }); attackNumber += 1; }
    for (const card of [...player.hand]) if (["Kata", "Consumable", "Gear", "Weapon", "Defense Equipment"].includes(card.subtype)) this.playCard(player, card);
    while (true) { const purchase = choosePurchase(this.market, player.focus, player.strategy); if (!purchase || !this.buy(player, purchase)) break; }
    this.emit({ type: "turn-snapshot", player: player.id, xp: player.xp, focus: player.focus, hp: player.hp, purchases: player.purchases }); this.hide(player); this.turns += 1; this.checkWinner();
  }

  checkInvariants() {
    const failures = []; if (!Number.isInteger(this.round) || this.round < 1) failures.push("round must be a positive integer"); if (!Number.isInteger(this.activePlayer) || !this.players[this.activePlayer]) failures.push("activePlayer must identify a player"); if (!Array.isArray(this.turnOrder) || !this.turnOrder.length) failures.push("turnOrder must contain at least one player"); if (!Number.isInteger(this.turnOrderPosition) || this.turnOrderPosition < 0 || this.turnOrderPosition >= Math.max(1, this.turnOrder.length)) failures.push("turnOrderPosition must identify a turn in the initiative order"); if (this.turnOrder?.[this.turnOrderPosition] !== this.activePlayer && this.phase !== "Honor") failures.push("activePlayer must match the locked initiative order"); if (new Set(this.turnOrder ?? []).size !== (this.turnOrder ?? []).length) failures.push("turnOrder must not contain duplicate players"); if ((this.turnOrder ?? []).some((id) => !this.players[id])) failures.push("turnOrder must contain valid players"); if (!this.definition.turn.phases.includes(this.phase)) failures.push(`unknown phase ${this.phase}`);
    const seen = new Map();
    const visit = (location, cards) => { for (const card of cards ?? []) { if (!card?.instanceId) failures.push(`${location} contains a card without instanceId`); else if (seen.has(card.instanceId)) failures.push(`${location} duplicates ${card.instanceId}; already in ${seen.get(card.instanceId)}`); else seen.set(card.instanceId, location); } };
    visit("market", this.market); visit("marketDeck", this.marketDeck); visit("marketDiscard", this.marketDiscard); visit("comboDeck", this.comboDeck); visit("comboDiscard", this.comboDiscard); visit("locationDeck", this.locationDeck); visit("locationDiscard", this.locationDiscard); visit("currentLocation", this.currentLocation ? [this.currentLocation] : []);
    for (const player of this.players) { if (!["hp", "maxHp", "focus", "xp"].every((key) => Number.isFinite(player[key]))) failures.push(`${player.name} has a non-finite resource`); if (player.hp < 0) failures.push(`${player.name} has negative HP`); if (player.hp > player.maxHp) failures.push(`${player.name} exceeds max HP`); if (player.maxHp < 1) failures.push(`${player.name} has invalid max HP`); if (player.focus < 0) failures.push(`${player.name} has negative Focus`); if (player.xp < 0) failures.push(`${player.name} has negative XP`); if (player.beltIndex < 0 || player.beltIndex >= this.definition.progression.belts.length) failures.push(`${player.name} has invalid belt index`); for (const zone of ["deck", "hand", "discard", "destroyed", "box", "played", "leftGame"]) visit(`${player.name}.${zone}`, player[zone]); visit(`${player.name}.learnedCombos`, player.learnedCombos); visit(`${player.name}.comboOffered`, player.comboOffered ? [player.comboOffered] : []); const equipmentIds = new Set(); for (const card of player.equipment) { if (equipmentIds.has(card.instanceId)) failures.push(`${player.name} equipment duplicates ${card.instanceId}`); equipmentIds.add(card.instanceId); if (!player.played.includes(card)) failures.push(`${player.name} equipment ${card.catalogId} is not in play`); if (!["Weapon", "Gear", "Defense Equipment"].includes(card.subtype)) failures.push(`${player.name} has non-equipment card in equipment: ${card.catalogId}`); } const exhaustedIds = new Set(); for (const instanceId of player.exhaustedEquipment) { if (exhaustedIds.has(instanceId)) failures.push(`${player.name} exhausts ${instanceId} more than once`); exhaustedIds.add(instanceId); if (!player.equipment.some((card) => card.instanceId === instanceId)) failures.push(`${player.name} has exhausted equipment outside equipment`); } const statusIds = new Set(); for (const status of player.statuses) { if (!status?.id) failures.push(`${player.name} has a status without id`); else if (statusIds.has(status.id)) failures.push(`${player.name} has duplicate status ${status.id}`); else statusIds.add(status.id); } }
    if (this.pendingChoice && (!Array.isArray(this.pendingChoice.options) || !this.pendingChoice.options.length)) failures.push(`pending choice ${this.pendingChoice.kind} has no legal options`);
    if (this.winner !== null && this.status !== "complete") failures.push("winner exists while game is not complete");
    return failures;
  }

  getState() {
    const cardIds = (cards) => cards.map((card) => card.instanceId ?? card.catalogId);
    return { schemaVersion: 3, rulesVersion: this.definition.rulesVersion, seed: this.seed, round: this.round, roundLimitReached: this.roundLimitReached, turns: this.turns, phase: this.phase, activePlayer: this.activePlayer, turnOrder: [...this.turnOrder], turnOrderPosition: this.turnOrderPosition, winner: this.winner, reason: this.reason, pendingChoice: this.getPendingChoice(), market: cardIds(this.market), marketDeck: cardIds(this.marketDeck), marketDiscard: cardIds(this.marketDiscard), comboDeck: cardIds(this.comboDeck ?? []), comboDiscard: cardIds(this.comboDiscard ?? []), location: this.currentLocation?.catalogId ?? null, locationDeck: cardIds(this.locationDeck ?? []), locationDiscard: cardIds(this.locationDiscard ?? []), players: this.players.map((player) => ({ id: player.id, hp: player.hp, maxHp: player.maxHp, atk: player.atk, def: player.def, speed: player.speed, focus: player.focus, xp: player.xp, beltIndex: player.beltIndex, completedTasks: [...player.completedTasks], trainingStripes: structuredClone(player.trainingStripes), learnedCombos: cardIds(player.learnedCombos), comboOffered: player.comboOffered?.instanceId ?? null, tempo: player.tempo, reversalUsedThisRound: Boolean(player.reversalUsedThisRound), exhaustedEquipment: [...player.exhaustedEquipment], statuses: structuredClone(player.statuses), cardZones: { deck: cardIds(player.deck), hand: cardIds(player.hand), discard: cardIds(player.discard), destroyed: cardIds(player.destroyed), box: cardIds(player.box ?? []), played: cardIds(player.played), equipment: cardIds(player.equipment) } })) };
  }

  // ---- Seats, rosters and targets (Standard Clash, Tag Team, Dojo Drama) -------------
  rosterCardsFor(id, rosterEntry, character, catalog) {
    const resolve = (entry) => typeof entry === "string" ? this.data.byId.get(entry) : entry;
    if (Array.isArray(rosterEntry) && rosterEntry.length) {
      const cards = rosterEntry.map(resolve).filter(Boolean);
      if (cards.length !== this.rosterSize) throw new Error(`Mode ${this.mode.id} needs ${this.rosterSize} Characters for player ${id + 1}`);
      return cards;
    }
    if (this.rosterSize === 1) return [character ?? catalog[id]];
    return Array.from({ length: this.rosterSize }, (_, slot) => catalog[(id * this.rosterSize + slot) % catalog.length]);
  }

  initRoster(player, cards) {
    if (this.rosterSize === 1) { player.roster = null; player.activeIndex = 0; return; }
    player.activeIndex = 0;
    player.roster = cards.map((character, index) => index === 0 ? { character, knockedOut: false, passivesApplied: false } : { character, hp: this.mode.startingHp, maxHp: this.mode.startingHp, atkBase: num(character?.stats?.ATK), defBase: num(character?.stats?.DEF), speedBase: num(character?.stats?.Speed), tempSpeed: 0, equipment: [], exhaustedEquipment: [], statuses: [], knockedOut: false, passivesApplied: false });
    this.stashActive(player);
  }

  // The active fighter's Character-owned state is mirrored on the player object so every
  // existing rule keeps reading player.hp, player.equipment, player.atk and so on.
  stashActive(player) {
    const fighter = player.roster?.[player.activeIndex]; if (!fighter) return;
    Object.assign(fighter, { character: player.character, hp: player.hp, maxHp: player.maxHp, atkBase: player.atk - player.beltBonus.atk, defBase: player.def - player.beltBonus.def, speedBase: player.speed - player.beltBonus.speed, tempSpeed: player.tempSpeed, equipment: player.equipment, exhaustedEquipment: player.exhaustedEquipment, statuses: player.statuses });
  }

  loadFighter(player, index) {
    const fighter = player.roster[index];
    Object.assign(player, { character: fighter.character, hp: fighter.hp, maxHp: fighter.maxHp, atk: fighter.atkBase + player.beltBonus.atk, def: fighter.defBase + player.beltBonus.def, speed: fighter.speedBase + player.beltBonus.speed, tempSpeed: fighter.tempSpeed, equipment: fighter.equipment, exhaustedEquipment: fighter.exhaustedEquipment, statuses: fighter.statuses, activeIndex: index });
    if (!fighter.passivesApplied) {
      fighter.passivesApplied = true;
      const passive = this.cardEffects(player.character, "passive").filter((effect) => effect.resolver === "character.cannotEquipWeapons");
      if (passive.length) this.applyCardEffects(player, player.character, "passive", { opponent: this.opponentOf(player), sourceCard: player.character, effectOverride: passive });
    }
  }

  // Equipment stays with its Character on the bench: still in play, but inactive (Ch. 13).
  benchedEquipment(player) {
    if (!player.roster) return new Set();
    return new Set(player.roster.flatMap((fighter, index) => index === player.activeIndex || fighter.knockedOut ? [] : fighter.equipment ?? []));
  }

  swapActive(player, index) { this.stashActive(player); this.loadFighter(player, index); }

  consciousBench(player) {
    if (!player.roster) return [];
    return player.roster.map((fighter, index) => ({ fighter, index })).filter(({ fighter, index }) => index !== player.activeIndex && !fighter.knockedOut && fighter.hp > 0);
  }

  tagActions(player) {
    if (!this.mode.tagging?.enabled || player.taggedThisTurn || player.equippedThisInitiate) return [];
    return this.consciousBench(player).map(({ index }) => ({ type: "tag", playerId: player.id, fighterIndex: index }));
  }

  tag(player, index) {
    if (!this.tagActions(player).some((action) => action.fighterIndex === index)) return false;
    const from = player.activeIndex;
    this.swapActive(player, index); player.taggedThisTurn = true;
    this.emit({ type: "tag", player: player.id, from, to: index, character: player.character?.catalogId });
    return true;
  }

  // Bots tag out a badly hurt fighter for a clearly healthier one.
  chooseTagAction(player, legal) {
    const tags = legal.filter((action) => action.type === "tag"); if (!tags.length) return null;
    const best = tags.map((action) => ({ action, fighter: player.roster[action.fighterIndex] })).sort((left, right) => right.fighter.hp - left.fighter.hp || right.fighter.speedBase - left.fighter.speedBase)[0];
    return player.hp <= 8 && best.fighter.hp >= player.hp + 6 ? best.action : null;
  }

  isOpponent(player, other) { return Boolean(other) && other.id !== player.id && other.team !== player.team; }

  isLegalTarget(player, target) { return this.isOpponent(player, target) && !target.eliminated && target.hp > 0 && !this.hasStatus(target, "untargetable"); }

  legalTargets(player) {
    const count = this.players.length;
    return Array.from({ length: count - 1 }, (_, step) => this.players[(player.id + step + 1) % count]).filter((target) => this.isLegalTarget(player, target));
  }

  opponentOf(player) {
    if (this.combat) {
      if (this.combat.attackerId === player.id) return this.players[this.combat.defenderId];
      if (this.combat.defenderId === player.id) return this.players[this.combat.attackerId];
    }
    if (this.players.length === 2) return this.players[1 - player.id];
    const chosen = player.targetId !== undefined && player.targetId !== null ? this.players[player.targetId] : null;
    if (chosen && this.isLegalTarget(player, chosen)) return chosen;
    const count = this.players.length;
    const clockwise = Array.from({ length: count - 1 }, (_, step) => this.players[(player.id + step + 1) % count]).filter((other) => this.isOpponent(player, other));
    return clockwise.find((other) => !other.eliminated) ?? clockwise[0] ?? this.players[(player.id + 1) % count];
  }

  defaultTargetId(playerId) {
    const player = this.players[playerId];
    if (this.players.length === 2) return 1 - playerId;
    const targets = this.legalTargets(player); if (!targets.length) return null;
    if (player.targetId !== undefined && player.targetId !== null && targets.some((target) => target.id === player.targetId)) return player.targetId;
    player.targetId = this.chooseTarget(player, targets).id;
    return player.targetId;
  }

  // Bot targeting: finish a fighter you can KO; otherwise slow the leader; otherwise the weakest.
  chooseTarget(player, targets) {
    const best = chooseAttack(player.hand, player.strategy); const reach = attackPower(best) + player.atk;
    const killable = targets.filter((target) => target.hp <= reach - target.def).sort((left, right) => left.hp - right.hp)[0];
    if (killable) return killable;
    const leader = [...targets].sort((left, right) => right.beltIndex - left.beltIndex || right.xp - left.xp)[0];
    if (leader.beltIndex >= this.definition.progression.belts.length - 3 && leader.beltIndex > player.beltIndex) return leader;
    const distance = (target) => (target.id - player.id + this.players.length) % this.players.length;
    return [...targets].sort((left, right) => left.hp - right.hp || left.def - right.def || distance(left) - distance(right))[0];
  }

  seatTiebreak(player) { return this.legacyQuickDuel ? player.id : (player.id - this.referee + this.playerCount) % this.playerCount; }

  // ---- Knockout procedure (Ch. 16) and mode victory ----------------------------------
  knockoutCandidates() { return this.players.filter((player) => !player.eliminated && player.hp <= 0); }

  processKnockouts() {
    const knocked = this.knockoutCandidates();
    if (!knocked.length) return [];
    const eliminated = [];
    for (const victim of knocked) {
      victim.hp = 0;
      const responsible = victim.lastDamagedBy !== null && victim.lastDamagedBy !== undefined ? this.players[victim.lastDamagedBy] : null;
      if (responsible && this.isOpponent(responsible, victim) && !responsible.eliminated) {
        this.gainXp(responsible, Number(this.mode.knockout?.xpForResponsiblePlayer ?? 2), "knockout");
        if (responsible.beltIndex === this.definition.progression.belts.length - 2) { responsible.examProgress.koWhileBrown = true; this.checkBeltExam(responsible); }
      }
      for (const card of [...victim.equipment]) { remove(victim.played, card); victim.discard.push(card); }
      victim.equipment = []; victim.exhaustedEquipment = []; victim.statuses = []; victim.tempSpeed = 0;
      // The knocked-out fighter's cards leave the table, so a pending choice about them is void.
      this.voidChoicesFor(victim.id);
      if (victim.roster) victim.roster[victim.activeIndex].knockedOut = true;
      this.emit({ type: "knockout", player: victim.id, character: victim.character?.catalogId, by: responsible?.id ?? null });
      const bench = this.consciousBench(victim);
      if (bench.length) {
        const next = [...bench].sort((left, right) => right.fighter.hp - left.fighter.hp || right.fighter.speedBase - left.fighter.speedBase || left.index - right.index)[0];
        this.swapActive(victim, next.index);
        if (victim.id === this.activePlayer) victim.noEquipThisTurn = true;
        this.emit({ type: "replacement", player: victim.id, to: next.index, character: victim.character?.catalogId });
      } else {
        victim.eliminated = true; victim.leftGame = [...victim.hand, ...victim.deck, ...victim.discard, ...victim.played];
        victim.hand = []; victim.deck = []; victim.discard = []; victim.played = [];
        eliminated.push(victim);
        this.emit({ type: "elimination", player: victim.id });
      }
      victim.lastDamagedBy = null;
    }
    this.knockouts.push(...knocked.map((victim) => ({ round: this.round, player: victim.id })));
    return { knocked, eliminated };
  }

  rankByTiebreakers(players) {
    const order = this.mode.tiebreakers ?? [];
    const conscious = (player) => player.roster ? player.roster.filter((fighter, index) => !fighter.knockedOut && (index === player.activeIndex ? player.hp : fighter.hp) > 0).length : (player.hp > 0 ? 1 : 0);
    const totalHp = (player) => player.roster ? player.roster.reduce((sum, fighter, index) => sum + (fighter.knockedOut ? 0 : index === player.activeIndex ? player.hp : fighter.hp), 0) : player.hp;
    const keys = { consciousFighters: conscious, totalCurrentHp: totalHp, belt: (player) => player.beltIndex, xp: (player) => player.xp };
    let pool = [...players];
    for (const key of order) {
      if (pool.length < 2) break;
      if (key === "suddenDeath") {
        while (pool.length > 1) {
          const reveals = pool.map((player) => { const source = player.deck.length ? player.deck : player.discard.length ? player.discard : player.leftGame ?? []; return { player, value: source.length ? cost(this.rng.pick(source)) : 0 }; });
          const top = Math.max(...reveals.map((entry) => entry.value));
          const next = reveals.filter((entry) => entry.value === top).map((entry) => entry.player);
          if (next.length === pool.length) { pool = [this.rng.pick(pool)]; break; }
          pool = next;
        }
        break;
      }
      const score = keys[key]; if (!score) continue;
      const top = Math.max(...pool.map(score)); pool = pool.filter((player) => score(player) === top);
    }
    return pool.length > 1 ? this.rng.pick(pool) : pool[0];
  }

  declareWinner(player, reason) {
    if (this.winner !== null) return true;
    this.winner = player.id; this.winningTeam = player.team; this.reason = reason;
    this.status = "complete"; this.clearChoices(); this.lastPresentedChoice = null;
    this.emit({ type: "victory", player: player.id, team: player.team, reason });
    return true;
  }

  checkModeWinner() {
    if (this.winner !== null) return true;
    const outcome = this.processKnockouts();
    if (this.winner !== null) return true;
    const living = this.players.filter((player) => !player.eliminated);
    const teams = new Set(living.map((player) => player.team));
    if (teams.size === 1) return this.declareWinner(living[0], "last-fighter-standing");
    if (teams.size === 0) return this.declareWinner(this.rankByTiebreakers(outcome.eliminated?.length ? outcome.eliminated : this.players), "simultaneous-knockout");
    if (this.roundLimitReached) return this.declareWinner(this.rankByTiebreakers(living), "round-limit");
    if (outcome.knocked?.length) this.revealLocation();
    // An eliminated player's turn ends at once; play passes to the next seat.
    if (this.players[this.activePlayer]?.eliminated && this.phase !== "Honor") { this.clearChoices(); this.finishTurn(); }
    return this.winner !== null;
  }

  // Quick Duel results omit `setup` (bit-for-bit legacy output) unless a table option changed it.
  result() { return { ...(this.legacyQuickDuel ? {} : { setup: structuredClone(this.setup), winningTeam: this.winningTeam ?? null }), ...(this.legacyQuickDuel && !tableOptionsAreDefault(this.data.definition, this.tableOptions) ? { setup: structuredClone(this.setup) } : {}), seed: this.seed, winner: this.winner, reason: this.reason, rounds: this.round, turns: this.turns, phase: this.phase, players: this.players.map((player) => ({ id: player.id, strategy: player.strategy, hp: player.hp, xp: player.xp, beltIndex: player.beltIndex, completedTasks: [...player.completedTasks], promotionHistory: structuredClone(player.promotionHistory), learnedCombos: player.learnedCombos.map((card) => card.catalogId), comboTriggered: Boolean(player.comboTriggeredThisGame), promotions: player.promotionHistory.length, purchases: player.purchases, plays: player.plays, openingPurchase: player.openingPurchase, firstMarketPurchaseRound: player.firstMarketPurchaseRound, firstNonStarterCardPlayedRound: player.firstNonStarterCardPlayedRound })), cards: [...this.cardStats.values()], telemetry: { ...this.telemetry }, invariantFailures: this.checkInvariants(), unsupportedEffects: this.telemetry.unsupportedEffects, decisions: this.decisions, events: this.events, state: this.getState() }; }
}

export const createGame = (data, config = {}) => new Game(data, config);
export const getLegalActions = (game, playerId) => game.getLegalActions(playerId);
export const applyAction = (game, action) => game.applyAction(action);
export const resolveChoice = (game, choice) => game.resolveChoice(choice);
export const advanceAutomaticEvents = (game) => game.advanceAutomaticEvents();
export const isGameOver = (game) => game.winner !== null;
export const getWinner = (game) => game.winner;
