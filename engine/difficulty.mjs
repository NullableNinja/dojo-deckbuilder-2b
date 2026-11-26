/**
 * Difficulty policies for the headless engine: Student, Certified and Master.
 *
 * A policy is `{ chooseAction(game, legalActions), chooseChoice(game, pendingChoice) }`.
 * It only ever picks one of the actions or choice options the engine offers, and it never
 * mutates the game. Card knowledge comes from card data (stats, tags, subtypes, zones and
 * structured effects), never from a card ID or name.
 *
 * - Student learns the mat: it attacks in a shuffled order, sometimes forgets to defend,
 *   defends with its biggest card, buys whatever looks expensive and rarely uses Reactions.
 * - Certified is solid: it plays its support cards before attacking, orders attacks and picks
 *   zones around the defender's open guard, blocks efficiently, uses Reactions when they
 *   matter and buys for a balanced deck.
 * - Master plans: it looks ahead on a copy of the table to choose attack order, targets and
 *   zones, which Defense and Reaction to spend, and buys the best set of cards for its deck.
 *
 * Every chosen option is first tried on a private copy of the table, and one that would break
 * the table's invariants is swapped for a safe alternative. (Today that keeps Reaction Items
 * in hand: the engine files a played Reaction in both `played` and `discard`.)
 *
 * Randomness is deterministic and replay-safe: it is derived from the seeded engine RNG state
 * without advancing it, so a game recorded as setup + decisions replays move for move.
 */
import { attackPower, cost, focus, guard } from "./bots.mjs";
import { HEADLESS_RESOLVER_ACTIONS } from "./core.mjs";

export const DIFFICULTIES = ["student", "certified", "master"];

const PROFILES = {
  student: {
    level: "student", skipDefenseChance: 0.28, reactionChance: 0.5, shuffledAttacks: true, readsOpponent: false,
    defenseStyle: "biggest", market: "sticker-price", learnComboChance: 0.5, activatesEquipment: false, choosesTargets: false, lookahead: false, randomUpkeep: true,
  },
  certified: {
    level: "certified", skipDefenseChance: 0, reactionChance: 1, shuffledAttacks: false, readsOpponent: true,
    defenseStyle: "efficient", market: "balanced", learnComboChance: 1, combosWithLeftoverFocus: true, activatesEquipment: true, choosesTargets: true, lookahead: false,
  },
  master: {
    level: "master", skipDefenseChance: 0, reactionChance: 1, shuffledAttacks: false, readsOpponent: true,
    defenseStyle: "efficient", market: "planned", learnComboChance: 1, combosWithLeftoverFocus: true, activatesEquipment: true, choosesTargets: true, lookahead: true,
  },
};

const ZONES = ["High", "Mid", "Low"];
const EQUIPMENT_SUBTYPES = new Set(["Weapon", "Gear", "Defense Equipment"]);
const WIN_SCORE = 1e6;

// ---- Card facts (read from card data only) -----------------------------------------------

const num = (value) => Number.parseInt(String(value ?? 0), 10) || 0;
const typeWords = (card) => [card?.cardType, card?.subtype, card?.category];
const isJunk = (card) => typeWords(card).includes("Junk") || (card?.tags ?? []).includes("Junk");
const isAttackCard = (card) => attackPower(card) > 0;
// Mirrors the engine: a Defense is a Technique or Starter printed as a Defense.
const isDefenseCard = (card) => guard(card) > 0 && (card.subtype === "Defense" || card.details?.Type === "Defense");
const isEquipment = (card) => EQUIPMENT_SUBTYPES.has(card?.subtype);
const isAnyZone = (card) => String(card?.zone ?? "").toLowerCase().includes("any");
const coversZone = (card, zone) => isAnyZone(card) || String(card?.zone ?? "").toLowerCase().split(",").map((entry) => entry.trim()).includes(String(zone ?? "").toLowerCase());
const allEffects = (game, card) => (card ? game.effects.get(card.catalogId)?.effects ?? [] : []);
const effectAction = (effect) => (effect.action === "custom" ? HEADLESS_RESOLVER_ACTIONS[effect.resolver] ?? effect.effect ?? "custom" : effect.action);
const unconditional = (effect) => !(effect.conditions ?? []).length;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const maxBy = (items, score) => items.reduce((best, item) => (best === null || score(item) > score(best) ? item : best), null);
const minBy = (items, score) => maxBy(items, (item) => -score(item));

