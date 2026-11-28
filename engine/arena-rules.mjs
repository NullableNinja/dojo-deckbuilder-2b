/**
 * Arena rule variant: the real Quick Duel rules plus draft status effects (content/experimental/status-effects.json).
 *
 * `withStatusEffects(Base)` wraps any engine class (Game, BossBlitzGame) and only adds to it through the engine's own
 * seams, so a normal match is untouched. The Test Arena uses it on Game (ArenaGame); a normal table uses it when the
 * "status-effects" experiment is switched on (engine/experiments.mjs). Seams:
 *   - Speed and DEF changes go through statusValue("modifySpeed" / "modifyDefense"), like every printed modifier.
 *   - Laminate's extra damage rides the "damageIncoming" event; Reimburse and loaded effects ride "hit".
 *   - Round effects resolve at Honor (startRoundStatuses); "until your next turn" effects end at Hide.
 *   - Attack legality uses getLegalActions / attackZoneOptions / beginAttack; Defense cards use defenseOptions.
 *   - Prices use purchasePlan and comboLearnCost.
 * Deterministic (no randomness), framework-free, and it never looks at a card's name or ID.
 *
 * Cards reach the statuses through "status.*" effects (applyStatusEffect, the core's extension seam) and the
 * targetHasStatus / selfHasStatus conditions (statusIdsOf).
 *
 * Every change is announced as an `arena-effect` event: { kind, player, effect, ... } so the mat can animate it.
 */
import { Game } from "./core.mjs";

const sum = (list, read) => list.reduce((total, entry) => total + read(entry), 0);

