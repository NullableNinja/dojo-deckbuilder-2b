/**
 * Dojo Drama: Boss Blitz (rules Ch. 14, rulings DDB-RUL-001..008 and 107..111).
 *
 * The Boss is a non-player seat appended after the human seats. It takes one place in
 * the initiative order (players win Speed ties), never buys, draws, earns XP or uses
 * Tempo, and acts by revealing its Arsenal: Techniques resolve, Defenses become Boss
 * Guard, and the first Attack is played against the instructed active fighter through
 * the normal combat pipeline, so every player Reaction and Defense rule still applies.
 * Values come from definition.modes["dojo-drama"].boss and the printed Boss cards.
 */
import { Game } from "./core.mjs";

const number = (value) => Number.parseInt(String(value ?? 0), 10) || 0;
const BLACK_TASK_HP_NOTE = "Bosses count for the Licensing Final.";

export class BossBlitzGame extends Game {
  constructor(data, config = {}) {
    super(data, { ...config, mode: config.mode ?? "dojo-drama" });
    if (this.mode.id !== "dojo-drama" || !this.mode.boss) throw new Error("BossBlitzGame requires the dojo-drama mode");
    this.bossRules = this.mode.boss;
    this.coop = this.playerCount > 1;
    for (const player of this.players) player.team = 0; // players win or lose together
    this.bossProfiles = this.chooseProfiles(config.bossProfiles);
    this.setup.bossProfiles = this.bossProfiles.map((card) => card.catalogId);
    this.boss = this.createBoss();
    this.players.push(this.boss);
    this.stageIndex = -1; this.pendingStage = 0; this.bossTurn = null; this.skipRestOfRound = false;
    this.styleVictoryEligible = false; this.stageLog = [];
    this.loadStage(0);
  }

  // ---- Setup --------------------------------------------------------------------------
  stageFits(profile, stage) { return new RegExp(`Stage Fit:[^.]*\\b${stage.stageFit}\\b`, "i").test(profile.rulesText ?? ""); }

  chooseProfiles(requested = null) {
    // The card pool decides which Boss Profiles may be drawn (the union of the seated players' unlocks).
    const profiles = this.data.cards.filter((card) => card.subtype === "Boss Profile" && this.inCardPool(card));
    const unfilled = this.bossRules.stages.find((stage) => !profiles.some((card) => this.stageFits(card, stage)));
    if (unfilled) throw new Error(`Card pool leaves no Boss Profile for ${unfilled.title}`);
    // Always draw the random ladder first so the seeded RNG stream is identical whether or not
    // Profiles were requested (replays pass the original Profiles back in).
    const random = this.randomProfiles(profiles);
    if (Array.isArray(requested) && requested.length) {
      const chosen = requested.map((entry) => typeof entry === "string" ? this.data.byId.get(entry) : entry);
      chosen.forEach((card, index) => { if (!card || !this.stageFits(card, this.bossRules.stages[index])) throw new Error(`Boss Profile ${card?.catalogId ?? entry} does not fit ${this.bossRules.stages[index].title}`); });
      return chosen;
    }
    return random;
  }

  randomProfiles(profiles) {
    // Quick Boss Blitz: random distinct Profiles whose Stage Fit includes each stage. Fill the
    // most constrained stage first so a valid ladder always exists.
    const order = this.bossRules.stages.map((stage, index) => ({ stage, index, pool: profiles.filter((card) => this.stageFits(card, stage)) })).sort((left, right) => left.pool.length - right.pool.length);
    const picked = new Array(this.bossRules.stages.length);
    const used = new Set();
    for (const { index, pool } of order) {
      const available = pool.filter((card) => !used.has(card.catalogId));
      const card = this.rng.pick(available.length ? available : pool);
      picked[index] = card; used.add(card.catalogId);
    }
    return picked;
  }

