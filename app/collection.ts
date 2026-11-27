// Card collection read model (presentation only).
//
// The single place the website asks "where does this card come from?" and "does this player own it?".
// Cards are unlocked by playing, never bought. There are two kinds of unlock source:
//   - packs from content/packs.json: starter kits and themed booster series whose
//     5-card packs only ever hold cards you do not own yet;
//   - rosters: every Character and every Boss Profile, which unlock with Clearance Levels and series.
// Ownership comes from the career store (app/career.ts) through one of two views:
//   - "career" (My Collection): the player's own cards. Without a working career (storage blocked, or a
//     record from a newer version) it becomes a free preview of a brand-new profile, never saved.
//   - "open-dojo": the full catalog is on loan. Everything is owned and matches earn nothing.
// Pages call readCollection() and never learn where ownership came from.
import packsJson from "../content/packs.json";
import cardsJson from "./data/cards.json";
import { economy, type CareerSnapshot, type CareerState, type SeriesStatus } from "./career";

export type UnlockSourceKind = "starter" | "booster" | "roster";
export type UnlockSource = {
  id: string;
  kind: UnlockSourceKind;
  name: string;
  tagline: string;
  /** "every-profile" sources are issued on day one. */
  grant?: string;
  /** Clearance Level at which a booster series opens, from the level track. */
  unlockLevel?: number;
  catalogIds: string[];
};
export type CollectionView = "career" | "open-dojo";
/** "career": a saved collection. "preview": a new recruit's collection, nothing saved. "open-dojo": everything. */
export type CollectionMode = "career" | "preview" | "open-dojo";
export type CollectionSnapshot = {
  view: CollectionView;
  mode: CollectionMode;
  label: string;
  summary: string;
  owns: (catalogId: string) => boolean;
  /** The career behind the view (a throwaway recruit in preview, null in Open Dojo). */
  career: CareerState | null;
  /** Per-series state for the career or preview profile. */
  series: Map<string, SeriesStatus>;
};
export type SourceProgress = { source: UnlockSource; owned: number; total: number; locked: boolean };

type RawRoster = { deck: string; starting: { catalogId: string }[] };
type RawPacks = {
  status: string;
  unlockables: { characters: RawRoster; bosses: RawRoster };
  boosterRules: { cardsPerPack: number };
  levelTrack: { levels: { level: number; rewards: { kind: string; pack?: string }[] }[] };
  packs: { id: string; kind: "starter" | "booster"; name: string; tagline: string; grant?: string; cards: { catalogId: string }[] }[];
};
type RawCard = { catalogId: string; deck: string; catalogOrder: number };

const raw = packsJson as unknown as RawPacks;
const cards = (cardsJson as unknown as { cards: RawCard[] }).cards;

/** "proposal" until the owner approves pack membership; the ledger says "draft packs" while it is. */
export const COLLECTION_STATUS = raw.status;

const unlockLevelByPack = new Map<string, number>();
raw.levelTrack.levels.forEach(({ level, rewards }) => rewards.forEach((reward) => {
  if (reward.kind === "unlock-booster" && reward.pack && !unlockLevelByPack.has(reward.pack)) unlockLevelByPack.set(reward.pack, level);
}));

const rosterIds = (deck: string) => cards.filter((card) => card.deck === deck).sort((a, b) => a.catalogOrder - b.catalogOrder).map((card) => card.catalogId);

const { characters, bosses } = raw.unlockables;
const ROSTERS: UnlockSource[] = [
  { id: "roster-fighters", kind: "roster", name: "Fighter roster", tagline: "More fighters report for duty as you play.", catalogIds: rosterIds(characters.deck) },
  { id: "roster-bosses", kind: "roster", name: "Boss profiles", tagline: "Oversized problems, cleared for your table as you play.", catalogIds: rosterIds(bosses.deck) },
];

export const UNLOCK_SOURCES: UnlockSource[] = [
  ...raw.packs.map((pack) => ({
    id: pack.id,
    kind: pack.kind,
    name: pack.name,
    tagline: pack.tagline,
    grant: pack.grant,
    unlockLevel: unlockLevelByPack.get(pack.id),
    catalogIds: pack.cards.map((card) => card.catalogId),
  })),
  ...ROSTERS,
];

const SOURCE_BY_CARD = new Map<string, UnlockSource>();
UNLOCK_SOURCES.forEach((source) => source.catalogIds.forEach((catalogId) => SOURCE_BY_CARD.set(catalogId, source)));

/** Where a card is unlocked from. Undefined means standard issue: the Starter Deck and Boss decks. */
export const sourceFor = (catalogId: string): UnlockSource | undefined => SOURCE_BY_CARD.get(catalogId);
export const isUnlockable = (catalogId: string) => SOURCE_BY_CARD.has(catalogId);

/** A brand-new profile, for the preview view: built by the same economy, never saved. */
const RECRUIT = economy.newCareer({ profileId: "preview", createdAt: "", rngSeed: 1 });

