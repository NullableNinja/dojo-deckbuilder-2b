// Card collection read model (presentation only).
//
// The single place the website asks "where does this card come from?" and "does this player own it?".
// Pack membership and rarity come from content/packs.json (status "proposal"). Real career progress does
// not exist yet, so ownership is one of two clearly labelled views:
//   - "open-dojo": the full catalog is on loan. Everything is owned. This is the default.
//   - "recruit-preview": what a brand-new Clearance Level 1 profile would hold. A preview, never saved.
// When the career store lands (docs/packs-and-progression-plan.md, phase 3), add a "career" view here that
// reads it; pages keep calling readCollection() and never learn where ownership came from.
import packsJson from "../content/packs.json";

export type RarityId = "core" | "common" | "uncommon" | "rare" | "legendary";
export type Rarity = { id: RarityId; name: string; summary: string };
export type CollectionPack = {
  id: string;
  kind: "starter" | "booster";
  name: string;
  tagline: string;
  description: string;
  grant?: string;
  /** Clearance Level at which a booster series opens, from the level track. */
  unlockLevel?: number;
  catalogIds: string[];
};
export type Provenance = { pack: CollectionPack; rarity: Rarity };
export type CollectionView = "open-dojo" | "recruit-preview";
export type CollectionSnapshot = {
  view: CollectionView;
  label: string;
  summary: string;
  owns: (catalogId: string) => boolean;
};

type RawPacks = {
  status: string;
  packsRevision: string;
  collection: { collectibleDecks: string[] };
  rarities: Rarity[];
  levelTrack: { levels: { level: number; rewards: { kind: string; pack?: string }[] }[] };
  packs: { id: string; kind: "starter" | "booster"; name: string; tagline: string; description: string; grant?: string; cards: { catalogId: string; rarity: RarityId }[] }[];
};

const raw = packsJson as unknown as RawPacks;

/** "proposal" until the owner approves pack membership. Pages show it so nothing reads as final. */
export const COLLECTION_STATUS = raw.status;
export const COLLECTION_REVISION = raw.packsRevision;
export const RARITIES: Rarity[] = raw.rarities;
const RARITY_BY_ID = new Map(RARITIES.map((rarity) => [rarity.id, rarity]));

const unlockLevelByPack = new Map<string, number>();
raw.levelTrack.levels.forEach(({ level, rewards }) => rewards.forEach((reward) => {
  if (reward.kind === "unlock-booster" && reward.pack && !unlockLevelByPack.has(reward.pack)) unlockLevelByPack.set(reward.pack, level);
}));

export const COLLECTION_PACKS: CollectionPack[] = raw.packs.map((pack) => ({
  id: pack.id,
  kind: pack.kind,
  name: pack.name,
  tagline: pack.tagline,
  description: pack.description,
  grant: pack.grant,
  unlockLevel: unlockLevelByPack.get(pack.id),
  catalogIds: pack.cards.map((card) => card.catalogId),
}));

const PROVENANCE = new Map<string, Provenance>();
raw.packs.forEach((rawPack, index) => rawPack.cards.forEach((card) => {
  const rarity = RARITY_BY_ID.get(card.rarity);
  if (rarity) PROVENANCE.set(card.catalogId, { pack: COLLECTION_PACKS[index], rarity });
}));

const COLLECTIBLE_DECKS = new Set(raw.collection.collectibleDecks);

/** Starter, Character and Boss cards are standard issue for everyone and never collected. */
export const isCollectible = (card: { deck: string }) => COLLECTIBLE_DECKS.has(card.deck);
export const provenanceFor = (catalogId: string): Provenance | undefined => PROVENANCE.get(catalogId);
export const rarityFor = (catalogId: string): Rarity | undefined => PROVENANCE.get(catalogId)?.rarity;

const RECRUIT_OWNED = new Set(COLLECTION_PACKS.filter((pack) => pack.grant === "every-profile").flatMap((pack) => pack.catalogIds));

const SNAPSHOTS: Record<CollectionView, CollectionSnapshot> = {
  "open-dojo": {
    view: "open-dojo",
    label: "Open Dojo",
    summary: "The full catalog is on loan. Collections and Clearance Levels are not switched on yet, so every card is yours to read.",
    owns: () => true,
  },
  "recruit-preview": {
    view: "recruit-preview",
    label: "New recruit preview",
    summary: "A preview of a Clearance Level 1 profile: the Starter Deck and the Orientation Kit. Nothing is saved and nothing is locked.",
    owns: (catalogId) => !PROVENANCE.has(catalogId) || RECRUIT_OWNED.has(catalogId),
  },
};

export function readCollection(view: CollectionView = "open-dojo"): CollectionSnapshot {
  return SNAPSHOTS[view];
}

export type PackProgress = { pack: CollectionPack; owned: number; total: number; locked: boolean };

/** Per-pack ownership for the ledger. A booster above level 1 reads as locked in the recruit preview. */
export function packProgress(snapshot: CollectionSnapshot): PackProgress[] {
  return COLLECTION_PACKS.map((pack) => ({
    pack,
    owned: pack.catalogIds.filter(snapshot.owns).length,
    total: pack.catalogIds.length,
    locked: snapshot.view === "recruit-preview" && (pack.unlockLevel ?? 1) > 1,
  }));
}