  createBoss() {
    const id = this.players.length;
    const boss = this.makePlayer(id, this.bossProfiles[0], "boss");
    boss.deck = []; boss.hand = []; boss.discard = []; // the Boss holds no hand and no player deck
    Object.assign(boss, { name: "Boss", isBoss: true, team: "boss", roster: null, activeIndex: 0, eliminated: false, beltBonus: { atk: 0, def: 0, speed: 0 }, lastDamagedBy: null, tempo: false, guardCard: null, defeated: false });
    boss.arsenal = this.data.cards.filter((card) => this.bossRules.arsenal.subtypes.includes(card.subtype)).map((card) => this.cardInstance(card));
    if (boss.arsenal.length !== this.bossRules.arsenal.size) throw new Error(`Boss Arsenal has ${boss.arsenal.length} cards, expected ${this.bossRules.arsenal.size}`);
    return boss;
  }

  stage() { return this.bossRules.stages[this.stageIndex]; }

  loadStage(index) {
    const stage = this.bossRules.stages[index]; const profile = this.bossProfiles[index]; const boss = this.boss;
    const hp = this.coop ? stage.coopHp : stage.hp;
    Object.assign(boss, { character: profile, hp, maxHp: hp, atk: number(profile.stats?.ATK) + number(stage.attackBonus), def: number(profile.stats?.DEF), speed: number(profile.stats?.Speed), tempSpeed: 0, statuses: [], nextAttackPower: 0, tempo: false, defeated: false, lastDamagedBy: null, guardCard: null });
    // A fresh, fully shuffled 32-card Arsenal at the start of every stage.
    const everyArsenalCard = [...boss.arsenal];
    boss.deck = this.rng.shuffle(everyArsenalCard.slice()); boss.discard = []; boss.hand = []; boss.played = [];
    this.stageIndex = index; this.pendingStage = null;
    this.profileResolver = (this.effects.get(profile.catalogId)?.effects ?? []).map((effect) => effect.resolver).find(Boolean) ?? null;
    if (index === this.bossRules.stages.length - 1) this.styleVictoryEligible = this.players.some((player) => !player.isBoss && player.beltIndex === this.definition.progression.belts.length - 1);
    this.stageLog.push({ stage: stage.id, profile: profile.catalogId, round: this.round, hp });
    this.emit({ type: "boss-stage", stage: stage.id, profile: profile.catalogId, hp });
  }

  // ---- Seats -------------------------------------------------------------------------
  humans() { return this.players.filter((player) => !player.isBoss); }
  livingHumans() { return this.humans().filter((player) => !player.eliminated); }
  seatTiebreak(player) { return player.isBoss ? Number.MAX_SAFE_INTEGER : super.seatTiebreak(player); }
  knockoutCandidates() { return super.knockoutCandidates().filter((player) => !player.isBoss); }
  gainXp(player, amount, source) { return player?.isBoss ? 0 : super.gainXp(player, amount, source); }

  // ---- Round flow ----------------------------------------------------------------------
  advanceAutomaticEvents() {
    let advanced = false;
    // A Boss Turn can end the round; process that new Honor at once so initiative is locked.
    for (let pass = 0; pass < 3; pass += 1) {
      if (this.phase === "Honor" && this.pendingStage !== null && this.winner === null && !this.pendingChoice) this.loadStage(this.pendingStage);
      advanced = super.advanceAutomaticEvents() || advanced;
      this.boss.tempo = false; // Bosses never use Tempo
      const roundBefore = this.round;
      this.stepBossTurn();
      if (this.phase !== "Honor" || this.winner !== null || this.round === roundBefore && this.phase === "Honor") break;
    }
    return advanced;
  }

  finishTurn() {
    if (this.skipRestOfRound) { this.skipRestOfRound = false; this.turnOrderPosition = this.turnOrder.length - 1; }
    return super.finishTurn();
  }

  getLegalActions(playerId = this.activePlayer) {
    if (!this.pendingChoice && this.players[playerId]?.isBoss && this.phase !== "Honor") return [];
    return super.getLegalActions(playerId);
  }

  // ---- Boss Turn -------------------------------------------------------------------------
  bossAttacksAllowed() {
    const stage = this.stage();
    if (this.coop) return stage.coopAttacksPerTurn;
    const enrage = stage.enrage;
    return enrage?.solo && this.boss.hp <= enrage.hpAtMost ? enrage.attacksPerTurn : stage.attacksPerTurn;
  }

