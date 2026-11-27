// "What do I still need for my next Belt?" for the Ascend desk, read from the engine's own state.
// It only reports; the engine alone decides whether a promotion is legal (`game.canPromote`).
import type { EngineGame, EngineSeat } from "./engine-session.ts";

export type BeltStep = { label: string; met: boolean };
export type BeltRequirements = {
  /** The Belt being worked toward, or null at the top rank. */
  next: { name: string; xp: number; rewardSummary: string } | null;
  xp: { have: number; need: number; met: boolean };
  exam: { title: string; summary: string; done: boolean; steps: BeltStep[] } | null;
  /** Promotion is a once-per-turn Belt Check; true when it was already spent this turn. */
  checkUsed: boolean;
  /** Both requirements are met and the Belt Check is still available. */
  ready: boolean;
  /** One plain sentence about what to do next. */
  nextStep: string;
};

type ExamState = {
  examProgress?: { zones?: string[]; purchasedTypes?: string[]; koWhileBrown?: boolean };
  honorStats?: { attacked?: boolean; blocked?: boolean };
  turnStats?: { attacksThisTurn?: number; hit?: boolean; playsThisTurn?: number; playedAttack?: boolean; playedKata?: boolean; equippedThisTurn?: boolean; usedConsumableThisTurn?: boolean };
  comboTriggeredThisGame?: boolean;
  beltCheckActionUsed?: boolean;
};

const ZONES = ["High", "Mid", "Low"];

/** The checklist for one exam kind, from the same facts `checkBeltExam` reads in engine/core.mjs. */
export function examSteps(kind: string, seat: EngineSeat): BeltStep[] {
  const state = seat as EngineSeat & ExamState;
  const progress = state.examProgress ?? {};
  const turn = state.turnStats ?? {};
  switch (kind) {
    case "three-zones":
      return ZONES.map((zone) => ({ label: `${zone} Attack made`, met: (progress.zones ?? []).includes(zone) }));
    case "two-attacks-hit":
      return [{ label: "Two Attacks in one Yell", met: (turn.attacksThisTurn ?? 0) >= 2 }, { label: "At least one Hit", met: Boolean(turn.hit) }];
    case "attack-and-defend":
      return [{ label: "Make an Attack", met: Boolean(state.honorStats?.attacked) }, { label: "Block an Attack", met: Boolean(state.honorStats?.blocked) }];
    case "market-types": {
      const bought = (progress.purchasedTypes ?? []).length;
      return [{ label: `Market card types bought: ${Math.min(bought, 2)} of 2`, met: bought >= 2 }];
    }
    case "equipment-count":
      return [{ label: `Equipment attached: ${Math.min(seat.equipment.length, 2)} of 2`, met: seat.equipment.length >= 2 }];
    case "combo":
      return [{ label: "Trigger a learned Combo", met: Boolean(state.comboTriggeredThisGame) }];
    case "mixed-turn":
      return [
        { label: `Cards played this Yell: ${Math.min(turn.playsThisTurn ?? 0, 4)} of 4`, met: (turn.playsThisTurn ?? 0) >= 4 },
        { label: "An Attack", met: Boolean(turn.playedAttack) },
        { label: "A Kata", met: Boolean(turn.playedKata) },
        { label: "Equipment or a Consumable", met: Boolean(turn.equippedThisTurn || turn.usedConsumableThisTurn) },
      ];
    case "ko":
      return [{ label: "Knock out an opposing fighter", met: Boolean(progress.koWhileBrown) }];
    default:
      return [];
  }
}

/** Where a requirement can still be earned, in the words a player would use. */
function nextStepFor(kind: string, steps: BeltStep[]): string {
  const missing = steps.filter((step) => !step.met).map((step) => step.label);
  if (kind === "market-types" || kind === "equipment-count") return "You can finish this exam right now: buy the card from the Market tab.";
  if (kind === "combo") return "Trigger a learned Combo during a Yell; learn one from the Combo tab first.";
  return `Still needed: ${missing.join("; ") || "in progress"}. Earn it during a Yell or Honor; it stays done once you finish it.`;
}

export function beltRequirements(game: EngineGame, seat: EngineSeat): BeltRequirements {
  const next = game.definition.progression.belts[seat.beltIndex + 1] ?? null;
  const checkUsed = Boolean((seat as EngineSeat & ExamState).beltCheckActionUsed);
  if (!next) return { next: null, xp: { have: seat.xp, need: seat.xp, met: true }, exam: null, checkUsed, ready: false, nextStep: "Every Belt is certified." };
  const exam = next.exam as { title: string; summary: string; kind?: string };
  const done = seat.completedTasks.includes(seat.beltIndex + 1);
  const steps = examSteps(exam.kind ?? "", seat);
  const xpMet = seat.xp >= next.xp;
  const ready = game.canPromote(seat);
  const spent = checkUsed && !ready ? "Belt Check used this turn. " : "";
  const nextStep = spent + (ready
    ? `Promote to ${next.name} Belt now. It costs your Belt Check for this turn.`
    : checkUsed && xpMet && done
      ? `Promote to ${next.name} Belt next Ascend.`
      : !xpMet && !done
        ? `Earn ${next.xp - seat.xp} more XP (each Honor, card effects and knockouts pay XP) and finish the exam.`
        : !xpMet
          ? `Exam done. Earn ${next.xp - seat.xp} more XP (each Honor, card effects and knockouts pay XP).`
          : nextStepFor(exam.kind ?? "", steps));
  return { next: { name: next.name, xp: next.xp, rewardSummary: next.reward.summary }, xp: { have: seat.xp, need: next.xp, met: xpMet }, exam: { title: exam.title, summary: exam.summary, done, steps }, checkUsed, ready, nextStep };
}
