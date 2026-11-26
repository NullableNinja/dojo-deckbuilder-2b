// Turns canonical engine state into what the mat shows: phase labels, status chips, the latest
// combat receipt, fight-log lines and decision prompts. Presentation only: no rules live here.
import { clashCardByCatalogId, type EngineCard } from "./clash-engine.ts";
import type { EngineEvent, EngineGame, EnginePending, EngineSeat, EngineStatus } from "./engine-session.ts";

export type MatPhase = "player-initiate" | "player-yell" | "player-ascend" | "defense-window" | "reversal-window" | "ai-ready";

export type Exchange = {
  key: string; attacker: number; defender: number; attackCard: EngineCard | null; defenseCard: EngineCard | null;
  zone: string | null; attack: number; block: number; damage: number; reversal: boolean; notes: string[];
};

const cardName = (catalogId: unknown) => typeof catalogId === "string" ? clashCardByCatalogId(catalogId)?.name ?? catalogId : "a card";
export const cardByCatalogId = (catalogId: unknown) => typeof catalogId === "string" ? clashCardByCatalogId(catalogId) ?? null : null;

/** The mat's phase vocabulary (its CSS keys) for the human seat. */
export function matPhase(game: EngineGame, human: number): MatPhase {
  const pending = game.pendingChoice;
  if (pending?.playerId === human) return pending.kind === "reversal" ? "reversal-window" : "defense-window";
  if (game.activePlayer !== human || game.winner !== null) return "ai-ready";
  if (game.phase === "Initiate") return "player-initiate";
  if (game.phase === "Yell") return "player-yell";
  if (game.phase === "Ascend" || game.phase === "Hide") return "player-ascend";
  return "ai-ready";
}

export function seatStats(game: EngineGame, seat: EngineSeat) {
  return {
    atk: seat.atk + game.statusValue(seat, "modifyAttackPower"),
    def: seat.def + game.statusValue(seat, "modifyDefense"),
    speed: seat.speed + seat.tempSpeed,
  };
}

const DURATION_LABEL: Record<string, string> = {
  nextAttack: "next Attack", nextDefense: "next Defense", nextIncomingAttack: "next incoming Attack", endOfTurn: "this turn",
  endOfRound: "this round", nextHonor: "until Honor", nextTurn: "next turn", nextPurchase: "next purchase", whileEquipped: "while equipped", game: "this game", turn: "this turn",
};
const STATUS_LABEL: Record<string, (amount: number, value: unknown) => string> = {
  modifyAttackPower: (amount) => `${signed(amount)} Attack Power`,
  modifyDefense: (amount) => `${signed(amount)} DEF`,
  modifyGuard: (amount) => `${signed(amount)} Guard`,
  modifyCost: (amount) => `${signed(amount)} cost`,
  preventDamage: (amount) => `Prevent ${amount}`,
  piercing: (amount) => `Pierce ${amount}`,
  restrictAttack: () => "Cannot attack",
  restrictReaction: () => "No Reactions",
  restrictConsumable: () => "No Consumables",
  restrictWeapon: () => "No Weapons",
  untargetable: () => "Untargetable",
  nextAttackZone: (_amount, value) => `Next Attack: ${String(value ?? "zone")}`,
  kataFocusBonus: (amount) => `+${amount} Focus from Kata`,
  tempoLocked: () => "Tempo locked",
};
const signed = (amount: number) => `${amount >= 0 ? "+" : ""}${amount}`;
const humanize = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());

export function statusLabels(seat: EngineSeat): string[] {
  const labels = (seat.statuses ?? []).map((status: EngineStatus) => {
    const label = STATUS_LABEL[status.action]?.(Number(status.amount ?? 0), status.value) ?? humanize(status.action);
    const duration = status.duration ? DURATION_LABEL[status.duration] : null;
    return duration ? `${label} · ${duration}` : label;
  });
  if (seat.tempo) labels.unshift("Tempo ready");
  return [...new Set(labels)].slice(0, 6);
}

