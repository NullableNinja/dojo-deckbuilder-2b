import { Game } from "./core.mjs";
import { BossBlitzGame } from "./boss-blitz.mjs";

/** Build the right engine for a canonical mode id (Boss Blitz needs its Boss seat). */
export function createModeGame(data, config = {}) {
  const mode = config.mode ?? config.setup?.mode ?? null;
  return mode === "dojo-drama" ? new BossBlitzGame(data, config) : new Game(data, config);
}
