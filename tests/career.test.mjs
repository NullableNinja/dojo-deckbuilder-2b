// Careers: the economy in engine/collection.mjs (packs, earn rules, Clearance Levels) and the
// browser store in app/career.ts (localStorage, backup, export/import). Every number is read
// from content/packs.json, so these tests keep working when a fork retunes the data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createEconomy } from "../engine/collection.mjs";
import { CAREER_BACKUP_KEY, CAREER_KEY, createCareerStore, crc32, decodeCardSet, encodeCardSet, exportCode, parseCode } from "../app/career.ts";

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const packs = readJson("../content/packs.json");
const cards = readJson("../app/data/cards.json").cards;
const economy = createEconomy(packs, cards);
const earn = packs.earnRules;
const TICKET = "booster-ticket";
const STUB = "ticket-stub";
const fresh = (rngSeed = 7) => economy.newCareer({ profileId: `profile-${rngSeed}`, createdAt: "2026-11-27T09:00:00Z", rngSeed });
const level = (n) => packs.levelTrack.levels.find((entry) => entry.level === n);
const ticketsAt = (n) => level(n).rewards.filter((reward) => reward.kind === TICKET).reduce((sum, reward) => sum + (reward.count ?? 1), 0);
const firstBooster = packs.packs.find((pack) => pack.kind === "booster" && economy.seriesStatus(fresh()).find((series) => series.id === pack.id).unlocked);
const lockedBooster = packs.packs.find((pack) => pack.kind === "booster" && !economy.seriesStatus(fresh()).find((series) => series.id === pack.id).unlocked);
const kit = packs.packs.find((pack) => pack.grant === "choose-one");
const withTickets = (state, count) => ({ ...state, wallet: { ...state.wallet, [TICKET]: count } });
const receipt = (overrides = {}) => ({ matchId: `match-${Math.random()}`, mode: "quick-duel", table: "vs-bots", result: "win", rounds: 6, difficulty: "certified", promotions: 0, opponents: 1, day: "2026-11-27", ...overrides });

// ---- New profiles -------------------------------------------------------------------------

test("a brand-new profile holds the every-profile packs, the starting roster and the level-1 rewards", () => {
  const state = fresh();
  const owned = economy.ownedCards(state);
  for (const pack of packs.packs.filter((entry) => entry.grant === "every-profile")) for (const card of pack.cards) assert.ok(owned.has(card.catalogId));
  assert.equal(owned.size, packs.packs.filter((entry) => entry.grant === "every-profile").reduce((sum, pack) => sum + pack.cards.length, 0));
  const roster = economy.unlockedRoster(state);
  assert.deepEqual([...roster.characters].sort(), packs.unlockables.characters.starting.map((entry) => entry.catalogId).sort());
  assert.deepEqual([...roster.bosses].sort(), packs.unlockables.bosses.starting.map((entry) => entry.catalogId).sort());
  assert.equal(state.wallet[TICKET], ticketsAt(1));
  assert.deepEqual(state.claimedLevels, [1]);
  assert.equal(economy.pendingKitChoices(state), 1, "the level-1 Starter Kit choice is offered");
  assert.equal(economy.levelFor(state.merit), 1);
});

test("choosing a Starter Kit adds its cards once; a second choice waits for the next kit level", () => {
  const state = economy.chooseStarterKit(fresh(), kit.id);
  assert.deepEqual(state.starterKits, [kit.id]);
  for (const card of kit.cards) assert.ok(economy.ownedCards(state).has(card.catalogId));
  assert.equal(economy.pendingKitChoices(state), 0);
  const other = packs.packs.find((pack) => pack.grant === "choose-one" && pack.id !== kit.id);
  assert.equal(economy.chooseStarterKit(state, other.id), state, "no choice is pending");
  const untouched = fresh();
  assert.equal(economy.chooseStarterKit(untouched, "not-a-kit"), untouched);
  const kitLevel = packs.levelTrack.levels.find((entry) => entry.level > 1 && entry.rewards.some((reward) => reward.kind === "starter-kit-choice"));
  const promoted = economy.settle({ ...state, merit: kitLevel.meritTotal }).state;
  assert.equal(economy.pendingKitChoices(promoted), 1);
  assert.deepEqual(economy.chooseStarterKit(promoted, other.id).starterKits, [kit.id, other.id]);
});

