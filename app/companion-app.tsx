"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { lazyWithRetry } from "./lazy-with-retry";
import { createPortal } from "react-dom";
import { AVATAR_IMAGES } from "./avatar-catalog";
import cardPlaceholderUrl from "./assets/art/card-placeholder-v2.webp";
import headerBackstoryUrl from "./assets/art/backstory-expo-v3.webp";
import headerCardsUrl from "./assets/art/cards-archive-v3.webp";
import headerRulesUrl from "./assets/art/full-rules-field-guide-v1.webp";
import headerGlossaryUrl from "./assets/art/glossary-fieldguide-v3.webp";
import headerQuickstartUrl from "./assets/art/quickstart-expo-v3.webp";
import headerRulingsUrl from "./assets/art/rulings-dispute-v3.webp";
import heroPaperFuUrl from "./assets/art/home-expo-v3.webp";
import indexPlayArtUrl from "./assets/fighters/karatesaurus.webp";
import starterJabArtUrl from "./assets/cards/starters/ddb-sta-core-003_basic-jab.webp";
import highGuardArtUrl from "./assets/cards/starters/ddb-sta-core-009_high-guard.webp";
import cardsJson from "./data/cards.json";
import { CANONICAL_RULES, COMBAT_FORMULA_TEXT, COMBAT_SEQUENCE, COMBAT_XP_RULE, DEFENSE_WITHOUT_CARD_RULE, GAME_MODES as CANONICAL_GAME_MODES, HAND_SIZE, PHASES as CANONICAL_PHASES, PHASE_DETAILS as CANONICAL_PHASE_DETAILS, ROUND_STRUCTURE_SUMMARY, RULE_PRIORITY, SETUP_STEPS, STARTER_CARDS as CANONICAL_STARTER_CARDS, STARTER_EXAMPLES, TABLE_JUDGE_STEPS } from "./canonical-presentation";
import { PAPER_FU_TOAST_EVENT, type PaperFuToastDetail } from "./paper-fu-events";
import { paperScrollBehavior, ToastContext, usePaperToast, type ToastInput, type ToastKind } from "./paper-toast-context";
import { SectionHeader } from "./section-header";
import { CardLibrary } from "./card-library";
import { RulesReader } from "./rules-reader";
import { DetailModal } from "./detail-modal";
import { GlossaryPage } from "./glossary-page";
import { QuickstartSetup } from "./quickstart-setup";
import { EvidenceBoard } from "./evidence-board";
import "./rulings-docket.css";
import { dayNumber, isFeaturable, pickBySeed } from "./daily-card";
import SearchPage from "./search-page";
import DesignLab from "./design-lab";
import SettingsPage from "./settings-page";
import CollectionPage from "./collection-page";
import { DailyClaim } from "./daily-claim";
import { CareerBand, CareerPanel, CareerRing, useCareerSummary } from "./career-ui";
import { ModeCard, modeMetaFor } from "./mode-card";
import { navigate, readRoute, replaceRoute, subscribeToRoute, topLevelRoute, type RulingsTab, type SitePage, type SiteRoute } from "./routing";
import { SEARCH_GROUP_LABELS, cardSearchText, groupSearchResults, normalizeSearchQuery, publicCardDetails, searchDojo, type CardEntry, type SearchResult } from "./search";
import { DESKTOP_NAVIGATION, MOBILE_BOTTOM_NAVIGATION, MOBILE_MENU_NAVIGATION, navigationItemIsActive } from "./site-navigation";
import { AVATAR_OPTIONS, applyThemeToDocument, readInitialTheme, readUserPreferences, THEME_STORAGE_KEY, updateUserPreferences, type AccentKey, type AvatarKey, type PresentationPreferences } from "./user-preferences";

// The game client is the largest chunk; load it only when someone opens the mat.
const PlaytestView = lazyWithRetry(() => import("./playtest"));
const TestArena = lazyWithRetry(() => import("./test-arena"));
const MatLoading = () => <div className="mat-loading" role="status"><b>Unfolding the mat…</b><span>Filing your fighter paperwork.</span></div>;

const characterCardModules = import.meta.glob<string>("./assets/cards/characters/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const CHARACTER_CARD_URLS = Object.fromEntries(
  Object.entries(characterCardModules).map(([path, url]) => [`/cards/characters/${path.split("/").at(-1)}`, url]),
);

const bossCardModules = import.meta.glob<string>("./assets/cards/bosses/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const BOSS_CARD_URLS = Object.fromEntries(
  Object.entries(bossCardModules).map(([path, url]) => [`/cards/bosses/${path.split("/").at(-1)}`, url]),
);

const attackCardModules = import.meta.glob<string>("./assets/cards/attacks/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const ATTACK_CARD_URLS = Object.fromEntries(
  Object.entries(attackCardModules).map(([path, url]) => [`/cards/attacks/${path.split("/").at(-1)}`, url]),
);

const defenseCardModules = import.meta.glob<string>("./assets/cards/defenses/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const DEFENSE_CARD_URLS = Object.fromEntries(
  Object.entries(defenseCardModules).map(([path, url]) => [`/cards/defenses/${path.split("/").at(-1)}`, url]),
);

const kataCardModules = import.meta.glob<string>("./assets/cards/katas/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const KATA_CARD_URLS = Object.fromEntries(
  Object.entries(kataCardModules).map(([path, url]) => [`/cards/katas/${path.split("/").at(-1)}`, url]),
);

const consumableCardModules = import.meta.glob<string>("./assets/cards/consumables/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const CONSUMABLE_CARD_URLS = Object.fromEntries(
  Object.entries(consumableCardModules).map(([path, url]) => [`/cards/consumables/${path.split("/").at(-1)}`, url]),
);
const defenseEquipmentCardModules = import.meta.glob<string>("./assets/cards/defense-equipment/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const DEFENSE_EQUIPMENT_CARD_URLS = Object.fromEntries(
  Object.entries(defenseEquipmentCardModules).map(([path, url]) => [`/cards/defense-equipment/${path.split("/").at(-1)}`, url]),
);
const gearCardModules = import.meta.glob<string>("./assets/cards/gear/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const GEAR_CARD_URLS = Object.fromEntries(
  Object.entries(gearCardModules).map(([path, url]) => [`/cards/gear/${path.split("/").at(-1)}`, url]),
);
const weaponCardModules = import.meta.glob<string>("./assets/cards/weapons/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const WEAPON_CARD_URLS = Object.fromEntries(
  Object.entries(weaponCardModules).map(([path, url]) => [`/cards/weapons/${path.split("/").at(-1)}`, url]),
);
const reactionCardModules = import.meta.glob<string>("./assets/cards/reactions/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const REACTION_CARD_URLS = Object.fromEntries(
  Object.entries(reactionCardModules).map(([path, url]) => [`/cards/reactions/${path.split("/").at(-1)}`, url]),
);
const comboCardModules = import.meta.glob<string>("./assets/cards/combos/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const COMBO_CARD_URLS = Object.fromEntries(
  Object.entries(comboCardModules).map(([path, url]) => [`/cards/combos/${path.split("/").at(-1)}`, url]),
);
const starterCardModules = import.meta.glob<string>("./assets/cards/starters/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const STARTER_CARD_URLS = Object.fromEntries(
  Object.entries(starterCardModules).map(([path, url]) => [`/cards/starters/${path.split("/").at(-1)}`, url]),
);
const locationCardModules = import.meta.glob<string>("./assets/cards/locations/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const LOCATION_CARD_URLS = Object.fromEntries(
  Object.entries(locationCardModules).map(([path, url]) => [`/cards/locations/${path.split("/").at(-1)}`, url]),
);
const COMPLETE_CARD_URLS_BY_CATALOG_ID = Object.fromEntries(
  Object.entries({ ...ATTACK_CARD_URLS, ...DEFENSE_CARD_URLS, ...KATA_CARD_URLS, ...CONSUMABLE_CARD_URLS, ...DEFENSE_EQUIPMENT_CARD_URLS, ...GEAR_CARD_URLS, ...WEAPON_CARD_URLS, ...REACTION_CARD_URLS, ...COMBO_CARD_URLS, ...STARTER_CARD_URLS, ...LOCATION_CARD_URLS }).flatMap(([path, url]) => {
    const match = path.match(/\/(ddb-(?:atk|def|kat|con|deq|gea|wpn|rit|cmb|sta|loc)-core-\d{3})_/i);
    return match ? [[match[1].toUpperCase(), url]] : [];
  }),
);

