/**
 * Collections and careers (docs/packs-and-progression-plan.md): what a profile owns, how a booster
 * is opened, what a finished match pays, and which cards a table plays with.
 *
 * Pure and deterministic: every function takes a career state and returns a new one, and every
 * random result comes from the engine's seeded Rng. All numbers, packs, unlocks and rewards are
 * read from content/packs.json, so nothing here knows a card, a Character or a Boss by name or id.
 * Storage, clocks and the browser live in app/career.ts.
 */
import { Rng } from "./rng.mjs";

export const CAREER_SCHEMA = 1;
const TICKET = "booster-ticket";
const STUB = "ticket-stub";
const ZONES = ["High", "Mid", "Low"];

const cardZones = (card) => (String(card.zone ?? "").trim() === "Any" ? ZONES : String(card.zone ?? "").split(/,\s*/).filter((zone) => ZONES.includes(zone)));
const sortedUnique = (values) => [...new Set(values)].sort();
const wholeMerit = (value) => Math.round(value);

/**
 * Bind the economy to one packs.json and one card catalog. Everything is precomputed once, so the
 * returned functions are cheap enough to call on every render.
 */
export function createEconomy(packs, cards) {
  const cardsById = new Map(cards.map((card) => [card.catalogId, card]));
  const packById = new Map(packs.packs.map((pack) => [pack.id, pack]));
  const packIds = (pack) => pack.cards.map((entry) => entry.catalogId);
  const boosters = packs.packs.filter((pack) => pack.kind === "booster");
  const everyProfile = packs.packs.filter((pack) => pack.grant === "every-profile");
  const kits = packs.packs.filter((pack) => pack.grant === "choose-one");
  const levels = [...packs.levelTrack.levels].sort((left, right) => left.level - right.level);
  const finalLevel = levels[levels.length - 1];
  const unlockEverything = Boolean(packs.unlockEverything);
  const { characters, bosses } = packs.unlockables;
  const collectibleDecks = new Set(packs.collection.collectibleDecks);
  const collectibleIds = cards.filter((card) => collectibleDecks.has(card.deck)).map((card) => card.catalogId);
  const collectibleSet = new Set(collectibleIds);
  const boosterIds = boosters.flatMap(packIds);
  const cardsPerPack = packs.boosterRules.cardsPerPack;
  const earn = packs.earnRules;
  const stubRate = earn.currencies.find((currency) => currency.id === STUB)?.exchangeRate ?? 3;

  // Where each Character or Boss Profile comes from: starting, a Clearance Level, or a series.
  const rosterSource = new Map();
  for (const entry of [...characters.starting, ...bosses.starting]) rosterSource.set(entry.catalogId, { kind: "starting" });
  for (const { level, rewards } of levels) for (const reward of rewards) if (reward.catalogId) rosterSource.set(reward.catalogId, { kind: "level", level });
  for (const pack of boosters) if (pack.completionReward?.catalogId) rosterSource.set(pack.completionReward.catalogId, { kind: "series", series: pack.id });
  const seriesLevel = new Map();
  for (const { level, rewards } of levels) for (const reward of rewards) if (reward.kind === "unlock-booster" && !seriesLevel.has(reward.pack)) seriesLevel.set(reward.pack, level);
  const packOfCard = new Map(packs.packs.flatMap((pack) => packIds(pack).map((catalogId) => [catalogId, pack])));

  // ---- Levels -------------------------------------------------------------------------------
  /** Clearance Level for a Merit total. */
  function levelFor(merit) {
    return levels.reduce((reached, entry) => (merit >= entry.meritTotal ? entry.level : reached), levels[0].level);
  }

  /** Progress inside the current level, for meters. After the last level it counts toward the next bonus reward. */
  function levelProgress(merit) {
    const level = levelFor(merit);
    const next = levels.find((entry) => entry.level === level + 1);
    if (next) {
      const floor = levels.find((entry) => entry.level === level).meritTotal;
      return { level, maxed: false, floor, next: next.meritTotal, into: merit - floor, span: next.meritTotal - floor };
    }
    const span = packs.levelTrack.afterFinalLevel?.meritPerReward ?? 0;
    const into = span ? (merit - finalLevel.meritTotal) % span : 0;
    return { level, maxed: true, floor: merit - into, next: span ? merit - into + span : null, into, span };
  }

  /** The diploma for a level (diplomas borrow the Belt colours). */
  function diplomaFor(level) {
    return [...packs.levelTrack.diplomas].filter((diploma) => diploma.fromLevel <= level).pop() ?? packs.levelTrack.diplomas[0];
  }

  // ---- Ownership ----------------------------------------------------------------------------
  const kitChoicesEarned = (state) => levels.filter((entry) => state.claimedLevels.includes(entry.level)).flatMap((entry) => entry.rewards).filter((reward) => reward.kind === "starter-kit-choice").length;

  /** Starter Kit choices earned and not yet made. */
  function pendingKitChoices(state) {
    return Math.max(0, kitChoicesEarned(state) - state.starterKits.length);
  }

  /** Every collectible card the profile owns: every-profile packs, chosen kits and opened booster cards. */
  function ownedCards(state) {
    if (unlockEverything) return new Set(collectibleIds);
    return new Set([...everyProfile.flatMap(packIds), ...state.starterKits.flatMap((id) => (packById.has(id) ? packIds(packById.get(id)) : [])), ...state.opened.filter((id) => cardsById.has(id))]);
  }

  function seriesStatus(state, owned = ownedCards(state)) {
    const level = levelFor(state.merit);
    return boosters.map((pack) => {
      const ids = packIds(pack);
      const have = ids.filter((id) => owned.has(id)).length;
      return { id: pack.id, name: pack.name, unlockLevel: seriesLevel.get(pack.id) ?? null, unlocked: unlockEverything || (seriesLevel.has(pack.id) && level >= seriesLevel.get(pack.id)), owned: have, total: ids.length, complete: have === ids.length, completionReward: pack.completionReward ?? null };
    });
  }

  function unlockedRoster(state, owned = ownedCards(state)) {
    const all = (deck) => cards.filter((card) => card.deck === deck).map((card) => card.catalogId);
    if (unlockEverything) return { characters: new Set(all(characters.deck)), bosses: new Set(all(bosses.deck)) };
    const level = levelFor(state.merit);
    const completed = new Set(seriesStatus(state, owned).filter((series) => series.complete).map((series) => series.id));
    const unlocked = (catalogId) => {
      const source = rosterSource.get(catalogId);
      return source?.kind === "starting" || (source?.kind === "level" && level >= source.level) || (source?.kind === "series" && completed.has(source.series));
    };
    return { characters: new Set(all(characters.deck).filter(unlocked)), bosses: new Set(all(bosses.deck).filter(unlocked)) };
  }

  /** How a card, Character or Boss is obtained, for sealed envelopes and the Dossier. */
  function unlockSource(catalogId) {
    const roster = rosterSource.get(catalogId);
    if (roster?.kind === "series") return { ...roster, seriesName: packById.get(roster.series)?.name ?? roster.series };
    if (roster) return roster;
    const pack = packOfCard.get(catalogId);
    if (!pack) return { kind: "standard" };
    if (pack.kind === "booster") return { kind: "booster", series: pack.id, seriesName: pack.name, level: seriesLevel.get(pack.id) ?? null };
    return { kind: pack.grant === "every-profile" ? "every-profile" : "starter-kit", pack: pack.id, packName: pack.name };
  }

  const collectionComplete = (state) => {
    const owned = ownedCards(state);
    return boosterIds.every((id) => owned.has(id));
  };

  // ---- Rewards ------------------------------------------------------------------------------
  const addWallet = (wallet, currency, amount) => ({ ...wallet, [currency]: Math.max(0, (wallet[currency] ?? 0) + amount) });

  /** Claim every level the Merit total has reached (once each), plus bonus rewards after the last level. */
  function claimLevels(state) {
    let next = state;
    const claimed = [];
    for (const entry of levels) {
      if (entry.meritTotal > next.merit || next.claimedLevels.includes(entry.level)) continue;
      let wallet = next.wallet;
      for (const reward of entry.rewards) if (reward.kind === TICKET) wallet = addWallet(wallet, TICKET, reward.count ?? 1);
      next = { ...next, wallet, claimedLevels: [...next.claimedLevels, entry.level].sort((left, right) => left - right) };
      claimed.push({ level: entry.level, rewards: entry.rewards });
    }
    const after = packs.levelTrack.afterFinalLevel;
    if (after?.meritPerReward && next.merit >= finalLevel.meritTotal) {
      const earned = Math.floor((next.merit - finalLevel.meritTotal) / after.meritPerReward);
      for (let bonus = next.bonusRewards; bonus < earned; bonus += 1) {
        let wallet = next.wallet;
        for (const reward of after.rewards) if (reward.kind === TICKET) wallet = addWallet(wallet, TICKET, reward.count ?? 1);
        next = { ...next, wallet, bonusRewards: bonus + 1 };
        claimed.push({ level: finalLevel.level, bonus: bonus + 1, rewards: after.rewards });
      }
    }
    return { state: next, claimed };
  }

  /**
   * Bring a state to rest: stubs exchange for tickets, newly reached levels pay out, and once the
   * whole collection is owned every ticket turns into Merit (which can reach a level, and so on).
   */
  function settle(state) {
    let next = state;
    const report = { stubsExchanged: 0, ticketsConverted: 0, meritFromTickets: 0, levels: [] };
    for (let guard = 0; guard < 1000; guard += 1) {
      const exchanged = Math.floor((next.wallet[STUB] ?? 0) / stubRate);
      if (exchanged) { next = { ...next, wallet: addWallet(addWallet(next.wallet, STUB, -exchanged * stubRate), TICKET, exchanged) }; report.stubsExchanged += exchanged; }
      const claimed = claimLevels(next);
      next = claimed.state; report.levels.push(...claimed.claimed);
      const tickets = next.wallet[TICKET] ?? 0;
      if (unlockEverything || !tickets || !collectionComplete(next)) break;
      const merit = tickets * packs.boosterRules.completedCollection.ticketConvertsToMerit;
      next = { ...next, merit: next.merit + merit, wallet: addWallet(next.wallet, TICKET, -tickets) };
      report.ticketsConverted += tickets; report.meritFromTickets += merit;
    }
    return { state: next, report };
  }

  // ---- Profiles -----------------------------------------------------------------------------
  /** A brand-new profile: the every-profile packs, the starting roster and the level-1 rewards. */
  function newCareer({ profileId, createdAt, rngSeed }) {
    const blank = {
      schema: CAREER_SCHEMA, profileId, createdAt, packsRevision: packs.packsRevision, rngSeed: Number(rngSeed) >>> 0 || 1,
      packSerial: 0, starterKits: [], opened: [], packHistory: [], wallet: { [TICKET]: 0, [STUB]: 0 }, merit: 0,
      claimedLevels: [], bonusRewards: 0, streak: { current: 0, best: 0, lastWinDay: null },
      stats: { wins: 0, losses: 0, byMode: {} }, receipts: [], openDojo: false,
    };
    return settle(blank).state;
  }

  /** Choose a Starter Kit for a pending choice. Returns the same state when the choice is not allowed. */
  function chooseStarterKit(state, kitId) {
    if (!pendingKitChoices(state) || state.starterKits.includes(kitId) || !kits.some((kit) => kit.id === kitId)) return state;
    return settle({ ...state, starterKits: [...state.starterKits, kitId] }).state;
  }

  // ---- Boosters -----------------------------------------------------------------------------
  /** The Rng for pack number `serial` of a profile: same seed and serial, same pack. */
  function packRng(seed, serial) {
    const rng = new Rng(((Number(seed) >>> 0) ^ Math.imul(serial + 1, 0x9e3779b1)) >>> 0 || 1);
    for (let warm = 0; warm < 4; warm += 1) rng.next();
    return rng;
  }

  /** Why a series cannot be opened right now, or null when it can. */
  function boosterBlocker(state, seriesId) {
    const series = seriesStatus(state).find((entry) => entry.id === seriesId);
    if (!series) return "unknown-series";
    if (!series.unlocked) return "locked";
    if (series.complete) return "complete";
    if ((state.wallet[TICKET] ?? 0) < 1) return "no-ticket";
    return null;
  }

  /**
   * Spend one Booster Ticket on a series. The pack holds only cards the profile does not own,
   * at most cardsPerPack of them (a series' last pack holds what is left), rolled from
   * (profile seed, pack serial), and is saved into the state before anyone sees it.
   */
  function openBooster(state, seriesId, at = null) {
    const blocker = boosterBlocker(state, seriesId);
    if (blocker) return { state, cards: [], error: blocker };
    const owned = ownedCards(state);
    const series = packIds(packById.get(seriesId));
    const sealed = series.filter((id) => !owned.has(id));
    const drawn = new Set(packRng(state.rngSeed, state.packSerial).shuffle([...sealed]).slice(0, cardsPerPack));
    const pack = series.filter((id) => drawn.has(id));
    const serial = state.packSerial + 1;
    const opened = { ...state, packSerial: serial, opened: [...state.opened, ...pack], wallet: addWallet(state.wallet, TICKET, -1), packHistory: [...state.packHistory, { serial, series: seriesId, cards: pack, at }] };
    const settled = settle(opened);
    return { state: settled.state, cards: pack, error: null, report: settled.report };
  }

  /**
   * File one card outside a booster (the Card of the Day): any collectible card the profile does not
   * own yet. No ticket is spent; the card joins the collection like an opened one and may complete a series.
   */
  function claimCard(state, catalogId) {
    if (!collectibleSet.has(catalogId)) return { state, cards: [], error: "not-collectible" };
    if (ownedCards(state).has(catalogId)) return { state, cards: [], error: "owned" };
    const settled = settle({ ...state, opened: [...state.opened, catalogId] });
    return { state: settled.state, cards: [catalogId], error: null, report: settled.report };
  }

  // ---- Matches ------------------------------------------------------------------------------
  const tableRule = (table) => earn.tables.find((entry) => entry.id === table)?.rewards ?? "none";
  const modeRule = (mode) => earn.modes.find((entry) => entry.mode === mode) ?? {};

  /** Bonuses a receipt qualifies for, by the earn rules' `when` vocabulary. */
  function qualifyingBonuses(state, receipt, streak) {
    const won = receipt.result === "win";
    const checks = {
      "first-win-local-day": () => won && state.streak.lastWinDay !== receipt.day,
      "every-third-consecutive-win": () => won && streak > 0 && streak % 3 === 0,
      "each-in-match-belt-promotion": () => Math.max(0, Number(receipt.promotions) || 0),
      "win-against-master-difficulty": () => won && receipt.difficulty === "master" && !modeRule(receipt.mode).stageMeritMultipliers,
    };
    return earn.bonuses.map((bonus) => ({ bonus, times: Number(checks[bonus.when]?.() ?? 0) })).filter((entry) => entry.times > 0);
  }

  /**
   * What a finished match pays, applied to the state. A receipt is
   * { matchId, mode, table, result: "win" | "loss", rounds, difficulty, promotions, opponents, bossStage, day, at }.
   * Ineligible matches (Open Dojo, too short, already paid) return the state unchanged with a reason.
   */
  function applyMatchResult(state, receipt) {
    const tableRewards = tableRule(receipt.table);
    const none = (reason) => ({ state, payroll: { eligible: false, reason, lines: [], merit: 0, tickets: 0, stubs: 0, levelBefore: levelFor(state.merit), levelAfter: levelFor(state.merit), levels: [], stubsExchanged: 0, ticketsConverted: 0, meritFromTickets: 0, unlocked: { characters: [], bosses: [] } } });
    if (unlockEverything) return none("unlock-everything");
    if (tableRewards === "none") return none("open-dojo");
    if ((Number(receipt.rounds) || 0) < earn.eligibility.minimumCompletedRounds) return none("too-short");
    if (state.receipts.some((entry) => entry.matchId === receipt.matchId)) return none("already-paid");

    const won = receipt.result === "win";
    const mode = modeRule(receipt.mode);
    const lines = [];
    const base = earn.matchResults[won ? "win" : "loss"];
    let multiplier = 1;
    let multiplierLabel = null;
    if (mode.stageMeritMultipliers) {
      multiplier = mode.stageMeritMultipliers[receipt.bossStage] ?? 1;
      multiplierLabel = receipt.bossStage ? { kind: "stage", key: receipt.bossStage, value: multiplier } : null;
    } else if (receipt.difficulty && earn.difficultyMeritMultipliers[receipt.difficulty] !== undefined) {
      multiplier = earn.difficultyMeritMultipliers[receipt.difficulty];
      multiplierLabel = { kind: "difficulty", key: receipt.difficulty, value: multiplier };
    }
    lines.push({ id: won ? "win" : "loss", merit: wholeMerit((base.merit ?? 0) * multiplier), tickets: base[TICKET] ?? 0, stubs: base[STUB] ?? 0, multiplier: multiplierLabel });
    if (!won && mode.extraMeritPerOpponent && Number(receipt.opponents) > 1) lines.push({ id: "extra-opponents", merit: mode.extraMeritPerOpponent * (Number(receipt.opponents) - 1), tickets: 0, stubs: 0, times: Number(receipt.opponents) - 1 });

    const streakCurrent = won ? state.streak.current + 1 : 0;
    for (const { bonus, times } of qualifyingBonuses(state, receipt, streakCurrent)) {
      lines.push({ id: bonus.id, merit: (bonus.grants.merit ?? 0) * times, tickets: (bonus.grants[TICKET] ?? 0) * times, stubs: (bonus.grants[STUB] ?? 0) * times, times });
    }
    const meritOnly = tableRewards === "merit-only";
    if (meritOnly) for (const line of lines) { line.tickets = 0; line.stubs = 0; }

    const merit = lines.reduce((sum, line) => sum + line.merit, 0);
    const tickets = lines.reduce((sum, line) => sum + line.tickets, 0);
    const stubs = lines.reduce((sum, line) => sum + line.stubs, 0);
    const byMode = state.stats.byMode[receipt.mode] ?? { wins: 0, losses: 0 };
    const before = unlockedRoster(state);
    const paid = {
      ...state,
      merit: state.merit + merit,
      wallet: addWallet(addWallet(state.wallet, TICKET, tickets), STUB, stubs),
      streak: { current: streakCurrent, best: Math.max(state.streak.best, streakCurrent), lastWinDay: won ? receipt.day ?? state.streak.lastWinDay : state.streak.lastWinDay },
      stats: { wins: state.stats.wins + (won ? 1 : 0), losses: state.stats.losses + (won ? 0 : 1), byMode: { ...state.stats.byMode, [receipt.mode]: { wins: byMode.wins + (won ? 1 : 0), losses: byMode.losses + (won ? 0 : 1) } } },
      receipts: [...state.receipts, { matchId: receipt.matchId, mode: receipt.mode, result: receipt.result, merit, tickets, stubs, at: receipt.at ?? null }].slice(-100),
    };
    const settled = settle(paid);
    const after = unlockedRoster(settled.state);
    const fresh = (key) => [...after[key]].filter((id) => !before[key].has(id));
    return {
      state: settled.state,
      payroll: { eligible: true, reason: null, lines, merit, tickets, stubs, levelBefore: levelFor(state.merit), levelAfter: levelFor(settled.state.merit), levels: settled.report.levels, stubsExchanged: settled.report.stubsExchanged, ticketsConverted: settled.report.ticketsConverted, meritFromTickets: settled.report.meritFromTickets, unlocked: { characters: fresh("characters"), bosses: fresh("bosses") } },
    };
  }

  // ---- Tables -------------------------------------------------------------------------------
  /** What one profile brings to a table: its owned collectible cards and unlocked Boss Profiles. */
  function manifest(state) {
    const owned = ownedCards(state);
    return { cards: [...owned].sort(), bosses: [...unlockedRoster(state, owned).bosses].sort() };
  }

  /** True when a set of cards meets packs.json minimumStarterPool (every subtype, every zone). */
  function poolIsPlayable(catalogIds) {
    const minimum = packs.collection.minimumStarterPool;
    const pool = catalogIds.map((id) => cardsById.get(id)).filter(Boolean);
    const count = (subtype) => pool.filter((card) => card.subtype === subtype).length;
    const zones = (subtype) => new Set(pool.filter((card) => card.subtype === subtype).flatMap(cardZones));
    return Object.entries(minimum.subtypes).every(([subtype, needed]) => count(subtype) >= needed)
      && minimum.attackZones.every((zone) => zones("Attack").has(zone))
      && minimum.defenseZones.every((zone) => zones("Defense").has(zone));
  }

  /**
   * The shared card pool for a table: the union of every seated human's manifest, sorted, so the
   * order players arrive in never matters. A pool too thin to play gets the every-profile packs
   * and the starting Bosses added, so every table can fill its Market, Combo and Location decks
   * and its Boss ladder. Null means the full catalog (Open Dojo, or unlockEverything).
   */
  function resolveMatchPool(manifests) {
    if (unlockEverything || !manifests.length) return null;
    let pool = sortedUnique(manifests.flatMap((entry) => [...entry.cards, ...entry.bosses]));
    if (!poolIsPlayable(pool)) pool = sortedUnique([...pool, ...everyProfile.flatMap(packIds)]);
    return sortedUnique([...pool, ...bosses.starting.map((entry) => entry.catalogId)]);
  }

  // ---- Import -------------------------------------------------------------------------------
  /**
   * Merge an imported career into this one. Nothing is ever lost: opened cards and kits are
   * unioned, the higher Merit wins, and unspent wallets are added together only when the two
   * records are different profiles (the same profile keeps the larger of each).
   */
  function mergeCareers(local, imported) {
    const sameProfile = local.profileId === imported.profileId;
    const currencies = new Set([...Object.keys(local.wallet), ...Object.keys(imported.wallet)]);
    const wallet = Object.fromEntries([...currencies].map((currency) => {
      const mine = local.wallet[currency] ?? 0; const theirs = imported.wallet[currency] ?? 0;
      return [currency, sameProfile ? Math.max(mine, theirs) : mine + theirs];
    }));
    const modes = new Set([...Object.keys(local.stats.byMode), ...Object.keys(imported.stats.byMode)]);
    const maxStats = (left = { wins: 0, losses: 0 }, right = { wins: 0, losses: 0 }) => ({ wins: Math.max(left.wins, right.wins), losses: Math.max(left.losses, right.losses) });
    const histories = [...local.packHistory, ...imported.packHistory.filter((entry) => !local.packHistory.some((mine) => mine.serial === entry.serial && mine.series === entry.series))];
    const receipts = [...local.receipts, ...imported.receipts.filter((entry) => !local.receipts.some((mine) => mine.matchId === entry.matchId))].slice(-100);
    const merged = {
      ...local,
      packSerial: Math.max(local.packSerial, imported.packSerial),
      starterKits: [...new Set([...local.starterKits, ...imported.starterKits])],
      opened: [...new Set([...local.opened, ...imported.opened])],
      packHistory: histories,
      wallet,
      merit: Math.max(local.merit, imported.merit),
      claimedLevels: [...new Set([...local.claimedLevels, ...imported.claimedLevels].map(Number))].sort((left, right) => left - right),
      bonusRewards: Math.max(local.bonusRewards, imported.bonusRewards),
      streak: { current: Math.max(local.streak.current, imported.streak.current), best: Math.max(local.streak.best, imported.streak.best), lastWinDay: [local.streak.lastWinDay, imported.streak.lastWinDay].filter(Boolean).sort().pop() ?? null },
      stats: { wins: Math.max(local.stats.wins, imported.stats.wins), losses: Math.max(local.stats.losses, imported.stats.losses), byMode: Object.fromEntries([...modes].map((mode) => [mode, maxStats(local.stats.byMode[mode], imported.stats.byMode[mode])])) },
      receipts,
    };
    return settle(merged).state;
  }

  return {
    packs, unlockEverything, cardsPerPack, boosters, kits, everyProfile, levels,
    levelFor, levelProgress, diplomaFor, pendingKitChoices, ownedCards, seriesStatus, unlockedRoster, unlockSource,
    collectionComplete, settle, newCareer, chooseStarterKit, boosterBlocker, openBooster, claimCard, isCollectible: (catalogId) => collectibleSet.has(catalogId), applyMatchResult,
    manifest, poolIsPlayable, resolveMatchPool, mergeCareers,
  };
}
