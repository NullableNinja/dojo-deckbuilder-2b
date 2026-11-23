// Quick Duel regression fingerprint: runs a fixed seed set through the headless engine
// and hashes every result (winner, rounds, per-player state, telemetry, card stats,
// events). Use it before and after engine refactors to prove Quick Duel is unchanged.
//   node scripts/engine-regression-fingerprint.mjs [games=200] [out.json]
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game } from "../engine/core.mjs";
import { baselinePolicy } from "../engine/policies.mjs";
import { STRATEGIES } from "../engine/bots.mjs";

const games = Number(process.argv[2] ?? 200);
const out = process.argv[3] ?? null;
const data = await loadGameData();
const perSeed = [];
const all = createHash("sha256");
for (let seed = 1; seed <= games; seed += 1) {
  const strategies = [STRATEGIES[seed % STRATEGIES.length], STRATEGIES[(seed * 7 + 1) % STRATEGIES.length]];
  const result = new Game(data, { seed, strategies }).run({ policy: baselinePolicy });
  const { state, ...rest } = result;
  const text = JSON.stringify(rest);
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 16);
  all.update(hash);
  perSeed.push({ seed, hash, winner: result.winner, reason: result.reason, rounds: result.rounds });
}
const summary = { games, digest: all.digest("hex").slice(0, 24), roundLimitGames: perSeed.filter((entry) => entry.reason === "round-limit").length, perSeed };
if (out) await writeFile(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ games, digest: summary.digest, roundLimitGames: summary.roundLimitGames }));
