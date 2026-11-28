// Experimental updates (engine/experiments.mjs): optional rules, new cards and retunes a table can switch on.
import test from "node:test";
import assert from "node:assert/strict";
import { loadGameData } from "../engine/rules-loader.mjs";
import { createModeGame } from "../engine/game-factory.mjs";
import { applyExperiments, experimentEntries, normaliseExperimentsOption, resolveExperimentModules } from "../engine/experiments.mjs";

const data = await loadGameData();
const ALL = { modules: ["status-effects", "paperwork-cards", "support-cards", "retunes-draw", "retunes-fortress"] };
const newGame = (table = {}, seed = 3) => createModeGame(data, { seed, strategies: ["balanced", "balanced"], mode: "quick-duel", table });
const card = (game, catalogId) => game.cardInstance(game.data.byId.get(catalogId));
const statusEvents = (game, kind) => game.events.filter((event) => event.type === "arena-effect" && event.kind === kind);

/** Pass every phase (no Attacks, no Defenses) so a test can set up a precise situation. */
function step(game) {
  game.advanceAutomaticEvents();
  if (game.winner !== null) return;
  if (game.pendingChoice) {
    const pass = game.pendingChoice.options.find((option) => option.id === "pass");
    game.resolveChoice({ optionId: pass ? "pass" : game.defaultChoice().optionId });
    return;
  }
  const legal = game.getLegalActions();
  game.applyAction(legal.find((action) => action.type === "pass" || action.type === "hide") ?? legal[0]);
}
function until(game, stop, limit = 600) { for (let index = 0; index < limit && !stop(game) && game.winner === null; index += 1) step(game); return stop(game); }
const atYell = (seat) => (game) => game.phase === "Yell" && game.activePlayer === seat && !game.pendingChoice;

/** Play an Attack from hand and let the defender take it undefended. */
function attackWith(game, attackCard) {
  game.players[game.activePlayer].hand.push(attackCard);
  const action = game.getLegalActions().find((entry) => entry.type === "play-attack" && entry.cardId === attackCard.instanceId);
  assert.ok(action, `${attackCard.name} can be played`);
  const attacks = game.events.filter((event) => event.type === "attack").length;
  game.applyAction(action);
  until(game, (g) => g.events.filter((event) => event.type === "attack").length > attacks && !g.pendingChoice, 50);
  return game.events.filter((event) => event.type === "attack").at(-1);
}

test("experiments are inert unless a table switches them on", () => {
  assert.equal(applyExperiments(data, undefined), data);
  assert.equal(normaliseExperimentsOption({ modules: [] }), null);
  const game = newGame();
  assert.equal(game.setup.table.experiments, undefined, "a default table records no experiments, so fingerprints do not move");
  assert.ok(!game.statusEffectsEnabled);
  assert.equal(game.data, data);
});

test("unknown experiments are rejected and requirements are pulled in", () => {
  assert.throws(() => newGame({ experiments: { modules: ["nope"] } }), /Unknown experiment nope/);
  assert.deepEqual(resolveExperimentModules(data.experiments, { modules: ["paperwork-cards"] }), ["status-effects", "paperwork-cards"]);
  assert.ok(newGame({ experiments: { modules: ["paperwork-cards"] } }).statusEffectsEnabled, "Paperwork cards bring the status layer");
  assert.ok(!newGame({ experiments: { modules: ["retunes-draw"] } }).statusEffectsEnabled, "retunes alone keep the canonical rules engine");
});

test("retunes patch a table's copy of the card, never the canonical catalog", () => {
  const game = newGame({ experiments: { modules: ["retunes-draw"] } });
  const cleanSlate = game.data.byId.get("DDB-KAT-CORE-010");
  assert.equal(cleanSlate.fpCost, 3);
  assert.equal(cleanSlate.experiment.printed.fpCost, 4);
  assert.equal(data.byId.get("DDB-KAT-CORE-010").fpCost, 4, "the canonical card is untouched");
  assert.equal(game.data.cardEffectById.get("DDB-CON-CORE-025").effects.at(-1).ifJunk.focus, 1, "Green Tea's retuned effects are in play");
});

test("single cards and retunes can be switched off inside an enabled module", () => {
  const game = newGame({ experiments: { modules: ["paperwork-cards", "retunes-draw"], exclude: ["DDB-ATK-PPR-001", "DDB-KAT-CORE-010"] } });
  assert.ok(!game.data.byId.has("DDB-ATK-PPR-001"));
  assert.ok(game.data.byId.has("DDB-ATK-PPR-005"));
  assert.equal(game.data.byId.get("DDB-KAT-CORE-010").fpCost, 4);
  assert.equal(experimentEntries(data.experiments, "paperwork-cards").length, 37);
  assert.equal(experimentEntries(data.experiments, "support-cards").length, 12);
  assert.equal(experimentEntries(data.experiments, "retunes-draw").length + experimentEntries(data.experiments, "retunes-fortress").length, 26);
});

