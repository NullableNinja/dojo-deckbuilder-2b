// Full Rules reader: chapter index with Certified Reader stamps, paragraph-level search, glossary
// hovercards, Department Notice callouts, Official Example exhibits and pocket reference cards.
// Presentation only: every word comes from app/data/rules.json through canonical-presentation.ts.
import { createContext, Fragment, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CANONICAL_RULES, COMBAT_FORMULA_TEXT, PHASES, RULE_PRIORITY } from "./canonical-presentation";
import { paperScrollBehavior, prefersReducedMotion, usePaperToast } from "./paper-toast-context";
import { navigate, serializeRoute, type SiteRoute } from "./routing";
import { ALL_GLOSSARY_ENTRIES, normalizeSearchQuery } from "./search";
import { SectionHeader } from "./section-header";
import "./rules-reader.css";

type RuleBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "table"; rows: (string | number)[][] };
type RuleSection = { id: string; title: string; content: RuleBlock[] };
type RuleChapter = { id: string; number: number; title: string; intro: RuleBlock[]; sections: RuleSection[] };

const RULE_CHAPTERS = (CANONICAL_RULES as unknown as { chapters: RuleChapter[] }).chapters.filter((chapter) => chapter.number >= 1 && chapter.number <= 16);
const INTRO_KEY = "intro";
const CERTIFIED_STORAGE_KEY = "paper-fu-rules-certified-v1";
const MAX_SEARCH_RESULTS = 60;

const chapterNumber = (chapter: RuleChapter) => String(RULE_CHAPTERS.findIndex((entry) => entry.id === chapter.id) + 1).padStart(2, "0");
const blockText = (block: RuleBlock) => block.kind === "table" ? block.rows.flat().map(String).join(" · ") : block.text;
const chapterBlocks = (chapter: RuleChapter) => [...chapter.intro, ...chapter.sections.flatMap((section) => section.content)];
const readingMinutes = (chapter: RuleChapter) => Math.max(1, Math.round(chapterBlocks(chapter).map(blockText).join(" ").split(/\s+/).length / 200));
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A single-cell rule table is a notice: "TITLE\nbody". */
const splitNotice = (cell: string) => {
  const [first, ...rest] = cell.split("\n");
  return rest.length && first === first.toLocaleUpperCase() ? { title: first, body: rest.join(" ") } : { title: "", body: cell };
};

const GOLDEN_RULE = RULE_CHAPTERS.flatMap(chapterBlocks)
  .flatMap((block) => block.kind === "table" ? block.rows.flat().map(String) : [])
  .find((text) => text.startsWith("THE GOLDEN RULE\n"))
  ?.replace("THE GOLDEN RULE\n", "") ?? "";

// ---- Glossary hovercards -------------------------------------------------------------------------

/** Defined terms so common in rules prose that underlining them would be noise. */
const HOVERCARD_SKIP = new Set(["Attack", "Defense", "Damage", "Draw", "Discard", "Round", "Hit", "Printed", "Ready", "Slot", "Tag", "Combo", "Equip", "Equipment", "Destroy"]);
const GLOSSARY_MEANINGS = new Map(ALL_GLOSSARY_ENTRIES.map((entry) => [entry.term, entry.meaning]));
const HOVERCARD_TERMS = ALL_GLOSSARY_ENTRIES.map((entry) => entry.term).filter((term) => !HOVERCARD_SKIP.has(term)).sort((a, b) => b.length - a.length);
const HOVERCARD_PATTERN = new RegExp(`\\b(${HOVERCARD_TERMS.map(escapeRegExp).join("|")})\\b`, "g");

const HovercardContext = createContext<{ openKey: string; setOpenKey: (key: string) => void }>({ openKey: "", setOpenKey: () => undefined });

