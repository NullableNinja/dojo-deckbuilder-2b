// The Test Arena (#arena): a place to watch effects happen. Two Dummies (a sack of flour on a stick) face off.
//  - Effects Lab: the draft effects in content/experimental/status-effects.json (burn, poison, freeze, Reimburse)
//    resolved by engine/status-effects.mjs and animated, so the look and the numbers can be judged together.
//  - Card Sandbox: summon any catalog card into a real engine game, play it, and read what the engine did.
// Internal tool, not in the site navigation. Presentation over the engine; it decides no rule itself.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import effectsJson from "../content/experimental/status-effects.json";
import { applyStatus, createCatalog, createCombatant, effectiveSpeed, endRound, strike } from "../engine/status-effects.mjs";
import { clashData, type EngineCard } from "./clash-engine.ts";
import { EngineSession, newSeed, type EngineAction } from "./engine-session.ts";
import { fightLog, findInstance, choicePrompt, choiceTitle, seatStats, statusLabels } from "./mat-view.ts";
import { cardMotionDisabled } from "./card-motion";
import { DummyFigure, Flames, IceShell, PoisonCloud, ReimburseGlow, ShatterBurst, type DummyStatus } from "./arena-dummy";
import "./test-arena.css";

type Combatant = { id: string; name: string; hp: number; maxHp: number; atk: number; def: number; speed: number; keywords: string[]; statuses: DummyStatus[]; grace: Record<string, number>; healedThisRound: number };
type ArenaEvent = { type: string; [key: string]: unknown };
type Fx = { id: number; kind: "float" | "shatter" | "motes"; target: 0 | 1; text?: string; tone?: string; from?: 0 | 1 };
const catalog = createCatalog(effectsJson);
const EFFECTS = effectsJson.effects;
const KEYWORDS = effectsJson.keywords;
const NAMES = ["Dummy A", "Dummy B"] as const;
let fxSerial = 0;

const freshFighters = (): [Combatant, Combatant] => [
  createCombatant({ id: "a", name: NAMES[0], hp: 25, atk: 3, def: 2, speed: 3 }) as Combatant,
  createCombatant({ id: "b", name: NAMES[1], hp: 25, atk: 3, def: 2, speed: 3 }) as Combatant,
];
const indexOf = (id: unknown) => (id === "a" ? 0 : 1) as 0 | 1;

/** Plain sentence for a log line. */
function describe(event: ArenaEvent): string {
  const t = (id: unknown) => NAMES[indexOf(id)];
  const effect = (id: unknown) => EFFECTS.find((entry) => entry.id === id)?.name ?? String(id);
  switch (event.type) {
    case "strike": return `${t(event.actor)} strikes ${t(event.target)} (${event.raw} power, ${event.absorbed} absorbed by DEF).`;
    case "absorbed": return `${t(event.target)}'s DEF absorbed the whole blow.`;
    case "damage": return `${t(event.target)} takes ${event.amount} damage.`;
    case "shatter": return `The ice on ${t(event.target)} shatters: +${event.bonus} damage, Freeze ends.`;
    case "blocked": return `${t(event.actor)} is frozen and cannot ${event.action}.`;
    case "applied": return `${t(event.target)} is now ${effect(event.effect)}${Number(event.stacks) > 1 ? ` ×${event.stacks}` : ""}.`;
    case "stacked": return `${effect(event.effect)} on ${t(event.target)} builds to ×${event.stacks}.`;
    case "resisted": return `${t(event.target)} resists ${effect(event.effect)} (${event.reason === "grace" ? "just thawed" : "already affected"}).`;
    case "thaw": return `${t(event.target)} thaws${event.by && event.by !== "time" ? ` (${effect(event.by)})` : ""}.`;
    case "tick": return `${effect(event.effect)} deals ${event.amount} to ${t(event.target)} at Honor.`;
    case "expire": return `${effect(event.effect)} wears off ${t(event.target)}.`;
    case "heal": return `${t(event.target)} Reimburses ${event.amount} HP from ${t(event.from)}'s injury.`;
    case "heal-capped": return `${t(event.target)} already Reimbursed this round.`;
    case "heal-reduced": return `Poison cancels ${t(event.target)}'s Reimburse.`;
    case "ko": return `${t(event.target)} is knocked out.`;
    default: return String(event.type);
  }
}