test("unlockEverything owns every card, Character and Boss and pays nothing", () => {
  const open = createEconomy({ ...packs, unlockEverything: true }, cards);
  const state = open.newCareer({ profileId: "x", createdAt: "x", rngSeed: 1 });
  assert.equal(open.ownedCards(state).size, cards.filter((card) => packs.collection.collectibleDecks.includes(card.deck)).length);
  assert.equal(open.unlockedRoster(state).characters.size, cards.filter((card) => card.deck === packs.unlockables.characters.deck).length);
  assert.equal(open.resolveMatchPool([open.manifest(state)]), null);
  assert.equal(open.applyMatchResult(state, receipt()).payroll.reason, "unlock-everything");
});

// ---- Boosters -----------------------------------------------------------------------------

test("a booster spends a ticket and holds only new cards from the chosen series", () => {
  const before = withTickets(fresh(), 1);
  const owned = economy.ownedCards(before);
  const { state, cards: pulled, error } = economy.openBooster(before, firstBooster.id, "2026-11-27T10:00:00Z");
  assert.equal(error, null);
  assert.equal(pulled.length, packs.boosterRules.cardsPerPack);
  assert.equal(new Set(pulled).size, pulled.length);
  for (const id of pulled) { assert.ok(firstBooster.cards.some((card) => card.catalogId === id)); assert.ok(!owned.has(id)); }
  assert.equal(state.wallet[TICKET], 0);
  assert.equal(state.packSerial, 1);
  assert.deepEqual(state.packHistory, [{ serial: 1, series: firstBooster.id, cards: pulled, at: "2026-11-27T10:00:00Z" }]);
});

test("opening a whole series never repeats a card, never hands out an owned card, and ends on a short last pack", () => {
  let state = withTickets(fresh(3), 50);
  const seen = new Set();
  const sizes = [];
  for (let pack = 0; pack < 50; pack += 1) {
    const owned = economy.ownedCards(state);
    const opened = economy.openBooster(state, firstBooster.id);
    if (opened.error) { assert.equal(opened.error, "complete"); break; }
    for (const id of opened.cards) { assert.ok(!seen.has(id) && !owned.has(id)); seen.add(id); }
    sizes.push(opened.cards.length);
    state = opened.state;
  }
  assert.equal(seen.size, firstBooster.cards.length);
  assert.equal(sizes.length, Math.ceil(firstBooster.cards.length / packs.boosterRules.cardsPerPack));
  assert.equal(sizes.at(-1), firstBooster.cards.length % packs.boosterRules.cardsPerPack || packs.boosterRules.cardsPerPack);
  const reward = firstBooster.completionReward;
  assert.ok(economy.unlockedRoster(state).characters.has(reward.catalogId), "completing a series unlocks its Character");
  assert.equal(economy.boosterBlocker(withTickets(state, 1), firstBooster.id), "complete");
});

test("packs are deterministic per profile seed and serial, and differ between profiles", () => {
  const roll = (seed) => economy.openBooster(withTickets(fresh(seed), 1), firstBooster.id).cards;
  assert.deepEqual(roll(11), roll(11));
  const rolls = new Set([11, 12, 13, 14, 15].map((seed) => roll(seed).join()));
  assert.ok(rolls.size > 1);
});

test("a booster needs a ticket and an unlocked, unfinished series", () => {
  assert.equal(economy.openBooster(withTickets(fresh(), 0), firstBooster.id).error, "no-ticket");
  assert.equal(economy.openBooster(withTickets(fresh(), 1), lockedBooster.id).error, "locked");
  assert.equal(economy.openBooster(withTickets(fresh(), 1), "no-such-series").error, "unknown-series");
  const opensAt = economy.seriesStatus(fresh()).find((series) => series.id === lockedBooster.id).unlockLevel;
  const promoted = economy.settle({ ...withTickets(fresh(), 1), merit: level(opensAt).meritTotal }).state;
  assert.equal(economy.openBooster(promoted, lockedBooster.id).error, null);
});