function GlossaryTerm({ term, entryKey, children }: { term: string; entryKey: string; children: ReactNode }) {
  const { openKey, setOpenKey } = useContext(HovercardContext);
  const open = openKey === entryKey;
  const popoverId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const openedByHover = useRef(false);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenKey("");
      buttonRef.current?.focus({ preventScroll: true });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(`[data-hovercard="${popoverId}"]`)) setOpenKey("");
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("pointerdown", onPointerDown); };
  }, [open, popoverId, setOpenKey]);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const onPointerEnter = () => {
    if (!canHover() || open) return;
    hoverTimer.current = window.setTimeout(() => { openedByHover.current = true; setOpenKey(entryKey); }, 320);
  };
  const onPointerLeave = () => {
    window.clearTimeout(hoverTimer.current);
    if (open && openedByHover.current) setOpenKey("");
  };
  const toggle = () => {
    window.clearTimeout(hoverTimer.current);
    openedByHover.current = false;
    setOpenKey(open ? "" : entryKey);
  };
  return <span className="gloss" data-hovercard={popoverId} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
    <button ref={buttonRef} type="button" className="gloss-term" aria-expanded={open} aria-controls={open ? popoverId : undefined} onClick={toggle}>{children}</button>
    {open && <span className="gloss-card" id={popoverId} role="note" aria-label={`${term} definition`}>
      <span className="gloss-card-label">Defined term</span>
      <b>{term}</b>
      <span className="gloss-card-meaning">{GLOSSARY_MEANINGS.get(term)}</span>
      <button type="button" className="gloss-card-link" onClick={() => navigate({ page: "glossary", term })}>Open in Glossary <span aria-hidden="true">→</span></button>
    </span>}
  </span>;
}

function highlight(text: string, term: string): ReactNode {
  if (!term) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, "gi"));
  return parts.map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : part);
}

/**
 * Rules prose with the first use of each defined term per section turned into a hovercard.
 * A plain function, not a component: it must run in order while the section renders so that
 * "first use" is decided once per render (a component would render later, and twice in StrictMode).
 */
function inlineRuleText(text: string, scope: string, usedTerms: Set<string>, mark: string): ReactNode {
  const pieces = text.split(HOVERCARD_PATTERN);
  return <>{pieces.map((piece, index) => {
    const isTerm = index % 2 === 1;
    if (isTerm && !usedTerms.has(piece)) {
      usedTerms.add(piece);
      return <GlossaryTerm key={index} term={piece} entryKey={`${scope}:${piece}`}>{highlight(piece, mark)}</GlossaryTerm>;
    }
    return <Fragment key={index}>{highlight(piece, mark)}</Fragment>;
  })}</>;
}

// ---- Rule blocks ---------------------------------------------------------------------------------

function RuleNotice({ cell, mark }: { cell: string; mark: string }) {
  const { title, body } = splitNotice(cell);
  return <aside className="rule-notice">
    <span className="rule-notice-label" aria-hidden="true">Department notice</span>
    {title && <strong>{highlight(title, mark)}</strong>}
    <p>{highlight(body, mark)}</p>
  </aside>;
}

function RuleTable({ rows, mark }: { rows: (string | number)[][]; mark: string }) {
  if (!rows.length) return null;
  if (rows.length === 1 || (rows[0]?.length === 1 && rows.length <= 2)) {
    return <>{rows.flat().filter(Boolean).map((cell, index) => <RuleNotice key={index} cell={String(cell)} mark={mark} />)}</>;
  }
  const [head, ...body] = rows;
  return <div className="table-scroll"><table className="rule-table"><thead><tr>{head.map((cell, index) => <th scope="col" key={index}>{cell}</th>)}</tr></thead><tbody>{body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td data-label={String(head[cellIndex] ?? "")} key={cellIndex}>{highlight(String(cell), mark)}</td>)}</tr>)}</tbody></table></div>;
}

function RichRuleBlocks({ blocks, scope, mark }: { blocks: RuleBlock[]; scope: string; mark: string }) {
  const usedTerms = new Set<string>();
  const content: ReactNode[] = [];
  let bullets: { text: string; index: number }[] = [];
  const flush = () => {
    if (!bullets.length) return;
    content.push(<ul className="rule-bullets" key={`bullets-${bullets[0].index}`}>{bullets.map(({ text, index }) => <li key={index} data-block={`${scope}:${index}`}>{inlineRuleText(text, scope, usedTerms, mark)}</li>)}</ul>);
    bullets = [];
  };
  blocks.forEach((block, index) => {
    if (block.kind === "bullet") return void bullets.push({ text: block.text, index });
    flush();
    content.push(block.kind === "table"
      ? <div key={`table-${index}`} data-block={`${scope}:${index}`}><RuleTable rows={block.rows} mark={mark} /></div>
      : <p key={`p-${index}`} data-block={`${scope}:${index}`}>{inlineRuleText(block.text, scope, usedTerms, mark)}</p>);
  });
  flush();
  return <>{content}</>;
}

