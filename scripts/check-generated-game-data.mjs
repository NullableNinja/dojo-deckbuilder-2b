import { readFile } from "node:fs/promises";
import { expectedCardEffectAggregate } from "./card-effect-registry.mjs";
import { buildRulesProjection, rulesProjectionMarkdown } from "./rules-projection.mjs";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

const failures = [];
const fail = (message) => failures.push(message);
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const normalized = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();

let effectArchitecture = null;
try {
  effectArchitecture = await expectedCardEffectAggregate();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const [source, generated, canonicalRules, generatedRules, canonicalCards, generatedCards, canonicalVocabulary, generatedVocabulary, canonicalCardEffects, generatedCardEffects, generatedProjection] = await Promise.all([
  readJson("content/dojo-game.json"),
  readJson("app/data/game-definition.json"),
  readJson("content/rules.json"),
  readJson("app/data/rules.json"),
  readJson("content/cards.json"),
  readJson("app/data/cards.json"),
  readJson("content/effects.json"),
  readJson("app/data/effects.json"),
  readJson("content/card-effects.json"),
  readJson("app/data/card-effects.json"),
  readJson("app/data/rules-projection.json"),
]);
const expectedProjection = buildRulesProjection(source, canonicalRules, canonicalCards);

// Canonical/generated boundaries. These are architecture checks, not game-rule assertions.
if (!source?.definition) fail("content/dojo-game.json is missing definition");
if (source.rulesVersion !== source.definition?.rulesVersion) fail("source rulesVersion does not match definition.rulesVersion");
if (source.rulesRevision !== source.definition?.rulesRevision) fail("source rulesRevision does not match definition.rulesRevision");
if (source.definition?.source !== "content/rules.json") fail("definition.source must point to content/rules.json");
if (!sameJson(generated, source.definition)) fail("app/data/game-definition.json has drifted from content/dojo-game.json; run npm run game:generate");
if (!sameJson(generatedRules, canonicalRules)) fail("app/data/rules.json has drifted from content/rules.json; run npm run game:generate");
if (!sameJson(generatedCards, canonicalCards)) fail("app/data/cards.json has drifted from content/cards.json; run npm run game:generate");
if (!sameJson(generatedVocabulary, canonicalVocabulary)) fail("app/data/effects.json has drifted from content/effects.json; run npm run game:generate");
if (effectArchitecture && !sameJson(canonicalCardEffects, effectArchitecture.aggregate)) fail("content/card-effects.json has drifted from the card-effect family sources; run npm run game:generate");
if (!sameJson(generatedCardEffects, canonicalCardEffects)) fail("app/data/card-effects.json has drifted from content/card-effects.json; run npm run game:generate");
if (!sameJson(generatedProjection, expectedProjection)) fail("app/data/rules-projection.json has drifted from canonical game/rules data; run npm run game:generate");

// Cross-file metadata must agree, but the validator does not dictate the current version/revision.
if (!String(canonicalRules.version ?? "").startsWith(String(source.rulesVersion ?? ""))) fail("content/rules.json version does not match the canonical rulesVersion");
if (!String(canonicalCards.version ?? "").startsWith(String(source.rulesVersion ?? ""))) fail("content/cards.json version does not match the canonical rulesVersion");
if (canonicalVocabulary.rulesVersion !== source.rulesVersion) fail("content/effects.json rulesVersion does not match the canonical rulesVersion");
if (canonicalVocabulary.rulesRevision !== source.rulesRevision) fail("content/effects.json rulesRevision does not match the canonical rulesRevision");
if (canonicalCardEffects.rulesVersion !== source.rulesVersion) fail("content/card-effects.json rulesVersion does not match the canonical rulesVersion");
if (canonicalCardEffects.rulesRevision !== source.rulesRevision) fail("content/card-effects.json rulesRevision does not match the canonical rulesRevision");
if (canonicalCards.total !== canonicalCards.cards?.length) fail("content/cards.json total does not match cards.length");
if (generatedCards.total !== generatedCards.cards?.length) fail("app/data/cards.json total does not match cards.length");

// The phase sequence is executable authority, not only presentation text.
const phaseIds = source.definition?.turn?.phases ?? [];
const phaseRules = source.definition?.turn?.phaseRules ?? [];
if (phaseRules.length !== phaseIds.length) fail("definition.turn.phaseRules must describe every canonical phase exactly once");
const phaseRuleIds = new Set();
for (const phase of phaseRules) {
  if (!phase?.id || phaseRuleIds.has(phase.id)) fail(`Duplicate or missing phase rule '${phase?.id ?? "unknown"}'`);
  phaseRuleIds.add(phase?.id);
  if (!phaseIds.includes(phase?.id)) fail(`Phase rule '${phase?.id}' is not present in definition.turn.phases`);
  if (!String(phase?.timing ?? "").trim()) fail(`Phase rule '${phase?.id}' has no timing`);
  if (!String(phase?.actor ?? "").trim()) fail(`Phase rule '${phase?.id}' has no actor`);
  if (!Array.isArray(phase?.actions) && !Array.isArray(phase?.automatic)) fail(`Phase rule '${phase?.id}' has no executable actions or automatic events`);
}

const expectedAuthoritative = [
  "content/dojo-game.json",
  "content/rules.json",
  "content/cards.json",
  "content/effects.json",
  "content/card-effect.schema.json",
  "content/card-effect-family.schema.json",
];
for (const path of expectedAuthoritative) {
  if (!source.sourcePolicy?.authoritativeFiles?.includes(path)) fail(`${path} is canonical but missing from sourcePolicy.authoritativeFiles`);
}
if (!source.sourcePolicy?.authoritativeGlobs?.includes("content/card-effects/*.json")) fail("content/card-effects/*.json is canonical but missing from sourcePolicy.authoritativeGlobs");
if ((source.sourcePolicy?.temporaryMigrationSeeds ?? []).length) fail(`Temporary migration seeds remain: ${source.sourcePolicy.temporaryMigrationSeeds.join(", ")}`);
if ((source.sourcePolicy?.legacySourcesPendingMigration ?? []).length) fail(`Legacy authoritative sources remain: ${source.sourcePolicy.legacySourcesPendingMigration.join(", ")}`);

const expectedGenerated = [
  "content/card-effects.json",
  "app/data/game-definition.json",
  "app/data/rules.json",
  "app/data/cards.json",
  "app/data/effects.json",
  "app/data/card-effects.json",
  "app/data/rules-projection.json",
  "public/downloads/Dojo_Deckbuilder_v2.3_Canonical_Rules.md",
];
for (const path of expectedGenerated) {
  if (!source.sourcePolicy?.generatedFiles?.includes(path)) fail(`${path} is generated but missing from sourcePolicy.generatedFiles`);
}
const generatedMarkdown = await readFile(new URL("public/downloads/Dojo_Deckbuilder_v2.3_Canonical_Rules.md", root), "utf8");
if (generatedMarkdown !== rulesProjectionMarkdown(expectedProjection)) fail("public/downloads/Dojo_Deckbuilder_v2.3_Canonical_Rules.md has drifted; run npm run game:generate");

// Catalog identity/integrity. Inventory size and individual mechanics belong to JSON, not this validator.
const catalogIds = new Set();
for (const card of canonicalCards.cards ?? []) {
  const catalogId = String(card.catalogId ?? "").trim();
  if (!catalogId) fail(`Card '${card.name ?? card.id ?? "unknown"}' has no catalogId`);
  else if (catalogIds.has(catalogId)) fail(`Duplicate catalogId ${catalogId}`);
  else catalogIds.add(catalogId);
  if (!String(card.name ?? "").trim()) fail(`Card '${catalogId || card.id || "unknown"}' has no name`);
}

// Canonical effect vocabulary must describe executable identities. Detailed instance validation
// is performed by card-effect-registry.mjs against content/effects.json.
const vocabularyEffects = canonicalVocabulary.effects ?? {};
if (!Object.keys(vocabularyEffects).length) fail("content/effects.json contains no canonical effects");
for (const [effectId, definition] of Object.entries(vocabularyEffects)) {
  if (!/^[a-z][a-z0-9-]*\.[A-Za-z][A-Za-z0-9]*$/.test(effectId)) fail(`Canonical effect ID '${effectId}' does not use namespace.camelCase format`);
  if (!String(definition.description ?? "").trim()) fail(`Canonical effect '${effectId}' has no description`);
  if (!String(definition.action ?? "").trim()) fail(`Canonical effect '${effectId}' has no runtime action`);
  if (!Array.isArray(definition.allowedTriggers) || !definition.allowedTriggers.length) fail(`Canonical effect '${effectId}' has no allowedTriggers`);
  if (!Array.isArray(definition.allowedTargets) || !definition.allowedTargets.length) fail(`Canonical effect '${effectId}' has no allowedTargets`);
}

// Starter composition is canonical data. Validate references and values without hard-coding deck size or card identities.
for (const entry of source.definition?.starterDeck ?? []) {
  if (!catalogIds.has(entry.catalogId)) fail(`Starter card ${entry.catalogId} is missing from content/cards.json`);
  if (!Number.isInteger(Number(entry.copies)) || Number(entry.copies) <= 0) fail(`Starter card ${entry.catalogId} has invalid copies '${entry.copies}'`);
}

// Rules document structural integrity. Rule content itself is authoritative and is intentionally not duplicated here.
const chapterIds = new Set();
const sectionIds = new Set();
for (const chapter of canonicalRules.chapters ?? []) {
  if (!chapter.id) fail(`Rule chapter ${chapter.number ?? "?"} has no id`);
  else if (chapterIds.has(chapter.id)) fail(`Duplicate rule chapter id ${chapter.id}`);
  else chapterIds.add(chapter.id);
  for (const section of chapter.sections ?? []) {
    if (!section.id) fail(`Rule section '${section.title ?? "unknown"}' in chapter ${chapter.id ?? "unknown"} has no id`);
    else if (sectionIds.has(section.id)) fail(`Duplicate rule section id ${section.id}`);
    else sectionIds.add(section.id);
  }
}

const glossaryTerms = new Set();
for (const entry of canonicalRules.glossary ?? []) {
  const key = normalized(entry.term);
  if (!key) fail("Glossary contains an entry without a term");
  else if (glossaryTerms.has(key)) fail(`Duplicate glossary term ${entry.term}`);
  else glossaryTerms.add(key);
}

const rulingIds = new Set();
for (const ruling of canonicalRules.officialRulings ?? []) {
  if (!ruling.id) fail(`Official ruling '${ruling.title ?? "unknown"}' has no id`);
  else if (rulingIds.has(ruling.id)) fail(`Duplicate official ruling id ${ruling.id}`);
  else rulingIds.add(ruling.id);
}

// Canonical mode definitions: every mode is declared once, cites real rulings and
// chapters, and any Boss ladder points at real Boss Stage cards.
const modeIds = new Set();
const modes = source.definition?.modes ?? [];
if (!modes.some((mode) => mode.id === source.definition?.mode?.id)) fail("definition.modes must include the legacy definition.mode entry");
for (const mode of modes) {
  if (!mode.id) { fail("A mode definition has no id"); continue; }
  if (modeIds.has(mode.id)) fail(`Duplicate mode id ${mode.id}`);
  modeIds.add(mode.id);
  if (!chapterIds.has(mode.rulesSection)) fail(`Mode ${mode.id} cites unknown rules chapter ${mode.rulesSection}`);
  if (!(mode.players?.min >= 1 && mode.players.max >= mode.players.min)) fail(`Mode ${mode.id} has an invalid player range`);
  if (!(mode.roster?.size >= 1 && mode.roster.active === 1)) fail(`Mode ${mode.id} has an invalid roster`);
  if (!(mode.startingHp > 0 && mode.maxRounds > 0)) fail(`Mode ${mode.id} needs startingHp and maxRounds`);
  for (const id of mode.rulings ?? []) if (!rulingIds.has(id)) fail(`Mode ${mode.id} cites unknown ruling ${id}`);
  for (const stage of mode.boss?.stages ?? []) {
    const stageCard = canonicalCards.cards.find((card) => card.catalogId === stage.stageCard);
    if (stageCard?.subtype !== "Boss Stage") fail(`Mode ${mode.id} stage ${stage.id} does not point at a Boss Stage card`);
    else if (Number(stageCard.stats?.HP) !== stage.hp) fail(`Mode ${mode.id} stage ${stage.id} HP ${stage.hp} differs from printed ${stageCard.stats?.HP}`);
  }
  if (mode.boss) {
    const arsenal = canonicalCards.cards.filter((card) => mode.boss.arsenal.subtypes.includes(card.subtype)).length;
    if (arsenal !== mode.boss.arsenal.size) fail(`Mode ${mode.id} Boss Arsenal has ${arsenal} cards, expected ${mode.boss.arsenal.size}`);
  }
}
const legacyMode = modes.find((mode) => mode.id === source.definition?.mode?.id);
if (legacyMode && (legacyMode.startingHp !== source.definition.mode.startingHp || legacyMode.maxRounds !== source.definition.mode.maxRounds || legacyMode.victory?.blackBelt !== source.definition.mode.blackBeltVictory)) fail("definition.modes Quick Duel entry has drifted from definition.mode");

const houseRuleNames = new Set();
for (const rule of canonicalRules.houseRules ?? []) {
  const key = normalized(rule.name);
  if (!key) fail("House rules contain an unnamed rule");
  else if (houseRuleNames.has(key)) fail(`Duplicate house rule ${rule.name}`);
  else houseRuleNames.add(key);
}

// Table options: one declaration per engine option, and every house-rule variant points at a
// canonical house rule. Every rule a Quick Duel table may enable needs an engine variant.
const tableOptions = source.definition?.tableOptions ?? [];
const tableOptionIds = new Set();
for (const option of tableOptions) {
  if (!option.id || !option.label || !String(option.description ?? "").trim() || option.default === undefined) fail(`Table option '${option.id ?? "unknown"}' needs id, label, default and description`);
  if (tableOptionIds.has(option.id)) fail(`Duplicate table option ${option.id}`);
  tableOptionIds.add(option.id);
}
for (const id of ["tempo", "locations", "balancedMarket", "houseRules", "cardPool"]) if (!tableOptionIds.has(id)) fail(`definition.tableOptions does not declare ${id}`);
const cardIds = new Set(canonicalCards.cards.map((card) => card.catalogId));
const catalogDecks = new Set(canonicalCards.cards.map((card) => card.deck));
for (const deck of tableOptions.find((option) => option.id === "cardPool")?.pooledDecks ?? []) if (!catalogDecks.has(deck)) fail(`Table option cardPool pools unknown deck ${deck}`);
const houseRuleIds = new Set((canonicalRules.houseRules ?? []).map((rule) => rule.id));
const variantIds = new Set((tableOptions.find((option) => option.id === "houseRules")?.variants ?? []).map((variant) => variant.id));
for (const id of variantIds) if (!houseRuleIds.has(id)) fail(`House-rule variant ${id} has no canonical house rule in content/rules.json`);
for (const rule of canonicalRules.houseRules ?? []) if (rule.quickDuel?.status === "supported" && !variantIds.has(rule.id)) fail(`House rule ${rule.id} is marked supported but has no engine variant in definition.tableOptions`);

if (failures.length) {
  console.error("Dojo canonical-source check FAILED:\n");
  for (const message of failures) console.error(` - ${message}`);
  process.exitCode = 1;
} else {
  console.log(`Dojo canonical-source check PASS — ${source.rulesRevision}`);
  console.log("Canonical mechanical source: content/dojo-game.json");
  console.log("Canonical rules source: content/rules.json");
  console.log(`Canonical card source: content/cards.json (${canonicalCards.total} cards)`);
  console.log(`Canonical effect vocabulary: content/effects.json (${Object.keys(vocabularyEffects).length} reusable effects)`);
  console.log(`Card-effect family sources: ${effectArchitecture?.families.length ?? 0}`);
  console.log(`Structured card entries: ${Object.keys(canonicalCardEffects.cards ?? {}).length}`);
}
