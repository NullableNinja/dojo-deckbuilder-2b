import { Game } from "./core.mjs";
import { BossBlitzGame } from "./boss-blitz.mjs";
import { ArenaGame } from "./arena-rules.mjs";

/** Build the right engine for a canonical mode id (Boss Blitz needs its Boss seat; the "arena" variant adds draft effects). */
export function createModeGame(data, config = {}) {
  const mode = config.mode ?? config.setup?.mode ?? null;
  if (config.variant === "arena") return new ArenaGame(data, config);
  return mode === "dojo-drama" ? new BossBlitzGame(data, config) : new Game(data, config);
}