// ---- Certified Reader -----------------------------------------------------------------------------

function readCertified() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CERTIFIED_STORAGE_KEY) ?? "[]");
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && RULE_CHAPTERS.some((chapter) => chapter.id === value)) : []);
  } catch {
    return new Set<string>();
  }
}

function useCertifiedChapters() {
  const [certified, setCertified] = useState<Set<string>>(readCertified);
  const save = (next: Set<string>) => {
    try { window.localStorage.setItem(CERTIFIED_STORAGE_KEY, JSON.stringify([...next])); } catch { /* storage blocked: stamps last this visit */ }
  };
  const certify = (chapterId: string) => setCertified((current) => {
    if (current.has(chapterId)) return current;
    const next = new Set(current).add(chapterId);
    save(next);
    return next;
  });
  const reset = () => { const next = new Set<string>(); save(next); setCertified(next); };
  return { certified, certify, reset };
}

// ---- Search to the paragraph ---------------------------------------------------------------------

type SearchHit = { chapter: RuleChapter; section?: RuleSection; blockIndex: number; before: string; hit: string; after: string };

function searchRules(query: string): SearchHit[] {
  const term = normalizeSearchQuery(query);
  if (term.length < 2) return [];
  const hits: SearchHit[] = [];
  const consider = (chapter: RuleChapter, section: RuleSection | undefined, blocks: RuleBlock[]) => blocks.forEach((block, blockIndex) => {
    const text = blockText(block).replace(/\s+/g, " ");
    const at = text.toLocaleLowerCase().indexOf(term);
    if (at < 0 || hits.length >= MAX_SEARCH_RESULTS) return;
    const start = Math.max(0, at - 70);
    const end = Math.min(text.length, at + term.length + 90);
    hits.push({ chapter, section, blockIndex, before: `${start > 0 ? "…" : ""}${text.slice(start, at)}`, hit: text.slice(at, at + term.length), after: `${text.slice(at + term.length, end)}${end < text.length ? "…" : ""}` });
  });
  RULE_CHAPTERS.forEach((chapter) => {
    consider(chapter, undefined, chapter.intro);
    chapter.sections.forEach((section) => consider(chapter, section, section.content));
  });
  return hits;
}

// ---- Pocket reference ----------------------------------------------------------------------------

function PocketReference({ onOpen }: { onOpen: (chapterNumber: number, sectionId?: string) => void }) {
  const formulaLines = COMBAT_FORMULA_TEXT.split(/(?<=\.)\s+/).filter(Boolean);
  return <details className="pocket-reference" open>
    <summary><span className="eyebrow">Pocket reference</span><b>Four cards worth keeping by the mat</b><span className="pocket-reference-toggle" aria-hidden="true" /></summary>
    <div className="pocket-cards">
      <article className="pocket-card pocket-card--phases">
        <h3>The H.I.Y.A.H. round</h3>
        <ol>{PHASES.map((phase) => <li key={phase.name}><b aria-hidden="true">{phase.letter}</b><span><strong>{phase.name}</strong> {phase.when}</span></li>)}</ol>
        <button type="button" onClick={() => onOpen(6)}>Chapter 06 <span aria-hidden="true">→</span></button>
      </article>
      <article className="pocket-card pocket-card--formula">
        <h3>Final combat formula</h3>
        <ul>{formulaLines.map((line) => <li key={line}>{line}</li>)}</ul>
        <button type="button" onClick={() => onOpen(8, "final-combat-formula")}>Chapter 08 <span aria-hidden="true">→</span></button>
      </article>
      <article className="pocket-card pocket-card--priority">
        <h3>Rule priority</h3>
        <ol className="pocket-numbered">{RULE_PRIORITY.slice(0, 4).map((line) => <li key={line}>{line}</li>)}</ol>
        <button type="button" onClick={() => onOpen(15, "repeating-loops")}>Chapter 15 <span aria-hidden="true">→</span></button>
      </article>
      <article className="pocket-card pocket-card--golden">
        <h3>The golden rule</h3>
        <p>{GOLDEN_RULE}</p>
        <span className="pocket-card-stamp" aria-hidden="true">The card wins</span>
        <button type="button" onClick={() => onOpen(1)}>Chapter 01 <span aria-hidden="true">→</span></button>
      </article>
    </div>
  </details>;
}

