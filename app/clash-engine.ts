// Browser loader for the canonical headless engine, used by the Standard Clash table.
// Builds the same data object engine/rules-loader.mjs builds in Node, from the generated JSON.
import definition from "./data/game-definition.json" with { type: "json" };
import catalog from "./data/cards.json" with { type: "json" };
import rules from "./data/rules.json" with { type: "json" };
import cardEffects from "./data/card-effects.json" with { type: "json" };
import comboRequirements from "./data/combo-requirements.json" with { type: "json" };
import { Game } from "../engine/core.mjs";

export type EngineCard = { id: string; catalogId: string; name: string; cardType: string; subtype?: string; zone?: string; rulesText?: string | null; stats: Record<string, string>; fpCost?: number | string; focusValue?: number | string; image?: string; instanceId?: string; tags?: string[] };

let cached: Record<string, unknown> | null = null;

export function clashData() {
  if (cached) return cached;
  const cards = (catalog as unknown as { cards: EngineCard[] }).cards;
  cached = {
    definition,
    cards,
    rules,
    cardEffects,
    cardEffectById: new Map(Object.entries((cardEffects as unknown as { cards: Record<string, unknown> }).cards ?? {})),
    comboRequirements,
    byId: new Map(cards.map((card) => [card.catalogId, card])),
  };
  return cached;
}

export const clashCardByCatalogId = (catalogId: string) => (clashData().byId as Map<string, EngineCard>).get(catalogId);

export type ClashSetup = { fighterId: string; opponents: number; seed?: number };

/** A seeded Standard Clash game: seat 0 is the human, the rest are engine bots. */
export function createClashGame({ fighterId, opponents, seed }: ClashSetup) {
  const data = clashData();
  const cards = data.cards as EngineCard[];
  const fighters = cards.filter((card) => card.cardType === "Character");
  const human = fighters.find((card) => card.id === fighterId || card.catalogId === fighterId) ?? fighters[0];
  const pool = fighters.filter((card) => card.catalogId !== human.catalogId);
  const runSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  let state = runSeed >>> 0;
  const next = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
  for (let index = pool.length - 1; index > 0; index -= 1) { const swap = Math.floor(next() * (index + 1)); [pool[index], pool[swap]] = [pool[swap], pool[index]]; }
  const strategies = ["balanced", ...Array.from({ length: opponents }, (_, index) => ["balanced", "aggression", "economy", "fortress"][(index + Math.floor(next() * 4)) % 4])];
  return new Game(data, { seed: runSeed, mode: "standard-clash", players: opponents + 1, characters: [human, ...pool.slice(0, opponents)], strategies });
}