function ownership(state: CareerState) {
  const owned = economy.ownedCards(state);
  const roster = economy.unlockedRoster(state);
  return (catalogId: string) => !SOURCE_BY_CARD.has(catalogId) || owned.has(catalogId) || roster.characters.has(catalogId) || roster.bosses.has(catalogId);
}

const seriesMap = (state: CareerState) => new Map(economy.seriesStatus(state).map((series) => [series.id, series]));

const OPEN_DOJO: CollectionSnapshot = {
  view: "open-dojo",
  mode: "open-dojo",
  label: "Open Dojo",
  summary: "The full catalog is on loan: every card, fighter and Boss. Matches played in Open Dojo use everything and earn nothing.",
  owns: () => true,
  career: null,
  series: new Map(),
};

const careerCache = new WeakMap<CareerState, CollectionSnapshot>();

/** The view for a career snapshot. Open Dojo ignores the career; My Collection reads it (or previews). */
export function readCollection(view: CollectionView, career: CareerSnapshot): CollectionSnapshot {
  if (view === "open-dojo" || career.status === "everything") return OPEN_DOJO;
  if (career.status === "career" && career.state) {
    const cached = careerCache.get(career.state);
    if (cached) return cached;
    const snapshot: CollectionSnapshot = {
      view: "career",
      mode: "career",
      label: "My Collection",
      summary: "Your own cards, kept in this browser. Matches deal the Market, Combos and Locations from these cards and pay Merit and Booster Tickets. Rip packs to add cards you do not own yet.",
      owns: ownership(career.state),
      career: career.state,
      series: seriesMap(career.state),
    };
    careerCache.set(career.state, snapshot);
    return snapshot;
  }
  const state = career.status === "read-only" && career.state ? career.state : RECRUIT;
  return {
    view: "career",
    mode: "preview",
    label: career.status === "read-only" ? "My Collection · read only" : "New recruit preview",
    summary: career.status === "read-only"
      ? "This record was saved by a newer version of Paper-Fu, so it is shown read-only and never overwritten. Export it from Settings. Packs opened here are a free preview."
      : `This browser is not keeping records, so this is a preview of a brand-new profile: the Starter Deck, the Orientation Kit, ${characters.starting.length} fighters and ${bosses.starting.length} Bosses. Packs opened here are free and nothing is saved.`,
    owns: ownership(state),
    career: state,
    series: seriesMap(state),
  };
}

/** Per-source ownership for the ledger. A booster series above the profile's Clearance Level reads as locked. */
export function sourceProgress(snapshot: CollectionSnapshot): SourceProgress[] {
  return UNLOCK_SOURCES.map((source) => ({
    source,
    owned: source.catalogIds.filter(snapshot.owns).length,
    total: source.catalogIds.length,
    locked: source.kind === "booster" && snapshot.mode !== "open-dojo" && snapshot.series.get(source.id)?.unlocked === false,
  }));
}

/** How a locked card, Character or Boss is obtained, in one line for envelopes and the Dossier. */
export function unlockHint(catalogId: string, snapshot: CollectionSnapshot): string {
  const source = economy.unlockSource(catalogId);
  if (source.kind === "booster") {
    const series = snapshot.series.get(source.series);
    return series && !series.unlocked ? `${source.seriesName} series · opens at Clearance Level ${source.level}` : `${source.seriesName} series · Rip a pack`;
  }
  if (source.kind === "level") return `Unlocks at Clearance Level ${source.level}`;
  if (source.kind === "series") return `Complete ${source.seriesName} to unlock`;
  if (source.kind === "starter-kit") return `${source.packName} · choose it as a Starter Kit`;
  if (source.kind === "every-profile") return `${source.packName} · issued on day one`;
  return "Standard issue";
}

/** Cards per booster pack. Packs only ever hold cards you do not own yet; the last pack holds what is left. */
export const CARDS_PER_PACK = raw.boosterRules.cardsPerPack;

/**
 * A preview pack: up to CARDS_PER_PACK still-sealed cards from one booster series, in catalog order once
 * drawn. Preview only, so it uses the browser's randomness; real packs are rolled from the profile seed
 * by the career store. `mustInclude` puts a specific sealed card in the pack (opening from its Dossier).
 */
export function drawPreviewPack(source: UnlockSource, isSealed: (catalogId: string) => boolean, mustInclude?: string, random = Math.random): string[] {
  const sealed = source.catalogIds.filter(isSealed);
  const pinned = mustInclude && sealed.includes(mustInclude) ? [mustInclude] : [];
  const pool = sealed.filter((catalogId) => !pinned.includes(catalogId));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  const pack = new Set([...pinned, ...pool.slice(0, CARDS_PER_PACK - pinned.length)]);
  return source.catalogIds.filter((catalogId) => pack.has(catalogId));
}
