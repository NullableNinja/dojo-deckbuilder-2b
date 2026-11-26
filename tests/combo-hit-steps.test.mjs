// Combo steps that require an earlier Attack to have Hit, and Starter Attacks counting as Attacks.
import assert from "node:assert/strict";
import test from "node:test";
import { loadGameData } from "../engine/rules-loader.mjs";
import { Game } from "../engine/core.mjs";
import { evaluateCombo, stepMatches } from "../engine/combo-runtime.mjs";

const data = await loadGameData();
const byName = (name) => data.cards.find((card) => card.name === name);
const kickIn = (zone) => data.cards.find((card) => card.subtype === "Attack" && card.zone === zone && (card.tags ?? []).includes("Kick"));
const swanSong = byName("Swan Song");

function playerAfterOpener(hit) {
  const game = new Game(data, { seed: 3 });
  const player = game.players[0];
  const opener = kickIn("Low");
  player.comboFacts.turnPlayed = [{ cardId: opener.catalogId, zone: "Low" }];
  player.comboFacts.turnAttacks = [{ cardId: opener.catalogId, zone: "Low", hit, blocked: !hit }];
  return player;
}

test("fixtures exist", () => {
  assert.ok(swanSong && kickIn("Low") && kickIn("High"));
});

test("Swan Song pays out only when the opening Kick Hit", () => {
  const finisher = kickIn("High");
  assert.equal(evaluateCombo(data, swanSong, playerAfterOpener(true), finisher, "High").eligible, true);
  assert.equal(evaluateCombo(data, swanSong, playerAfterOpener(false), finisher, "High").eligible, false);
});

test("Starter Attacks count as Attacks for Combo steps", () => {
  const jab = data.cards.find((card) => card.cardType === "Starter" && card.details?.Type === "Attack" && card.zone === "High");
  assert.ok(jab);
  assert.equal(stepMatches({ family: "Attack" }, jab, "High"), true);
});