  bossTarget(attackNumber) {
    const candidates = this.livingHumans().filter((player) => player.hp > 0 && !this.hasStatus(player, "untargetable"));
    if (!candidates.length) return null;
    if (!this.coop) return candidates[0];
    const lowest = (pool) => { const min = Math.min(...pool.map((player) => player.hp)); return this.rng.pick(pool.filter((player) => player.hp === min)); };
    if (attackNumber === 0) return lowest(candidates);
    const others = candidates.filter((player) => player.id !== this.bossTurn.firstTargetId);
    return others.length ? lowest(others) : lowest(candidates);
  }

  drawArsenal() {
    const boss = this.boss;
    if (!boss.deck.length && boss.discard.length) boss.deck = this.rng.shuffle(boss.discard.splice(0));
    return boss.deck.pop() ?? null;
  }

  revealUntilAttack(target) {
    const boss = this.boss;
    for (let guard = 0; guard < 64; guard += 1) {
      const card = this.drawArsenal(); if (!card) return null;
      this.emit({ type: "boss-reveal", card: card.catalogId, subtype: card.subtype });
      if (card.subtype === "Boss Attack") return card;
      if (card.subtype === "Boss Technique") { this.resolveTechnique(card, target); boss.discard.push(card); continue; }
      if (card.subtype === "Boss Defense") { if (boss.guardCard) boss.discard.push(boss.guardCard); boss.guardCard = card; this.emit({ type: "boss-guard", card: card.catalogId, zone: card.zone }); }
    }
    return null;
  }

  enrageThreshold() { return this.coop ? null : this.stage().enrage?.hpAtMost ?? null; }

  resolveTechnique(card, target) {
    const boss = this.boss;
    const effects = this.cardEffects(card, "onPlay").filter((effect) => effect.resolver !== "boss.technique.revealNextArsenal");
    const conditional = effects.filter((effect) => effect.resolver === "boss.technique.conditionalNextAttackPower");
    if (conditional.length) {
      // DDB-RUL-108: a Boss with no Enrage Threshold is never at or below it.
      const threshold = this.enrageThreshold();
      const atOrBelow = threshold !== null && boss.hp <= threshold;
      const chosen = conditional.find((effect) => (effect.conditions ?? []).some((condition) => atOrBelow ? condition.operator === "lte" : condition.operator === "gt")) ?? conditional[0];
      this.addStatus(boss, { action: "modifyAttackPower", amount: number(chosen.amount), duration: "nextAttack", sourceId: card.instanceId });
    }
    for (const effect of effects.filter((entry) => entry.resolver !== "boss.technique.conditionalNextAttackPower")) {
      const amount = number(effect.amount);
      const subject = effect.target === "opponent" ? target : boss;
      if (!subject) continue;
      if (effect.effect === "core.heal") subject.hp = Math.min(subject.maxHp, subject.hp + amount);
      else if (effect.effect === "combat.modifyAttackPower") this.addStatus(subject, { action: "modifyAttackPower", amount, duration: effect.duration ?? "nextAttack", sourceId: card.instanceId });
      else if (effect.effect === "combat.modifyDefense") this.addStatus(subject, { action: "modifyDefense", amount, duration: "endOfRound", sourceId: card.instanceId });
      else if (effect.effect === "combat.modifySpeed") subject.tempSpeed += amount;
    }
    this.emit({ type: "boss-technique", card: card.catalogId });
  }

  stepBossTurn() {
    const boss = this.boss;
    if (this.winner !== null || this.pendingChoice || this.phase === "Honor" || this.players[this.activePlayer] !== boss) return;
    if (!this.bossTurn) { this.bossTurn = { attacks: 0, firstTargetId: null }; this.beginBossTurn(); if (this.pendingChoice || this.winner !== null) return; }
    if (!boss.defeated && boss.hp > 0 && this.bossTurn.attacks < this.bossAttacksAllowed()) {
      const target = this.bossTarget(this.bossTurn.attacks);
      const attack = target && this.revealUntilAttack(target);
      if (target && attack) {
        if (this.bossTurn.attacks === 0) this.bossTurn.firstTargetId = target.id;
        this.bossTurn.attacks += 1;
        if (this.bossTurn.pendingPower) { this.addStatus(boss, { action: "modifyAttackPower", amount: this.bossTurn.pendingPower, duration: "nextAttack", sourceId: "profile" }); this.bossTurn.pendingPower = 0; }
        boss.hand.push(attack);
        if (this.beginAttack(boss.id, attack, { targetId: target.id, zone: attack.zone })) return; // the defender now answers
        boss.hand.splice(boss.hand.indexOf(attack), 1); boss.discard.push(attack);
      }
    }
    this.endBossTurn();
  }