test("once the whole collection is owned, tickets turn into Merit", () => {
  const boosterIds = packs.packs.filter((pack) => pack.kind === "booster").flatMap((pack) => pack.cards.map((card) => card.catalogId));
  const complete = { ...fresh(), opened: boosterIds, wallet: { [TICKET]: 2, [STUB]: 0 } };
  const settled = economy.settle(complete);
  assert.equal(settled.state.wallet[TICKET], 0);
  assert.ok(settled.report.ticketsConverted >= 2);
  assert.equal(settled.report.meritFromTickets, settled.report.ticketsConverted * packs.boosterRules.completedCollection.ticketConvertsToMerit);
  assert.ok(economy.collectionComplete(settled.state));
});

// ---- Earn rules ---------------------------------------------------------------------------

test("a win pays a ticket and Merit, scaled by difficulty; a loss pays a stub", () => {
  const state = { ...fresh(), streak: { current: 0, best: 0, lastWinDay: "2026-11-27" } };
  const win = economy.applyMatchResult(state, receipt({ difficulty: "student" })).payroll;
  assert.equal(win.eligible, true);
  assert.equal(win.lines[0].merit, Math.round(earn.matchResults.win.merit * earn.difficultyMeritMultipliers.student));
  assert.equal(win.tickets, earn.matchResults.win[TICKET]);
  const loss = economy.applyMatchResult(state, receipt({ result: "loss" }));
  assert.equal(loss.payroll.merit, earn.matchResults.loss.merit);
  assert.equal(loss.state.wallet[STUB], earn.matchResults.loss[STUB]);
  assert.equal(loss.state.streak.current, 0);
});

test("bonuses: first win of the day, Belt promotions, every third win in a row, and Master wins", () => {
  const bonus = (when) => earn.bonuses.find((entry) => entry.when === when);
  const first = economy.applyMatchResult(fresh(), receipt({ promotions: 3, difficulty: "master" })).payroll;
  const line = (id) => first.lines.find((entry) => entry.id === id);
  assert.equal(line(bonus("first-win-local-day").id).merit, bonus("first-win-local-day").grants.merit);
  assert.equal(line(bonus("each-in-match-belt-promotion").id).merit, bonus("each-in-match-belt-promotion").grants.merit * 3);
  assert.ok(line(bonus("win-against-master-difficulty").id));
  let state = fresh();
  const streakLines = [];
  for (let win = 0; win < 3; win += 1) {
    const paid = economy.applyMatchResult(state, receipt());
    streakLines.push(paid.payroll.lines.some((entry) => entry.id === bonus("every-third-consecutive-win").id));
    state = paid.state;
  }
  assert.deepEqual(streakLines, [false, false, true]);
  assert.equal(economy.applyMatchResult(state, receipt()).payroll.lines.some((entry) => entry.id === bonus("first-win-local-day").id), false, "only the first win of the day");
});

test("three stubs become a ticket", () => {
  const rate = earn.currencies.find((currency) => currency.id === STUB).exchangeRate;
  const state = { ...fresh(), wallet: { [TICKET]: 0, [STUB]: rate - 1 } };
  const paid = economy.applyMatchResult(state, receipt({ result: "loss" }));
  assert.equal(paid.state.wallet[STUB], 0);
  assert.equal(paid.state.wallet[TICKET], 1);
  assert.equal(paid.payroll.stubsExchanged, 1);
});

