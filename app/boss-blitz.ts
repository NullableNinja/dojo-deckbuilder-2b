// Dojo Drama: Boss Blitz for the browser game (rules Ch. 14, rulings DDB-RUL-001..008, 107..111).
//
// The computer's board becomes the Boss: a Boss Profile card supplies ATK, DEF and Speed, the
// Boss Stage adds HP and an Attack bonus, and a fresh 32-card Boss Arsenal replaces any hand or
// deck. Boss Attacks then run through the normal Quick Duel strike pipeline, so every player
// Defense, Reaction and Reversal rule still applies. Values come from definition.modes.

import gameDefinitionJson from "./data/game-definition.json" with { type: "json" };
import { structuredRuntimeEffects } from "./family-effect-runtime.ts";

type BossCard = { id: string; catalogId: string; name: string; subtype?: string | null; zone?: string | null; rulesText?: string | null; stats: Record<string, string | number | undefined> };
type Lookup = (id: string) => BossCard | undefined;

type Stage = { id: string; title: string; stageCard: string; stageFit: string; hp: number; coopHp: number; attackBonus: number; attacksPerTurn: number; coopAttacksPerTurn: number; enrage: { hpAtMost: number; attacksPerTurn: number; solo: boolean; coop: boolean } | null };
type BossRules = { stages: Stage[]; arsenal: { subtypes: string[]; size: number }; stageVictory: { xp: number; healActiveHp: number } };

const drama = (gameDefinitionJson as unknown as { modes?: { id: string; boss?: BossRules }[] }).modes?.find((mode) => mode.id === "dojo-drama");
if (!drama?.boss) throw new Error("Canonical dojo-drama mode is missing its Boss rules");
export const BOSS_RULES: BossRules = drama.boss;

/** Placeholder the strike pipeline resolves into a freshly revealed Boss Attack (Ch. 14 step 6). */
export const BOSS_NEXT_ATTACK = "boss:next-attack";

export type BossFields = {
  isBoss?: boolean;
  bossStage?: number;
  bossProfiles?: string[];
  bossArsenal?: { deck: string[]; discard: string[] };
  bossGuardId?: string | null;
  bossAttackBonus?: number;
  bossTempDef?: number;
  bossRuleUsage?: Record<string, boolean>;
};

type BossBoard = BossFields & { fighterId: string; hp: number; maxHp: number; tempSpeed: number; nextAttackBonus: number; tempo: boolean; hand: string[]; deck: string[]; discard: string[]; playArea: string[]; equipment: string[] };
type TargetBoard = { hp: number; maxHp: number; tempSpeed: number; nextAttackBonus: number; nextDefenseCardBonus?: number; tempo: boolean };

const num = (value: unknown) => Number.parseInt(String(value ?? 0), 10) || 0;

export const stageFits = (profile: BossCard, stage: Stage) => new RegExp(`Stage Fit:[^.]*\\b${stage.stageFit}\\b`, "i").test(profile.rulesText ?? "");

/** Quick Boss Blitz: a random distinct Profile per stage, filling the tightest stage first. */
export function drawBossLadder(profiles: BossCard[], random: () => number = Math.random): string[] {
  const order = BOSS_RULES.stages.map((stage, index) => ({ index, pool: profiles.filter((card) => stageFits(card, stage)) })).sort((left, right) => left.pool.length - right.pool.length);
  const picked: string[] = new Array(BOSS_RULES.stages.length);
  const used = new Set<string>();
  for (const { index, pool } of order) {
    const available = pool.filter((card) => !used.has(card.id));
    const choices = available.length ? available : pool;
    const card = choices[Math.floor(random() * choices.length)];
    picked[index] = card.id; used.add(card.id);
  }
  return picked;
}

export function stageFor(board: BossFields) { return BOSS_RULES.stages[board.bossStage ?? 0]; }
export const isFinalStage = (board: BossFields) => (board.bossStage ?? 0) === BOSS_RULES.stages.length - 1;

