// Card Library page: the catalog grid, the Card of the Day, the collection ledger and the Dossier.
// Presentation only. Ownership comes from app/collection.ts; card data from app/data/cards.json.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import cardsJson from "./data/cards.json";
import { COLLECTION_PACKS, COLLECTION_STATUS, isCollectible, packProgress, provenanceFor, RARITIES, readCollection, type CollectionSnapshot, type CollectionView, type RarityId } from "./collection";
import { dayNumber, isFeaturable, pickBySeed } from "./daily-card";
import { prefersReducedMotion, usePaperToast } from "./paper-toast-context";
import { navigate, replaceRoute } from "./routing";
import { cardSearchText, type CardEntry } from "./search";
import { SectionHeader } from "./section-header";
import "./card-library.css";

const CardInspector = lazy(() => import("./card-inspector").then((module) => ({ default: module.CardInspector })));

const cardData = cardsJson as unknown as { cards: CardEntry[]; counts: Record<string, number>; decks: string[]; total: number };
const ALL_CARDS = cardData.cards;
const BINDER_STORAGE_KEY = "dojo-binder-v1";
const PAGE_SIZE = 24;
const ALL = "All";

type CardArt = { imageUrlFor: (card: CardEntry) => string; hasArt: (card: CardEntry) => boolean };

const valueLabel = (value: string | number | null | undefined) => value === null || value === undefined || value === "" ? "—" : String(value);
const numeric = (value: string | number | null | undefined) => {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};
const typeClassFor = (card: CardEntry) => `type-${card.cardType.toLocaleLowerCase().replaceAll(" ", "-")}`;
const rarityIdFor = (card: CardEntry): RarityId | "issue" => provenanceFor(card.catalogId)?.rarity.id ?? "issue";

function readBinder() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BINDER_STORAGE_KEY) ?? "[]");
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function useBinder() {
  const [savedIds, setSavedIds] = useState<Set<string>>(readBinder);
  useEffect(() => {
    try { window.localStorage.setItem(BINDER_STORAGE_KEY, JSON.stringify([...savedIds])); } catch { /* storage blocked: the binder lasts this visit */ }
  }, [savedIds]);
  const toggle = (catalogId: string) => setSavedIds((current) => {
    const next = new Set(current);
    if (next.has(catalogId)) next.delete(catalogId); else next.add(catalogId);
    return next;
  });
  return { savedIds, toggle };
}

