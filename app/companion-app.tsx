"use client";

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AVATAR_IMAGES } from "./avatar-catalog";
import cardPlaceholderUrl from "./assets/art/card-placeholder-v2.webp";
import headerBackstoryUrl from "./assets/art/backstory-expo-v3.webp";
import headerCardsUrl from "./assets/art/cards-archive-v3.webp";
import headerRulesUrl from "./assets/art/full-rules-field-guide-v1.png";
import headerGlossaryUrl from "./assets/art/glossary-fieldguide-v3.webp";
import headerQuickstartUrl from "./assets/art/quickstart-expo-v3.webp";
import headerRulingsUrl from "./assets/art/rulings-dispute-v3.webp";
import heroPaperFuUrl from "./assets/art/home-expo-v3.webp";
import starterJabArtUrl from "./assets/cards/starters/ddb-sta-core-003_basic-jab.webp";
import highGuardArtUrl from "./assets/cards/starters/ddb-sta-core-009_high-guard.webp";
import cardsJson from "./data/cards.json";
import { CANONICAL_RULES, COMBAT_FORMULA_TEXT, COMBAT_SEQUENCE, COMBAT_XP_RULE, DEFENSE_WITHOUT_CARD_RULE, GAME_MODES as CANONICAL_GAME_MODES, HAND_SIZE, PHASES as CANONICAL_PHASES, PHASE_DETAILS as CANONICAL_PHASE_DETAILS, ROUND_STRUCTURE_SUMMARY, RULE_PRIORITY, SETUP_STEPS, STARTER_CARDS as CANONICAL_STARTER_CARDS, STARTER_EXAMPLES, TABLE_JUDGE_STEPS } from "./canonical-presentation";
import { PAPER_FU_TOAST_EVENT, type PaperFuToastDetail } from "./paper-fu-events";
import PlaytestView from "./playtest";
import SearchPage from "./search-page";
import DesignLab from "./design-lab";
import SettingsPage from "./settings-page";
import { navigate, readRoute, replaceRoute, subscribeToRoute, topLevelRoute, type RulingsTab, type SitePage, type SiteRoute } from "./routing";
import { ALL_GLOSSARY_ENTRIES, SEARCH_GROUP_LABELS, cardSearchText, groupSearchResults, normalizeSearchQuery, publicCardDetails, searchDojo, type CardEntry, type SearchResult } from "./search";
import { DESKTOP_NAVIGATION, MOBILE_MENU_NAVIGATION, navigationItemIsActive } from "./site-navigation";
import { AVATAR_OPTIONS, applyThemeToDocument, readInitialTheme, readUserPreferences, THEME_STORAGE_KEY, updateUserPreferences, type AccentKey, type AvatarKey, type PresentationPreferences } from "./user-preferences";

const CardInspector = lazy(() => import("./card-inspector").then((module) => ({ default: module.CardInspector })));

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
export type ToastKind = "note" | "success" | "warning" | "stamp" | "critical";
export type ToastInput = { kind?: ToastKind; eyebrow?: string; title: string; message?: string; duration?: number; variant?: number };
type PaperToast = ToastInput & { id: number };

