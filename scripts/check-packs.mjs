#!/usr/bin/env node
// Validates content/packs.json: its schema shape, pack membership against content/cards.json,
// rarity and booster arithmetic, starter-pool health, Combo coherence, earn rules and the
// Clearance Level track. Run directly (`npm run packs:check`) or import checkPacks() in tests.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stepMatches } from "../engine/combo-runtime.mjs";

const ZONES = ["High", "Mid", "Low"];
const SHARE_EPSILON = 1e-9;
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
const sum = (values) => values.reduce((total, value) => total + value, 0);
const cardZones = (card) => (String(card.zone).trim() === "Any" ? ZONES : String(card.zone ?? "").split(/,\s*/).filter((zone) => ZONES.includes(zone)));

function context(inputs) {
  const { packs, cards } = inputs;
  const cardsById = new Map(cards.map((card) => [card.catalogId, card]));
  const collectible = cards.filter((card) => packs.collection.collectibleDecks.includes(card.deck));
  const rarityById = new Map(packs.rarities.map((rarity) => [rarity.id, rarity]));
  const packById = new Map(packs.packs.map((pack) => [pack.id, pack]));
  const everyProfilePacks = packs.packs.filter((pack) => pack.kind === "starter" && pack.grant === "every-profile");
  const cardsOf = (pack) => pack.cards.map((entry) => cardsById.get(entry.catalogId)).filter(Boolean);
  const starterDeck = (inputs.game.definition.starterDeck ?? []).map((entry) => cardsById.get(entry.catalogId)).filter(Boolean);
  const alwaysOwned = [...starterDeck, ...everyProfilePacks.flatMap(cardsOf)];
  return { ...inputs, cardsById, collectible, rarityById, packById, everyProfilePacks, cardsOf, alwaysOwned };
}

function checkUniqueIds(ctx, fail) {
  const { packs } = ctx;
  const groups = {
    rarity: packs.rarities, pack: packs.packs, currency: packs.earnRules.currencies, slot: packs.boosterRules.slots,
    diploma: packs.levelTrack.diplomas, "match pool": packs.collection.matchPools, bonus: packs.earnRules.bonuses,
  };
  for (const [label, items] of Object.entries(groups)) for (const id of duplicates(items.map((item) => item.id))) fail(`duplicate ${label} id "${id}"`);
}

function checkCollection(ctx, fail) {
  const { packs, cards, game } = ctx;
  const { collectibleDecks, alwaysAvailableDecks, matchPools } = packs.collection;
  if (packs.rulesVersion !== game.rulesVersion) fail(`rulesVersion ${packs.rulesVersion} does not match content/dojo-game.json (${game.rulesVersion})`);
  const catalogDecks = new Set(cards.map((card) => card.deck));
  for (const deck of [...collectibleDecks, ...alwaysAvailableDecks]) if (!catalogDecks.has(deck)) fail(`unknown deck "${deck}"`);
  for (const deck of collectibleDecks) if (alwaysAvailableDecks.includes(deck)) fail(`deck "${deck}" is both collectible and always available`);
  for (const deck of catalogDecks) if (!collectibleDecks.includes(deck) && !alwaysAvailableDecks.includes(deck)) fail(`deck "${deck}" is neither collectible nor always available`);
  const pooledDecks = matchPools.flatMap((pool) => pool.decks);
  for (const deck of duplicates(pooledDecks)) fail(`deck "${deck}" appears in more than one match pool`);
  for (const deck of collectibleDecks) if (!pooledDecks.includes(deck)) fail(`collectible deck "${deck}" belongs to no match pool`);
  for (const deck of pooledDecks) if (!collectibleDecks.includes(deck)) fail(`match pool deck "${deck}" is not collectible`);
}

function checkRarities(ctx, fail) {
  const eligible = ctx.packs.rarities.filter((rarity) => rarity.boosterEligible);
  if (!eligible.length) fail("no booster-eligible rarity");
  if (Math.abs(sum(eligible.map((rarity) => rarity.targetShare)) - 1) > SHARE_EPSILON) fail("booster-eligible rarity targetShare values must total 1");
  for (const rarity of ctx.packs.rarities) if (!rarity.boosterEligible && rarity.targetShare !== 0) fail(`rarity "${rarity.id}" is not booster-eligible, so its targetShare must be 0`);
}

function checkBoosterRules(ctx, fail) {
  const rules = ctx.packs.boosterRules;
  const isEligible = (id) => ctx.rarityById.get(id)?.boosterEligible === true;
  if (sum(rules.slots.map((slot) => slot.count)) !== rules.cardsPerPack) fail(`booster slot counts must total cardsPerPack (${rules.cardsPerPack})`);
  for (const slot of rules.slots) {
    for (const rarity of Object.keys(slot.weights)) if (!isEligible(rarity)) fail(`slot "${slot.id}" weights unknown or non-booster rarity "${rarity}"`);
    const total = sum(Object.values(slot.weights));
    if (Math.abs(total - 100) > SHARE_EPSILON) fail(`slot "${slot.id}" weights total ${total}, expected 100`);
  }
  if (!isEligible(rules.pity.rarity)) fail(`pity rarity "${rules.pity.rarity}" is not a booster rarity`);
}