/** Cards that share a series, build paths or tags with this one, best match first. */
function relatedCards(card: CardEntry, cards: CardEntry[], limit = 6) {
  const pack = provenanceFor(card.catalogId)?.pack.id;
  const paths = new Set(card.buildPaths);
  const tags = new Set(card.tags);
  return cards
    .filter((candidate) => candidate.id !== card.id)
    .map((candidate) => ({
      candidate,
      score: (pack && provenanceFor(candidate.catalogId)?.pack.id === pack ? 3 : 0)
        + candidate.buildPaths.filter((path) => paths.has(path)).length * 2
        + candidate.tags.filter((tag) => tags.has(tag)).length
        + (candidate.subtype === card.subtype ? 1 : 0),
    }))
    .filter(({ score }) => score >= 3)
    .sort((a, b) => b.score - a.score || a.candidate.catalogOrder - b.candidate.catalogOrder)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

export function RaritySeal({ card, compact = false }: { card: CardEntry; compact?: boolean }) {
  const provenance = provenanceFor(card.catalogId);
  const id = provenance?.rarity.id ?? "issue";
  const name = provenance?.rarity.name ?? "Standard Issue";
  const summary = provenance ? `${provenance.rarity.name}: ${provenance.rarity.summary}` : "Standard issue for every fighter. Never collected.";
  return <span className={`rarity-seal rarity-seal--${id}${compact ? " rarity-seal--compact" : ""}`} title={summary}><i aria-hidden="true" /><b>{name}</b></span>;
}

function CardTile({ card, art, saved, sealed, index, onOpen }: { card: CardEntry; art: CardArt; saved: boolean; sealed: boolean; index: number; onOpen: () => void }) {
  const provenance = provenanceFor(card.catalogId);
  const rarity = rarityIdFor(card);
  const status = sealed ? `Sealed. Found in ${provenance?.pack.name}.` : "";
  const style = { "--deal": index % PAGE_SIZE } as CSSProperties;
  const classes = `library-card paper-stack interactive-paper ${typeClassFor(card)} rarity-${rarity}${sealed ? " is-sealed" : ""}`;
  const savedStar = saved && <span className="binder-star" aria-hidden="true" title="Saved in Dojo Binder">★</span>;
  const label = `${card.name}, ${card.cardType}, ${provenance?.rarity.name ?? "Standard Issue"}.${saved ? " Saved in Dojo Binder." : ""} ${status} Open card details.`;
  if (art.hasArt(card)) {
    return <button type="button" className={`${classes} library-card--printed`} style={style} onClick={onOpen} aria-label={label}>
      {savedStar}
      <span className="library-card-print">
        <img src={art.imageUrlFor(card)} alt="" loading="lazy" decoding="async" />
        {sealed && <span className="library-envelope" aria-hidden="true"><span className="library-envelope-flap" /><b>Sealed</b><small>{provenance?.pack.name}</small></span>}
      </span>
      <span className="library-card-caption"><small>{card.catalogId} · {card.deck}</small><b>{card.name}</b></span>
      <span className="library-card-foot"><RaritySeal card={card} compact /><span className="open-card" aria-hidden="true">View →</span></span>
    </button>;
  }
  const statPairs = Object.entries(card.stats).slice(0, 3);
  return <button type="button" className={classes} style={style} onClick={onOpen} aria-label={label}>
    {savedStar}
    <div className="card-topline"><span>{card.cardType}</span><b>{card.deck}</b></div>
    <div className="card-body"><small>{card.cardType}</small><h3>{card.name}</h3><div className="card-costs">{card.fpCost !== null && card.fpCost !== undefined && <span><b>{valueLabel(card.fpCost)}</b> Focus Cost</span>}{card.focusValue !== null && card.focusValue !== undefined && <span><b>{valueLabel(card.focusValue)}</b> Focus</span>}{card.zone && <span>{card.zone}</span>}</div>{statPairs.length > 0 && <div className="mini-stats">{statPairs.map(([key, value]) => <span key={key}><b>{value}</b>{key}</span>)}</div>}<p>{card.rulesText || card.flavorText || "Open for complete card details."}</p></div>
    <span className="library-card-foot"><RaritySeal card={card} compact /><span className="open-card" aria-hidden="true">View →</span></span>
  </button>;
}

function DailyFiling({ card, art, onOpen, onRandom }: { card: CardEntry; art: CardArt; onOpen: () => void; onRandom: () => void }) {
  const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return <section className={`daily-filing rarity-${rarityIdFor(card)}`} aria-labelledby="daily-filing-title">
    <div className="daily-filing-print">
      <i className="fastener tape-strip daily-filing-tape" aria-hidden="true" />
      <img src={art.imageUrlFor(card)} alt="" decoding="async" />
      <span className="daily-filing-stamp" aria-hidden="true">Card of<br />the day</span>
    </div>
    <div className="daily-filing-copy">
      <span className="eyebrow">Today's filing · {today}</span>
      <h2 id="daily-filing-title">{card.name}</h2>
      <p className="daily-filing-meta">{card.catalogId} · {card.cardType}{card.subtype && card.subtype !== card.cardType ? ` · ${card.subtype}` : ""}</p>
      <RaritySeal card={card} />
      {card.flavorText && <p className="daily-filing-flavor">{card.flavorText}</p>}
      <div className="daily-filing-actions">
        <button type="button" className="button primary" onClick={onOpen}>Open the dossier <span aria-hidden="true">→</span></button>
        <button type="button" className="button ghost" onClick={onRandom}><span aria-hidden="true">⤨</span> Pull a random file</button>
      </div>
    </div>
  </section>;
}

function CollectionLedger({ snapshot, packFilter, onView, onPack }: { snapshot: CollectionSnapshot; packFilter: string; onView: (view: CollectionView) => void; onPack: (packId: string) => void }) {
  const progress = useMemo(() => packProgress(snapshot), [snapshot]);
  const owned = progress.reduce((sum, entry) => sum + entry.owned, 0);
  const total = progress.reduce((sum, entry) => sum + entry.total, 0);
  const percent = Math.round((owned / total) * 100);
  return <section className={`collection-ledger paper-stack is-${snapshot.view}`} aria-labelledby="collection-ledger-title">
    <header className="collection-ledger-head">
      <div>
        <span className="eyebrow">Collection ledger · {COLLECTION_STATUS === "proposal" ? "draft packs" : "packs"}</span>
        <h2 id="collection-ledger-title">{snapshot.label}</h2>
      </div>
      <span className="collection-ledger-stamp" aria-hidden="true">{snapshot.view === "open-dojo" ? "On loan" : "Preview"}</span>
    </header>
    <p className="collection-ledger-summary">{snapshot.summary}</p>
    <div className="collection-view-toggle" role="group" aria-label="Collection view">
      <button type="button" aria-pressed={snapshot.view === "open-dojo"} onClick={() => onView("open-dojo")}>Open Dojo</button>
      <button type="button" aria-pressed={snapshot.view === "recruit-preview"} onClick={() => onView("recruit-preview")}>Preview new recruit</button>
    </div>
    <div className="collection-total" aria-label={`${owned} of ${total} collectible cards owned`}>
      <b>{owned}</b><span>/ {total} collectible cards</span>
      <span className="collection-meter" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
    </div>
    <ul className="collection-packs" aria-label="Packs and series">
      {progress.map(({ pack, owned: packOwned, total: packTotal, locked }) => {
        const meta = pack.kind === "starter"
          ? pack.grant === "every-profile" ? "Issued on day one" : "Starter kit · choose one"
          : locked ? `Series · opens at Clearance ${pack.unlockLevel}` : "Booster series";
        return <li key={pack.id}><button type="button" className={`collection-pack${locked ? " is-locked" : ""}`} aria-pressed={packFilter === pack.id} onClick={() => onPack(pack.id)} title={pack.tagline}>
          <span className="collection-pack-name"><b>{pack.name}</b><small>{meta}</small></span>
          <span className="collection-pack-count">{packOwned}/{packTotal}</span>
          <span className="collection-meter" aria-hidden="true"><i style={{ width: `${(packOwned / packTotal) * 100}%` }} /></span>
        </button></li>;
      })}
    </ul>
  </section>;
}

function DossierProvenance({ card, sealed, ownership }: { card: CardEntry; sealed: boolean; ownership: string }) {
  const provenance = provenanceFor(card.catalogId);
  if (!provenance) return <div className="dossier-provenance"><RaritySeal card={card} /><p><b>Standard issue.</b> Every fighter has access; it is never collected.</p></div>;
  return <div className={`dossier-provenance${sealed ? " is-sealed" : ""}`}>
    <RaritySeal card={card} />
    <p><b>Found in {provenance.pack.name}.</b> {provenance.pack.tagline} <span className="dossier-provenance-status">{ownership}</span></p>
  </div>;
}

function RelatedFilings({ cards, art, onOpen }: { cards: CardEntry[]; art: CardArt; onOpen: (card: CardEntry) => void }) {
  if (!cards.length) return null;
  return <section className="related-filings" aria-labelledby="related-filings-title">
    <span className="eyebrow">Cross-referenced</span>
    <h3 id="related-filings-title">Related filings</h3>
    <ul>{cards.map((card) => <li key={card.id}><button type="button" onClick={() => onOpen(card)} aria-label={`Open ${card.name}`}>
      {art.hasArt(card) ? <img src={art.imageUrlFor(card)} alt="" loading="lazy" decoding="async" /> : <span className="related-filings-blank" aria-hidden="true">{card.catalogId.slice(4, 7)}</span>}
      <b>{card.name}</b>
    </button></li>)}</ul>
  </section>;
}

function SealedEnvelope({ card, onBreak }: { card: CardEntry; onBreak: () => void }) {
  const [opening, setOpening] = useState(false);
  const provenance = provenanceFor(card.catalogId);
  const envelopeRef = useRef<HTMLDivElement>(null);
  const breakSeal = () => {
    if (opening) return;
    setOpening(true);
    const stage = envelopeRef.current?.parentElement;
    window.setTimeout(() => {
      onBreak();
      // The button that had focus is gone; hand focus to the next control on the card (the binder star).
      window.requestAnimationFrame(() => stage?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true }));
    }, prefersReducedMotion() ? 0 : 620);
  };
  return <div ref={envelopeRef} className={`dossier-envelope${opening ? " is-opening" : ""}`}>
    <span className="dossier-envelope-flap" aria-hidden="true" />
    <span className="dossier-envelope-label"><small>Department of Competitive Safety</small><b>Sealed</b><span>{provenance?.pack.name} · {provenance?.rarity.name}</span></span>
    <button type="button" className="button primary" onClick={breakSeal}>Break the seal <small>(preview)</small></button>
  </div>;
}