function printedAmount(game, card, { triggers, actions, targets = ["self", "source"] }) {
  return sum(allEffects(game, card)
    .filter((effect) => triggers.includes(effect.trigger) && actions.includes(effectAction(effect)) && targets.includes(effect.target ?? "self") && unconditional(effect))
    .map((effect) => num(effect.amount)));
}
const printedAttackBonus = (game, card) => printedAmount(game, card, { triggers: ["passive", "onAttackDeclared"], actions: ["modifyAttackPower"] });
const printedPiercing = (game, card) => printedAmount(game, card, { triggers: ["passive", "onAttackDeclared"], actions: ["piercing"] });
const printedGuardBonus = (game, card) => printedAmount(game, card, { triggers: ["onDefenseDeclared"], actions: ["modifyGuard", "modifyDefense", "preventDamage"] });
const selfDamageAtHide = (game, card) => printedAmount(game, card, { triggers: ["onHide"], actions: ["dealDamage"], targets: ["self"] });
// Cards that lock your own attacks or hide you from targeting are played once attacking is done.
const locksOwnAttacks = (game, card) => allEffects(game, card).some((effect) => effect.trigger === "onPlay" && ["restrictAttack", "untargetable"].includes(effectAction(effect)));
const DEFENSE_CONTRIBUTIONS = new Set(["equipment.modifyDefenseContribution", "modifyDefenseContribution", "combat.modifyDefense", "modifyDefense"]);
const effectZones = (effect) => { const zones = (effect.conditions ?? []).find((condition) => condition.kind === "incomingZones")?.value; return Array.isArray(zones) && zones.length ? zones : ZONES; };
/** Permanent DEF an Equipment card grants while equipped, per zone it covers. */
const zoneDefenseEffects = (game, card) => allEffects(game, card).filter((effect) => effect.trigger === "passive" && DEFENSE_CONTRIBUTIONS.has(effectAction(effect)) && (effect.conditions ?? []).every((condition) => condition.kind === "incomingZones"));
const equipmentDefense = (game, player, zone) => sum(player.equipment.flatMap((card) => zoneDefenseEffects(game, card)).filter((effect) => effectZones(effect).includes(zone)).map((effect) => num(effect.amount)));
/** Zone-points of permanent DEF, capped per zone: +1 everywhere beats +4 in one zone. */
const permanentDefensePoints = (game, card) => sum(zoneDefenseEffects(game, card).map((effect) => Math.min(2, num(effect.amount)) * effectZones(effect).length));
const drawsCards = (game, card) => allEffects(game, card).some((effect) => effect.trigger === "onPlay" && effectAction(effect) === "draw");

/** How much a card is worth to own, independent of the moment. */
function cardWorth(game, card) {
  if (!card) return 0;
  if (isJunk(card)) return -3;
  let worth = focus(card) + cost(card) * 0.6 + allEffects(game, card).length * 0.6;
  if (isAttackCard(card)) worth += attackPower(card) * 1.5 + (isAnyZone(card) ? 1 : 0);
  else if (isDefenseCard(card)) worth += guard(card) * 1.2 + (isAnyZone(card) ? 1 : 0);
  else if (isEquipment(card)) worth += 3;
  else if (card.subtype === "Kata") worth += 1;
  return worth;
}

/** How much a card in hand is worth right now; spare Defenses on your own turn are nearly spent. */
function handWorth(game, player, card) {
  const ownYell = game.activePlayer === player.id && ["Initiate", "Yell"].includes(game.phase);
  if (ownYell && isDefenseCard(card) && player.practiceUsed) return 0.5;
  return cardWorth(game, card);
}

const ownedCards = (player) => [...player.deck, ...player.hand, ...player.discard, ...player.played];

// ---- Replay-safe randomness ---------------------------------------------------------------

/** A deterministic number in [0, 1) derived from the seeded RNG state without advancing it. */
function chance(game, salt) {
  let hash = (num(game.rng?.state) ^ Math.imul((game.events?.length ?? 0) + 1, 0x9e3779b1) ^ Math.imul(num(game.turns) + 1, 0x85ebca6b)) >>> 0;
  for (const character of String(salt)) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
  hash ^= hash >>> 15; hash = Math.imul(hash, 0x2c1b3c6d); hash ^= hash >>> 12; hash = Math.imul(hash, 0x297a2d39); hash ^= hash >>> 15;
  return (hash >>> 0) / 2 ** 32;
}
const pickAtRandom = (game, items, salt) => items[Math.floor(chance(game, salt) * items.length)];

// ---- Combat estimates --------------------------------------------------------------------

function attackEstimate(game, attacker, card, modifier = 0) {
  const tempo = attacker.tempo ? num(game.definition.turn.tempoAttackPower) : 0;
  return attackPower(card) + attacker.atk + tempo + attacker.nextAttackPower + game.statusValue(attacker, "modifyAttackPower") + printedAttackBonus(game, card) + modifier;
}