function checkMembership(ctx, fail) {
  const { packs, cardsById, collectible, rarityById } = ctx;
  const entries = packs.packs.flatMap((pack) => pack.cards.map((entry) => ({ ...entry, pack })));
  for (const entry of entries) {
    const card = cardsById.get(entry.catalogId);
    const where = `${entry.pack.id}: ${entry.catalogId}`;
    if (!card) { fail(`${where} is not in content/cards.json`); continue; }
    if (card.name !== entry.name) fail(`${where} is named "${card.name}" in cards.json, not "${entry.name}"`);
    if (!packs.collection.collectibleDecks.includes(card.deck)) fail(`${where} is in ${card.deck}, which is not collectible`);
    const rarity = rarityById.get(entry.rarity);
    if (!rarity) fail(`${where} has unknown rarity "${entry.rarity}"`);
    else if (entry.pack.kind === "booster" && !rarity.boosterEligible) fail(`${where} is in a booster but has non-booster rarity "${entry.rarity}"`);
    else if (entry.pack.kind === "starter" && rarity.boosterEligible) fail(`${where} is in a starter pack but has booster rarity "${entry.rarity}"`);
  }
  for (const id of duplicates(entries.map((entry) => entry.catalogId))) {
    fail(`${id} is assigned more than once (${entries.filter((entry) => entry.catalogId === id).map((entry) => entry.pack.id).join(", ")})`);
  }
  if (!packs.collection.enabled) return;
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

function checkBoosterRarityMix(ctx, fail) {
  const eligible = ctx.packs.rarities.filter((rarity) => rarity.boosterEligible);
  const tolerance = ctx.packs.boosterRules.rarityTolerance;
  for (const pack of ctx.packs.packs.filter((candidate) => candidate.kind === "booster")) {
    const counts = countBy(pack.cards, (entry) => entry.rarity);
    for (const rarity of eligible) {
      const count = counts.get(rarity.id) ?? 0;
      if (!count) fail(`booster "${pack.id}" has no ${rarity.id} cards, so its slots and pity rule cannot be honoured`);
      const share = count / pack.cards.length;
      if (Math.abs(share - rarity.targetShare) > tolerance + SHARE_EPSILON) fail(`booster "${pack.id}" is ${(share * 100).toFixed(1)}% ${rarity.id}; target ${(rarity.targetShare * 100).toFixed(1)}% ± ${(tolerance * 100).toFixed(1)}%`);
    }
  }
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
  const rewards = [...levels.flatMap((entry) => entry.rewards.map((reward) => ({ reward, where: `level ${entry.level}` }))), ...levelTrack.afterFinalLevel.rewards.map((reward) => ({ reward, where: "afterFinalLevel" }))];
  rewards.forEach(({ reward, where }) => checkLevelReward(ctx, reward, where, fail));
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

function checkLevelReward(ctx, reward, where, fail) {
  const needs = { "booster-ticket": ["count"], "unlock-booster": ["pack"], "starter-kit-choice": ["choiceGroup"], cosmetic: ["id"], title: ["id"] }[reward.kind];
  for (const field of needs) if (!(field in reward)) fail(`${where}: ${reward.kind} reward needs "${field}"`);
  for (const field of Object.keys(reward)) if (field !== "kind" && !needs.includes(field)) fail(`${where}: ${reward.kind} reward does not take "${field}"`);
  if (reward.kind === "unlock-booster" && ctx.packById.get(reward.pack)?.kind !== "booster") fail(`${where}: "${reward.pack}" is not a booster`);
  if (reward.kind === "starter-kit-choice" && !choiceGroups(ctx.packs).has(reward.choiceGroup)) fail(`${where}: unknown choice group "${reward.choiceGroup}"`);
}

function summarize(ctx) {
  return ctx.packs.packs.map((pack) => ({
    id: pack.id,
    kind: pack.kind,
    cards: pack.cards.length,
    subtypes: Object.fromEntries(countBy(ctx.cardsOf(pack), (card) => card.subtype)),
    rarities: Object.fromEntries(countBy(pack.cards, (entry) => entry.rarity)),
  }));
}

/** Returns { errors, summary }. An empty errors list means content/packs.json is valid. */
export function checkPacks(inputs) {
  const schemaErrors = validateSchema(inputs.packs, inputs.schema);
  if (schemaErrors.length) return { errors: schemaErrors, summary: [] };
  const ctx = context(inputs);
  const errors = [];
  const fail = (message) => errors.push(message);
  for (const check of [checkUniqueIds, checkCollection, checkRarities, checkBoosterRules, checkMembership, checkPackFields, checkBoosterRarityMix, checkStarterPool, checkComboCoherence, checkEarnRules, checkLevelTrack]) check(ctx, fail);
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
  console.log(`content/packs.json (${inputs.packs.status}) is valid: ${summary.length} packs, ${collectible} collectible cards each assigned once.`);
  for (const pack of summary) console.log(`  ${pack.kind.padEnd(8)} ${pack.id.padEnd(18)} ${String(pack.cards).padStart(3)} cards  ${JSON.stringify(pack.rarities)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
