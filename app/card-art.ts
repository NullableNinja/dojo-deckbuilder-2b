// Card and fighter artwork lookup (presentation only). Shared by every table and the card pages.
import starterJabArtUrl from "./assets/starter/starter-jab-art-v2.webp";
import highGuardArtUrl from "./assets/starter/high-guard-art-v2.webp";

export type ArtCard = { name: string; catalogId: string; image?: string | null; cardType?: string };

const cardArtModules = import.meta.glob<string>("./assets/cards/{attacks,defenses,katas,consumables,defense-equipment,gear,weapons,reactions,combos,characters,starters,locations,bosses}/*.webp", { eager: true, query: "?url", import: "default" });
const fighterIllustrationModules = import.meta.glob<string>("./assets/fighters/*.webp", { eager: true, query: "?url", import: "default" });

const CARD_ART = Object.fromEntries(Object.entries(cardArtModules).map(([path, url]) => [`/cards/${path.split("/cards/")[1]}`, url]));
const CARD_ART_BY_CATALOG_ID = Object.fromEntries(
  Object.entries(cardArtModules).flatMap(([path, url]) => {
    const match = path.match(/\/(ddb-(?:atk|def|kat|con|deq|gea|wpn|rit|cmb|sta|loc|bat|bdf|btq|bpr|bst)-core-\d{3})_/i);
    return match ? [[match[1].toUpperCase(), url]] : [];
  }),
);
// Two starters have newer full-bleed art than their catalog image.
const STARTER_ART_OVERRIDES: Record<string, string> = { "DDB-STA-CORE-003": starterJabArtUrl, "DDB-STA-CORE-009": highGuardArtUrl };
const FIGHTER_ILLUSTRATION_BY_SLUG = Object.fromEntries(
  Object.entries(fighterIllustrationModules).map(([path, url]) => [path.split("/").at(-1)?.replace(/\.webp$/i, ""), url]),
);

export function presentationSlug(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function artistUrl(card: ArtCard): string | undefined {
  if (card.image && CARD_ART[card.image]) return CARD_ART[card.image];
  return CARD_ART_BY_CATALOG_ID[card.catalogId] ?? STARTER_ART_OVERRIDES[card.catalogId];
}

export function fighterIllustrationUrl(card: ArtCard): string | undefined {
  return FIGHTER_ILLUSTRATION_BY_SLUG[presentationSlug(card.name)];
}

/** Colour family for a Location's stage lighting. */
export function locationTheme(card: { name: string } | null | undefined) {
  const name = card?.name.toLocaleLowerCase() ?? "";
  if (/rink|rain|river/.test(name)) return "cool";
  if (/garage|stairwell|bus/.test(name)) return "concrete";
  if (/library|school|studio/.test(name)) return "civic";
  if (/strip-mall/.test(name)) return "retail";
  return "dojo";
}
