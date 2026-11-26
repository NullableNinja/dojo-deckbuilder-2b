// Backstory evidence board: each chapter of the origin story is an exhibit pinned to cork and tied
// together with red string. Exhibits are pinned up one by one as they scroll into view.
import { useEffect, useRef, useState } from "react";
import "./evidence-board.css";

type Exhibit = { title: string; text?: string; tag: string };
const EXHIBIT_LETTERS = "ABCDEFGH";

export function EvidenceBoard({ exhibits }: { exhibits: Exhibit[] }) {
  const boardRef = useRef<HTMLElement>(null);
  const [pinned, setPinned] = useState(() => typeof window === "undefined" || !("IntersectionObserver" in window));
  useEffect(() => {
    const board = boardRef.current;
    if (!board || pinned) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setPinned(true);
      observer.disconnect();
    }, { threshold: .2 });
    observer.observe(board);
    return () => observer.disconnect();
  }, [pinned]);
  return <section ref={boardRef} className={`story-panels evidence-board${pinned ? " is-pinned" : ""}`} aria-label="Evidence board">
    <svg className="evidence-string" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true"><path d="M50 8 Q100 34 150 8 Q200 34 250 8" pathLength={1} /></svg>
    {exhibits.map((exhibit, index) => <article className="paper-stack evidence-exhibit" key={exhibit.title} style={{ ["--pin-order" as string]: index }}>
      <span className="evidence-label">Exhibit {EXHIBIT_LETTERS[index]}</span>
      <h2>{exhibit.title}</h2>
      <p>{exhibit.text}</p>
      <i className="evidence-tag">{exhibit.tag}</i>
    </article>)}
  </section>;
}
