// Glossary: an A–Z card index with a Term of the Day, "seen in N passages" counts, related terms and
// links back into the exact rule sections that use each term. Presentation only.
import { useEffect, useMemo, useState } from "react";
import { dayNumber, pickBySeed } from "./daily-card";
import { DetailModal } from "./detail-modal";
import { paperScrollBehavior } from "./paper-toast-context";
import { blockText, chapterNumber, escapeRegExp, RULE_CHAPTERS, type RuleChapter, type RuleSection } from "./rule-chapters";
import { navigate, replaceRoute } from "./routing";
import { ALL_GLOSSARY_ENTRIES, normalizeSearchQuery } from "./search";
import { SectionHeader } from "./section-header";
import "./glossary-page.css";

type GlossaryEntry = { term: string; meaning: string };
type Passage = { chapter: RuleChapter; section?: RuleSection };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const letterOf = (term: string) => term.charAt(0).toLocaleUpperCase();
const termPattern = (term: string) => new RegExp(`\\b${escapeRegExp(term)}\\b`);

/** Every rules passage (chapter intro or section) that uses each defined term, in reading order. */
const PASSAGES_BY_TERM = new Map<string, Passage[]>(ALL_GLOSSARY_ENTRIES.map((entry) => {
  const pattern = termPattern(entry.term);
  const uses = (blocks: RuleChapter["intro"]) => blocks.some((block) => pattern.test(blockText(block)));
  const passages = RULE_CHAPTERS.flatMap((chapter) => [
    ...(uses(chapter.intro) ? [{ chapter }] : []),
    ...chapter.sections.filter((section) => uses(section.content)).map((section) => ({ chapter, section })),
  ]);
  return [entry.term, passages];
}));

/** Other defined terms named inside a definition. */
const relatedTerms = (entry: GlossaryEntry) => ALL_GLOSSARY_ENTRIES
  .filter((candidate) => candidate.term !== entry.term && termPattern(candidate.term).test(entry.meaning))
  .slice(0, 6);

const passagesFor = (term: string) => PASSAGES_BY_TERM.get(term) ?? [];
const passageLabel = (count: number) => count ? `Used in ${count} rule passage${count === 1 ? "" : "s"}` : "Defined here only";
const findEntry = (term: string) => term ? ALL_GLOSSARY_ENTRIES.find((entry) => normalizeSearchQuery(entry.term) === normalizeSearchQuery(term)) ?? null : null;

function TermOfTheDay({ entry }: { entry: GlossaryEntry }) {
  return <section className="term-of-day" aria-labelledby="term-of-day-title">
    <span className="term-of-day-stamp" aria-hidden="true">Term of<br />the day</span>
    <span className="eyebrow">Today's vocabulary drill</span>
    <h2 id="term-of-day-title">{entry.term}</h2>
    <p>{entry.meaning}</p>
    <div className="term-of-day-foot">
      <span>{passageLabel(passagesFor(entry.term).length)}</span>
      <button type="button" className="button primary" onClick={() => navigate({ page: "glossary", term: entry.term })}>Open the term <span aria-hidden="true">→</span></button>
    </div>
  </section>;
}

