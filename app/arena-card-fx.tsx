// Test Arena effects that happen TO the fighter's card, not beside it. Each effect changes the card the way the
// prop would in the real world: Scorch burns the card's edge with a live ember line, Ink Blot spills over it and
// smudges its numbers, Laminate seals the whole card in plastic and freezes the fighter, Stapled punches staples
// through it, Paper Cut (Bleed) slits it and it bleeds red ink, Red Tape bundles it, Denied stamps it, Wet Floor
// floods it, Reimburse prints receipts out of it. Moments (a tick, a tear, a reopened cut, a payout) replay from
// the engine's `arena-effect` events. Presentation only: engine/arena-rules.mjs decides every rule.
import type { CSSProperties, ReactNode } from "react";
import "./arena-card-fx.css";

export type ArenaEntry = { id: string; stacks: number; turns: number | null };
export type ArenaSeatState = { effects: ArenaEntry[]; armed: { effect: string; stacks: number } | null; reimburse: boolean; lastZone: string | null };
/** Event index of the latest moment per kind for one fighter ("tick:burn", "tear", "cut", "reimburse", "applied:freeze", ...). */
export type ArenaPulses = Record<string, number>;

const pseudo = (seed: number) => { const value = Math.sin(seed * 12.9898) * 43758.5453; return value - Math.floor(value); };

// ---- Scorch: the card's bottom edge burns ----------------------------------------------------------------------

/** A burnt corner: an irregular arc from one edge to the other, eaten `w`% across and `h`% up/down the card. */
function cornerBurn(corner: "bl" | "tr", w: number, h: number, seed: number) {
  const steps = 9;
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = t * Math.PI / 2;
    const wobble = 1 + (pseudo(seed + i * 1.7) - 0.5) * 0.28;
    const dx = Math.cos(angle) * w * wobble, dy = Math.sin(angle) * h * wobble;
    points.push(corner === "bl" ? [dx, 100 - (h - dy) - (h - h)] : [100 - dx, dy]);
  }
  // bl: from (w,100) curving up to (0,100-h); tr: from (100-w,0) curving down to (100,h)
  const arc = corner === "bl"
    ? points.map((_, i) => { const t = i / steps; const a = t * Math.PI / 2; const k = 1 + (pseudo(seed + i * 1.7) - 0.5) * 0.28; return [Math.cos(a) * w * k, 100 - Math.sin(a) * h * k] as [number, number]; })
    : points.map((_, i) => { const t = i / steps; const a = t * Math.PI / 2; const k = 1 + (pseudo(seed + i * 1.7) - 0.5) * 0.28; return [100 - Math.cos(a) * w * k, Math.sin(a) * h * k] as [number, number]; });
  return arc;
}
const smooth = (points: [number, number][]) => points.reduce((path, [x, y], index) => {
  if (index === 0) return `M${x},${y}`;
  const [px, py] = points[index - 1];
  return `${path} Q${px},${py} ${(px + x) / 2},${(py + y) / 2}`;
}, "") + ` L${points[points.length - 1][0]},${points[points.length - 1][1]}`;

function BurnCorner({ corner, w, h, seed }: { corner: "bl" | "tr"; w: number; h: number; seed: number }) {
  const arc = cornerBurn(corner, w, h, seed);
  const edge = smooth(arc);
  const char = corner === "bl" ? `${edge} L-2,102 Z` : `${edge} L102,-2 Z`;
  const toastArc = cornerBurn(corner, w + 9, h + 5, seed);
  const toast = corner === "bl" ? `${smooth(toastArc)} L-2,102 Z` : `${smooth(toastArc)} L102,-2 Z`;
  return <g>
    <path d={toast} className="scorch-toast" />
    <path d={char} className="scorch-char" />
    <path d={edge} className="scorch-glow" vectorEffect="non-scaling-stroke" />
    <path d={edge} className="scorch-coal" vectorEffect="non-scaling-stroke" />
    <path d={edge} className="scorch-ember" vectorEffect="non-scaling-stroke" />
  </g>;
}

