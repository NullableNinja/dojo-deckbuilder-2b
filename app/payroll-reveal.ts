// The order the payroll slip reveals itself in, as plain data. The slip walks these beats one by one
// (app/career-payroll.tsx); this module only decides *what* happens and *when*, so it can be tested
// without a browser. Presentation only: every number comes from the Payroll the engine already filed.
import type { Payroll } from "./career.ts";

export type MeterFrame = { pct: number; level: number; reset?: boolean };
export type Beat =
  | { kind: "line"; index: number; merit: number; tickets: number; stubs: number; ms: number }
  | { kind: "exchange"; ms: number }
  | { kind: "collection"; ms: number }
  | { kind: "meter"; frame: MeterFrame; merit: number; ms: number }
  | { kind: "level-up"; level: number; ms: number }
  | { kind: "stamp"; ms: number };

export type RevealInput = {
  payroll: Payroll;
  /** Career Merit after payroll and the Clearance Level progress before and after it. */
  meritAfter: number;
  before: { level: number; into: number; span: number };
  after: { level: number; into: number; span: number };
};

const pct = (into: number, span: number) => (span ? Math.max(0, Math.min(100, Math.round((into / span) * 100))) : 100);
const BEAT_MS = { line: 760, exchange: 900, collection: 900, meter: 1100, levelUp: 1000, stamp: 600 };

/** Beats in the order they play: each pay line, any exchange, the Merit meter (twice on a level-up), the reward box, the stamp. */
export function revealBeats({ payroll, meritAfter, before, after }: RevealInput): Beat[] {
  const beats: Beat[] = payroll.lines.map((line, index) => ({ kind: "line", index, merit: line.merit ?? 0, tickets: line.tickets ?? 0, stubs: line.stubs ?? 0, ms: BEAT_MS.line }));
  if (payroll.stubsExchanged > 0) beats.push({ kind: "exchange", ms: BEAT_MS.exchange });
  if (payroll.ticketsConverted > 0) beats.push({ kind: "collection", ms: BEAT_MS.collection });
  const meritBefore = meritAfter - payroll.merit - payroll.meritFromTickets;
  const levelled = after.level > before.level;
  if (levelled) {
    beats.push({ kind: "meter", frame: { pct: 100, level: before.level }, merit: meritBefore + (before.span - before.into), ms: BEAT_MS.meter });
    beats.push({ kind: "level-up", level: after.level, ms: BEAT_MS.levelUp });
    beats.push({ kind: "meter", frame: { pct: 0, level: after.level, reset: true }, merit: meritAfter, ms: 80 });
  }
  beats.push({ kind: "meter", frame: { pct: pct(after.into, after.span), level: after.level }, merit: meritAfter, ms: BEAT_MS.meter });
  beats.push({ kind: "stamp", ms: BEAT_MS.stamp });
  return beats;
}

/** What the slip shows after `done` beats have played (0 = nothing filed yet). */
export function revealState(input: RevealInput, beats: Beat[], done: number) {
  const played = beats.slice(0, done);
  const totals = { merit: 0, tickets: 0, stubs: 0 };
  for (const beat of played) if (beat.kind === "line") { totals.merit += beat.merit; totals.tickets += beat.tickets; totals.stubs += beat.stubs; }
  const lastMeter = [...played].reverse().find((beat): beat is Extract<Beat, { kind: "meter" }> => beat.kind === "meter");
  const meritBefore = input.meritAfter - input.payroll.merit - input.payroll.meritFromTickets;
  return {
    totals,
    linesShown: played.filter((beat) => beat.kind === "line").length,
    exchangeShown: played.some((beat) => beat.kind === "exchange"),
    collectionShown: played.some((beat) => beat.kind === "collection"),
    levelUpShown: played.some((beat) => beat.kind === "level-up"),
    stamped: played.some((beat) => beat.kind === "stamp"),
    meter: lastMeter?.frame ?? { pct: pct(input.before.into, input.before.span), level: input.before.level },
    merit: lastMeter?.merit ?? meritBefore,
  };
}