function TermDetail({ entry, onClose }: { entry: GlossaryEntry; onClose: () => void }) {
  const passages = passagesFor(entry.term);
  const related = relatedTerms(entry);
  const openPassage = ({ chapter, section }: Passage) => navigate({ page: "rules", chapterId: chapter.id, ...(section ? { sectionId: section.id } : {}) });
  return <DetailModal eyebrow="Defined term" title={entry.term} onClose={onClose}>
    <aside className="modal-rule"><span>Definition</span><p>{entry.meaning}</p></aside>
    {related.length > 0 && <div className="term-related"><span>See also</span><div>{related.map((item) => <button type="button" key={item.term} onClick={() => replaceRoute({ page: "glossary", term: item.term })}>{item.term}</button>)}</div></div>}
    <div className="term-passages">
      <span>{passageLabel(passages.length)}</span>
      {passages.length > 0 && <ul>{passages.slice(0, 6).map((passage) => <li key={`${passage.chapter.id}-${passage.section?.id ?? "intro"}`}><button type="button" onClick={() => openPassage(passage)}><small>Chapter {chapterNumber(passage.chapter)}</small><b>{passage.section?.title ?? passage.chapter.title}</b><i aria-hidden="true">→</i></button></li>)}</ul>}
      {passages.length > 6 && <p>And {passages.length - 6} more. Search the Full Rules for every mention.</p>}
    </div>
    <div className="modal-design-note"><span>At the table</span><p>Use this defined meaning unless a more specific scenario rule or card instruction says otherwise.</p></div>
  </DetailModal>;
}

export function GlossaryPage({ initialQuery, headerArt }: { initialQuery: string; headerArt: string }) {
  const [query, setQuery] = useState("");
  const selected = findEntry(initialQuery);
  useEffect(() => { if (initialQuery && !findEntry(initialQuery)) setQuery(initialQuery); }, [initialQuery]);
  const daily = useMemo(() => pickBySeed(ALL_GLOSSARY_ENTRIES, dayNumber()), []);
  const filtered = useMemo(() => {
    const term = query.toLocaleLowerCase();
    return ALL_GLOSSARY_ENTRIES.filter((entry) => `${entry.term} ${entry.meaning}`.toLocaleLowerCase().includes(term));
  }, [query]);
  const groups = useMemo(() => LETTERS.map((letter) => ({ letter, entries: filtered.filter((entry) => letterOf(entry.term) === letter) })).filter((group) => group.entries.length), [filtered]);
  const jumpTo = (letter: string) => document.getElementById(`glossary-letter-${letter}`)?.scrollIntoView({ behavior: paperScrollBehavior(), block: "start" });

  return <main className="page-shell shell glossary-page">
    <SectionHeader eyebrow="Glossary" title="Speak fluent Paper-Fu" intro="Every defined rules term, separated from the rulebook for fast table lookup. Tap any card for the definition and the rules that use it." art={headerArt} />
    <TermOfTheDay entry={daily} />
    <div className="glossary-toolbar"><label className="search-box large"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Flow, Focus, Tempo, Reaction…" aria-label="Search glossary" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear glossary search">×</button>}</label><span>{filtered.length} of {ALL_GLOSSARY_ENTRIES.length} terms</span></div>
    <nav className="glossary-rail" aria-label="Jump to letter">{LETTERS.map((letter) => {
      const present = groups.some((group) => group.letter === letter);
      return <button type="button" key={letter} disabled={!present} onClick={() => jumpTo(letter)} aria-label={present ? `Jump to ${letter}` : `No terms under ${letter}`}>{letter}</button>;
    })}</nav>
    {groups.length ? groups.map((group) => <section className="glossary-letter-group" id={`glossary-letter-${group.letter}`} key={group.letter} aria-labelledby={`glossary-letter-${group.letter}-title`}>
      <h2 className="glossary-letter-tab" id={`glossary-letter-${group.letter}-title`}>{group.letter}</h2>
      <div className="glossary-index">{group.entries.map((entry) => <button type="button" className="glossary-index-card interactive-paper" onClick={() => navigate({ page: "glossary", term: entry.term })} key={entry.term}>
        <strong>{entry.term}</strong>
        <p>{entry.meaning}</p>
        <span className="glossary-index-foot"><small>{passageLabel(passagesFor(entry.term).length)}</small><b aria-hidden="true">Open →</b></span>
      </button>)}</div>
    </section>) : <div className="empty-state"><strong>No term found.</strong><p>Try a shorter word or search the full rules for a phrase that is not a defined term.</p></div>}
    {selected && <TermDetail key={selected.term} entry={selected} onClose={() => replaceRoute({ page: "glossary" })} />}
  </main>;
}
