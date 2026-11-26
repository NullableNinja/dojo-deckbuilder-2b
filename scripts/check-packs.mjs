#!/usr/bin/env node
// Validates content/packs.json: its schema shape, pack membership against content/cards.json,
// starting and unlockable Characters and Bosses, starter-pool health, Combo coherence, earn rules
// and the Clearance Level track. Run directly (`npm run packs:check`) or import checkPacks() in tests.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stepMatches } from "../engine/combo-runtime.mjs";

const ZONES = ["High", "Mid", "Low"];
const SCHEMA_KEYWORDS = new Set(["$ref", "type", "const", "enum", "minLength", "pattern", "minimum", "maximum", "exclusiveMinimum", "minItems", "uniqueItems", "items", "required", "properties", "additionalProperties"]);
const SCHEMA_METADATA_KEYWORDS = new Set(["$schema", "$id", "$defs", "title", "description", "$comment"]);
const CARD_MATCHING_REQUIREMENTS = new Set(["orderedSequence", "currentCardMatches", "priorCardMatches", "equippedCardMatches", "playedCardHistory"]);

export function loadPackInputs(root = resolve(dirname(fileURLToPath(import.meta.url)), "..")) {
  const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
  return {
    packs: readJson("content/packs.json"),
    schema: readJson("content/packs.schema.json"),
    cards: readJson("content/cards.json").cards,
    comboRequirements: readJson("content/combo-requirements.json").cards,
    game: readJson("content/dojo-game.json"),
  };
}

// --- Minimal JSON Schema subset (see packs.schema.json for the keywords it allows) -------------

const typeMatches = (value, type) => {
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "null") return value === null;
  return typeof value === type;
};

