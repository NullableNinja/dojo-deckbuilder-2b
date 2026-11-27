// Card Library page: the catalog grid, the Card of the Day, the collection ledger, the Starter Kit
// requisition, pack opening and the Dossier. Ownership comes from app/collection.ts (which reads the
// career store); real packs are opened through app/career.ts; card data from app/data/cards.json.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import cardsJson from "./data/cards.json";
import { careerStore, economy, walletOf, type CareerSnapshot } from "./career";
import { COLLECTION_STATUS, drawPreviewPack, isUnlockable, readCollection, sourceFor, sourceProgress, unlockHint, UNLOCK_SOURCES, type CollectionSnapshot, type CollectionView, type UnlockSource } from "./collection";
import { PackCeremony } from "./pack-ceremony";
import { dayNumber, isFeaturable, pickBySeed } from "./daily-card";
import { prefersReducedMotion, usePaperToast, type ToastInput } from "./paper-toast-context";
import { PERSONAL_STORAGE_KEYS, readStoredList, writeStoredList } from "./personal-record";
import { navigate, replaceRoute } from "./routing";
import { cardSearchText, type CardEntry } from "./search";
import { SectionHeader } from "./section-header";
import { useCareer } from "./use-career";
import "./card-library.css";

const CardInspector = lazy(() => import("./card-inspector").then((module) => ({ default: module.CardInspector })));

const cardData = cardsJson as unknown as { cards: CardEntry[]; counts: Record<string, number>; decks: string[]; total: number };
const ALL_CARDS = cardData.cards;
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

/** How a source is described on tiles, the ledger and the Dossier. */
const sourceMeta = (source: UnlockSource | undefined, locked = false) => {
  if (!source) return "Standard issue";
  if (source.kind === "roster") return "Unlocks by playing";
  if (source.kind === "starter") return source.grant === "every-profile" ? "Issued on day one" : "Starter kit · choose one";
  return locked ? `Series · opens at Clearance Level ${source.unlockLevel}` : "Booster series";
};


