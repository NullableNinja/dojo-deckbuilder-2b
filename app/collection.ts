// Card collection read model (presentation only).
//
// The single place the website asks "where does this card come from?" and "does this player own it?".
// Cards are unlocked by playing, never bought. There are two kinds of unlock source:
//   - packs from content/packs.json: starter kits and themed booster series whose
//     5-card packs only ever hold cards you do not own yet;
//   - rosters: every Character and every Boss Profile, which will also unlock over time.
// Real career progress does not exist yet, so ownership is one of two clearly labelled views:
//   - "open-dojo": the full catalog is on loan. Everything is owned. This is the default.
//   - "recruit-preview": what a brand-new profile might hold. A preview, never saved.
// When the career store lands (docs/packs-and-progression-plan.md, phase 3), add a "career" view here that
// reads it; pages keep calling readCollection() and never learn where ownership came from.
import packsJson from "../content/packs.json";
import cardsJson from "./data/cards.json";

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
export type CollectionView = "open-dojo" | "recruit-preview";
export type CollectionSnapshot = {
  view: CollectionView;
  label: string;
  summary: string;
  owns: (catalogId: string) => boolean;
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

/** A new profile holds every day-one pack plus the starting fighters and bosses named in packs.json. */
const RECRUIT_OWNED = new Set([
  ...UNLOCK_SOURCES.filter((source) => source.grant === "every-profile").flatMap((source) => source.catalogIds),
  ...characters.starting.map((entry) => entry.catalogId),
  ...bosses.starting.map((entry) => entry.catalogId),
]);

const SNAPSHOTS: Record<CollectionView, CollectionSnapshot> = {
  "open-dojo": {
    view: "open-dojo",
    label: "Open Dojo",
    summary: "The full catalog is on loan. Unlocks are not switched on yet, so every card, fighter and boss is yours to read.",
    owns: () => true,
  },
  "recruit-preview": {
    view: "recruit-preview",
    label: "New recruit preview",
    summary: `A preview of a brand-new profile: the Starter Deck, the Orientation Kit, ${characters.starting.length} fighters and ${bosses.starting.length} bosses. Everything else unlocks by playing. Nothing is saved and nothing is locked.`,
    owns: (catalogId) => !SOURCE_BY_CARD.has(catalogId) || RECRUIT_OWNED.has(catalogId),
  },
};

export function readCollection(view: CollectionView = "open-dojo"): CollectionSnapshot {
  return SNAPSHOTS[view];
}

/** Per-source ownership for the ledger. A booster above level 1 reads as locked in the recruit preview. */
export function sourceProgress(snapshot: CollectionSnapshot): SourceProgress[] {
  return UNLOCK_SOURCES.map((source) => ({
    source,
    owned: source.catalogIds.filter(snapshot.owns).length,
    total: source.catalogIds.length,
    locked: snapshot.view === "recruit-preview" && (source.unlockLevel ?? 1) > 1,
  }));
}

/** Cards per booster pack. Packs only ever hold cards you do not own yet; the last pack holds what is left. */
export const CARDS_PER_PACK = raw.boosterRules.cardsPerPack;

/**
 * A preview pack: up to CARDS_PER_PACK still-sealed cards from one booster series, in catalog order once
 * drawn. Preview only, so it uses the browser's randomness; real packs will be rolled from the profile seed.
 * `mustInclude` puts a specific sealed card in the pack (opening a pack from that card's Dossier).
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