test("rewards by table and mode: Clash losers, Boss Blitz stages, Open Dojo, short matches and repeats", () => {
  const clash = earn.modes.find((mode) => mode.extraMeritPerOpponent);
  const clashLoss = economy.applyMatchResult(fresh(), receipt({ mode: clash.mode, result: "loss", opponents: 4 })).payroll;
  assert.equal(clashLoss.merit, earn.matchResults.loss.merit + clash.extraMeritPerOpponent * 3);
  const boss = earn.modes.find((mode) => mode.stageMeritMultipliers);
  const [stage, multiplier] = Object.entries(boss.stageMeritMultipliers).at(-1);
  const bossWin = economy.applyMatchResult({ ...fresh(), streak: { current: 0, best: 0, lastWinDay: "2026-11-27" } }, receipt({ mode: boss.mode, bossStage: stage, difficulty: "student" })).payroll;
  assert.equal(bossWin.lines[0].merit, Math.round(earn.matchResults.win.merit * multiplier), "Boss Blitz pays by stage, not difficulty");
  const openDojo = earn.tables.find((table) => table.rewards === "none").id;
  assert.equal(economy.applyMatchResult(fresh(), receipt({ table: openDojo })).payroll.reason, "open-dojo");
  assert.equal(economy.applyMatchResult(fresh(), receipt({ rounds: earn.eligibility.minimumCompletedRounds - 1 })).payroll.reason, "too-short");
  const once = economy.applyMatchResult(fresh(), receipt({ matchId: "same" }));
  const twice = economy.applyMatchResult(once.state, receipt({ matchId: "same" }));
  assert.equal(twice.payroll.reason, "already-paid");
  assert.equal(twice.state, once.state);
  const hotSeat = earn.tables.find((table) => table.rewards === "merit-only");
  if (hotSeat) assert.equal(economy.applyMatchResult(fresh(), receipt({ table: hotSeat.id })).payroll.tickets, 0);
});

test("Merit raises the Clearance Level once per level, paying its tickets and unlocks exactly once", () => {
  const state = { ...fresh(), merit: level(2).meritTotal - 1 };
  const paid = economy.applyMatchResult(state, receipt({ result: "loss" }));
  assert.equal(paid.payroll.levelBefore, 1);
  assert.equal(paid.payroll.levelAfter, 2);
  assert.deepEqual(paid.payroll.levels.map((entry) => entry.level), [2]);
  const unlock = level(2).rewards.find((reward) => reward.kind === "unlock-character");
  assert.deepEqual(paid.payroll.unlocked.characters, [unlock.catalogId]);
  assert.equal(paid.state.wallet[TICKET], ticketsAt(1) + ticketsAt(2));
  assert.deepEqual(economy.settle(paid.state).state.wallet, paid.state.wallet, "settling again pays nothing new");
  const progress = economy.levelProgress(paid.state.merit);
  assert.equal(progress.level, 2);
  assert.equal(progress.span, level(3).meritTotal - level(2).meritTotal);
});

test("after the last level every meritPerReward pays a bonus reward", () => {
  const last = packs.levelTrack.levels.at(-1);
  const after = packs.levelTrack.afterFinalLevel;
  const state = economy.settle({ ...fresh(), merit: last.meritTotal + after.meritPerReward * 2 }).state;
  assert.equal(state.bonusRewards, 2);
  assert.equal(economy.levelProgress(state.merit).maxed, true);
});

// ---- Tables -------------------------------------------------------------------------------

test("the table pool is the sorted union of the seated manifests and always playable", () => {
  const a = economy.chooseStarterKit(fresh(1), packs.packs.filter((pack) => pack.grant === "choose-one")[0].id);
  const b = economy.chooseStarterKit(fresh(2), packs.packs.filter((pack) => pack.grant === "choose-one")[1].id);
  const ab = economy.resolveMatchPool([economy.manifest(a), economy.manifest(b)]);
  assert.deepEqual(ab, economy.resolveMatchPool([economy.manifest(b), economy.manifest(a)]));
  assert.deepEqual(ab, [...ab].sort());
  assert.ok(economy.poolIsPlayable(ab));
  const broken = economy.resolveMatchPool([{ cards: [], bosses: [] }]);
  assert.ok(economy.poolIsPlayable(broken), "a thin pool gets the every-profile packs added");
  for (const boss of packs.unlockables.bosses.starting) assert.ok(broken.includes(boss.catalogId));
});