function blockEstimate(game, defender, defenseCard, attacker, attackCard, zone, extraDefense = 0) {
  const piercing = game.statusValue(attacker, "piercing") + printedPiercing(game, attackCard);
  const printed = defenseCard ? guard(defenseCard) + printedGuardBonus(game, defenseCard) : 0;
  const guardCard = defender.guardCard && coversZone(defender.guardCard, zone) ? guard(defender.guardCard) : 0;
  return Math.max(0, defender.def + printed + guardCard + equipmentDefense(game, defender, zone) + game.statusValue(defender, "modifyGuard") + game.statusValue(defender, "modifyDefense") + extraDefense - piercing);
}

/** The best guard a defender's hand offers in a zone (peeking, as the mat's computer does). */
function bestGuardInZone(game, defender, zone) {
  const guards = defender.hand.filter((card) => isDefenseCard(card) && coversZone(card, zone)).map((card) => guard(card) + printedGuardBonus(game, card));
  return guards.length ? Math.max(...guards) : 0;
}

/** Everything standing between an attack and the defender in a zone: equipment and the best guard. */
const zoneCover = (game, defender, zone) => equipmentDefense(game, defender, zone) + (defender.guardCard && coversZone(defender.guardCard, zone) ? guard(defender.guardCard) : 0) + bestGuardInZone(game, defender, zone);

const zonesFor = (card) => (isAnyZone(card) ? ZONES : [String(card?.zone ?? "").split(",")[0].trim()]);

/** The zone where the defender is most open; ties go to a zone the attacker's Belt Exam still needs. */
function openZone(game, attacker, defender, zones) {
  const examZones = attacker.examProgress?.zones ?? [];
  return minBy(zones, (zone) => zoneCover(game, defender, zone) * 10 + (examZones.includes(zone) ? 1 : 0));
}

function attackScore(game, attacker, defender, card) {
  const zone = openZone(game, attacker, defender, zonesFor(card));
  const coverage = defender.hand.filter((candidate) => isDefenseCard(candidate) && coversZone(candidate, zone)).length;
  return attackPower(card) + printedAttackBonus(game, card) + printedPiercing(game, card) - coverage * 0.35 - zoneCover(game, defender, zone) * 0.25;
}

// ---- Targets in multiplayer --------------------------------------------------------------

const legalTargets = (game, player) => (typeof game.legalTargets === "function" ? game.legalTargets(player) : []);

/** Finish a fighter this attack can knock out, otherwise press the weakest, otherwise the leader. */
function chooseTarget(game, attacker, card, targets) {
  const reach = (target) => attackEstimate(game, attacker, card) - target.def - zoneCover(game, target, openZone(game, attacker, target, zonesFor(card)));
  const knockout = minBy(targets.filter((target) => target.hp <= reach(target)), (target) => target.hp);
  if (knockout) return knockout;
  return minBy(targets, (target) => target.hp - Math.max(0, reach(target)) * 1.5 - target.beltIndex * 0.5);
}

/** Two-seat games keep the engine's own target; with more seats the policy names one. */
function withTarget(game, action, profile) {
  if (game.players.length < 3 || !profile.choosesTargets || action.type !== "play-attack") return action;
  const attacker = game.players[action.playerId ?? game.activePlayer];
  const card = attacker.hand.find((candidate) => candidate.instanceId === action.cardId);
  const targets = legalTargets(game, attacker);
  const target = card && targets.length ? chooseTarget(game, attacker, card, targets) : null;
  return target ? { ...action, targetId: target.id } : action;
}

// ---- Market ------------------------------------------------------------------------------

function deckProfile(player) {
  const owned = ownedCards(player);
  return { attacks: owned.filter(isAttackCard).length, defenses: owned.filter(isDefenseCard).length, equipment: owned.filter(isEquipment).length, junk: owned.filter(isJunk).length, size: owned.length };
}

/** Certified mirrors the mat's market score: price, Focus, and filling thin card families. */
function balancedMarketScore(game, player, card) {
  const deck = deckProfile(player);
  const base = cost(card) * 2 + focus(card);
  if (isDefenseCard(card) && deck.defenses < 5) return base + 5;
  if (isAttackCard(card) && deck.attacks < 5) return base + 4;
  if (card.subtype === "Kata" && player.learnedCombos.length) return base + 3;
  if (isEquipment(card)) return base + 2;
  return base;
}

