/**
 * Draft status effects (burn, poison, freeze) and the Reimburse keyword, driven entirely by
 * content/experimental/status-effects.json. Framework-free and deterministic (no randomness at all).
 *
 * EXPERIMENTAL: the Test Arena uses this on small "combatants" so the effects can be seen and tuned before
 * any card carries them. It is not wired into engine/core.mjs. When an effect is approved it moves into
 * content/dojo-game.json and the real resolvers; this module is the readable reference for how it should behave.
 *
 * Every function mutates the combatants it is given and returns the events it produced, in order, so a UI can
 * replay them as animation and a test can assert them. Nothing here knows a card by name.
 */

export function createCatalog(json) {
  return {
    effects: new Map(json.effects.map((effect) => [effect.id, effect])),
    keywords: new Map(json.keywords.map((keyword) => [keyword.id, keyword])),
  };
}

/** A fighter for the arena: stats, the keywords it carries (e.g. a Reimburse weapon), and its statuses. */
export function createCombatant({ id, name, hp = 25, maxHp = hp, atk = 3, def = 2, speed = 3, keywords = [] }) {
  return { id, name, hp, maxHp, atk, def, speed, keywords: [...keywords], statuses: [], grace: {}, healedThisRound: 0 };
}

export const statusOf = (combatant, effectId) => combatant.statuses.find((status) => status.id === effectId) ?? null;
export const isFrozen = (combatant) => Boolean(statusOf(combatant, "freeze"));

/** Can this fighter take the action ("attack" or "reaction") right now? Statuses carry a `blocks` list. */
export function canAct(catalog, combatant, action) {
  return !combatant.statuses.some((status) => catalog.effects.get(status.id)?.blocks?.includes(action));
}

/** Speed after statuses (Freeze lowers it). */
export function effectiveSpeed(catalog, combatant) {
  return Math.max(0, combatant.speed - combatant.statuses.reduce((total, status) => total + (catalog.effects.get(status.id)?.speedPenalty ?? 0), 0));
}

const remove = (combatant, effectId) => { combatant.statuses = combatant.statuses.filter((status) => status.id !== effectId); };
const healingPenalty = (catalog, combatant) => combatant.statuses.reduce((total, status) => total + (catalog.effects.get(status.id)?.healingPenalty ?? 0), 0);

/** Put a status on a fighter. Returns events: applied, stacked, resisted, thaw. */
export function applyStatus(catalog, target, effectId, { stacks = 1, source = null } = {}) {
  const effect = catalog.effects.get(effectId);
  if (!effect) throw new Error(`Unknown status effect: ${effectId}`);
  const events = [];
  if (target.hp <= 0) return events;
  if (effect.graceRounds && (target.grace[effectId] ?? 0) > 0) return [{ type: "resisted", target: target.id, effect: effectId, reason: "grace" }];
  const existing = statusOf(target, effectId);
  if (existing && effect.maxStacks === 1) return [{ type: "resisted", target: target.id, effect: effectId, reason: "already" }];
  if (effect.thaws && isFrozen(target)) {
    remove(target, "freeze");
    target.grace.freeze = catalog.effects.get("freeze")?.graceRounds ?? 0;
    events.push({ type: "thaw", target: target.id, effect: "freeze", by: effectId });
  }
  if (existing) {
    const before = existing.stacks;
    existing.stacks = Math.min(effect.maxStacks, existing.stacks + stacks);
    if (effect.refreshOnReapply && effect.duration) existing.turns = effect.duration;
    events.push({ type: "stacked", target: target.id, effect: effectId, stacks: existing.stacks, gained: existing.stacks - before, source });
  } else {
    target.statuses.push({ id: effectId, stacks: Math.min(effect.maxStacks, stacks), turns: effect.duration ?? null });
    events.push({ type: "applied", target: target.id, effect: effectId, stacks: Math.min(effect.maxStacks, stacks), source });
  }
  return events;
}

