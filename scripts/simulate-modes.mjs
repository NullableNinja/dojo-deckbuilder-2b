// Seeded simulations for every executable roster/multiplayer mode.
//   node scripts/simulate-modes.mjs [games=200] [mode=all]
// Reports completion, winners, reasons, rounds, KOs, tags, invariant failures and stuck games.
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game } from "../engine/core.mjs";
import { baselinePolicy } from "../engine/policies.mjs";
import { STRATEGIES } from "../engine/bots.mjs";

const games = Number(process.argv[2] ?? 200);
const only = process.argv[3] ?? "all";
const data = await loadGameData();
const fighters = data.cards.filter((card) => card.cardType === "Character").map((card) => card.catalogId);
// Deterministic per-seed roster draw so every seat sees every fighter across a batch.
const rostersFor = (seed, players, size) => {
  let state = (seed * 2654435761) >>> 0; const next = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
  const pool = [...fighters]; for (let index = pool.length - 1; index > 0; index -= 1) { const swap = Math.floor(next() * (index + 1)); [pool[index], pool[swap]] = [pool[swap], pool[index]]; }
  return Array.from({ length: players }, (_, seat) => pool.slice(seat * size, seat * size + size));
};

const configs = [
  { label: "standard-clash 2p", mode: "standard-clash", players: 2 },
  { label: "standard-clash 3p", mode: "standard-clash", players: 3 },
  { label: "standard-clash 4p", mode: "standard-clash", players: 4 },
  { label: "standard-clash 6p", mode: "standard-clash", players: 6 },
  { label: "tag-team 2p", mode: "tag-team", players: 2 },
  { label: "tag-team 3p", mode: "tag-team", players: 3 },
  { label: "tag-team 2v2 dojo war", mode: "tag-team", teams: [[0, 2], [1, 3]] },
].filter((config) => only === "all" || config.mode === only);

let failed = false;
for (const config of configs) {
  const tally = { games: 0, complete: 0, reasons: {}, seats: {}, rounds: [], knockouts: 0, tags: 0, eliminations: 0, blackBelt: 0, invariantFailures: 0, errors: [] };
  for (let seed = 1; seed <= games; seed += 1) {
    tally.games += 1;
    const players = config.players ?? config.teams.flat().length;
    const strategies = Array.from({ length: players }, (_, index) => STRATEGIES[(seed + index * 3) % STRATEGIES.length]);
    try {
      const size = data.definition.modes.find((mode) => mode.id === config.mode).roster.size;
      const game = new Game(data, { seed, strategies, mode: config.mode, players: config.players, teams: config.teams, rosters: rostersFor(seed, players, size) });
      const result = game.run({ policy: baselinePolicy, maxSteps: 200000 });
      tally.complete += result.winner !== null ? 1 : 0;
      tally.reasons[result.reason] = (tally.reasons[result.reason] ?? 0) + 1;
      tally.seats[result.winner] = (tally.seats[result.winner] ?? 0) + 1;
      tally.rounds.push(result.rounds);
      tally.knockouts += result.events.filter((event) => event.type === "knockout").length;
      tally.tags += result.events.filter((event) => event.type === "tag").length;
      tally.eliminations += result.events.filter((event) => event.type === "elimination").length;
      tally.invariantFailures += result.invariantFailures.length;
      if (result.invariantFailures.length && tally.errors.length < 3) tally.errors.push(`seed ${seed}: ${result.invariantFailures[0]}`);
    } catch (error) {
      if (tally.errors.length < 3) tally.errors.push(`seed ${seed}: ${error.message.split("\n")[0]}`);
    }
  }
  const rounds = tally.rounds.sort((left, right) => left - right);
  const summary = {
    mode: config.label, games: tally.games, completed: tally.complete, reasons: tally.reasons, winsBySeat: tally.seats,
    rounds: rounds.length ? { min: rounds[0], median: rounds[Math.floor(rounds.length / 2)], max: rounds.at(-1) } : null,
    perGame: { knockouts: +(tally.knockouts / games).toFixed(2), tags: +(tally.tags / games).toFixed(2), eliminations: +(tally.eliminations / games).toFixed(2) },
    invariantFailures: tally.invariantFailures, errors: tally.errors,
  };
  if (tally.complete !== tally.games || tally.invariantFailures || tally.errors.length) failed = true;
  console.log(JSON.stringify(summary));
}
process.exitCode = failed ? 1 : 0;