/** Load a stage onto the Boss board: Profile stats, Stage HP and bonus, fresh Arsenal. */
export function loadBossStage<B extends BossBoard>(board: B, stageIndex: number, arsenalIds: string[], shuffle: <T>(items: T[]) => T[]): B {
  const stage = BOSS_RULES.stages[stageIndex];
  const profileId = board.bossProfiles![stageIndex];
  return {
    ...board,
    isBoss: true, bossStage: stageIndex, fighterId: profileId,
    hp: stage.hp, maxHp: stage.hp, bossAttackBonus: stage.attackBonus, bossTempDef: 0, bossGuardId: null, bossRuleUsage: {},
    bossArsenal: { deck: shuffle([...arsenalIds]), discard: [] },
    hand: [], deck: [], discard: [], playArea: [], equipment: [], tempSpeed: 0, nextAttackBonus: 0, tempo: false,
  };
}

export function enrageThreshold(board: BossFields) { return stageFor(board).enrage?.hpAtMost ?? null; }
export const isEnraged = (board: BossBoard) => { const threshold = enrageThreshold(board); return threshold !== null && board.hp > 0 && board.hp <= threshold; };
export function bossAttacksAllowed(board: BossBoard) { const stage = stageFor(board); return isEnraged(board) ? stage.enrage!.attacksPerTurn : stage.attacksPerTurn; }

/** Boss Guard adds its Guard only to a player Attack aimed at its zone (Ch. 14). */
export function bossGuardFor(board: BossFields, zone: string, cardFor: Lookup) {
  const guard = board.bossGuardId ? cardFor(board.bossGuardId) : null;
  return guard && guard.zone === zone ? num(guard.stats.Guard) : 0;
}

export function spendBossGuard<B extends BossFields>(board: B, zone: string, cardFor: Lookup): B {
  if (!bossGuardFor(board, zone, cardFor) || !board.bossArsenal) return board;
  return { ...board, bossGuardId: null, bossArsenal: { ...board.bossArsenal, discard: [...board.bossArsenal.discard, board.bossGuardId!] } };
}

type Reveal<B, P> = { boss: B; player: P; attackId: string | null; log: string[] };

/** Reveal until a Boss Attack: Techniques resolve, Defenses replace Boss Guard. */
export function revealBossAttack<B extends BossBoard, P extends TargetBoard>(bossIn: B, playerIn: P, cardFor: Lookup, shuffle: <T>(items: T[]) => T[]): Reveal<B, P> {
  let boss = { ...bossIn, bossArsenal: { deck: [...bossIn.bossArsenal!.deck], discard: [...bossIn.bossArsenal!.discard] } };
  let player = { ...playerIn };
  const log: string[] = [];
  for (let guard = 0; guard < 64; guard += 1) {
    if (!boss.bossArsenal.deck.length && boss.bossArsenal.discard.length) boss.bossArsenal = { deck: shuffle(boss.bossArsenal.discard), discard: [] };
    const id = boss.bossArsenal.deck.shift();
    if (!id) break;
    const card = cardFor(id);
    if (!card) continue;
    if (card.subtype === "Boss Attack") return { boss, player, attackId: id, log };
    if (card.subtype === "Boss Defense") {
      if (boss.bossGuardId) boss.bossArsenal.discard.push(boss.bossGuardId);
      boss.bossGuardId = id;
      log.push(`Boss Guard: ${card.name} covers ${card.zone} (+${num(card.stats.Guard)} Defense against the next ${card.zone} Attack).`);
      continue;
    }
    if (card.subtype === "Boss Technique") {
      const result = applyBossTechnique(boss, player, card);
      boss = result.boss; player = result.player;
      boss.bossArsenal.discard.push(id);
      log.push(`Boss Technique: ${card.name}. ${result.note}`);
    }
  }
  return { boss, player, attackId: null, log };
}

