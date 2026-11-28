// The Test Arena (#arena): a real battle on the real game mat, played under the arena rule variant
// (engine/arena-rules.mjs): the Quick Duel rules plus the draft status effects in
// content/experimental/status-effects.json. Two Dummies fight with the real starter decks, Market, Locations,
// Combos and Belts. The console drawer puts effects on either fighter, loads an effect onto a fighter's next
// Hit (the way a card would deliver it), hands out a Reimburse weapon and summons any catalog card, so every
// effect can be seen landing (shake, cue, entrance) and lingering (the props stay on the fighter) in real combat.
// Internal tool, not in the site navigation.
import { useMemo, useState } from "react";
import effectsJson from "../content/experimental/status-effects.json";
import dummyCard from "../content/experimental/arena-dummy.json";
import { clashData, type EngineCard } from "./clash-engine.ts";
import { EngineSession, newSeed, type EngineAction, type EngineGame, type EngineSeat } from "./engine-session.ts";
import { QuickDuelTable } from "./quick-duel-table";
import { arenaCardDecor, type ArenaMoment } from "./arena-card-fx";
import { cardMotionDisabled } from "./card-motion";
import { navigate } from "./routing";
import "./test-arena.css";

type ArenaState = { effects: { id: string; stacks: number; turns: number | null }[]; grace: Record<string, number>; armed: { effect: string; stacks: number } | null; reimburse: boolean; lastZone: string | null };
type ArenaSeat = EngineSeat & { arena?: ArenaState };
type ArenaApi = EngineGame & {
  applyArenaEffect(target: EngineSeat, effectId: string, options?: { stacks?: number; source?: number | null }): boolean;
  armArenaEffect(player: EngineSeat, effectId: string | null, stacks?: number): void;
  setReimburse(player: EngineSeat, on: boolean): void;
  cardInstance(card: EngineCard): EngineCard;
};

const EFFECTS = effectsJson.effects as { id: string; name: string; alias?: string; tone: string; maxStacks: number; summary: string; durationUnit?: string }[];
const REIMBURSE = effectsJson.keywords[0] as { name: string; alias?: string; summary: string };
const DUMMY = dummyCard as unknown as EngineCard;
const SIDES = [{ seat: 0 as const, label: "You" }, { seat: 1 as const, label: "Opponent" }];
const effectName = (id: string) => EFFECTS.find((effect) => effect.id === id)?.name ?? id;

/** The opponent either plays to win (Certified) or stands still and takes everything (a practice dummy). */
const passive = {
  chooseAction: (_game: EngineGame, legal: EngineAction[]) => legal.find((action) => action.type === "pass" || action.type === "hide") ?? legal[0],
  chooseChoice: (game: EngineGame) => (game.pendingChoice?.options.some((option) => option.id === "pass") ? { optionId: "pass" } : game.defaultChoice()),
};

function newArenaSession(fights: boolean) {
  return new EngineSession({
    mode: "quick-duel", seed: newSeed(), fighters: [DUMMY.catalogId, DUMMY.catalogId], humanSeats: [0], rulesVersion: "arena",
    table: { cardPool: null }, characterCards: [DUMMY], variant: "arena", ...(fights ? { difficulty: "certified" } : {}),
  }, fights ? undefined : passive);
}

/** This fighter's arena events, newest last, each with its log position so its moment plays once. */
function momentsFor(game: EngineGame, seatId: number): ArenaMoment[] {
  const list: ArenaMoment[] = [];
  game.events.forEach((event, index) => {
    if (event.type !== "arena-effect" || event.player !== seatId) return;
    list.push({ index, kind: String(event.kind), effect: event.effect ? String(event.effect) : undefined, amount: event.amount === undefined ? undefined : Number(event.amount), stacks: event.stacks === undefined ? undefined : Number(event.stacks), reason: event.reason ? String(event.reason) : undefined });
  });
  return list.slice(-6);
}

export default function TestArena() {
  const [battle, setBattle] = useState(1);
  const [fights, setFights] = useState(true);
  const session = useMemo(() => newArenaSession(fights), [battle, fights]);
  const [nudge, setNudge] = useState(0);
  const [open, setOpen] = useState(true);
  const refresh = () => setNudge((value) => value + 1);
  const motion = cardMotionDisabled() ? "reduced" : "full";
  return <div className={`arena-host${open ? " has-console" : ""}`}>
    <QuickDuelTable
      key={battle}
      session={session}
      sessionKey={battle}
      agentName="Field Agent"
      guided={false}
      motion={motion}
      onSave={() => undefined}
      onExit={() => navigate({ page: "home" })}
      onRematch={() => setBattle((value) => value + 1)}
      seatDecor={(seat) => arenaCardDecor((seat as ArenaSeat).arena, momentsFor(session.game, seat.id), seat.id === 0 ? "right" : "left")}
      nudge={nudge}
    />
    <button type="button" className="arena-console-tab" aria-expanded={open} aria-controls="arena-console" onClick={() => setOpen((value) => !value)}>{open ? "Hide console ▸" : "◂ Effects console"}</button>
    {open && <ArenaConsole game={session.game as ArenaApi} fights={fights} onFights={(value) => { setFights(value); setBattle((n) => n + 1); }} onChange={refresh} onNewBattle={() => setBattle((n) => n + 1)} />}
  </div>;
}