/**
 * One Attack. `power` is the card's Attack Power; the attacker's ATK adds to it and the defender's DEF absorbs it.
 * Freeze stops a frozen attacker, and shatters on the first Hit it takes. Reimburse heals the attacker.
 */
export function strike(catalog, attacker, defender, { power = 3 } = {}) {
  if (attacker.hp <= 0 || defender.hp <= 0) return [];
  if (!canAct(catalog, attacker, "attack")) return [{ type: "blocked", actor: attacker.id, action: "attack", effect: attacker.statuses.find((status) => catalog.effects.get(status.id)?.blocks?.includes("attack"))?.id ?? null }];
  const raw = Math.max(0, power + attacker.atk);
  const absorbed = Math.min(defender.def, raw);
  let dealt = raw - absorbed;
  const events = [{ type: "strike", actor: attacker.id, target: defender.id, raw, absorbed }];
  if (dealt <= 0) { events.push({ type: "absorbed", target: defender.id, amount: absorbed }); return events; }
  const frozen = statusOf(defender, "freeze");
  if (frozen) {
    const bonus = catalog.effects.get("freeze")?.shatter?.bonusDamage ?? 0;
    dealt += bonus;
    remove(defender, "freeze");
    defender.grace.freeze = catalog.effects.get("freeze")?.graceRounds ?? 0;
    events.push({ type: "shatter", target: defender.id, bonus });
  }
  defender.hp = Math.max(0, defender.hp - dealt);
  events.push({ type: "damage", target: defender.id, amount: dealt, absorbed, source: attacker.id });
  if (defender.hp <= 0) events.push({ type: "ko", target: defender.id });
  for (const keywordId of attacker.keywords) {
    const keyword = catalog.keywords.get(keywordId);
    if (keyword?.id !== "reimburse" || dealt < keyword.minDamage || attacker.hp <= 0) continue;
    if (attacker.healedThisRound >= keyword.capPerRound) { events.push({ type: "heal-capped", target: attacker.id, keyword: keyword.id }); continue; }
    const penalty = healingPenalty(catalog, attacker);
    const amount = Math.min(Math.max(0, keyword.amount - penalty), attacker.maxHp - attacker.hp);
    attacker.healedThisRound += 1;
    if (amount <= 0) { events.push({ type: "heal-reduced", target: attacker.id, keyword: keyword.id, penalty }); continue; }
    attacker.hp += amount;
    events.push({ type: "heal", target: attacker.id, amount, keyword: keyword.id, from: defender.id });
  }
  return events;
}

/** Honor: tick every fighter's statuses in catalog order (Burn, Poison, then Freeze timers), then reset per-round caps. */
export function endRound(catalog, combatants) {
  const events = [];
  for (const combatant of combatants) {
    for (const [effectId, effect] of catalog.effects) {
      const status = statusOf(combatant, effectId);
      if (!status || combatant.hp <= 0) continue;
      if (effect.tick) {
        const amount = (effect.tick.damagePerStack ?? 0) * status.stacks;
        if (amount > 0) {
          combatant.hp = Math.max(0, combatant.hp - amount);
          events.push({ type: "tick", target: combatant.id, effect: effectId, amount, stacks: status.stacks });
          if (combatant.hp <= 0) events.push({ type: "ko", target: combatant.id });
        }
      }
      if (effect.decayPerRound) {
        status.stacks -= effect.decayPerRound;
        if (status.stacks <= 0) { remove(combatant, effectId); events.push({ type: "expire", target: combatant.id, effect: effectId }); continue; }
      }
      if (status.turns !== null) {
        status.turns -= 1;
        if (status.turns <= 0) {
          remove(combatant, effectId);
          events.push({ type: effectId === "freeze" ? "thaw" : "expire", target: combatant.id, effect: effectId, by: "time" });
          if (effect.graceRounds) combatant.grace[effectId] = effect.graceRounds + 1; // +1: this Honor's decrement below
        }
      }
    }
    for (const key of Object.keys(combatant.grace)) if (combatant.grace[key] > 0) combatant.grace[key] -= 1;
    combatant.healedThisRound = 0;
  }
  return events;
}