  // Director Clipwell: the active player may discard 1 card; if not, the first Boss Attack gets +1.
  beginBossTurn() {
    if (this.profileResolver !== "boss.profile.startTurnDiscardOrPower") return;
    const target = this.bossTarget(0); if (!target) return;
    const junk = target.hand.find((card) => [card.cardType, card.subtype, card.category].includes("Junk"));
    if (junk) this.discardCard(target, junk);
    else this.bossTurn.pendingPower = 1;
  }

  endBossTurn() {
    const boss = this.boss;
    boss.discard.push(...boss.played.splice(0));
    this.bossTurn = null;
    if (this.winner === null && this.players[this.activePlayer] === boss) this.finishTurn();
  }

  // ---- Combat hooks ----------------------------------------------------------------------
  resolveAttack(attacker, defender, card, options = {}) {
    const boss = this.boss; const zone = options.zone ?? card?.zone;
    let guardUsed = null;
    if (defender === boss && boss.guardCard && boss.guardCard.zone === zone) {
      guardUsed = boss.guardCard;
      // DDB-RUL-117: as printed, Boss Guard reduces the damage of the matching Attack.
      this.addStatus(boss, { action: "preventDamage", amount: number(guardUsed.stats?.Guard), duration: "nextAttack", sourceId: guardUsed.instanceId });
    }
    const result = super.resolveAttack(attacker, defender, card, options);
    if (guardUsed && result) { boss.discard.push(guardUsed); if (boss.guardCard === guardUsed) boss.guardCard = null; }
    if (result && attacker === boss && result.damage === 0) this.onBossAttackBlocked(defender, result);
    return result;
  }

  onBossAttackBlocked(defender, result) {
    const boss = this.boss;
    if (this.profileResolver === "boss.profile.blockDefense" && !boss.effectUsage.round.blockDefense) { boss.effectUsage.round.blockDefense = true; this.addStatus(boss, { action: "modifyDefense", amount: 2, duration: "endOfRound", sourceId: "profile" }); }
    if (this.profileResolver === "boss.profile.blockSpeedPenalty" && result.defense) defender.tempSpeed -= 1;
  }

  firstThisRound(player, key) { const usage = player.effectUsage.round; if (usage[key]) return false; usage[key] = true; return true; }

  playCard(player, card, options = {}) {
    const subtype = card?.subtype; const phase = this.phase;
    const played = super.playCard(player, card, options);
    if (!played || player.isBoss) return played;
    const boss = this.boss;
    if (this.profileResolver === "boss.profile.kataDefense" && subtype === "Kata" && this.firstThisRound(player, "bossKata")) this.addStatus(boss, { action: "modifyDefense", amount: 1, duration: "endOfRound", sourceId: "profile" });
    if (this.profileResolver === "boss.profile.consumableHeal" && subtype === "Consumable" && this.firstThisRound(player, "bossConsumable")) boss.hp = Math.min(boss.maxHp, boss.hp + 2);
    if (this.profileResolver === "boss.profile.equipAttackPenalty" && phase === "Initiate" && ["Weapon", "Gear", "Defense Equipment"].includes(subtype) && this.firstThisRound(player, "bossEquip")) this.addStatus(player, { action: "modifyAttackPower", amount: -1, duration: "nextAttack", sourceId: "profile" });
    return played;
  }