/** Master weighs what a card does for this deck: power, coverage, permanence and family balance. */
function plannedMarketScore(game, player, card) {
  const deck = deckProfile(player);
  let score = cardWorth(game, card) + cost(card) * 0.8;
  if (isAttackCard(card)) score += deck.attacks < 7 ? 3 : 0;
  if (isDefenseCard(card)) score += deck.defenses < 5 ? 3 : deck.defenses > 8 ? -2 : 0;
  if (isEquipment(card)) score += (deck.equipment < 4 ? 3 : 1) + permanentDefensePoints(game, card) * 3;
  if (card.subtype === "Kata" && player.learnedCombos.length) score += 1.5;
  return score;
}

const MARKET_SCORES = {
  "sticker-price": (game, player, card) => cost(card) + focus(card) * 0.5,
  balanced: balancedMarketScore,
  planned: plannedMarketScore,
};

function purchaseCandidates(game, player, legal) {
  return legal.filter((action) => action.type === "purchase")
    .map((action) => ({ action, card: game.market.find((card) => card.instanceId === action.cardId) }))
    .filter((entry) => entry.card)
    .map((entry) => ({ ...entry, price: game.purchaseCost(player, entry.card) }));
}

/** The best set of affordable cards within this Focus (the market row is small). */
function bestPurchasePlan(candidates, focusAvailable, score) {
  let best = { value: 0, picks: [] };
  const search = (index, budget, value, picks) => {
    if (value > best.value) best = { value, picks: [...picks] };
    for (let next = index; next < candidates.length; next += 1) {
      const candidate = candidates[next];
      if (candidate.price > budget || score(candidate) <= 0) continue;
      picks.push(candidate);
      search(next + 1, budget - candidate.price, value + score(candidate), picks);
      picks.pop();
    }
  };
  search(0, focusAvailable, 0, []);
  return best.picks;
}

function choosePurchase(game, player, legal, profile) {
  const candidates = purchaseCandidates(game, player, legal);
  if (!candidates.length) return null;
  const score = (entry) => MARKET_SCORES[profile.market](game, player, entry.card);
  if (profile.market === "planned") return maxBy(bestPurchasePlan(candidates, player.focus, score), score)?.action ?? null;
  if (profile.market === "sticker-price") return maxBy(candidates, (entry) => score(entry) + chance(game, `buy:${entry.card.instanceId}`) * 3).action;
  return maxBy(candidates, score).action;
}

// ---- Look-ahead (Master) -----------------------------------------------------------------

const SHARED_KEYS = new Set(["data", "definition", "effects", "mode", "rng", "events", "decisions", "lastPresentedChoice", "cardStats", "marketDeck", "comboDeck", "locationDeck"]);

/**
 * A private copy of the table to try a decision on. Rules data is shared read-only; draw
 * piles nobody draws from within a turn are shared by array copy; everything else is cloned.
 */
function cloneGame(game) {
  const mutable = {};
  for (const [key, value] of Object.entries(game)) if (!SHARED_KEYS.has(key) && typeof value !== "function") mutable[key] = value;
  const copy = Object.assign(Object.create(Object.getPrototypeOf(game)), structuredClone(mutable));
  Object.assign(copy, { data: game.data, definition: game.definition, effects: game.effects, mode: game.mode, events: [], decisions: [], lastPresentedChoice: null, cardStats: new Map() });
  for (const key of ["marketDeck", "comboDeck", "locationDeck"]) copy[key] = Array.isArray(game[key]) ? game[key].slice() : game[key];
  copy.rng = Object.assign(Object.create(Object.getPrototypeOf(game.rng)), game.rng);
  return copy;
}

/** Play a copy forward with Certified judgement for every seat until `done` says stop. */
function playOut(sim, done, maxSteps = 80) {
  const judge = SIMULATION_POLICY;
  for (let step = 0; step < maxSteps && sim.winner === null; step += 1) {
    if (sim.pendingChoice) {
      const choice = judge.chooseChoice(sim, sim.pendingChoice);
      if (!sim.resolveChoice(choice) && !sim.resolveChoice(sim.defaultChoice())) return;
      continue;
    }
    if (sim.phase === "Honor" || done(sim)) return;
    const legal = sim.getLegalActions();
    if (!legal.length || !sim.applyAction(judge.chooseAction(sim, legal))) return;
  }
}

const sameSide = (game, player, other) => Boolean(other) && (other.id === player.id || other.team === player.team);

function fighterValue(player) {
  if (player.eliminated) return -20;
  return player.hp + (player.hp <= 0 ? -20 : 0) + player.xp * 0.45 + player.focus * 0.25;
}