type ViewId = Exclude<SitePage, "search">;
type RuleBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "table"; rows: (string | number)[][] };
type RuleSection = { id: string; title: string; content: RuleBlock[] };
type RuleChapter = { id: string; number: number; title: string; fullTitle: string; intro: RuleBlock[]; sections: RuleSection[] };
type HouseRule = { id: string; name: string; rule: string; category?: string; summary?: string; notes?: string; quickDuel: { status: "supported" | "planned" | "not-applicable"; reason: string } };
type OfficialRuling = { id: string; filed: string; tag: string; title: string; ruling: string };
type Theme = "light" | "dark";
export type { ToastKind, ToastInput };
type PaperToast = ToastInput & { id: number };

let toastSequence = 0;
const paperHaptic = (pattern: number | number[] = 8) => {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
};

const cardData = cardsJson as unknown as { version: string; cards: CardEntry[]; counts: Record<string, number>; decks: string[]; total: number };
const rulesData = CANONICAL_RULES as unknown as { version: string; chapters: RuleChapter[]; officialRulings: OfficialRuling[]; glossary: { term: string; meaning: string }[]; houseRules: HouseRule[] };
const storyChapter = rulesData.chapters.find((chapter) => chapter.number === 1);
const ruleChapters = rulesData.chapters.filter((chapter) => chapter.number >= 1 && chapter.number <= 16);
const DOWNLOADS = {
  fullRules: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Full_Rules.docx`,
  canonicalRules: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Canonical_Rules.md`,
  quickStart: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Quick_Start.docx`,
  glossary: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Glossary.docx`,
  cardCatalog: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Card_Catalog.xlsx`,
  defenseEquipmentSources: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Defensive_Equipment_Editable_ORA.zip`,
  consumableSources: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Consumable_Cards_Editable_ORA.zip`,
};
const INDEX_ART: Partial<Record<SitePage, string>> = {
  home: heroPaperFuUrl,
  playtest: indexPlayArtUrl,
  quickstart: headerQuickstartUrl,
  story: headerBackstoryUrl,
  rules: headerRulesUrl,
  cards: headerCardsUrl,
  rulings: headerRulingsUrl,
  glossary: headerGlossaryUrl,
};
const VIEW_LABELS: Record<SitePage, string> = {
  home: "Dojo Desk",
  playtest: "Play the Game",
  quickstart: "Quick Start",
  story: "Backstory",
  rules: "Full Rules",
  cards: "Card Library",
  rulings: "Rulings & Variants",
  glossary: "Glossary",
  lab: "Design Lab",
  settings: "Settings",
  collection: "Collection",
  arena: "Test Arena",
  search: "Search",
};
const CARD_IMAGE_URLS: Record<string, string> = {
  ...CHARACTER_CARD_URLS,
  ...BOSS_CARD_URLS,
  ...ATTACK_CARD_URLS,
  ...DEFENSE_CARD_URLS,
  ...KATA_CARD_URLS,
  ...CONSUMABLE_CARD_URLS,
  ...DEFENSE_EQUIPMENT_CARD_URLS,
  ...GEAR_CARD_URLS,
  ...WEAPON_CARD_URLS,
  ...REACTION_CARD_URLS,
  ...COMBO_CARD_URLS,
  ...STARTER_CARD_URLS,
  ...LOCATION_CARD_URLS,
};
const GOLDEN_RULE = ruleChapters.flatMap((chapter) => [...chapter.intro, ...chapter.sections.flatMap((section) => section.content)])
  .flatMap((block) => block.kind === "table" ? block.rows.flat() : [])
  .map(String)
  .find((text) => text.startsWith("THE GOLDEN RULE\n"))
  ?.replace("THE GOLDEN RULE\n", "") ?? "When a card directly contradicts this rulebook, the card wins.";


const initialAccent = (): AccentKey => readUserPreferences().accent;
const initialDisplayName = (): string => readUserPreferences().displayName;
const initialAvatar = (): AvatarKey => readUserPreferences().avatar;
const OFFICIAL_RULINGS = rulesData.officialRulings;
const RULING_TOPICS = [...new Set(OFFICIAL_RULINGS.map((entry) => entry.tag))].sort();

const cardImageUrl = (card: CardEntry) => card.image ? CARD_IMAGE_URLS[card.image] ?? card.image : COMPLETE_CARD_URLS_BY_CATALOG_ID[card.catalogId] ?? cardPlaceholderUrl;
const hasCardArt = (card: CardEntry) => Boolean(card.image || COMPLETE_CARD_URLS_BY_CATALOG_ID[card.catalogId]);

function BrandMark() {
  // Origami shuriken: the same mark as public/favicon.svg.
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="14" fill="#0e2943"/><path transform="translate(3 4)" fill="#050d17" opacity=".65" d="M21 21h22V3Zm22 0v22h18ZM43 43H21v18ZM21 43V21H3Z"/><g stroke="#17263a" strokeWidth="2.4" strokeLinejoin="round"><path d="M21 21h22L43 3Z" fill="#c84c35"/><path d="M43 21v22h18Z" fill="#fffaf0"/><path d="M43 43H21v18Z" fill="#c84c35"/><path d="M21 43V21H3Z" fill="#fffaf0"/><path d="M21 21h22v22H21Z" fill="#f0dca9"/><path d="M21 21 43 43M43 21 21 43" strokeWidth="1.6" opacity=".55"/></g></svg></span>;
}

function ThemeToggle({ theme, onToggle, full = false }: { theme: Theme; onToggle: () => void; full?: boolean }) {
  const next = theme === "dark" ? "light" : "dark";
  return <button className={`theme-toggle${full ? " theme-toggle-full" : ""}`} type="button" onClick={onToggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}><span aria-hidden="true">{theme === "dark" ? "☀" : "◐"}</span>{full && <b>{theme === "dark" ? "Light mode" : "Dark mode"}</b>}</button>;
}

function PaperToastItem({ toast, onDismiss }: { toast: PaperToast; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const duration = toast.duration ?? 4200;
  const remainingRef = useRef(duration);
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => { remainingRef.current = duration; }, [duration, toast.id]);
  useEffect(() => {
    if (paused) return;
    startedAtRef.current = performance.now();
    const timeout = window.setTimeout(() => onDismiss(toast.id), Math.max(0, remainingRef.current));
    return () => {
      window.clearTimeout(timeout);
      if (startedAtRef.current !== null) {
        remainingRef.current = Math.max(0, remainingRef.current - (performance.now() - startedAtRef.current));
        startedAtRef.current = null;
      }
    };
  }, [duration, onDismiss, paused, toast.id]);

  const toastStyle = { "--toast-duration": `${duration}ms` } as CSSProperties;
  return <article className={`paper-toast paper-toast--${toast.kind ?? "note"} paper-toast--variant-${toast.variant ?? 1}`} data-paused={paused ? "true" : undefined} role={toast.kind === "warning" || toast.kind === "critical" ? "alert" : "status"} style={toastStyle} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }} onKeyDown={(event) => { if (event.key === "Escape") onDismiss(toast.id); }}>
    <i className="paper-toast-tape" aria-hidden="true" />
    <div className="paper-toast-mark" aria-hidden="true">{toast.kind === "success" ? "✓" : toast.kind === "warning" || toast.kind === "critical" ? "!" : toast.kind === "stamp" ? "✦" : "•"}</div>
    <div className="paper-toast-copy"><span>{toast.eyebrow ?? "Dojo Desk"}</span><strong>{toast.title}</strong>{toast.message && <p>{toast.message}</p>}</div>
    <button type="button" className="paper-toast-close" onClick={() => onDismiss(toast.id)} aria-label={`Dismiss ${toast.title}`}>×</button>
    <b className="paper-toast-progress" aria-hidden="true" />
  </article>;
}

function PaperToastStack({ toasts, onDismiss }: { toasts: PaperToast[]; onDismiss: (id: number) => void }) {
  return <aside className="paper-toast-stack" aria-label="Dojo notifications" aria-live="polite">{toasts.map((toast) => <PaperToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />)}</aside>;
}

function StarterExampleCard({ kind, name, zone, timing, power, focus, art, catalogId }: { kind: "Attack" | "Defense"; name: string; zone: string; timing: string; power: number; focus: number; art?: string; catalogId: string }) {
  return <figure className="starter-real-card">{art && <img src={art} alt={`${name}, ${kind} card. ${zone} zone; ${kind === "Attack" ? "Attack Power" : "Guard"} ${power}; Focus ${focus}; ${timing}.`} loading="lazy" decoding="async" />}<figcaption>{name} · {catalogId}</figcaption></figure>;
}

function StarterDeckLesson({ jabArt, guardArt }: { jabArt?: string; guardArt?: string }) {
  const [selectedGroup, setSelectedGroup] = useState(0);
  const moveGroupFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']") ?? []);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setSelectedGroup(next);
    tabs[next]?.focus();
  };
  const selected = CANONICAL_STARTER_CARDS[selectedGroup];
  const jab = STARTER_EXAMPLES.basicJab;
  const guard = STARTER_EXAMPLES.highGuard;
  return <section className="starter-lesson" aria-labelledby="starter-deck-title">
    <div className="starter-lesson-heading"><div><span className="eyebrow">Your opening toolkit</span><h3 id="starter-deck-title">Build this exact 15-card deck.</h3><p>Every player begins with the same cards. Shuffle all fifteen together, then draw {HAND_SIZE}.</p></div><strong><b>15</b> cards<br />per player</strong></div>
    <div className="starter-tabs" role="tablist" aria-label="Starter Deck card groups">{CANONICAL_STARTER_CARDS.map((entry, index) => <button type="button" role="tab" id={`starter-group-tab-${index}`} aria-controls="starter-group-panel" aria-selected={selectedGroup === index} tabIndex={selectedGroup === index ? 0 : -1} className={selectedGroup === index ? "active" : ""} onClick={() => setSelectedGroup(index)} onKeyDown={(event) => moveGroupFocus(event, index)} key={entry.group}><span aria-hidden="true">{entry.icon}</span><div><small>{entry.count} cards</small><b>{entry.group}</b></div></button>)}</div>
    <div key={selectedGroup} id="starter-group-panel" className="starter-group-detail" role="tabpanel" aria-labelledby={`starter-group-tab-${selectedGroup}`}><div><span className="eyebrow">{selected.count} of 15 · {selected.group}</span><h4>{selected.purpose}</h4></div><ul>{selected.cards.map((card) => <li key={card}>{card}</li>)}</ul></div>
    <div className="starter-example-section"><div className="starter-example-copy"><span className="eyebrow">What a starter card looks like</span><h3>Read the big numbers first.</h3><p>The colored header tells you the card’s job. Attack Power or Guard drives combat, and the zone tells you where it applies.</p><ol><li><b>1.</b> Identify Attack or Defense.</li><li><b>2.</b> Match High, Mid, or Low.</li><li><b>3.</b> Add Attack Power or Guard to the fighter’s stat.</li></ol></div><div className="starter-card-pair"><StarterExampleCard kind="Attack" name={jab.name} zone={jab.zone} timing={jab.timing} power={jab.power} focus={jab.focus} art={jabArt} catalogId={jab.catalogId} /><StarterExampleCard kind="Defense" name={guard.name} zone={guard.zone} timing={guard.timing} power={guard.power} focus={guard.focus} art={guardArt} catalogId={guard.catalogId} /></div></div>
  </section>;
}

function CombatExample() {
  const [defensePlayed, setDefensePlayed] = useState(true);
  const attackPower = 4;
  const defense = 2 + (defensePlayed ? 2 : 0);
  const damage = Math.max(0, attackPower - defense);
  return <article className="combat-worked" aria-labelledby="combat-example-title">
    <div className="combat-worked-heading"><div><span className="eyebrow">Worked example · Mid attack</span><h3 id="combat-example-title">Rita attacks Devin</h3><p>See what changes when Devin plays a Defense card.</p></div><button type="button" className="button ghost" aria-pressed={defensePlayed} onClick={() => setDefensePlayed((current) => !current)}>{defensePlayed ? "Remove Defense card" : "Play Defense card"}</button></div>
    <div className="combat-ledger"><section><h4>Rita’s attack</h4><dl><div><dt>Wild Swing</dt><dd>1</dd></div><div><dt>Character ATK</dt><dd>2</dd></div><div><dt>Weapon</dt><dd>1</dd></div><div className="combat-ledger-total"><dt>Attack Power</dt><dd>{attackPower}</dd></div></dl></section><section><h4>Devin’s defense</h4><dl><div><dt>Character DEF</dt><dd>1</dd></div><div><dt>Mid Armor</dt><dd>1</dd></div><div><dt>{defensePlayed ? "Desperate Cover" : "No Defense card"}</dt><dd>{defensePlayed ? 2 : 0}</dd></div><div className="combat-ledger-total"><dt>Defense</dt><dd>{defense}</dd></div></dl></section></div>
    <div className="combat-result" role="status" aria-live="polite"><div className="combat-result-math"><span>{attackPower} − {defense} = </span><strong>{damage}</strong></div><div><h4>{damage === 0 ? "Blocked — Devin loses 0 HP" : `Hit — Devin loses ${damage} HP`}</h4><p>{damage === 0 ? `The totals tie, so the Attack is Blocked. ${COMBAT_XP_RULE}` : "Attack is higher than Defense, so Devin loses the difference in HP."}</p></div></div><p className="combat-worked-note">{DEFENSE_WITHOUT_CARD_RULE}</p>
  </article>;
}

const fighterCutoutModules = import.meta.glob<string>("./assets/fighters/*.webp", { eager: true, query: "?url", import: "default" });
const FIGHTER_CUTOUTS: Record<string, string> = Object.fromEntries(Object.entries(fighterCutoutModules).map(([path, url]) => [path.split("/").at(-1)?.replace(/\.webp$/i, "") ?? path, url]));
const fighterSlug = (name: string) => name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
type HomeFighter = { card: CardEntry; art: string };
const HOME_FIGHTERS: HomeFighter[] = cardData.cards
  .filter((card) => card.cardType === "Character")
  .flatMap((card) => { const art = FIGHTER_CUTOUTS[fighterSlug(card.name)]; return art ? [{ card, art }] : []; });
const PRINTED_CARDS = cardData.cards.filter((card) => hasCardArt(card) && isFeaturable(card));
const boutFor = (seed: number): [number, number] => {
  const total = HOME_FIGHTERS.length;
  const left = ((seed * 7919) % total + total) % total;
  const right = (left + 1 + ((seed * 104_729) % (total - 1) + (total - 1)) % (total - 1)) % total;
  return [left, right];
};
const fighterStat = (card: CardEntry, key: string) => card.stats?.[key] ?? "—";

function FighterStandee({ fighter, side }: { fighter: HomeFighter; side: "left" | "right" }) {
  return <figure className={`standee standee--${side}`}>
    <div className="standee-art"><img src={fighter.art} alt={`${fighter.card.name}, Paper-Fu fighter`} decoding="async" /></div>
    <span className="standee-base" aria-hidden="true" />
    <figcaption className="standee-plate">
      <b>{fighter.card.name}</b>
      <span className="standee-stats"><i>ATK <strong>{fighterStat(fighter.card, "ATK")}</strong></i><i>DEF <strong>{fighterStat(fighter.card, "DEF")}</strong></i><i>SPD <strong>{fighterStat(fighter.card, "Speed")}</strong></i></span>
    </figcaption>
  </figure>;
}

function HomeView({ goTo, displayName, avatar }: { goTo: (view: ViewId) => void; displayName: string; avatar: AvatarKey }) {
  const careerSummary = useCareerSummary();
  const [boutSeed, setBoutSeed] = useState(dayNumber);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [cardSeed, setCardSeed] = useState(dayNumber);
  const [left, right] = boutFor(boutSeed);
  const daily = boutSeed === dayNumber();
  const featuredCard = pickBySeed(PRINTED_CARDS, cardSeed);
  const phase = CANONICAL_PHASES[phaseIndex];
  const movePhase = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const last = CANONICAL_PHASES.length - 1;
    const next = event.key === "ArrowRight" ? (phaseIndex === last ? 0 : phaseIndex + 1) : event.key === "ArrowLeft" ? (phaseIndex === 0 ? last : phaseIndex - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    setPhaseIndex(next);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']")[next]?.focus();
  };
  if (!HOME_FIGHTERS.length) return null;
  return <main className="home-v3">
    {/* 1. The bout: two paper standees face off on a cut-paper stage. */}
    <section className="bout" aria-labelledby="bout-title">
      <div className="bout-stage" aria-hidden="true"><span className="bout-burst" /><span className="bout-curtain bout-curtain--left" /><span className="bout-curtain bout-curtain--right" /><span className="bout-floor" /></div>
      <div className="bout-copy shell">
        <span className="bout-eyebrow"><img src={AVATAR_IMAGES[avatar]} alt="" />Welcome back, {displayName || "Paper-Fu Agent"} · {daily ? "Bout of the day" : "Exhibition bout"}</span>
        <h1 id="bout-title">Pick your fight.<em>File the paperwork later.</em></h1>
      </div>
      <div className="bout-ring shell" key={boutSeed}>
        <FighterStandee fighter={HOME_FIGHTERS[left]} side="left" />
        <div className="bout-vs" aria-hidden="true"><b>VS</b></div>
        <FighterStandee fighter={HOME_FIGHTERS[right]} side="right" />
      </div>
      <div className="bout-actions shell">
        <button type="button" className="bout-fight" onClick={() => goTo("playtest")}>Fight now <span aria-hidden="true">→</span></button>
        <button type="button" className="bout-shuffle" onClick={() => setBoutSeed((seed) => seed + 1)}><span aria-hidden="true">↻</span> Shuffle the bout</button>
        <p className="bout-note">{HOME_FIGHTERS.length} fighters on file · {cardData.total} cards · 4 formats · one very tired clipboard</p>
      </div>
      <p className="sr-only" aria-live="polite">{HOME_FIGHTERS[left].card.name} versus {HOME_FIGHTERS[right].card.name}</p>
    </section>

    {/* 2. Formats. */}
    <section className="shell home-block" aria-labelledby="formats-title">
      <header className="home-block-head"><span className="home-block-tab">01</span><div><h2 id="formats-title">Four ways to start trouble.</h2><p>All four formats are playable right now: Quick Duel, Tag Team, Standard Clash and Boss Blitz.</p></div></header>
      <div className="home-mode-board">{CANONICAL_GAME_MODES.map((mode) => { const isLive = modeMetaFor(mode.id).live; return <ModeCard key={mode.id} mode={mode} action={isLive ? "Play it now" : "Read the brief"} onSelect={() => goTo(isLive ? "playtest" : "quickstart")} />; })}</div>
    </section>

    {careerSummary && <CareerBand summary={careerSummary} onGo={(page) => goTo(page)} />}

    {/* 3. One round, as five yells. */}
    <section className="hiyah" aria-labelledby="hiyah-title">
      <div className="shell">
        <header className="home-block-head home-block-head--inverse"><span className="home-block-tab">02</span><div><h2 id="hiyah-title">Every round is five yells.</h2><p>Tap a letter. That's the whole turn order.</p></div></header>
        <div className="hiyah-letters" role="tablist" aria-label="Round phases">{CANONICAL_PHASES.map((entry, index) => <button key={`${entry.name}-${index}`} type="button" role="tab" id={`hiyah-tab-${index}`} aria-selected={index === phaseIndex} aria-controls="hiyah-panel" tabIndex={index === phaseIndex ? 0 : -1} className={index === phaseIndex ? "is-active" : ""} onClick={() => setPhaseIndex(index)} onKeyDown={movePhase}><b>{entry.letter}</b><span>{entry.name}</span></button>)}</div>
        <div className="hiyah-panel" id="hiyah-panel" role="tabpanel" aria-labelledby={`hiyah-tab-${phaseIndex}`} key={phaseIndex}><span>Phase {phaseIndex + 1} of {CANONICAL_PHASES.length}</span><h3>{phase.name}</h3><p>{phase.text}</p><button type="button" className="text-link light" onClick={() => goTo("quickstart")}>Learn the full round →</button></div>
      </div>
    </section>

    {/* 4. Card of the day + the paperwork pitch. */}
    <section className="shell home-block cotd" aria-labelledby="cotd-title">
      <div className="cotd-card"><button type="button" className="cotd-print" key={featuredCard.catalogId} data-card-motion="fold-in" onClick={() => navigate({ page: "cards", cardId: featuredCard.catalogId })} aria-label={`Open ${featuredCard.name} in the Card Library`}><img src={cardImageUrl(featuredCard)} alt="" decoding="async" /></button><span className="cotd-pin" aria-hidden="true" /></div>
      <div className="cotd-copy">
        <span className="home-block-tab">03</span>
        <h2 id="cotd-title">Card of the day: <em>{featuredCard.name}</em></h2>
        <p>{featuredCard.flavorText || featuredCard.rulesText || "Filed, stamped and ready for the mat."}</p>
        <dl><div><dt>Type</dt><dd>{featuredCard.cardType}{featuredCard.subtype ? ` · ${featuredCard.subtype}` : ""}</dd></div><div><dt>Filing</dt><dd>{featuredCard.catalogId}</dd></div></dl>
        {cardSeed === dayNumber() && <DailyClaim card={featuredCard} imageUrlFor={cardImageUrl} />}
        <div className="cotd-actions"><button type="button" className="button primary" onClick={() => setCardSeed((seed) => seed + 1)}>Draw another <span aria-hidden="true">↻</span></button><button type="button" className="button ghost" onClick={() => goTo("cards")}>Browse all {cardData.total}</button></div>
      </div>
    </section>

    {/* 5. The roster wall. */}
    <section className="roster-wall" aria-labelledby="roster-title">
      <div className="shell"><header className="home-block-head"><span className="home-block-tab">04</span><div><h2 id="roster-title">The whole delegation.</h2><p>{HOME_FIGHTERS.length} fighters. Zero normal entrances. Pick one to read their card.</p></div></header></div>
      <ul className="roster-shelf">{HOME_FIGHTERS.map((fighter) => <li key={fighter.card.catalogId}><button type="button" onClick={() => navigate({ page: "cards", cardId: fighter.card.catalogId })} aria-label={`${fighter.card.name}: open fighter card`}><img src={fighter.art} alt="" loading="lazy" decoding="async" /><span>{fighter.card.name}</span></button></li>)}</ul>
    </section>

    {/* 6. Send them to the mat. */}
    <section className="home-final" aria-labelledby="final-title">
      <div className="shell home-final-inner"><h2 id="final-title">The mat is waiting.<em>The clipboard is not.</em></h2><div><button type="button" className="bout-fight" onClick={() => goTo("playtest")}>Play Quick Duel <span aria-hidden="true">→</span></button><button type="button" className="button ghost" onClick={() => goTo("quickstart")}>Learn in 10 minutes</button><button type="button" className="button ghost" onClick={() => goTo("story")}>Read the backstory</button></div></div>
    </section>
  </main>;
}

function StoryView({ goTo }: { goTo: (view: ViewId) => void }) {
  const storyParagraphs = storyChapter?.intro.filter((block): block is Extract<RuleBlock, { kind: "paragraph" }> => block.kind === "paragraph").map((block) => block.text) ?? [];
  return <main className="page-shell shell story-page">
    <SectionHeader eyebrow="The Backstory" title="The field test was approved. The filing cabinet was not." intro="The official Paper-Fu origin, preserved by the Department of Competitive Safety and immediately declared ancient history." art={headerBackstoryUrl} />
    <section className="story-lede paper-stack"><i className="fastener tape-strip story-tape" aria-hidden="true" /><span className="story-dropcap">P</span><div><span className="eyebrow">The Department’s original mistake</span><h2>{storyParagraphs[1]}</h2></div></section>
    <EvidenceBoard exhibits={[
      { title: "The Expo", text: storyParagraphs[2], tag: "coupons · ferret · fire marshal" },
      { title: "The Cabinet", text: storyParagraphs[3], tag: "TAX RECEIPTS → ancient wisdom" },
      { title: "The Tournament", text: storyParagraphs[4], tag: "delegations · field test · Model Dojo" },
    ]} />
    <section className="golden-rule-card paper-stack"><div><span className="eyebrow">The Golden Rule</span><h2>The card wins.</h2></div><p>{GOLDEN_RULE}</p><span className="golden-stamp" aria-hidden="true">!</span></section>
    <section className="story-cta paper-stack"><div><span className="eyebrow">Enough lore?</span><h2>Go make the Department regret funding this.</h2></div><button className="button primary" onClick={() => goTo("quickstart")}>Set up the first fight →</button></section>
  </main>;
}

function QuickStartView({ goTo }: { goTo: (view: ViewId) => void }) {
  const [selectedMode, setSelectedMode] = useState<(typeof CANONICAL_GAME_MODES)[number] | null>(null);
  const [selectedPhase, setSelectedPhase] = useState(0);
  const setup = SETUP_STEPS;
  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: paperScrollBehavior(), block: "start" });
  return <main className="page-shell shell quickstart-v2">
    <section className="quickstart-hero" aria-labelledby="quickstart-title">
      <div className="quickstart-hero-copy">
        <div className="quickstart-kicker"><span className="quickstart-live-dot" /> Field briefing · 10-minute onboarding</div>
        <h1 id="quickstart-title">Learn the mat.<br /><em>Make it loud.</em></h1>
        <p className="quickstart-hero-lede">The teach-at-the-table version of Paper-Fu: pick a format, build the fixed starter deck, then turn one readable round into a full-color tabletop sport.</p>
        <div className="quickstart-hero-actions"><button className="button primary" onClick={() => jumpTo("quickstart-setup")}>Start with setup</button><button className="button ghost" onClick={() => goTo("rules")}>Keep the full rules nearby</button></div>
      </div>
      <div className="quickstart-hero-visual"><div className="quickstart-hero-frame"><img src={headerQuickstartUrl} alt="A fighter chases a coupon-carrying ferret while an inspector tries to restore order" fetchPriority="high" decoding="async" /></div></div>
    </section>

    <section className="quickstart-mode-section" aria-labelledby="mode-picker-title">
      <div className="quickstart-section-intro"><div><span className="eyebrow">Choose your table</span><h2 id="mode-picker-title">Four ways to start the story.</h2></div><p>Every mode uses the same core language. Pick the amount of chaos your table can responsibly file today.</p></div>
      <div className="quick-mode-grid">{CANONICAL_GAME_MODES.map((mode) => <ModeCard key={mode.id} mode={mode} action="Open mode brief" onSelect={() => setSelectedMode(mode)} />)}</div>
    </section>

    <section className="golden-rule-card quick-golden paper-stack"><div><span className="eyebrow">The table agreement</span><h2>The card wins.</h2></div><p>{GOLDEN_RULE}</p><span className="golden-stamp" aria-hidden="true">!</span></section>

    <QuickstartSetup steps={setup} onPlay={() => goTo("playtest")}><StarterDeckLesson jabArt={starterJabArtUrl} guardArt={highGuardArtUrl} /></QuickstartSetup>

    <section className="quick-section interactive-round quickstart-step-block" id="quickstart-round"><div className="quickstart-step-heading"><span className="step-stamp">02</span><div><span className="eyebrow">Play the round</span><h2>Honor once. Then each player completes I.Y.A.H.</h2><p className="round-clarifier">{ROUND_STRUCTURE_SUMMARY}</p></div><span className="quickstart-step-status">ONE LOOP<br />FIVE BEATS</span></div><div className="quick-phases">{CANONICAL_PHASES.map((phase, index) => <button className={selectedPhase === index ? "active" : ""} onClick={() => setSelectedPhase(index)} key={phase.name}><span>{phase.letter}</span><div><small>{index === 0 ? "Once per round" : "Each player"}</small><h3>{phase.name}</h3><p>{phase.text}</p></div></button>)}</div><article className="phase-explainer paper-stack"><div><span className="phase-explainer-letter">{CANONICAL_PHASES[selectedPhase].letter}</span><div><span className="eyebrow">{CANONICAL_PHASE_DETAILS[selectedPhase].when}</span><h3>{CANONICAL_PHASE_DETAILS[selectedPhase].name}</h3><p>{CANONICAL_PHASE_DETAILS[selectedPhase].who}</p></div></div><ol>{CANONICAL_PHASE_DETAILS[selectedPhase].steps.map((step) => <li key={step}>{step}</li>)}</ol><blockquote>{CANONICAL_PHASE_DETAILS[selectedPhase].quip}</blockquote></article></section>

    <section className="combat-primer paper-stack quickstart-step-block"><div className="combat-copy"><span className="eyebrow">Combat</span><h2>Attack a zone. Let everybody interfere.</h2><ol>{COMBAT_SEQUENCE.map((step) => <li key={step}>{step}</li>)}</ol></div><div className="formula-card"><span>Final combat formula</span><p>{COMBAT_FORMULA_TEXT}</p></div><CombatExample /></section>
    <section className="quick-footer-card paper-stack"><div><span className="eyebrow">The whole game</span><h2>Fight → focus → stronger cards → belt tasks → win.</h2><p>Need every edge case? The complete online rulebook stays one click away.</p></div><button className="button primary" onClick={() => goTo("rules")}>Open the full rules</button></section>
    {selectedMode && <DetailModal eyebrow={`${selectedMode.players} · ${selectedMode.fighters}`} title={selectedMode.title} onClose={() => setSelectedMode(null)} accent={selectedMode.id === "tag-team" ? "green" : "red"}><p className="modal-lede">{selectedMode.detail}</p><div className="modal-win"><span>How to win</span><strong>{selectedMode.win}</strong></div>{selectedMode.notes.length > 0 && <ul className="modal-list">{selectedMode.notes.map((note) => <li key={note}>{note}</li>)}</ul>}</DetailModal>}
  </main>;
}

function RulingsView({ initialTab = "official", initialQuery = "" }: { initialTab?: RulingsTab; initialQuery?: string }) {
  const [tab, setTab] = useState<RulingsTab>(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<HouseRule | null>(() => initialTab === "house" && initialQuery ? rulesData.houseRules.find((entry) => normalizeSearchQuery(entry.name) === normalizeSearchQuery(initialQuery)) ?? null : null);
  useEffect(() => {
    setTab(initialTab);
    setQuery(initialQuery);
    setSelected(initialTab === "house" && initialQuery ? rulesData.houseRules.find((entry) => normalizeSearchQuery(entry.name) === normalizeSearchQuery(initialQuery)) ?? null : null);
  }, [initialTab, initialQuery]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const [topic, setTopic] = useState("");
  const pushToast = usePaperToast();
  const rulings = OFFICIAL_RULINGS.filter((entry) => (!topic || entry.tag === topic) && (!normalizedQuery || Object.values(entry).join(" ").toLocaleLowerCase().includes(normalizedQuery)));
  const copyCitation = async (entry: OfficialRuling) => {
    const url = `${window.location.origin}${window.location.pathname}#rulings/official/${encodeURIComponent(entry.id)}`;
    const citation = `${entry.id} · ${entry.title}: ${entry.ruling} (${url})`;
    try {
      await navigator.clipboard.writeText(citation);
      pushToast({ kind: "success", eyebrow: "Citation filed", title: `${entry.id} copied`, message: "Paste it into the group chat. Argument over.", duration: 2600 });
    } catch {
      pushToast({ kind: "note", eyebrow: "Copy this citation", title: entry.id, message: url, duration: 6000 });
    }
  };
  const variants = rulesData.houseRules.filter((entry) => !normalizedQuery || `${entry.name} ${entry.rule} ${entry.summary ?? ""} ${entry.notes ?? ""}`.toLocaleLowerCase().includes(normalizedQuery));
  const selectedSupport = selected ? rulesData.houseRules.find((entry) => entry.name === selected.name) ?? null : null;
  const chooseTab = (next: RulingsTab) => {
    setTab(next);
    setQuery("");
    setSelected(null);
    navigate({ page: "rulings", tab: next });
    window.scrollTo({ top: 0, behavior: paperScrollBehavior() });
  };
  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, current: RulingsTab) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: RulingsTab = event.key === "Home" ? "official" : event.key === "End" ? "house" : current === "official" ? "house" : "official";
    const tabList = event.currentTarget.parentElement;
    chooseTab(next);
    window.requestAnimationFrame(() => tabList?.querySelector<HTMLButtonElement>(`[data-rulings-tab="${next}"]`)?.focus());
  };
  const visibleCount = tab === "official" ? rulings.length : variants.length;
  return <main className={`page-shell shell rulings-page rulings-variants-page is-${tab}`}>
    <SectionHeader eyebrow="Department Guidance" title="Rulings & Variants" intro="Official clarifications stay mandatory. Optional variants stay optional. One filing cabinet, two clearly labeled drawers." art={headerRulingsUrl} />
    <nav className="rulings-variant-tabs" role="tablist" aria-label="Rulings and variants sections">
      <button type="button" role="tab" data-rulings-tab="official" aria-selected={tab === "official"} tabIndex={tab === "official" ? 0 : -1} className={tab === "official" ? "active" : ""} onClick={() => chooseTab("official")} onKeyDown={(event) => handleTabKeyDown(event, "official")}><span>Official</span><b>Official Rulings</b></button>
      <button type="button" role="tab" data-rulings-tab="house" aria-selected={tab === "house"} tabIndex={tab === "house" ? 0 : -1} className={tab === "house" ? "active" : ""} onClick={() => chooseTab("house")} onKeyDown={(event) => handleTabKeyDown(event, "house")}><span>Optional</span><b>House Rules</b></button>
    </nav>
    <section className={`guidance-status-banner ${tab === "official" ? "is-official" : "is-optional"}`}>
      <strong>{tab === "official" ? "OFFICIAL · APPLIES TO ALL GAMES" : "OPTIONAL · AGREE BEFORE PLAY"}</strong>
      <p>{tab === "official" ? "These clarifications settle how the published rules are played. They are not optional variants." : "These variants change the current game only. Printed card text and the official rules remain unchanged."}</p>
    </section>
    <div className="rulings-shared-search"><label className="search-box large"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "official" ? "Search official rulings…" : "Search house rules…"} aria-label={tab === "official" ? "Search official rulings" : "Search house rules"} />{query && <button onClick={() => setQuery("")} aria-label="Clear guidance search">×</button>}</label><span>{visibleCount} of {tab === "official" ? OFFICIAL_RULINGS.length : rulesData.houseRules.length} shown</span></div>
    {tab === "official" ? <>
      <section className="priority-panel"><div><span className="eyebrow">Rule priority</span><h2>When two things disagree</h2><p>Use this order. Stop as soon as the conflict is resolved.</p></div><ol>{RULE_PRIORITY.map((rule, index) => <li key={rule}><span>{index + 1}</span>{rule}</li>)}</ol></section>
      <section className="ruling-list-section"><div className="rulings-heading"><div><span className="eyebrow">Official clarifications</span><h2>{OFFICIAL_RULINGS.length} current rulings</h2></div></div>
        <div className="docket-topics" role="group" aria-label="Settle a dispute by topic"><span>Settle a dispute about</span>{["", ...RULING_TOPICS].map((entry) => <button type="button" key={entry || "all"} aria-pressed={topic === entry} onClick={() => setTopic(entry)}>{entry || "Anything"}<small>{entry ? OFFICIAL_RULINGS.filter((ruling) => ruling.tag === entry).length : OFFICIAL_RULINGS.length}</small></button>)}</div>
        {rulings.length ? <div className="ruling-list docket">{rulings.map((entry) => <article className="docket-slip" key={entry.id}>
          <span className="docket-tab">{entry.tag}</span>
          <div className="docket-body"><small>{entry.id}</small><h3>{entry.title}</h3><p>{entry.ruling}</p></div>
          <div className="docket-side"><strong className="docket-stamp" aria-label={entry.filed}>{entry.filed.replace(/^Filed\s*/i, "")}<small>Filed</small></strong><button type="button" className="docket-cite" onClick={() => void copyCitation(entry)} aria-label={`Copy citation for ${entry.id}`}>Cite</button></div>
        </article>)}</div> : <div className="empty-state"><strong>No official ruling found.</strong><p>Try a shorter term, pick another topic, or switch to House Rules for optional variants.</p></div>}</section>
      <section className="judge-procedure"><div><span className="step-stamp">?</span><h2>The two-minute table judge</h2></div><ol>{TABLE_JUDGE_STEPS.map((step) => <li key={step}>{step}</li>)}</ol></section>
    </> : <>
      <section className="house-grid">{variants.map((entry, index) => { const support = entry; return <button className="paper-stack interactive-paper" onClick={() => navigate({ page: "rulings", tab: "house", query: entry.name })} key={entry.name}><span>{String(index + 1).padStart(2, "0")}</span><small>{entry.category}</small><h2>{entry.name}</h2><p>{entry.summary || entry.rule}</p>{support?.quickDuel.status === "supported" && <span className="variant-playtest-badge">Quick Duel option</span>}<b>Open full variant →</b></button>; })}</section>
      {!variants.length && <div className="empty-state"><strong>No house rule found.</strong><p>Try a shorter term or switch to Official Rulings.</p></div>}
      <section className="new-rule-panel paper-stack"><span className="eyebrow">Build your own</span><h2>A good house rule answers four questions.</h2><div><p><b>When</b> does it trigger?</p><p><b>Who</b> makes choices?</p><p><b>What</b> if it is impossible?</p><p><b>Where</b> is the cap?</p></div></section>
    </>}
    {selected && <DetailModal eyebrow={selected.category || "House Rule"} title={selected.name} onClose={() => replaceRoute({ page: "rulings", tab: "house" })} accent="green"><p className="modal-lede">{selected.summary}</p><aside className="modal-rule"><span>Variant rule</span><p>{selected.rule}</p></aside>{selected.notes && <div className="modal-design-note"><span>Why this wording works</span><p>{selected.notes}</p></div>}{selectedSupport && <div className="variant-support-note" data-status={selectedSupport.quickDuel.status}><b>{selectedSupport.quickDuel.status === "supported" ? "Digital Quick Duel: supported" : selectedSupport.quickDuel.status === "not-applicable" ? "Digital Quick Duel: not applicable" : "Digital Quick Duel: not automated yet"}</b><p>{selectedSupport.quickDuel.reason}</p></div>}<p className="agreement-note">Agree on this variant before setup. It changes only the current game and never rewrites printed card text.</p></DetailModal>}
  </main>;
}