function Scorch({ stacks, flare }: { stacks: number; flare?: number }) {
  const size = [[0, 0], [34, 12], [46, 17], [60, 23]][Math.min(3, stacks)];
  const holes = [[70, 46, 2], [26, 30, 3], [80, 70, 3]].filter(([, , need]) => stacks >= need);
  return <span className={`card-fx card-fx--scorch scorch-${stacks}`}>
    <i className="scorch-edges" />
    <svg className="scorch-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <BurnCorner corner="bl" w={size[0]} h={size[1]} seed={3} />
      {stacks >= 2 && <BurnCorner corner="tr" w={size[0] * 0.55} h={size[1] * 0.5} seed={11} />}
    </svg>
    {holes.map(([x, y], index) => <i key={index} className="scorch-hole" style={{ left: `${x}%`, top: `${y}%`, "--r": `${index * 67}deg` } as CSSProperties} />)}
    {Array.from({ length: 3 + stacks * 2 }, (_, index) => <i key={`e${index}`} className="scorch-spark" style={{ left: `${2 + pseudo(index + 9) * size[0]}%`, bottom: `${size[1] * (1 - pseudo(index + 4) * 0.7)}%`, animationDelay: `${(index * 270) % 1900}ms` }} />)}
    {Array.from({ length: 1 + stacks }, (_, index) => <i key={`s${index}`} className="scorch-smoke" style={{ left: `${4 + index * (size[0] / (stacks + 1))}%`, bottom: `${size[1] * (0.7 - index * 0.15)}%`, animationDelay: `${index * 650}ms` }} />)}
    {flare !== undefined && <i key={flare} className="scorch-flare" />}
  </span>;
}

// ---- Ink Blot: ink spills over the card and smudges it -----------------------------------------------------------

const SPLAT = "M50 8C62 6 66 20 76 18C88 16 96 28 90 40C86 50 98 58 92 70C86 82 72 78 66 88C58 98 44 94 38 86C30 78 14 84 10 70C6 58 16 52 12 42C8 30 18 20 30 22C38 24 40 10 50 8Z";

function InkSpill({ stacks, splash }: { stacks: number; splash?: number }) {
  const blots = [{ x: -6, y: 14, s: 46 }, { x: 58, y: 44, s: 34 }, { x: 18, y: 66, s: 28 }, { x: 64, y: 8, s: 22 }].slice(0, stacks);
  return <span className={`card-fx card-fx--ink ink-${stacks}`}>
    {blots.map((blot, index) => <span key={index} className="ink-blot" style={{ left: `${blot.x}%`, top: `${blot.y}%`, width: `${blot.s}%`, "--d": `${index * 160}ms` } as CSSProperties}>
      <svg viewBox="0 0 100 100"><path d={SPLAT} className="ink-body" transform={`rotate(${index * 73} 50 50)`} /><circle cx="94" cy="22" r="5" className="ink-body" /><circle cx="8" cy="88" r="4" className="ink-body" /><ellipse cx="38" cy="32" rx="9" ry="4" className="ink-gloss" transform="rotate(-30 38 32)" /></svg>
      <i className="ink-drip" style={{ left: "46%", "--len": `${70 + index * 30}%`, animationDelay: `${index * 500}ms` } as CSSProperties} />
      <i className="ink-drip ink-drip--thin" style={{ left: "64%", "--len": `${40 + index * 20}%`, animationDelay: `${index * 500 + 900}ms` } as CSSProperties} />
    </span>)}
    {splash !== undefined && <span key={splash} className="ink-splash">{Array.from({ length: 9 }, (_, index) => <i key={index} style={{ "--a": `${index * 40}deg`, "--dist": `${40 + (index % 3) * 18}px` } as CSSProperties} />)}</span>}
  </span>;
}

// ---- Laminated: the whole card is sealed in plastic -------------------------------------------------------------

