/**
 * Arena rule variant: the real Quick Duel rules plus draft status effects (content/experimental/status-effects.json).
 *
 * ArenaGame extends the canonical Game the way BossBlitzGame does, and only adds to it through the engine's own
 * seams, so a normal match is untouched and the Test Arena plays a real battle:
 *   - Speed and DEF changes go through statusValue("modifySpeed" / "modifyDefense"), like every printed modifier.
 *   - Laminate's extra damage rides the "damageIncoming" event; Reimburse and loaded effects ride "hit".
 *   - Round effects resolve at Honor (startRoundStatuses); "until your next turn" effects end at Hide.
 *   - Attack legality uses getLegalActions / attackZoneOptions / beginAttack; Defense cards use defenseOptions.
 *   - Prices use purchasePlan and comboLearnCost.
 * Deterministic (no randomness), framework-free, and it never looks at a card's name or ID.
 *
 * Every change is announced as an `arena-effect` event: { kind, player, effect, ... } so the mat can animate it.
 */
import { Game } from "./core.mjs";

const sum = (list, read) => list.reduce((total, entry) => total + read(entry), 0);

export class ArenaGame extends Game {
  constructor(data, config = {}) {
    super(data, config);
    const json = config.arenaEffects;
    if (!json) throw new Error("ArenaGame needs config.arenaEffects (content/experimental/status-effects.json).");
    this.arenaCatalog = { effects: new Map(json.effects.map((effect) => [effect.id, effect])), keywords: new Map(json.keywords.map((keyword) => [keyword.id, keyword])) };
    for (const player of this.players) this.arenaState(player);
  }

  // ---- State ----------------------------------------------------------------------------------------------------
  arenaState(player) {
    player.arena ??= { effects: [], grace: {}, armed: null, reimburse: false, healedRound: null, lastZone: null };
    return player.arena;
  }

  arenaEffect(player, effectId) { return this.arenaState(player).effects.find((entry) => entry.id === effectId) ?? null; }

  arenaRule(effectId) { return this.arenaCatalog.effects.get(effectId); }

  /** Sum of a numeric rule field over a fighter's effects; `perStack` multiplies by stacks. */
  arenaTotal(player, field, perStack = false) {
    return sum(this.arenaState(player).effects, (entry) => (this.arenaRule(entry.id)?.[field] ?? 0) * (perStack ? entry.stacks : 1));
  }

  arenaHas(player, flag) { return this.arenaState(player).effects.some((entry) => this.arenaRule(entry.id)?.[flag]); }

  announce(kind, player, fields = {}) {
    const rule = fields.effect ? this.arenaRule(fields.effect) ?? this.arenaCatalog.keywords.get(fields.effect) : null;
    this.emit({ type: "arena-effect", kind, player: player.id, ...(rule ? { effectName: rule.name } : {}), ...fields });
  }

  dropArenaEffect(player, effectId, reason) {
    const state = this.arenaState(player);
    if (!state.effects.some((entry) => entry.id === effectId)) return false;
    state.effects = state.effects.filter((entry) => entry.id !== effectId);
    const rule = this.arenaRule(effectId);
    if (rule?.graceRounds) state.grace[effectId] = rule.graceRounds;
    if (rule?.zoneLock) state.lastZone = null;
    this.announce(reason === "torn" ? "torn" : "ended", player, { effect: effectId, reason });
    return true;
  }

