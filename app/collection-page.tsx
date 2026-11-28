// The Collection: your Clearance Level, the whole level track and what each level pays, your card series,
// the fighters and Bosses still locked, and how Merit is earned. One page that makes the career feel like
// the game's second layer. Presentation only: every number comes from the career store and content/packs.json.
import { useEffect, useMemo, useRef } from "react";
import cardsJson from "./data/cards.json";
import { artistUrl, fighterIllustrationUrl } from "./card-art";
import { CareerRing, holdingsText, meritText, useCareerSummary } from "./career-ui";
import { plural, rewardLabel, titleCase } from "./career-labels";
import { careerStore, economy, type Reward } from "./career";
import { useCareer } from "./use-career";
import { navigate } from "./routing";
import "./collection-page.css";

type CatalogCard = { catalogId: string; name: string; image?: string };
const CARDS = new Map((cardsJson as unknown as { cards: CatalogCard[] }).cards.map((card) => [card.catalogId, card]));
const starting = (economy.packs.unlockables as unknown as { characters: { starting: { catalogId: string }[] }; bosses: { starting: { catalogId: string }[] } });

type Unlock = { catalogId: string; name: string; level: number | null; kind: "fighter" | "boss"; owned: boolean };

/** Reward chips for one level, by importance: tickets, fighters, Bosses, series, the rest. */
function rewardChips(rewards: Reward[]) {
  const order = (reward: Reward) => ["booster-ticket", "unlock-character", "unlock-boss", "unlock-booster", "starter-kit-choice", "title", "cosmetic"].indexOf(reward.kind);
  return [...rewards].sort((a, b) => order(a) - order(b)).map((reward, index) => ({ reward, key: `${reward.kind}-${index}`, label: reward.kind === "unlock-booster" ? `${rewardLabel(reward)}` : rewardLabel(reward) }));
}

const KIND_ICON: Record<string, string> = { "booster-ticket": "▤", "unlock-character": "☗", "unlock-boss": "♛", "unlock-booster": "✦", "starter-kit-choice": "▣", title: "★", cosmetic: "◇" };

function useUnlocks(roster: { characters: Set<string>; bosses: Set<string> } | null): Unlock[] {
  return useMemo(() => {
    const list: Unlock[] = [];
    for (const level of economy.levels) for (const reward of level.rewards) {
      if ((reward.kind === "unlock-character" || reward.kind === "unlock-boss") && reward.catalogId) {
        const kind = reward.kind === "unlock-boss" ? "boss" : "fighter";
        list.push({ catalogId: reward.catalogId, name: reward.name ?? CARDS.get(reward.catalogId)?.name ?? reward.catalogId, level: level.level, kind, owned: Boolean(roster && (kind === "boss" ? roster.bosses : roster.characters).has(reward.catalogId)) });
      }
    }
    return list;
  }, [roster]);
}

