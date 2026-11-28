// The Test Arena (#arena): a place to watch effects happen. Two Dummies (a sack of flour on a stick) face off.
//  - Effects Lab: the draft effects in content/experimental/status-effects.json (burn, poison, freeze, Reimburse)
//    resolved by engine/status-effects.mjs and animated, so the look and the numbers can be judged together.
//  - Card Sandbox: summon any catalog card into a real engine game, play it, and read what the engine did.
// Internal tool, not in the site navigation. Presentation over the engine; it decides no rule itself.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import effectsJson from "../content/experimental/status-effects.json";
import { applyStatus, brace, createCatalog, createCombatant, effectiveDefense, effectiveSpeed, endRound, strike } from "../engine/status-effects.mjs";
import { clashData, type EngineCard } from "./clash-engine.ts";
import { EngineSession, newSeed, type EngineAction } from "./engine-session.ts";
import { fightLog, findInstance, choicePrompt, choiceTitle, seatStats, statusLabels } from "./mat-view.ts";
import { cardMotionDisabled } from "./card-motion";
import { DummyFigure, type DummyStatus } from "./arena-dummy";
import { InkBlots, InkSplash, LaminatePouch, LaminateRip, PaperCuts, Receipt, RedTape, Scorch, StampMark, StapledNote, WetFloor } from "./arena-effects";
import "./test-arena.css";

type Combatant = { id: string; name: string; hp: number; maxHp: number; atk: number; def: number; speed: number; focus: number; maxFocus: number; keywords: string[]; statuses: DummyStatus[]; grace: Record<string, number>; healedThisRound: number; braced: number; lastZone: string | null };
type ArenaEvent = { type: string; [key: string]: unknown };
type Fx = { id: number; kind: "float" | "rip" | "splash" | "stamp" | "motes"; target: 0 | 1; text?: string; tone?: string; from?: 0 | 1 };
const catalog = createCatalog(effectsJson);
const EFFECTS = effectsJson.effects as { id: string; name: string; alias?: string; icon: string; tone: string; maxStacks: number; summary: string; speedPenalty?: number }[];
const KEYWORDS = effectsJson.keywords as { id: string; name: string; alias?: string; icon: string; tone: string; summary: string }[];
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
    case "strike": return `${t(event.actor)} strikes ${t(event.target)} at ${event.zone} (${event.raw} power, ${event.absorbed} absorbed by DEF).`;
    case "paid": return `${t(event.actor)} spends ${event.cost} Focus.`;
    case "no-focus": return `${t(event.actor)} needs ${event.cost} Focus and has ${event.have}.`;
    case "absorbed": return `${t(event.target)}'s DEF absorbed the whole blow.`;
    case "damage": return `${t(event.target)} takes ${event.amount} damage.`;
    case "shatter": return `The laminate on ${t(event.target)} rips open: +${event.bonus} damage, the seal is gone.`;
    case "blocked": return `${t(event.actor)} is sealed in laminate and cannot ${event.action === "attack" ? "Attack" : "Brace"}.`;
    case "braced": return `${t(event.actor)} braces: +${event.bonus} DEF against the next Hit.`;
    case "zone-locked": return `${t(event.actor)} is stapled to ${event.to}: the ${event.from} Attack lands ${event.to} instead.`;
    case "cut": return `${t(event.target)} gets a paper cut for ${event.amount} while swinging.`;
    case "denied": return `DENIED: ${t(event.actor)}'s ${event.action === "attack" ? "Attack" : "Brace"} is voided. The Focus is gone.`;
    case "applied": return `${t(event.target)} is now ${effect(event.effect)}${Number(event.stacks) > 1 ? ` ×${event.stacks}` : ""}.`;
    case "stacked": return `${effect(event.effect)} on ${t(event.target)} ${Number(event.gained) > 0 ? `builds to ×${event.stacks}` : "is refreshed"}.`;
    case "resisted": return `${t(event.target)} resists ${effect(event.effect)} (${event.reason === "grace" ? "just freed" : "already affected"}).`;
    case "thaw": return `${t(event.target)} is freed from the laminate${event.by && event.by !== "time" ? ` (${effect(event.by)} melted it)` : ""}.`;
    case "tick": return `${effect(event.effect)} costs ${t(event.target)} ${event.amount} HP at Honor.`;
    case "expire": return `${effect(event.effect)} wears off ${t(event.target)}.`;
    case "heal": return `${t(event.target)} files a receipt: Reimburse ${event.amount} HP from ${t(event.from)}'s injury.`;
    case "heal-capped": return `${t(event.target)} already filed a receipt this round.`;
    case "heal-reduced": return `Ink smudges ${t(event.target)}'s receipt: no HP recovered.`;
    case "ko": return `${t(event.target)} is knocked out.`;
    default: return String(event.type);
  }
}