/** Table value from one seat's point of view: its fighter against the average opponent. */
function evaluate(sim, seat) {
  const me = sim.players[seat];
  if (sim.winner !== null) return sameSide(sim, me, sim.players[sim.winner]) ? WIN_SCORE : -WIN_SCORE;
  const foes = sim.players.filter((player) => player.id !== me.id && !sameSide(sim, me, player));
  return fighterValue(me) - sum(foes.map(fighterValue)) / Math.max(1, foes.length);
}

/** Try each option on its own copy, finish the current Yell, and score the result for `seat`. */
function bestBySimulation(game, seat, candidates, apply) {
  const turnOwner = game.activePlayer;
  let best = null;
  for (const candidate of candidates) {
    let value;
    try {
      const sim = cloneGame(game);
      if (!apply(sim, candidate)) continue;
      playOut(sim, (state) => state.activePlayer !== turnOwner || state.phase !== "Yell");
      value = evaluate(sim, seat);
    } catch {
      continue;
    }
    if (!best || value > best.value) best = { candidate, value };
  }
  return best?.candidate ?? null;
}

// ---- Actions -----------------------------------------------------------------------------

const passOrHide = (legal) => legal.find((action) => action.type === "pass" || action.type === "hide") ?? legal[0];
const cardFor = (player, action) => player.hand.find((card) => card.instanceId === action.cardId);

function initiateAction(game, player, legal, profile) {
  const tag = typeof game.chooseTagAction === "function" ? game.chooseTagAction(player, legal) : null;
  if (tag) return tag;
  const equips = legal.filter((action) => action.type === "play-card").map((action) => ({ action, card: cardFor(player, action) })).filter((entry) => entry.card);
  if (equips.length) return profile.shuffledAttacks ? pickAtRandom(game, equips, "equip").action : maxBy(equips, (entry) => cardWorth(game, entry.card)).action;
  const activation = profile.activatesEquipment && legal.find((action) => action.type === "activate-equipment");
  return activation || passOrHide(legal);
}

/** Support cards are played before attacks so their bonuses land; lockouts wait until after. */
function supportCardAction(game, player, legal, { afterAttacks }) {
  const options = legal.filter((action) => action.type === "play-card").map((action) => ({ action, card: cardFor(player, action) }))
    .filter(({ card }) => card && locksOwnAttacks(game, card) === afterAttacks && player.hp > selfDamageAtHide(game, card) + 3);
  if (!options.length) return null;
  const setup = typeof game.comboSetupCard === "function" ? game.comboSetupCard(player) : null;
  const setupOption = setup && options.find((entry) => entry.card === setup);
  if (setupOption) return setupOption.action;
  return maxBy(options, ({ card }) => (drawsCards(game, card) ? 10 : 0) + (card.subtype === "Kata" ? 2 : 0) + focus(card)).action;
}

function practiceAction(game, player, legal) {
  const options = legal.filter((action) => action.type === "practice").map((action) => ({ action, card: cardFor(player, action) })).filter((entry) => entry.card);
  return maxBy(options, ({ card }) => focus(card) * 10 - guard(card))?.action ?? null;
}

function attackAction(game, player, legal, profile) {
  const attacks = legal.filter((action) => action.type === "play-attack" && cardFor(player, action));
  if (!attacks.length) return null;
  if (profile.shuffledAttacks) return pickAtRandom(game, attacks, "attack");
  if (profile.lookahead) {
    const candidates = attackCandidates(game, player, attacks, profile);
    const planned = bestBySimulation(game, player.id, candidates, (sim, action) => sim.applyAction(action));
    if (planned) return planned;
  }
  const defender = defenderFor(game, player);
  if (!defender || !profile.readsOpponent) return maxBy(attacks, (action) => attackPower(cardFor(player, action)));
  return maxBy(attacks, (action) => attackScore(game, player, defender, cardFor(player, action)));
}

/** Every attack, aimed at each plausible target when there are more than two seats. */
function attackCandidates(game, player, attacks, profile) {
  const targets = game.players.length >= 3 ? legalTargets(game, player) : [];
  if (targets.length < 2) return attacks.map((action) => withTarget(game, action, profile));
  const shortlist = [...targets].sort((left, right) => left.hp - right.hp).slice(0, 3);
  return attacks.flatMap((action) => shortlist.map((target) => ({ ...action, targetId: target.id })));
}

function defenderFor(game, player) {
  if (game.players.length === 2) return game.players[1 - player.id];
  const targets = legalTargets(game, player);
  return targets.length ? minBy(targets, (target) => target.hp) : null;
}

function yellAction(game, player, legal, profile) {
  // Cashing a Bad Habit (when the engine offers it) turns a dead card into Focus.
  return legal.find((action) => action.type === "bad-habit-focus")
    ?? supportCardAction(game, player, legal, { afterAttacks: false })
    ?? practiceAction(game, player, legal)
    ?? attackAction(game, player, legal, profile)
    ?? supportCardAction(game, player, legal, { afterAttacks: true })
    ?? passOrHide(legal);
}

