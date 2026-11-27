// Where the player stands in the career, as plain data (no React): read by the shell, Home, setup and the
// Collection page, and unit tested. Numbers come from the career store and the level track in content/packs.json.
import cardsJson from "./data/cards.json" with { type: "json" };
import { economy, walletOf, type CareerSnapshot, type LevelProgress, type Reward } from "./career.ts";

export type CareerSummary = {
  level: number;
  merit: number;
  progress: LevelProgress;
  /** 0..1 through the current level. */
  fraction: number;
  tickets: number;
  stubs: number;
  stubRate: number;
  diploma: string;
  nextLevel: { level: number; merit: number; rewards: Reward[] } | null;
  owned: number;
  total: number;
  openDojo: boolean;
  readOnly: boolean;
};

const CATALOG_SIZE = (cardsJson as unknown as { cards: unknown[] }).cards.length;

/** Where the player stands, or null when there is no career to show (everything unlocked, or storage blocked). */
export function summarizeCareer(snapshot: CareerSnapshot): CareerSummary | null {
  const state = snapshot.state;
  if (!state || (snapshot.status !== "career" && snapshot.status !== "read-only")) return null;
  const progress = economy.levelProgress(state.merit);
  const wallet = walletOf(state);
  const next = economy.levels.find((entry) => entry.level === progress.level + 1) ?? null;
  return {
    level: progress.level,
    merit: state.merit,
    progress,
    fraction: progress.span ? Math.max(0, Math.min(1, progress.into / progress.span)) : 1,
    tickets: wallet.tickets,
    stubs: wallet.stubs,
    stubRate: wallet.stubRate,
    diploma: economy.diplomaFor(progress.level).name,
    nextLevel: next ? { level: next.level, merit: next.meritTotal, rewards: next.rewards } : null,
    owned: Math.min(CATALOG_SIZE, economy.ownedCards(state).size),
    total: CATALOG_SIZE,
    openDojo: Boolean(state.openDojo),
    readOnly: snapshot.status === "read-only",
  };
}