function applyBossTechnique<B extends BossBoard, P extends TargetBoard>(bossIn: B, playerIn: P, card: BossCard) {
  const boss = { ...bossIn }; const player = { ...playerIn }; const notes: string[] = [];
  const effects = structuredRuntimeEffects(card).filter((effect) => effect.resolver !== "boss.technique.revealNextArsenal");
  const conditional = effects.filter((effect) => effect.resolver === "boss.technique.conditionalNextAttackPower");
  if (conditional.length) {
    // DDB-RUL-108: a Boss with no Enrage Threshold is never at or below it.
    const threshold = enrageThreshold(boss);
    const atOrBelow = threshold !== null && boss.hp <= threshold;
    const chosen = conditional.find((effect) => (effect.conditions ?? []).some((condition) => atOrBelow ? condition.operator === "lte" : condition.operator === "gt")) ?? conditional[0];
    boss.nextAttackBonus += num(chosen.amount); notes.push(`Next Boss Attack +${num(chosen.amount)}.`);
  }
  for (const effect of effects.filter((entry) => entry.resolver !== "boss.technique.conditionalNextAttackPower")) {
    const amount = num(effect.amount); const kind = String(effect.effect ?? effect.action ?? "");
    const onPlayer = effect.target === "opponent";
    if (kind.endsWith("heal")) { boss.hp = Math.min(boss.maxHp, boss.hp + amount); notes.push(`The Boss heals ${amount}.`); }
    else if (kind.endsWith("modifyAttackPower")) { if (onPlayer) { player.nextAttackBonus += amount; notes.push(`Your next Attack ${amount}.`); } else { boss.nextAttackBonus += amount; notes.push(`Next Boss Attack +${amount}.`); } }
    else if (kind.endsWith("modifyDefense")) { boss.bossTempDef = (boss.bossTempDef ?? 0) + amount; notes.push(`Boss DEF +${amount} until the next Honor.`); }
    else if (kind.endsWith("modifySpeed")) { boss.tempSpeed += amount; notes.push(`Boss Speed +${amount} until the next Honor.`); }
  }
  return { boss, player, note: notes.join(" ") };
}

/** Boss Attack and Profile effects after a Boss strike resolves (the discard on hit is handled by the strike itself). */
export function applyBossStrikeOutcome<B extends BossBoard, P extends TargetBoard>(bossIn: B, playerIn: P, attack: BossCard, outcome: "hit" | "block", blockedByDefense: boolean, cardFor: Lookup) {
  const boss = { ...bossIn, bossRuleUsage: { ...(bossIn.bossRuleUsage ?? {}) } }; const player = { ...playerIn }; const notes: string[] = [];
  const trigger = outcome === "hit" ? "onHit" : "onBlock";
  for (const effect of structuredRuntimeEffects(attack).filter((entry) => entry.trigger === trigger)) {
    const amount = num(effect.amount); const resolver = String(effect.resolver ?? "");
    if (resolver === "boss.attack.hitSpeedPenalty") { player.tempSpeed += amount; notes.push(`Your Speed ${amount} until the next Honor.`); }
    else if (resolver === "boss.attack.hitNextAttackPenalty") { player.nextAttackBonus += amount; notes.push(`Your next Attack ${amount}.`); }
    else if (resolver === "boss.attack.hitDefensePenalty") { player.nextDefenseCardBonus = (player.nextDefenseCardBonus ?? 0) + amount; notes.push(`Your next Defense card ${amount} Guard.`); }
    else if (resolver === "boss.attack.hitTempoLock") { player.tempo = false; notes.push("You cannot use Tempo this round."); }
    else if (resolver === "boss.attack.blockNextPower") { boss.nextAttackBonus += amount; notes.push(`Next Boss Attack +${amount}.`); }
  }
  const rule = profileRule(boss, cardFor);
  if (outcome === "block" && rule === "boss.profile.blockDefense" && !boss.bossRuleUsage.blockDefense) { boss.bossRuleUsage.blockDefense = true; boss.bossTempDef = (boss.bossTempDef ?? 0) + 2; notes.push("Boss Rule: +2 DEF until the next Honor."); }
  if (outcome === "block" && blockedByDefense && rule === "boss.profile.blockSpeedPenalty") { player.tempSpeed -= 1; notes.push("Boss Rule: your fighter gets −1 Speed until the next Honor."); }
  return { boss, player, note: notes.join(" ") };
}

export function profileRule(board: BossFields & { fighterId: string }, cardFor: Lookup): string | null {
  const profile = cardFor(board.fighterId);
  return profile ? structuredRuntimeEffects(profile).map((effect) => effect.resolver).find(Boolean) ?? null : null;
}

/** Profile rules the browser enforces today; the rest are shown but not yet automated. */
export const ENFORCED_PROFILE_RULES = new Set(["boss.profile.kataDefense", "boss.profile.consumableHeal", "boss.profile.equipAttackPenalty", "boss.profile.blockDefense", "boss.profile.blockSpeedPenalty", "boss.profile.startTurnDiscardOrPower"]);
