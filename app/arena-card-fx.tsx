// Status effects on a fighter's dossier card, following docs/status-effects-display.md. Three layers:
//   1. File Tabs: one index tab per effect on the card's inner edge, with stack pips and a countdown (the exact facts).
//   2. Conditions: each effect owns one region of the card and escalates in stages as it stacks (never copies).
//   3. Moments: a one-second, prop-specific scene each time an effect lands, stacks, ticks or triggers.
// Moments replay from the engine's `arena-effect` events (engine/arena-rules.mjs); nothing here decides a rule.
import type { CSSProperties, ReactNode } from "react";
import effectsJson from "../content/experimental/status-effects.json";
import "./arena-card-fx.css";

export type ArenaEntry = { id: string; stacks: number; turns: number | null };
export type ArenaSeatState = { effects: ArenaEntry[]; armed: { effect: string; stacks: number } | null; reimburse: boolean; lastZone: string | null };
/** One arena event for this fighter, with its position in the game's event log (the replay key). */
export type ArenaMoment = { index: number; kind: string; effect?: string; amount?: number; stacks?: number; reason?: string };

type ArenaEvent = { type: string; player?: number; kind?: unknown; effect?: unknown; amount?: unknown; stacks?: unknown; reason?: unknown };

/** A fighter's status events (engine `arena-effect`), newest last, each with its log position so its moment plays once. */
export function arenaMomentsFor(game: { events: ArenaEvent[] }, seatId: number): ArenaMoment[] {
  const list: ArenaMoment[] = [];
  game.events.forEach((event, index) => {
    if (event.type !== "arena-effect" || event.player !== seatId) return;
    list.push({ index, kind: String(event.kind), effect: event.effect ? String(event.effect) : undefined, amount: event.amount === undefined ? undefined : Number(event.amount), stacks: event.stacks === undefined ? undefined : Number(event.stacks), reason: event.reason ? String(event.reason) : undefined });
  });
  return list.slice(-6);
}

type Rule = { id: string; name: string; alias?: string; maxStacks: number; durationUnit?: string; buff?: boolean };
const RULES = effectsJson.effects as Rule[];
const ORDER = RULES.map((entry) => entry.id);
const rule = (id: string) => RULES.find((entry) => entry.id === id);
const pseudo = (seed: number) => { const value = Math.sin(seed * 12.9898) * 43758.5453; return value - Math.floor(value); };

// ---- Icons (one per effect, used on the File Tabs) ---------------------------------------------------------------
const ICON: Record<string, ReactNode> = {
  burn: <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 3 3 2-1-2-1-4 0-7z" fill="currentColor" />,
  poison: <path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill="currentColor" />,
  freeze: <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 7l4 4" fill="none" stroke="currentColor" strokeWidth="2.2" />,
  stapled: <path d="M4 9h16v3H4zM7 12v6M17 12v6" fill="none" stroke="currentColor" strokeWidth="2.4" />,
  redtape: <path d="M3 9l18-3v8L3 17zM10 7.5v9" fill="none" stroke="currentColor" strokeWidth="2.2" />,
  denied: <path d="M8 3h8v7l3 3v3H5v-3l3-3zM4 20h16" fill="none" stroke="currentColor" strokeWidth="2.2" />,
  papercut: <path d="M3 17L21 7M8 15v4M14 12v6" fill="none" stroke="currentColor" strokeWidth="2.4" />,
  wetfloor: <path d="M12 3l8 18H4zM12 10v5M12 18v.5" fill="none" stroke="currentColor" strokeWidth="2.2" />,
  barrier: <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" fill="currentColor" />,
  shock: <path d="M13 2L5 13h6l-1 9 8-12h-6z" fill="currentColor" />,
  haste: <path d="M3 8h9M2 12h11M4 16h8M14 6l7 6-7 6z" fill="none" stroke="currentColor" strokeWidth="2.2" />,
  brittle: <path d="M4 4h12l4 4v12H4zM16 4v4h4M6 18L14 10" fill="none" stroke="currentColor" strokeWidth="2" />,
};