function EffectIcon({ id, size = 18 }: { id: string; size?: number }) {
  const paths: Record<string, string> = {
    flame: "M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 3 3 2-1-2-1-4 0-7z",
    drop: "M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z",
    snowflake: "M12 2v20M3.5 7l17 10M3.5 17l17-10M9 4l3 2 3-2M9 20l3-2 3 2",
    heart: "M12 21C5 15 3 11 3 8a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 3-2 7-9 13z",
  };
  const stroke = id === "snowflake";
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={`arena-icon arena-icon--${id}`}>{stroke ? <path d={paths[id]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <path d={paths[id]} fill="currentColor" />}</svg>;
}

type FighterView = { name: string; hp: number; maxHp: number; atk: number; def: number; speed: number; chips: { key: string; icon?: string; text: string; tone?: string }[]; statuses: DummyStatus[]; reimburse: boolean };

function ArenaFighter({ view, team, flip, fx, anim, still }: { view: FighterView; team: "a" | "b"; flip?: boolean; fx: Fx[]; anim: string; still: boolean }) {
  const frozen = view.statuses.find((status) => status.id === "freeze");
  const burn = view.statuses.find((status) => status.id === "burn");
  const poison = view.statuses.find((status) => status.id === "poison");
  const pct = Math.max(0, Math.round((view.hp / view.maxHp) * 100));
  return <div className={`arena-fighter arena-fighter--${team}${frozen ? " is-frozen" : ""}${burn ? " is-burning" : ""}${poison ? " is-poisoned" : ""}${anim ? ` is-${anim}` : ""}${view.hp <= 0 ? " is-ko" : ""}`} data-fighter={team}>
    <div className="arena-plate">
      <b>{view.name}</b>
      <div className="arena-hp" role="progressbar" aria-label={`${view.name} HP`} aria-valuemin={0} aria-valuemax={view.maxHp} aria-valuenow={view.hp}><i style={{ width: `${pct}%` }} /><span>{view.hp} / {view.maxHp} HP</span></div>
      <dl className="arena-stats"><div><dt>ATK</dt><dd>{view.atk}</dd></div><div><dt>DEF</dt><dd>{view.def}</dd></div><div><dt>SPD</dt><dd>{view.speed}</dd></div></dl>
    </div>
    <div className="arena-body">
      <DummyFigure team={team} flip={flip} />
      {view.reimburse && <ReimburseGlow />}
      {frozen && <IceShell />}
      {burn && <Flames stacks={burn.stacks} />}
      {poison && <PoisonCloud stacks={poison.stacks} />}
      {fx.map((entry, index) => entry.kind === "shatter" ? <ShatterBurst key={entry.id} /> : <span key={entry.id} className={`arena-float arena-float--${entry.tone ?? "plain"}`} style={{ top: `${6 + (index % 4) * 14}%` }} data-still={still || undefined}>{entry.text}</span>)}
    </div>
    <ul className="arena-chips" aria-label={`${view.name} status`}>
      {view.chips.length ? view.chips.map((chip) => <li key={chip.key} className={`arena-chip arena-chip--${chip.tone ?? "plain"}`}>{chip.icon && <EffectIcon id={chip.icon} size={14} />}{chip.text}</li>) : <li className="arena-chip arena-chip--empty">No status</li>}
    </ul>
  </div>;
}

/** The two fighters, the middle caption, and the mote layer for Reimburse. */
function Stage({ views, fx, anim, still, caption, round }: { views: [FighterView, FighterView]; fx: Fx[]; anim: [string, string]; still: boolean; caption: string; round: number }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const motes = fx.filter((entry) => entry.kind === "motes");
  return <div className="arena-stage" ref={stageRef}>
    <ArenaFighter view={views[0]} team="a" fx={fx.filter((entry) => entry.kind !== "motes" && entry.target === 0)} anim={anim[0]} still={still} />
    <div className="arena-center" aria-live="polite"><span>Round</span><b>{round}</b><p>{caption}</p></div>
    <ArenaFighter view={views[1]} team="b" flip fx={fx.filter((entry) => entry.kind !== "motes" && entry.target === 1)} anim={anim[1]} still={still} />
    {!still && motes.map((mote) => <span key={mote.id} className={`arena-motes arena-motes--from-${mote.from}`} aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} style={{ animationDelay: `${index * 70}ms`, "--lift": `${(index % 3) * 26 - 26}px` } as CSSProperties} />)}</span>)}
  </div>;
}