function ascendAction(game, player, legal, profile) {
  const promote = legal.find((action) => action.type === "promote");
  if (promote) return promote;
  const recover = legal.find((action) => action.type === "recover-training-stripe");
  if (recover) return recover;
  // A Combo is a long-term investment; Master only learns one with Focus no purchase needs.
  const learn = legal.find((action) => action.type === "learn-combo");
  const learnsCombo = learn && chance(game, "combo") < profile.learnComboChance;
  if (learnsCombo && !profile.combosWithLeftoverFocus) return learn;
  return choosePurchase(game, player, legal, profile) ?? (learnsCombo ? learn : null) ?? passOrHide(legal);
}

function chooseActionFor(game, legal, profile) {
  if (legal.length === 1 && legal[0].type !== "resolve-choice") return legal[0];
  if (legal[0]?.type === "resolve-choice") return { type: "resolve-choice", playerId: legal[0].playerId, choice: chooseChoiceFor(game, game.getPendingChoice(), profile) };
  const player = game.players[game.activePlayer];
  if (game.phase === "Initiate") return initiateAction(game, player, legal, profile);
  if (game.phase === "Yell") return withTarget(game, yellAction(game, player, legal, profile), profile);
  if (game.phase === "Ascend") return ascendAction(game, player, legal, profile);
  return passOrHide(legal);
}

// ---- Choices -----------------------------------------------------------------------------

const optionIds = (pending) => pending.options.map((option) => option.id);
const cardsAmong = (cards, pending) => { const ids = new Set(optionIds(pending)); return cards.filter((card) => ids.has(card.instanceId)); };

function defenseChoice(game, pending, profile) {
  const defender = game.players[pending.playerId];
  const attacker = game.players[pending.attackerId];
  const attackCard = game.cardByInstance(pending.attackerId, pending.cardId);
  const defenses = cardsAmong(defender.hand, pending);
  if (!defenses.length || !attacker || !attackCard) return "pass";
  if (chance(game, `skip-defense:${pending.cardId}`) < profile.skipDefenseChance) return "pass";
  if (profile.defenseStyle === "biggest") return maxBy(defenses, (card) => guard(card)).instanceId;
  if (profile.lookahead) {
    const planned = bestBySimulation(game, defender.id, optionIds(pending), (sim, optionId) => sim.resolveChoice({ optionId }));
    if (planned) return planned;
  }
  return efficientDefense(game, pending, defender, attacker, attackCard, defenses);
}

/** The mat's rule: the smallest Defense that fully blocks, otherwise the biggest one. */
function efficientDefense(game, pending, defender, attacker, attackCard, defenses) {
  const attack = attackEstimate(game, attacker, attackCard, pending.reactionAttackModifier ?? 0);
  const prevention = game.statusValue(defender, "preventDamage") + (pending.reactionPrevention ?? 0);
  const ranked = defenses.map((card) => ({ card, block: blockEstimate(game, defender, card, attacker, attackCard, pending.zone, pending.reactionDefense ?? 0) + prevention }))
    .sort((left, right) => left.block - right.block || cardWorth(game, left.card) - cardWorth(game, right.card));
  return (ranked.find((entry) => entry.block >= attack) ?? ranked.at(-1)).card.instanceId;
}

function reactionChoice(game, pending, profile) {
  const defender = game.players[pending.playerId];
  const attacker = game.players[pending.attackerId];
  const attackCard = game.cardByInstance(pending.attackerId, pending.cardId);
  const reactions = cardsAmong(defender.hand, pending);
  if (!reactions.length || !attacker || !attackCard || chance(game, `reaction:${pending.cardId}`) >= profile.reactionChance) return "pass";
  if (profile.lookahead) {
    const planned = bestBySimulation(game, defender.id, optionIds(pending), (sim, optionId) => sim.resolveChoice({ optionId }));
    if (planned) return planned;
  }
  const bestBlock = Math.max(blockEstimate(game, defender, null, attacker, attackCard, pending.zone), ...cardsAmong(defender.hand, { options: pending.defenseOptions ?? [] }).map((card) => blockEstimate(game, defender, card, attacker, attackCard, pending.zone)));
  const threat = attackEstimate(game, attacker, attackCard) - bestBlock - game.statusValue(defender, "preventDamage");
  const lastChance = !attacker.hand.some((card) => card.instanceId !== pending.cardId && isAttackCard(card));
  return threat > 0 || lastChance ? maxBy(reactions, (card) => cardWorth(game, card)).instanceId : "pass";
}

