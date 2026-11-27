// Shared career presentation: the Clearance Level ring, a one-line summary of where the player stands,
// and what the next level pays. The header, Field Agent panel, Home, setup and the Collection page all
// read it, so the progression feels like one system. Presentation only: the numbers come from the
// career store (app/career.ts) and the level track in content/packs.json.
import { useMemo, type ReactNode } from "react";
import { economy } from "./career";
import { summarizeCareer, type CareerSummary } from "./career-summary";
import { useCareer } from "./use-career";
import "./career-ui.css";
import { plural, rewardLabel } from "./career-labels";

export function useCareerSummary(): CareerSummary | null {
  const snapshot = useCareer();
  return useMemo(() => summarizeCareer(snapshot), [snapshot]);
}

/** A circular progress ring around anything (an avatar, a number). The ring is decoration; the text carries the meaning. */
export function CareerRing({ fraction, size = 56, stroke = 4, children, className = "" }: { fraction: number; size?: number; stroke?: number; children?: ReactNode; className?: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return <em className={`career-ring ${className}`} style={{ width: size, height: size }}>
    <svg aria-hidden="true" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle className="career-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
      <circle className="career-ring-fill" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fraction)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
    <em className="career-ring-inner">{children}</em>
  </em>;
}

/** "340 / 525 Merit" or "Merit 12,400" once the level track ends. */
export function meritText(summary: CareerSummary) {
  return summary.progress.next !== null ? `${summary.merit.toLocaleString()} / ${summary.progress.next.toLocaleString()} Merit` : `${summary.merit.toLocaleString()} Merit`;
}

/** The ticket and stub holdings in one phrase. */
export function holdingsText(summary: CareerSummary) {
  const tickets = `${summary.tickets} Booster Ticket${summary.tickets === 1 ? "" : "s"}`;
  return `${tickets} · ${summary.stubs}/${summary.stubRate} stubs`;
}

/** The career card inside the Field Agent menu: level, Merit, what is next, tickets, and the way to the Collection. */
export function CareerPanel({ summary, onGo }: { summary: CareerSummary; onGo: (page: "collection" | "cards") => void }) {
  const next = summary.nextLevel;
  return <section className="user-menu-career" aria-label="Clearance Level">
    <div className="user-menu-career-head"><b>Clearance Level {summary.level}</b><span>{summary.diploma}</span></div>
    <div className="career-bar" role="progressbar" aria-label="Merit toward the next level" aria-valuemin={0} aria-valuemax={summary.progress.span || 1} aria-valuenow={summary.progress.into}><i style={{ width: `${Math.round(summary.fraction * 100)}%` }} /></div>
    <p>{meritText(summary)}{next && <> · Level {next.level} pays {next.rewards.map((reward) => rewardLabel(reward)).slice(0, 2).join(", ")}{next.rewards.length > 2 ? "…" : ""}</>}</p>
    <p className="user-menu-career-wallet"><b>{summary.tickets}</b> Booster {summary.tickets === 1 ? "Ticket" : "Tickets"} · {summary.stubs}/{summary.stubRate} stubs · {summary.owned}/{summary.total} cards</p>
    <div className="user-menu-career-actions">
      <button type="button" onClick={() => onGo("collection")}>Collection <span aria-hidden="true">→</span></button>
      {summary.tickets > 0 && <button type="button" className="is-ticket" onClick={() => onGo("cards")}>Open {summary.tickets === 1 ? "your pack" : "packs"} <span aria-hidden="true">→</span></button>}
    </div>
  </section>;
}