export function CardLibrary({ cardId = "", headerArt, imageUrlFor, hasArt }: { cardId?: string; headerArt: string } & CardArt) {
  const art = useMemo<CardArt>(() => ({ imageUrlFor, hasArt }), [imageUrlFor, hasArt]);
  const [query, setQuery] = useState(""); const [type, setType] = useState(ALL); const [deck, setDeck] = useState(ALL);
  const [subtype, setSubtype] = useState(ALL); const [timing, setTiming] = useState(ALL); const [focusCost, setFocusCost] = useState(ALL);
  const [packFilter, setPackFilter] = useState(""); const [rarity, setRarity] = useState(ALL);
  const [sort, setSort] = useState("catalog"); const [visible, setVisible] = useState(PAGE_SIZE);
  const [binderOnly, setBinderOnly] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const [view, setView] = useState<CollectionView>("open-dojo");
  const [peeked, setPeeked] = useState<Set<string>>(() => new Set());
  const { savedIds, toggle } = useBinder();
  const pushToast = usePaperToast();
  const gridRef = useRef<HTMLElement>(null);
  const snapshot = readCollection(view);
  const isSealed = (card: CardEntry) => isCollectible(card) && !snapshot.owns(card.catalogId) && !peeked.has(card.catalogId);
  const ownershipNote = (card: CardEntry) => {
    if (snapshot.view === "open-dojo") return "On loan in Open Dojo.";
    if (snapshot.owns(card.catalogId)) return "Issued to a new recruit.";
    return peeked.has(card.catalogId) ? "Peeked at, not collected." : "Sealed in this preview.";
  };
  const featured = useMemo(() => pickBySeed(ALL_CARDS.filter((card) => hasArt(card) && isFeaturable(card)), dayNumber()), [hasArt]);
  const activeCard = cardId ? ALL_CARDS.find((card) => card.catalogId.toLocaleLowerCase() === cardId.toLocaleLowerCase()) ?? null : null;

  const cardsInScope = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const packIds = packFilter ? PACK_MEMBERS.get(packFilter) : undefined;
    return ALL_CARDS.filter((card) => (deck === ALL || card.deck === deck)
      && (!packIds || packIds.has(card.catalogId))
      && (rarity === ALL || rarityIdFor(card) === rarity)
      && (!term || cardSearchText(card).includes(term)));
  }, [query, deck, packFilter, rarity]);
  const typeCounts = useMemo(() => countBy(cardsInScope.map((card) => card.cardType)), [cardsInScope]);
  const typedCards = useMemo(() => cardsInScope.filter((card) => (type === ALL || card.cardType === type) && (!binderOnly || savedIds.has(card.catalogId))), [cardsInScope, type, binderOnly, savedIds]);
  const subtypeCounts = useMemo(() => countBy(typedCards.map((card) => card.subtype)), [typedCards]);
  const timingCounts = useMemo(() => countBy(typedCards.map((card) => card.timing)), [typedCards]);
  const focusCostCounts = useMemo(() => countBy(typedCards.map((card) => Number.isFinite(numeric(card.fpCost)) ? numeric(card.fpCost) : null)), [typedCards]);
  const rarityCounts = useMemo(() => countBy(ALL_CARDS.filter((card) => deck === ALL || card.deck === deck).map(rarityIdFor)), [deck]);
  const subtypeOptions = Object.keys(subtypeCounts).sort();
  const timingOptions = Object.keys(timingCounts).sort();
  const focusCostOptions = Object.keys(focusCostCounts).sort((a, b) => Number(a) - Number(b));
  const filtered = useMemo(() => typedCards
    .filter((card) => (subtype === ALL || card.subtype === subtype) && (timing === ALL || card.timing === timing) && (focusCost === ALL || numeric(card.fpCost) === Number(focusCost)))
    .sort((a, b) => {
      if (sort === "catalog") return a.catalogOrder - b.catalogOrder;
      if (sort === "focus") return numeric(a.fpCost) - numeric(b.fpCost) || a.name.localeCompare(b.name);
      if (sort === "type") return a.cardType.localeCompare(b.cardType) || a.name.localeCompare(b.name);
      if (sort === "deck") return a.deck.localeCompare(b.deck) || a.name.localeCompare(b.name);
      if (sort === "rarity") return rarityRank(b) - rarityRank(a) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    }), [typedCards, subtype, timing, focusCost, sort]);

  const activeIndex = activeCard ? filtered.findIndex((card) => card.id === activeCard.id) : -1;
  const previousCard = activeIndex > 0 ? filtered[activeIndex - 1] : null;
  const nextCard = activeIndex >= 0 && activeIndex < filtered.length - 1 ? filtered[activeIndex + 1] : null;
  const related = useMemo(() => activeCard ? relatedCards(activeCard, ALL_CARDS) : [], [activeCard]);
  const activePack = COLLECTION_PACKS.find((pack) => pack.id === packFilter);

  const restartPaging = () => setVisible(PAGE_SIZE);
  const resetSecondaryFilters = () => { setSubtype(ALL); setTiming(ALL); setFocusCost(ALL); };
  const resetFilters = () => { setQuery(""); setType(ALL); setDeck(ALL); setPackFilter(""); setRarity(ALL); resetSecondaryFilters(); setBinderOnly(false); restartPaging(); };
  const filtersActive = Boolean(query || packFilter || binderOnly) || [type, deck, subtype, timing, focusCost, rarity].some((value) => value !== ALL);
  const openCard = (card: CardEntry) => navigate({ page: "cards", cardId: card.catalogId });
  const stepCard = (card: CardEntry | null) => { if (card) replaceRoute({ page: "cards", cardId: card.catalogId }); };
  const closeCard = () => replaceRoute({ page: "cards" });
  const openRandom = () => {
    const pool = filtered.length ? filtered : ALL_CARDS;
    openCard(pool[Math.floor(Math.random() * pool.length)]);
  };
  const toggleSaved = (card: CardEntry) => {
    const wasSaved = savedIds.has(card.catalogId);
    toggle(card.catalogId);
    if (binderOnly && wasSaved) setBinderOnly(false);
    pushToast({ kind: wasSaved ? "note" : "stamp", eyebrow: "Dojo Binder", title: wasSaved ? "Card withdrawn" : "Card filed", message: card.name, duration: 2600 });
  };
  const changeView = (next: CollectionView) => {
    if (next === view) return;
    setView(next);
    setPeeked(new Set());
    pushToast(next === "open-dojo"
      ? { kind: "note", eyebrow: "Collection ledger", title: "Open Dojo restored", message: "Every card is on loan again.", duration: 2600 }
      : { kind: "stamp", eyebrow: "Preview only", title: "New recruit view", message: "Sealed envelopes show what a Level 1 profile would not own yet. Nothing is locked or saved.", duration: 4200 });
  };
  const choosePack = (packId: string) => {
    setPackFilter((current) => current === packId ? "" : packId);
    restartPaging();
    window.requestAnimationFrame(() => gridRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }));
  };
  const breakSeal = (card: CardEntry) => {
    setPeeked((current) => new Set(current).add(card.catalogId));
    pushToast({ kind: "stamp", eyebrow: "Preview only", title: "Seal broken", message: `${card.name} was peeked at, not collected.`, duration: 2800 });
  };

  return <main className="page-shell shell card-library-page"><SectionHeader eyebrow="Card Library" title={`${cardData.total} cards. One awkward curriculum.`} intro="Search the complete Core catalog by ID, deck, type, rules text, or Focus Cost. The 500-card main pool excludes Starter, Character, and Boss-module cards." art={headerArt} />
    <div className="library-desk">
      <DailyFiling card={featured} art={art} onOpen={() => openCard(featured)} onRandom={openRandom} />
      <CollectionLedger snapshot={snapshot} packFilter={packFilter} onView={changeView} onPack={choosePack} />
    </div>
    <section className={`library-controls${moreFilters ? " is-expanded" : ""}`} aria-label="Search and filter cards">
      <div className="library-control library-search-control"><label htmlFor="card-library-search">Search</label><div className="search-box"><span aria-hidden="true">⌕</span><input id="card-library-search" value={query} onChange={(event) => { setQuery(event.target.value); restartPaging(); }} placeholder="ID, name, rules, tag…" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear card search">×</button>}</div></div>
      <label className="library-control"><span>Deck</span><select value={deck} onChange={(event) => { setDeck(event.target.value); resetSecondaryFilters(); restartPaging(); }}><option>{ALL}</option>{cardData.decks.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
      <button type="button" className="library-more-filters" aria-expanded={moreFilters} aria-controls="library-secondary-filters" onClick={() => setMoreFilters((current) => !current)}>{moreFilters ? "Fewer filters" : "More filters"}</button>
      <div className="library-secondary-filters" id="library-secondary-filters">
        <label className="library-control"><span>Subtype</span><select value={subtype} onChange={(event) => { setSubtype(event.target.value); restartPaging(); }} disabled={!subtypeOptions.length}><option value={ALL}>All subtypes</option>{subtypeOptions.map((entry) => <option value={entry} key={entry}>{entry} ({subtypeCounts[entry]})</option>)}</select></label>
        <label className="library-control"><span>Timing</span><select value={timing} onChange={(event) => { setTiming(event.target.value); restartPaging(); }} disabled={!timingOptions.length}><option value={ALL}>All timings</option>{timingOptions.map((entry) => <option value={entry} key={entry}>{entry} ({timingCounts[entry]})</option>)}</select></label>
        <label className="library-control"><span>Focus Cost</span><select value={focusCost} onChange={(event) => { setFocusCost(event.target.value); restartPaging(); }} disabled={!focusCostOptions.length}><option value={ALL}>Any cost</option>{focusCostOptions.map((entry) => <option value={entry} key={entry}>{entry} Focus ({focusCostCounts[entry]})</option>)}</select></label>
        <label className="library-control"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="catalog">Catalog order</option><option value="name">Name A–Z</option><option value="deck">Deck</option><option value="type">Card type</option><option value="focus">Focus Cost</option><option value="rarity">Rarity</option></select></label>
      </div>
    </section>
    <div className="binder-strip"><button type="button" className={`binder-toggle${binderOnly ? " is-saved" : ""}`} aria-pressed={binderOnly} onClick={() => { setBinderOnly((current) => !current); restartPaging(); }}><span aria-hidden="true">{binderOnly ? "★" : "☆"}</span> Dojo Binder <b>{savedIds.size}</b></button><p>Saved on this device only. Open a card to add or remove it.</p></div>
    <div className="type-filters" role="group" aria-label="Filter by card type">{[ALL, ...Object.keys(cardData.counts)].map((entry) => <button type="button" aria-pressed={type === entry} className={type === entry ? "active" : ""} onClick={() => { setType(entry); resetSecondaryFilters(); restartPaging(); }} key={entry}>{entry}<span>{entry === ALL ? cardsInScope.length : typeCounts[entry] ?? 0}</span></button>)}</div>
    <div className="rarity-filters" role="group" aria-label="Filter by rarity">{[ALL, "issue", ...RARITIES.map((entry) => entry.id)].map((entry) => {
      const name = entry === ALL ? "Any rarity" : entry === "issue" ? "Standard Issue" : RARITIES.find((item) => item.id === entry)?.name;
      return <button type="button" key={entry} className={`rarity-filter rarity-filter--${entry.toLocaleLowerCase()}`} aria-pressed={rarity === entry} onClick={() => { setRarity(entry); restartPaging(); }}><i aria-hidden="true" />{name}{entry !== ALL && <span>{rarityCounts[entry] ?? 0}</span>}</button>;
    })}</div>
    <div className="result-line" aria-live="polite"><p><strong>{filtered.length}</strong> results{activePack && <span className="result-pack-chip">in {activePack.name} <button type="button" onClick={() => setPackFilter("")} aria-label={`Clear ${activePack.name} filter`}>×</button></span>}</p>{filtersActive && <button type="button" onClick={resetFilters}>Reset filters</button>}</div>
    {filtered.length ? <><section ref={gridRef} className="card-grid" aria-label="Cards">{filtered.slice(0, visible).map((card, index) => <CardTile key={card.id} card={card} art={art} index={index} saved={savedIds.has(card.catalogId)} sealed={isSealed(card)} onOpen={() => openCard(card)} />)}</section>{visible < filtered.length && <button type="button" className="button load-more" onClick={() => setVisible((count) => count + PAGE_SIZE)}>Load {PAGE_SIZE} more <span>{filtered.length - visible} remaining</span></button>}</> : <div className="empty-state"><strong>No cards match that search.</strong><p>Clear a filter or try a broader rules term.</p><button type="button" className="button ghost" onClick={resetFilters}>Reset filters</button></div>}
    {activeCard && <Suspense fallback={null}><CardInspector
      card={activeCard}
      imageUrl={imageUrlFor(activeCard)}
      saved={savedIds.has(activeCard.catalogId)}
      positionLabel={activeIndex >= 0 ? `${activeIndex + 1} of ${filtered.length}` : activeCard.catalogId}
      previousName={previousCard?.name}
      nextName={nextCard?.name}
      previousDisabled={!previousCard}
      nextDisabled={!nextCard}
      onToggleSaved={() => toggleSaved(activeCard)}
      onPrevious={() => stepCard(previousCard)}
      onNext={() => stepCard(nextCard)}
      onClose={closeCard}
      reveal
      provenance={<DossierProvenance card={activeCard} sealed={isSealed(activeCard)} ownership={ownershipNote(activeCard)} />}
      related={<RelatedFilings cards={related} art={art} onOpen={(card) => stepCard(card)} />}
      stageOverlay={isSealed(activeCard) ? <SealedEnvelope key={activeCard.id} card={activeCard} onBreak={() => breakSeal(activeCard)} /> : null}
    /></Suspense>}
  </main>;
}

const RARITY_RANK: Record<string, number> = { issue: 0, core: 1, common: 2, uncommon: 3, rare: 4, legendary: 5 };
const rarityRank = (card: CardEntry) => RARITY_RANK[rarityIdFor(card)] ?? 0;

const PACK_MEMBERS = new Map(COLLECTION_PACKS.map((pack) => [pack.id, new Set(pack.catalogIds)]));

function countBy(values: (string | number | null | undefined)[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    const label = value === null || value === undefined ? "" : String(value).trim();
    if (label && label !== "—") counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});
}