// ---- Reader --------------------------------------------------------------------------------------

type Highlight = { term: string; scope: string; blockIndex: number };

export function RulesReader({ initialChapterId = "", initialSectionId = "", headerArt }: { initialChapterId?: string; initialSectionId?: string; headerArt: string }) {
  const validChapter = (id: string) => RULE_CHAPTERS.some((chapter) => chapter.id === id) ? id : RULE_CHAPTERS[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(() => validChapter(initialChapterId));
  const [query, setQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState(initialSectionId);
  const [mark, setMark] = useState<Highlight | null>(null);
  const [openKey, setOpenKey] = useState("");
  const [freshStamp, setFreshStamp] = useState("");
  const { certified, certify, reset } = useCertifiedChapters();
  const pushToast = usePaperToast();
  const footerRef = useRef<HTMLElement>(null);
  useEffect(() => { setSelectedId(validChapter(initialChapterId)); }, [initialChapterId]);
  const selected = RULE_CHAPTERS.find((chapter) => chapter.id === selectedId) ?? RULE_CHAPTERS[0];
  const selectedIndex = RULE_CHAPTERS.findIndex((chapter) => chapter.id === selected.id);
  const previous = RULE_CHAPTERS[selectedIndex - 1];
  const next = RULE_CHAPTERS[selectedIndex + 1];
  const hits = useMemo(() => searchRules(query), [query]);
  const hovercards = useMemo(() => ({ openKey, setOpenKey }), [openKey]);

  // Section tracking for the index.
  useEffect(() => {
    const sectionIds = selected.sections.map((section) => section.id);
    if (!sectionIds.length) { setActiveSectionId(""); return; }
    setActiveSectionId((current) => initialSectionId && sectionIds.includes(initialSectionId) ? initialSectionId : sectionIds.includes(current) ? current : sectionIds[0]);
    const sections = sectionIds.map((id) => document.getElementById(id)).filter((node): node is HTMLElement => node instanceof HTMLElement);
    if (!sections.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveSectionId(visible[0].target.id);
    }, { rootMargin: "-18% 0px -68% 0px", threshold: 0 });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [initialSectionId, selected.id]);

  // Deep links land on their section; a search hit lands on its paragraph and flashes it.
  useEffect(() => {
    if (query) return;
    const frame = window.requestAnimationFrame(() => {
      const target = mark ? document.querySelector<HTMLElement>(`[data-block="${mark.scope}:${mark.blockIndex}"]`) : initialSectionId ? document.getElementById(initialSectionId) : null;
      if (!target) return;
      target.scrollIntoView({ behavior: paperScrollBehavior(), block: mark ? "center" : "start" });
      if (mark) {
        target.classList.remove("is-flashing");
        void target.offsetWidth;
        target.classList.add("is-flashing");
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialSectionId, query, selected.id, mark]);

  // Reaching the end of a chapter after spending a fair share of its reading time certifies it,
  // so jumping straight to a footer from search does not count as reading.
  useEffect(() => {
    const footer = footerRef.current;
    if (!footer || !("IntersectionObserver" in window) || certified.has(selected.id)) return;
    const openedAt = Date.now();
    const minimumMs = Math.min(45_000, Math.max(8_000, readingMinutes(selected) * 15_000));
    let footerVisible = false;
    let timer: number | undefined;
    const tryCertify = () => {
      if (!footerVisible) return;
      const wait = minimumMs - (Date.now() - openedAt);
      if (wait > 0) { window.clearTimeout(timer); timer = window.setTimeout(tryCertify, wait); return; }
      observer.disconnect();
      certify(selected.id);
      setFreshStamp(selected.id);
      const total = new Set(certified).add(selected.id).size;
      pushToast(total === RULE_CHAPTERS.length
        ? { kind: "critical", eyebrow: "All chapters certified", title: "Licensed Rules Lawyer", message: "Every chapter read. The Department regrets to inform your table that you are now correct.", duration: 5200 }
        : { kind: "stamp", eyebrow: `Chapter ${chapterNumber(selected)} certified`, title: "Certified reader", message: `${total} of ${RULE_CHAPTERS.length} chapters on file.`, duration: 2800 });
    };
    const observer = new IntersectionObserver((entries) => {
      footerVisible = entries.some((entry) => entry.isIntersecting) && window.scrollY > 240;
      tryCertify();
    }, { threshold: .6 });
    observer.observe(footer);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [selected.id, certified]);

  const scrollToReader = () => window.requestAnimationFrame(() => document.getElementById("rule-reader")?.scrollIntoView({ behavior: paperScrollBehavior(), block: "start" }));
  const chooseChapter = (id: string) => {
    setSelectedId(id);
    setQuery("");
    setMark(null);
    setOpenKey("");
    navigate({ page: "rules", chapterId: id });
    scrollToReader();
  };
  const chooseSection = (id: string) => {
    setActiveSectionId(id);
    setMark(null);
    navigate({ page: "rules", chapterId: selected.id, sectionId: id });
    window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: paperScrollBehavior(), block: "start" }));
  };
  const chooseHit = (hit: SearchHit) => {
    setMark({ term: query.trim(), scope: hit.section?.id ?? INTRO_KEY, blockIndex: hit.blockIndex });
    setQuery("");
    setSelectedId(hit.chapter.id);
    navigate({ page: "rules", chapterId: hit.chapter.id, sectionId: hit.section?.id });
  };
  const openPocket = (number: number, sectionId?: string) => {
    const chapter = RULE_CHAPTERS.find((entry) => entry.number === number);
    if (!chapter) return;
    if (!sectionId) return chooseChapter(chapter.id);
    setSelectedId(chapter.id);
    setMark(null);
    navigate({ page: "rules", chapterId: chapter.id, sectionId });
  };
  const copySectionLink = async (section: RuleSection) => {
    const route: SiteRoute = { page: "rules", chapterId: selected.id, sectionId: section.id };
    const url = `${window.location.origin}${window.location.pathname}${serializeRoute(route)}`;
    try {
      await navigator.clipboard.writeText(url);
      pushToast({ kind: "success", eyebrow: "Permalink filed", title: "Link copied", message: section.title, duration: 2400 });
    } catch {
      pushToast({ kind: "note", eyebrow: "Copy this link", title: section.title, message: url, duration: 6000 });
    }
  };
  const markFor = (scope: string) => mark && mark.scope === scope ? mark.term : "";
  const certifiedCount = RULE_CHAPTERS.filter((chapter) => certified.has(chapter.id)).length;
  const isCertified = certified.has(selected.id);

  return <HovercardContext.Provider value={hovercards}><main className="rules-page shell page-shell">
    <SectionHeader eyebrow="Official game guide" title="Full rules." intro="Find a chapter, search a term, and get back to the table." art={headerArt} />
    <div className="rules-toolbar"><label className="search-box large"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all rules—Flow, Tempo, KO, Combo…" aria-label="Search all rules" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear rules search">×</button>}</label><span className="source-badge">{RULE_CHAPTERS.length} focused chapters · filed for table use</span></div>
    {!query && <PocketReference onOpen={openPocket} />}
    <label className="mobile-chapter-picker"><span>Jump to a chapter · {certifiedCount} of {RULE_CHAPTERS.length} certified</span><select value={selected.id} onChange={(event) => chooseChapter(event.target.value)}>{RULE_CHAPTERS.map((chapter) => <option value={chapter.id} key={chapter.id}>{chapterNumber(chapter)} · {chapter.title}{certified.has(chapter.id) ? " ✓" : ""}</option>)}</select></label>
    {query ? <section className="rule-search-results" aria-live="polite">
      <h2>{query.trim().length < 2 ? "Keep typing…" : `${hits.length}${hits.length === MAX_SEARCH_RESULTS ? "+" : ""} matching passage${hits.length === 1 ? "" : "s"}`}</h2>
      {hits.length ? hits.map((hit) => <button type="button" key={`${hit.chapter.id}-${hit.section?.id ?? INTRO_KEY}-${hit.blockIndex}`} onClick={() => chooseHit(hit)}>
        <span>Chapter {chapterNumber(hit.chapter)} · {hit.chapter.title}</span>
        <h3>{hit.section?.title ?? "Chapter overview"}</h3>
        <p>{hit.before}<mark>{hit.hit}</mark>{hit.after}</p>
      </button>) : query.trim().length >= 2 && <div className="empty-state"><strong>No rule found.</strong><p>Try a shorter term or search the Card Library for printed card text.</p></div>}
    </section> :
      <div className="rules-layout" id="rule-reader">
        <aside className="chapter-nav" aria-label="Rule chapters">
          <div className="reader-progress">
            <span>Reading record</span>
            <b>{certifiedCount}<small> / {RULE_CHAPTERS.length} certified</small></b>
            <span className="reader-progress-meter" aria-hidden="true"><i style={{ width: `${(certifiedCount / RULE_CHAPTERS.length) * 100}%` }} /></span>
            {certifiedCount > 0 && <button type="button" className="reader-progress-reset" onClick={reset}>Shred the record</button>}
          </div>
          {RULE_CHAPTERS.map((chapter) => <button type="button" aria-current={chapter.id === selected.id ? "page" : undefined} className={`${chapter.id === selected.id ? "active" : ""}${certified.has(chapter.id) ? " is-certified" : ""}`} onClick={() => chooseChapter(chapter.id)} key={chapter.id}><b>{chapterNumber(chapter)}</b><span>{chapter.title}{certified.has(chapter.id) && <span className="sr-only"> (certified)</span>}</span>{certified.has(chapter.id) && <i className="chapter-seal" aria-hidden="true">✓</i>}</button>)}
          {selected.sections.length > 0 && <nav className="chapter-subsection-nav" aria-label={`${selected.title} sections`}><span>In this chapter</span>{selected.sections.map((section) => <button type="button" aria-current={activeSectionId === section.id ? "location" : undefined} className={activeSectionId === section.id ? "active" : ""} onClick={() => chooseSection(section.id)} key={section.id}>{section.title}</button>)}</nav>}
        </aside>
        <article className="rule-article paper-stack">
          <header>
            <span>Chapter {chapterNumber(selected)} · about {readingMinutes(selected)} min read</span>
            <h1>{selected.title}</h1>
            {isCertified && <span className="chapter-certified-tab">Certified reader</span>}
          </header>
          {selected.sections.length > 0 && <details className="rule-section-picker"><summary>Sections in this chapter</summary><nav className="rule-section-nav" aria-label={`${selected.title} sections`}>{selected.sections.map((section) => <button type="button" aria-current={activeSectionId === section.id ? "location" : undefined} className={activeSectionId === section.id ? "active" : ""} onClick={() => chooseSection(section.id)} key={section.id}>{section.title}</button>)}</nav></details>}
          <RichRuleBlocks blocks={selected.intro} scope={INTRO_KEY} mark={markFor(INTRO_KEY)} />
          {selected.sections.map((section) => {
            const exhibit = /example/i.test(section.title);
            return <section id={section.id} key={section.id} className={exhibit ? "rule-exhibit" : undefined}>
              {exhibit && <span className="rule-exhibit-label" aria-hidden="true">Official example · Exhibit {chapterNumber(selected)}-A</span>}
              <div className="rule-section-head"><h2>{section.title}</h2><button type="button" className="section-permalink" onClick={() => void copySectionLink(section)} aria-label={`Copy link to ${section.title}`} title="Copy link to this section">¶</button></div>
              <RichRuleBlocks blocks={section.content} scope={section.id} mark={markFor(section.id)} />
            </section>;
          })}
          <footer className="chapter-footer" ref={footerRef}>
            <div className={`chapter-stamp${isCertified ? " is-certified" : ""}${freshStamp === selected.id && !prefersReducedMotion() ? " is-fresh" : ""}`} aria-live="polite">
              {isCertified ? <><b>Certified reader</b><small>Chapter {chapterNumber(selected)} · on file</small></> : <><b>End of chapter {chapterNumber(selected)}</b><small>Read to here to certify it</small></>}
            </div>
            <div className="chapter-footer-links">
              {previous && <button type="button" onClick={() => chooseChapter(previous.id)}><span aria-hidden="true">←</span> {previous.title}</button>}
              {next && <button type="button" className="is-next" onClick={() => chooseChapter(next.id)}>Next: {next.title} <span aria-hidden="true">→</span></button>}
            </div>
          </footer>
        </article>
      </div>}
  </main></HovercardContext.Provider>;
}