// ---- Layer 1: File Tabs ------------------------------------------------------------------------------------------
function FileTabs({ effects, reimburse }: { effects: ArenaEntry[]; reimburse: boolean }) {
  const sorted = [...effects].sort((a, b) => Number(Boolean(rule(b.id)?.buff)) - Number(Boolean(rule(a.id)?.buff)) || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  return <ol className="fx-tabs">
    {sorted.map((entry) => {
      const meta = rule(entry.id);
      const unit = meta?.durationUnit === "ownTurns" ? "turn" : "rd";
      return <li key={entry.id} className={`fx-tab${meta?.buff ? " is-buff" : ""}${entry.turns === 1 ? " is-last" : ""}`} data-effect={entry.id}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{ICON[entry.id]}</svg>
        <b>{meta?.name ?? entry.id}</b>
        {(meta?.maxStacks ?? 1) > 1 && <span className="fx-pips">{Array.from({ length: meta!.maxStacks }, (_, index) => <i key={`${index}-${index < entry.stacks}`} className={index < entry.stacks ? "is-on" : ""} />)}</span>}
        {entry.turns !== null && <em>{entry.turns} {unit}</em>}
      </li>;
    })}
    {reimburse && <li className="fx-tab is-buff" data-effect="reimburse"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h14v19l-2.3-1.7L14.3 21 12 19.3 9.7 21 7.3 19.3 5 21zM8 7h8M8 11h8" fill="none" stroke="currentColor" strokeWidth="2" /></svg><b>Reimburse</b><em>weapon</em></li>}
  </ol>;
}

// ---- Layer 2: Conditions -----------------------------------------------------------------------------------------
const smooth = (points: [number, number][]) => points.reduce((path, [x, y], index) => {
  if (index === 0) return `M${x},${y}`;
  const [px, py] = points[index - 1];
  return `${path} Q${px},${py} ${(px + x) / 2},${(py + y) / 2}`;
}, "") + ` L${points[points.length - 1][0]},${points[points.length - 1][1]}`;

function cornerArc(corner: "bl" | "tr", w: number, h: number, seed: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const a = (i / 9) * Math.PI / 2; const k = 1 + (pseudo(seed + i * 1.7) - 0.5) * 0.3;
    return (corner === "bl" ? [Math.cos(a) * w * k, 100 - Math.sin(a) * h * k] : [100 - Math.cos(a) * w * k, Math.sin(a) * h * k]) as [number, number];
  });
}

function BurnCorner({ corner, w, h, seed, charred }: { corner: "bl" | "tr"; w: number; h: number; seed: number; charred: boolean }) {
  const edge = smooth(cornerArc(corner, w, h, seed));
  const close = corner === "bl" ? " L-2,102 Z" : " L102,-2 Z";
  return <g>
    <path d={smooth(cornerArc(corner, w + 10, h + 6, seed)) + close} className="scorch-toast" />
    {charred && <path d={edge + close} className="scorch-char" />}
    <path d={edge} className="scorch-glow" vectorEffect="non-scaling-stroke" />
    <path d={edge} className="scorch-ember" vectorEffect="non-scaling-stroke" />
  </g>;
}

/** Scorch, bottom-left corner. 1: smoulder (browned, thin ember). 2: corner burnt away, sparks. 3: second corner, holes, smoke. */
function Scorch({ stacks }: { stacks: number }) {
  const [w, h] = [[0, 0], [26, 9], [38, 14], [48, 18]][Math.min(3, stacks)];
  return <span className={`card-fx cond-scorch stage-${stacks}`}>
    <i className="scorch-edges" />
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <BurnCorner corner="bl" w={w} h={h} seed={3} charred={stacks >= 2} />
      {stacks >= 3 && <BurnCorner corner="tr" w={w * 0.5} h={h * 0.45} seed={11} charred />}
    </svg>
    {stacks >= 3 && [[72, 48], [30, 30]].map(([x, y], index) => <i key={index} className="scorch-hole" style={{ left: `${x}%`, top: `${y}%` }} />)}
    {stacks >= 2 && Array.from({ length: stacks * 3 }, (_, index) => <i key={index} className="scorch-spark" style={{ left: `${3 + pseudo(index + 9) * w}%`, bottom: `${h * (1 - pseudo(index + 4) * 0.6)}%`, animationDelay: `${(index * 290) % 1900}ms` }} />)}
    {stacks >= 3 && [0, 1, 2].map((index) => <i key={`s${index}`} className="scorch-smoke" style={{ left: `${4 + index * 12}%`, bottom: `${h * 0.6}%`, animationDelay: `${index * 700}ms` }} />)}
  </span>;
}

