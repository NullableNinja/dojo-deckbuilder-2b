/**
 * Experiments: optional rule and card packages a table can switch on to test them before they become official
 * (content/experimental/experiments.json). Nothing here knows a card by name.
 *
 * A table asks for experiments through the `experiments` table option: { modules: [ids], exclude: [Catalog IDs] }.
 *   - "rules" modules change how the game plays. Today: "status-effects", the status layer in engine/arena-rules.mjs.
 *   - "cards" modules add new cards (content/experimental/experimental-cards.json), each with its structured effects.
 *   - "retunes" modules replace printed numbers, text and effects of existing cards (content/experimental/retunes.json).
 * `exclude` switches single cards or retunes off inside an enabled module, so each one can be judged on its own.
 *
 * applyExperiments(data, option) returns the data a table plays with: the canonical data untouched when nothing is on,
 * otherwise a patched copy (cards, byId, cardEffectById, comboRequirements). The canonical objects are never mutated.
 */

/** The experiments registry and its packages, as loaded beside the game data (data.experiments). */
export function experimentLab(data) {
  return data?.experiments ?? null;
}

/** Normalise a requested experiments option: sorted, de-duplicated ids, or null when nothing is switched on. */
export function normaliseExperimentsOption(requested) {
  if (requested === undefined || requested === null) return null;
  if (typeof requested !== "object" || Array.isArray(requested)) throw new Error("Table option experiments must be { modules: [...], exclude: [...] }");
  const list = (value, name) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !id)) throw new Error(`Table option experiments.${name} must be an array of ids`);
    return [...new Set(value)].sort();
  };
  const modules = list(requested.modules, "modules");
  if (!modules.length) return null;
  const exclude = list(requested.exclude, "exclude");
  return exclude.length ? { modules, exclude } : { modules };
}

/** The registry's module declarations by id. */
export function experimentModules(lab) {
  return new Map((lab?.registry?.modules ?? []).map((module) => [module.id, module]));
}

/**
 * The modules that are really on: the requested ones plus everything they require, in registry order.
 * Unknown ids are rejected so a typo never silently plays a different game.
 */
export function resolveExperimentModules(lab, option) {
  if (!option?.modules?.length) return [];
  const declared = experimentModules(lab);
  const on = new Set();
  const visit = (id) => {
    const module = declared.get(id);
    if (!module) throw new Error(`Unknown experiment ${id}`);
    if (on.has(id)) return;
    on.add(id);
    for (const required of module.requires ?? []) visit(required);
  };
  for (const id of option.modules) visit(id);
  return [...declared.keys()].filter((id) => on.has(id));
}

/** True when the table needs the status layer (a "rules" module that turns on status effects). */
export function experimentsUseStatusEffects(data, option) {
  const lab = experimentLab(data);
  if (!lab || !option?.modules?.length) return false;
  const declared = experimentModules(lab);
  return resolveExperimentModules(lab, option).some((id) => declared.get(id)?.statusEffects === true);
}

/** Every card and retune an experiment module contributes, for menus and docs: [{ catalogId, name, kind }]. */
export function experimentEntries(lab, moduleId) {
  const module = experimentModules(lab).get(moduleId);
  if (!module) return [];
  if (module.kind === "cards") return (lab.cards?.cards ?? []).filter((entry) => entry.group === module.group).map((entry) => ({ catalogId: entry.card.catalogId, name: entry.card.name, kind: "card", subtype: entry.card.subtype }));
  if (module.kind === "retunes") return (lab.retunes?.retunes ?? []).filter((entry) => entry.group === module.group).map((entry) => ({ catalogId: entry.catalogId, name: entry.name, kind: "retune" }));
  return [];
}

const cache = new WeakMap();

/** The data this table plays with (see the file comment). Cached per canonical data object and option. */
export function applyExperiments(data, option) {
  if (!option?.modules?.length) return data;
  const lab = experimentLab(data);
  if (!lab) throw new Error("Experiments were requested, but the experiment packages are not loaded (data.experiments).");
  const key = JSON.stringify(option);
  const byOption = cache.get(data) ?? new Map();
  cache.set(data, byOption);
  if (byOption.has(key)) return byOption.get(key);

  const declared = experimentModules(lab);
  const modules = resolveExperimentModules(lab, option).map((id) => declared.get(id));
  const exclude = new Set(option.exclude ?? []);
  const cardGroups = new Set(modules.filter((module) => module.kind === "cards").map((module) => module.group));
  const retuneGroups = new Set(modules.filter((module) => module.kind === "retunes").map((module) => module.group));

  const retunes = (lab.retunes?.retunes ?? []).filter((entry) => retuneGroups.has(entry.group) && !exclude.has(entry.catalogId));
  const added = (lab.cards?.cards ?? []).filter((entry) => cardGroups.has(entry.group) && !exclude.has(entry.card.catalogId));
  const known = new Set(data.cards.map((card) => card.catalogId));
  for (const entry of retunes) if (!known.has(entry.catalogId)) throw new Error(`Retune names unknown card ${entry.catalogId}`);
  for (const entry of added) if (known.has(entry.card.catalogId)) throw new Error(`Experimental card ${entry.card.catalogId} collides with a catalog card`);

  const retuneById = new Map(retunes.map((entry) => [entry.catalogId, entry]));
  const cards = data.cards.map((card) => {
    const retune = retuneById.get(card.catalogId);
    if (!retune) return card;
    const patch = retune.patch ?? {};
    return { ...card, ...patch, stats: patch.stats ? { ...card.stats, ...patch.stats } : card.stats, experiment: { kind: "retune", module: modules.find((module) => module.group === retune.group)?.id, printed: { fpCost: card.fpCost, rulesText: card.rulesText, stats: card.stats } } };
  });
  for (const entry of added) cards.push({ ...entry.card, experiment: { kind: "card", module: modules.find((module) => module.group === entry.group)?.id } });

  const cardEffectById = new Map(data.cardEffectById);
  for (const entry of retunes) if (entry.effects) cardEffectById.set(entry.catalogId, { name: cardEffectById.get(entry.catalogId)?.name ?? entry.name, effects: entry.effects });
  for (const entry of added) cardEffectById.set(entry.card.catalogId, { name: entry.card.name, effects: entry.effects ?? [] });

  const comboRequirements = { ...data.comboRequirements, cards: { ...(data.comboRequirements?.cards ?? {}) } };
  for (const entry of added) if (entry.requirements) comboRequirements.cards[entry.card.catalogId] = { name: entry.card.name, displayText: entry.displayText ?? entry.card.rulesText, requirements: entry.requirements };

  const patched = {
    ...data,
    cards,
    byId: new Map(cards.map((card) => [card.catalogId, card])),
    cardEffectById,
    comboRequirements,
    experimentsApplied: { modules: modules.map((module) => module.id), cards: added.map((entry) => entry.card.catalogId), retunes: retunes.map((entry) => entry.catalogId) },
  };
  byOption.set(key, patched);
  return patched;
}
