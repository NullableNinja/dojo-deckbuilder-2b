// Turns a finished engine table into a career receipt and records it once. Framework-free, so the
// same call serves every engine table (Quick Duel, Tag Team, Boss Blitz, Clash) and Node tests.
import { careerStore, matchIdFor, type CareerStore, type MatchReceipt, type Payroll } from "./career.ts";
import type { EngineSession } from "./engine-session.ts";

type SeatFacts = { id: number; team?: number | string; isBoss?: boolean };
type BossFacts = { stageIndex?: number; bossRules?: { stages: { id: string }[] } };

/** What the earn rules need to know about a finished match, or null while it is still running. */
export function matchReceipt(session: EngineSession): Omit<MatchReceipt, "day" | "at"> | null {
  const { game, setup } = session;
  if (game.winner === null) return null;
  const humans = setup.humanSeats;
  const seats = game.players as unknown as SeatFacts[];
  const winner = seats[game.winner];
  const humanTeam = seats[humans[0] ?? 0]?.team;
  const won = humans.includes(game.winner) || Boolean(winner && !winner.isBoss && humanTeam !== undefined && winner.team === humanTeam);
  const boss = game as unknown as BossFacts;
  return {
    matchId: matchIdFor(setup),
    mode: setup.mode,
    // A table with a card pool is a career table; without one it is Open Dojo (earns nothing).
    table: setup.table?.cardPool ? "vs-bots" : "open-dojo",
    result: won ? "win" : "loss",
    rounds: game.round,
    difficulty: setup.difficulty,
    promotions: game.events.filter((event) => event.type === "promotion" && humans.includes(Number(event.player))).length,
    opponents: seats.filter((seat) => !humans.includes(seat.id)).length,
    bossStage: boss.bossRules?.stages[boss.stageIndex ?? -1]?.id,
  };
}

const recorded = new Map<string, Payroll>();

/**
 * Record a finished match in the career (once per match id, even if the result screen renders
 * twice) and return its payroll. Null while the match is still running.
 */
export function recordSessionResult(session: EngineSession, store: CareerStore = careerStore): Payroll | null {
  const receipt = matchReceipt(session);
  if (!receipt) return null;
  const known = recorded.get(receipt.matchId);
  if (known) return known;
  const payroll = store.recordMatch(receipt);
  recorded.set(receipt.matchId, payroll);
  return payroll;
}