export default function CompanionApp() {
  const [route, setRoute] = useState<SiteRoute>(() => readRoute());
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const [presentationPreferences, setPresentationPreferences] = useState<PresentationPreferences>(() => readUserPreferences());
  const [accent, setAccent] = useState<AccentKey>(initialAccent);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatar, setAvatar] = useState<AvatarKey>(initialAvatar);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const careerSummary = useCareerSummary();
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRestoreRef = useRef<HTMLElement | null>(null);
  const [globalSelection, setGlobalSelection] = useState(0);
  const [selectionIntent, setSelectionIntent] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [toasts, setToasts] = useState<PaperToast[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRestoreRef = useRef<HTMLElement | null>(null);
  const menuCloseTimerRef = useRef<number | null>(null);
  const view = route.page;
  const internalLabAvailable = import.meta.env.DEV;

  const pushToast = useCallback((input: ToastInput) => {
    toastSequence += 1;
    const toast = { ...input, duration: input.duration ?? Number(presentationPreferences.toastDuration), id: toastSequence };
    setToasts((current) => [...current.filter((entry) => entry.title !== toast.title), toast].slice(-4));
  }, [presentationPreferences.toastDuration]);
  const dismissToast = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  // Once per visit, on the way in, remind the player that Booster Tickets are waiting. Never during a match or on the pages that already show them.
  const ticketsWaiting = careerSummary?.tickets ?? 0;
  useEffect(() => {
    if (!ticketsWaiting || route.page === "playtest" || route.page === "cards" || route.page === "collection") return;
    try {
      if (window.sessionStorage.getItem("ddb-ticket-toast")) return;
      window.sessionStorage.setItem("ddb-ticket-toast", "1");
    } catch { /* storage blocked: the reminder simply shows on each visit */ }
    pushToast({ kind: "note", eyebrow: "Dojo record", title: `${ticketsWaiting} Booster ${ticketsWaiting === 1 ? "Ticket" : "Tickets"} waiting`, message: "Open packs from your Field Agent menu or the Card Library.", duration: 5200 });
  }, [ticketsWaiting, route.page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handlePaperFuToast = (event: Event) => {
      const detail = (event as CustomEvent<PaperFuToastDetail>).detail;
      if (!detail || typeof detail.title !== "string") return;
      pushToast(detail);
    };
    window.addEventListener(PAPER_FU_TOAST_EVENT, handlePaperFuToast);
    return () => window.removeEventListener(PAPER_FU_TOAST_EVENT, handlePaperFuToast);
  }, [pushToast]);
  const closeMenu = useCallback((restoreFocus = true, immediate = false) => {
    if (menuCloseTimerRef.current !== null) window.clearTimeout(menuCloseTimerRef.current);
    if (!restoreFocus) menuRestoreRef.current = null;
    if (immediate || presentationPreferences.reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMenuOpen(false);
      setMenuClosing(false);
      return;
    }
    setMenuClosing(true);
    menuCloseTimerRef.current = window.setTimeout(() => {
      menuCloseTimerRef.current = null;
      setMenuOpen(false);
      setMenuClosing(false);
    }, 170);
  }, [presentationPreferences.reducedMotion]);
  const closeUserMenu = useCallback(() => setUserMenuOpen(false), []);
  const toggleMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    if (menuOpen) closeMenu();
    else {
      if (menuCloseTimerRef.current !== null) window.clearTimeout(menuCloseTimerRef.current);
      menuCloseTimerRef.current = null;
      setMenuClosing(false);
      menuRestoreRef.current = event.currentTarget;
      setMenuOpen(true);
    }
  }, [closeMenu, menuOpen]);

  useEffect(() => {
    setRoute(readRoute());
    return subscribeToRoute(setRoute);
  }, []);

  useEffect(() => {
    if (!menuOpen && !menuClosing) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeMenu(); return; }
      if (!menuOpen) return;
      if (event.key !== "Tab") return;
      const menu = document.getElementById("mobile-menu");
      const focusable = Array.from(menu?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [closeMenu, menuClosing, menuOpen]);

  // Opening the Dojo Index moves focus to the current page's card (or the first card).
  useEffect(() => {
    if (!menuOpen) return;
    window.requestAnimationFrame(() => {
      const menu = document.getElementById("mobile-menu");
      (menu?.querySelector<HTMLElement>(".index-card[aria-current='page']") ?? menu?.querySelector<HTMLElement>(".index-card"))?.focus({ preventScroll: true });
    });
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen || menuClosing || !menuRestoreRef.current) return;
    const restore = menuRestoreRef.current;
    menuRestoreRef.current = null;
    window.requestAnimationFrame(() => restore?.focus({ preventScroll: true }));
  }, [menuClosing, menuOpen]);

  useEffect(() => () => {
    if (menuCloseTimerRef.current !== null) window.clearTimeout(menuCloseTimerRef.current);
  }, []);

  useEffect(() => {
    applyThemeToDocument(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    updateUserPreferences({ accent });
  }, [accent]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.appRoute = view;
    root.dataset.menuState = menuClosing ? "closing" : menuOpen ? "open" : "closed";
    root.dataset.density = presentationPreferences.density;
    root.dataset.motion = presentationPreferences.reducedMotion ? "reduced" : "full";
    root.dataset.effectIntensity = presentationPreferences.effectIntensity;
    root.dataset.displayFace = presentationPreferences.displayFace;
    updateUserPreferences(presentationPreferences);
  }, [menuClosing, menuOpen, presentationPreferences, view]);

  useEffect(() => {
    document.title = view === "home" ? "Dojo Deckbuilder — Paper. Fists. Filing." : `${VIEW_LABELS[view]} · Dojo Deckbuilder`;
  }, [view]);

  const changePresentationPreferences = useCallback((update: Partial<PresentationPreferences>) => {
    setPresentationPreferences((current) => ({ ...current, ...update }));
    updateUserPreferences(update);
  }, []);

  useEffect(() => {
    updateUserPreferences({ displayName: displayName.trim() || "Paper-Fu Agent", avatar });
  }, [avatar, displayName]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeUserMenu();
        userMenuButtonRef.current?.focus({ preventScroll: true });
      }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !document.querySelector("[data-user-menu]")?.contains(target)) closeUserMenu();
    };
    window.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside, { passive: true });
    return () => {
      window.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside);
    };
  }, [closeUserMenu, userMenuOpen]);

  useEffect(() => {
    const press = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const menuTrigger = target?.closest<HTMLButtonElement>("button[aria-controls='mobile-menu']");
      if (menuTrigger) menuRestoreRef.current = menuTrigger;
      if (target?.closest("button, [role='button'], select")) paperHaptic(7);
    };
    document.addEventListener("pointerdown", press, { passive: true });
    return () => document.removeEventListener("pointerdown", press);
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const available = document.documentElement.scrollHeight - window.innerHeight;
        setScrollProgress(available > 0 ? Math.min(1, Math.max(0, window.scrollY / available)) : 0);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [view]);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        if (!searchRestoreRef.current) searchRestoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setSearchOpen(true);
      } else if (!isTyping && event.key === "/") {
        event.preventDefault();
        if (!searchRestoreRef.current) searchRestoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  const closeSearch = useCallback((restoreFocus = true) => {
    setSearchOpen(false);
    setGlobalSearch("");
    const restore = searchRestoreRef.current;
    searchRestoreRef.current = null;
    if (restoreFocus && restore?.isConnected) window.requestAnimationFrame(() => restore.focus({ preventScroll: true }));
  }, []);
  const openSearchPalette = (event?: ReactMouseEvent<HTMLElement>) => {
    searchRestoreRef.current = event?.currentTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    closeMenu(false, true);
    closeUserMenu();
    setSearchOpen(true);
  };
  useEffect(() => {
    if (!searchOpen) return;
    window.requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeSearch(); return; }
      if (event.key !== "Tab") return;
      const palette = document.getElementById("dojo-search-palette");
      const focusable = Array.from(palette?.querySelectorAll<HTMLElement>("input, button:not([disabled])") ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", trap);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", trap); };
  }, [closeSearch, searchOpen]);

  const goTo = (next: ViewId) => {
    closeMenu(false, true);
    closeUserMenu();
    setGlobalSearch("");
    setSelectionIntent(false);
    navigate(topLevelRoute(next));
    window.scrollTo({ top: 0, behavior: paperScrollBehavior() });
  };

  const globalResults = useMemo(() => searchDojo(globalSearch).slice(0, 14), [globalSearch]);
  const groupedGlobalResults = useMemo(() => groupSearchResults(globalResults), [globalResults]);
  const orderedGlobalResults = useMemo(() => groupedGlobalResults.flatMap((group) => group.results), [groupedGlobalResults]);
  const globalActiveDescendant = selectionIntent && orderedGlobalResults[globalSelection] ? `dojo-global-results-option-${globalSelection}` : undefined;
  const mobileGlobalActiveDescendant = selectionIntent && orderedGlobalResults[globalSelection] ? `dojo-mobile-search-results-option-${globalSelection}` : undefined;

  useEffect(() => {
    setGlobalSelection(0);
    setSelectionIntent(false);
  }, [globalSearch]);

  const chooseResult = (result: SearchResult) => {
    closeMenu(false, true);
    closeSearch(false);
    setGlobalSearch("");
    setSelectionIntent(false);
    navigate(result.route);
    window.scrollTo({ top: 0, behavior: paperScrollBehavior() });
  };

  const openFullSearch = () => {
    const query = globalSearch.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (query.length < 2) return;
    closeMenu(false, true);
    closeSearch(false);
    setGlobalSearch("");
    setSelectionIntent(false);
    navigate({ page: "search", query });
    window.scrollTo({ top: 0, behavior: paperScrollBehavior() });
  };

  const handleGlobalSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setSelectionIntent(false);
      closeSearch();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!orderedGlobalResults.length) return;
      event.preventDefault();
      setSelectionIntent(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setGlobalSelection((current) => (current + direction + orderedGlobalResults.length) % orderedGlobalResults.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (selectionIntent && orderedGlobalResults.length) {
        const result = orderedGlobalResults[Math.min(globalSelection, orderedGlobalResults.length - 1)];
        if (result) chooseResult(result);
        return;
      }
      openFullSearch();
    }
  };

  const renderGlobalResults = (className: string, id: string) => <div className={className} id={id} role="listbox" aria-label="Dojo search results">{groupedGlobalResults.map((group) => <section className="global-result-group" key={group.type}><strong>{SEARCH_GROUP_LABELS[group.type]}</strong>{group.results.map((result) => { const index = orderedGlobalResults.indexOf(result); return <button id={`${id}-option-${index}`} type="button" role="option" aria-selected={selectionIntent && index === globalSelection} className={selectionIntent && index === globalSelection ? "is-selected" : ""} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => { setGlobalSelection(index); setSelectionIntent(true); }} onClick={() => chooseResult(result)} key={`${result.type}-${result.title}-${result.detail}`}><span>{SEARCH_GROUP_LABELS[result.type]}</span><b>{result.title}</b><small>{result.detail}</small></button>; })}</section>)}</div>;

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    pushToast({ kind: "stamp", eyebrow: "Lighting cue", title: next === "dark" ? "After-hours dojo" : "Daylight dojo", message: next === "dark" ? "Ink, brass, and quiet focus." : "Paper, pigment, and open play." });
  };
  // Rules and Glossary keep their own state (search, hovercards, open term) across in-page routes.
  const routeKey = view;

  return <ToastContext.Provider value={pushToast}><div className="site-frame">
    <header className={`site-header${route.page === "playtest" ? " site-header--gameplay" : ""}`}><div className="header-inner shell">
      <button className="brand" onClick={() => goTo("home")} aria-label="Dojo Deckbuilder home"><BrandMark /><span><b>DOJO</b><em>DECKBUILDER</em></span></button>
      {view !== "home" && <span className="page-tab" aria-hidden="true"><small>Filed under</small><b>{VIEW_LABELS[view]}</b></span>}
      <div className="header-actions">
        <button type="button" className="header-tool search-trigger" onClick={openSearchPalette} aria-label="Search the dojo" aria-keyshortcuts="/ Control+K Meta+K" aria-haspopup="dialog" aria-expanded={searchOpen}><svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg><kbd aria-hidden="true">/</kbd></button>
        {view !== "playtest" && <button type="button" className="header-play" onClick={() => goTo("playtest")}><span aria-hidden="true">✦</span>Play</button>}
        <div className="user-menu-wrap" data-user-menu><button ref={userMenuButtonRef} type="button" className={`profile-menu-button${userMenuOpen ? " is-open" : ""}`} onClick={() => setUserMenuOpen((current) => !current)} aria-haspopup="dialog" aria-expanded={userMenuOpen} aria-label={`Open personal menu for ${displayName || "Dojo Agent"}${careerSummary ? `. Clearance Level ${careerSummary.level}${careerSummary.tickets ? `, ${careerSummary.tickets} Booster ${careerSummary.tickets === 1 ? "Ticket" : "Tickets"} ready` : ""}` : ""}`}>{careerSummary ? <CareerRing fraction={careerSummary.fraction} size={48} stroke={3} className="header-career-ring"><img src={AVATAR_IMAGES[avatar]} alt="" /><data className="header-career-level" value={careerSummary.level} aria-hidden="true">{careerSummary.level}</data>{careerSummary.tickets > 0 && <i className="header-career-dot" aria-hidden="true" />}</CareerRing> : <img src={AVATAR_IMAGES[avatar]} alt="" />}<span><b>{displayName || "Dojo Agent"}</b><small>FIELD AGENT</small></span><strong aria-hidden="true">⌄</strong></button>{userMenuOpen && <aside className="user-menu-panel" role="dialog" aria-label="Personal dojo menu"><header><img src={AVATAR_IMAGES[avatar]} alt="" /><div><span>Current filing</span><strong>{displayName || "Dojo Agent"}</strong><small>{AVATAR_OPTIONS.find((option) => option.id === avatar)?.quip}</small></div></header>{careerSummary && <CareerPanel summary={careerSummary} onGo={(page) => { setUserMenuOpen(false); goTo(page); }} />}<button type="button" className="user-menu-settings" onClick={() => goTo("settings")}>Personal settings <span>→</span></button><div className="user-menu-lighting"><span>Lighting</span><ThemeToggle theme={theme} onToggle={toggleTheme} full /></div><div className="user-menu-accent"><span>Accent</span><b>{accent.toLocaleUpperCase()}</b></div></aside>}</div>
        <button type="button" className={`index-button${menuOpen ? " is-open" : ""}`} onClick={toggleMenu} aria-controls="mobile-menu" aria-expanded={menuOpen} aria-haspopup="dialog"><span className="index-button-drawer" aria-hidden="true"><i /><i /><i /></span><b>{menuOpen ? "Close" : "Index"}</b></button>
      </div>
    </div><div className="reading-progress" role="progressbar" aria-label={`${VIEW_LABELS[view]} reading progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(scrollProgress * 100)}><span style={{ width: `${scrollProgress * 100}%` }} /><b>{VIEW_LABELS[view]}</b></div>{route.page === "playtest" && <button type="button" className="gameplay-menu-tab" onClick={toggleMenu} aria-controls="mobile-menu" aria-expanded={menuOpen} aria-haspopup="dialog"><span aria-hidden="true">☰</span> Menu <span aria-hidden="true">▾</span></button>}</header>
    {menuOpen && <><button className="menu-scrim" onClick={() => closeMenu()} aria-label="Close the Dojo Index" tabIndex={-1} /><aside className="dojo-index" id="mobile-menu" role="dialog" aria-modal="true" aria-labelledby="dojo-index-title">
      <div className="dojo-index-inner shell">
        <div className="dojo-index-heading"><div><span className="eyebrow">Dojo Index · drawer 01</span><h2 id="dojo-index-title">Where to, Agent?</h2></div><button className="mobile-menu-close" onClick={() => closeMenu()} aria-label="Close the Dojo Index">×</button></div>
        <nav className="dojo-index-cards" aria-label="All site pages">{MOBILE_MENU_NAVIGATION.map((item, index) => { const active = navigationItemIsActive(item, route); const art = INDEX_ART[item.page]; return <button type="button" key={item.page} className={`index-card${active ? " is-active" : ""}${item.page === "playtest" ? " is-play" : ""}`} aria-current={active ? "page" : undefined} onClick={() => goTo(item.page)} style={{ "--index-tilt": `${((index % 3) - 1) * .6}deg` } as CSSProperties}>
          <span className="index-card-tab">{String(index + 1).padStart(2, "0")}</span>
          {art && <span className="index-card-art"><img src={art} alt="" loading="lazy" decoding="async" /></span>}{!art && item.page === "collection" && careerSummary && <span className="index-card-art index-card-art--career" aria-hidden="true"><CareerRing fraction={careerSummary.fraction} size={78} stroke={6}><b>{careerSummary.level}</b><small>Level</small></CareerRing></span>}
          <span className="index-card-copy"><b>{item.label}</b><small>{item.description}</small></span>
          {active && <span className="index-card-stamp" aria-hidden="true">You are here</span>}
        </button>; })}</nav>
        <button type="button" className="dojo-index-search" onClick={(event) => openSearchPalette(event)}><span aria-hidden="true">⌕</span>Search cards, rules and rulings<kbd>/</kbd></button>
      </div>
    </aside></>}
    {searchOpen && <div className="search-palette-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeSearch()}><div className="search-palette" id="dojo-search-palette" role="dialog" aria-modal="true" aria-label="Search the dojo">
      <label className="search-palette-field"><span aria-hidden="true">⌕</span><input ref={searchInputRef} value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} onKeyDown={handleGlobalSearchKeyDown} placeholder="Search cards, rules, rulings, glossary…" aria-label="Search cards, rules, rulings, variants, and glossary" role="combobox" aria-autocomplete="list" aria-controls="dojo-global-results" aria-expanded={globalResults.length > 0} aria-activedescendant={globalActiveDescendant} /><kbd aria-hidden="true">Esc</kbd></label>
      {globalResults.length > 0 ? renderGlobalResults("global-results", "dojo-global-results") : <div className="search-palette-empty">{globalSearch.trim().length >= 2 ? <p>No matching filing number. Try a shorter search.</p> : <><span>Try a filing</span><div>{["Basic Jab", "Tempo", "Combo", "Belt", "Reaction"].map((hint) => <button type="button" key={hint} onClick={() => { setGlobalSearch(hint); searchInputRef.current?.focus(); }}>{hint}</button>)}</div></>}</div>}
      <footer className="search-palette-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> choose</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></footer>
    </div></div>}
    <div key={routeKey} className="view-stage">{route.page === "home" && <HomeView goTo={goTo} displayName={displayName} avatar={avatar} />}{route.page === "playtest" && <Suspense fallback={<MatLoading />}><PlaytestView goTo={goTo} /></Suspense>}{route.page === "quickstart" && <QuickStartView goTo={goTo} />}{route.page === "story" && <StoryView goTo={goTo} />}{route.page === "rules" && <RulesReader initialChapterId={route.chapterId ?? ""} initialSectionId={route.sectionId ?? ""} headerArt={headerRulesUrl} />}{route.page === "cards" && <CardLibrary cardId={route.cardId} headerArt={headerCardsUrl} imageUrlFor={cardImageUrl} hasArt={hasCardArt} />}{route.page === "collection" && <CollectionPage />}{route.page === "arena" && <Suspense fallback={<MatLoading />}><TestArena /></Suspense>}{route.page === "rulings" && <RulingsView initialTab={route.tab ?? "official"} initialQuery={route.query ?? ""} />}{route.page === "glossary" && <GlossaryPage initialQuery={route.term ?? ""} headerArt={headerGlossaryUrl} />}{route.page === "lab" && internalLabAvailable && <DesignLab theme={theme} onToggleTheme={toggleTheme} onToast={pushToast} />}{route.page === "lab" && !internalLabAvailable && <HomeView goTo={goTo} displayName={displayName} avatar={avatar} />}{route.page === "settings" && <SettingsPage theme={theme} accent={accent} displayName={displayName} avatar={avatar} presentationPreferences={presentationPreferences} onPresentationPreferencesChange={changePresentationPreferences} onToggleTheme={toggleTheme} onAccentChange={(next) => { setAccent(next); pushToast({ kind: "stamp", eyebrow: "Personal settings", title: `${next.toLocaleUpperCase()} accent filed`, message: "The whole website has received the memo.", duration: 2800 }); }} onNameChange={(next) => setDisplayName(next)} onAvatarChange={(next) => { setAvatar(next); pushToast({ kind: "stamp", eyebrow: "Personal settings", title: "Avatar filed", message: "The new field agent has been cleared for the dojo.", duration: 2800 }); }} onToast={pushToast} />}{route.page === "search" && <SearchPage query={route.query ?? ""} />}</div>
    <nav className="thumb-bar" aria-label="Quick navigation">{MOBILE_BOTTOM_NAVIGATION.map((item) => { const active = navigationItemIsActive(item, route); return <button type="button" key={item.page} className={`thumb-bar-item${item.page === "playtest" ? " is-play" : ""}${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={() => goTo(item.page)}><span aria-hidden="true">{item.mobileBottomIcon}</span><b>{item.shortLabel}</b></button>; })}</nav>
    <footer className="site-footer"><div className="shell footer-inner"><div className="brand footer-brand"><BrandMark /><span><b>DOJO</b><em>PAPER-FU // DECKBUILDER</em></span></div><p>Build your deck. Earn your belt. File the incident.</p><span>Filed with the Department. Probably correctly.</span></div></footer>
    {scrollProgress > .2 && <button className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: paperScrollBehavior() })} aria-label="Back to top"><span aria-hidden="true">↑</span><b>Top</b></button>}
    <PaperToastStack toasts={toasts} onDismiss={dismissToast} />
  </div></ToastContext.Provider>;
}