export function withStatusEffects(Base) {
  return class StatusEffectsGame extends Base {
    constructor(data, config = {}) {
      super(data, config);
      const json = config.arenaEffects ?? data.experiments?.statusEffects;
      if (!json) throw new Error("The status layer needs config.arenaEffects or data.experiments.statusEffects (content/experimental/status-effects.json).");
      this.statusEffectsEnabled = true;
      this.arenaCatalog = { effects: new Map(json.effects.map((effect) => [effect.id, effect])), keywords: new Map(json.keywords.map((keyword) => [keyword.id, keyword])) };
      for (const player of this.players) this.arenaState(player);
    }

    // ---- State ----------------------------------------------------------------------------------------------------
    arenaState(player) {
      player.arena ??= { effects: [], grace: {}, armed: null, reimburse: false, healedRound: null, lastZone: null };
      return player.arena;
    }

    arenaEffect(player, effectId) { return this.arenaState(player).effects.find((entry) => entry.id === effectId) ?? null; }

    /** An effect's rule, as the current Location changes it ("statusRule" effects: { status, set: { field: value } }). */
    arenaRule(effectId) {
      const base = this.arenaCatalog.effects.get(effectId);
      if (!base || !this.currentLocation) return base;
      const changes = this.cardEffects(this.currentLocation, "statusRule").filter((effect) => effect.status === effectId);
      return changes.length ? Object.assign({}, base, ...changes.map((effect) => effect.set ?? {})) : base;
    }

    /** Sum of a numeric rule field over a fighter's effects; `perStack` multiplies by stacks. */
    arenaTotal(player, field, perStack = false) {
      if (!this.arenaCatalog) return 0; // the base constructor runs before the status catalog exists
      return sum(this.arenaState(player).effects, (entry) => (this.arenaRule(entry.id)?.[field] ?? 0) * (perStack ? entry.stacks : 1));
    }

    arenaHas(player, flag) { return Boolean(this.arenaCatalog) && this.arenaState(player).effects.some((entry) => this.arenaRule(entry.id)?.[flag]); }

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
        if (rule.refreshOnReapply && rule.duration) existing.turns = this.initialTurns(target, rule);
        this.announce("stacked", target, { effect: effectId, stacks: existing.stacks, source });
      } else {
        state.effects.push({ id: effectId, stacks: Math.min(rule.maxStacks, stacks), turns: this.initialTurns(target, rule) });
        if (source !== null && this.players[source]) { const sourceState = this.arenaState(this.players[source]); sourceState.appliedThisTurn = sourceState.appliedTurnKey === this.turnKey() ? [...sourceState.appliedThisTurn, effectId] : [effectId]; sourceState.appliedTurnKey = this.turnKey(); }
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
      if (!action.reversal && !action.deniedPaid && this.arenaHas(attacker, "voidsNextCard") && attacker.hand.includes(card)) return this.offerDeniedAttack(attacker, card, action);
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
        this.settleStatusKnockout();
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
      this.settleStatusKnockout();
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
      if (!player || !this.arenaCatalog) return result;
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
        if (laminate && result.damage >= (this.arenaRule("freeze").tearMinDamage ?? 1)) {
          const bonus = this.arenaRule("freeze").tearBonusDamage ?? 0;
          result.damage += bonus;
          this.dropArenaEffect(player, "freeze", "torn");
          this.announce("tear", player, { effect: "freeze", amount: bonus });
        }
      }
      if (type === "hit" && Number(event.damage) > 0) this.afterArenaHit(player, event.opponent, Number(event.damage));
      if (type === "junkDestroyed" && this.currentLocation) {
        const effects = this.cardEffects(this.currentLocation, "onJunkDestroyed");
        if (effects.length) this.applyCardEffects(player, this.currentLocation, "onJunkDestroyed", { opponent: this.opponentOf(player), effectOverride: effects });
      }
      // "After you Block an Attack": riders a Reaction Item put on this exchange.
      if (type === "block" && this.arenaCatalog) {
        const riders = this.arenaState(player).ifBlocked ?? [];
        this.arenaState(player).ifBlocked = [];
        for (const rider of riders) {
          if (event.attacker) this.applyArenaEffect(event.attacker, rider.status, { stacks: rider.stacks, source: player.id });
          if (rider.cycle) this.drawThenDiscard(player, 1, 1);
        }
      }
      return result;
    }

    afterArenaHit(attacker, defender, damage) {
      const state = this.arenaState(attacker);
      if (state.armed && defender) {
        const { effect, stacks, cycleIf } = state.armed;
        state.armed = null;
        const cycles = cycleIf && (cycleIf.targetHasStatus ? Boolean(this.arenaEffect(defender, cycleIf.targetHasStatus)) : cycleIf.targetHasTempo ? Boolean(defender.tempo) : false);
        this.applyArenaEffect(defender, effect, { stacks, source: attacker.id });
        if (cycles) this.drawThenDiscard(attacker, 1, 1);
      }
      const keyword = this.arenaCatalog.keywords.get("reimburse");
      if (!(state.reimburse || this.carriesReimburse(attacker)) || !keyword || damage < keyword.minDamage || attacker.hp <= 0) return;
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
          this.settleStatusKnockout();
        }
        if (rule.decayPerRound && (!rule.decayEvery || this.round % rule.decayEvery === 0)) {
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
      const state = this.arenaState(player);
      if (state.armed?.thisTurnOnly) state.armed = null;
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

    // ---- Denied on an Attack: discard a card to keep it, or cancel it -------------------------------------------
    /** "Your next card is void", except an Attack: its owner may discard another card from hand to keep it. */
    offerDeniedAttack(attacker, card, action) {
      const others = attacker.hand.filter((candidate) => candidate !== card);
      if (!others.length) return this.voidCard(attacker, card);
      const junkFirst = [...others].sort((a, b) => Number(b.category === "Junk") - Number(a.category === "Junk"));
      this.offerChoice({
        kind: "denied-attack", playerId: attacker.id, cardId: card.instanceId, cardOwnerId: attacker.id, cardZones: ["hand"], attackAction: { ...action },
        prompt: `Denied: discard a card to keep ${card.name}, or cancel the Attack.`,
        options: [...junkFirst.map((candidate) => ({ id: `discard:${candidate.instanceId}`, cardId: candidate.instanceId, label: `Discard ${candidate.name} and attack` })), { id: "cancel", label: `Cancel ${card.name} (it is void)` }],
      });
      this.announce("denied-choice", attacker, { effect: "denied", card: card.catalogId, cardName: card.name });
      return true;
    }

    resolveChoiceInner(choice) {
      const pending = this.pendingChoice;
      if (pending?.kind === "status-reward") return this.resolveStatusReward(pending, choice?.optionId ?? choice?.id ?? choice);
      if (pending?.kind !== "denied-attack") return super.resolveChoiceInner(choice);
      const selected = choice?.optionId ?? choice?.id ?? choice;
      if (!pending.options.some((option) => option.id === selected)) return false;
      this.telemetry.choicesResolved += 1; this.lastPresentedChoice = null; this.pendingChoice = null;
      const player = this.players[pending.playerId];
      const card = player.hand.find((candidate) => candidate.instanceId === pending.cardId);
      if (!card) return true;
      if (selected === "cancel") return this.voidCard(player, card);
      const paid = player.hand.find((candidate) => candidate.instanceId === String(selected).slice("discard:".length));
      if (!paid) return false;
      this.discardCard(player, paid);
      this.dropArenaEffectSilently(player, "denied");
      this.announce("denied-paid", player, { effect: "denied", card: paid.catalogId, cardName: paid.name });
      return this.beginAttack(player.id, card, { ...pending.attackAction, deniedPaid: true });
    }

    defaultChoice() {
      if (["denied-attack", "status-reward"].includes(this.pendingChoice?.kind)) return { optionId: this.pendingChoice.options[0].id };
      return super.defaultChoice();
    }

    // ---- Cards that use the statuses ("status.*" effects through the core's extension seam) ---------------------
    statusIdsOf(player) { return this.arenaCatalog && player ? this.arenaState(player).effects.map((entry) => entry.id) : []; }

    /** Weapons with the Reimburse keyword ("status.reimburse" while equipped). */
    carriesReimburse(player) { return player.equipment.some((card) => this.cardEffects(card, "passive").some((effect) => effect.action === "status.reimburse")); }

    healFighter(player, amount, source = "effect") {
      const healed = Math.min(Math.max(0, amount - this.arenaTotal(player, "healingPenalty")), player.maxHp - player.hp);
      if (healed > 0) { player.hp += healed; this.announce("healed", player, { amount: healed, source }); }
      return healed;
    }

    applyStatusEffect(player, card, effect, context) {
      if (!this.arenaCatalog) return false;
      const subject = effect.target === "opponent" ? context.opponent : player;
      const stacks = Math.max(1, Number(effect.stacks ?? effect.amount ?? 1));
      switch (effect.action) {
        case "status.apply": {
          if (!subject) return true;
          if (effect.whenBlocked) { (this.arenaState(player).ifBlocked ??= []).push({ status: effect.status, stacks, cycle: Boolean(effect.cycle) }); return true; }
          const existing = this.arenaEffect(subject, effect.status);
          const cap = effect.upTo ? Math.max(0, Number(effect.upTo) - (existing?.stacks ?? 0)) : stacks;
          if (cap > 0) this.applyArenaEffect(subject, effect.status, { stacks: Math.min(stacks, cap), source: player.id });
          return true;
        }
        case "status.arm":
          this.arenaState(player).armed = { effect: effect.status, stacks, thisTurnOnly: true, cycleIf: effect.cycleIf ?? null };
          this.announce("armed", player, { effect: effect.status, stacks });
          return true;
        case "status.remove": {
          if (!subject) return true;
          const ids = [].concat(effect.status);
          const entry = this.arenaState(subject).effects.find((candidate) => ids.includes(candidate.id));
          if (!entry) return true;
          const amount = effect.amount === "all" ? entry.stacks : Math.max(1, Number(effect.amount ?? 1));
          if (amount >= entry.stacks || this.arenaRule(entry.id).maxStacks === 1) this.dropArenaEffect(subject, entry.id, "removed");
          else { entry.stacks -= amount; this.announce("reduced", subject, { effect: entry.id, stacks: entry.stacks }); }
          if (effect.thenDraw) this.draw(player, Number(effect.thenDraw));
          return true;
        }
        case "status.powerPerStack": {
          const entry = this.arenaEffect(context.opponent, effect.status);
          if (entry) context.attackPowerModifier = (context.attackPowerModifier ?? 0) + Math.min(Number(effect.max ?? Infinity), entry.stacks * Number(effect.amount ?? 1));
          return true;
        }
        case "status.heal": this.healFighter(subject, Number(effect.amount ?? 1), card.name); return true;
        case "status.loseHp": subject.hp = Math.max(0, subject.hp - Math.max(0, Number(effect.amount ?? 1))); this.announce("self-cost", subject, { amount: Number(effect.amount ?? 1) }); this.settleStatusKnockout(); return true;
        case "status.loseTempo": if (subject?.tempo) { subject.tempo = false; this.announce("tempo-lost", subject, {}); } return true;
        case "status.tick": {
          // "Deal their Honor damage now" for the named statuses, without the Honor bookkeeping.
          for (const id of [].concat(effect.status)) {
            const entry = this.arenaEffect(subject, id);
            const amount = entry ? (this.arenaRule(id).honorDamagePerStack ?? 0) * entry.stacks : 0;
            if (amount > 0) { subject.hp = Math.max(0, subject.hp - amount); subject.lastDamagedBy = player.id; this.announce("tick", subject, { effect: id, amount, stacks: entry.stacks }); }
          }
          this.settleStatusKnockout();
          return true;
        }
        case "status.convert": {
          // Remove up to `max` stacks of one status and apply as many stacks of another; `cycleAt` stacks also cycle.
          const entry = this.arenaEffect(subject, effect.from);
          if (!entry) return true;
          const moved = Math.min(entry.stacks, Number(effect.max ?? entry.stacks));
          if (moved >= entry.stacks) this.dropArenaEffect(subject, effect.from, "removed"); else { entry.stacks -= moved; this.announce("reduced", subject, { effect: effect.from, stacks: entry.stacks }); }
          this.applyArenaEffect(subject, effect.to, { stacks: moved, source: player.id });
          if (effect.cycleAt && moved >= Number(effect.cycleAt)) this.drawThenDiscard(player, 1, 1);
          return true;
        }
        case "status.reimburse": return true; // read by carriesReimburse
        case "status.discardShield": return true; // read by queueCardChoice
        case "status.drawWatch": return true; // read by draw
        case "status.whenOpponentBuys": return true; // read by buy
        default: return false;
      }
    }

    resolveAttack(attacker, defender, card, options = {}) {
      const result = super.resolveAttack(attacker, defender, card, options);
      if (this.arenaCatalog && defender) this.arenaState(defender).ifBlocked = [];
      return result;
    }

    /** "Whenever an opponent buys a Market card": Equipment of the other fighters ("onOpponentPurchase"), once per round each. */
    buy(player, card) {
      const bought = super.buy(player, card);
      if (!bought || !this.arenaCatalog) return bought;
      for (const owner of this.players) {
        if (owner === player || owner.eliminated) continue;
        for (const equipment of owner.equipment) {
          for (const effect of this.cardEffects(equipment, "passive").filter((candidate) => candidate.action === "status.whenOpponentBuys")) {
            const key = `${equipment.instanceId}:${effect.id}`;
            const state = this.arenaState(owner);
            state.boughtWatch ??= {};
            if (state.boughtWatch[key] === this.round) continue;
            state.boughtWatch[key] = this.round;
            this.applyArenaEffect(player, effect.status, { stacks: Number(effect.stacks ?? 1), source: owner.id });
          }
        }
      }
      return bought;
    }

    /** "When a card or status would make you discard": a card with "status.discardShield" in hand is discarded instead. */
    queueCardChoice(player, targetPlayer, effect, movement, amount = 1) {
      if (this.arenaCatalog && movement === "discard" && targetPlayer && player !== targetPlayer) {
        const shield = targetPlayer.hand.find((card) => this.cardEffects(card, "replacement").some((candidate) => candidate.action === "status.discardShield"));
        if (shield) {
          this.discardCard(targetPlayer, shield);
          this.draw(targetPlayer, 1);
          this.announce("discard-shield", targetPlayer, { card: shield.catalogId, cardName: shield.name });
          if (amount <= 1) return true;
          amount -= 1;
        }
      }
      return super.queueCardChoice(player, targetPlayer, effect, movement, amount);
    }

    turnKey() { return `${this.round}:${this.turns}`; }

    /** Combos read the target's statuses and what the player applied this turn (engine/combo-runtime.mjs). */
    activateCombos(player, trigger, currentCard, zone, event = {}) {
      if (!this.arenaCatalog || !player) return super.activateCombos(player, trigger, currentCard, zone, event);
      const state = this.arenaState(player);
      const applied = state.appliedTurnKey === this.turnKey() ? state.appliedThisTurn ?? [] : [];
      return super.activateCombos(player, trigger, currentCard, zone, { ...event, targetStatuses: this.statusIdsOf(this.opponentOf(player)), statusesAppliedThisTurn: applied });
    }

    /** A Location's "onReveal" status effects resolve for every fighter. */
    revealLocation() {
      const revealed = super.revealLocation();
      if (revealed && this.arenaCatalog && this.currentLocation && this.cardEffects(this.currentLocation, "onReveal").length) {
        for (const player of this.players) if (!player.eliminated) this.applyCardEffects(player, this.currentLocation, "onReveal", { opponent: this.opponentOf(player) });
      }
      return revealed;
    }

    /**
     * "Until the end of your next turn" (ownTurns) counts the fighter's next Hide. Put on a fighter during their own
     * turn, it would otherwise end at that same turn's Hide, so it gets one more.
     */
    initialTurns(target, rule) {
      if (rule.duration === null || rule.duration === undefined) return null;
      return rule.duration + (rule.durationUnit === "ownTurns" && target?.id === this.activePlayer ? 1 : 0);
    }

    /** Equipment that watches draws ("status.drawWatch": the Nth extra draw in your turn earns Focus or Barrier). */
    draw(player, amount) {
      const before = player?.turnStats?.extraDraws ?? 0;
      super.draw(player, amount);
      if (!this.arenaCatalog || !player) return;
      const after = player.turnStats?.extraDraws ?? 0;
      if (after <= before) return;
      for (const card of player.equipment) {
        for (const effect of this.cardEffects(card, "passive").filter((candidate) => candidate.action === "status.drawWatch")) {
          const threshold = Number(effect.threshold ?? 2);
          if (before >= threshold || after < threshold || this.hasUsedEffect(player, effect, "turn")) continue;
          this.markUsedEffect(player, effect);
          this.offerChoice({ kind: "status-reward", playerId: player.id, sourceCardId: card.instanceId, prompt: `${card.name}: choose one.`, options: [{ id: "focus", label: "Gain 1 Focus" }, { id: "barrier", label: "Gain Barrier ×1" }] });
        }
      }
    }

    resolveStatusReward(pending, selected) {
      if (!pending.options.some((option) => option.id === selected)) return false;
      this.telemetry.choicesResolved += 1; this.lastPresentedChoice = null; this.pendingChoice = null;
      const player = this.players[pending.playerId];
      if (selected === "focus") this.gainFocusFor(player, 1);
      else this.applyArenaEffect(player, "barrier", { stacks: 1, source: player.id });
      return true;
    }

    /** HP lost outside combat (cuts, jolts, self-costs, early ticks) can knock a fighter out: settle it now. */
    settleStatusKnockout() {
      if (this.winner !== null || !this.players.some((player) => player.hp <= 0 && !player.eliminated)) return false;
      this.checkWinner();
      return true;
    }

    /** A Reversal is an Attack too: Laminate and Stapled limit it the same way. */
    reversalCandidates(player, target) {
      const cards = super.reversalCandidates(player, target);
      return this.arenaCatalog ? cards.filter((card) => this.arenaAttackAllowed(player, card)) : cards;
    }
  };
}

/** The Test Arena's engine: the canonical rules plus the status layer. */
export const ArenaGame = withStatusEffects(Game);