/** Home: the career as a call to action: where you stand, the next three levels, tickets ready to open. */
export function CareerBand({ summary, onGo }: { summary: CareerSummary; onGo: (page: "collection" | "cards" | "playtest") => void }) {
  const upcoming = economy.levels.filter((entry) => entry.level > summary.level).slice(0, 3);
  const headline = summary.tickets > 0
    ? `${summary.tickets} Booster ${summary.tickets === 1 ? "Ticket is" : "Tickets are"} waiting to be opened.`
    : summary.level === 1 && summary.merit === 0 ? "Win or finish a match to start your record." : `${summary.nextLevel ? summary.progress.next! - summary.merit : 0} Merit to Level ${summary.nextLevel?.level ?? summary.level}.`;
  return <section className="shell home-block career-band" aria-labelledby="career-band-title">
    <header className="home-block-head"><span className="home-block-tab">★</span><div><h2 id="career-band-title">Your dojo record.</h2><p>{headline}</p></div></header>
    <div className="career-band-card">
      <CareerRing fraction={summary.fraction} size={104} stroke={8} className="career-band-ring"><b>{summary.level}</b><small>Level</small></CareerRing>
      <div className="career-band-main">
        <b className="career-band-title">Clearance Level {summary.level} · {summary.diploma}</b>
        <div className="career-bar" role="progressbar" aria-label="Merit toward the next level" aria-valuemin={0} aria-valuemax={summary.progress.span || 1} aria-valuenow={summary.progress.into}><i style={{ width: `${Math.round(summary.fraction * 100)}%` }} /></div>
        <span className="career-band-merit">{meritText(summary)} · {summary.stubs}/{summary.stubRate} stubs · {summary.owned}/{summary.total} cards collected</span>
        <ul className="career-band-next" aria-label="Coming up">{upcoming.map((entry) => <li key={entry.level}><b>Lv {entry.level}</b><span>{entry.rewards.slice(0, 3).map((reward) => rewardLabel(reward)).join(" · ")}</span></li>)}</ul>
      </div>
      <div className="career-band-actions">
        {summary.tickets > 0 && <button type="button" className="button primary" onClick={() => onGo("cards")}>Open {summary.tickets === 1 ? "your pack" : `${summary.tickets} packs`} →</button>}
        <button type="button" className={`button ${summary.tickets > 0 ? "ghost" : "primary"}`} onClick={() => onGo("collection")}>See the Collection →</button>
        {summary.tickets === 0 && <button type="button" className="button ghost" onClick={() => onGo("playtest")}>Earn Merit: play</button>}
      </div>
    </div>
  </section>;
}

/** Setup: what this table pays, before you sit down. Mirrors the engine's pay rules (engine/collection.mjs) for display only. */
export function SetupPayroll({ mode, difficulty }: { mode: string; difficulty: string }) {
  const summary = useCareerSummary();
  if (!summary) return null;
  const earn = economy.packs.earnRules;
  const win = earn.matchResults.win as Record<string, number>;
  const loss = earn.matchResults.loss as Record<string, number>;
  const stages = (earn.modes.find((entry) => entry.mode === mode) as { stageMeritMultipliers?: Record<string, number> } | undefined)?.stageMeritMultipliers;
  const multiplier = stages ? 1 : (earn.difficultyMeritMultipliers as Record<string, number>)[difficulty] ?? 1;
  const whole = (value: number) => Math.round(value);
  const winMerit = whole((win.merit ?? 0) * multiplier);
  const lossMerit = whole((loss.merit ?? 0) * multiplier);
  if (summary.openDojo) return <div className="setup-payroll is-off"><b>Open Dojo is on</b><p>The full catalog is on loan, so this match pays nothing. Switch back to My Collection in the Collection to earn Merit.</p></div>;
  const afterWin = summary.merit + winMerit;
  const winLevel = economy.levelFor(afterWin);
  return <div className="setup-payroll">
    <div className="setup-payroll-head"><b>Payroll for this match</b><span>Clearance Level {summary.level}</span></div>
    <ul>
      <li><span>Win</span><b>+{winMerit} Merit · {plural(win["booster-ticket"] ?? 0, "Booster Ticket")}</b></li>
      <li><span>Match closed</span><b>+{lossMerit} Merit · {plural(loss["ticket-stub"] ?? 0, "Ticket Stub")}</b></li>
    </ul>
    <p>{stages ? "Merit scales with the Boss stage you reach. " : multiplier !== 1 ? `${difficulty[0].toUpperCase()}${difficulty.slice(1)} filings pay ×${multiplier}. ` : ""}{winLevel > summary.level ? <b>A win would take you to Level {winLevel}.</b> : summary.progress.next !== null ? <>A win leaves you {Math.max(0, summary.progress.next - afterWin).toLocaleString()} Merit from Level {summary.level + 1}.</> : null}</p>
  </div>;
}