function attackZoneChoice(game, pending, profile) {
  const zones = optionIds(pending);
  if (!profile.readsOpponent) return pickAtRandom(game, zones, `zone:${pending.cardId}`);
  if (profile.lookahead) {
    const planned = bestBySimulation(game, pending.playerId, zones, (sim, optionId) => sim.resolveChoice({ optionId }));
    if (planned) return planned;
  }
  const attacker = game.players[pending.playerId];
  const defender = game.players[pending.targetId] ?? defenderFor(game, attacker);
  return defender ? openZone(game, attacker, defender, zones) : zones[0];
}

/** Take the opponent's best card; give up your own least useful one (Junk first when destroying). */
function cardMovementChoice(game, pending) {
  const chooser = game.players[pending.playerId];
  const owner = game.players[pending.targetPlayerId] ?? chooser;
  const cards = cardsAmong(pending.sourceZones?.flatMap((zone) => owner[zone] ?? []) ?? owner.hand, pending);
  if (!cards.length) return optionIds(pending)[0];
  if (!sameSide(game, chooser, owner)) return maxBy(cards, (card) => cardWorth(game, card)).instanceId;
  return minBy(cards, (card) => handWorth(game, owner, card)).instanceId;
}

function zoneChoice(game, pending) {
  const player = game.players[pending.playerId];
  const cards = cardsAmong((pending.sourceZones ?? []).flatMap((zone) => player[zone] ?? []), pending);
  return cards.length ? maxBy(cards, (card) => cardWorth(game, card)).instanceId : optionIds(pending)[0];
}

function hitChoice(game, pending) {
  const ids = optionIds(pending);
  const player = game.players[pending.playerId];
  const target = game.players[pending.targetPlayerId];
  const attacksLeft = player.hand.some(isAttackCard);
  if (ids.includes("cycle") && player.hand.some((card) => isJunk(card) || handWorth(game, player, card) < 1)) return "cycle";
  if (ids.includes("tempo-loss") && target?.tempo && !game.turnOrder.slice(0, game.turnOrderPosition + 1).includes(target.id)) return "tempo-loss";
  if (ids.includes("defense-guard-penalty") && attacksLeft) return "defense-guard-penalty";
  if (ids.includes("gain-focus")) return "gain-focus";
  return ids[0];
}

function deckLookChoice(game, pending) {
  const player = game.players[pending.playerId];
  const cards = cardsAmong(player.deck, pending);
  const best = maxBy(cards, (card) => handWorth(game, player, card));
  if (!best) return optionIds(pending)[0];
  const focusForSkipping = num(pending.focusIfNoMatch);
  return focusForSkipping && handWorth(game, player, best) < focusForSkipping * 1.5 ? "skip" : best.instanceId;
}

function cycleChoice(game, pending) {
  const player = game.players[pending.playerId];
  const worst = minBy(cardsAmong(player.hand, pending), (card) => handWorth(game, player, card));
  return worst && (isJunk(worst) || handWorth(game, player, worst) < 2.5) ? worst.instanceId : "skip";
}

function equipmentToggleChoice(game, pending) {
  const player = game.players[pending.playerId];
  const cards = cardsAmong(player.equipment, pending);
  const exhausted = cards.find((card) => game.equipmentIsExhausted(player, card));
  return (exhausted ?? maxBy(cards, (card) => cardWorth(game, card)))?.instanceId ?? optionIds(pending)[0];
}

/** Zone picks: aim your own attacks at open guard; steer the opponent's into your best guard. */
function structuredChoice(game, pending) {
  const ids = optionIds(pending);
  const player = game.players[pending.playerId];
  const stillAttacking = game.activePlayer === player.id && ["Initiate", "Yell"].includes(game.phase) && player.hand.some(isAttackCard);
  if (ids.includes("nextAttackPower:+1")) return stillAttacking || !ids.includes("nextDefenseGuard:+1") ? "nextAttackPower:+1" : "nextDefenseGuard:+1";
  if (ids.includes("attack") && ids.includes("defense")) return stillAttacking ? "attack" : "defense";
  if (ids.includes("counter")) return "counter";
  if (ids.includes("accept")) return "accept";
  if (ZONES.every((zone) => ids.includes(zone))) {
    if (pending.targetPlayerId !== undefined && pending.targetPlayerId !== null && pending.targetPlayerId !== player.id) return maxBy(ZONES, (zone) => zoneCover(game, player, zone));
    const foe = defenderFor(game, player);
    return foe ? openZone(game, player, foe, ZONES) : ids[0];
  }
  return ids.find((id) => id !== "skip") ?? ids[0];
}