  // ---- Applying effects -----------------------------------------------------------------------------------------
  /** Put an effect on a fighter (a card, a loaded Hit, or the arena console). Returns true if it landed. */
  applyArenaEffect(target, effectId, { stacks = 1, source = null } = {}) {
    const rule = this.arenaRule(effectId);
    if (!rule) throw new Error(`Unknown arena effect: ${effectId}`);
    if (!target || target.hp <= 0 || target.eliminated) return false;
    const state = this.arenaState(target);
    if ((state.grace[effectId] ?? 0) > 0) { this.announce("resisted", target, { effect: effectId, reason: "grace", source }); return false; }
    const existing = this.arenaEffect(target, effectId);
    if (existing && rule.maxStacks === 1 && !rule.refreshOnReapply) { this.announce("resisted", target, { effect: effectId, reason: "already", source }); return false; }
    if (rule.thaws && this.arenaEffect(target, "freeze")) this.dropArenaEffect(target, "freeze", "melted");
    if (existing) {
      existing.stacks = Math.min(rule.maxStacks, existing.stacks + stacks);
      if (rule.refreshOnReapply && rule.duration) existing.turns = rule.duration;
      this.announce("stacked", target, { effect: effectId, stacks: existing.stacks, source });
    } else {
      state.effects.push({ id: effectId, stacks: Math.min(rule.maxStacks, stacks), turns: rule.duration ?? null });
      this.announce("applied", target, { effect: effectId, stacks: Math.min(rule.maxStacks, stacks), source });
    }
    return true;
  }

  /** Load an effect onto a fighter's next Hit (how a card that applies it on Hit would behave). */
  armArenaEffect(player, effectId, stacks = 1) {
    if (effectId && !this.arenaRule(effectId)) throw new Error(`Unknown arena effect: ${effectId}`);
    this.arenaState(player).armed = effectId ? { effect: effectId, stacks } : null;
    if (effectId) this.announce("armed", player, { effect: effectId, stacks });
  }

  /** Give a fighter a Reimburse weapon (the keyword), or take it away. */
  setReimburse(player, on) { this.arenaState(player).reimburse = Boolean(on); }

  // ---- Stats through the engine's own status channel -------------------------------------------------------------
  statusValue(player, action, options = {}) {
    const base = super.statusValue(player, action, options);
    if (action === "modifySpeed") return base + this.arenaTotal(player, "speedModifier");
    if (action === "modifyDefense") return base + this.arenaTotal(player, "defenseModifier");
    if (action === "modifyGuard") return base - this.arenaTotal(player, "guardPenaltyPerStack", true);
    return base;
  }

  // ---- What may be played ---------------------------------------------------------------------------------------
  lockedZone(player) { return this.arenaHas(player, "zoneLock") ? this.arenaState(player).lastZone : null; }

  attackZoneOptions(player, card, options = {}) {
    const zones = super.attackZoneOptions(player, card, options);
    const lock = this.lockedZone(player);
    return lock ? zones.filter((option) => option.zone === lock) : zones;
  }

  /** Can this Attack be declared at all under the fighter's effects? */
  arenaAttackAllowed(player, card) {
    if (this.arenaHas(player, "blocksAttacks")) return false;
    const lock = this.lockedZone(player);
    return !lock || this.attackZoneOptions(player, card).length > 0;
  }

  getLegalActions(playerId = this.activePlayer) {
    const legal = super.getLegalActions(playerId);
    const player = this.players[playerId];
    if (!player || this.pendingChoice) return legal;
    return legal.filter((action) => {
      if (action.type === "play-attack") return this.arenaAttackAllowed(player, player.hand.find((card) => card.instanceId === action.cardId));
      if (action.type === "learn-combo") return this.comboLearnCost(player, player.comboOffered) <= player.focus;
      return true;
    });
  }

  defenseOptions(defender, window) {
    return this.arenaHas(defender, "blocksDefense") ? [] : super.defenseOptions(defender, window);
  }

  /** The Denied stamp: the card is discarded with no effect. */
  voidCard(player, card) {
    this.dropArenaEffectSilently(player, "denied");
    this.moveCard(player, card, "discard");
    this.announce("denied", player, { effect: "denied", card: card.catalogId, cardName: card.name });
    return true;
  }

  dropArenaEffectSilently(player, effectId) { const state = this.arenaState(player); state.effects = state.effects.filter((entry) => entry.id !== effectId); }

