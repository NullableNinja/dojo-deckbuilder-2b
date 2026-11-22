// Scene reveal (presentation only): when the Location changes, the new card takes the stage, the
// player dismisses it, and it flies down into the Current Scene slot on the mat. Game state is not
// touched; the parent decides when to show this and removes it via onDone.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SceneRevealCard = { name: string; rulesText?: string | null; flavorText?: string | null; catalogId: string };

type SceneRevealProps = {
  card: SceneRevealCard;
  art?: string;
  previousName?: string | null;
  round: number;
  opening: boolean;
  /** CSS selector for the on-mat element the card shrinks into. */
  targetSelector: string;
  reducedMotion: boolean;
  onDone: () => void;
};

export function SceneReveal({ card, art, previousName, round, opening, targetSelector, reducedMotion, onDone }: SceneRevealProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);

  const land = (target: HTMLElement | null) => {
    if (target) {
      target.dataset.sceneLanded = "true";
      window.setTimeout(() => { delete target.dataset.sceneLanded; }, 1600);
    }
    const restore = restoreRef.current;
    onDoneRef.current();
    const focusTarget = restore?.isConnected ? restore : target;
    window.requestAnimationFrame(() => focusTarget?.focus({ preventScroll: true }));
  };

  const dismiss = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    const target = document.querySelector<HTMLElement>(targetSelector);
    const cardElement = cardRef.current;
    if (!target || !cardElement || reducedMotion || typeof cardElement.animate !== "function") { land(target); return; }
    const before = target.getBoundingClientRect();
    if (before.bottom < 0 || before.top > window.innerHeight) target.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    const from = cardElement.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(.08, Math.min(to.width / from.width, to.height / from.height, 1));
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 460, easing: "ease-in", fill: "forwards" });
    dialogRef.current?.querySelectorAll<HTMLElement>(".scene-reveal-copy").forEach((element) => element.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(12px)" }], { duration: 200, fill: "forwards" }));
    const flight = cardElement.animate(
      [
        { transform: "rotate(-3deg)", opacity: 1 },
        { transform: `translate(${dx * .55}px, ${dy * .45 - 40}px) scale(${(1 + scale) / 2}) rotate(-9deg)`, opacity: 1, offset: .45 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)`, opacity: .2 },
      ],
      { duration: 620, easing: "cubic-bezier(.45, 0, .25, 1)", fill: "forwards" },
    );
    flight.finished.then(() => land(target), () => land(target));
  };

  useEffect(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); dismiss(); return; }
      if (event.key === "Tab") {
        // Only one control: keep focus on it.
        event.preventDefault();
        buttonRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // dismiss reads refs only; binding once is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const titleId = `scene-reveal-title-${card.catalogId}`;
  const ruleId = `scene-reveal-rule-${card.catalogId}`;
  return createPortal(<div className={`scene-reveal${leaving ? " is-leaving" : ""}${reducedMotion ? " is-still" : ""}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={ruleId}>
    <div className="scene-reveal-backdrop" ref={backdropRef} aria-hidden="true" onMouseDown={dismiss}><span className="scene-reveal-burst" /></div>
    <div className="scene-reveal-stage">
      <div className="scene-reveal-card" ref={cardRef}>
        {art ? <img src={art} alt={`${card.name} Location card`} decoding="async" /> : <div className="scene-reveal-card-fallback"><b>{card.name}</b><small>{card.rulesText}</small></div>}
      </div>
      <div className="scene-reveal-copy">
        <span className="scene-reveal-stamp">{opening ? "Opening scene" : "Scene change"} · Round {round}</span>
        <h2 id={titleId}><small>Now entering</small>{card.name}</h2>
        {previousName && !opening && <p className="scene-reveal-previous">Leaving <s>{previousName}</s></p>}
        <div className="scene-reveal-rule" id={ruleId}><span>Scene rule · applies to both fighters</span><p>{card.rulesText || "The Department finds no reason to intervene."}</p></div>
        {card.flavorText && <p className="scene-reveal-flavor">{card.flavorText}</p>}
        <button type="button" ref={buttonRef} className="scene-reveal-dismiss" onClick={dismiss} disabled={leaving}>Got it. Back to the mat <span aria-hidden="true">→</span></button>
        <small className="scene-reveal-hint" aria-hidden="true">The card files itself under Current Scene. Tap it there any time to reread.</small>
      </div>
    </div>
  </div>, document.body);
}
