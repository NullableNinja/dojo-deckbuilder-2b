// "Department payroll": the stamped slip on an engine table's result screen. It records the finished
// match in the career once (app/career-match.ts) and shows what it paid: Merit, tickets and stubs,
// any Clearance Level reached with its rewards, and the wallet afterwards.
import { useEffect, useMemo, useRef, useState } from "react";
import { careerStore, economy, walletOf, type Payroll, type PayrollLine } from "./career";
import { recordSessionResult } from "./career-match";
import type { EngineSession } from "./engine-session";
import { navigate } from "./routing";
import { plural, rewardLabel, titleCase } from "./career-labels";
import { cardMotionDisabled } from "./card-motion";
import { revealBeats, revealState, type RevealInput } from "./payroll-reveal";
import "./career-payroll.css";

// Labels for the earn rules' `when` vocabulary (content/packs.json earnRules.bonuses).
const BONUS_LABELS: Record<string, (times: number) => string> = {
  "first-win-local-day": () => "First win of the day",
  "every-third-consecutive-win": () => "Three wins in a row",
  "each-in-match-belt-promotion": (times) => `Belt promotions ×${times}`,
  "win-against-master-difficulty": () => "Beat a Master opponent",
};

function lineLabel(line: PayrollLine) {
  if (line.id === "win" || line.id === "loss") {
    const base = line.id === "win" ? "Match won" : "Match closed";
    return line.multiplier && line.multiplier.value !== 1 ? `${base} · ${titleCase(line.multiplier.key)} ×${line.multiplier.value}` : base;
  }
  if (line.id === "extra-opponents") return `Extra opponents ×${line.times ?? 1}`;
  const when = economy.packs.earnRules.bonuses.find((bonus) => bonus.id === line.id)?.when ?? "";
  return BONUS_LABELS[when]?.(line.times ?? 1) ?? titleCase(line.id);
}

function lineValue(line: PayrollLine) {
  return [line.merit ? `+${line.merit} Merit` : "", line.tickets ? `+${plural(line.tickets, "ticket")}` : "", line.stubs ? `+${plural(line.stubs, "stub")}` : ""].filter(Boolean).join(" · ");
}

const REFUSALS: Record<string, { stamp: string; text: () => string }> = {
  "open-dojo": { stamp: "Open Dojo", text: () => "Played with the full catalog, so no payroll is filed. Switch to My Collection in the Card Library to earn Merit and Booster Tickets." },
  "too-short": { stamp: "Not filed", text: () => `Payroll needs at least ${economy.packs.earnRules.eligibility.minimumCompletedRounds} rounds. Play a longer match to earn Merit and tickets.` },
  "no-career": { stamp: "No record", text: () => "This browser is not keeping records, so nothing could be paid." },
  "already-paid": { stamp: "Paid", text: () => "This match has already been paid." },
};

/** A number that counts toward its target (rAF); jumps straight there when motion is off. */
function useTally(target: number, still: boolean, ms = 600) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (still || from.current === target) { from.current = target; setShown(target); return; }
    const start = performance.now(), origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const value = Math.round(origin + (target - origin) * (1 - (1 - t) ** 3));
      from.current = value; setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, still]); // eslint-disable-line react-hooks/exhaustive-deps
  return shown;
}

/** Walks the reveal beats on a timer; `skip` jumps to the end. With motion off it starts finished. */
function useReveal(beatMs: number[], still: boolean, startDelay: number) {
  const [done, setDone] = useState(still ? beatMs.length : 0);
  useEffect(() => {
    if (done >= beatMs.length) return;
    const timer = window.setTimeout(() => setDone(done + 1), done === 0 ? startDelay : beatMs[done - 1]);
    return () => window.clearTimeout(timer);
  }, [done, beatMs, startDelay]);
  return { done, finished: done >= beatMs.length, skip: () => setDone(beatMs.length) };
}

/** `startDelay`: milliseconds to wait before the slip starts filing, e.g. for a K.O. slam to finish first. */
export function PayrollSlip({ session, motion, startDelay = 450 }: { session: EngineSession; motion?: string; startDelay?: number }) {
  const [payroll] = useState<Payroll | null>(() => recordSessionResult(session));
  if (!payroll || payroll.reason === "unlock-everything") return null;
  if (!payroll.eligible) {
    const refusal = REFUSALS[payroll.reason ?? "no-career"] ?? REFUSALS["no-career"];
    return <section className="payroll-slip is-refused" aria-labelledby="payroll-title">
      <span className="payroll-stamp" aria-hidden="true">{refusal.stamp}</span>
      <span className="eyebrow">Department payroll</span>
      <h3 id="payroll-title">No payroll this time</h3>
      <p>{refusal.text()}</p>
    </section>;
  }
  return <FiledSlip payroll={payroll} motion={motion} startDelay={startDelay} />;
}

