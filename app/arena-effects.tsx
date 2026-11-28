// Effect props for the Test Arena, drawn the way the game is drawn: cut paper, ink, tape, stamps and staples.
// Every shape is flat colour with an ink outline and a hard offset shadow, and every loop moves at stop-motion
// frame rates (see test-arena.css), so effects look like they belong on a Paper-Fu table rather than in a
// fantasy game. All layers share the Dummy's 220 x 320 canvas and sit over it. Presentation only.
import { useId, type CSSProperties } from "react";
import { SACK_PATH } from "./arena-dummy";

const Layer = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <svg className={`fx-layer ${className}`} viewBox="0 0 220 320" aria-hidden="true">{children}</svg>;

// ---- Laminated (Freeze) ------------------------------------------------------------------------------------------

/** A glossy laminate pouch heat-sealed around the whole fighter, with air bubbles, a sheen that sweeps across, and a tag. */
export function LaminatePouch() {
  return <Layer className="fx-lam">
    <rect x="9" y="13" width="202" height="300" rx="26" className="lam-edge" />
    <rect x="10" y="14" width="200" height="298" rx="25" className="lam-sheet" />
    <rect x="21" y="25" width="178" height="276" rx="16" className="lam-seal" />
    <g className="lam-sheen"><path d="M26 34h40L34 296H26z" /><path d="M76 34h12L56 296H44z" /></g>
    <circle cx="40" cy="92" r="6" className="lam-bubble" /><circle cx="176" cy="132" r="9" className="lam-bubble" /><circle cx="52" cy="238" r="5" className="lam-bubble" /><circle cx="164" cy="262" r="7" className="lam-bubble" />
    <g transform="translate(110 292) rotate(-3)" className="lam-tag"><rect x="-52" y="-12" width="104" height="22" rx="2" /><text textAnchor="middle" y="4">LAMINATED</text><rect x="-60" y="-16" width="16" height="9" className="tape" transform="rotate(-24 -52 -12)" /><rect x="44" y="-16" width="16" height="9" className="tape" transform="rotate(22 52 -12)" /></g>
  </Layer>;
}

/** The pouch tearing open down a jagged seam: two halves peel away, scraps fly, a "RIP!" burst pops. */
export function LaminateRip() {
  return <div className="fx-rip" aria-hidden="true">
    <svg className="fx-layer" viewBox="0 0 220 320">
      <path className="rip-half rip-half--l" d="M10 40Q10 14 36 14L108 14L112 50L104 82L114 118L102 150L112 190L104 226L112 262L106 312L36 312Q10 312 10 286Z" />
      <path className="rip-half rip-half--r" d="M210 40Q210 14 184 14L116 14L120 50L112 82L122 118L110 150L120 190L112 226L120 262L114 312L184 312Q210 312 210 286Z" />
      {Array.from({ length: 9 }, (_, index) => <rect key={index} className="rip-scrap" x="108" y="150" width={8 + (index % 3) * 4} height={6 + (index % 2) * 5} style={{ "--dx": `${(index - 4) * 22}px`, "--dy": `${-60 + (index % 4) * 30}px`, "--rot": `${index * 53}deg` } as CSSProperties} />)}
    </svg>
    <svg className="rip-burst" viewBox="0 0 120 90"><polygon points="60,2 72,26 98,12 90,38 118,44 90,56 102,82 72,68 60,88 48,68 18,82 30,56 2,44 30,38 22,12 48,26" /><text x="60" y="55" textAnchor="middle">RIP!</text></svg>
  </div>;
}

// ---- Scorch (Burn) -----------------------------------------------------------------------------------------------

const FLAME = "M-22 0L-26-14L-18-22L-24-38L-10-30L-8-52L2-36L10-60L16-34L28-40L22-18L30-8L24 0Z";

