/**
 * A private copy of a running game, for trying a decision without touching the real table
 * (computer look-ahead, and the damage previews shown to players). Rules data is shared
 * read-only; draw piles nobody draws from within a turn are shared by array copy; everything
 * else is cloned, including the random-number state, so the real game's dice never advance.
 */
export const SHARED_KEYS = new Set(["data", "definition", "effects", "mode", "rng", "events", "decisions", "lastPresentedChoice", "cardStats", "marketDeck", "comboDeck", "locationDeck"]);

export function cloneGame(game) {
  const mutable = {};
  for (const [key, value] of Object.entries(game)) if (!SHARED_KEYS.has(key) && typeof value !== "function") mutable[key] = value;
  const copy = Object.assign(Object.create(Object.getPrototypeOf(game)), structuredClone(mutable));
  Object.assign(copy, { data: game.data, definition: game.definition, effects: game.effects, mode: game.mode, events: [], decisions: [], lastPresentedChoice: null, cardStats: new Map() });
  for (const key of ["marketDeck", "comboDeck", "locationDeck"]) copy[key] = Array.isArray(game[key]) ? game[key].slice() : game[key];
  copy.rng = Object.assign(Object.create(Object.getPrototypeOf(game.rng)), game.rng);
  return copy;
}
