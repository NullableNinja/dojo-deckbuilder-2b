// Difficulty benchmark: pits the engine difficulty policies against each other in Quick Duel
// and prints win rates. Every seed is played twice with the seats swapped, and fighters are
// drawn from the seeded engine RNG, so seat order and Character matchups cancel out.
//   node scripts/difficulty-benchmark.mjs [games=300] [--seed=1]
// Expected ordering: master > certified > student.
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game, Rng } from "../engine/core.mjs";
import { DIFFICULTIES, difficultyPolicy } from "../engine/difficulty.mjs";

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const option = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const games = Math.max(2, Number.parseInt(positional[0] ?? "300", 10) || 300);
const seedStart = Number.parseInt(option("seed", "1"), 10) || 1;

/** One controller for the whole table that asks each seat's own policy. */
export function seatedPolicy(policies) {
  return {
    chooseAction: (game, legal) => policies[game.activePlayer].chooseAction(game, legal),
    chooseChoice: (game, pending) => policies[pending.playerId].chooseChoice(game, pending),
  };
}

function fightersFor(data, seed) {
  const fighters = data.cards.filter((card) => card.cardType === "Character");
  const rng = new Rng(seed * 7919 + 17);
  const first = rng.pick(fighters);
  const second = rng.pick(fighters.filter((card) => card !== first));
  return [first, second];
}

function playMatchup(data, [left, right], count) {
  const tally = { games: 0, wins: { [left]: 0, [right]: 0 }, failures: 0, rounds: 0, roundLimit: 0 };
  const policies = { [left]: difficultyPolicy(left), [right]: difficultyPolicy(right) };
  for (let index = 0; index < count; index += 1) {
    const seed = seedStart + Math.floor(index / 2);
    const seats = index % 2 === 0 ? [left, right] : [right, left];
    const fighters = fightersFor(data, seed);
    try {
      const game = new Game(data, { seed, characters: fighters });
      const result = game.run({ policy: seatedPolicy(seats.map((level) => policies[level])) });
      if (result.invariantFailures.length) tally.failures += 1;
      tally.games += 1; tally.rounds += result.rounds;
      if (result.reason === "round-limit") tally.roundLimit += 1;
      tally.wins[seats[result.winner]] += 1;
    } catch (error) {
      tally.failures += 1;
      console.error(`seed ${seed} ${seats.join(" vs ")}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return tally;
}

const percent = (part, whole) => `${((100 * part) / Math.max(1, whole)).toFixed(1)}%`;

const data = await loadGameData();
const matchups = [["certified", "student"], ["master", "certified"], ["master", "student"]];
console.log(`Quick Duel difficulty benchmark: ${games} games per matchup (seeds ${seedStart}..${seedStart + Math.ceil(games / 2) - 1}, seats swapped).`);
let ordered = true;
for (const matchup of matchups) {
  const started = performance.now();
  const tally = playMatchup(data, matchup, games);
  const [stronger, weaker] = matchup;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`${stronger.padEnd(9)} vs ${weaker.padEnd(9)}  ${stronger} ${percent(tally.wins[stronger], tally.games)}  ${weaker} ${percent(tally.wins[weaker], tally.games)}  (games ${tally.games}, failures ${tally.failures}, avg rounds ${(tally.rounds / Math.max(1, tally.games)).toFixed(1)}, round-limit ${tally.roundLimit}, ${seconds}s)`);
  if (tally.wins[stronger] <= tally.wins[weaker] || tally.failures) ordered = false;
}
console.log(ordered ? `Ordering holds: ${[...DIFFICULTIES].reverse().join(" > ")}.` : "Ordering does NOT hold.");
process.exitCode = ordered ? 0 : 1;