test("every experimental card plays through real games with no unsupported effect", () => {
  const pool = data.experiments.cards.cards.map((entry) => entry.card.catalogId);
  let unsupported = 0;
  for (let seed = 1; seed <= 24; seed += 1) {
    const game = createModeGame(data, { seed, strategies: ["balanced", "aggressive"], mode: "quick-duel", table: { experiments: ALL, cardPool: pool } });
    game.run({ maxSteps: 20000 });
    assert.notEqual(game.winner, null, `seed ${seed} finishes`);
    unsupported += game.telemetry.unsupportedEffects;
  }
  assert.equal(unsupported, 0);
});

test("Toaster Uppercut Scorches ×2 a target that is already Scorched", () => {
  const game = newGame({ experiments: ALL });
  assert.ok(until(game, atYell(0)));
  const [me, them] = game.players;
  me.atk = 12; them.def = 0; me.tempo = false;
  game.applyArenaEffect(them, "burn", { stacks: 1 });
  const attack = attackWith(game, card(game, "DDB-ATK-PPR-001"));
  assert.ok(attack.damage > 0);
  assert.equal(game.arenaEffect(them, "burn").stacks, 3);
});

test("a Kata loads its status onto your next Hit this turn only", () => {
  const game = newGame({ experiments: ALL });
  assert.ok(until(game, atYell(0)));
  const me = game.players[0];
  const kata = card(game, "DDB-KAT-PPR-002");
  me.hand.push(kata);
  game.applyAction(game.getLegalActions().find((action) => action.type === "play-card" && action.cardId === kata.instanceId));
  until(game, (g) => !g.pendingChoice, 10);
  assert.equal(game.arenaState(me).armed?.effect, "freeze");
  until(game, (g) => g.activePlayer === 1);
  assert.equal(game.arenaState(me).armed, null, "the load is gone after your Hide");
});

test("Barrier you give yourself on your own turn still protects you on the opponent's turn", () => {
  const game = newGame({ experiments: ALL });
  assert.ok(until(game, atYell(0)));
  const me = game.players[0];
  game.applyArenaEffect(me, "barrier", { stacks: 1, source: 0 });
  until(game, (g) => g.activePlayer === 1 && g.phase === "Yell");
  assert.ok(game.arenaEffect(me, "barrier"), "Barrier lasts to the end of your next turn");
});

test("a Reimburse Weapon heals its wielder on a Hit of 2 or more", () => {
  const game = newGame({ experiments: ALL });
  assert.ok(until(game, atYell(0)));
  const [me, them] = game.players;
  me.equipment.push(card(game, "DDB-WPN-PPR-003"));
  me.hp = me.maxHp - 3; me.atk = 12; them.def = 0;
  const attack = attackWith(game, card(game, "DDB-ATK-PPR-005"));
  assert.ok(attack.damage >= 2);
  assert.equal(me.hp, me.maxHp - 2);
  assert.equal(statusEvents(game, "reimburse").length, 1);
});

test("Margin Notes destroys a discarded Junk card and draws one instead of two", () => {
  const game = newGame({ experiments: ALL });
  assert.ok(until(game, atYell(0)));
  const me = game.players[0];
  const notes = card(game, "DDB-CON-PPR-007");
  me.hand = [notes, card(game, data.definition.starterDeck.map((entry) => data.byId.get(entry.catalogId)).find((entry) => entry.category === "Junk").catalogId)];
  const junk = me.hand[1];
  game.applyAction(game.getLegalActions().find((action) => action.type === "play-card" && action.cardId === notes.instanceId));
  assert.equal(game.pendingChoice?.kind, "card-movement");
  const handBefore = me.hand.length;
  game.resolveChoice({ optionId: junk.instanceId });
  assert.ok(me.destroyed.includes(junk));
  assert.equal(me.hand.length, handBefore - 1 + 1);
});

test("Server Room changes the status rules while it is the Location", () => {
  const game = newGame({ experiments: ALL });
  assert.equal(game.arenaRule("shock").duration, 1);
  game.currentLocation = card(game, "DDB-LOC-PPR-001");
  assert.equal(game.arenaRule("shock").duration, 2);
  assert.equal(game.arenaRule("freeze").tearMinDamage, 3);
});

test("Slip and Seal completes when you Wet Floor a fighter and Hit them Low", () => {
  const game = newGame({ experiments: ALL });
  assert.ok(until(game, atYell(0)));
  const [me, them] = game.players;
  me.learnedCombos.push(card(game, "DDB-CMB-PPR-001"));
  me.atk = 12; them.def = 0;
  game.applyArenaEffect(them, "wetfloor", { source: 0 });
  attackWith(game, card(game, "DDB-ATK-PPR-009"));
  assert.ok(game.events.some((event) => event.type === "combo-completed" && event.combo === "DDB-CMB-PPR-001"));
  assert.ok(game.arenaEffect(them, "freeze"), "the payoff Laminates the target");
});