function Laminate({ torn }: { torn?: number }) {
  return <span className="card-fx card-fx--laminate">
    <i className="lam-plastic" />
    <i className="lam-seal" />
    <i className="lam-glare" />
    {[[14, 22, 7], [82, 38, 10], [24, 76, 6], [70, 84, 8]].map(([x, y, s], index) => <i key={index} className="lam-bubble" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s }} />)}
    <b className="lam-label">LAMINATED <small>do not bend · do not attack</small></b>
    {torn !== undefined && <LaminateTear key={torn} />}
  </span>;
}

function LaminateTear() {
  return <span className="card-fx lam-tear">
    <i className="tear-half tear-half--l" /><i className="tear-half tear-half--r" />
    {Array.from({ length: 10 }, (_, index) => <i key={index} className="tear-scrap" style={{ "--dx": `${(index - 4.5) * 26}px`, "--dy": `${-50 + (index % 4) * 34}px`, "--r": `${index * 61}deg`, top: `${20 + (index % 5) * 14}%` } as CSSProperties} />)}
  </span>;
}

// ---- Stapled: staples punched through the card -------------------------------------------------------------------

function Staple({ className, delay }: { className: string; delay: number }) {
  return <svg className={`staple ${className}`} viewBox="0 0 64 22" preserveAspectRatio="xMidYMid meet" style={{ animationDelay: `${delay}ms` }}>
    <rect x="3" y="12" width="58" height="7" rx="2" className="staple-dent" />
    <path d="M6 15V7H58V15" className="staple-wire-shadow" /><path d="M6 14V6H58V14" className="staple-wire" />
  </svg>;
}

function Stapled({ zone, strain }: { zone: string | null; strain?: number }) {
  return <span className="card-fx card-fx--stapled" key={strain}>
    <Staple className="staple--tl" delay={0} />
    <Staple className="staple--tr" delay={140} />
    <Staple className="staple--b" delay={280} />
    <span className="pin-tag"><i className="pin-string" /><b>PINNED</b><small>{zone ? `${zone.toUpperCase()} ATTACKS ONLY` : "TO YOUR NEXT ZONE"}</small></span>
  </span>;
}

// ---- Paper Cut (Bleed): the card is slit and bleeds red ink ------------------------------------------------------

const CUTS = [{ x: 20, y: 36, w: 46, a: 8 }, { x: 40, y: 56, w: 40, a: -10 }, { x: 16, y: 72, w: 34, a: 5 }];

function Bleed({ stacks, reopened }: { stacks: number; reopened?: number }) {
  const cuts = CUTS.slice(0, stacks);
  return <span className="card-fx card-fx--bleed">
    {cuts.map((cut, index) => <i key={index} className="bleed-slit" style={{ left: `${cut.x}%`, top: `${cut.y}%`, width: `${cut.w}%`, "--a": `${cut.a}deg`, animationDelay: `${index * 150}ms` } as CSSProperties}><i /></i>)}
    {cuts.flatMap((cut, index) => [0.3, 0.68].map((t, n) => <i key={`${index}-${n}`} className="bleed-drip" style={{ left: `${cut.x + cut.w * t}%`, top: `calc(${cut.y}% + ${Math.round((t - 0.5) * cut.w * 3.4 * Math.sin(cut.a * Math.PI / 180))}px + 4px)`, "--len": `${34 + n * 26 + index * 8}px`, animationDelay: `${(index * 2 + n) * 420}ms` } as CSSProperties} />))}
    <i className="bleed-pool" style={{ opacity: 0.35 + stacks * 0.2 }} />
    {reopened !== undefined && <i key={reopened} className="bleed-reopen" />}
  </span>;
}

// ---- Red Tape: the card is bundled up ----------------------------------------------------------------------------

function RedTapeBundle({ stacks }: { stacks: number }) {
  return <span className="card-fx card-fx--tape">
    <span className="tape-clip"><i className="tape-band tape-band--a" /><i className="tape-band tape-band--b" />
    {stacks > 1 && <i className="tape-band tape-band--c" />}</span>
    <b className="tape-seal">27-B</b>
    <span className="tape-slip"><b>PENDING APPROVAL</b><small>+{stacks} Focus on every purchase</small></span>
  </span>;
}