function FiledSlip({ payroll, motion, startDelay }: { payroll: Payroll; motion?: string; startDelay: number }) {
  const state = careerStore.get().state;
  const wallet = walletOf(state);
  const meritAfter = state?.merit ?? 0;
  const [still] = useState(() => cardMotionDisabled(motion));
  const input = useMemo<RevealInput>(() => {
    const meritBefore = meritAfter - payroll.merit - payroll.meritFromTickets;
    return { payroll, meritAfter, before: economy.levelProgress(meritBefore), after: economy.levelProgress(meritAfter) };
  }, [payroll, meritAfter]);
  const beats = useMemo(() => revealBeats(input), [input]);
  const beatMs = useMemo(() => beats.map((beat) => beat.ms), [beats]);
  const { done, finished, skip } = useReveal(beatMs, still, startDelay);
  const shown = revealState(input, beats, done);
  const levelled = payroll.levelAfter > payroll.levelBefore;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const merit = useTally(shown.totals.merit, still);
  const meterMerit = useTally(shown.merit, still, 900);
  const stampBeat = beats.findIndex((beat) => beat.kind === "stamp");
  useEffect(() => {
    // One short pulse as the stamp lands; a bonus on top of the stamp, never the only signal.
    if (!still && stampBeat >= 0 && done === stampBeat + 1 && typeof navigator.vibrate === "function") navigator.vibrate(levelled ? [14, 40, 14] : 10);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stub pips: the stubs held before, the new ones tearing in, then an exchange turning a full set into a ticket.
  const rate = wallet.stubRate;
  const heldBefore = Math.max(0, Math.min(rate, wallet.stubs - payroll.stubs + payroll.stubsExchanged * rate));
  const held = shown.exchangeShown || finished ? wallet.stubs : Math.min(rate, heldBefore + shown.totals.stubs);
  const pendingLineTickets = payroll.lines.slice(shown.linesShown).reduce((sum, line) => sum + (line.tickets ?? 0), 0);
  const tickets = finished ? wallet.tickets : Math.max(0, wallet.tickets - pendingLineTickets - (shown.exchangeShown ? 0 : payroll.stubsExchanged));
  const meterNext = shown.meter.level === input.before.level ? economy.levelProgress(input.meritAfter - payroll.merit - payroll.meritFromTickets).next : economy.levelProgress(meritAfter).next;
  const headline = `+${payroll.merit} Merit${payroll.tickets ? ` · +${plural(payroll.tickets, "Booster Ticket")}` : ""}${payroll.stubs ? ` · +${plural(payroll.stubs, "Ticket Stub")}` : ""}`;
  const skipNow = () => { skip(); headingRef.current?.focus(); };

  return <section className={`payroll-slip${still ? " is-still" : ""}${levelled ? " has-level-up" : ""}${finished ? " is-filed" : " is-filing"}${shown.levelUpShown && !finished ? " is-flash" : ""}`} aria-labelledby="payroll-title" onClick={finished ? undefined : skipNow}>
    <span className={`payroll-stamp${shown.stamped ? " is-stamped" : ""}`} aria-hidden="true">{levelled ? "Promoted" : "Paid"}</span>
    <span className="eyebrow">Department payroll · Form PF-1</span>
    <h3 id="payroll-title" ref={headingRef} tabIndex={-1} aria-label={headline}><span aria-hidden="true">+{merit} Merit{shown.totals.tickets ? ` · +${plural(shown.totals.tickets, "Booster Ticket")}` : ""}{shown.totals.stubs ? ` · +${plural(shown.totals.stubs, "Ticket Stub")}` : ""}</span></h3>
    <dl className="payroll-lines">
      {payroll.lines.map((line, index) => <div key={line.id} className={index < shown.linesShown ? (index === shown.linesShown - 1 && !finished ? "is-landing" : "is-filed") : "is-pending"}><dt>{lineLabel(line)}</dt><dd>{lineValue(line) || "—"}</dd></div>)}
      {payroll.stubsExchanged > 0 && <div className={shown.exchangeShown ? (finished ? "is-filed" : "is-landing") : "is-pending"}><dt>Stubs exchanged</dt><dd>{plural(payroll.stubsExchanged * wallet.stubRate, "stub")} → {plural(payroll.stubsExchanged, "ticket")}</dd></div>}
      {payroll.ticketsConverted > 0 && <div className={shown.collectionShown ? (finished ? "is-filed" : "is-landing") : "is-pending"}><dt>Collection complete</dt><dd>{plural(payroll.ticketsConverted, "ticket")} → +{payroll.meritFromTickets} Merit</dd></div>}
    </dl>
    {levelled && <div className={`payroll-level-up${shown.levelUpShown ? (finished ? " is-filed" : " is-burst") : " is-pending"}`} role="status">
      <b>Clearance Level {payroll.levelAfter}</b>
      <ul>{payroll.levels.flatMap((entry) => entry.rewards.map((reward, index) => <li key={`${entry.level}-${entry.bonus ?? 0}-${index}`} style={{ "--reward-index": index } as React.CSSProperties}>{rewardLabel(reward)}</li>))}</ul>
    </div>}
    <div className="payroll-wallet">
      <span className="payroll-holdings">
        <b key={tickets} className="payroll-tickets">{plural(tickets, "Booster Ticket")}</b>
        <span className="payroll-pips" role="img" aria-label={`${wallet.stubs} of ${rate} stubs`}>{Array.from({ length: rate }, (_, pip) => <i key={pip} className={pip < held ? (pip >= heldBefore && !finished ? "is-new" : "is-held") : ""} />)}</span>
        <small aria-hidden="true">{held}/{rate} stubs</small>
      </span>
      <span className="payroll-level">Clearance Level {shown.meter.level}{meterNext !== null && <> · {meterMerit.toLocaleString()} / {meterNext.toLocaleString()} Merit</>}</span>
      <span className="payroll-meter" aria-hidden="true"><i className={shown.meter.reset ? "is-reset" : ""} style={{ width: `${shown.meter.pct}%` }} /></span>
    </div>
    {!finished && <button type="button" className="button ghost payroll-skip" onClick={(event) => { event.stopPropagation(); skipNow(); }}>Skip</button>}
    {finished && <div className="payroll-links">
      {wallet.tickets > 0 && <button type="button" className="button ghost payroll-open" onClick={() => navigate({ page: "cards" })}>Open packs in the Card Library <span aria-hidden="true">→</span></button>}
      <button type="button" className="button ghost payroll-open" onClick={() => navigate({ page: "collection" })}>See your Collection <span aria-hidden="true">→</span></button>
    </div>}
  </section>;
}