function ArenaConsole({ game, fights, onFights, onChange, onNewBattle }: { game: ArenaApi; fights: boolean; onFights: (value: boolean) => void; onChange: () => void; onNewBattle: () => void }) {
  const [target, setTarget] = useState<0 | 1>(1);
  const [stacks, setStacks] = useState(1);
  const [query, setQuery] = useState("");
  const seats = game.players as ArenaSeat[];
  const act = (work: () => void) => { work(); onChange(); };
  const cards = useMemo(() => (clashData().cards as EngineCard[]).filter((card) => card.cardType !== "Character" && !card.catalogId.startsWith("DDB-B")), []);
  const found = query.trim().length >= 2 ? cards.filter((card) => card.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : [];
  const hitter = target === 1 ? 0 : 1;

  return <aside className="arena-console" id="arena-console" aria-label="Arena effects console">
    <header><span className="eyebrow">Test Arena · rule variant on</span><h2>Effects console</h2><p>A real Quick Duel, Dummy against Dummy, with the draft effects switched on. Put an effect on a fighter, or load one onto a Hit, then play the turn out.</p></header>

    <section aria-label="Target">
      <h3>Target</h3>
      <div className="arena-seg" role="radiogroup" aria-label="Target">{SIDES.map((side) => <button type="button" role="radio" aria-checked={target === side.seat} key={side.seat} className={target === side.seat ? "is-on" : ""} onClick={() => setTarget(side.seat)}>{side.label}</button>)}</div>
      <label className="arena-inline">Stacks <select value={stacks} onChange={(event) => setStacks(Number(event.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
    </section>

    <section aria-label="Put an effect on now">
      <h3>Put on {target === 0 ? "you" : "the opponent"} now</h3>
      <div className="arena-effects-grid">{EFFECTS.map((effect) => <button type="button" key={effect.id} className={`arena-effect arena-effect--${effect.tone}`} title={effect.summary} onClick={() => act(() => game.applyArenaEffect(seats[target], effect.id, { stacks, source: null }))}><b>{effect.name}</b>{effect.alias && <small>{effect.alias}</small>}</button>)}</div>
    </section>

    <section aria-label="Load an effect onto a Hit">
      <h3>Load onto {hitter === 0 ? "your" : "the opponent's"} next Hit</h3>
      <p className="arena-help">How a card would deliver it: the next Attack that Hits {target === 1 ? "the opponent" : "you"} applies it.</p>
      <div className="arena-effects-grid arena-effects-grid--small">{EFFECTS.map((effect) => <button type="button" key={effect.id} className={`arena-effect arena-effect--${effect.tone}`} onClick={() => act(() => game.armArenaEffect(seats[hitter], effect.id, stacks))}>{effect.name}</button>)}</div>
    </section>

    <section aria-label="Reimburse weapons">
      <h3>{REIMBURSE.name} weapon <small>({REIMBURSE.alias})</small></h3>
      {SIDES.map((side) => <label key={side.seat} className="arena-check"><input type="checkbox" checked={Boolean(seats[side.seat].arena?.reimburse)} onChange={(event) => act(() => game.setReimburse(seats[side.seat], event.target.checked))} />{side.seat === 0 ? "You carry one" : "The opponent carries one"}</label>)}
    </section>

    <section aria-label="Summon a card">
      <h3>Summon a card into your hand</h3>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Card name, 2+ letters" aria-label="Search the catalog" />
      {found.length > 0 && <ul className="arena-found">{found.map((card) => <li key={card.catalogId}><button type="button" onClick={() => act(() => { seats[0].hand.push(game.cardInstance(card)); setQuery(""); })}><b>{card.name}</b><small>{card.subtype || card.cardType}</small></button></li>)}</ul>}
    </section>

    <section aria-label="Table">
      <h3>Table</h3>
      <div className="arena-row">
        <button type="button" className="button ghost" onClick={() => act(() => { seats[0].focus += 3; })}>+3 Focus for you</button>
        {SIDES.map((side) => <button type="button" key={side.seat} className="button ghost" onClick={() => act(() => { seats[side.seat].hp = Math.max(1, seats[side.seat].hp - 5); })}>Wound {side.seat === 0 ? "you" : "opponent"} −5</button>)}
      </div>
      <label className="arena-check"><input type="checkbox" checked={fights} onChange={(event) => onFights(event.target.checked)} />The opponent fights back (off: it stands still)</label>
      <button type="button" className="button primary" onClick={onNewBattle}>New battle</button>
    </section>

    <section aria-label="On the fighters right now">
      <h3>Right now</h3>
      {SIDES.map((side) => {
        const arena = seats[side.seat].arena;
        const parts = (arena?.effects ?? []).map((entry) => `${effectName(entry.id)}${entry.stacks > 1 ? ` ×${entry.stacks}` : ""}${entry.turns !== null ? ` (${entry.turns} ${EFFECTS.find((effect) => effect.id === entry.id)?.durationUnit === "ownTurns" ? "turn" : "rd"})` : ""}`);
        if (arena?.armed) parts.push(`next Hit: ${effectName(arena.armed.effect)}`);
        if (arena?.reimburse) parts.push("Reimburse weapon");
        if (arena?.lastZone && arena.effects.some((entry) => entry.id === "stapled")) parts.push(`stapled to ${arena.lastZone}`);
        return <div key={side.seat} className="arena-now"><b>{side.label}</b><span>{parts.length ? parts.join(" · ") : "nothing"}</span></div>;
      })}
    </section>

    <details className="arena-rules"><summary>The draft rules</summary><ul>{EFFECTS.map((effect) => <li key={effect.id}><b>{effect.name}{effect.alias ? ` (${effect.alias})` : ""}.</b> {effect.summary}</li>)}<li><b>{REIMBURSE.name} ({REIMBURSE.alias}).</b> {REIMBURSE.summary}</li></ul></details>
  </aside>;
}