const SPLAT = "M50 8C62 6 66 20 76 18C88 16 96 28 90 40C86 50 98 58 92 70C86 82 72 78 66 88C58 98 44 94 38 86C30 78 14 84 10 70C6 58 16 52 12 42C8 30 18 20 30 22C38 24 40 10 50 8Z";
/** Ink Blot, upper-left of the face. 1: a blot. 2: it runs. 3: a second blot, stats smudge. 4: ink pools across the top. */
function Ink({ stacks }: { stacks: number }) {
  return <span className={`card-fx cond-ink stage-${stacks}`}>
    {stacks >= 4 && <i className="ink-pool" />}
    <span className="ink-blot" style={{ left: "6%", top: "16%", width: "30%" }}><svg viewBox="0 0 100 100"><path d={SPLAT} className="ink-body" /><circle cx="94" cy="22" r="5" className="ink-body" /><ellipse cx="38" cy="32" rx="9" ry="4" className="ink-gloss" transform="rotate(-30 38 32)" /></svg>
      {stacks >= 2 && <><i className="ink-drip" style={{ left: "44%", "--len": "120%" } as CSSProperties} /><i className="ink-drip ink-drip--thin" style={{ left: "66%", "--len": "70%", animationDelay: ".8s" } as CSSProperties} /></>}
    </span>
    {stacks >= 3 && <span className="ink-blot" style={{ left: "26%", top: "34%", width: "18%" }}><svg viewBox="0 0 100 100"><path d={SPLAT} className="ink-body" transform="rotate(120 50 50)" /></svg><i className="ink-drip ink-drip--thin" style={{ left: "50%", "--len": "90%", animationDelay: ".4s" } as CSSProperties} /></span>}
  </span>;
}

/** Laminated, the whole card: a sealed pouch. */
function Laminate() {
  return <span className="card-fx cond-lam">
    <i className="lam-plastic" /><i className="lam-seal" /><i className="lam-glare" />
    {[[12, 22, 7], [84, 38, 10], [22, 78, 6], [74, 86, 8]].map(([x, y, size], index) => <i key={index} className="lam-bubble" style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }} />)}
    <b className="lam-label">LAMINATED</b>
  </span>;
}

function Staple({ className }: { className: string }) {
  return <svg className={`staple ${className}`} viewBox="0 0 64 22" aria-hidden="true"><rect x="3" y="12" width="58" height="7" rx="2" className="staple-dent" /><path d="M6 15V7H58V15" className="staple-wire-shadow" /><path d="M6 14V6H58V14" className="staple-wire" /></svg>;
}
/** Stapled, top edge: two staples and a tag naming the zone. */
function Stapled({ zone }: { zone: string | null }) {
  return <span className="card-fx cond-staple">
    <Staple className="staple--l" /><Staple className="staple--r" />
    <span className="pin-tag"><b>PINNED</b><small>{zone ? `${zone.toUpperCase()} ONLY` : "NEXT ZONE"}</small></span>
  </span>;
}

/** Red Tape, lower third: one band round the card; at 2 a second band crosses it, sealed. */
function RedTape({ stacks }: { stacks: number }) {
  return <span className="card-fx cond-tape">
    <span className="tape-clip"><i className="tape-band tape-band--h" />{stacks >= 2 && <i className="tape-band tape-band--v" />}</span>
    {stacks >= 2 && <b className="tape-seal">27-B</b>}
  </span>;
}

/** Denied, the header: the stamp waiting for your next card. */
function DeniedMark() {
  return <span className="card-fx cond-denied"><b className="denied-mark">DENIED</b></span>;
}

