// Pack-opening ceremony: one click tears the wrapper, the cards fan out and flip in a quick cascade.
// "Keep going" opens the next pack of the same series; "Done" closes. In the career the pack has
// already been saved (a ticket spent, the cards filed) before the ceremony starts; in preview nothing is.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { UnlockSource } from "./collection";
import { prefersReducedMotion } from "./paper-toast-context";
import type { CardEntry } from "./search";
import "./pack-ceremony.css";

type PackCeremonyProps = {
  source: UnlockSource;
  cards: CardEntry[];
  /** Changes for every pack so the tear and the cascade replay. */
  packNumber: number;
  remaining: number;
  /** "career": a real pack, already filed. "preview": a free pack, nothing saved. */
  mode: "career" | "preview";
  /** Booster Tickets left after this pack (career only). */
  tickets?: number;
  imageUrlFor: (card: CardEntry) => string;
  onKeepGoing: () => void;
  onDone: () => void;
};

const FOCUSABLE = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

export function PackCeremony({ source, cards, packNumber, remaining, mode, tickets = 0, imageUrlFor, onKeepGoing, onDone }: PackCeremonyProps) {
  const career = mode === "career";
  const canKeepGoing = remaining > 0 && (!career || tickets > 0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const reduced = prefersReducedMotion();

  // Modal behaviour: scroll lock, Escape, focus trap, and focus back where the ceremony was started.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onDoneRef.current(); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // Each new pack hands focus to the main action, so Enter, Enter, Enter keeps ripping.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>(".pack-ceremony-actions .button")?.focus({ preventScroll: true });
  }, [packNumber]);

  return createPortal(<div className="pack-ceremony-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onDone()}>
    <div ref={dialogRef} className="pack-ceremony" role="dialog" aria-modal="true" aria-labelledby="pack-ceremony-title" aria-describedby="pack-ceremony-reveal">
      <header className="pack-ceremony-head">
        <span className="eyebrow">{career ? `Pack ${packNumber} · filed to your collection` : `Preview only · pack ${packNumber}`}</span>
        <h2 id="pack-ceremony-title">{source.name}</h2>
        <p>{source.tagline}</p>
      </header>
      <div className="pack-ceremony-stage" key={packNumber}>
        {!reduced && <div className="pack-wrapper" aria-hidden="true">
          <span className="pack-wrapper-top" />
          <span className="pack-wrapper-body"><b>{source.name}</b><small>{cards.length} cards · Department issue</small></span>
        </div>}
        <ol className="pack-fan" style={{ ["--count" as string]: cards.length }}>
          {cards.map((card, index) => <li key={card.id} className="pack-card" style={{ ["--i" as string]: index, ["--offset" as string]: index - (cards.length - 1) / 2 }}>
            <span className="pack-card-inner">
              <span className="pack-card-back" aria-hidden="true"><b>Paper-Fu</b><small>Department issue</small></span>
              <img className="pack-card-front" src={imageUrlFor(card)} alt="" decoding="async" />
            </span>
            <span className="pack-card-name">{card.name}</span>
            {career && <span className="pack-card-new" aria-hidden="true">New</span>}
          </li>)}
        </ol>
      </div>
      <p className="sr-only" id="pack-ceremony-reveal" aria-live="polite">Revealed{career ? " and added to your collection" : ""}: {cards.map((card) => card.name).join(", ")}.</p>
      <footer className="pack-ceremony-actions">
        <span>{remaining ? `${remaining} still sealed in ${source.name}` : `${source.name} is complete`}{career && <> · <b className="pack-ceremony-tickets">{tickets} {tickets === 1 ? "ticket" : "tickets"} left</b></>}</span>
        <div>
          {canKeepGoing && <button type="button" className="button primary" onClick={onKeepGoing}>{career ? "Spend a ticket" : "Keep going"} <span aria-hidden="true">→</span></button>}
          <button type="button" className={`button ${canKeepGoing ? "ghost" : "primary"}`} onClick={onDone}>Done</button>
        </div>
      </footer>
    </div>
  </div>, document.body);
}