// ---- Denied: a rubber stamp across the card ----------------------------------------------------------------------

function DeniedStamp() {
  return <span className="card-fx card-fx--denied">
    <svg className="fx-filters" aria-hidden="true" width="0" height="0"><filter id="arena-stamp-ink"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="noise" /><feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G" /><feComponentTransfer><feFuncA type="discrete" tableValues="0 1 1 1 0.85 1" /></feComponentTransfer></filter></svg>
    <span className="denied-stamp"><b>DENIED</b><small>NEXT CARD VOID · FORM 404</small></span>
  </span>;
}

// ---- Wet Floor: the card is standing in a puddle -----------------------------------------------------------------

function Flood() {
  const wave = Array.from({ length: 21 }, (_, index) => `${index * 5},${(index % 2 ? 3 : 0) + 1}`).join(" L");
  return <span className="card-fx card-fx--wet">
    <i className="wet-stain" />
    <span className="wet-water"><svg viewBox="0 0 100 6" preserveAspectRatio="none"><path d={`M0,6 L${wave} L100,6 Z`} /></svg></span>
    <i className="wet-ripple" /><i className="wet-ripple wet-ripple--2" />
    <span className="wet-sign"><svg viewBox="0 0 40 64"><path d="M6 62L16 4H24L34 62Z" className="sign-board" /><circle cx="20" cy="20" r="3.5" className="sign-ink" /><path d="M20 24V36M20 28L13 34M20 28L27 31M20 36L15 46M20 36L26 45" className="sign-line" /><text x="20" y="56" textAnchor="middle" className="sign-text">WET</text></svg></span>
  </span>;
}

// ---- Reimburse: receipts print out of the card -------------------------------------------------------------------

function Ledger({ paid, amount }: { paid?: number; amount?: number }) {
  return <span className="card-fx card-fx--ledger">
    <i className="ledger-slot" />
    {paid !== undefined && <span key={paid} className="ledger-receipt"><b>REIMBURSED</b><span>+{amount ?? 1} HP</span><small>APPROVED · FILE 7</small></span>}
  </span>;
}

// ---- Putting it together -----------------------------------------------------------------------------------------

/** The class and the layer for one fighter's card. */
export function arenaCardDecor(arena: ArenaSeatState | undefined, pulses: ArenaPulses, lastHeal?: number): { className?: string; panel?: ReactNode } | null {
  if (!arena) return null;
  const has = (id: string) => arena.effects.find((entry) => entry.id === id);
  const burn = has("burn"), ink = has("poison"), lam = has("freeze"), staple = has("stapled"), tape = has("redtape"), denied = has("denied"), cut = has("papercut"), wet = has("wetfloor");
  const tornRecently = pulses.tear;
  const classes = ["has-arena-fx", burn && "fx-burning", ink && `fx-inked fx-inked-${ink.stacks}`, lam && "fx-laminated", wet && "fx-wet", staple && "fx-stapled", denied && "fx-denied"].filter(Boolean).join(" ");
  return {
    className: classes,
    panel: <span className="arena-card-fx" aria-hidden="true">
      {wet && <Flood />}
      {burn && <Scorch stacks={burn.stacks} flare={pulses["tick:burn"]} />}
      {ink && <InkSpill stacks={ink.stacks} splash={pulses["tick:poison"]} />}
      {cut && <Bleed stacks={cut.stacks} reopened={pulses.cut} />}
      {tape && <RedTapeBundle stacks={tape.stacks} />}
      {staple && <Stapled zone={arena.lastZone} strain={pulses["zone-locked"]} />}
      {lam && <Laminate />}
      {!lam && tornRecently !== undefined && <LaminateTear key={tornRecently} />}
      {denied && <DeniedStamp />}
      {(arena.reimburse || pulses.reimburse !== undefined) && <Ledger paid={pulses.reimburse} amount={lastHeal} />}
    </span>,
  };
}