/** The most recent attack, as a receipt for the combat stage. */
export function latestExchange(game: EngineGame): Exchange | null {
  for (let index = game.events.length - 1; index >= 0; index -= 1) {
    const event = game.events[index];
    if (event.type !== "attack") continue;
    const breakdown = event.breakdown as { attackParts?: { label: string; value: number }[]; blockParts?: { label: string; value: number }[] } | undefined;
    const notes = [...(breakdown?.attackParts ?? []), ...(breakdown?.blockParts ?? [])].filter((part) => part.value).map((part) => `${part.label} ${signed(part.value)}`);
    return {
      key: `${index}`, attacker: Number(event.attacker), defender: Number(event.defender),
      attackCard: cardByCatalogId(event.card), defenseCard: cardByCatalogId(event.defense),
      zone: typeof event.zone === "string" ? event.zone : null, attack: Number(event.attack), block: Number(event.block), damage: Number(event.damage),
      reversal: Boolean(event.reversal), notes,
    };
  }
  return null;
}

export function fightLog(game: EngineGame, human: number, limit = 32): string[] {
  const name = (id: unknown) => typeof id === "number" && game.players[id] ? (id === human ? "You" : game.players[id].character.name) : "Someone";
  const possessive = (id: unknown) => id === human ? "your" : `${name(id)}'s`;
  const verb = (id: unknown, you: string, other: string) => id === human ? you : other;
  const lines: string[] = [];
  for (const event of game.events.slice(-160)) {
    const line = describe(event);
    if (line) lines.push(line);
  }
  return lines.slice(-limit).reverse();

  function describe(event: EngineEvent): string | null {
    switch (event.type) {
      case "attack": return Number(event.damage) > 0
        ? `${name(event.attacker)} ${verb(event.attacker, "hit", "hits")} ${name(event.defender)} with ${cardName(event.card)} for ${event.damage}. Attack ${event.attack} vs Defense ${event.block}.`
        : `${name(event.defender)} ${verb(event.defender, "block", "blocks")} ${possessive(event.attacker)} ${cardName(event.card)}${event.defense ? ` with ${cardName(event.defense)}` : ""}. Attack ${event.attack} vs Defense ${event.block}.`;
      case "knockout": return `K.O.! ${name(event.player)} ${verb(event.player, "are", "is")} down.`;
      case "promotion": return `${name(event.player)} ${verb(event.player, "promote", "promotes")} to ${event.belt} Belt.`;
      case "belt-exam": return `${name(event.player)} ${verb(event.player, "complete", "completes")} a Belt Exam.`;
      case "scene-change": return `Scene Change: ${cardName(event.location)}.`;
      case "purchase": return `${name(event.player)} ${verb(event.player, "buy", "buys")} ${cardName(event.card)} for ${event.cost} Focus.`;
      case "combo-learned": return `${name(event.player)} ${verb(event.player, "learn", "learns")} ${cardName(event.combo)}.`;
      case "combo-completed": return `Combo! ${possessive(event.player).replace(/^./, (letter) => letter.toUpperCase())} ${cardName(event.combo)} fires.`;
      case "defense-practice": return `${name(event.player)} ${verb(event.player, "practice", "practices")} ${cardName(event.card)} for ${event.focus} Focus.`;
      case "bad-habit-focus": return `${name(event.player)} ${verb(event.player, "cash", "cashes")} in a Bad Habit for ${event.focus} Focus.`;
      case "card-destroyed": return `${possessive(event.player).replace(/^./, (letter) => letter.toUpperCase())} ${cardName(event.card)} is destroyed.`;
      case "training-stripe-awarded": return `${name(event.player)} ${verb(event.player, "earn", "earns")} a Training Stripe.`;
      case "training-stripe-spent": return `${name(event.player)} ${verb(event.player, "spend", "spends")} a Training Stripe to heal.`;
      case "victory": return `${name(event.player)} ${verb(event.player, "win", "wins")}.`;
      case "card-boxed": return `${possessive(event.player).replace(/^./, (letter) => letter.toUpperCase())} ${cardName(event.card)} is used up and returns to the box.`;
      case "reaction": return `${name(event.player)} ${verb(event.player, "react", "reacts")} with ${cardName(event.card)}.`;
      case "attack-spent": return `${possessive(event.attacker).replace(/^./, (letter) => letter.toUpperCase())} ${cardName(event.card)} finds nobody there: ${name(event.defender)} ${verb(event.defender, "are", "is")} untargetable.`;
      case "unsupported-effect": return `${cardName(event.card)}: part of this effect is not automated yet.`;
      default: return null;
    }
  }
}