function useBinder() {
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(readStoredList(PERSONAL_STORAGE_KEYS.binder)));
  useEffect(() => {
    writeStoredList(PERSONAL_STORAGE_KEYS.binder, savedIds);
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
  const source = sourceFor(card.catalogId)?.id;
  const paths = new Set(card.buildPaths);
  const tags = new Set(card.tags);
  return cards
    .filter((candidate) => candidate.id !== card.id)
    .map((candidate) => ({
      candidate,
      score: (source && sourceFor(candidate.catalogId)?.id === source ? 3 : 0)
        + candidate.buildPaths.filter((path) => paths.has(path)).length * 2
        + candidate.tags.filter((tag) => tags.has(tag)).length
        + (candidate.subtype === card.subtype ? 1 : 0),
    }))
    .filter(({ score }) => score >= 3)
    .sort((a, b) => b.score - a.score || a.candidate.catalogOrder - b.candidate.catalogOrder)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

/** Where a card comes from: a starter kit, a booster series, a roster, or standard issue. */
export function OriginTag({ card, compact = false }: { card: CardEntry; compact?: boolean }) {
  const source = sourceFor(card.catalogId);
  return <span className={`origin-tag origin-tag--${source?.kind ?? "issue"}${compact ? " origin-tag--compact" : ""}`} title={source ? `${source.name}: ${source.tagline}` : "Standard issue for every fighter. Never unlocked."}><i aria-hidden="true" /><b>{source?.name ?? "Standard issue"}</b></span>;
}

/** Pack cards arrive in sealed envelopes; fighters and bosses are classified personnel files. */
const sealWord = (source?: UnlockSource) => source?.kind === "roster" ? "Classified" : "Sealed";

function SealedFlap({ source, hint }: { source?: UnlockSource; hint: string }) {
  return <span className={`library-envelope library-envelope--${source?.kind ?? "booster"}`} aria-hidden="true"><span className="library-envelope-flap" /><b>{sealWord(source)}</b><small>{hint}</small></span>;
}

function CardTile({ card, art, saved, sealed, hint, unsealing, index, onOpen }: { card: CardEntry; art: CardArt; saved: boolean; sealed: boolean; hint: string; unsealing: boolean; index: number; onOpen: () => void }) {
  const source = sourceFor(card.catalogId);
  const status = sealed ? `${sealWord(source)}. ${hint}.` : "";
  const style = { "--deal": index % PAGE_SIZE } as CSSProperties;
  const classes = `library-card paper-stack interactive-paper ${typeClassFor(card)}${sealed ? " is-sealed" : ""}${sealed && unsealing ? " is-unsealing" : ""}`;
  const savedStar = saved && <span className="binder-star" aria-hidden="true" title="Saved in Dojo Binder">★</span>;
  const label = `${card.name}, ${card.cardType}, ${source?.name ?? "Standard issue"}.${saved ? " Saved in Dojo Binder." : ""} ${status} Open card details.`;
  const foot = <span className="library-card-foot"><OriginTag card={card} compact /><span className="open-card" aria-hidden="true">View →</span></span>;
  if (art.hasArt(card)) {
    return <button type="button" className={`${classes} library-card--printed`} style={style} onClick={onOpen} aria-label={label}>
      {savedStar}
      <span className="library-card-print">
        <img src={art.imageUrlFor(card)} alt="" loading="lazy" decoding="async" />
        {sealed && <SealedFlap source={source} hint={hint} />}
      </span>
      <span className="library-card-caption"><small>{card.catalogId} · {card.deck}</small><b>{card.name}</b></span>
      {foot}
    </button>;
  }
  const statPairs = Object.entries(card.stats).slice(0, 3);
  return <button type="button" className={classes} style={style} onClick={onOpen} aria-label={label}>
    {savedStar}
    <div className="card-topline"><span>{card.cardType}</span><b>{card.deck}</b></div>
    <div className="card-body"><small>{card.cardType}</small><h3>{card.name}</h3><div className="card-costs">{card.fpCost !== null && card.fpCost !== undefined && <span><b>{valueLabel(card.fpCost)}</b> Focus Cost</span>}{card.focusValue !== null && card.focusValue !== undefined && <span><b>{valueLabel(card.focusValue)}</b> Focus</span>}{card.zone && <span>{card.zone}</span>}</div>{statPairs.length > 0 && <div className="mini-stats">{statPairs.map(([key, value]) => <span key={key}><b>{value}</b>{key}</span>)}</div>}<p>{card.rulesText || card.flavorText || "Open for complete card details."}</p></div>
    {foot}
  </button>;
}

function DailyFiling({ card, art, onOpen, onRandom }: { card: CardEntry; art: CardArt; onOpen: () => void; onRandom: () => void }) {
  const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return <section className="daily-filing" aria-labelledby="daily-filing-title">
    <div className="daily-filing-print">
      <i className="fastener tape-strip daily-filing-tape" aria-hidden="true" />
      <img src={art.imageUrlFor(card)} alt="" decoding="async" />
      <span className="daily-filing-stamp" aria-hidden="true">Card of<br />the day</span>
    </div>
    <div className="daily-filing-copy">
      <span className="eyebrow">Today's filing · {today}</span>
      <h2 id="daily-filing-title">{card.name}</h2>
      <p className="daily-filing-meta">{card.catalogId} · {card.cardType}{card.subtype && card.subtype !== card.cardType ? ` · ${card.subtype}` : ""}</p>
      <OriginTag card={card} />
      {card.flavorText && <p className="daily-filing-flavor">{card.flavorText}</p>}
      <div className="daily-filing-actions">
        <button type="button" className="button primary" onClick={onOpen}>Open the dossier <span aria-hidden="true">→</span></button>
        <button type="button" className="button ghost" onClick={onRandom}><span aria-hidden="true">⤨</span> Pull a random file</button>
      </div>
    </div>
  </section>;
}

type LedgerActions = {
  sealedIn: (source: UnlockSource) => number;
  anySealed: boolean;
  anyUnsealed: boolean;
  onRip: (source: UnlockSource) => void;
  onBreakAll: () => void;
  onReseal: () => void;
};

/** The career's wallet and Clearance Level, shown at the top of My Collection. */
function CareerWallet({ career }: { career: NonNullable<CollectionSnapshot["career"]> }) {
  const { tickets, stubs, stubRate } = walletOf(career);
  const progress = economy.levelProgress(career.merit);
  const complete = economy.collectionComplete(career);
  return <div className="career-wallet">
    <div className="career-wallet-ticket" aria-label={`${tickets} Booster ${tickets === 1 ? "Ticket" : "Tickets"}`}><b>{tickets}</b><span>Booster {tickets === 1 ? "Ticket" : "Tickets"}</span></div>
    <div className="career-wallet-facts">
      <span><b>{stubs}/{stubRate}</b> Ticket Stubs</span>
      <span><b>Clearance Level {progress.level}</b> · {career.merit.toLocaleString()} Merit</span>
    </div>
    <p className="career-wallet-note">{complete ? `Collection complete. Every new ticket files as ${economy.packs.boosterRules.completedCollection.ticketConvertsToMerit} Merit.` : tickets ? "Pick any open series below and rip a pack: five cards you do not own yet." : "Win a match for a Booster Ticket. A loss earns a Ticket Stub; three stubs make a ticket."}</p>
  </div>;
}

function ripLabel(snapshot: CollectionSnapshot, source: UnlockSource, sealed: number, locked: boolean) {
  if (locked) return { text: `CL ${source.unlockLevel}`, label: `${source.name} opens at Clearance Level ${source.unlockLevel}`, enabled: false };
  if (!sealed) return { text: "Done", label: `${source.name} is complete`, enabled: false };
  if (snapshot.mode === "career" && !walletOf(snapshot.career).tickets) return { text: "No ticket", label: `Rip a ${source.name} pack: you need a Booster Ticket`, enabled: false };
  return { text: "Rip a pack", label: snapshot.mode === "career" ? `Spend a Booster Ticket on a ${source.name} pack` : `Rip open a free preview ${source.name} pack`, enabled: true };
}

function CollectionLedger({ snapshot, viewLocked, sourceFilter, onView, onSource, actions }: { snapshot: CollectionSnapshot; viewLocked: boolean; sourceFilter: string; onView: (view: CollectionView) => void; onSource: (sourceId: string) => void; actions: LedgerActions }) {
  const { mode } = snapshot;
  const progress = useMemo(() => sourceProgress(snapshot), [snapshot]);
  const owned = progress.reduce((sum, entry) => sum + entry.owned, 0);
  const total = progress.reduce((sum, entry) => sum + entry.total, 0);
  const percent = Math.round((owned / total) * 100);
  const canRip = mode !== "open-dojo";
  return <section className={`collection-ledger paper-stack is-${mode}`} aria-labelledby="collection-ledger-title">
    <header className="collection-ledger-head">
      <div>
        <span className="eyebrow">Collection ledger · {COLLECTION_STATUS === "proposal" ? "draft packs" : "packs"}</span>
        <h2 id="collection-ledger-title">{snapshot.label}</h2>
      </div>
      <span className="collection-ledger-stamp" aria-hidden="true">{mode === "open-dojo" ? "On loan" : mode === "career" ? "On file" : "Preview"}</span>
    </header>
    <p className="collection-ledger-summary">{snapshot.summary}</p>
    {!viewLocked && <div className="collection-view-toggle" role="group" aria-label="Collection view">
      <button type="button" aria-pressed={snapshot.view === "career"} onClick={() => onView("career")}>My Collection</button>
      <button type="button" aria-pressed={snapshot.view === "open-dojo"} onClick={() => onView("open-dojo")}>Open Dojo</button>
    </div>}
    {mode === "career" && snapshot.career && <CareerWallet career={snapshot.career} />}
    {mode === "preview" && <div className="collection-preview-actions">
      <button type="button" className="button primary" onClick={actions.onBreakAll} disabled={!actions.anySealed}>Break every seal</button>
      <button type="button" className="button ghost" onClick={actions.onReseal} disabled={!actions.anyUnsealed}>Re-seal everything</button>
      <p>Or rip open a free pack from any booster series below. Preview only: nothing is saved.</p>
    </div>}
    <div className="collection-total" aria-label={`${owned} of ${total} unlockable cards owned`}>
      <b>{owned}</b><span>/ {total} unlockable cards · earned by playing, never sold</span>
      <span className="collection-meter" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
    </div>
    <ul className="collection-packs" aria-label="Packs, series and rosters">
      {progress.map(({ source, owned: sourceOwned, total: sourceTotal, locked }) => {
        const rip = canRip && source.kind === "booster" ? ripLabel(snapshot, source, actions.sealedIn(source), locked) : null;
        return <li key={source.id} className={rip ? "has-rip" : undefined}><button type="button" className={`collection-pack collection-pack--${source.kind}${locked ? " is-locked" : ""}`} aria-pressed={sourceFilter === source.id} onClick={() => onSource(source.id)} title={source.tagline}>
          <span className="collection-pack-name"><b>{source.name}</b><small>{sourceMeta(source, locked)}</small></span>
          <span className="collection-pack-count">{sourceOwned}/{sourceTotal}</span>
          <span className="collection-meter" aria-hidden="true"><i style={{ width: `${(sourceOwned / sourceTotal) * 100}%` }} /></span>
        </button>{rip && <button type="button" className="collection-rip" onClick={() => actions.onRip(source)} disabled={!rip.enabled} aria-label={rip.label}>{rip.text}</button>}</li>;
      })}
    </ul>
  </section>;
}

/** The Starter Kit choice: offered on a new profile's first visit, and again at the kit levels. */
function StarterKitRequisition({ career, art, onChoose, onBrowse, onLater }: { career: NonNullable<CareerSnapshot["state"]>; art: CardArt; onChoose: (kitId: string) => void; onBrowse: (kitId: string) => void; onLater: () => void }) {
  const kits = economy.kits.filter((kit) => !career.starterKits.includes(kit.id));
  const first = career.starterKits.length === 0;
  return <section className="kit-requisition paper-stack" aria-labelledby="kit-requisition-title">
    <header className="kit-requisition-head">
      <div>
        <span className="eyebrow">Requisition form · {first ? "day one" : `Clearance Level ${economy.levelFor(career.merit)}`}</span>
        <h2 id="kit-requisition-title">{first ? "Choose your Starter Kit" : "Choose another Starter Kit"}</h2>
        <p>{first ? `Your Orientation Kit is already filed. Sign for one of these ${economy.kits[0]?.cards.length ?? 20}-card kits to add a fighting style; the others unlock at later Clearance Levels.` : "A new Clearance Level cleared another kit for you. Sign for the style you want next."}</p>
      </div>
      <button type="button" className="button ghost kit-requisition-later" onClick={onLater}>Decide later</button>
    </header>
    <ul className="kit-requisition-options">
      {kits.map((kit) => {
        const samples = kit.cards.map((entry) => CARDS_BY_ID.get(entry.catalogId)).filter((card): card is CardEntry => Boolean(card && art.hasArt(card))).slice(0, 3);
        return <li key={kit.id} className="kit-option">
          <div className="kit-option-fan" aria-hidden="true">{samples.map((card, index) => <img key={card.id} src={art.imageUrlFor(card)} alt="" loading="lazy" decoding="async" style={{ ["--i" as string]: index - 1 }} />)}</div>
          <div className="kit-option-copy">
            <h3>{kit.name}</h3>
            <p>{kit.tagline}</p>
            <ul className="kit-option-paths" aria-label="Build paths">{kit.themeBuildPaths.map((path) => <li key={path}>{path}</li>)}</ul>
          </div>
          <div className="kit-option-actions">
            <button type="button" className="button primary" onClick={() => onChoose(kit.id)}>Sign for the {kit.name}</button>
            <button type="button" className="button ghost" onClick={() => onBrowse(kit.id)}>See its {kit.cards.length} cards</button>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}

function DossierProvenance({ card, sealed, ownership }: { card: CardEntry; sealed: boolean; ownership: string }) {
  const source = sourceFor(card.catalogId);
  if (!source) return <div className="dossier-provenance"><OriginTag card={card} /><p><b>Standard issue.</b> Every fighter has access; it is never unlocked.</p></div>;
  const where = source.kind === "roster" ? `Joins the ${source.name.toLocaleLowerCase()} by playing.` : source.kind === "starter" ? `Issued in the ${source.name}.` : `Found in ${source.name} packs.`;
  return <div className={`dossier-provenance${sealed ? " is-sealed" : ""}`}>
    <OriginTag card={card} />
    <p><b>{where}</b> {source.tagline} <span className="dossier-provenance-status">{ownership}</span></p>
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

type EnvelopeRip = { label: string; note?: string; disabled?: boolean; onRip: () => void };

function SealedEnvelope({ card, hint, rip }: { card: CardEntry; hint: string; rip?: EnvelopeRip }) {
  const source = sourceFor(card.catalogId);
  return <div className="dossier-envelope">
    <span className="dossier-envelope-flap" aria-hidden="true" />
    <span className="dossier-envelope-label"><small>Department of Competitive Safety</small><b>{sealWord(source)}</b><span>{hint}</span></span>
    {rip && <button type="button" className="button primary" onClick={rip.onRip} disabled={rip.disabled}>{rip.label}</button>}
    {rip?.note && <small className="dossier-envelope-note">{rip.note}</small>}
  </div>;
}

export function CardLibrary({ cardId = "", headerArt, imageUrlFor, hasArt }: { cardId?: string; headerArt: string } & CardArt) {
  const art = useMemo<CardArt>(() => ({ imageUrlFor, hasArt }), [imageUrlFor, hasArt]);
  const [query, setQuery] = useState(""); const [type, setType] = useState(ALL); const [deck, setDeck] = useState(ALL);
  const [subtype, setSubtype] = useState(ALL); const [timing, setTiming] = useState(ALL); const [focusCost, setFocusCost] = useState(ALL);
  const [sourceFilter, setSourceFilter] = useState("");
  const [sort, setSort] = useState("catalog"); const [visible, setVisible] = useState(PAGE_SIZE);
  const [binderOnly, setBinderOnly] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  // Players with a career default to My Collection; without one (blocked storage, a newer record) to Open Dojo.
  const career = useCareer();
  const [localView, setLocalView] = useState<CollectionView>("open-dojo");
  const careerView: CollectionView | null = career.status === "career" && career.state ? (career.state.openDojo ? "open-dojo" : "career") : null;
  const view: CollectionView = careerView ?? localView;
  const [unsealed, setUnsealed] = useState<Set<string>>(() => new Set());
  const [unsealing, setUnsealing] = useState(false);
  const [kitDeferred, setKitDeferred] = useState(false);
  const [ceremony, setCeremony] = useState<{ source: UnlockSource; catalogIds: string[]; number: number; mode: "career" | "preview" } | null>(null);
  const { savedIds, toggle } = useBinder();
  const pushToast = usePaperToast();
  const gridRef = useRef<HTMLElement>(null);
  const snapshot = readCollection(view, career);
  const realPacks = snapshot.mode === "career";
  const tickets = walletOf(snapshot.career).tickets;
  const isSealedId = (catalogId: string) => isUnlockable(catalogId) && !snapshot.owns(catalogId) && !(snapshot.mode === "preview" && unsealed.has(catalogId));
  const isSealed = (card: CardEntry) => isSealedId(card.catalogId);
  const hintFor = (card: CardEntry) => unlockHint(card.catalogId, snapshot);
  const ownershipNote = (card: CardEntry) => {
    if (snapshot.mode === "open-dojo") return "On loan in Open Dojo.";
    if (snapshot.mode === "career") return snapshot.owns(card.catalogId) ? "In your collection." : `Not in your collection yet: ${hintFor(card)}.`;
    if (snapshot.owns(card.catalogId)) return "Issued to a new recruit.";
    return unsealed.has(card.catalogId) ? "Unsealed in this preview, not collected." : "Sealed in this preview.";
  };
  const pendingKits = realPacks && snapshot.career ? economy.pendingKitChoices(snapshot.career) : 0;
  const featured = useMemo(() => pickBySeed(ALL_CARDS.filter((card) => hasArt(card) && isFeaturable(card)), dayNumber()), [hasArt]);
  const activeCard = cardId ? ALL_CARDS.find((card) => card.catalogId.toLocaleLowerCase() === cardId.toLocaleLowerCase()) ?? null : null;

  const cardsInScope = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const sourceIds = sourceFilter ? SOURCE_MEMBERS.get(sourceFilter) : undefined;
    return ALL_CARDS.filter((card) => (deck === ALL || card.deck === deck)
      && (!sourceIds || sourceIds.has(card.catalogId))
      && (!term || cardSearchText(card).includes(term)));
  }, [query, deck, sourceFilter]);
  const typeCounts = useMemo(() => countBy(cardsInScope.map((card) => card.cardType)), [cardsInScope]);
  const typedCards = useMemo(() => cardsInScope.filter((card) => (type === ALL || card.cardType === type) && (!binderOnly || savedIds.has(card.catalogId))), [cardsInScope, type, binderOnly, savedIds]);
  const subtypeCounts = useMemo(() => countBy(typedCards.map((card) => card.subtype)), [typedCards]);
  const timingCounts = useMemo(() => countBy(typedCards.map((card) => card.timing)), [typedCards]);
  const focusCostCounts = useMemo(() => countBy(typedCards.map((card) => Number.isFinite(numeric(card.fpCost)) ? numeric(card.fpCost) : null)), [typedCards]);
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
      return a.name.localeCompare(b.name);
    }), [typedCards, subtype, timing, focusCost, sort]);

  const activeIndex = activeCard ? filtered.findIndex((card) => card.id === activeCard.id) : -1;
  const previousCard = activeIndex > 0 ? filtered[activeIndex - 1] : null;
  const nextCard = activeIndex >= 0 && activeIndex < filtered.length - 1 ? filtered[activeIndex + 1] : null;
  const related = useMemo(() => activeCard ? relatedCards(activeCard, ALL_CARDS) : [], [activeCard]);
  const activeSource = UNLOCK_SOURCES.find((source) => source.id === sourceFilter);

  const restartPaging = () => setVisible(PAGE_SIZE);
  const resetSecondaryFilters = () => { setSubtype(ALL); setTiming(ALL); setFocusCost(ALL); };
  const resetFilters = () => { setQuery(""); setType(ALL); setDeck(ALL); setSourceFilter(""); resetSecondaryFilters(); setBinderOnly(false); restartPaging(); };
  const filtersActive = Boolean(query || sourceFilter || binderOnly) || [type, deck, subtype, timing, focusCost].some((value) => value !== ALL);
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
  // With a career the view is the player's Open Dojo switch, so it also decides what matches use and pay.
  const changeView = (next: CollectionView) => {
    if (next === view) return;
    setUnsealed(new Set());
    setCeremony(null);
    if (careerView) careerStore.setOpenDojo(next === "open-dojo"); else setLocalView(next);
    if (next === "open-dojo") pushToast({ kind: "note", eyebrow: "Collection ledger", title: "Open Dojo", message: careerView ? "Every card is on loan. Matches use the full catalog and earn nothing until you switch back." : "Every card is on loan again.", duration: 3600 });
    else if (careerView) pushToast({ kind: "stamp", eyebrow: "Collection ledger", title: "My Collection", message: "Matches deal from your own cards and pay Merit and Booster Tickets.", duration: 3600 });
    else pushToast({ kind: "stamp", eyebrow: "Preview only", title: "New recruit view", message: "This browser is not keeping records, so this previews a brand-new profile. Nothing is locked or saved.", duration: 4200 });
  };
  const chooseKit = (kitId: string) => {
    const kit = economy.kits.find((entry) => entry.id === kitId);
    careerStore.chooseStarterKit(kitId);
    pushToast({ kind: "stamp", eyebrow: "Requisition approved", title: `${kit?.name ?? "Starter Kit"} issued`, message: `${kit?.cards.length ?? 0} cards filed to your collection. They join your Market from the next match.`, duration: 4200 });
  };
  const browseKit = (kitId: string) => {
    setSourceFilter(kitId);
    restartPaging();
    window.requestAnimationFrame(() => gridRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }));
  };
  const chooseSource = (sourceId: string) => {
    setSourceFilter((current) => current === sourceId ? "" : sourceId);
    restartPaging();
    window.requestAnimationFrame(() => gridRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }));
  };
  // A real pack spends a ticket and is saved before the ceremony plays; a preview pack only unseals for this visit.
  const ripPack = (source: UnlockSource, mustInclude?: string) => {
    const nextNumber = (current: typeof ceremony) => current?.source.id === source.id ? current.number + 1 : 1;
    if (realPacks) {
      const firstPack = (snapshot.career?.packSerial ?? 0) === 0;
      const opened = careerStore.openBooster(source.id);
      if (opened.error) { pushToast(PACK_REFUSALS[opened.error] ?? PACK_REFUSALS.locked); return; }
      if (firstPack) requestPersistentStorage();
      setCeremony((current) => ({ source, catalogIds: opened.cards, number: nextNumber(current), mode: "career" }));
      return;
    }
    const catalogIds = drawPreviewPack(source, isSealedId, mustInclude);
    if (!catalogIds.length) return;
    setUnsealed((current) => new Set([...current, ...catalogIds]));
    setCeremony((current) => ({ source, catalogIds, number: nextNumber(current), mode: "preview" }));
  };
  const ripFromDossier = (card: CardEntry) => {
    const source = sourceFor(card.catalogId);
    if (!source) return;
    closeCard();
    // A real pack is random within its series; only the free preview pins the card you opened it from.
    ripPack(source, realPacks ? undefined : card.catalogId);
  };
  const envelopeRip = (card: CardEntry): EnvelopeRip | undefined => {
    const source = sourceFor(card.catalogId);
    if (source?.kind !== "booster" || snapshot.series.get(source.id)?.unlocked === false) return undefined;
    if (!realPacks) return { label: `Rip open a ${source.name} pack`, note: "Free preview: nothing is saved.", onRip: () => ripFromDossier(card) };
    return tickets
      ? { label: `Spend a ticket on a ${source.name} pack`, note: `${CARDS_PER_PACK_LABEL} you do not own yet, drawn from this series. You hold ${tickets} ${tickets === 1 ? "ticket" : "tickets"}.`, onRip: () => ripFromDossier(card) }
      : { label: "No Booster Tickets yet", note: "Win a match for a ticket; a loss earns a Ticket Stub.", disabled: true, onRip: () => undefined };
  };
  const breakEverySeal = () => {
    const everything = new Set(UNLOCK_SOURCES.flatMap((source) => source.catalogIds));
    const finish = () => { setUnsealed(everything); setUnsealing(false); };
    pushToast({ kind: "stamp", eyebrow: "Preview only", title: "Every seal broken", message: "The whole catalog is open for this visit. Re-seal to start over.", duration: 3200 });
    if (prefersReducedMotion()) return finish();
    setUnsealing(true);
    window.setTimeout(finish, PAGE_SIZE * 40 + 520);
  };
  const ledgerActions: LedgerActions = {
    sealedIn: (source) => source.catalogIds.filter(isSealedId).length,
    anySealed: UNLOCK_SOURCES.some((source) => source.catalogIds.some(isSealedId)),
    anyUnsealed: unsealed.size > 0,
    onRip: (source) => ripPack(source),
    onBreakAll: breakEverySeal,
    onReseal: () => setUnsealed(new Set()),
  };
  // The preview ledger counts cards unsealed this visit as held, so the meters fill as packs are opened.
  const ledgerSnapshot: CollectionSnapshot = snapshot.mode === "preview" ? { ...snapshot, owns: (catalogId) => snapshot.owns(catalogId) || unsealed.has(catalogId) } : snapshot;
  const ceremonyRemaining = ceremony ? ceremony.source.catalogIds.filter(isSealedId).length : 0;

  return <main className="page-shell shell card-library-page"><SectionHeader eyebrow="Card Library" title={`${cardData.total} cards. One awkward curriculum.`} intro="Search the complete Core catalog by ID, deck, type, rules text, or Focus Cost. The 500-card main pool excludes Starter, Character, and Boss-module cards." art={headerArt} />
    <div className="library-desk">
      <DailyFiling card={featured} art={art} onOpen={() => openCard(featured)} onRandom={openRandom} />
      <CollectionLedger snapshot={ledgerSnapshot} viewLocked={career.status === "everything"} sourceFilter={sourceFilter} onView={changeView} onSource={chooseSource} actions={ledgerActions} />
    </div>
    {pendingKits > 0 && !kitDeferred && snapshot.career && <StarterKitRequisition career={snapshot.career} art={art} onChoose={chooseKit} onBrowse={browseKit} onLater={() => setKitDeferred(true)} />}
    <section className={`library-controls${moreFilters ? " is-expanded" : ""}`} aria-label="Search and filter cards">
      <div className="library-control library-search-control"><label htmlFor="card-library-search">Search</label><div className="search-box"><span aria-hidden="true">⌕</span><input id="card-library-search" value={query} onChange={(event) => { setQuery(event.target.value); restartPaging(); }} placeholder="ID, name, rules, tag…" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear card search">×</button>}</div></div>
      <label className="library-control"><span>Deck</span><select value={deck} onChange={(event) => { setDeck(event.target.value); resetSecondaryFilters(); restartPaging(); }}><option>{ALL}</option>{cardData.decks.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
      <button type="button" className="library-more-filters" aria-expanded={moreFilters} aria-controls="library-secondary-filters" onClick={() => setMoreFilters((current) => !current)}>{moreFilters ? "Fewer filters" : "More filters"}</button>
      <div className="library-secondary-filters" id="library-secondary-filters">
        <label className="library-control"><span>Subtype</span><select value={subtype} onChange={(event) => { setSubtype(event.target.value); restartPaging(); }} disabled={!subtypeOptions.length}><option value={ALL}>All subtypes</option>{subtypeOptions.map((entry) => <option value={entry} key={entry}>{entry} ({subtypeCounts[entry]})</option>)}</select></label>
        <label className="library-control"><span>Timing</span><select value={timing} onChange={(event) => { setTiming(event.target.value); restartPaging(); }} disabled={!timingOptions.length}><option value={ALL}>All timings</option>{timingOptions.map((entry) => <option value={entry} key={entry}>{entry} ({timingCounts[entry]})</option>)}</select></label>
        <label className="library-control"><span>Focus Cost</span><select value={focusCost} onChange={(event) => { setFocusCost(event.target.value); restartPaging(); }} disabled={!focusCostOptions.length}><option value={ALL}>Any cost</option>{focusCostOptions.map((entry) => <option value={entry} key={entry}>{entry} Focus ({focusCostCounts[entry]})</option>)}</select></label>
        <label className="library-control"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="catalog">Catalog order</option><option value="name">Name A–Z</option><option value="deck">Deck</option><option value="type">Card type</option><option value="focus">Focus Cost</option></select></label>
      </div>
    </section>
    <div className="binder-strip"><button type="button" className={`binder-toggle${binderOnly ? " is-saved" : ""}`} aria-pressed={binderOnly} onClick={() => { setBinderOnly((current) => !current); restartPaging(); }}><span aria-hidden="true">{binderOnly ? "★" : "☆"}</span> Dojo Binder <b>{savedIds.size}</b></button><p>Saved on this device only. Open a card to add or remove it.</p></div>
    <div className="type-filters" role="group" aria-label="Filter by card type">{[ALL, ...Object.keys(cardData.counts)].map((entry) => <button type="button" aria-pressed={type === entry} className={type === entry ? "active" : ""} onClick={() => { setType(entry); resetSecondaryFilters(); restartPaging(); }} key={entry}>{entry}<span>{entry === ALL ? cardsInScope.length : typeCounts[entry] ?? 0}</span></button>)}</div>
    <div className="result-line" aria-live="polite"><p><strong>{filtered.length}</strong> results{activeSource && <span className="result-pack-chip">in {activeSource.name} <button type="button" onClick={() => setSourceFilter("")} aria-label={`Clear ${activeSource.name} filter`}>×</button></span>}</p>{filtersActive && <button type="button" onClick={resetFilters}>Reset filters</button>}</div>
    {filtered.length ? <><section ref={gridRef} className="card-grid" aria-label="Cards">{filtered.slice(0, visible).map((card, index) => <CardTile key={card.id} card={card} art={art} index={index} saved={savedIds.has(card.catalogId)} sealed={isSealed(card)} hint={hintFor(card)} unsealing={unsealing} onOpen={() => openCard(card)} />)}</section>{visible < filtered.length && <button type="button" className="button load-more" onClick={() => setVisible((count) => count + PAGE_SIZE)}>Load {PAGE_SIZE} more <span>{filtered.length - visible} remaining</span></button>}</> : <div className="empty-state"><strong>No cards match that search.</strong><p>Clear a filter or try a broader rules term.</p><button type="button" className="button ghost" onClick={resetFilters}>Reset filters</button></div>}
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
      stageOverlay={isSealed(activeCard) ? <SealedEnvelope key={activeCard.id} card={activeCard} hint={hintFor(activeCard)} rip={envelopeRip(activeCard)} /> : null}
    /></Suspense>}
    {ceremony && <PackCeremony
      source={ceremony.source}
      cards={ceremony.catalogIds.flatMap((catalogId) => CARDS_BY_ID.get(catalogId) ?? [])}
      packNumber={ceremony.number}
      remaining={ceremonyRemaining}
      mode={ceremony.mode}
      tickets={tickets}
      imageUrlFor={imageUrlFor}
      onKeepGoing={() => ripPack(ceremony.source)}
      onDone={() => setCeremony(null)}
    />}
  </main>;
}