  beginAttack(playerId, card, action = {}) {
    const attacker = this.players[playerId];
    if (!card || !attacker) return false;
    if (!action.reversal && this.arenaHas(attacker, "voidsNextCard") && attacker.hand.includes(card)) return this.voidCard(attacker, card);
    if (!this.arenaAttackAllowed(attacker, card)) return false;
    if (this.lockedZone(attacker) && action.zone && action.zone !== this.lockedZone(attacker)) {
      this.announce("zone-locked", attacker, { effect: "stapled", from: action.zone, to: this.lockedZone(attacker) });
      action = { ...action, zone: this.lockedZone(attacker) };
    }
    if (!action.reversal) this.joltIfCharged(attacker);
    const declared = super.beginAttack(playerId, card, action);
    const cuts = this.arenaTotal(attacker, "selfDamageOnAttackPerStack", true);
    if (declared && cuts > 0) {
      attacker.hp = Math.max(0, attacker.hp - cuts);
      this.announce("cut", attacker, { effect: "papercut", amount: cuts });
    }
    return declared;
  }

  resolvePlayedCard(player, card, options = {}) {
    if (card && player.hand.includes(card) && this.arenaHas(player, "voidsNextCard") && this.canPlayCard(player, card)) { this.voidCard(player, card); return { voided: true }; }
    if (card && player.hand.includes(card) && this.canPlayCard(player, card)) this.joltIfCharged(player);
    return super.resolvePlayedCard(player, card, options);
  }

  /** Remember the zone of each Attack for Stapled. */
  markComboAttack(player, card, zone, flags = {}) {
    super.markComboAttack(player, card, zone, flags);
    if (!flags.reversal && zone) this.arenaState(player).lastZone = zone;
  }

  /** Static Shock: the first card played on your own turn jolts you. Called before an Attack or card resolves. */
  joltIfCharged(player) {
    const jolt = this.arenaTotal(player, "joltOnFirstCard");
    if (!jolt || player.id !== this.activePlayer) return;
    const state = this.arenaState(player);
    const key = `${this.round}:${this.turns}`;
    if (state.joltedTurn === key) return;
    state.joltedTurn = key;
    player.hp = Math.max(0, player.hp - jolt);
    this.announce("jolt", player, { effect: "shock", amount: jolt });
  }

  /** Static Shock takes away Tempo. */
  hasTempoAdvantage(fighter, opposing) {
    return !this.arenaHas(fighter, "noTempo") && super.hasTempoAdvantage(fighter, opposing);
  }

  /** Rush Order: an extra card at the start of your turn ("drawOnce" effects pay it out a single time). */
  startTurn(player) {
    super.startTurn(player);
    if (player.hp <= 0) return;
    for (const entry of this.arenaState(player).effects) {
      const rule = this.arenaRule(entry.id);
      if (!rule?.drawAtTurnStart || (rule.drawOnce && entry.drawn)) continue;
      entry.drawn = true;
      this.draw(player, rule.drawAtTurnStart);
      this.announce("rush-draw", player, { effect: entry.id, amount: rule.drawAtTurnStart });
    }
  }

  // ---- Prices -----------------------------------------------------------------------------------------------------
  purchasePlan(player, card) {
    const plan = super.purchasePlan(player, card);
    const tax = this.arenaTotal(player, "focusTaxPerStack", true);
    return tax && Number.isFinite(plan.price) ? { ...plan, price: plan.price + tax } : plan;
  }

  comboLearnCost(player, combo) { return super.comboLearnCost(player, combo) + this.arenaTotal(player, "focusTaxPerStack", true); }