/** Flames cut from layered construction paper, bobbing frame by frame; the sack is charred along its hem. */
export function Scorch({ stacks }: { stacks: number }) {
  const id = useId();
  const lift = (stacks - 1) * 22;
  const positions = [[50, 236, 0.9], [88, 240, 1.15], [124, 236, 1.05], [160, 240, 0.95], [108, 214, 0.8], [70, 206, 0.7], [150, 208, 0.72]].slice(0, 3 + stacks * 1);
  const scale = 0.72 + stacks * 0.2;
  return <>
    <Layer className="fx-char">
      <defs><clipPath id={`${id}-sack`}><path d={SACK_PATH} /></clipPath></defs>
      <g clipPath={`url(#${id}-sack)`}>
        <path className="char-hem" transform={`translate(0 ${-lift})`} d="M0 206L20 194L36 208L52 192L70 210L88 194L106 212L124 194L142 210L160 194L176 208L196 192L220 204V320H0Z" />
        <path className="char-spot" d="M84 130l9-6 8 7-4 9-10-1z" /><path className="char-spot" d="M132 156l8-7 9 6-3 9-11 0z" />
        {stacks > 1 && <path className="char-spot" d="M108 108l7-5 6 6-3 7-9-1z" />}
      </g>
    </Layer>
    <Layer className="fx-flames-paper">
      {positions.map(([x, y, s], index) => <g key={index} transform={`translate(${x} ${y}) scale(${(s * scale).toFixed(2)})`}><g className="flame-unit" style={{ animationDelay: `${index * 140}ms` }}>
        <path d={FLAME} className="flame-outer" />
        <path d={FLAME} className="flame-mid" transform="translate(0 -2) scale(.66 .66)" />
        <path d={FLAME} className="flame-core" transform="translate(0 -3) scale(.34 .34)" />
      </g></g>)}
      {Array.from({ length: 3 + stacks }, (_, index) => <rect key={`c${index}`} className="cinder" x={52 + ((index * 41) % 120)} y="200" width="4" height="7" style={{ animationDelay: `${(index * 330) % 1500}ms` }} />)}
      {Array.from({ length: 2 }, (_, index) => <g key={`s${index}`} transform={`translate(${96 + index * 34} 118)`}><path className="smoke-puff" d="M-12 0c-8-2-10-14-2-16 2-8 14-10 18-2 8-2 14 8 8 14 6 4 2 14-6 12-4 4-14 4-18-2-4 0-8-2-10-6z" style={{ animationDelay: `${index * 700}ms` }} /></g>)}
    </Layer>
  </>;
}

// ---- Ink Blot (Poison) -------------------------------------------------------------------------------------------

const BLOB = "M0-14C10-16 18-8 16 2C20 12 8 20-2 16C-12 20-20 8-14-2C-18-10-8-16 0-14Z";
const BLOTS: [number, number, number][] = [[84, 150, 1.5], [140, 176, 1.7], [100, 206, 1.3], [138, 122, 1.0]];

/** Spilled ink spreading across the sack: glossy blots, drips running down, and flecks. */
export function InkBlots({ stacks }: { stacks: number }) {
  return <Layer className="fx-ink">
    {BLOTS.slice(0, stacks).map(([x, y, s], index) => <g key={index} transform={`translate(${x} ${y}) scale(${s})`}><g className="blot-unit" style={{ animationDelay: `${index * 260}ms` }}>
      <rect className="ink-drip" x="-2.5" y="8" width="5" height="26" rx="2.5" style={{ animationDelay: `${index * 420}ms` }} />
      <path d={BLOB} className="ink-blot" />
      <ellipse cx="-5" cy="-6" rx="4" ry="2.4" className="ink-shine" transform="rotate(-30 -5 -6)" />
    </g></g>)}
    {Array.from({ length: stacks * 2 }, (_, index) => <circle key={`f${index}`} className="ink-fleck" cx={64 + ((index * 53) % 96)} cy={96 + ((index * 37) % 120)} r={1.6 + (index % 3)} />)}
  </Layer>;
}

/** Ink flying off on a tick: radial splatter. Mount with a fresh key to replay. */
export function InkSplash() {
  return <Layer className="fx-splash">{Array.from({ length: 10 }, (_, index) => {
    const angle = (index / 10) * Math.PI * 2;
    return <circle key={index} cx="110" cy="150" r={3 + (index % 3) * 2} className="splash-dot" style={{ "--dx": `${Math.round(Math.cos(angle) * (46 + (index % 3) * 16))}px`, "--dy": `${Math.round(Math.sin(angle) * (46 + (index % 3) * 16))}px` } as CSSProperties} />;
  })}</Layer>;
}

// ---- Reimburse (Lifesteal) ---------------------------------------------------------------------------------------

/** One paper receipt with a torn bottom edge and a tear-off stub; flutters from victim to attacker. */
export function Receipt({ delay }: { delay: number }) {
  return <svg className="fx-receipt" viewBox="0 0 16 24" style={{ animationDelay: `${delay}ms` }} aria-hidden="true">
    <path d="M1 1H15V21L13 23L11 21L9 23L7 21L5 23L3 21L1 23Z" className="receipt-paper" />
    <path d="M4 6H12M4 10H12M4 14H9" className="receipt-lines" /><circle cx="12" cy="16" r="2" className="receipt-tick" />
  </svg>;
}

// ---- Stamps (Denied, Paid) ---------------------------------------------------------------------------------------

/** A rubber-stamp impression: double border, big letters, ink that slams down. `tone` picks the ink. */
export function StampMark({ text, tone = "red", className = "" }: { text: string; tone?: "red" | "blue" | "brass"; className?: string }) {
  return <svg className={`fx-layer fx-stamp fx-stamp--${tone} ${className}`} viewBox="0 0 220 320" aria-hidden="true">
    <g transform="translate(110 150) rotate(-13)">
      <rect x="-86" y="-30" width="172" height="60" rx="6" className="stamp-border" />
      <rect x="-80" y="-24" width="160" height="48" rx="3" className="stamp-border stamp-border--inner" />
      <text textAnchor="middle" y="11" className="stamp-text">{text}</text>
    </g>
    <circle className="stamp-splat" cx="52" cy="206" r="5" /><circle className="stamp-splat" cx="170" cy="96" r="4" /><circle className="stamp-splat" cx="176" cy="212" r="3" />
  </svg>;
}