test("unlock sources explain every locked card, Character and Boss", () => {
  const booster = firstBooster.cards[0].catalogId;
  assert.equal(economy.unlockSource(booster).kind, "booster");
  const levelUnlock = level(2).rewards.find((reward) => reward.kind === "unlock-character");
  assert.deepEqual(economy.unlockSource(levelUnlock.catalogId), { kind: "level", level: 2 });
  assert.equal(economy.unlockSource(firstBooster.completionReward.catalogId).kind, "series");
  assert.equal(economy.unlockSource(kit.cards[0].catalogId).kind, "starter-kit");
});

// ---- Import / merge -----------------------------------------------------------------------

test("importing merges and never loses progress", () => {
  const local = economy.openBooster(withTickets(fresh(5), 2), firstBooster.id).state;
  const other = economy.applyMatchResult(economy.chooseStarterKit(fresh(6), kit.id), receipt()).state;
  const merged = economy.mergeCareers(local, other);
  for (const id of [...economy.ownedCards(local), ...economy.ownedCards(other)]) assert.ok(economy.ownedCards(merged).has(id));
  assert.equal(merged.merit, Math.max(local.merit, other.merit));
  assert.equal(merged.wallet[TICKET], local.wallet[TICKET] + other.wallet[TICKET], "different profiles add wallets");
  const self = economy.mergeCareers(local, local);
  assert.deepEqual(self.wallet, local.wallet, "the same profile keeps the larger of each currency");
  assert.deepEqual(self.opened, local.opened);
});

// ---- Store --------------------------------------------------------------------------------

function memoryStorage() {
  const map = new Map();
  return { map, getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) };
}
const storeOn = (storage) => createCareerStore({ storage: () => storage, now: () => new Date("2026-11-27T12:00:00Z"), random: () => 0.42 });

test("the store creates a profile on first use, saves with a checksum and keeps a backup", () => {
  const storage = memoryStorage();
  const store = storeOn(storage);
  const first = store.get();
  assert.equal(first.status, "career");
  const record = JSON.parse(storage.getItem(CAREER_KEY));
  assert.equal(record.checksum, crc32(JSON.stringify(record.data)));
  store.chooseStarterKit(kit.id);
  assert.ok(storage.getItem(CAREER_BACKUP_KEY), "the previous good state is backed up");
  assert.deepEqual(JSON.parse(storage.getItem(CAREER_BACKUP_KEY)).data.starterKits, []);
  assert.deepEqual(storeOn(storage).get().state.starterKits, [kit.id], "a new page load reads the saved career");
});

test("a corrupt primary is restored from the backup", () => {
  const storage = memoryStorage();
  const store = storeOn(storage);
  store.get();
  store.chooseStarterKit(kit.id);
  storage.setItem(CAREER_KEY, "{not json");
  const reloaded = storeOn(storage).get();
  assert.equal(reloaded.restoredFromBackup, true);
  assert.equal(reloaded.status, "career");
});

test("a newer schema is never overwritten; blocked storage means no career", () => {
  const storage = memoryStorage();
  const data = { ...fresh(), schema: 99 };
  storage.setItem(CAREER_KEY, JSON.stringify({ checksum: crc32(JSON.stringify(data)), data }));
  const store = storeOn(storage);
  assert.equal(store.get().status, "read-only");
  store.setOpenDojo(true);
  assert.equal(JSON.parse(storage.getItem(CAREER_KEY)).data.schema, 99);
  const blocked = createCareerStore({ storage: () => { throw new Error("SecurityError"); } });
  assert.equal(blocked.get().status, "unavailable");
  assert.equal(blocked.recordMatch(receipt()).eligible, false);
});

