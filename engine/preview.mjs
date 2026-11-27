/**
 * Damage previews: "what would this card do right now?" for the player deciding.
 *
 * A preview plays the decision out on a private copy of the table (see game-clone.mjs) and reads
 * the combat numbers the engine itself produced, so it always agrees with the real result unless
 * hidden information or chance intervenes. The real game, its pending choices and its random
 * numbers are never touched. Nothing here knows a card by name.
 *
 *   previewAttack(game, seat, cardInstanceId, { targetId, zone })
 *       What this Attack does if nothing else changes: the opponent plays no Defense card, so it
 *       meets only their standing DEF, Armor, Equipment and statuses. Any-zone Attacks report
 *       every zone and pick the best one.
 *   previewDefense(game, seat)
 *       While a strike is incoming, what each of your options (take it, each Defense card, each
 *       Reaction) would leave you with.
 */
import { cloneGame } from "./game-clone.mjs";

const ZONES = ["High", "Mid", "Low"];
const WINDOW_KINDS = new Set(["reaction", "defense"]);
const MAX_SETTLE_STEPS = 16;

const toZones = (card) => {
  const printed = String(card.zone ?? "").split(",").map((zone) => zone.trim()).filter(Boolean);
  if (!printed.length || printed.includes("Any")) return card.zone === "Any" ? ZONES : [undefined];
  return printed.length > 1 ? printed : [undefined];
};

/** Close the Reaction and Defense windows with "pass" and every other choice with its default. */
function settle(sim) {
  for (let step = 0; step < MAX_SETTLE_STEPS && sim.pendingChoice && sim.winner === null; step += 1) {
    const pending = sim.pendingChoice;
    const passes = WINDOW_KINDS.has(pending.kind) && pending.options.some((option) => option.id === "pass");
    if (!(passes ? sim.resolveChoice({ optionId: "pass" }) : sim.resolveChoice(sim.defaultChoice()))) return;
  }
}

const strikeEvent = (sim, matches) => sim.events.find((event) => event.type === "attack" && matches(event)) ?? null;

const partsOf = (parts = []) => parts.filter((part) => part && part.value).map((part) => ({ label: part.label, value: part.value }));

function readStrike(event, before, after) {
  if (!event) return { resolved: false, attack: null, block: null, damage: 0, prevented: 0, attackParts: [], blockParts: [] };
  const breakdown = event.breakdown ?? {};
  return {
    resolved: true,
    attack: event.attack, block: event.block, damage: event.damage,
    prevented: breakdown.prevented ?? 0, piercing: breakdown.piercing ?? 0,
    attackParts: partsOf(breakdown.attackParts), blockParts: partsOf(breakdown.blockParts),
    defenseFocus: event.defenseFocus ?? 0, reversal: Boolean(event.reversal),
    ...before, ...after,
  };
}

const hpOf = (game, seat) => game.players[seat]?.hp ?? 0;

/** What an Attack from `seat` would do to `targetId` if they play no Defense card. */
export function previewAttack(game, seat, cardInstanceId, { targetId, zone } = {}) {
  const attacker = game.players[seat];
  const card = attacker?.hand.find((candidate) => candidate.instanceId === cardInstanceId);
  if (!card || game.winner !== null) return null;
  const target = targetId ?? game.defaultTargetId?.(seat);
  if (target === null || target === undefined || !game.players[target]) return null;
  const zones = zone ? [zone] : toZones(card);
  const results = [];
  for (const candidate of zones) {
    try {
      const sim = cloneGame(game);
      const simCard = sim.players[seat].hand.find((entry) => entry.instanceId === cardInstanceId);
      if (!sim.beginAttack(seat, simCard, { targetId: target, ...(candidate ? { zone: candidate } : {}) })) continue;
      settle(sim);
      const event = strikeEvent(sim, (entry) => entry.attacker === seat);
      const strike = readStrike(event, { targetHp: hpOf(game, target), attackerHp: hpOf(game, seat) }, { targetHpAfter: hpOf(sim, target), attackerHpAfter: hpOf(sim, seat) });
      results.push({ ...strike, zone: event?.zone ?? candidate ?? card.zone ?? null, lethal: strike.resolved && hpOf(sim, target) <= 0 });
    } catch {
      continue;
    }
  }
  if (!results.length) return null;
  const best = results.reduce((top, entry) => (entry.damage > top.damage ? entry : top), results[0]);
  return { kind: "attack", seat, targetId: target, cardId: cardInstanceId, ...best, byZone: results.length > 1 ? results : undefined };
}

/** Each option of a pending Reaction or Defense window, resolved on its own copy of the table. */
export function previewDefense(game, seat) {
  const pending = game.pendingChoice;
  if (!pending || pending.playerId !== seat || !WINDOW_KINDS.has(pending.kind) || game.winner !== null) return null;
  const incoming = { attackerId: pending.attackerId, cardId: pending.cardId, zone: pending.zone ?? null };
  const options = [];
  const run = (steps, option, via = null) => {
    try {
      const sim = cloneGame(game);
      for (const optionId of steps) if (!sim.resolveChoice({ optionId })) return;
      settle(sim);
      const event = strikeEvent(sim, (entry) => entry.defender === seat);
      const strike = readStrike(event, { hp: hpOf(game, seat), attackerHp: hpOf(game, pending.attackerId) }, { hpAfter: hpOf(sim, seat), attackerHpAfter: hpOf(sim, pending.attackerId) });
      options.push({ optionId: option.id, label: option.label, via, ...strike, avoided: !strike.resolved, lethal: hpOf(sim, seat) <= 0 });
    } catch {
      /* an option the engine will not resolve is simply left out */
    }
  };
  for (const option of pending.options) run([option.id], option);
  // In a Reaction Window the Defense cards come after it closes: preview them as "pass, then this".
  if (pending.kind === "reaction") {
    for (const option of pending.defenseOptions ?? []) if (option.id !== "pass") run(["pass", option.id], option, "reaction-pass");
  }
  const byOption = Object.fromEntries(options.map((entry) => [entry.optionId, entry]));
  const takeIt = options.find((entry) => entry.optionId === "pass");
  return { kind: "defense", seat, window: pending.window ?? pending.kind, ...incoming, hp: hpOf(game, seat), takeTheHit: takeIt ?? null, options, byOption };
}