const ICON_PATHS: Record<string, string> = {
  flame: "M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 3 3 2-1-2-1-4 0-7z",
  drop: "M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z",
  snowflake: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 5v8m8-8v8",
  receipt: "M5 2h14v19l-2.3-1.7L14.3 21 12 19.3 9.7 21 7.3 19.3 5 21zM8 7h8M8 11h8M8 15h5",
  staple: "M4 8h16v3H4zM7 11v7M17 11v7",
  tape: "M3 8l18-3v9L3 17zM9 7v9",
  stamp: "M8 3h8v7l3 3v3H5v-3l3-3zM4 20h16",
  cut: "M3 17L21 7M6 19l3-6M12 15l3 5",
  sign: "M12 3l8 18H4zM12 10v5M12 18v.5",
};
function EffectIcon({ id, size = 18 }: { id: string; size?: number }) {
  const filled = id === "flame" || id === "drop";
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={`arena-icon arena-icon--${id}`}>{filled ? <path d={ICON_PATHS[id]} fill="currentColor" /> : <path d={ICON_PATHS[id]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}</svg>;
}

type FighterView = { name: string; hp: number; maxHp: number; focus: number; maxFocus: number; atk: number; def: number; speed: number; chips: { key: string; icon?: string; text: string; tone?: string }[]; statuses: DummyStatus[]; reimburse: boolean; lastZone: string | null };

const themed = (entry: { name: string; alias?: string }) => entry.name;

function ArenaFighter({ view, team, flip, fx, anim, still }: { view: FighterView; team: "a" | "b"; flip?: boolean; fx: Fx[]; anim: string; still: boolean }) {
  const has = (id: string) => view.statuses.find((status) => status.id === id);
  const frozen = has("freeze"), burn = has("burn"), poison = has("poison"), staple = has("stapled"), tape = has("redtape"), denied = has("denied"), cuts = has("papercut"), wet = has("wetfloor");
  const pct = Math.max(0, Math.round((view.hp / view.maxHp) * 100));
  return <div className={`arena-fighter arena-fighter--${team}${frozen ? " is-laminated" : ""}${burn ? " is-burning" : ""}${poison ? " is-inked" : ""}${wet ? " is-wet" : ""}${anim ? ` is-${anim}` : ""}${view.hp <= 0 ? " is-ko" : ""}`} data-fighter={team}>
    <div className="arena-plate">
      <b>{view.name}</b>
      <div className="arena-hp" role="progressbar" aria-label={`${view.name} HP`} aria-valuemin={0} aria-valuemax={view.maxHp} aria-valuenow={view.hp}><i style={{ width: `${pct}%` }} /><span>{view.hp} / {view.maxHp} HP</span></div>
      <dl className="arena-stats"><div><dt>ATK</dt><dd>{view.atk}</dd></div><div><dt>DEF</dt><dd>{view.def}</dd></div><div><dt>SPD</dt><dd>{view.speed}</dd></div><div><dt>FOCUS</dt><dd>{view.focus}/{view.maxFocus}</dd></div></dl>
    </div>
    <div className="arena-body">
      {wet && <WetFloor />}
      <DummyFigure team={team} flip={flip} />
      {view.reimburse && <span className="arena-ledger" aria-hidden="true"><Receipt delay={0} /></span>}
      {poison && <InkBlots stacks={poison.stacks} />}
      {burn && <Scorch stacks={burn.stacks} />}
      {cuts && <PaperCuts stacks={cuts.stacks} />}
      {tape && <RedTape stacks={tape.stacks} />}
      {staple && <StapledNote zone={view.lastZone} />}
      {frozen && <LaminatePouch />}
      {denied && <StampMark text="DENIED" tone="red" />}
      {fx.map((entry, index) => {
        if (entry.kind === "rip") return <LaminateRip key={entry.id} />;
        if (entry.kind === "splash") return <InkSplash key={entry.id} />;
        if (entry.kind === "stamp") return <StampMark key={entry.id} text={entry.text ?? ""} tone={(entry.tone as "red" | "blue" | "brass") ?? "blue"} className="fx-stamp--once" />;
        return <span key={entry.id} className={`arena-float arena-float--${entry.tone ?? "plain"}`} style={{ top: `${6 + (index % 4) * 14}%` }} data-still={still || undefined}>{entry.text}</span>;
      })}
    </div>
    <ul className="arena-chips" aria-label={`${view.name} status`}>
      {view.chips.length ? view.chips.map((chip) => <li key={chip.key} className={`arena-chip arena-chip--${chip.tone ?? "plain"}`}>{chip.icon && <EffectIcon id={chip.icon} size={14} />}{chip.text}</li>) : <li className="arena-chip arena-chip--empty">No status</li>}
    </ul>
  </div>;
}

/** The two fighters, the middle caption, and the receipts that fly for Reimburse. */
function Stage({ views, fx, anim, still, caption, round }: { views: [FighterView, FighterView]; fx: Fx[]; anim: [string, string]; still: boolean; caption: string; round: number }) {
  const motes = fx.filter((entry) => entry.kind === "motes");
  return <div className="arena-stage">
    <ArenaFighter view={views[0]} team="a" fx={fx.filter((entry) => entry.kind !== "motes" && entry.target === 0)} anim={anim[0]} still={still} />
    <div className="arena-center" aria-live="polite"><span>Round</span><b>{round}</b><p>{caption}</p></div>
    <ArenaFighter view={views[1]} team="b" flip fx={fx.filter((entry) => entry.kind !== "motes" && entry.target === 1)} anim={anim[1]} still={still} />
    {!still && motes.map((mote) => <span key={mote.id} className={`arena-motes arena-motes--from-${mote.from}`} aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <Receipt key={index} delay={index * 120} />)}</span>)}
  </div>;
}

