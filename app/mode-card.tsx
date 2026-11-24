// One game-mode card for Home, Quick Start and the Play setup screen.
// Presentation only: each page supplies its own action label and click behavior.

export type ModeTone = "action" | "blue" | "brass" | "violet";
export type ModeMeta = { number: string; status: string; tone: ModeTone; hook: string; live: boolean };
type ModeSummary = { id: string; title: string; players: string; fighters: string; win: string };

export const MODE_META: Record<string, ModeMeta> = {
  "tag-team": { number: "01", status: "Recommended · Live", tone: "brass", hook: "Trade places, share the paperwork, and discover that teamwork is mostly a louder kind of arguing.", live: true },
  "standard-clash": { number: "02", status: "Free-for-all · Live", tone: "blue", hook: "The classic Paper-Fu appointment: up to six fighters, three zones, and no excuse for losing the receipt.", live: true },
  "quick-duel": { number: "03", status: "Playable now", tone: "action", hook: "A brisk, complete fight for proving the deck, the stance, and the exact volume of your HIYAH.", live: true },
  "boss-blitz": { number: "04", status: "Boss room · Live", tone: "violet", hook: "One oversized problem. A team of certified nuisances. The filing cabinet has requested backup.", live: true },
};

const FALLBACK_META: ModeMeta = { number: "00", status: "Filed", tone: "blue", hook: "A certified Paper-Fu format awaiting its next stamp.", live: false };

export const modeMetaFor = (id: string): ModeMeta => MODE_META[id] ?? FALLBACK_META;

type ModeCardProps = {
  mode: ModeSummary;
  action: string;
  onSelect: () => void;
  active?: boolean;
  /** Set for cards that act as a toggle (Play setup); leave undefined for navigation cards. */
  pressed?: boolean;
};

export function ModeCard({ mode, action, onSelect, active = false, pressed }: ModeCardProps) {
  const meta = modeMetaFor(mode.id);
  return <button
    type="button"
    className={`pf-mode-card paper-stack interactive-paper tone-${meta.tone}${meta.live ? " is-live" : ""}${active ? " is-active" : ""}`}
    onClick={onSelect}
    aria-pressed={pressed}
  >
    <span className="pf-mode-card-top"><span className="pf-mode-index">{meta.number}</span><span className="pf-mode-status">{meta.status}</span></span>
    <span className="pf-mode-title">{mode.title}</span>
    <span className="pf-mode-hook">{meta.hook}</span>
    <span className="pf-mode-spec"><span>{mode.players}</span><span>{mode.fighters}</span></span>
    <span className="pf-mode-footer"><strong>{mode.win}</strong><span>{action} →</span></span>
  </button>;
}