  // ---- Combat ---------------------------------------------------------------------------------------------------
  characterEvent(player, type, event = {}) {
    const result = super.characterEvent(player, type, event);
    if (!player) return result;
    if (type === "damageIncoming" && result.damage > 0) {
      const crease = this.arenaTotal(player, "bonusDamageTakenPerStack", true);
      if (crease > 0) { result.damage += crease; this.announce("crease", player, { effect: "brittle", amount: crease }); }
    }
    if (type === "damageIncoming" && result.damage > 0) {
      const barrier = this.arenaState(player).effects.find((entry) => this.arenaRule(entry.id)?.absorbPerStack);
      if (barrier) {
        const absorbed = Math.min(result.damage, barrier.stacks * this.arenaRule(barrier.id).absorbPerStack);
        result.damage -= absorbed;
        barrier.stacks -= Math.ceil(absorbed / this.arenaRule(barrier.id).absorbPerStack);
        this.announce("absorbed", player, { effect: barrier.id, amount: absorbed, left: barrier.stacks });
        if (barrier.stacks <= 0) this.dropArenaEffect(player, barrier.id, "used");
      }
    }
    if (type === "damageIncoming" && result.damage > 0) {
      const laminate = this.arenaEffect(player, "freeze");
      if (laminate) {
        const bonus = this.arenaRule("freeze").tearBonusDamage ?? 0;
        result.damage += bonus;
        this.dropArenaEffect(player, "freeze", "torn");
        this.announce("tear", player, { effect: "freeze", amount: bonus });
      }
    }
    if (type === "hit" && Number(event.damage) > 0) this.afterArenaHit(player, event.opponent, Number(event.damage));
    return result;
  }

  afterArenaHit(attacker, defender, damage) {
    const state = this.arenaState(attacker);
    if (state.armed && defender) {
      const { effect, stacks } = state.armed;
      state.armed = null;
      this.applyArenaEffect(defender, effect, { stacks, source: attacker.id });
    }
    const keyword = this.arenaCatalog.keywords.get("reimburse");
    if (!state.reimburse || !keyword || damage < keyword.minDamage || attacker.hp <= 0) return;
    if (state.healedRound === this.round) { this.announce("reimburse-capped", attacker, { effect: "reimburse" }); return; }
    state.healedRound = this.round;
    const amount = Math.min(Math.max(0, keyword.amount - this.arenaTotal(attacker, "healingPenalty")), attacker.maxHp - attacker.hp);
    if (amount <= 0) { this.announce("reimburse-smudged", attacker, { effect: "reimburse", from: defender?.id ?? null }); return; }
    attacker.hp += amount;
    this.announce("reimburse", attacker, { effect: "reimburse", amount, from: defender?.id ?? null });
  }

  // ---- Time -------------------------------------------------------------------------------------------------------
  /** Honor: Scorch and Ink tick, Ink fades, round timers run down, immunity wears off. */
  startRoundStatuses(player) {
    super.startRoundStatuses(player);
    const state = this.arenaState(player);
    for (const [effectId, rule] of this.arenaCatalog.effects) {
      const entry = this.arenaEffect(player, effectId);
      if (!entry || player.hp <= 0) continue;
      const amount = (rule.honorDamagePerStack ?? 0) * entry.stacks;
      if (amount > 0) {
        player.hp = Math.max(0, player.hp - amount);
        this.announce("tick", player, { effect: effectId, amount, stacks: entry.stacks });
      }
      if (rule.decayPerRound) {
        entry.stacks -= rule.decayPerRound;
        if (entry.stacks <= 0) { this.dropArenaEffect(player, effectId, "faded"); continue; }
      }
      if (entry.turns !== null && (rule.durationUnit ?? "rounds") === "rounds") {
        entry.turns -= 1;
        if (entry.turns <= 0) this.dropArenaEffect(player, effectId, "time");
      }
    }
    for (const key of Object.keys(state.grace)) {
      if (state.grace[key] > 0) state.grace[key] -= 1;
      if (state.grace[key] <= 0) delete state.grace[key];
    }
  }

  /** End of the fighter's own turn: "until the end of your next turn" effects run down. */
  hide(player) {
    super.hide(player);
    for (const entry of [...this.arenaState(player).effects]) {
      if (entry.turns === null || this.arenaRule(entry.id)?.durationUnit !== "ownTurns") continue;
      entry.turns -= 1;
      if (entry.turns <= 0) this.dropArenaEffect(player, entry.id, "time");
    }
  }

  /** Honor damage can knock a fighter out; settle that before the round goes on. */
  advanceAutomaticEvents() {
    const advanced = super.advanceAutomaticEvents();
    if (this.winner === null && this.players.some((player) => player.hp <= 0 && !player.eliminated)) this.checkWinner();
    return advanced;
  }
}