const toView = (combatant: Combatant): FighterView => ({
  name: combatant.name, hp: combatant.hp, maxHp: combatant.maxHp, focus: combatant.focus, maxFocus: combatant.maxFocus,
  atk: combatant.atk, def: effectiveDefense(catalog, combatant), speed: effectiveSpeed(catalog, combatant),
  statuses: combatant.statuses, lastZone: combatant.lastZone,
  reimburse: combatant.keywords.includes("reimburse"),
  chips: [
    ...combatant.statuses.map((status) => {
      const effect = EFFECTS.find((entry) => entry.id === status.id)!;
      return { key: status.id, icon: effect.icon, tone: effect.tone, text: `${themed(effect)}${effect.maxStacks > 1 ? ` ×${status.stacks}` : ""}${status.turns !== null ? ` · ${status.turns} rd` : ""}` };
    }),
    ...(combatant.braced ? [{ key: "braced", text: `Braced +${combatant.braced}`, tone: "plain" }] : []),
    ...combatant.keywords.map((id) => ({ key: `k-${id}`, icon: "receipt", tone: "rose", text: `${KEYWORDS.find((keyword) => keyword.id === id)?.name ?? id} weapon` })),
    ...(Object.entries(combatant.grace).filter(([, rounds]) => rounds > 0).map(([id]) => ({ key: `g-${id}`, text: `${EFFECTS.find((entry) => entry.id === id)?.name ?? id}-proof · 1 rd`, tone: "plain" }))),
  ],
});

// ---- Effects Lab ------------------------------------------------------------------------------------------------

type Step = { say: string; run: (pair: [Combatant, Combatant]) => ArenaEvent[]; pause?: number; round?: boolean };