const SLITS = [{ x: 52, y: 40, w: 34, a: 10 }, { x: 56, y: 56, w: 30, a: -8 }, { x: 50, y: 70, w: 28, a: 6 }];
/** Paper Cut (Bleed), right half of the face: one slit per cut, dripping; at 3 it pools at the bottom edge. */
function Bleed({ stacks }: { stacks: number }) {
  const cuts = SLITS.slice(0, stacks);
  return <span className="card-fx cond-bleed">
    {cuts.map((cut, index) => <i key={index} className="bleed-slit" style={{ left: `${cut.x}%`, top: `${cut.y}%`, width: `${cut.w}%`, "--a": `${cut.a}deg` } as CSSProperties}><i /></i>)}
    {cuts.map((cut, index) => <i key={`d${index}`} className="bleed-drip" style={{ left: `${cut.x + cut.w * 0.55}%`, top: `calc(${cut.y}% + 6px)`, "--len": `${26 + index * 10}px`, animationDelay: `${index * 500}ms` } as CSSProperties} />)}
    {stacks >= 3 && <i className="bleed-pool" />}
  </span>;
}

/** Wet Floor, bottom edge: water with a caution sign. */
function Flood() {
  return <span className="card-fx cond-wet">
    <i className="wet-stain" /><span className="wet-water" /><i className="wet-ripple" /><i className="wet-ripple wet-ripple--2" />
    <span className="wet-sign"><svg viewBox="0 0 40 64"><path d="M6 62L16 4H24L34 62Z" className="sign-board" /><circle cx="20" cy="20" r="3.5" className="sign-ink" /><path d="M20 24V36M20 28L13 34M20 28L27 31M20 36L15 46M20 36L26 45" className="sign-line" /><text x="20" y="56" textAnchor="middle" className="sign-text">WET</text></svg></span>
  </span>;
}

/** Barrier, side edges: folder flaps; the sheets left are on the File Tab. */
function Folder({ stacks }: { stacks: number }) {
  return <span className={`card-fx cond-folder stage-${Math.min(stacks, 5)}`}><i className="folder-flap folder-flap--l" /><i className="folder-flap folder-flap--r" /></span>;
}