  setEquipmentReady(player, card, ready) {
    const changed = super.setEquipmentReady(player, card, ready);
    if (!changed || player.isBoss) return changed;
    if (!ready && this.profileResolver === "boss.profile.exhaustDiscard" && this.firstThisRound(player, "bossExhaust") && player.hand.length) this.discardCard(player, player.hand[0]);
    if (ready && this.phase !== "Initiate" && this.profileResolver === "boss.profile.readyEquipmentPower" && this.firstThisRound(player, "bossReady")) this.addStatus(this.boss, { action: "modifyAttackPower", amount: 1, duration: "nextAttack", sourceId: "profile" });
    return changed;
  }

  // ---- Stage victory, scenario victory and defeat ---------------------------------------
  defeatBoss() {
    const boss = this.boss; const stage = this.stage(); const final = this.stageIndex === this.bossRules.stages.length - 1;
    const killer = boss.lastDamagedBy !== null && boss.lastDamagedBy !== undefined ? this.players[boss.lastDamagedBy] : null;
    boss.hp = 0; boss.defeated = true;
    this.emit({ type: "boss-defeated", stage: stage.id, profile: boss.character.catalogId, by: killer?.id ?? null });
    const brown = this.definition.progression.belts.length - 2;
    if (killer && !killer.isBoss) {
      // DDB-RUL-118: Rival and Mini-Boss pay 5 XP instead of the KO award; the Final Boss pays the normal KO XP.
      this.gainXp(killer, final ? Number(this.bossRules.stageVictory.finalStageXp ?? this.bossRules.stageVictory.xp) : this.bossRules.stageVictory.xp, "boss-stage");
      if (killer.beltIndex === brown) { killer.examProgress.koWhileBrown = true; this.checkBeltExam(killer); } // ${BLACK_TASK_HP_NOTE}
    }
    const healed = this.bossRules.stageVictory.coopHealsEachActive ? this.livingHumans() : this.livingHumans().slice(0, 1);
    for (const player of healed) player.hp = Math.min(player.maxHp, player.hp + this.bossRules.stageVictory.healActiveHp);
    if (final) {
      // Promote to Black immediately if this KO finished the Licensing Final with enough XP.
      const black = this.definition.progression.belts.length - 1;
      if (killer && killer.beltIndex === brown && killer.xp >= this.definition.progression.belts[black].xp) { killer.beltIndex = black; killer.promotionHistory.push({ from: brown, to: black, belt: "Black", round: this.round, xp: killer.xp }); this.emit({ type: "promotion", player: killer.id, from: brown, to: black, belt: "Black" }); }
      return this.declareWinner(killer && !killer.isBoss ? killer : this.livingHumans()[0], this.styleVictoryEligible ? "style-victory" : "final-boss");
    }
    this.revealLocation(); // the normal KO Scene Change
    this.refillMarket(true); this.marketPurchasedThisRound = true; // replaces this round's end-of-round refresh
    this.pendingStage = this.stageIndex + 1;
    // DDB-RUL-001/002: a player who KO'd the Boss on their own turn finishes Ascend and Hide;
    // everyone else skips the rest of the round. Outside a player turn, transition at once.
    this.skipRestOfRound = true;
    if (this.players[this.activePlayer] === boss) { boss.discard.push(...boss.played.splice(0)); this.bossTurn = null; this.pendingChoice = null; this.finishTurn(); }
    return false;
  }

  checkModeWinner() {
    if (this.winner !== null) return true;
    const outcome = this.processKnockouts();
    if (this.winner !== null) return true;
    if (this.boss.hp <= 0 && !this.boss.defeated && this.defeatBoss()) return true;
    if (this.winner !== null) return true;
    if (!this.livingHumans().length) return this.declareWinner(this.boss, "boss-victory");
    if (this.roundLimitReached) return this.declareWinner(this.boss, "round-limit");
    if (outcome.knocked?.length) this.revealLocation();
    if (this.players[this.activePlayer]?.eliminated && this.phase !== "Honor") { this.pendingChoice = null; this.finishTurn(); }
    return this.winner !== null;
  }

  result() {
    const base = super.result();
    return { ...base, boss: { stagesCleared: this.stageLog.filter((entry, index) => index < this.stageIndex || this.boss.defeated).length, stageIndex: this.stageIndex, profiles: this.bossProfiles.map((card) => card.catalogId), hp: this.boss.hp, playersWon: this.winner !== null && this.winner !== this.boss.id } };
  }
}