export function validateSchema(value, schema, root = schema, path = "$") {
  if (schema.$ref) return validateSchema(value, resolveRef(root, schema.$ref), root, path);
  const errors = [];
  const fail = (message) => errors.push(`${path}: ${message}`);
  for (const keyword of Object.keys(schema)) {
    if (!SCHEMA_KEYWORDS.has(keyword) && !SCHEMA_METADATA_KEYWORDS.has(keyword)) fail(`schema uses unsupported keyword "${keyword}"`);
  }
  if (schema.type && !typeMatches(value, schema.type)) return [...errors, `${path}: expected ${schema.type}`];
  if ("const" in schema && value !== schema.const) fail(`must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`must be one of ${schema.enum.join(", ")}`);
  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) fail(`must have at least ${schema.minLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(`must match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) fail(`must be >= ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) fail(`must be <= ${schema.maximum}`);
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum) fail(`must be > ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) fail(`must have at least ${schema.minItems} items`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) fail("items must be unique");
    if (schema.items) value.forEach((item, index) => errors.push(...validateSchema(item, schema.items, root, `${path}[${index}]`)));
  }
  if (typeMatches(value, "object")) {
    for (const key of schema.required ?? []) if (!(key in value)) fail(`missing required "${key}"`);
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (schema.properties?.[key]) errors.push(...validateSchema(child, schema.properties[key], root, childPath));
      else if (schema.additionalProperties === false) fail(`unexpected property "${key}"`);
      else if (typeof schema.additionalProperties === "object") errors.push(...validateSchema(child, schema.additionalProperties, root, childPath));
    }
  }
  return errors;
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`Only local schema references are supported: ${ref}`);
  return ref.slice(2).split("/").reduce((node, key) => node?.[key], root) ?? (() => { throw new Error(`Unresolved schema reference ${ref}`); })();
}

// --- Domain checks -----------------------------------------------------------------------------

const countBy = (items, keyOf) => items.reduce((counts, item) => counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1), new Map());
const duplicates = (values) => [...countBy(values, (value) => value)].filter(([, count]) => count > 1).map(([value]) => value);
const cardZones = (card) => (String(card.zone).trim() === "Any" ? ZONES : String(card.zone ?? "").split(/,\s*/).filter((zone) => ZONES.includes(zone)));

function context(inputs) {
  const { packs, cards } = inputs;
  const cardsById = new Map(cards.map((card) => [card.catalogId, card]));
  const collectible = cards.filter((card) => packs.collection.collectibleDecks.includes(card.deck));
  const packById = new Map(packs.packs.map((pack) => [pack.id, pack]));
  const everyProfilePacks = packs.packs.filter((pack) => pack.kind === "starter" && pack.grant === "every-profile");
  const cardsOf = (pack) => pack.cards.map((entry) => cardsById.get(entry.catalogId)).filter(Boolean);
  const starterDeck = (inputs.game.definition.starterDeck ?? []).map((entry) => cardsById.get(entry.catalogId)).filter(Boolean);
  const alwaysOwned = [...starterDeck, ...everyProfilePacks.flatMap(cardsOf)];
  return { ...inputs, cardsById, collectible, packById, everyProfilePacks, cardsOf, alwaysOwned };
}

function checkUniqueIds(ctx, fail) {
  const { packs } = ctx;
  const groups = {
    pack: packs.packs, currency: packs.earnRules.currencies,
    diploma: packs.levelTrack.diplomas, "match pool": packs.collection.matchPools, bonus: packs.earnRules.bonuses,
  };
  for (const [label, items] of Object.entries(groups)) for (const id of duplicates(items.map((item) => item.id))) fail(`duplicate ${label} id "${id}"`);
}

function checkCollection(ctx, fail) {
  const { packs, cards, game } = ctx;
  const { collectibleDecks, alwaysAvailableDecks, unlockableDecks, matchPools } = packs.collection;
  if (packs.rulesVersion !== game.rulesVersion) fail(`rulesVersion ${packs.rulesVersion} does not match content/dojo-game.json (${game.rulesVersion})`);
  const catalogDecks = new Set(cards.map((card) => card.deck));
  const classified = [...collectibleDecks, ...alwaysAvailableDecks, ...unlockableDecks];
  for (const deck of classified) if (!catalogDecks.has(deck)) fail(`unknown deck "${deck}"`);
  for (const deck of duplicates(classified)) fail(`deck "${deck}" is listed under more than one of collectible, always available and unlockable`);
  for (const deck of catalogDecks) if (!classified.includes(deck)) fail(`deck "${deck}" is not listed as collectible, always available or unlockable`);
  const unlockableKinds = Object.values(packs.unlockables).map((kind) => kind.deck);
  for (const deck of unlockableKinds) if (!unlockableDecks.includes(deck)) fail(`unlockables deck "${deck}" is not in collection.unlockableDecks`);
  for (const deck of unlockableDecks) if (!unlockableKinds.includes(deck)) fail(`unlockable deck "${deck}" has no unlockables entry`);
  const pooledDecks = matchPools.flatMap((pool) => pool.decks);
  for (const deck of duplicates(pooledDecks)) fail(`deck "${deck}" appears in more than one match pool`);
  for (const deck of collectibleDecks) if (!pooledDecks.includes(deck)) fail(`collectible deck "${deck}" belongs to no match pool`);
  for (const deck of pooledDecks) if (!collectibleDecks.includes(deck)) fail(`match pool deck "${deck}" is not collectible`);
}

function checkBoosterSizes(ctx, fail) {
  const { cardsPerPack } = ctx.packs.boosterRules;
  for (const pack of ctx.packs.packs.filter((candidate) => candidate.kind === "booster")) {
    if (pack.cards.length < cardsPerPack) fail(`booster "${pack.id}" has ${pack.cards.length} cards, fewer than one pack of ${cardsPerPack}`);
  }
}

function checkMembership(ctx, fail) {
  const { packs, cardsById, collectible } = ctx;
  const entries = packs.packs.flatMap((pack) => pack.cards.map((entry) => ({ ...entry, pack })));
  for (const entry of entries) {
    const card = cardsById.get(entry.catalogId);
    const where = `${entry.pack.id}: ${entry.catalogId}`;
    if (!card) { fail(`${where} is not in content/cards.json`); continue; }
    if (card.name !== entry.name) fail(`${where} is named "${card.name}" in cards.json, not "${entry.name}"`);
    if (!packs.collection.collectibleDecks.includes(card.deck)) fail(`${where} is in ${card.deck}, which is not collectible`);
  }
  for (const id of duplicates(entries.map((entry) => entry.catalogId))) {
    fail(`${id} is assigned more than once (${entries.filter((entry) => entry.catalogId === id).map((entry) => entry.pack.id).join(", ")})`);
  }
  if (packs.unlockEverything) return;
  const assigned = new Set(entries.map((entry) => entry.catalogId));
  for (const card of collectible) if (!assigned.has(card.catalogId)) fail(`${card.catalogId} (${card.name}) is collectible but in no pack`);
}

function checkPackFields(ctx, fail) {
  const knownBuildPaths = new Set(ctx.cards.flatMap((card) => card.buildPaths ?? []));
  for (const pack of ctx.packs.packs) {
    if (pack.kind === "starter" && !pack.grant) fail(`starter pack "${pack.id}" needs a grant`);
    if (pack.kind === "booster" && (pack.grant || pack.choiceGroup)) fail(`booster "${pack.id}" cannot have a grant or choiceGroup`);
    if (pack.grant === "choose-one" && !pack.choiceGroup) fail(`starter pack "${pack.id}" is choose-one but has no choiceGroup`);
    if (pack.grant === "every-profile" && pack.choiceGroup) fail(`starter pack "${pack.id}" is every-profile and cannot have a choiceGroup`);
    if (pack.completionReward && pack.kind !== "booster") fail(`starter pack "${pack.id}" cannot have a completionReward`);
    if (pack.completionReward) checkReward(ctx, pack.completionReward, `${pack.id} completionReward`, fail);
    for (const path of pack.themeBuildPaths) if (!knownBuildPaths.has(path)) fail(`pack "${pack.id}" theme build path "${path}" is used by no card`);
  }
  for (const [group, members] of choiceGroups(ctx.packs)) {
    const sizes = new Set(members.map((pack) => pack.cards.length));
    if (sizes.size > 1) fail(`choice group "${group}" offers packs of different sizes (${[...sizes].join(", ")}); every choice should be worth the same`);
  }
}

function choiceGroups(packs) {
  const groups = new Map();
  for (const pack of packs.packs.filter((candidate) => candidate.choiceGroup)) groups.set(pack.choiceGroup, [...(groups.get(pack.choiceGroup) ?? []), pack]);
  return groups;
}

function checkStarterPool(ctx, fail) {
  const minimum = ctx.packs.collection.minimumStarterPool;
  const starterPool = ctx.everyProfilePacks.flatMap(ctx.cardsOf);
  if (!ctx.everyProfilePacks.length) fail("no starter pack is granted to every profile");
  const bySubtype = countBy(starterPool, (card) => card.subtype);
  for (const [subtype, needed] of Object.entries(minimum.subtypes)) {
    const have = bySubtype.get(subtype) ?? 0;
    if (have < needed) fail(`every-profile starter pool has ${have} ${subtype} cards; needs at least ${needed}`);
  }
  const zonesCovered = (subtype) => new Set(starterPool.filter((card) => card.subtype === subtype).flatMap(cardZones));
  for (const zone of minimum.attackZones) if (!zonesCovered("Attack").has(zone)) fail(`every-profile starter pool has no ${zone} Attack`);
  for (const zone of minimum.defenseZones) if (!zonesCovered("Defense").has(zone)) fail(`every-profile starter pool has no Defense covering ${zone}`);
}

const cardSatisfiesStep = (step, card) => (cardZones(card).length ? cardZones(card) : [""]).some((zone) => stepMatches(step, card, zone));

function unsatisfiedRequirement(requirements, available) {
  for (const requirement of requirements) {
    const steps = CARD_MATCHING_REQUIREMENTS.has(requirement.kind) ? requirement.steps ?? [requirement] : requirement.tag ? [{ tags: [requirement.tag] }] : [];
    const missing = steps.find((step) => !available.some((card) => cardSatisfiesStep(step, card)));
    if (missing) return { requirement, step: missing };
  }
  return null;
}

function checkComboCoherence(ctx, fail) {
  for (const pack of ctx.packs.packs) {
    const available = pack.grant === "every-profile" ? ctx.alwaysOwned : [...ctx.alwaysOwned, ...ctx.cardsOf(pack)];
    for (const card of ctx.cardsOf(pack).filter((candidate) => candidate.deck === "Combo Deck")) {
      const requirements = ctx.comboRequirements[card.catalogId]?.requirements;
      if (!requirements) { fail(`${pack.id}: ${card.catalogId} has no entry in content/combo-requirements.json`); continue; }
      const gap = unsatisfiedRequirement(requirements, available);
      if (gap) fail(`${pack.id}: Combo ${card.catalogId} (${card.name}) needs ${JSON.stringify(gap.step)} for "${gap.requirement.kind}", but no card a player who owns this pack is guaranteed to have matches it`);
    }
  }
}

function checkEarnRules(ctx, fail) {
  const { earnRules } = ctx.packs;
  const currencyIds = new Set(earnRules.currencies.map((currency) => currency.id));
  const checkGrants = (label, grants) => { for (const id of Object.keys(grants)) if (!currencyIds.has(id)) fail(`${label} grants unknown currency "${id}"`); };
  for (const currency of earnRules.currencies) {
    if (("exchangeRate" in currency) !== ("exchangesFor" in currency)) fail(`currency "${currency.id}" needs both exchangeRate and exchangesFor`);
    if (currency.exchangesFor && !currencyIds.has(currency.exchangesFor)) fail(`currency "${currency.id}" exchanges for unknown currency "${currency.exchangesFor}"`);
  }
  for (const [result, grants] of Object.entries(earnRules.matchResults)) checkGrants(`match result "${result}"`, grants);
  for (const bonus of earnRules.bonuses) checkGrants(`bonus "${bonus.id}"`, bonus.grants);
  const modes = new Map((ctx.game.definition.modes ?? []).map((mode) => [mode.id, mode]));
  for (const rule of earnRules.modes) {
    const mode = modes.get(rule.mode);
    if (!mode) { fail(`earn rule names unknown mode "${rule.mode}"`); continue; }
    const stageIds = new Set((mode.boss?.stages ?? []).map((stage) => stage.id));
    for (const stage of Object.keys(rule.stageMeritMultipliers ?? {})) if (!stageIds.has(stage)) fail(`mode "${rule.mode}" has no Boss stage "${stage}"`);
  }
  for (const mode of modes.keys()) if (!earnRules.modes.some((rule) => rule.mode === mode)) fail(`mode "${mode}" has no earn rule`);
  for (const id of duplicates(earnRules.tables.map((table) => table.id))) fail(`duplicate table rule "${id}"`);
}

function checkLevelTrack(ctx, fail) {
  const { levelTrack, earnRules } = ctx.packs;
  const { levels, diplomas } = levelTrack;
  if (!earnRules.currencies.some((currency) => currency.id === levelTrack.currency)) fail(`level track currency "${levelTrack.currency}" is not an earn-rule currency`);
  levels.forEach((entry, index) => {
    if (entry.level !== index + 1) fail(`levels must be numbered 1..${levels.length} in order; found ${entry.level} at position ${index + 1}`);
    if (index === 0 && entry.meritTotal !== 0) fail("level 1 must start at meritTotal 0");
    if (index > 0 && entry.meritTotal <= levels[index - 1].meritTotal) fail(`level ${entry.level} meritTotal must be greater than level ${levels[index - 1].level}`);
  });
  const beltIds = new Set((ctx.game.definition.progression?.belts ?? []).map((belt) => belt.id));
  diplomas.forEach((diploma, index) => {
    if (!beltIds.has(diploma.belt)) fail(`diploma "${diploma.id}" names unknown belt "${diploma.belt}"`);
    if (index === 0 && diploma.fromLevel !== 1) fail("the first diploma must start at level 1");
    if (index > 0 && diploma.fromLevel <= diplomas[index - 1].fromLevel) fail(`diploma "${diploma.id}" must start after "${diplomas[index - 1].id}"`);
    if (diploma.fromLevel > levels.length) fail(`diploma "${diploma.id}" starts beyond the final level`);
  });
  const rewards = trackRewards(ctx.packs);
  rewards.forEach(({ reward, where }) => checkReward(ctx, reward, where, fail));
  const unlocks = rewards.filter(({ reward }) => reward.kind === "unlock-booster").map(({ reward }) => reward.pack);
  for (const pack of ctx.packs.packs.filter((candidate) => candidate.kind === "booster")) {
    const times = unlocks.filter((id) => id === pack.id).length;
    if (times !== 1) fail(`booster "${pack.id}" is unlocked ${times} times by the level track; expected exactly once`);
  }
  for (const [group, members] of choiceGroups(ctx.packs)) {
    const choices = rewards.filter(({ reward }) => reward.kind === "starter-kit-choice" && reward.choiceGroup === group).length;
    if (choices < 1 || choices > members.length) fail(`choice group "${group}" is offered ${choices} times; expected 1..${members.length}`);
  }
}

const trackRewards = (packs) => [
  ...packs.levelTrack.levels.flatMap((entry) => entry.rewards.map((reward) => ({ reward, where: `level ${entry.level}` }))),
  ...packs.levelTrack.afterFinalLevel.rewards.map((reward) => ({ reward, where: "afterFinalLevel" })),
];

const allRewards = (packs) => [
  ...trackRewards(packs),
  ...packs.packs.filter((pack) => pack.completionReward).map((pack) => ({ reward: pack.completionReward, where: `${pack.id} completionReward` })),
];

const REWARD_FIELDS = {
  "booster-ticket": ["count"], "unlock-booster": ["pack"], "starter-kit-choice": ["choiceGroup"],
  "unlock-character": ["catalogId", "name"], "unlock-boss": ["catalogId", "name"], cosmetic: ["id"], title: ["id"],
};
const UNLOCK_KINDS = { "unlock-character": "characters", "unlock-boss": "bosses" };

function checkReward(ctx, reward, where, fail) {
  const needs = REWARD_FIELDS[reward.kind];
  for (const field of needs) if (!(field in reward)) fail(`${where}: ${reward.kind} reward needs "${field}"`);
  for (const field of Object.keys(reward)) if (field !== "kind" && !needs.includes(field)) fail(`${where}: ${reward.kind} reward does not take "${field}"`);
  if (reward.kind === "unlock-booster" && ctx.packById.get(reward.pack)?.kind !== "booster") fail(`${where}: "${reward.pack}" is not a booster`);
  if (reward.kind === "starter-kit-choice" && !choiceGroups(ctx.packs).has(reward.choiceGroup)) fail(`${where}: unknown choice group "${reward.choiceGroup}"`);
  if (UNLOCK_KINDS[reward.kind] && reward.catalogId) checkCardRef(ctx, reward, ctx.packs.unlockables[UNLOCK_KINDS[reward.kind]].deck, where, fail);
}

function checkCardRef(ctx, ref, deck, where, fail) {
  const card = ctx.cardsById.get(ref.catalogId);
  if (!card) return fail(`${where}: ${ref.catalogId} is not in content/cards.json`);
  if (card.name !== ref.name) fail(`${where}: ${ref.catalogId} is named "${card.name}" in cards.json, not "${ref.name}"`);
  if (card.deck !== deck) fail(`${where}: ${ref.catalogId} is in ${card.deck}, not ${deck}`);
}

// Every Character and Boss Profile is available from the start or unlocked by exactly one reward,
// and the starting sets are enough to play every mode.
function checkUnlockables(ctx, fail) {
  const { unlockables } = ctx.packs;
  const rewards = allRewards(ctx.packs);
  for (const [kind, entry] of Object.entries(unlockables)) {
    entry.starting.forEach((ref) => checkCardRef(ctx, ref, entry.deck, `unlockables.${kind}.starting`, fail));
    const unlockKind = Object.keys(UNLOCK_KINDS).find((rewardKind) => UNLOCK_KINDS[rewardKind] === kind);
    const sources = [
      ...entry.starting.map((ref) => ({ id: ref.catalogId, where: "starting" })),
      ...rewards.filter(({ reward }) => reward.kind === unlockKind).map(({ reward, where }) => ({ id: reward.catalogId, where })),
    ];
    for (const id of duplicates(sources.map((source) => source.id))) fail(`${id} is made available more than once (${sources.filter((source) => source.id === id).map((source) => source.where).join(", ")})`);
    if (ctx.packs.unlockEverything) continue;
    const available = new Set(sources.map((source) => source.id));
    for (const card of ctx.cards.filter((candidate) => candidate.deck === entry.deck)) if (!available.has(card.catalogId)) fail(`${card.catalogId} (${card.name}) is neither starting nor unlocked by any reward`);
  }
  checkStartingRosters(ctx, fail);
}

function checkStartingRosters(ctx, fail) {
  const modes = ctx.game.definition.modes ?? [];
  const largestRoster = Math.max(1, ...modes.map((mode) => mode.roster?.size ?? 1));
  const characters = ctx.packs.unlockables.characters.starting;
  if (characters.length < largestRoster) fail(`only ${characters.length} starting Characters; the largest roster needs ${largestRoster}`);
  const bosses = ctx.packs.unlockables.bosses.starting.map((ref) => ctx.cardsById.get(ref.catalogId)).filter(Boolean);
  for (const mode of modes.filter((candidate) => candidate.boss?.stages?.length)) {
    const fits = mode.boss.stages.map((stage) => bosses.filter((boss) => (boss.tags ?? []).includes(stage.stageFit)));
    if (!hasDistinctAssignment(fits)) fail(`mode "${mode.id}" cannot field a different starting Boss Profile for every stage (${mode.boss.stages.map((stage) => stage.stageFit).join(", ")})`);
  }
}

/** True when each slot can take a different candidate (a tiny bipartite matching by backtracking). */
function hasDistinctAssignment(candidatesPerSlot, used = new Set(), slot = 0) {
  if (slot === candidatesPerSlot.length) return true;
  return candidatesPerSlot[slot].some((candidate) => !used.has(candidate) && hasDistinctAssignment(candidatesPerSlot, new Set([...used, candidate]), slot + 1));
}

function summarize(ctx) {
  return ctx.packs.packs.map((pack) => ({
    id: pack.id,
    kind: pack.kind,
    cards: pack.cards.length,
    subtypes: Object.fromEntries(countBy(ctx.cardsOf(pack), (card) => card.subtype)),
    completionReward: pack.completionReward?.name ?? null,
  }));
}

/** Returns { errors, summary }. An empty errors list means content/packs.json is valid. */
export function checkPacks(inputs) {
  const schemaErrors = validateSchema(inputs.packs, inputs.schema);
  if (schemaErrors.length) return { errors: schemaErrors, summary: [] };
  const ctx = context(inputs);
  const errors = [];
  const fail = (message) => errors.push(message);
  for (const check of [checkUniqueIds, checkCollection, checkBoosterSizes, checkMembership, checkPackFields, checkUnlockables, checkStarterPool, checkComboCoherence, checkEarnRules, checkLevelTrack]) check(ctx, fail);
  return { errors, summary: summarize(ctx) };
}

function main() {
  const inputs = loadPackInputs();
  const { errors, summary } = checkPacks(inputs);
  if (errors.length) {
    console.error(`content/packs.json failed ${errors.length} check(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  const collectible = summary.reduce((total, pack) => total + pack.cards, 0);
  const { characters, bosses } = inputs.packs.unlockables;
  console.log(`content/packs.json (${inputs.packs.status}) is valid: ${summary.length} packs, ${collectible} collectible cards each assigned once; ${characters.starting.length} starting Characters, ${bosses.starting.length} starting Boss Profiles.`);
  for (const pack of summary) console.log(`  ${pack.kind.padEnd(8)} ${pack.id.padEnd(18)} ${String(pack.cards).padStart(3)} cards${pack.completionReward ? `  completion: ${pack.completionReward}` : ""}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