let toastSequence = 0;
const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);
const usePaperToast = () => useContext(ToastContext);
const paperHaptic = (pattern: number | number[] = 8) => {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
};
const paperScrollBehavior = (): ScrollBehavior => typeof window !== "undefined" && (document.documentElement.dataset.motion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth";

const cardData = cardsJson as unknown as { version: string; cards: CardEntry[]; counts: Record<string, number>; decks: string[]; total: number };
const rulesData = CANONICAL_RULES as unknown as { version: string; chapters: RuleChapter[]; officialRulings: OfficialRuling[]; glossary: { term: string; meaning: string }[]; houseRules: HouseRule[] };
const BINDER_STORAGE_KEY = "dojo-binder-v1";
const readStoredStringSet = (key: string) => {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
};
const storyChapter = rulesData.chapters.find((chapter) => chapter.number === 1);
const ruleChapters = rulesData.chapters.filter((chapter) => chapter.number >= 1 && chapter.number <= 16);
const GLOSSARY_ENTRIES = ALL_GLOSSARY_ENTRIES;
const DOWNLOADS = {
  fullRules: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Full_Rules.docx`,
  canonicalRules: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Canonical_Rules.md`,
  quickStart: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Quick_Start.docx`,
  glossary: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Glossary.docx`,
  cardCatalog: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Card_Catalog.xlsx`,
  defenseEquipmentSources: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Defensive_Equipment_Editable_ORA.zip`,
  consumableSources: `${import.meta.env.BASE_URL}downloads/Dojo_Deckbuilder_v2.3_Consumable_Cards_Editable_ORA.zip`,
};
const VIEW_LABELS: Record<SitePage, string> = {
  home: "Dojo Desk",
  playtest: "Field Test",
  quickstart: "Quick Start",
  story: "Backstory",
  rules: "Full Rules",
  cards: "Card Library",
  rulings: "Rulings & Variants",
  glossary: "Glossary",
  lab: "Design Lab",
  settings: "Settings",
  search: "Search",
};
const HOME_MODE_META: Record<string, { number: string; status: string; tone: "action" | "blue" | "brass" | "violet"; hook: string }> = {
  "tag-team": { number: "01", status: "Recommended", tone: "brass", hook: "Trade places, share the paperwork, and discover that teamwork is mostly a louder kind of arguing." },
  "standard-clash": { number: "02", status: "Rules filed", tone: "blue", hook: "The classic Paper-Fu appointment: two fighters, three zones, and no excuse for losing the receipt." },
  "quick-duel": { number: "03", status: "Live field test", tone: "action", hook: "A brisk, complete fight for proving the deck, the stance, and the exact volume of your HIYAH." },
  "boss-blitz": { number: "04", status: "Boss room pending", tone: "violet", hook: "One oversized problem. A team of certified nuisances. The filing cabinet has requested backup." },
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

const displayRuleNumber = (chapter: RuleChapter) => String(ruleChapters.findIndex((entry) => entry.id === chapter.id) + 1).padStart(2, "0");

const initialAccent = (): AccentKey => readUserPreferences().accent;
const initialDisplayName = (): string => readUserPreferences().displayName;
const initialAvatar = (): AvatarKey => readUserPreferences().avatar;
const OFFICIAL_RULINGS = rulesData.officialRulings;

const valueLabel = (value: string | number | null | undefined) => value === null || value === undefined || value === "" ? "—" : String(value);
const numeric = (value: string | number | null | undefined) => {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};
const cardImageUrl = (card: CardEntry) => card.image ? CARD_IMAGE_URLS[card.image] ?? card.image : COMPLETE_CARD_URLS_BY_CATALOG_ID[card.catalogId] ?? cardPlaceholderUrl;
const hasCardArt = (card: CardEntry) => Boolean(card.image || COMPLETE_CARD_URLS_BY_CATALOG_ID[card.catalogId]);

function RuleTable({ rows }: { rows: (string | number)[][] }) {
  if (!rows.length) return null;
  if (rows.length === 1 || (rows[0]?.length === 1 && rows.length <= 2)) {
    return <aside className="rule-callout">{rows.flat().filter(Boolean).map((cell, index) => <p key={index}>{cell}</p>)}</aside>;
  }
  const [head, ...body] = rows;
  return <div className="table-scroll"><table className="rule-table"><thead><tr>{head.map((cell, index) => <th scope="col" key={index}>{cell}</th>)}</tr></thead><tbody>{body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td data-label={String(head[cellIndex] ?? "")} key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function RuleBlocks({ blocks }: { blocks: RuleBlock[] }) {
  const content: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    content.push(<ul className="rule-bullets" key={`bullets-${content.length}`}>{bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}</ul>);
    bullets = [];
  };
  blocks.forEach((block, index) => {
    if (block.kind === "bullet") return void bullets.push(block.text);
    flush();
    content.push(block.kind === "table" ? <RuleTable rows={block.rows} key={`table-${index}`} /> : <p key={`p-${index}`}>{block.text}</p>);
  });
  flush();
  return <>{content}</>;
}

function SectionHeader({ eyebrow, title, intro, art }: { eyebrow: string; title: string; intro: string; art: string }) {
  return <header className="section-header paper-stack"><i className="fastener paperclip header-paperclip" aria-hidden="true" /><div className="section-header-copy"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p><div className="section-header-foot"><span>DEPARTMENT ARCHIVE · OPEN FILE</span><b>Handle with confidence</b></div></div><div className="section-header-art" aria-hidden="true"><span className="section-header-art-label">FORM 00{eyebrow.length % 7 + 1} · VISUAL EVIDENCE</span><img src={art} alt="" decoding="async" /><span className="section-header-art-stamp">CLEARED<br />FOR TABLE USE</span></div></header>;
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M4 25 22 15l13 24-18 10z" fill="#d7ccb9" stroke="#252629" strokeWidth="2.5" strokeLinejoin="round"/><path d="M14 13 34 8l8 29-20 5z" fill="#eee3cf" stroke="#252629" strokeWidth="2.5" strokeLinejoin="round"/><path d="m27 5 22 3 9 10-5 24-30-3z" fill="#fff8e9" stroke="#252629" strokeWidth="2.5" strokeLinejoin="round"/><path d="m37 17-4 13 6-5-2 9 11-12-7 4 3-9z" fill="#b91035"/><path d="M9 36c12 6 32 6 47-4l3 7c-13 9-35 11-50 5z" fill="#b91035" stroke="#252629" strokeWidth="2.5" strokeLinejoin="round"/><path d="m29 38 6-3 7 5-3 7-7 2-6-5z" fill="#d62143" stroke="#252629" strokeWidth="2.5" strokeLinejoin="round"/><path d="m29 46-12 13 8 3 11-14m4-3 12 11-7 4-12-12" fill="#b91035" stroke="#252629" strokeWidth="2.5" strokeLinejoin="round"/></svg></span>;
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

function DetailModal({ eyebrow, title, children, onClose, accent = "red" }: { eyebrow: string; title: string; children: ReactNode; onClose: () => void; accent?: "red" | "green" | "gold" }) {
  const modalRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); previouslyFocused?.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><article ref={modalRef} className={`detail-modal paper-stack accent-${accent}`} role="dialog" aria-modal="true" aria-labelledby="detail-modal-title"><i className="modal-burst" aria-hidden="true" /><button autoFocus className="modal-close" onClick={onClose} aria-label="Close details">×</button><span className="eyebrow">{eyebrow}</span><h2 id="detail-modal-title">{title}</h2>{children}</article></div>, document.body);
}

function HomeView({ goTo, displayName, avatar }: { goTo: (view: ViewId) => void; displayName: string; avatar: AvatarKey }) {
  return <main className="home-page">
    <section className="hero shell">
      <div className="hero-copy">
        <span className="version-pill"><span className="status-dot" /> Paper-Fu field desk / active</span>
        <p className="kicker">A tabletop sport, carefully laminated.</p>
        <h1>Pick your fight.<br /><em>File your legend.</em></h1>
        <p className="hero-lede">Paper-Fu is a fixed-pack deckbuilder with more than one way to make a mess: duel a rival, trade places with a team, or leave room for the boss that is currently being measured for a bigger chair.</p>
        <div className="hero-actions"><button className="button primary desktop-play-cta" onClick={() => goTo("playtest")}>Play Quick Duel <span>→</span></button><button className="button ghost" onClick={() => goTo("quickstart")}>Open the mode docket</button></div>
        <div className="hero-note"><span className="hero-agent-greeting"><img src={AVATAR_IMAGES[avatar]} alt="" /><span>Welcome back, <strong>{displayName || "Paper-Fu Agent"}</strong>.</span></span><strong>4 official formats</strong> · {cardData.total} filed cards · 27 fighter faces on record</div>
      </div>
      <div className="hero-art-new"><div className="hero-paper-card"><span className="paper-shadow shadow-one" /><span className="paper-shadow shadow-two" /><i className="fastener tape-strip hero-tape-one" aria-hidden="true" /><i className="fastener tape-strip hero-tape-two" aria-hidden="true" /><span className="hero-paper-label">FORM 07 · LICENSED CHAOS</span><img src={heroPaperFuUrl} alt="Paper-Fu fighters and a city inspector at the annual licensing tournament" fetchPriority="high" decoding="async" /><div className="hero-paper-caption"><span>PAPER-FU / FIELD EVIDENCE</span><strong>THE MAT IS A DESK</strong></div><div className="impact-word" aria-hidden="true">HIYAH!</div></div><div className="hero-art-note"><b>Cleared for yelling</b><small>Filed by the Department of Competitive Safety. Stamped twice for confidence.</small></div></div>
    </section>
    <section className="stats-strip" aria-label="Paper-Fu operating facts"><div className="shell stats-inner"><div><strong>04</strong><span>Official game formats</span></div><div><strong>15</strong><span>Cards in the opening packet</span></div><div><strong>03</strong><span>Combat zones to declare</span></div><div><strong>∞</strong><span>Ways to cite a technicality</span></div></div></section>
    <section className="shell home-command-section" aria-labelledby="mode-docket-title">
      <div className="home-section-heading"><div><span className="eyebrow">01 / Choose your docket</span><h2 id="mode-docket-title">Four ways to put the paperwork in danger.</h2></div><p>The rules already know how these formats work. The field desk is expanding to give every one of them a proper place to land.</p></div>
      <div className="home-mode-board">{CANONICAL_GAME_MODES.map((mode) => { const meta = HOME_MODE_META[mode.id] ?? { number: "00", status: "Filed", tone: "blue" as const, hook: "A certified Paper-Fu format awaiting its next stamp." }; const isLive = mode.id === "quick-duel"; return <button className={`home-mode-card paper-stack interactive-paper tone-${meta.tone}${isLive ? " is-live" : ""}`} key={mode.id} onClick={() => goTo(isLive ? "playtest" : "quickstart")}><div className="home-mode-card-top"><span className="home-mode-index">{meta.number}</span><span className="home-mode-status">{meta.status}</span></div><h3>{mode.title}</h3><p>{meta.hook}</p><div className="home-mode-spec"><span>{mode.players}</span><span>{mode.fighters}</span></div><div className="home-mode-footer"><strong>{mode.win}</strong><span>{isLive ? "Enter field test" : "Review mode brief"} →</span></div></button>; })}</div>
      <div className="home-command-foot"><span><b>Filed status:</b> Quick Duel is playable now. The other formats are documented in Quick Start while their dedicated tables are built.</span><button className="text-link" onClick={() => goTo("quickstart")}>Read every mode brief →</button></div>
    </section>
    <section className="shell home-briefing-section" aria-labelledby="briefing-title">
      <div className="home-briefing-lead"><span className="eyebrow">02 / The Paper-Fu brief</span><h2 id="briefing-title">Small deck.<br /><em>Big paperwork.</em></h2><p>Every fight starts with the same readable foundation: choose a stance, build with a fixed packet, declare a zone, then let the table argue in public.</p><button className="button ghost" onClick={() => goTo("quickstart")}>Learn the first round <span>→</span></button></div>
      <div className="home-proof-grid"><article className="paper-stack"><span>01</span><h3>Build mid-disaster</h3><p>Buy the next useful card while the opponent is still explaining their last one.</p><b>DECKBUILDER / NO FILLER</b></article><article className="paper-stack"><span>02</span><h3>Read the hit</h3><p>Three zones, one clear formula, and enough receipts to settle the argument.</p><b>COMBAT / WITH WITNESS</b></article><article className="paper-stack"><span>03</span><h3>Make it a table</h3><p>Quick Duel is the first appointment. Teams, bosses, and full-table chaos are on the docket.</p><b>MODULAR / READY TO EXPAND</b></article></div>
    </section>
    <section className="phase-section"><div className="shell"><div className="section-title-row inverse"><div><span className="eyebrow">03 / One round. Five approved noises.</span><h2>H.I.Y.A.H. is the workflow.</h2></div><button className="text-link light" onClick={() => goTo("quickstart")}>Read the full protocol →</button></div><div className="phase-track">{CANONICAL_PHASES.map((phase, index) => <article key={`${phase.name}-${index}`}><span className="phase-letter">{phase.letter}</span><div><b>0{index + 1}</b><h3>{phase.name}</h3><p>{phase.text}</p></div></article>)}</div></div></section>
    <section className="shell route-section">
      <div className="section-title-row"><div><span className="eyebrow">04 / Open the field desk</span><h2>Everything around the mat.</h2></div><p>Find the next useful thing before somebody cites a napkin as precedent. The forms are short. The grudges are not.</p></div>
      <div className="route-grid">{[
        ["playtest", "01", "Field Test", "Throw hands with a literal rules engine. It has receipts and no sense of humor."],
        ["quickstart", "02", "Get Certified", "Learn the legal order of operations before the fire marshal learns your name."],
        ["story", "03", "Origin File", "A permit, a ferret, and one overworked cabinet accidentally invented a martial art."],
        ["rules", "04", "Rulebook", "The complete official law, including the paragraphs nobody wanted to laminate."],
        ["cards", "05", "Card Cabinet", `Browse all ${cardData.total} registered cards. Judge the art. Then squint at the tiny text.`],
        ["rulings", "06", "Tiny Court", "Official rulings and house variants for disputes that refuse to stay tiny."],
      ].map(([view, number, title, text]) => <button className={`route-card paper-stack interactive-paper ${view === "playtest" ? "route-playtest" : ""}`} key={view} onClick={() => goTo(view as ViewId)}><span>{number}</span><h3>{title}</h3><p>{text}</p><b>Open section →</b></button>)}</div>
    </section>
    <section className="shell roster-section">
      <div className="section-title-row"><div><span className="eyebrow">05 / Meet the delegation</span><h2>Twenty-seven fighters. Zero normal entrances.</h2></div><button className="text-link" onClick={() => goTo("cards")}>Inspect the full cabinet →</button></div>
      <div className="roster-grid home-roster-grid">{AVATAR_OPTIONS.slice(0, 8).map((fighter) => <article className="paper-stack" key={fighter.id}><div className="roster-image"><img src={AVATAR_IMAGES[fighter.id]} alt={fighter.label} loading="lazy" decoding="async" /></div><span>{fighter.quip}</span><h3>{fighter.label}</h3></article>)}</div>
      <div className="home-roster-foot"><span><b>ROSTER NOTE</b> Eight faces shown. Nineteen more are waiting for their dramatic paperwork.</span><button className="button primary" onClick={() => goTo("cards")}>Browse the card cabinet <span>→</span></button></div>
    </section>
  </main>;
}

function StoryView({ goTo }: { goTo: (view: ViewId) => void }) {
  const storyParagraphs = storyChapter?.intro.filter((block): block is Extract<RuleBlock, { kind: "paragraph" }> => block.kind === "paragraph").map((block) => block.text) ?? [];
  return <main className="page-shell shell story-page">
    <SectionHeader eyebrow="The Backstory" title="The field test was approved. The filing cabinet was not." intro="The official Paper-Fu origin, preserved by the Department of Competitive Safety and immediately declared ancient history." art={headerBackstoryUrl} />
    <section className="story-lede paper-stack"><i className="fastener tape-strip story-tape" aria-hidden="true" /><span className="story-dropcap">P</span><div><span className="eyebrow">The Department’s original mistake</span><h2>{storyParagraphs[1]}</h2></div></section>
    <section className="story-panels"><article className="paper-stack"><span>01</span><h2>The Expo</h2><p>{storyParagraphs[2]}</p><i>coupons · ferret · fire marshal</i></article><article className="paper-stack"><span>02</span><h2>The Cabinet</h2><p>{storyParagraphs[3]}</p><i>TAX RECEIPTS → ancient wisdom</i></article><article className="paper-stack"><span>03</span><h2>The Tournament</h2><p>{storyParagraphs[4]}</p><i>delegations · field test · Model Dojo</i></article></section>
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
      <div className="quick-mode-grid">{CANONICAL_GAME_MODES.map((mode, index) => <button className={`mode-card paper-stack interactive-paper mode-card-${index + 1} ${mode.id === "tag-team" ? "recommended" : ""}`} onClick={() => setSelectedMode(mode)} key={mode.id}><span>{mode.label}</span><h2>{mode.title}</h2><p>{mode.players} · {mode.fighters}</p><b>{mode.win}</b><small>Open mode brief</small></button>)}</div>
    </section>

    <section className="golden-rule-card quick-golden paper-stack"><div><span className="eyebrow">The table agreement</span><h2>The card wins.</h2></div><p>{GOLDEN_RULE}</p><span className="golden-stamp" aria-hidden="true">!</span></section>

    <section className="paper-panel setup-panel paper-stack quickstart-step-block" id="quickstart-setup"><div className="quickstart-step-heading"><span className="step-stamp">01</span><div><span className="eyebrow">Set the table</span><h2>{setup.length} things before the first HIYAH</h2><p>Put the right paper on the mat, then let the table get delightfully unreasonable.</p></div><span className="quickstart-step-status">READY<br />TO FILE</span></div><ol className="setup-list">{setup.map((item, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></li>)}</ol><StarterDeckLesson jabArt={starterJabArtUrl} guardArt={highGuardArtUrl} /></section>

    <section className="quick-section interactive-round quickstart-step-block" id="quickstart-round"><div className="quickstart-step-heading"><span className="step-stamp">02</span><div><span className="eyebrow">Play the round</span><h2>Honor once. Then each player completes I.Y.A.H.</h2><p className="round-clarifier">{ROUND_STRUCTURE_SUMMARY}</p></div><span className="quickstart-step-status">ONE LOOP<br />FIVE BEATS</span></div><div className="quick-phases">{CANONICAL_PHASES.map((phase, index) => <button className={selectedPhase === index ? "active" : ""} onClick={() => setSelectedPhase(index)} key={phase.name}><span>{phase.letter}</span><div><small>{index === 0 ? "Once per round" : "Each player"}</small><h3>{phase.name}</h3><p>{phase.text}</p></div></button>)}</div><article className="phase-explainer paper-stack"><div><span className="phase-explainer-letter">{CANONICAL_PHASES[selectedPhase].letter}</span><div><span className="eyebrow">{CANONICAL_PHASE_DETAILS[selectedPhase].when}</span><h3>{CANONICAL_PHASE_DETAILS[selectedPhase].name}</h3><p>{CANONICAL_PHASE_DETAILS[selectedPhase].who}</p></div></div><ol>{CANONICAL_PHASE_DETAILS[selectedPhase].steps.map((step) => <li key={step}>{step}</li>)}</ol><blockquote>{CANONICAL_PHASE_DETAILS[selectedPhase].quip}</blockquote></article></section>

    <section className="combat-primer paper-stack quickstart-step-block"><div className="combat-copy"><span className="eyebrow">Combat</span><h2>Attack a zone. Let everybody interfere.</h2><ol>{COMBAT_SEQUENCE.map((step) => <li key={step}>{step}</li>)}</ol></div><div className="formula-card"><span>Final combat formula</span><p>{COMBAT_FORMULA_TEXT}</p></div><CombatExample /></section>
    <section className="quick-footer-card paper-stack"><div><span className="eyebrow">The whole game</span><h2>Fight → focus → stronger cards → belt tasks → win.</h2><p>Need every edge case? The complete online rulebook stays one click away.</p></div><button className="button primary" onClick={() => goTo("rules")}>Open the full rules</button></section>
    {selectedMode && <DetailModal eyebrow={`${selectedMode.players} · ${selectedMode.fighters}`} title={selectedMode.title} onClose={() => setSelectedMode(null)} accent={selectedMode.id === "tag-team" ? "green" : "red"}><p className="modal-lede">{selectedMode.detail}</p><div className="modal-win"><span>How to win</span><strong>{selectedMode.win}</strong></div>{selectedMode.notes.length > 0 && <ul className="modal-list">{selectedMode.notes.map((note) => <li key={note}>{note}</li>)}</ul>}</DetailModal>}
  </main>;
}

function RulesView({ initialChapterId = "", initialSectionId = "" }: { initialChapterId?: string; initialSectionId?: string }) {
  const [selectedId, setSelectedId] = useState(() => ruleChapters.some((chapter) => chapter.id === initialChapterId) ? initialChapterId : ruleChapters[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState(initialSectionId);
  useEffect(() => {
    setSelectedId(ruleChapters.some((chapter) => chapter.id === initialChapterId) ? initialChapterId : ruleChapters[0]?.id ?? "");
  }, [initialChapterId]);
  const selected = ruleChapters.find((chapter) => chapter.id === selectedId) ?? ruleChapters[0];
  const selectedIndex = ruleChapters.findIndex((chapter) => chapter.id === selected.id);
  useEffect(() => {
    const sectionIds = selected.sections.map((section) => section.id);
    if (!sectionIds.length) { setActiveSectionId(""); return; }
    setActiveSectionId((current) => initialSectionId && sectionIds.includes(initialSectionId) ? initialSectionId : sectionIds.includes(current) ? current : sectionIds[0]);
    const sections = sectionIds.map((id) => document.getElementById(id)).filter((node): node is HTMLElement => node instanceof HTMLElement);
    if (!sections.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveSectionId(visible[0].target.id);
    }, { rootMargin: "-18% 0px -68% 0px", threshold: 0 });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [initialSectionId, selected.id]);
  useEffect(() => {
    if (!initialSectionId || query) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(initialSectionId)?.scrollIntoView({ behavior: paperScrollBehavior(), block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [initialSectionId, query, selected.id]);
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return [];
    return ruleChapters.flatMap((chapter) => {
      const sections = chapter.sections.filter((entry) => JSON.stringify(entry).toLocaleLowerCase().includes(term));
      const overview = JSON.stringify([chapter.title, chapter.intro]).toLocaleLowerCase().includes(term);
      return [...(overview ? [{ chapter, section: undefined }] : []), ...sections.map((section) => ({ chapter, section }))];
    });
  }, [query]);
  const chooseChapter = (id: string) => {
    setSelectedId(id);
    setQuery("");
    navigate({ page: "rules", chapterId: id });
    window.requestAnimationFrame(() => document.getElementById("rule-reader")?.scrollIntoView({ behavior: paperScrollBehavior(), block: "start" }));
  };
  const chooseSection = (id: string) => {
    setActiveSectionId(id);
    navigate({ page: "rules", chapterId: selected.id, sectionId: id });
    window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: paperScrollBehavior(), block: "start" }));
  };
  const chooseSearchResult = (chapterId: string, sectionId?: string) => {
    setQuery("");
    navigate({ page: "rules", chapterId, sectionId });
    if (!sectionId) window.requestAnimationFrame(() => document.getElementById("rule-reader")?.scrollIntoView({ behavior: paperScrollBehavior(), block: "start" }));
  };
  return <main className="rules-page shell page-shell">
    <SectionHeader eyebrow="Official game guide" title="Full rules." intro="Find a chapter, search a term, and get back to the table." art={headerRulesUrl} />
        <div className="rules-toolbar"><label className="search-box large"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all rules—Flow, Tempo, KO, Combo…" aria-label="Search all rules" />{query && <button onClick={() => setQuery("")} aria-label="Clear rules search">×</button>}</label><span className="source-badge">{ruleChapters.length} focused chapters · filed for table use</span></div>
    <label className="mobile-chapter-picker"><span>Jump to a chapter</span><select value={selected.id} onChange={(event) => chooseChapter(event.target.value)}>{ruleChapters.map((chapter) => <option value={chapter.id} key={chapter.id}>{displayRuleNumber(chapter)} · {chapter.title}</option>)}</select></label>
    {query ? <section className="rule-search-results" aria-live="polite"><h2>{matches.length} matching section{matches.length === 1 ? "" : "s"}</h2>{matches.length ? matches.map(({ chapter, section }) => <button key={`${chapter.id}-${section?.id ?? "overview"}`} onClick={() => chooseSearchResult(chapter.id, section?.id)}><span>Chapter {displayRuleNumber(chapter)} · {chapter.title}</span><h3>{section?.title ?? "Chapter overview"}</h3><p>Open this match</p></button>) : <div className="empty-state"><strong>No rule found.</strong><p>Try a shorter term or search the Card Library for printed card text.</p></div>}</section> :
      <div className="rules-layout" id="rule-reader"><aside className="chapter-nav" aria-label="Rule chapters"><span>Contents</span>{ruleChapters.map((chapter) => <button aria-current={chapter.id === selected.id ? "page" : undefined} className={chapter.id === selected.id ? "active" : ""} onClick={() => chooseChapter(chapter.id)} key={chapter.id}><b>{displayRuleNumber(chapter)}</b><span>{chapter.title}</span></button>)}{selected.sections.length > 0 && <nav className="chapter-subsection-nav" aria-label={`${selected.title} sections`}><span>In this chapter</span>{selected.sections.map((section) => <button type="button" aria-current={activeSectionId === section.id ? "location" : undefined} className={activeSectionId === section.id ? "active" : ""} onClick={() => chooseSection(section.id)} key={section.id}>{section.title}</button>)}</nav>}</aside><article className="rule-article paper-stack"><header><span>Chapter {displayRuleNumber(selected)}</span><h1>{selected.title}</h1></header>{selected.sections.length > 0 && <details className="rule-section-picker"><summary>Sections in this chapter</summary><nav className="rule-section-nav" aria-label={`${selected.title} sections`}>{selected.sections.map((section) => <button type="button" aria-current={activeSectionId === section.id ? "location" : undefined} className={activeSectionId === section.id ? "active" : ""} onClick={() => chooseSection(section.id)} key={section.id}>{section.title}</button>)}</nav></details>}<RuleBlocks blocks={selected.intro} />{selected.sections.map((section) => <section id={section.id} key={section.id}><h2>{section.title}</h2><RuleBlocks blocks={section.content} /></section>)}<footer className="chapter-footer"><span>End of Chapter {displayRuleNumber(selected)}</span>{ruleChapters[selectedIndex + 1] && <button onClick={() => chooseChapter(ruleChapters[selectedIndex + 1].id)}>Next: {ruleChapters[selectedIndex + 1].title} →</button>}</footer></article></div>}
  </main>;
}

function CardTile({ card, onOpen, saved = false }: { card: CardEntry; onOpen: () => void; saved?: boolean }) {
  const typeClass = `type-${card.cardType.toLocaleLowerCase().replaceAll(" ", "-")}`;
  const savedStar = saved && <span className="binder-star" aria-label="Saved in Dojo Binder" title="Saved in Dojo Binder">★</span>;
  // Printed cards already carry name, stats and rules on the art, so the tile shows the whole card and a short caption.
  if (hasCardArt(card)) {
    return <button className={`library-card library-card--printed paper-stack interactive-paper ${typeClass}`} onClick={onOpen} aria-label={`${card.name}, ${card.cardType}. Open card details.`}>
      {savedStar}
      <span className="library-card-print"><img src={cardImageUrl(card)} alt="" loading="lazy" decoding="async" /></span>
      <span className="library-card-caption"><small>{card.catalogId} · {card.deck}</small><b>{card.name}</b></span>
      <span className="open-card">View card →</span>
    </button>;
  }
  const statPairs = Object.entries(card.stats).slice(0, 3);
  return <button className={`library-card paper-stack interactive-paper ${typeClass}`} onClick={onOpen}>
    {savedStar}
    <div className="card-topline"><span>{card.cardType}</span><b>{card.deck}</b></div><div className="card-art card-art--pending"><img src={cardImageUrl(card)} alt={`Artwork pending for ${card.name}`} loading="lazy" decoding="async" /><span>{card.catalogId}</span></div>
    <div className="card-body"><small>{card.cardType}</small><h3>{card.name}</h3><div className="card-costs">{card.fpCost !== null && card.fpCost !== undefined && <span><b>{valueLabel(card.fpCost)}</b> Focus Cost</span>}{card.focusValue !== null && card.focusValue !== undefined && <span><b>{valueLabel(card.focusValue)}</b> Focus</span>}{card.zone && <span>{card.zone}</span>}</div>{statPairs.length > 0 && <div className="mini-stats">{statPairs.map(([key, value]) => <span key={key}><b>{value}</b>{key}</span>)}</div>}<p>{card.rulesText || card.flavorText || "Open for complete card details."}</p><div className="tag-row">{card.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div></div><span className="open-card">View card →</span>
  </button>;
}

function CardsView({ cardId = "" }: { cardId?: string }) {
  const [query, setQuery] = useState(""); const [type, setType] = useState("All"); const [deck, setDeck] = useState("All");
  const [subtype, setSubtype] = useState("All"); const [timing, setTiming] = useState("All"); const [focusCost, setFocusCost] = useState("All");
  const [sort, setSort] = useState("catalog"); const [visible, setVisible] = useState(24);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => readStoredStringSet(BINDER_STORAGE_KEY));
  const [binderOnly, setBinderOnly] = useState(false);
  const pushToast = usePaperToast();
  const activeCard = cardId ? cardData.cards.find((card) => card.catalogId.toLocaleLowerCase() === cardId.toLocaleLowerCase()) ?? null : null;
  useEffect(() => {
    window.localStorage.setItem(BINDER_STORAGE_KEY, JSON.stringify([...savedIds]));
  }, [savedIds]);
  const toggleSaved = (card: CardEntry) => {
    const wasSaved = savedIds.has(card.catalogId);
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(card.catalogId)) next.delete(card.catalogId); else next.add(card.catalogId);
      return next;
    });
    if (binderOnly && wasSaved) setBinderOnly(false);
    pushToast({ kind: wasSaved ? "note" : "success", eyebrow: "Dojo Binder", title: wasSaved ? "Card removed" : "Card filed", message: card.name });
  };
  const openCard = (card: CardEntry) => navigate({ page: "cards", cardId: card.catalogId });
  const stepCard = (card: CardEntry | null) => { if (card) replaceRoute({ page: "cards", cardId: card.catalogId }); };
  const closeCard = () => replaceRoute({ page: "cards" });
  const types = ["All", ...Object.keys(cardData.counts)];
  const cardsInScope = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const matches = (card: CardEntry) => !term || cardSearchText(card).includes(term);
    return cardData.cards.filter((card) => (deck === "All" || card.deck === deck) && matches(card));
  }, [query, deck]);
  const typeCounts = useMemo(() => cardsInScope.reduce<Record<string, number>>((counts, card) => { counts[card.cardType] = (counts[card.cardType] ?? 0) + 1; return counts; }, {}), [cardsInScope]);
  const typedCards = useMemo(() => cardsInScope.filter((card) => (type === "All" || card.cardType === type) && (!binderOnly || savedIds.has(card.catalogId))), [cardsInScope, type, binderOnly, savedIds]);
  const optionCounts = (values: (string | number | null | undefined)[]) => values.reduce<Record<string, number>>((counts, value) => {
    const label = value === null || value === undefined ? "" : String(value).trim();
    if (label && label !== "—") counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});
  const subtypeCounts = useMemo(() => optionCounts(typedCards.map((card) => card.subtype)), [typedCards]);
  const timingCounts = useMemo(() => optionCounts(typedCards.map((card) => card.timing)), [typedCards]);
  const focusCostCounts = useMemo(() => optionCounts(typedCards.map((card) => Number.isFinite(numeric(card.fpCost)) ? numeric(card.fpCost) : null)), [typedCards]);
  const subtypeOptions = Object.keys(subtypeCounts).sort();
  const timingOptions = Object.keys(timingCounts).sort();
  const focusCostOptions = Object.keys(focusCostCounts).sort((a, b) => Number(a) - Number(b));
  const filtered = useMemo(() => {
    return typedCards.filter((card) => (subtype === "All" || card.subtype === subtype) && (timing === "All" || card.timing === timing) && (focusCost === "All" || numeric(card.fpCost) === Number(focusCost))).sort((a, b) => {
      if (sort === "catalog") return a.catalogOrder - b.catalogOrder;
      if (sort === "focus") return numeric(a.fpCost) - numeric(b.fpCost) || a.name.localeCompare(b.name);
      if (sort === "type") return a.cardType.localeCompare(b.cardType) || a.name.localeCompare(b.name);
      if (sort === "deck") return a.deck.localeCompare(b.deck) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [typedCards, subtype, timing, focusCost, sort]);
  const activeIndex = activeCard ? filtered.findIndex((card) => card.id === activeCard.id) : -1;
  const previousCard = activeIndex > 0 ? filtered[activeIndex - 1] : null;
  const nextCard = activeIndex >= 0 && activeIndex < filtered.length - 1 ? filtered[activeIndex + 1] : null;
  const resetSecondaryFilters = () => { setSubtype("All"); setTiming("All"); setFocusCost("All"); };
  const resetFilters = () => { setQuery(""); setType("All"); setDeck("All"); resetSecondaryFilters(); setBinderOnly(false); setVisible(24); };
  return <main className="page-shell shell card-library-page"><SectionHeader eyebrow="Card Library" title={`${cardData.total} cards. One awkward curriculum.`} intro="Search the complete Core catalog by ID, deck, type, rules text, or Focus Cost. The 500-card main pool excludes Starter, Character, and Boss-module cards." art={headerCardsUrl} />
            <section className="library-controls"><div className="library-control library-search-control"><label htmlFor="card-library-search">Search</label><div className="search-box"><span aria-hidden="true">⌕</span><input id="card-library-search" value={query} onChange={(event) => { setQuery(event.target.value); setVisible(24); }} placeholder="ID, name, rules, tag…" />{query && <button onClick={() => setQuery("")} aria-label="Clear card search">×</button>}</div></div><label className="library-control"><span>Deck</span><select value={deck} onChange={(event) => { setDeck(event.target.value); resetSecondaryFilters(); setVisible(24); }}><option>All</option>{cardData.decks.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label className="library-control"><span>Subtype</span><select value={subtype} onChange={(event) => { setSubtype(event.target.value); setVisible(24); }} disabled={!subtypeOptions.length}><option value="All">All subtypes</option>{subtypeOptions.map((entry) => <option value={entry} key={entry}>{entry} ({subtypeCounts[entry]})</option>)}</select></label><label className="library-control"><span>Timing</span><select value={timing} onChange={(event) => { setTiming(event.target.value); setVisible(24); }} disabled={!timingOptions.length}><option value="All">All timings</option>{timingOptions.map((entry) => <option value={entry} key={entry}>{entry} ({timingCounts[entry]})</option>)}</select></label><label className="library-control"><span>Focus Cost</span><select value={focusCost} onChange={(event) => { setFocusCost(event.target.value); setVisible(24); }} disabled={!focusCostOptions.length}><option value="All">Any cost</option>{focusCostOptions.map((entry) => <option value={entry} key={entry}>{entry} Focus ({focusCostCounts[entry]})</option>)}</select></label><label className="library-control"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="catalog">Catalog order</option><option value="name">Name A–Z</option><option value="deck">Deck</option><option value="type">Card type</option><option value="focus">Focus Cost</option></select></label></section>
    <div className="binder-strip"><button type="button" className={`binder-toggle${binderOnly ? " is-saved" : ""}`} aria-pressed={binderOnly} onClick={() => { setBinderOnly((current) => !current); setVisible(24); }}><span aria-hidden="true">{binderOnly ? "★" : "☆"}</span> Dojo Binder <b>{savedIds.size}</b></button><p>Saved on this device only. Open a card to add or remove it.</p></div>
    <div className="type-filters" role="group" aria-label="Filter by card type">{types.map((entry) => <button className={type === entry ? "active" : ""} onClick={() => { setType(entry); resetSecondaryFilters(); setVisible(24); }} key={entry}>{entry}<span>{entry === "All" ? cardsInScope.length : typeCounts[entry] ?? 0}</span></button>)}</div>
    <div className="result-line"><p><strong>{filtered.length}</strong> results</p>{(query || type !== "All" || deck !== "All" || subtype !== "All" || timing !== "All" || focusCost !== "All") && <button onClick={resetFilters}>Reset filters</button>}</div>
    {filtered.length ? <><section className="card-grid">{filtered.slice(0, visible).map((card) => <CardTile key={card.id} card={card} saved={savedIds.has(card.catalogId)} onOpen={() => openCard(card)} />)}</section>{visible < filtered.length && <button className="button load-more" onClick={() => setVisible((count) => count + 24)}>Load 24 more <span>{filtered.length - visible} remaining</span></button>}</> : <div className="empty-state"><strong>No cards match that search.</strong><p>Clear a filter or try a broader rules term.</p><button className="button ghost" onClick={resetFilters}>Reset filters</button></div>}
    {activeCard && <Suspense fallback={null}><CardInspector card={activeCard} imageUrl={cardImageUrl(activeCard)} saved={savedIds.has(activeCard.catalogId)} positionLabel={`${Math.max(1, activeIndex + 1)} of ${filtered.length}`} previousName={previousCard?.name} nextName={nextCard?.name} previousDisabled={!previousCard} nextDisabled={!nextCard} onToggleSaved={() => toggleSaved(activeCard)} onPrevious={() => stepCard(previousCard)} onNext={() => stepCard(nextCard)} onClose={closeCard} /></Suspense>}
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
  const rulings = OFFICIAL_RULINGS.filter((entry) => !normalizedQuery || Object.values(entry).join(" ").toLocaleLowerCase().includes(normalizedQuery));
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
      <section className="ruling-list-section"><div className="rulings-heading"><div><span className="eyebrow">Official clarifications</span><h2>{OFFICIAL_RULINGS.length} current rulings</h2></div></div>{rulings.length ? <div className="ruling-list">{rulings.map(({ id, filed, tag, title, ruling }, index) => <article key={id}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{tag}</b><h3>{title}</h3><p>{ruling}</p></div><strong>{id} · {filed}</strong></article>)}</div> : <div className="empty-state"><strong>No official ruling found.</strong><p>Try a shorter term or switch to House Rules for optional variants.</p></div>}</section>
      <section className="judge-procedure"><div><span className="step-stamp">?</span><h2>The two-minute table judge</h2></div><ol>{TABLE_JUDGE_STEPS.map((step) => <li key={step}>{step}</li>)}</ol></section>
    </> : <>
      <section className="house-grid">{variants.map((entry, index) => { const support = entry; return <button className="paper-stack interactive-paper" onClick={() => navigate({ page: "rulings", tab: "house", query: entry.name })} key={entry.name}><span>{String(index + 1).padStart(2, "0")}</span><small>{entry.category}</small><h2>{entry.name}</h2><p>{entry.summary || entry.rule}</p>{support?.quickDuel.status === "supported" && <span className="variant-playtest-badge">Quick Duel option</span>}<b>Open full variant →</b></button>; })}</section>
      {!variants.length && <div className="empty-state"><strong>No house rule found.</strong><p>Try a shorter term or switch to Official Rulings.</p></div>}
      <section className="new-rule-panel paper-stack"><span className="eyebrow">Build your own</span><h2>A good house rule answers four questions.</h2><div><p><b>When</b> does it trigger?</p><p><b>Who</b> makes choices?</p><p><b>What</b> if it is impossible?</p><p><b>Where</b> is the cap?</p></div></section>
    </>}
    {selected && <DetailModal eyebrow={selected.category || "House Rule"} title={selected.name} onClose={() => replaceRoute({ page: "rulings", tab: "house" })} accent="green"><p className="modal-lede">{selected.summary}</p><aside className="modal-rule"><span>Variant rule</span><p>{selected.rule}</p></aside>{selected.notes && <div className="modal-design-note"><span>Why this wording works</span><p>{selected.notes}</p></div>}{selectedSupport && <div className="variant-support-note" data-status={selectedSupport.quickDuel.status}><b>{selectedSupport.quickDuel.status === "supported" ? "Digital Quick Duel: supported" : selectedSupport.quickDuel.status === "not-applicable" ? "Digital Quick Duel: not applicable" : "Digital Quick Duel: not automated yet"}</b><p>{selectedSupport.quickDuel.reason}</p></div>}<p className="agreement-note">Agree on this variant before setup. It changes only the current game and never rewrites printed card text.</p></DetailModal>}
  </main>;
}

function GlossaryView({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<{ term: string; meaning: string } | null>(() => initialQuery ? GLOSSARY_ENTRIES.find((entry) => normalizeSearchQuery(entry.term) === normalizeSearchQuery(initialQuery)) ?? null : null);
  useEffect(() => {
    setQuery(initialQuery);
    setSelected(initialQuery ? GLOSSARY_ENTRIES.find((entry) => normalizeSearchQuery(entry.term) === normalizeSearchQuery(initialQuery)) ?? null : null);
  }, [initialQuery]);
  const filtered = GLOSSARY_ENTRIES.filter((entry) => `${entry.term} ${entry.meaning}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <main className="page-shell shell glossary-page"><SectionHeader eyebrow="Glossary" title="Speak fluent Paper-Fu" intro="Every defined rules term, separated from the rulebook for fast table lookup. Tap any tile for the full definition." art={headerGlossaryUrl} /><div className="glossary-toolbar"><label className="search-box large"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Flow, Focus, Tempo, Reaction…" aria-label="Search glossary" />{query && <button onClick={() => setQuery("")} aria-label="Clear glossary search">×</button>}</label><span>{filtered.length} of {GLOSSARY_ENTRIES.length} terms</span></div>{filtered.length ? <div className="glossary-grid">{filtered.map((entry, index) => <button className="interactive-paper" onClick={() => navigate({ page: "glossary", term: entry.term })} key={entry.term}><span>{String(index + 1).padStart(2, "0")}</span><strong>{entry.term}</strong><p>{entry.meaning}</p><b>Open term →</b></button>)}</div> : <div className="empty-state"><strong>No term found.</strong><p>Try a shorter word or search the full rules for a phrase that is not a defined term.</p></div>}{selected && <DetailModal eyebrow="Defined term" title={selected.term} onClose={() => replaceRoute({ page: "glossary" })}><aside className="modal-rule"><span>Definition</span><p>{selected.meaning}</p></aside><div className="modal-design-note"><span>At the table</span><p>Use this defined meaning unless a more specific scenario rule or card instruction says otherwise.</p></div></DetailModal>}</main>;
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
  const [globalSearch, setGlobalSearch] = useState("");
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
        searchInputRef.current?.focus({ preventScroll: true });
      } else if (!isTyping && event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

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
    setGlobalSearch("");
    setSelectionIntent(false);
    navigate(result.route);
    window.scrollTo({ top: 0, behavior: paperScrollBehavior() });
  };

  const openFullSearch = () => {
    const query = globalSearch.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (query.length < 2) return;
    closeMenu(false, true);
    setGlobalSearch("");
    setSelectionIntent(false);
    navigate({ page: "search", query });
    window.scrollTo({ top: 0, behavior: paperScrollBehavior() });
  };

  const handleGlobalSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setGlobalSearch("");
      setSelectionIntent(false);
      event.currentTarget.blur();
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
  const routeKey = view === "rules"
    ? `rules-${route.page === "rules" ? route.chapterId ?? "" : ""}-${route.page === "rules" ? route.sectionId ?? "" : ""}`
    : view === "rulings"
      ? "rulings"
      : view === "glossary"
        ? `glossary-${route.page === "glossary" ? route.term ?? "" : ""}`
        : view;

  return <ToastContext.Provider value={pushToast}><div className="site-frame">
    <header className={`site-header${route.page === "playtest" ? " site-header--gameplay" : ""}`}><div className="header-inner shell"><button className="brand" onClick={() => goTo("home")} aria-label="Dojo Deckbuilder home"><BrandMark /><span><b>DOJO</b><em>DECKBUILDER</em></span></button><nav id="primary-navigation" aria-label="Primary navigation">{DESKTOP_NAVIGATION.map((item) => <button aria-current={navigationItemIsActive(item, route) ? "page" : undefined} className={navigationItemIsActive(item, route) ? "active" : ""} onClick={() => goTo(item.page)} key={item.page}>{item.label}</button>)}</nav><div className="header-search-wrap"><label className="header-search"><span>⌕</span><input ref={searchInputRef} value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} onKeyDown={handleGlobalSearchKeyDown} placeholder="Search the dojo" aria-label="Search cards, rules, rulings, variants, and glossary" role="combobox" aria-autocomplete="list" aria-controls="dojo-global-results" aria-expanded={globalResults.length > 0} aria-activedescendant={globalActiveDescendant} /><kbd>Ctrl K</kbd></label>{globalResults.length > 0 && renderGlobalResults("global-results", "dojo-global-results")}</div><div className="user-menu-wrap" data-user-menu><button ref={userMenuButtonRef} type="button" className={`profile-menu-button${userMenuOpen ? " is-open" : ""}`} onClick={() => setUserMenuOpen((current) => !current)} aria-haspopup="dialog" aria-expanded={userMenuOpen} aria-label={`Open personal menu for ${displayName || "Dojo Agent"}`}><img src={AVATAR_IMAGES[avatar]} alt="" /><span><b>{displayName || "Dojo Agent"}</b><small>FIELD AGENT</small></span><strong aria-hidden="true">⌄</strong></button>{userMenuOpen && <aside className="user-menu-panel" role="dialog" aria-label="Personal dojo menu"><header><img src={AVATAR_IMAGES[avatar]} alt="" /><div><span>Current filing</span><strong>{displayName || "Dojo Agent"}</strong><small>{AVATAR_OPTIONS.find((option) => option.id === avatar)?.quip}</small></div></header><button type="button" className="user-menu-settings" onClick={() => goTo("settings")}>Personal settings <span>→</span></button><div className="user-menu-lighting"><span>Lighting</span><ThemeToggle theme={theme} onToggle={toggleTheme} full /></div><div className="user-menu-accent"><span>Accent</span><b>{accent.toLocaleUpperCase()}</b></div></aside>}</div><button className="menu-button" onClick={toggleMenu} aria-controls="mobile-menu" aria-expanded={menuOpen} aria-label={menuOpen ? "Close site menu" : "Open site menu"}><span /><span /><span /></button></div><div className="reading-progress" role="progressbar" aria-label={`${VIEW_LABELS[view]} reading progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(scrollProgress * 100)}><span style={{ width: `${scrollProgress * 100}%` }} /><b>{VIEW_LABELS[view]}</b></div></header>
    {menuOpen && <><button className="menu-scrim" onClick={() => closeMenu()} aria-label="Close site menu" /><aside className="mobile-menu-panel" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Site menu"><div className="mobile-menu-heading"><div><span className="eyebrow">Department directory</span><h2>Find your fight.</h2></div><button className="mobile-menu-close" onClick={() => closeMenu()} aria-label="Close site menu">×</button></div><label className="mobile-global-search"><span aria-hidden="true">⌕</span><input autoFocus role="combobox" aria-autocomplete="list" aria-controls="dojo-mobile-search-results" aria-expanded={globalResults.length > 0} aria-activedescendant={mobileGlobalActiveDescendant} value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} onKeyDown={handleGlobalSearchKeyDown} placeholder="Search the dojo" aria-label="Search cards, rules, rulings, variants, and glossary" /></label>{globalSearch.trim().length >= 2 && (globalResults.length ? renderGlobalResults("mobile-search-results", "dojo-mobile-search-results") : <div className="mobile-search-results"><p>No matching filing number. Try a shorter search.</p></div>)}<nav className="mobile-menu-links" aria-label="All site pages">{MOBILE_MENU_NAVIGATION.map((item) => <button aria-current={navigationItemIsActive(item, route) ? "page" : undefined} className={navigationItemIsActive(item, route) ? "active" : ""} onClick={() => goTo(item.page)} key={item.page}><span>{item.label}</span><small>{item.description}</small></button>)}</nav></aside></>}
    <div key={routeKey} className="view-stage">{route.page === "home" && <HomeView goTo={goTo} displayName={displayName} avatar={avatar} />}{route.page === "playtest" && <PlaytestView goTo={goTo} />}{route.page === "quickstart" && <QuickStartView goTo={goTo} />}{route.page === "story" && <StoryView goTo={goTo} />}{route.page === "rules" && <RulesView initialChapterId={route.chapterId ?? ""} initialSectionId={route.sectionId ?? ""} />}{route.page === "cards" && <CardsView cardId={route.cardId} />}{route.page === "rulings" && <RulingsView initialTab={route.tab ?? "official"} initialQuery={route.query ?? ""} />}{route.page === "glossary" && <GlossaryView initialQuery={route.term ?? ""} />}{route.page === "lab" && internalLabAvailable && <DesignLab theme={theme} onToggleTheme={toggleTheme} onToast={pushToast} />}{route.page === "lab" && !internalLabAvailable && <HomeView goTo={goTo} displayName={displayName} avatar={avatar} />}{route.page === "settings" && <SettingsPage theme={theme} accent={accent} displayName={displayName} avatar={avatar} presentationPreferences={presentationPreferences} onPresentationPreferencesChange={changePresentationPreferences} onToggleTheme={toggleTheme} onAccentChange={(next) => { setAccent(next); pushToast({ kind: "stamp", eyebrow: "Personal settings", title: `${next.toLocaleUpperCase()} accent filed`, message: "The whole website has received the memo.", duration: 2800 }); }} onNameChange={(next) => setDisplayName(next)} onAvatarChange={(next) => { setAvatar(next); pushToast({ kind: "stamp", eyebrow: "Personal settings", title: "Avatar filed", message: "The new field agent has been cleared for the dojo.", duration: 2800 }); }} onToast={pushToast} />}{route.page === "search" && <SearchPage query={route.query ?? ""} />}</div>
    <footer className="site-footer"><div className="shell footer-inner"><div className="brand footer-brand"><BrandMark /><span><b>DOJO</b><em>PAPER-FU // DECKBUILDER</em></span></div><p>Build your deck. Earn your belt. File the incident.</p><span>Filed with the Department. Probably correctly.</span></div></footer>
    {scrollProgress > .2 && <button className="back-to-top" onClick={() => window.scrollTo({ top: 0, behavior: paperScrollBehavior() })} aria-label="Back to top"><span aria-hidden="true">↑</span><b>Top</b></button>}
    <PaperToastStack toasts={toasts} onDismiss={dismissToast} />
  </div></ToastContext.Provider>;
}