const CHOICE_HANDLERS = {
  defense: defenseChoice,
  reaction: reactionChoice,
  "attack-zone": attackZoneChoice,
  "card-movement": cardMovementChoice,
  "zone-choice": zoneChoice,
  "hit-choice": hitChoice,
  "incoming-attack-choice": () => "accept",
  "equipment-toggle": equipmentToggleChoice,
  "discard-or-destroy": () => "destroy",
  "deck-look": deckLookChoice,
  "cycle-discard-draw": cycleChoice,
  structured: structuredChoice,
};
// Student plays the combat windows (with its own slips) but leaves card upkeep to chance.
const STUDENT_RANDOM_KINDS = new Set(["card-movement", "zone-choice", "hit-choice", "incoming-attack-choice", "equipment-toggle", "discard-or-destroy", "deck-look", "cycle-discard-draw", "structured"]);

function chooseChoiceFor(game, pending, profile) {
  if (profile.randomUpkeep && STUDENT_RANDOM_KINDS.has(pending.kind)) return { optionId: pickAtRandom(game, optionIds(pending), `choice:${pending.kind}`) };
  const handler = CHOICE_HANDLERS[pending.kind];
  return { optionId: handler ? handler(game, pending, profile) : null };
}

// ---- Legality guard ----------------------------------------------------------------------

const sameAction = (left, right) => left.type === right.type && left.cardId === right.cardId && left.fighterIndex === right.fighterIndex;

/** Only actions the engine offered leave the policy (a target is added only if it is legal). */
function legalActionOrDefault(game, legal, action) {
  if (!action) return game.defaultAction(legal);
  const offered = legal.find((candidate) => sameAction(candidate, action));
  if (!offered) return game.defaultAction(legal);
  if (offered.type === "resolve-choice") return isOfferedChoice(game.pendingChoice, action.choice) ? action : { ...offered, choice: game.defaultChoice() };
  if (action.targetId === undefined) return offered;
  const attacker = game.players[game.activePlayer];
  return legalTargets(game, attacker).some((target) => target.id === action.targetId) ? { ...offered, targetId: action.targetId } : offered;
}

const isOfferedChoice = (pending, choice) => Boolean(pending) && pending.options.some((option) => option.id === choice?.optionId);

/**
 * Card-playing options (a Reaction, a Defense, a card to pick) are tried on a private copy
 * first; one that would leave the table in a broken state is swapped for the safest
 * alternative ("pass"/"skip" first). This keeps the policies from tripping engine gaps.
 */
function safeChoice(game, pending, choice) {
  const leavesTableIntact = (optionId) => {
    try {
      const sim = cloneGame(game);
      return sim.resolveChoice({ optionId }) && !sim.checkInvariants().length;
    } catch {
      return false;
    }
  };
  if (leavesTableIntact(choice.optionId)) return choice;
  const fallbacks = [...optionIds(pending)].sort((left, right) => Number(!["pass", "skip"].includes(left)) - Number(!["pass", "skip"].includes(right)));
  const safe = fallbacks.find((optionId) => optionId !== choice.optionId && leavesTableIntact(optionId));
  return safe ? { optionId: safe } : choice;
}

function guarded(choose, fallback) {
  try { return choose(); } catch { return fallback(); }
}

function buildPolicy(profile, { verifyChoices }) {
  return Object.freeze({
    level: profile.level,
    chooseAction(game, legalActions) {
      return guarded(() => legalActionOrDefault(game, legalActions, chooseActionFor(game, legalActions, profile)), () => game.defaultAction(legalActions));
    },
    chooseChoice(game, pendingChoice = game.getPendingChoice()) {
      const pending = pendingChoice ?? game.pendingChoice;
      const choice = guarded(() => chooseChoiceFor(game, pending, profile), () => null);
      if (!isOfferedChoice(pending, choice)) return game.defaultChoice();
      return verifyChoices && pending.options.length > 1 ? guarded(() => safeChoice(game, pending, choice), () => choice) : choice;
    },
  });
}

/** A policy for one difficulty level: `{ chooseAction(game, legalActions), chooseChoice(game, pendingChoice) }`. */
export function difficultyPolicy(level) {
  const profile = PROFILES[level];
  if (!profile) throw new Error(`Unknown difficulty ${level}. Choose one of: ${DIFFICULTIES.join(", ")}`);
  return buildPolicy(profile, { verifyChoices: true });
}

// Look-ahead copies are played forward with Certified judgement (never recursive look-ahead,
// and without re-verifying every choice on a further copy).
const SIMULATION_POLICY = buildPolicy(PROFILES.certified, { verifyChoices: false });