function EffectsLab({ still }: { still: boolean }) {
  const [fighters, setFighters] = useState<[Combatant, Combatant]>(freshFighters);
  const [round, setRound] = useState(1);
  const [log, setLog] = useState<string[]>(["The arena is ready. Pick an effect and aim it."]);
  const [actor, setActor] = useState<0 | 1>(0);
  const [power, setPower] = useState(3);
  const [zone, setZone] = useState("Mid");
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
    const shown = events.filter((event) => event.type !== "paid");
    if (!shown.length) return;
    setLog((current) => [...shown.map(describe), ...current].slice(0, 60));
    const additions: Fx[] = [];
    const flash = (side: 0 | 1, kind: string, ms = 520) => { setAnim((current) => (side === 0 ? [kind, current[1]] : [current[0], kind])); later(ms, () => setAnim((current) => (side === 0 ? ["", current[1]] : [current[0], ""]))); };
    for (const event of shown) {
      const side = indexOf(event.target ?? event.actor);
      const float = (text: string, tone: string, on: 0 | 1 = side) => additions.push({ id: ++fxSerial, kind: "float", target: on, text, tone });
      const tone = (id: unknown) => String(EFFECTS.find((entry) => entry.id === id)?.tone ?? "plain");
      if (event.type === "strike") flash(indexOf(event.actor), "striking", 480);
      if (event.type === "damage") { float(`−${event.amount}`, "hit"); flash(side, "hit"); }
      if (event.type === "absorbed") float("BLOCKED", "plain");
      if (event.type === "shatter") { additions.push({ id: ++fxSerial, kind: "rip", target: side }); float(`RIPPED +${event.bonus}`, "ice"); }
      if (event.type === "blocked") float("SEALED!", "ice", indexOf(event.actor));
      if (event.type === "no-focus") float("NO FOCUS", "plain", indexOf(event.actor));
      if (event.type === "braced") float(`BRACE +${event.bonus}`, "plain", indexOf(event.actor));
      if (event.type === "zone-locked") float(`STAPLED: ${String(event.to).toUpperCase()}`, "steel", indexOf(event.actor));
      if (event.type === "cut") { float(`−${event.amount} CUT`, "rose"); flash(side, "hit", 360); }
      if (event.type === "denied") additions.push({ id: ++fxSerial, kind: "stamp", target: indexOf(event.actor), text: "VOID", tone: "red" });
      if (event.type === "applied" || event.type === "stacked") float(String(EFFECTS.find((entry) => entry.id === event.effect)?.name ?? event.effect).toUpperCase(), tone(event.effect));
      if (event.type === "resisted") float("RESISTED", "plain");
      if (event.type === "thaw") float("FREED", "ice");
      if (event.type === "tick") { float(`−${event.amount}`, tone(event.effect)); flash(side, "hit", 360); if (event.effect === "poison") additions.push({ id: ++fxSerial, kind: "splash", target: side }); }
      if (event.type === "heal") { float(`+${event.amount}`, "rose"); additions.push({ id: ++fxSerial, kind: "stamp", target: side, text: "PAID", tone: "blue" }); additions.push({ id: ++fxSerial, kind: "motes", target: side, from: indexOf(event.from) }); }
      if (event.type === "heal-capped") float("FILED", "plain");
      if (event.type === "heal-reduced") float("SMUDGED", "violet");
      if (event.type === "ko") float("K.O.", "hit");
    }
    if (additions.length) {
      setFx((current) => [...current, ...additions]);
      later(1800, () => setFx((current) => current.filter((entry) => !additions.some((added) => added.id === entry.id))));
    }
  };

  const doStrike = () => run((pair) => strike(catalog, pair[actor], pair[target], { power, zone }));
  const doBrace = () => run((pair) => brace(catalog, pair[actor]));
  const doApply = (effectId: string) => run((pair) => applyStatus(catalog, pair[target], effectId, { stacks, source: pair[actor].id }));
  const doRound = () => run((pair) => endRound(catalog, pair), { round: state.current.round + 1 });
  const toggleKeyword = (side: 0 | 1) => run((pair) => { const list = pair[side].keywords; pair[side].keywords = list.includes("reimburse") ? [] : ["reimburse"]; return []; });
  const wound = (side: 0 | 1, amount = 8) => run((pair) => { pair[side].hp = Math.max(1, pair[side].hp - amount); return []; });
  const reset = () => { demoAbort.current = true; setDemoRunning(false); const pair = freshFighters(); state.current = { fighters: pair, round: 1 }; setFighters(pair); setRound(1); setFx([]); setAnim(["", ""]); setLog(["Reset. Two fresh Dummies."]); setCaption("Dummy A acts. Dummy B is the target."); };

  const DEMO: Step[] = [
    { say: "A plain Attack: Focus 1, ATK 3 + power 3, minus Dummy B's DEF 2.", run: (p) => strike(catalog, p[0], p[1], { power: 3, zone: "High" }) },
    { say: "SCORCH (Burn): two stacks of cut-paper flame. It ignores DEF.", run: (p) => applyStatus(catalog, p[1], "burn", { stacks: 2 }), pause: 1900 },
    { say: "Honor: the paper burns for 2. Everyone regains Focus.", run: (p) => endRound(catalog, p), round: true, pause: 1800 },
    { say: "INK BLOT (Poison): three stacks. It ticks 3, then 2, then 1.", run: (p) => applyStatus(catalog, p[1], "poison", { stacks: 3 }), pause: 1900 },
    { say: "Honor: scorch and ink both cost HP.", run: (p) => endRound(catalog, p), round: true, pause: 2000 },
    { say: "LAMINATED (Freeze): Dummy A is sealed in a pouch and cannot Attack.", run: (p) => applyStatus(catalog, p[0], "freeze"), pause: 1900 },
    { say: "Sealed Dummy A tries to swing. Nothing happens.", run: (p) => strike(catalog, p[0], p[1], { power: 3 }), pause: 1500 },
    { say: "Dummy B hits the pouch: it rips open for +2.", run: (p) => strike(catalog, p[1], p[0], { power: 3 }), pause: 2200 },
    { say: "STAPLED: Dummy A is pinned to the High zone it last used.", run: (p) => { strike(catalog, p[0], p[1], { power: 2, zone: "High" }); return applyStatus(catalog, p[0], "stapled"); }, pause: 2000 },
    { say: "Dummy A tries Low. The staple drags the Attack back to High.", run: (p) => strike(catalog, p[0], p[1], { power: 2, zone: "Low" }), pause: 2100 },
    { say: "RED TAPE: every card costs 1 more Focus.", run: (p) => applyStatus(catalog, p[0], "redtape", { stacks: 1 }), pause: 1900 },
    { say: "DENIED: the next card Dummy B plays is voided.", run: (p) => applyStatus(catalog, p[1], "denied"), pause: 1700 },
    { say: "Dummy B swings. The stamp lands. Focus spent, nothing happens.", run: (p) => strike(catalog, p[1], p[0], { power: 3 }), pause: 2100 },
    { say: "PAPER CUT: every swing now stings the swinger.", run: (p) => applyStatus(catalog, p[0], "papercut", { stacks: 2 }), pause: 1900 },
    { say: "Dummy A swings and bleeds a little.", run: (p) => strike(catalog, p[0], p[1], { power: 3, zone: "High" }), pause: 2000 },
    { say: "WET FLOOR: slippery. Speed and DEF both drop.", run: (p) => applyStatus(catalog, p[1], "wetfloor"), pause: 2000 },
    { say: "REIMBURSE (Lifesteal): Dummy A files a receipt on a good Hit.", run: (p) => { p[0].keywords = ["reimburse"]; p[0].statuses = []; p[0].hp = Math.min(p[0].hp, 14); p[0].focus = 3; return []; }, pause: 1200 },
    { say: "A Hit of 2 or more pays back 1 HP.", run: (p) => strike(catalog, p[0], p[1], { power: 3 }), pause: 2200 },
    { say: "That is the draft: nine effects. Try your own combinations.", run: () => [], pause: 600 },
  ];

  const demo = async () => {
    reset();
    demoAbort.current = false; setDemoRunning(true);
    const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, still ? Math.min(ms, 300) : ms));
    try {
      await wait(500);
      for (const step of DEMO) {
        if (demoAbort.current) throw new Error("stop");
        setCaption(step.say);
        run(step.run, step.round ? { round: state.current.round + 1 } : undefined);
        await wait(step.pause ?? 1500);
      }
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
      <fieldset className="arena-field"><legend>Attack</legend>
        <label>Power <input type="number" min={1} max={9} value={power} onChange={(event) => setPower(Math.max(1, Math.min(9, Number(event.target.value) || 1)))} /></label>
        <label>Zone <select value={zone} onChange={(event) => setZone(event.target.value)}>{["High", "Mid", "Low"].map((entry) => <option key={entry}>{entry}</option>)}</select></label>
        <button type="button" className="button primary" onClick={doStrike} disabled={demoRunning}>{NAMES[actor]} strikes →</button>
        <button type="button" className="button ghost" onClick={doBrace} disabled={demoRunning}>{NAMES[actor]} braces</button>
        <button type="button" className="button ghost" onClick={doRound} disabled={demoRunning}>End round (Honor)</button>
      </fieldset>
      <fieldset className="arena-field arena-field--effects"><legend>Put an effect on {NAMES[target]}</legend>
        <label>Stacks <select value={stacks} onChange={(event) => setStacks(Number(event.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <div className="arena-effect-grid">{EFFECTS.map((effect) => <button type="button" key={effect.id} className={`button ghost arena-effect-button arena-effect-button--${effect.tone}`} onClick={() => doApply(effect.id)} disabled={demoRunning}><EffectIcon id={effect.icon} /><span><b>{effect.name}</b>{effect.alias && <small>{effect.alias}</small>}</span></button>)}</div>
      </fieldset>
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
        <ul>{[...EFFECTS, ...KEYWORDS].map((entry) => <li key={entry.id} className={`arena-rule arena-rule--${entry.tone}`}><b><EffectIcon id={entry.icon} />{entry.name}{entry.alias && <em>{entry.alias}</em>}</b><span>{entry.summary}</span></li>)}</ul>
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
    return { name: NAMES[index], hp: seat.hp, maxHp: seat.maxHp, atk: stats.atk, def: stats.def, speed: stats.speed, focus: seat.focus, maxFocus: Math.max(seat.focus, 3), lastZone: null, statuses: [], reimburse: false, chips: statusLabels(seat).map((label, i) => ({ key: `${i}-${label}`, text: label })) };
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