test("the store opens real packs, records matches once and notifies subscribers", () => {
  const store = storeOn(memoryStorage());
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  const pack = store.openBooster(firstBooster.id);
  assert.equal(pack.error, null);
  assert.equal(pack.cards.length, packs.boosterRules.cardsPerPack);
  assert.equal(store.openBooster(firstBooster.id).error, "no-ticket");
  const { day: _day, ...match } = receipt({ matchId: "store-match" });
  assert.equal(store.recordMatch(match).eligible, true);
  assert.equal(store.recordMatch(match).reason, "already-paid");
  assert.ok(calls >= 2);
});

test("card sets and Dojo Record codes round-trip, and damaged codes are refused", async () => {
  const ids = firstBooster.cards.slice(0, 9).map((card) => card.catalogId);
  assert.deepEqual(decodeCardSet(encodeCardSet(ids)).sort(), [...ids].sort());
  const state = economy.applyMatchResult(economy.openBooster(withTickets(fresh(8), 1), firstBooster.id).state, receipt()).state;
  const code = await exportCode(state);
  assert.match(code, /^PFC1\.[zj]\./);
  const parsed = await parseCode(code);
  assert.deepEqual(parsed.opened.sort(), [...state.opened].sort());
  assert.equal(parsed.merit, state.merit);
  assert.deepEqual(parsed.wallet, state.wallet);
  assert.equal(parsed.profileId, state.profileId);
  await assert.rejects(parseCode("hello"), /not a Dojo Record/);
  const parts = code.split(".");
  await assert.rejects(parseCode([...parts.slice(0, 3), "00000000"].join(".")), /checksum/);
});

test("importing a code into the store merges into the current career", async () => {
  const store = storeOn(memoryStorage());
  store.get();
  const other = economy.applyMatchResult(economy.chooseStarterKit(fresh(9), kit.id), receipt()).state;
  const { after } = await store.importCode(await exportCode(other));
  assert.ok(after.starterKits.includes(kit.id));
  assert.ok(after.merit >= other.merit);
});

// ---- Finished tables ----------------------------------------------------------------------

test("a finished engine table becomes one receipt and pays once", async () => {
  const { EngineSession } = await import("../app/engine-session.ts");
  const { matchReceipt, recordSessionResult } = await import("../app/career-match.ts");
  const fighters = cards.filter((card) => card.cardType === "Character").map((card) => card.catalogId);
  const pool = economy.resolveMatchPool([economy.manifest(fresh())]);
  const session = new EngineSession({ mode: "quick-duel", seed: 41, fighters: [fighters[0], fighters[1]], humanSeats: [0], rulesVersion: "test", difficulty: "certified", table: { cardPool: pool } });
  assert.equal(matchReceipt(session), null, "no receipt while the match runs");
  for (let step = 0; step < 20000 && !session.over; step += 1) {
    if (!session.humanToAct()) { session.stepBots(200); continue; }
    if (session.game.pendingChoice) session.choose(session.game.defaultChoice().optionId);
    else session.act(session.game.defaultAction(session.legalFor(0)));
  }
  const match = matchReceipt(session);
  assert.equal(match.table, "vs-bots");
  assert.equal(match.result, session.game.winner === 0 ? "win" : "loss");
  assert.equal(match.rounds, session.game.round);
  const store = storeOn(memoryStorage());
  const first = recordSessionResult(session, store);
  assert.equal(first.eligible, match.rounds >= earn.eligibility.minimumCompletedRounds);
  assert.equal(recordSessionResult(session, store), first, "rendering the result again pays nothing more");
  assert.equal(store.get().state.receipts.length, first.eligible ? 1 : 0);
  const openDojo = new EngineSession({ mode: "quick-duel", seed: 41, fighters: [fighters[0], fighters[1]], humanSeats: [0], rulesVersion: "test", table: { cardPool: null } });
  assert.equal(matchReceipt({ ...openDojo, game: { ...openDojo.game, winner: 0, round: 9, events: [], players: openDojo.game.players }, setup: openDojo.setup }).table, "open-dojo");
});