/** The card an opponent has declared against you while you decide how to respond. */
export function incomingAttack(game: EngineGame, human: number): EngineCard | null {
  const pending = game.pendingChoice;
  if (!pending || pending.playerId !== human || pending.attackerId === undefined || !pending.cardId) return null;
  const attacker = game.players[pending.attackerId];
  return [...attacker.hand, ...attacker.played].find((card) => card.instanceId === pending.cardId) ?? null;
}

const CHOICE_TITLE: Record<string, string> = {
  defense: "Defend or take the hit", reaction: "Play a Reaction?", "card-boxed": "Card returned to the box", reversal: "Reversal window", "attack-zone": "Declare the zone",
  "card-movement": "Choose a card", "cycle-discard-draw": "Discard to draw?", "deck-look": "Choose from the revealed cards",
  "discard-or-destroy": "Discard or destroy", "equipment-toggle": "Choose Equipment", "hit-choice": "Choose the hit effect",
  "incoming-attack-choice": "Answer the incoming Attack", "zone-choice": "Choose a zone", structured: "Resolve the printed effect",
};

export function choiceTitle(pending: EnginePending) {
  return CHOICE_TITLE[pending.kind] ?? "Your decision";
}

export function choicePrompt(game: EngineGame, pending: EnginePending, human: number) {
  const incoming = incomingAttack(game, human);
  const attacker = pending.attackerId !== undefined ? game.players[pending.attackerId]?.character.name : null;
  if (pending.kind === "defense") return `${attacker ?? "Your opponent"} attacks ${pending.zone ? `${pending.zone} ` : ""}with ${incoming?.name ?? "an Attack"}. Play a Defense that covers that zone, or take the hit.`;
  if (pending.kind === "reaction" && pending.window === "after-block") return "You blocked it. You may play a Reaction that works after a Block, or pass.";
  if (pending.kind === "reaction") return `${attacker ?? "Your opponent"} declared ${incoming?.name ?? "an Attack"}. You may play a Reaction before choosing a Defense.`;
  if (pending.kind === "reversal") return "You blocked it. Counter with a Reversal Attack, or let the moment pass.";
  if (pending.kind === "attack-zone") return "This Attack can go High, Mid or Low. Choose where it lands.";
  if (pending.kind === "zone-choice") return "Choose a zone for this effect.";
  const source = typeof pending.sourceCardId === "string" ? findInstance(game, pending.sourceCardId)?.name : null;
  return source ? `${source} asks you to choose.` : "Choose one option.";
}

export function findInstance(game: EngineGame, instanceId: string): EngineCard | null {
  for (const seat of game.players) {
    for (const zone of [seat.hand, seat.played, seat.equipment, seat.deck, seat.discard, seat.destroyed ?? []]) {
      const card = zone.find((entry) => entry.instanceId === instanceId);
      if (card) return card;
    }
  }
  return game.market.find((card) => card.instanceId === instanceId) ?? null;
}

export function reasonLabel(reason: string) {
  return ({ knockout: "knockout", "round-limit": "round limit", "last-fighter-standing": "last fighter standing", "black-belt": "Black Belt Victory" } as Record<string, string>)[reason] ?? reason;
}