// ---- Stapled -----------------------------------------------------------------------------------------------------

/** A note pinned to the sack with heavy staples; it names the zone you are locked to. */
export function StapledNote({ zone }: { zone: string | null }) {
  return <Layer className="fx-staple">
    <g transform="translate(110 210) rotate(-5)"><g className="note-unit">
      <rect x="-44" y="-26" width="88" height="52" className="note-paper" />
      <text textAnchor="middle" y="-9" className="note-small">ZONE LOCK</text>
      <text textAnchor="middle" y="15" className="note-big">{zone ? zone.toUpperCase() : "ANY"}</text>
    </g></g>
    {[[76, 186], [144, 184], [110, 236]].map(([x, y], index) => <g key={index} transform={`translate(${x} ${y})`}><g className="staple-unit" style={{ animationDelay: `${index * 110}ms` }}>
      <path d="M-9 0V5H9V0" className="staple-shadow" /><path d="M-9 -1V3H9V-1" className="staple-bar" />
    </g></g>)}
  </Layer>;
}

// ---- Red Tape ----------------------------------------------------------------------------------------------------

const TAPES = ["M40 108C80 140 142 132 180 164", "M180 118C142 162 82 164 40 190", "M46 222C88 206 132 206 176 224"];

/** Strips of red tape winding around the body, each with a form number. */
export function RedTape({ stacks }: { stacks: number }) {
  const strips = TAPES.slice(0, stacks === 1 ? 2 : 3);
  return <Layer className="fx-tape">
    {strips.map((d, index) => <g key={index}>
      <path d={d} className="tape-edge" style={{ animationDelay: `${index * 180}ms` }} />
      <path d={d} className="tape-body" style={{ animationDelay: `${index * 180}ms` }} />
    </g>)}
    <g transform="translate(168 168) rotate(18)" className="tape-flag"><rect x="-20" y="-8" width="40" height="16" /><text textAnchor="middle" y="4">27-B</text></g>
  </Layer>;
}

// ---- Paper Cut ---------------------------------------------------------------------------------------------------

const CUTS: [number, number, number][] = [[84, 150, 24], [134, 178, -30], [98, 214, 6]];

/** Thin cuts in the sack with pale paper lips and a few red drops; a plaster covers the first cut at 2+ cuts. */
export function PaperCuts({ stacks }: { stacks: number }) {
  return <Layer className="fx-cuts">
    {CUTS.slice(0, stacks).map(([x, y, r], index) => <g key={index} transform={`translate(${x} ${y}) rotate(${r}) scale(1.7)`}><g className="cut-unit" style={{ animationDelay: `${index * 160}ms` }}>
      <path d="M-18-1Q0-8 18-1" className="cut-lip" /><path d="M-18 1Q0 8 18 1" className="cut-lip" />
      <path d="M-16 0Q0-5 16 0Q0 5-16 0Z" className="cut-slit" />
      <circle cx="-4" cy="10" r="2.2" className="cut-drop" style={{ animationDelay: `${index * 300}ms` }} /><circle cx="7" cy="12" r="1.8" className="cut-drop" style={{ animationDelay: `${index * 300 + 500}ms` }} />
    </g></g>)}
    {stacks > 1 && <g transform="translate(84 150) rotate(24) scale(1.5)" className="plaster"><rect x="-22" y="-6" width="44" height="12" rx="6" /><circle cx="-8" cy="0" r="1.2" /><circle cx="0" cy="0" r="1.2" /><circle cx="8" cy="0" r="1.2" /></g>}
  </Layer>;
}

// ---- Wet Floor ---------------------------------------------------------------------------------------------------

/** A paper puddle with ripples and a yellow caution sign standing in it. */
export function WetFloor() {
  return <Layer className="fx-wet">
    <path className="puddle" d="M20 296C20 284 52 280 84 282C126 278 188 284 202 296C196 310 150 314 108 312C62 314 26 310 20 296Z" />
    <ellipse className="ripple ripple--1" cx="110" cy="297" rx="48" ry="7" /><ellipse className="ripple ripple--2" cx="110" cy="297" rx="48" ry="7" />
    <g transform="translate(176 232)" className="wet-sign">
      <path d="M-20 62L-9 0H9L20 62Z" className="sign-board" />
      <path d="M-14 62L-6 14M14 62L6 14" className="sign-leg" />
      <circle cx="0" cy="17" r="3" className="sign-man" /><path d="M0 21V33M0 25L-7 31M0 25L7 29M0 33L-5 43M0 33L6 42" className="sign-man sign-man--line" />
      <text textAnchor="middle" y="55" className="sign-text">WET</text>
    </g>
    {[[44, 270], [168, 274], [76, 262]].map(([x, y], index) => <path key={index} d="M0 0C3 5 5 8 0 10C-5 8-3 5 0 0Z" className="splash-drop" transform={`translate(${x} ${y})`} style={{ animationDelay: `${index * 420}ms` }} />)}
  </Layer>;
}
