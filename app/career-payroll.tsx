// "Department payroll": the stamped slip on an engine table's result screen. It records the finished
// match in the career once (app/career-match.ts) and shows what it paid: Merit, tickets and stubs,
// any Clearance Level reached with its rewards, and the wallet afterwards.
import { useState } from "react";
import { careerStore, economy, walletOf, type Payroll, type PayrollLine, type Reward } from "./career";
import { recordSessionResult } from "./career-match";
import type { EngineSession } from "./engine-session";
import { navigate } from "./routing";
import "./career-payroll.css";

const titleCase = (key: string) => key.split(/[-:\s]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const packName = (id?: string) => economy.boosters.find((pack) => pack.id === id)?.name ?? titleCase(id ?? "");

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

function rewardLabel(reward: Reward) {
  if (reward.kind === "booster-ticket") return plural(reward.count ?? 1, "Booster Ticket");
  if (reward.kind === "unlock-booster") return `${packName(reward.pack)} series opens`;
  if (reward.kind === "unlock-character") return `${reward.name} cleared for duty`;
  if (reward.kind === "unlock-boss") return `New Boss: ${reward.name}`;
  if (reward.kind === "starter-kit-choice") return "Another Starter Kit to choose in the Card Library";
  if (reward.kind === "title") return `Title: ${titleCase((reward.id ?? "").replace(/^title:/, ""))}`;
  const [slot, name] = (reward.id ?? "").split(":");
  return `${titleCase(slot ?? "")}: ${titleCase(name ?? "")} (design pending)`;
}

const REFUSALS: Record<string, { stamp: string; text: () => string }> = {
  "open-dojo": { stamp: "Open Dojo", text: () => "Played with the full catalog, so no payroll is filed. Switch to My Collection in the Card Library to earn Merit and Booster Tickets." },
  "too-short": { stamp: "Not filed", text: () => `Payroll needs at least ${economy.packs.earnRules.eligibility.minimumCompletedRounds} rounds. Play a longer match to earn Merit and tickets.` },
  "no-career": { stamp: "No record", text: () => "This browser is not keeping records, so nothing could be paid." },
  "already-paid": { stamp: "Paid", text: () => "This match has already been paid." },
};

export function PayrollSlip({ session }: { session: EngineSession }) {
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
  const state = careerStore.get().state;
  const wallet = walletOf(state);
  const progress = economy.levelProgress(state?.merit ?? 0);
  const levelled = payroll.levelAfter > payroll.levelBefore;
  return <section className={`payroll-slip${levelled ? " has-level-up" : ""}`} aria-labelledby="payroll-title">
    <span className="payroll-stamp" aria-hidden="true">{levelled ? "Promoted" : "Paid"}</span>
    <span className="eyebrow">Department payroll · Form PF-1</span>
    <h3 id="payroll-title">+{payroll.merit} Merit{payroll.tickets ? ` · +${plural(payroll.tickets, "Booster Ticket")}` : ""}{payroll.stubs ? ` · +${plural(payroll.stubs, "Ticket Stub")}` : ""}</h3>
    <dl className="payroll-lines">
      {payroll.lines.map((line) => <div key={line.id}><dt>{lineLabel(line)}</dt><dd>{lineValue(line) || "—"}</dd></div>)}
      {payroll.stubsExchanged > 0 && <div><dt>Stubs exchanged</dt><dd>{plural(payroll.stubsExchanged * wallet.stubRate, "stub")} → {plural(payroll.stubsExchanged, "ticket")}</dd></div>}
      {payroll.ticketsConverted > 0 && <div><dt>Collection complete</dt><dd>{plural(payroll.ticketsConverted, "ticket")} → +{payroll.meritFromTickets} Merit</dd></div>}
    </dl>
    {levelled && <div className="payroll-level-up" role="status">
      <b>Clearance Level {payroll.levelAfter}</b>
      <ul>{payroll.levels.flatMap((entry) => entry.rewards.map((reward, index) => <li key={`${entry.level}-${entry.bonus ?? 0}-${index}`}>{rewardLabel(reward)}</li>))}</ul>
    </div>}
    <div className="payroll-wallet">
      <span><b>{plural(wallet.tickets, "Booster Ticket")}</b> · {wallet.stubs}/{wallet.stubRate} stubs</span>
      <span className="payroll-level">Clearance Level {progress.level}{progress.next !== null && <> · {state?.merit.toLocaleString()} / {progress.next.toLocaleString()} Merit</>}</span>
      <span className="payroll-meter" aria-hidden="true"><i style={{ width: `${progress.span ? Math.round((progress.into / progress.span) * 100) : 100}%` }} /></span>
    </div>
    {wallet.tickets > 0 && <button type="button" className="button ghost payroll-open" onClick={() => navigate({ page: "cards" })}>Open packs in the Card Library <span aria-hidden="true">→</span></button>}
  </section>;
}
