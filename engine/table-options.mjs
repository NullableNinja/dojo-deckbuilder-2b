/**
 * Table options: the switches a table agrees on before a game starts (Tempo, Locations, the
 * Market pool, a balanced opening row, canonical house rules and the card pool). Each option is described in
 * `definition.tableOptions` (content/dojo-game.json), so the engine and every UI read the same
 * ids, labels, defaults and parameters. Nothing here knows a card by name.
 */

import { normaliseExperimentsOption } from "./experiments.mjs";

export const TABLE_OPTION_IDS = Object.freeze(["tempo", "locations", "balancedMarket", "houseRules", "cardPool", "experiments"]);

function optionDefinitions(definition) {
  const declared = Array.isArray(definition?.tableOptions) ? definition.tableOptions : [];
  return new Map(declared.map((option) => [option.id, option]));
}

/** The declaration of one table option, or null when the rules do not declare it. */
export function tableOption(definition, id) { return optionDefinitions(definition).get(id) ?? null; }

/** House-rule variants the engine can execute, keyed by their content/rules.json id. */
export function houseRuleVariants(definition) {
  return new Map((tableOption(definition, "houseRules")?.variants ?? []).map((variant) => [variant.id, variant]));
}

// Used only when older generated data declares no tableOptions: today's engine behaviour.
const FALLBACK_DEFAULTS = Object.freeze({ tempo: true, locations: true, balancedMarket: false });

function resolveBoolean(declared, id, requested) {
  if (requested === undefined) return Boolean(declared.get(id)?.default ?? FALLBACK_DEFAULTS[id]);
  if (typeof requested !== "boolean") throw new Error(`Table option ${id} must be true or false`);
  return requested;
}

function resolveHouseRules(definition, requested = []) {
  if (!Array.isArray(requested)) throw new Error("Table option houseRules must be an array of house-rule ids");
  const variants = houseRuleVariants(definition);
  for (const id of requested) if (!variants.has(id)) throw new Error(`House rule ${id} has no engine variant in definition.tableOptions`);
  // Canonical order, no duplicates: the same set of rules always produces the same setup.
  return [...variants.keys()].filter((id) => requested.includes(id));
}

// Used only when older generated data declares no cardPool option.
const FALLBACK_POOLED_DECKS = Object.freeze(["Technique Deck", "Item Deck", "Combo Deck", "Location Deck", "Boss Profile Deck"]);

/** The decks a card pool filters (definition.tableOptions cardPool.pooledDecks). */
export function pooledDecks(definition) {
  return tableOption(definition, "cardPool")?.pooledDecks ?? FALLBACK_POOLED_DECKS;
}

/**
 * The card pool: null (the full catalog) or a sorted, de-duplicated list of Catalog IDs, so the
 * same collections always produce the same setup, whatever order they arrived in.
 */
function resolveCardPool(requested) {
  if (requested === undefined || requested === null) return null;
  if (!Array.isArray(requested) || requested.some((id) => typeof id !== "string" || !id)) throw new Error("Table option cardPool must be null or an array of Catalog IDs");
  return [...new Set(requested)].sort();
}

/**
 * Merge the requested table options with the canonical defaults.
 * Unknown option ids are rejected so a typo never silently plays a different game.
 */
export function resolveTableOptions(definition, requested = {}) {
  const declared = optionDefinitions(definition);
  for (const id of Object.keys(requested ?? {})) if (!TABLE_OPTION_IDS.includes(id)) throw new Error(`Unknown table option ${id}`);
  const options = {
    tempo: resolveBoolean(declared, "tempo", requested?.tempo),
    locations: resolveBoolean(declared, "locations", requested?.locations),
    balancedMarket: resolveBoolean(declared, "balancedMarket", requested?.balancedMarket),
    houseRules: resolveHouseRules(definition, requested?.houseRules ?? declared.get("houseRules")?.default ?? []),
  };
  // The full catalog is recorded by leaving the pool out, so setups, results and fingerprints of
  // tables without a pool stay exactly as they were before pools existed.
  const cardPool = resolveCardPool(requested?.cardPool);
  if (cardPool) options.cardPool = cardPool;
  // Experiments (engine/experiments.mjs) are recorded only when some are on, for the same reason.
  const experiments = normaliseExperimentsOption(requested?.experiments);
  if (experiments) options.experiments = experiments;
  return options;
}

/** True when every option equals its canonical default. */
export function tableOptionsAreDefault(definition, options) {
  return JSON.stringify(options) === JSON.stringify(resolveTableOptions(definition, {}));
}

function setPath(target, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let cursor = target;
  for (const key of keys) {
    if (cursor?.[key] === undefined) throw new Error(`House rule path ${path} does not exist in the game definition`);
    cursor = cursor[key];
  }
  if (!(last in cursor)) throw new Error(`House rule path ${path} does not exist in the game definition`);
  cursor[last] = value;
}

/** Fast Belts style rule: lower every threshold from a named Belt on, keeping a minimum step. */
function reduceBeltThresholds(belts, { fromBelt, reduceBy = 0, minimumAbovePrevious = 1 }) {
  const start = belts.findIndex((belt) => belt.name === fromBelt || belt.id === fromBelt);
  if (start < 1) throw new Error(`House rule names unknown or first Belt ${fromBelt}`);
  for (let index = start; index < belts.length; index += 1) {
    belts[index].xp = Math.max(Number(belts[index - 1].xp) + Number(minimumAbovePrevious), Number(belts[index].xp) - Number(reduceBy));
  }
}

const VARIANT_APPLIERS = {
  set: (definition, changes) => { for (const [path, value] of Object.entries(changes)) setPath(definition, path, value); },
  beltThresholds: (definition, rule) => reduceBeltThresholds(definition.progression.belts, rule),
};

/**
 * The game definition the engine plays under these options. House rules are applied to a copy,
 * so the shared canonical definition is never mutated. Without house rules the canonical object
 * is returned unchanged.
 */
export function effectiveDefinition(definition, options) {
  if (!options.houseRules.length) return definition;
  const effective = structuredClone(definition);
  const variants = houseRuleVariants(definition);
  for (const id of options.houseRules) {
    const { id: _id, ...changes } = variants.get(id);
    for (const [kind, parameters] of Object.entries(changes)) {
      const apply = VARIANT_APPLIERS[kind];
      if (!apply) throw new Error(`House rule ${id} uses unsupported variant kind ${kind}`);
      apply(effective, parameters);
    }
  }
  return effective;
}
