import { Game } from "./core.mjs";
import { BossBlitzGame } from "./boss-blitz.mjs";
import { ArenaGame, withStatusEffects } from "./arena-rules.mjs";
import { experimentsUseStatusEffects, normaliseExperimentsOption } from "./experiments.mjs";

const StatusGame = withStatusEffects(Game);
const StatusBossBlitzGame = withStatusEffects(BossBlitzGame);

/**
 * Build the right engine for a canonical mode id: Boss Blitz needs its Boss seat; the "arena" variant (the Test Arena)
 * and the "status-effects" experiment add the status layer (engine/arena-rules.mjs) on top of either.
 */
export function createModeGame(data, config = {}) {
  const mode = config.mode ?? config.setup?.mode ?? null;
  if (config.variant === "arena") return new ArenaGame(data, config);
  const statuses = experimentsUseStatusEffects(data, normaliseExperimentsOption(config.table?.experiments));
  if (mode === "dojo-drama") return statuses ? new StatusBossBlitzGame(data, config) : new BossBlitzGame(data, config);
  return statuses ? new StatusGame(data, config) : new Game(data, config);
}