const toView = (combatant: Combatant): FighterView => ({
  name: combatant.name, hp: combatant.hp, maxHp: combatant.maxHp, atk: combatant.atk, def: combatant.def,
  speed: effectiveSpeed(catalog, combatant),
  statuses: combatant.statuses,
  reimburse: combatant.keywords.includes("reimburse"),
  chips: [
    ...combatant.statuses.map((status) => {
      const effect = EFFECTS.find((entry) => entry.id === status.id)!;
      return { key: status.id, icon: effect.icon, tone: effect.tone, text: `${effect.name}${effect.maxStacks > 1 ? ` ×${status.stacks}` : ""}${status.turns !== null ? ` · ${status.turns} rd` : ""}` };
    }),
    ...combatant.keywords.map((id) => ({ key: `k-${id}`, icon: "heart", tone: "rose", text: `${KEYWORDS.find((keyword) => keyword.id === id)?.name ?? id} weapon` })),
    ...(Object.entries(combatant.grace).filter(([, rounds]) => rounds > 0).map(([id]) => ({ key: `g-${id}`, text: `${id[0].toUpperCase()}${id.slice(1)}-immune · 1 rd`, tone: "plain" }))),
  ],
});

// ---- Effects Lab ------------------------------------------------------------------------------------------------

function EffectsLab({ still }: { still: boolean }) {
  const [fighters, setFighters] = useState<[Combatant, Combatant]>(freshFighters);
  const [round, setRound] = useState(1);
  const [log, setLog] = useState<string[]>(["The arena is ready. Pick an effect and aim it."]);
  const [actor, setActor] = useState<0 | 1>(0);
  const [power, setPower] = useState(3);
  const [stacks, setStacks] = useState(1);
  const [fx, setFx] = useState<Fx[]>([]);
  const [anim, setAnim] = useState<[string, string]>(["", ""]);
  const [caption, setCaption] = useState("Dummy A acts. Dummy B is the target.");
  const [demoRunning, setDemoRunning] = useState(false);
  const timers = useRef<number[]>([]);
  const demoAbort = useRef(false);
  const state = useRef({ fighters, round });
  state.current = { fighters, round };
  useEffect(() => () => { timers.current.forEach((timer) => window.clearTimeout(timer)); demoAbort.current = true; }, []);
  const later = (ms: number, work: () => void) => { timers.current.push(window.setTimeout(work, ms)); };
  const target = (actor === 0 ? 1 : 0) as 0 | 1;

  /** Run a rule against a fresh copy, then turn its events into log lines and animation. */
  const run = (work: (pair: [Combatant, Combatant]) => ArenaEvent[], extra?: { round?: number }) => {
    const pair = structuredClone(state.current.fighters) as [Combatant, Combatant];
    const events = work(pair);
    state.current = { fighters: pair, round: extra?.round ?? state.current.round };
    setFighters(pair);
    if (extra?.round) setRound(extra.round);
    if (!events.length) return;
    setLog((current) => [...events.map(describe), ...current].slice(0, 60));
    const additions: Fx[] = [];
    const flash = (side: 0 | 1, kind: string, ms = 520) => { setAnim((current) => (side === 0 ? [kind, current[1]] : [current[0], kind])); later(ms, () => setAnim((current) => (side === 0 ? ["", current[1]] : [current[0], ""]))); };
    for (const event of events) {
      const side = indexOf(event.target ?? event.actor);
      const float = (text: string, tone: string, on: 0 | 1 = side) => additions.push({ id: ++fxSerial, kind: "float", target: on, text, tone });
      if (event.type === "strike") flash(indexOf(event.actor), "striking", 480);
      if (event.type === "damage") { float(`−${event.amount}`, "hit"); flash(side, "hit"); }
      if (event.type === "absorbed") float("BLOCKED", "plain");
      if (event.type === "shatter") { additions.push({ id: ++fxSerial, kind: "shatter", target: side }); float(`SHATTER +${event.bonus}`, "ice"); }
      if (event.type === "blocked") float("FROZEN!", "ice", indexOf(event.actor));
      if (event.type === "applied" || event.type === "stacked") float(String(EFFECTS.find((entry) => entry.id === event.effect)?.name ?? event.effect).toUpperCase(), String(EFFECTS.find((entry) => entry.id === event.effect)?.tone ?? "plain"));
      if (event.type === "resisted") float("RESISTED", "plain");
      if (event.type === "thaw") float("THAW", "ice");
      if (event.type === "tick") { float(`−${event.amount}`, String(EFFECTS.find((entry) => entry.id === event.effect)?.tone ?? "hit")); flash(side, "hit", 360); }
      if (event.type === "heal") { float(`+${event.amount}`, "rose"); additions.push({ id: ++fxSerial, kind: "motes", target: side, from: indexOf(event.from) }); }
      if (event.type === "heal-capped") float("CAPPED", "plain");
      if (event.type === "heal-reduced") float("POISONED", "violet");
      if (event.type === "ko") float("K.O.", "hit");
    }
    if (additions.length) {
      setFx((current) => [...current, ...additions]);
      later(1700, () => setFx((current) => current.filter((entry) => !additions.some((added) => added.id === entry.id))));
    }
  };

  const doStrike = () => run((pair) => strike(catalog, pair[actor], pair[target], { power }));
  const doApply = (effectId: string) => run((pair) => applyStatus(catalog, pair[target], effectId, { stacks, source: pair[actor].id }));
  const doRound = () => run((pair) => endRound(catalog, pair), { round: state.current.round + 1 });
  const toggleKeyword = (side: 0 | 1) => run((pair) => { const list = pair[side].keywords; pair[side].keywords = list.includes("reimburse") ? [] : ["reimburse"]; return []; });
  const wound = (side: 0 | 1, amount = 8) => run((pair) => { pair[side].hp = Math.max(1, pair[side].hp - amount); return []; });
  const reset = () => { demoAbort.current = true; setDemoRunning(false); const pair = freshFighters(); state.current = { fighters: pair, round: 1 }; setFighters(pair); setRound(1); setFx([]); setAnim(["", ""]); setLog(["Reset. Two fresh Dummies."]); setCaption("Dummy A acts. Dummy B is the target."); };

  const demo = async () => {
    reset();
    demoAbort.current = false; setDemoRunning(true);
    const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, still ? Math.min(ms, 300) : ms));
    const say = async (text: string, action: () => void, pause = 1500) => { if (demoAbort.current) throw new Error("stop"); setCaption(text); action(); await wait(pause); };
    const sideRun = (side: 0 | 1, work: (pair: [Combatant, Combatant], actorIndex: 0 | 1, targetIndex: 0 | 1) => ArenaEvent[], round?: number) => run((pair) => work(pair, side, (side === 0 ? 1 : 0) as 0 | 1), round ? { round } : undefined);
    try {
      await wait(500);
      await say("A plain Attack: ATK 3 + power 3, minus Dummy B's DEF 2.", () => sideRun(0, (p, a, t) => strike(catalog, p[a], p[t], { power: 3 })));
      await say("BURN: two stacks. It ignores DEF.", () => sideRun(0, (p, a, t) => applyStatus(catalog, p[t], "burn", { stacks: 2 })), 1800);
      await say("Honor: the fire ticks for 2.", () => sideRun(0, (p) => endRound(catalog, p), state.current.round + 1), 1700);
      await say("POISON: three stacks. It ticks 3, then 2, then 1.", () => sideRun(1, (p, a, t) => applyStatus(catalog, p[t], "poison", { stacks: 3 })), 1800);
      await say("Honor: burn and poison both tick.", () => sideRun(0, (p) => endRound(catalog, p), state.current.round + 1), 1900);
      await say("FREEZE: Dummy A is encased and cannot Attack.", () => sideRun(1, (p, a, t) => applyStatus(catalog, p[t], "freeze")), 1900);
      await say("Frozen Dummy A tries to strike. Nothing happens.", () => sideRun(0, (p, a, t) => strike(catalog, p[a], p[t], { power: 3 })), 1500);
      await say("Dummy B hits the ice: it shatters for +2.", () => sideRun(1, (p, a, t) => strike(catalog, p[a], p[t], { power: 3 })), 2000);
      await say("REIMBURSE: Dummy B carries the weapon and is hurt.", () => sideRun(1, (p, a) => { p[a].keywords = ["reimburse"]; p[a].statuses = p[a].statuses.filter((s) => s.id !== "poison"); p[a].hp = Math.min(p[a].hp, 14); return []; }), 1500);
      await say("A Hit of 2 or more heals 1 HP, drawn from the victim.", () => sideRun(1, (p, a, t) => strike(catalog, p[a], p[t], { power: 3 })), 2000);
      await say("A second Hit the same round does not heal again.", () => sideRun(1, (p, a, t) => strike(catalog, p[a], p[t], { power: 3 })), 1800);
      setCaption("That is the draft. Try your own combinations.");
    } catch { /* stopped */ }
    setDemoRunning(false);
  };

  const views = fighters.map(toView) as [FighterView, FighterView];
  return <div className="arena-lab">
    <Stage views={views} fx={fx} anim={anim} still={still} caption={caption} round={round} />
    <section className="arena-controls" aria-label="Effects Lab controls">
      <fieldset className="arena-field"><legend>Who acts</legend>
        {([0, 1] as const).map((side) => <label key={side} className={actor === side ? "is-on" : ""}><input type="radio" name="arena-actor" checked={actor === side} onChange={() => setActor(side)} />{NAMES[side]}</label>)}
        <small>The other Dummy is the target.</small>
      </fieldset>
      <fieldset className="arena-field"><legend>Numbers</legend>
        <label>Attack power <input type="number" min={1} max={9} value={power} onChange={(event) => setPower(Math.max(1, Math.min(9, Number(event.target.value) || 1)))} /></label>
        <label>Effect stacks <select value={stacks} onChange={(event) => setStacks(Number(event.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </fieldset>
      <div className="arena-buttons">
        <button type="button" className="button primary" onClick={doStrike} disabled={demoRunning}>{NAMES[actor]} strikes →</button>
        {EFFECTS.map((effect) => <button type="button" key={effect.id} className={`button ghost arena-effect-button arena-effect-button--${effect.tone}`} onClick={() => doApply(effect.id)} disabled={demoRunning}><EffectIcon id={effect.icon} />Apply {effect.name}</button>)}
        <button type="button" className="button ghost" onClick={doRound} disabled={demoRunning}>End round (Honor)</button>
      </div>
      <div className="arena-buttons arena-buttons--minor">
        {([0, 1] as const).map((side) => <label key={side} className="arena-check"><input type="checkbox" checked={fighters[side].keywords.includes("reimburse")} onChange={() => toggleKeyword(side)} />{NAMES[side]} carries a Reimburse weapon</label>)}
        {([0, 1] as const).map((side) => <button type="button" key={side} className="button ghost" onClick={() => wound(side)} disabled={demoRunning}>Wound {NAMES[side]} −8</button>)}
        <button type="button" className="button ghost" onClick={demoRunning ? () => { demoAbort.current = true; } : demo}>{demoRunning ? "Stop demo" : "▶ Watch the demo"}</button>
        <button type="button" className="button ghost" onClick={reset}>Reset</button>
      </div>
    </section>
    <div className="arena-grid">
      <section className="arena-rules" aria-label="Draft effect rules">
        <h3>The draft rules</h3>
        <ul>{[...EFFECTS, ...KEYWORDS].map((entry) => <li key={entry.id} className={`arena-rule arena-rule--${entry.tone}`}><b><EffectIcon id={entry.icon} />{entry.name}</b><span>{entry.summary}</span></li>)}</ul>
        <p className="arena-note">These are drafts in <code>content/experimental/status-effects.json</code>, resolved by <code>engine/status-effects.mjs</code>. Nothing in the real game uses them yet.</p>
      </section>
      <section className="arena-log" aria-label="What happened"><h3>What happened</h3><ol>{log.map((line, index) => <li key={`${log.length - index}-${line}`}>{line}</li>)}</ol></section>
    </div>
  </div>;
}

// ---- Card Sandbox -----------------------------------------------------------------------------------------------

const DUMMY_ENGINE_FIGHTER = "DDB-CHR-CORE-007"; // Crash Test Dummy stands in for Dummy until a Dummy card exists

const passivePolicy = {
  chooseAction: (_game: unknown, legal: EngineAction[]) => legal.find((action) => action.type === "pass" || action.type === "hide") ?? legal[0],
  chooseChoice: (game: { pendingChoice: { options: { id: string }[] } | null; defaultChoice(): { optionId: string } }) => {
    const pass = game.pendingChoice?.options.find((option) => option.id === "pass");
    return pass ? { optionId: pass.id } : game.defaultChoice();
  },
};

function actionLabel(action: EngineAction, name: (id?: string) => string): string {
  const card = name(action.cardId);
  switch (action.type) {
    case "play-attack": return `Attack: ${card}${action.zone ? ` (${action.zone})` : ""}`;
    case "play-card": return `Play: ${card}`;
    case "equip": return `Equip: ${card}`;
    case "purchase": return `Buy: ${card}`;
    case "pass": return "Pass this phase";
    case "hide": return "Hide";
    case "promote": return "Promote to the next Belt";
    case "decline-combo": return "Pass on the offered Combo";
    case "learn-combo": return `Learn the offered Combo: ${card}`;
    case "recover-training-stripe": return "Spend a Training Stripe (+2 HP)";
    case "activate-equipment": return `Use Equipment: ${card}`;
    case "tag": return "Tag in your next fighter";
    case "practice": return `Practice a Defense: ${card}`;
    case "bad-habit-focus": return `Discard ${card} for Focus`;
    default: return `${action.type}${action.cardId ? `: ${card}` : ""}`;
  }
}

function CardSandbox({ still }: { still: boolean }) {
  const [version, setVersion] = useState(0);
  const [defends, setDefends] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const session = useMemo(() => {
    const created = new EngineSession({ mode: "quick-duel", seed: newSeed(), fighters: [DUMMY_ENGINE_FIGHTER, DUMMY_ENGINE_FIGHTER], humanSeats: [0], rulesVersion: "arena", table: { cardPool: null } }, defends ? undefined : (passivePolicy as never));
    created.stepBots();
    return created;
  }, [defends, version]);
  const [, force] = useState(0);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const refresh = () => force((n) => n + 1);
  const game = session.game;
  const me = game.players[0], them = game.players[1];
  const legal = session.legalFor(0);
  const pending = game.pendingChoice && game.pendingChoice.playerId === 0 ? game.pendingChoice : null;
  const cards = useMemo(() => (clashData().cards as EngineCard[]).filter((card) => card.cardType !== "Character" && card.cardType !== "Boss Profile"), []);
  const kinds = useMemo(() => ["all", ...[...new Set(cards.map((card) => card.subtype || card.cardType))].sort()], [cards]);
  const results = useMemo(() => cards.filter((card) => (kind === "all" || (card.subtype || card.cardType) === kind) && (!query || card.name.toLowerCase().includes(query.toLowerCase()))).slice(0, 40), [cards, kind, query]);
  const nameOf = (id?: string) => (id ? findInstance(game, id)?.name ?? id : "");

  const advance = () => { session.stepBots(); refresh(); };
  const act = (action: EngineAction) => { if (session.act(action)) advance(); };
  const choose = (optionId: string) => { if (session.choose(optionId)) advance(); };
  const summon = (card: EngineCard) => { me.hand.push((game as unknown as { cardInstance(card: EngineCard): EngineCard }).cardInstance(card)); refresh(); };
  const setHp = (seat: 0 | 1, hp: number) => { game.players[seat].hp = Math.max(1, Math.min(game.players[seat].maxHp, hp)); refresh(); };
  const addFocus = (amount: number) => { me.focus = Math.max(0, me.focus + amount); refresh(); };

  const view = (seat: typeof me, index: 0 | 1): FighterView => {
    const stats = seatStats(game, seat);
    return { name: NAMES[index], hp: seat.hp, maxHp: seat.maxHp, atk: stats.atk, def: stats.def, speed: stats.speed, statuses: [], reimburse: false, chips: statusLabels(seat).map((label, i) => ({ key: `${i}-${label}`, text: label })) };
  };
  const lines = fightLog(game, 0, 24).reverse().map((line) => line.replaceAll("Crash Test Dummy", "Dummy B"));

  return <div className="arena-lab arena-sandbox">
    <Stage views={[view(me, 0), view(them, 1)]} fx={[]} anim={["", ""]} still={still} caption={`${game.phase} · round ${game.round}${game.winner !== null ? " · over" : ""}`} round={game.round} />
    <section className="arena-controls" aria-label="Sandbox controls">
      <div className="arena-buttons arena-buttons--minor">
        <label className="arena-check"><input type="checkbox" checked={defends} onChange={(event) => { setDefends(event.target.checked); }} />Dummy B defends (otherwise it passes)</label>
        <button type="button" className="button ghost" onClick={() => addFocus(1)}>Focus +1 ({me.focus})</button>
        <button type="button" className="button ghost" onClick={() => addFocus(-1)}>Focus −1</button>
        <button type="button" className="button ghost" onClick={() => setHp(0, me.hp - 5)}>Wound A −5</button>
        <button type="button" className="button ghost" onClick={() => setHp(1, them.hp - 5)}>Wound B −5</button>
        <button type="button" className="button ghost" onClick={() => setHp(0, me.maxHp)}>Heal A</button>
        <button type="button" className="button ghost" onClick={() => setVersion((n) => n + 1)}>New game</button>
      </div>
    </section>
    <div className="arena-grid arena-grid--sandbox">
      <section className="arena-picker" aria-label="Card picker">
        <h3>1 · Summon a card</h3>
        <div className="arena-picker-filters">
          <input type="search" placeholder="Search card names" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search card names" />
          <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Card type">{kinds.map((entry) => <option key={entry} value={entry}>{entry === "all" ? "All types" : entry}</option>)}</select>
        </div>
        <ul>{results.map((card) => <li key={card.catalogId}><button type="button" onClick={() => summon(card)}><b>{card.name}</b><small>{card.subtype || card.cardType}{card.rulesText ? ` · ${card.rulesText.slice(0, 70)}` : ""}</small></button></li>)}</ul>
        {results.length === 40 && <p className="arena-note">Showing the first 40. Narrow the search.</p>}
      </section>
      <section className="arena-play" aria-label="Play">
        <h3>2 · Play it</h3>
        <p className="arena-phase">{game.winner !== null ? "The game is over." : `${game.phase} phase. Your hand: ${me.hand.length} card${me.hand.length === 1 ? "" : "s"}.`}</p>
        {pending
          ? <div className="arena-choice" role="group" aria-label={choiceTitle(pending)}><b>{choiceTitle(pending)}</b><p>{choicePrompt(game, pending, 0)}</p><div>{pending.options.map((option) => <button type="button" className="button ghost" key={option.id} onClick={() => choose(option.id)}>{option.label}</button>)}</div></div>
          : <div className="arena-actions">{legal.length ? legal.map((action, index) => <button type="button" key={`${action.type}-${action.cardId ?? ""}-${action.zone ?? ""}-${index}`} className={`button ${action.type === "pass" || action.type === "hide" ? "ghost" : "primary"}`} onClick={() => act(action)}>{actionLabel(action, nameOf)}</button>) : <p>Waiting on the opponent.</p>}</div>}
        <h3>3 · What the engine did</h3>
        <ol className="arena-engine-log">{lines.length ? lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>) : <li>Nothing yet. Summon an Attack, pass to the Yell phase, and play it.</li>}</ol>
      </section>
    </div>
  </div>;
}

// ---- Page -------------------------------------------------------------------------------------------------------

export default function TestArena() {
  const [tab, setTab] = useState<"lab" | "sandbox">("lab");
  const still = cardMotionDisabled();
  const tabs: [typeof tab, string, string][] = [["lab", "Effects Lab", "Draft effects: burn, poison, freeze, Reimburse"], ["sandbox", "Card Sandbox", "Any catalog card, on the real engine"]];
  return <main className={`page-shell shell arena-page${still ? " arena-still" : ""}`} aria-labelledby="arena-title">
    <header className="arena-head">
      <div><span className="eyebrow">Internal · test arena</span><h1 id="arena-title">Test Arena</h1><p>Two Dummies, no consequences. Watch effects happen, and read the numbers behind them.</p></div>
      <span className="arena-badge">Draft effects · not in the rules</span>
    </header>
    <div className="arena-tabs" role="tablist" aria-label="Arena modes">
      {tabs.map(([id, label, hint]) => <button type="button" key={id} role="tab" id={`arena-tab-${id}`} aria-selected={tab === id} aria-controls={`arena-panel-${id}`} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}><b>{label}</b><small>{hint}</small></button>)}
    </div>
    <div role="tabpanel" id={`arena-panel-${tab}`} aria-labelledby={`arena-tab-${tab}`}>{tab === "lab" ? <EffectsLab still={still} /> : <CardSandbox still={still} />}</div>
  </main>;
}