/** Static Shock, the border: a crackling outline with sparks at the corners. */
function Static() {
  const path = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40; const j = (pseudo(i * 3.1) - 0.5) * 1.6;
    if (t < 0.25) return [t * 400, 0.8 + j]; if (t < 0.5) return [99.2 + j, (t - 0.25) * 400]; if (t < 0.75) return [100 - (t - 0.5) * 400, 99.2 + j]; return [0.8 + j, 100 - (t - 0.75) * 400];
  }).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return <span className="card-fx cond-static">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={path} className="static-glow" vectorEffect="non-scaling-stroke" /><polyline points={path} className="static-line" vectorEffect="non-scaling-stroke" /></svg>
    {[[2, 2], [98, 2], [2, 98], [98, 98]].map(([x, y], index) => <i key={index} className="static-spark" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${index * 330}ms` }} />)}
  </span>;
}

/** Rush Order, top-right: a RUSH sticker and speed lines streaking behind the fighter. */
function Rush() {
  return <span className="card-fx cond-rush">
    {[22, 34, 46, 58].map((top, index) => <i key={index} className="rush-line" style={{ top: `${top}%`, animationDelay: `${index * 150}ms` }} />)}
    <b className="rush-sticker">RUSH<small>ORDER</small></b>
  </span>;
}

/** Dog-Eared, the whole card: a folded corner and creases; at 2 the paper goes soft and grey. */
function Creases({ stacks }: { stacks: number }) {
  return <span className={`card-fx cond-crease stage-${stacks}`}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <path d="M8,30 L64,18 L96,46" className="crease-shadow" vectorEffect="non-scaling-stroke" /><path d="M8,30 L64,18 L96,46" className="crease-light" vectorEffect="non-scaling-stroke" />
      {stacks >= 2 && <><path d="M4,74 L46,60 L92,82" className="crease-shadow" vectorEffect="non-scaling-stroke" /><path d="M4,74 L46,60 L92,82" className="crease-light" vectorEffect="non-scaling-stroke" /></>}
    </svg>
    <i className="dog-ear" />
  </span>;
}

function Ledger() { return <span className="card-fx cond-ledger"><i className="ledger-slot" /></span>; }

// ---- Layer 3: Moments --------------------------------------------------------------------------------------------
function Num({ text, tone, at }: { text: string; tone: string; at: string }) {
  return <b className={`mom-num mom-num--${tone}`} style={{ top: at }}>{text}</b>;
}
const BOLT = <svg className="bolt" viewBox="0 0 40 100" preserveAspectRatio="none"><path d="M24 0L6 46H20L10 100L36 38H22L30 0Z" /></svg>;

function Moment({ moment }: { moment: ArenaMoment }) {
  const { kind, effect, amount } = moment;
  const land = kind === "applied" || kind === "stacked";
  if (land && effect === "burn") return <span className="card-fx mom mom-match"><i className="match-stick"><i className="match-head" /></i><i className="mom-flash mom-flash--ember" /></span>;
  if (land && effect === "poison") return <span className="card-fx mom mom-inkpot"><i className="inkpot" />{[0, 1, 2, 3, 4, 5].map((index) => <i key={index} className="ink-drop" style={{ "--dx": `${20 + index * 9}px`, "--dy": `${50 + (index % 3) * 22}px`, animationDelay: `${150 + index * 40}ms` } as CSSProperties} />)}</span>;
  if (land && effect === "freeze") return <span className="card-fx mom mom-roller"><i className="roller-trail" /><i className="roller" /></span>;
  if (land && effect === "stapled") return <span className="card-fx mom mom-stapler"><i className="stapler stapler--l" /><i className="stapler stapler--r" /></span>;
  if (land && effect === "redtape") return <span className="card-fx mom mom-tapegun"><i className="tapegun" /></span>;
  if (land && effect === "denied") return <span className="card-fx mom mom-stamp"><i className="stamp-handle" /><b className="stamp-big">DENIED</b></span>;
  if (land && effect === "papercut") return <span className="card-fx mom mom-slice"><i className="slice-blade" /></span>;
  if (land && effect === "wetfloor") return <span className="card-fx mom mom-bucket"><i className="bucket" />{[0, 1, 2, 3, 4, 5, 6].map((index) => <i key={index} className="water-drop" style={{ left: `${18 + index * 11}%`, animationDelay: `${180 + (index % 3) * 70}ms` }} />)}</span>;
  if (land && effect === "barrier") return <span className="card-fx mom mom-snap"><i className="snap-line snap-line--l" /><i className="snap-line snap-line--r" /></span>;
  if (land && effect === "shock") return <span className="card-fx mom mom-bolt">{BOLT}<i className="mom-invert" /></span>;
  if (land && effect === "haste") return <span className="card-fx mom mom-whoosh">{[0, 1, 2, 3, 4].map((index) => <i key={index} className="whoosh-line" style={{ top: `${18 + index * 14}%`, animationDelay: `${index * 50}ms` }} />)}</span>;
  if (land && effect === "brittle") return <span className="card-fx mom mom-crumple"><i className="crumple-flash" /></span>;
  if (kind === "tick" && effect === "burn") return <span className="card-fx mom mom-flare"><i className="mom-flash mom-flash--corner" /><Num text={`−${amount}`} tone="ember" at="62%" /></span>;
  if (kind === "tick" && effect === "poison") return <span className="card-fx mom mom-tick-ink"><i className="fat-drip" /><Num text={`−${amount}`} tone="violet" at="30%" /></span>;
  if (kind === "tear") return <span className="card-fx mom mom-tear"><i className="tear-half tear-half--l" /><i className="tear-half tear-half--r" />{Array.from({ length: 10 }, (_, index) => <i key={index} className="tear-scrap" style={{ "--dx": `${(index - 4.5) * 26}px`, "--dy": `${-50 + (index % 4) * 34}px`, "--r": `${index * 61}deg`, top: `${20 + (index % 5) * 14}%` } as CSSProperties} />)}<Num text={`+${amount} RIP`} tone="ice" at="20%" /></span>;
  if (kind === "denied") return <span className="card-fx mom mom-void"><b className="void-stamp">VOID</b></span>;
  if (kind === "zone-locked") return <span className="card-fx mom mom-strain"><Num text="PINNED!" tone="steel" at="14%" /></span>;
  if (kind === "cut") return <span className="card-fx mom mom-reopen"><i className="slice-blade" /><Num text={`−${amount}`} tone="blood" at="44%" /></span>;
  if (kind === "jolt") return <span className="card-fx mom mom-bolt">{BOLT}<i className="mom-invert" /><Num text={`−${amount}`} tone="volt" at="36%" /></span>;
  if (kind === "absorbed") return <span className="card-fx mom mom-sheets">{Array.from({ length: Math.max(1, amount ?? 1) }, (_, index) => <i key={index} className="sheet" style={{ "--dx": `${(index % 2 ? 1 : -1) * (40 + index * 12)}px`, animationDelay: `${index * 80}ms` } as CSSProperties} />)}<Num text={`${amount} BLOCKED`} tone="guard" at="24%" /></span>;
  if (kind === "crease") return <span className="card-fx mom mom-crinkle"><i className="crumple-flash" /><Num text={`+${amount}`} tone="paper" at="40%" /></span>;
  if (kind === "reimburse") return <span className="card-fx mom mom-receipt"><span className="receipt"><b>REIMBURSED</b><span>+{amount} HP</span><small>APPROVED</small></span></span>;
  if (kind === "rush-draw") return <span className="card-fx mom mom-rushdraw"><Num text={`+${amount} CARD`} tone="rush" at="18%" /></span>;
  if (kind === "resisted") return <span className="card-fx mom mom-resist"><Num text="RESISTED" tone="steel" at="30%" /></span>;
  return null;
}

// ---- Putting it together -----------------------------------------------------------------------------------------
/** The class and the layer for one fighter's card. `moments` are this fighter's recent arena events. */
export function arenaCardDecor(arena: ArenaSeatState | undefined, moments: ArenaMoment[], inner: "left" | "right"): { className?: string; panel?: ReactNode } | null {
  if (!arena) return null;
  const has = (id: string) => arena.effects.find((entry) => entry.id === id);
  const s = (id: string) => has(id)?.stacks ?? 0;
  const latest = moments.at(-1);
  const heavy = latest && (["tear", "jolt", "denied", "crease"].includes(latest.kind) || (["applied", "stacked"].includes(latest.kind) && ["stapled", "shock", "brittle", "denied"].includes(latest.effect ?? "")));
  const classes = ["has-arena-fx", `fx-inner-${inner}`, has("freeze") && "fx-laminated", has("poison") && `fx-inked fx-inked-${s("poison")}`, has("wetfloor") && "fx-wet", has("brittle") && `fx-creased fx-creased-${s("brittle")}`, heavy && `fx-jolt fx-jolt-${latest!.index % 2}`].filter(Boolean).join(" ");
  return {
    className: classes,
    panel: <span className="arena-card-fx" aria-hidden="true">
      {has("haste") && <Rush />}
      {has("wetfloor") && <Flood />}
      {has("brittle") && <Creases stacks={s("brittle")} />}
      {has("burn") && <Scorch stacks={s("burn")} />}
      {has("poison") && <Ink stacks={s("poison")} />}
      {has("papercut") && <Bleed stacks={s("papercut")} />}
      {has("redtape") && <RedTape stacks={s("redtape")} />}
      {has("stapled") && <Stapled zone={arena.lastZone} />}
      {has("barrier") && <Folder stacks={s("barrier")} />}
      {has("shock") && <Static />}
      {has("freeze") && <Laminate />}
      {has("denied") && <DeniedMark />}
      {arena.reimburse && <Ledger />}
      {moments.slice(-3).map((moment) => <Moment key={moment.index} moment={moment} />)}
      <FileTabs effects={arena.effects} reimburse={arena.reimburse} />
    </span>,
  };
}