const CARDS_BY_ID = new Map(ALL_CARDS.map((card) => [card.catalogId, card]));
const CARDS_PER_PACK_LABEL = `Up to ${economy.cardsPerPack} cards`;
const PACK_REFUSALS: Record<string, ToastInput> = {
  "no-ticket": { kind: "warning", eyebrow: "Booster Tickets", title: "No ticket on file", message: "Win a match for a Booster Ticket. A loss earns a Ticket Stub; three stubs make a ticket.", duration: 4200 },
  locked: { kind: "warning", eyebrow: "Booster series", title: "Series not open yet", message: "This series opens at a higher Clearance Level.", duration: 3600 },
  complete: { kind: "note", eyebrow: "Booster series", title: "Series complete", message: "You own every card in this series.", duration: 3200 },
  "no-career": { kind: "warning", eyebrow: "Records office", title: "Nothing was saved", message: "This browser is not keeping records right now.", duration: 3600 },
};

/** Ask the browser to keep the career (Safari otherwise clears script storage after a week away). */
function requestPersistentStorage() {
  try { void navigator.storage?.persist?.().catch(() => undefined); } catch { /* optional: storage stays best-effort */ }
}
const SOURCE_MEMBERS = new Map(UNLOCK_SOURCES.map((source) => [source.id, new Set(source.catalogIds)]));

function countBy(values: (string | number | null | undefined)[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    const label = value === null || value === undefined ? "" : String(value).trim();
    if (label && label !== "—") counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});
}