export default function CollectionPage() {
  const career = useCareer();
  const summary = useCareerSummary();
  const state = career.state;
  const roster = useMemo(() => (state ? economy.unlockedRoster(state) : null), [state]);
  const unlocks = useUnlocks(roster);
  const series = useMemo(() => (state ? economy.seriesStatus(state) : []), [state]);
  const currentRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";
    currentRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: reduce ? "auto" : "smooth" });
  }, [summary?.level]);

  if (!summary || !state) {
    return <main className="page-shell shell collection-page" aria-labelledby="collection-title">
      <header className="collection-hero"><div><span className="eyebrow">Dojo record</span><h1 id="collection-title">No record on file</h1><p>{economy.unlockEverything ? "Everything is unlocked in this build, so there is nothing to earn. Play any card, fighter or Boss." : "This browser is not keeping records, so Merit and Booster Tickets cannot be saved here. Turn on site storage to start a career."}</p></div></header>
    </main>;
  }

  const startingFighters = starting.characters.starting.length;
  const startingBosses = starting.bosses.starting.length;
  const fightersTotal = unlocks.filter((entry) => entry.kind === "fighter").length + startingFighters;
  const fightersOwned = unlocks.filter((entry) => entry.kind === "fighter" && entry.owned).length + startingFighters;
  const bossesTotal = unlocks.filter((entry) => entry.kind === "boss").length + startingBosses;
  const bossesOwned = unlocks.filter((entry) => entry.kind === "boss" && entry.owned).length + startingBosses;
  const nextUnlock = unlocks.find((entry) => !entry.owned);
  const win = economy.packs.earnRules.matchResults.win as Record<string, number>;
  const loss = economy.packs.earnRules.matchResults.loss as Record<string, number>;
  const multipliers = economy.packs.earnRules.difficultyMeritMultipliers as Record<string, number>;
  const bonus = (id: string) => (economy.packs.earnRules.bonuses.find((entry) => entry.id === id)?.grants ?? {}) as Record<string, number>;
  const ownedPct = Math.round((summary.owned / summary.total) * 100);

  return <main className="page-shell shell collection-page" aria-labelledby="collection-title">
    <header className="collection-hero">
      <CareerRing fraction={summary.fraction} size={132} stroke={9} className="collection-ring"><b>{summary.level}</b><small>Level</small></CareerRing>
      <div className="collection-hero-copy">
        <span className="eyebrow">Dojo record · {summary.diploma}</span>
        <h1 id="collection-title">Clearance Level {summary.level}</h1>
        <div className="collection-meter" role="progressbar" aria-label="Merit toward the next Clearance Level" aria-valuemin={0} aria-valuemax={summary.progress.span || 1} aria-valuenow={summary.progress.into}><i style={{ width: `${Math.round(summary.fraction * 100)}%` }} /></div>
        <p className="collection-merit">{meritText(summary)}{summary.nextLevel && <> · <b>Level {summary.nextLevel.level}</b> pays {rewardChips(summary.nextLevel.rewards).map((chip) => chip.label).join(", ")}</>}</p>
      </div>
      <div className="collection-wallet" aria-label="Booster Tickets and Ticket Stubs">
        <div className="collection-ticket"><b>{summary.tickets}</b><span>Booster {summary.tickets === 1 ? "Ticket" : "Tickets"}</span></div>
        <span className="collection-stubs" role="img" aria-label={`${summary.stubs} of ${summary.stubRate} stubs`}>{Array.from({ length: summary.stubRate }, (_, index) => <i key={index} className={index < summary.stubs ? "is-held" : ""} />)}<small>{summary.stubs}/{summary.stubRate} stubs</small></span>
        {summary.tickets > 0
          ? <button type="button" className="button primary" onClick={() => navigate({ page: "cards" })}>Open packs →</button>
          : <button type="button" className="button ghost" onClick={() => navigate({ page: "playtest" })}>Play a match to earn one</button>}
      </div>
    </header>

    {state.openDojo && <aside className="collection-note" role="note"><p><b>Open Dojo is on.</b> The full catalog is on loan and matches pay nothing. Your record is safe.</p><button type="button" className="button ghost" onClick={() => careerStore.setOpenDojo(false)}>Back to My Collection</button></aside>}

    <section className="collection-block" aria-labelledby="track-title">
      <header><span className="eyebrow">The level track</span><h2 id="track-title">{economy.levels.length} levels of paperwork</h2><p>Every level pays Booster Tickets, and most open a fighter, a Boss, a booster series or a keepsake. Merit comes from every match you finish.</p></header>
      <ol className="level-track">
        {economy.levels.map((entry) => {
          const state = entry.level < summary.level ? "cleared" : entry.level === summary.level ? "current" : "locked";
          return <li key={entry.level} ref={state === "current" ? currentRef : undefined} className={`level-node is-${state}${summary.nextLevel?.level === entry.level ? " is-next" : ""}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="level-node-badge"><small>Lv</small><b>{entry.level}</b>{state === "cleared" && <i aria-hidden="true">✓</i>}</span>
            <span className="level-node-merit">{entry.meritTotal.toLocaleString()} Merit</span>
            <ul>{rewardChips(entry.rewards).map((chip) => <li key={chip.key} className={`reward-chip reward-chip--${chip.reward.kind}`}><i aria-hidden="true">{KIND_ICON[chip.reward.kind] ?? "•"}</i>{chip.label}</li>)}</ul>
            <span className="sr-only">{state === "cleared" ? "Cleared" : state === "current" ? "Your current level" : "Locked"}</span>
          </li>;
        })}
      </ol>
      {summary.progress.maxed && <p className="level-track-end">Past level {economy.levels.length}, every {economy.packs.levelTrack.afterFinalLevel?.meritPerReward?.toLocaleString() ?? "2,000"} Merit pays another Booster Ticket.</p>}
    </section>

    <section className="collection-block" aria-labelledby="series-title">
      <header><span className="eyebrow">Your cards · {summary.owned} of {summary.total} collected ({ownedPct}%)</span><h2 id="series-title">Card series</h2><p>Boosters only ever hold cards you do not own yet, five at a time. Finish a series for its completion reward.</p></header>
      <div className="series-grid">
        {series.map((entry) => <article key={entry.id} className={`series-card${entry.unlocked ? "" : " is-locked"}${entry.complete ? " is-complete" : ""}`}>
          <h3>{entry.name}</h3>
          <div className="series-bar" role="img" aria-label={`${entry.owned} of ${entry.total} cards`}><i style={{ width: `${entry.total ? Math.round((entry.owned / entry.total) * 100) : 0}%` }} /></div>
          <p><b>{entry.owned}/{entry.total}</b> {entry.complete ? "· complete" : entry.unlocked ? "· open" : `· opens at Clearance Level ${entry.unlockLevel}`}</p>
          {entry.completionReward && <small>Complete: {rewardLabel(entry.completionReward)}</small>}
        </article>)}
      </div>
      <div className="collection-actions"><button type="button" className="button ghost" onClick={() => navigate({ page: "cards" })}>Open the Card Library <span aria-hidden="true">→</span></button></div>
    </section>

    <section className="collection-block" aria-labelledby="roster-title">
      <header><span className="eyebrow">{fightersOwned} of {fightersTotal} fighters · {bossesOwned} of {bossesTotal} Bosses</span><h2 id="roster-title">Fighters and Bosses to unlock</h2><p>{nextUnlock ? <>Next up: <b>{nextUnlock.name}</b> at Level {nextUnlock.level}.</> : "Everyone has been cleared for duty."} Computer opponents may field anyone.</p></header>
      <ul className="unlock-grid">
        {unlocks.map((entry) => {
          const card = CARDS.get(entry.catalogId);
          const art = card ? (fighterIllustrationUrl(card) ?? artistUrl(card)) : undefined;
          return <li key={entry.catalogId} className={`unlock-tile${entry.owned ? " is-owned" : ""} unlock-tile--${entry.kind}`}>
            <span className="unlock-art" aria-hidden="true">{art ? <img src={art} alt="" loading="lazy" decoding="async" /> : <em>{entry.name.slice(0, 1)}</em>}{!entry.owned && <i>Locked</i>}</span>
            <b>{entry.name}</b>
            <small>{entry.owned ? (entry.kind === "boss" ? "Boss · cleared" : "Cleared for duty") : `${entry.kind === "boss" ? "Boss · " : ""}Level ${entry.level}`}</small>
          </li>;
        })}
      </ul>
    </section>

    <section className="collection-block collection-earn" aria-labelledby="earn-title">
      <header><span className="eyebrow">How Merit works</span><h2 id="earn-title">Every finished match pays</h2></header>
      <dl>
        <div><dt>Win</dt><dd>+{win.merit} Merit · {plural(win["booster-ticket"] ?? 0, "Booster Ticket")}</dd></div>
        <div><dt>Close the match</dt><dd>+{loss.merit} Merit · {plural(loss["ticket-stub"] ?? 0, "Ticket Stub")}</dd></div>
        <div><dt>Stubs</dt><dd>{plural(summary.stubRate, "stub")} make a Booster Ticket</dd></div>
        <div><dt>Belt promotions</dt><dd>+{bonus("belt-promotion").merit} Merit each, in the match</dd></div>
        <div><dt>First win of the day</dt><dd>+{bonus("first-win-of-day").merit} Merit · {plural(bonus("first-win-of-day")["ticket-stub"], "stub")}</dd></div>
        <div><dt>Three wins in a row</dt><dd>+{plural(bonus("win-streak")["ticket-stub"], "stub")}</dd></div>
        <div><dt>Beat a Master</dt><dd>+{plural(bonus("master-win")["ticket-stub"], "stub")}</dd></div>
        <div><dt>Difficulty</dt><dd>{Object.entries(multipliers).map(([key, value]) => `${titleCase(key)} ×${value}`).join(" · ")}</dd></div>
        <div><dt>Holdings now</dt><dd>{holdingsText(summary)}</dd></div>
      </dl>
      <p className="collection-fineprint">Matches shorter than {economy.packs.earnRules.eligibility.minimumCompletedRounds} rounds and Open Dojo matches pay nothing. Your record lives in this browser; export or import it from Settings.</p>
    </section>
  </main>;
}
