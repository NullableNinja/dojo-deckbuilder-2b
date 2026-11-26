"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ToastInput } from "./paper-toast-context";
import { readUserPreferences, replaceUserLab, updateUserPreferences, type EffectIntensity, type PreferenceDensity, type ToastDuration } from "./user-preferences";

type Theme = "light" | "dark";
type LabDensity = PreferenceDensity;
type LabSelections = Record<string, number>;
type LabShortlists = Record<string, number[]>;
type LabNotes = Record<string, string>;
type LabSettings = {
  density: LabDensity;
  reducedMotion: boolean;
  toastDuration: ToastDuration;
  effectIntensity: EffectIntensity;
};
type ImpactKind = "hit" | "block" | "combo" | "boss";
type MatchMode = "duel" | "boss" | "team" | "full";
type ConfettiEffect = "cannon" | "rain" | "bottom" | "snowglobe" | "burst" | "ribbons";
type ShakeKind = "hit" | "block" | "combo" | "boss" | "celebrate" | "confirm" | "warning" | "error" | "tap" | "quake" | "hit-snap" | "hit-recoil" | "hit-cross" | "block-catch" | "block-brace" | "block-parry" | "combo-roll" | "combo-stutter" | "combo-launch" | "boss-drop" | "boss-pulse" | "boss-rumble";
type RefereeEvent = { id: number; label: string; title: string; detail: string; tone: "action" | "guard" | "brass" | "blue" };

type DesignLabProps = {
  theme: Theme;
  onToggleTheme: () => void;
  onToast: (toast: ToastInput) => void;
};

const DEFAULT_SELECTIONS: LabSelections = {
  toast: 4,
  modal: 2,
  buttons: 2,
  fields: 2,
  menus: 1,
  states: 1,
  effects: 1,
  match: 1,
  referee: 1,
  cards: 1,
  recap: 2,
};
const DEFAULT_SHORTLISTS: LabShortlists = {
  toast: [],
  modal: [],
  buttons: [2, 5],
  fields: [],
  menus: [],
  states: [],
  effects: [1],
  match: [],
  referee: [],
  cards: [],
  recap: [],
};
const DEFAULT_SETTINGS: LabSettings = {
  density: "roomy",
  reducedMotion: false,
  toastDuration: "4200",
  effectIntensity: "standard",
};

const VARIANT_LABELS: Record<string, string[]> = {
  toast: ["Filed", "Pinned", "Stacked", "Stamped", "Urgent"],
  modal: ["Docket", "Briefing", "Split", "Alert", "Command"],
  buttons: ["Punch", "Paper", "Ink", "Brass", "Quiet"],
  fields: ["Slip", "Ledger", "Tab", "Stamp", "Carbon"],
  menus: ["Tabs", "Rail", "Index", "Drawer", "Clipboard"],
  states: ["Notice", "Progress", "Clear", "Blocked", "Filed"],
  effects: ["Burst", "Scatter", "Stamp", "Impact", "Quiet"],
  match: ["Board", "Arena", "Docket", "Boss", "Table"],
  referee: ["Rail", "Stamp", "Log", "Judge", "Margin"],
  cards: ["Fan", "Stack", "Slip", "Deck", "Cutout"],
  recap: ["Receipt", "Casefile", "Belt", "Report", "Poster"],
};
const THEATER_CARDS = [
  { name: "Pocket Sand", type: "Attack", cost: 1, copy: "A little grit. A lot of confidence." },
  { name: "Parry", type: "Defense", cost: 0, copy: "The paperwork says no." },
  { name: "Three Breaths", type: "Kata", cost: 1, copy: "Center the chaos. Then point it." },
  { name: "Return Receipt", type: "Combo", cost: 2, copy: "Damage delivered with documentation." },
  { name: "Emergency Burrito", type: "Consumable", cost: 1, copy: "Nutrition is a combat stance." },
];
const IMPACT_WORDS: Record<ImpactKind, string> = { hit: "POW!", block: "THWACK!", combo: "KRAKOW!", boss: "BOOM!" };
const CONFETTI_EFFECTS: Array<{ id: ConfettiEffect; label: string; detail: string }> = [
  { id: "cannon", label: "Corner cannon", detail: "One explosive filing" },
  { id: "rain", label: "Victory rain", detail: "Confetti from the ceiling" },
  { id: "bottom", label: "Floor launch", detail: "The mat fires upward" },
  { id: "snowglobe", label: "Snowglobe", detail: "Holiday drift, no season required" },
  { id: "burst", label: "Table burst", detail: "Everything leaves the center" },
  { id: "ribbons", label: "Ribbon sweep", detail: "A paper streamer crossfire" },
];
const SHAKE_LABELS: Array<{ id: ShakeKind; label: string; detail: string }> = [
  { id: "hit", label: "Hit", detail: "Sharp lateral snap" },
  { id: "block", label: "Block", detail: "Firm upward catch" },
  { id: "combo", label: "Combo", detail: "Rolling double beat" },
  { id: "boss", label: "Boss", detail: "Heavy floor drop" },
  { id: "celebrate", label: "Celebrate", detail: "Buoyant paper bounce" },
  { id: "confirm", label: "Confirm", detail: "Tiny approval nod" },
  { id: "warning", label: "Warning", detail: "Uneasy side wobble" },
  { id: "error", label: "Error", detail: "Hard refusal" },
  { id: "tap", label: "Tap", detail: "Micro interaction tick" },
  { id: "quake", label: "Quake", detail: "Maximum table drama" },
];
const IMPACT_SHAKE_VARIANTS: Record<ImpactKind, Array<{ id: ShakeKind; label: string; detail: string }>> = {
  hit: [
    { id: "hit-snap", label: "Snap", detail: "Short lateral crack" },
    { id: "hit-recoil", label: "Recoil", detail: "Back-and-forward jolt" },
    { id: "hit-cross", label: "Cross", detail: "Diagonal impact whip" },
  ],
  block: [
    { id: "block-catch", label: "Catch", detail: "Firm upward stop" },
    { id: "block-brace", label: "Brace", detail: "Low defensive brace" },
    { id: "block-parry", label: "Parry", detail: "Clean redirect flick" },
  ],
  combo: [
    { id: "combo-roll", label: "Roll", detail: "Two-beat lateral run" },
    { id: "combo-stutter", label: "Stutter", detail: "Three-hit paper rattle" },
    { id: "combo-launch", label: "Launch", detail: "Upward finishing pop" },
  ],
  boss: [
    { id: "boss-drop", label: "Drop", detail: "Heavy floor arrival" },
    { id: "boss-pulse", label: "Pulse", detail: "Slow threat wave" },
    { id: "boss-rumble", label: "Rumble", detail: "Long table warning" },
  ],
};

const readLabState = () => {
  const saved = readUserPreferences();
  return {
    selections: { ...DEFAULT_SELECTIONS, ...saved.lab.selections } as LabSelections,
    shortlists: { ...DEFAULT_SHORTLISTS, ...saved.lab.shortlists } as LabShortlists,
    notes: saved.lab.notes as LabNotes,
    settings: { density: saved.density, reducedMotion: saved.reducedMotion, toastDuration: saved.toastDuration, effectIntensity: saved.effectIntensity } as LabSettings,
  };
};

function LabVariantPicker({ id, value, onChange, shortlisted, onToggleShortlist }: { id: string; value: number; onChange: (value: number) => void; shortlisted: number[]; onToggleShortlist: (value: number) => void }) {
  return <div className="lab-variant-picker" role="radiogroup" aria-label={`${id} variant preference`}>
    {VARIANT_LABELS[id].map((label, index) => {
      const variant = index + 1;
      const isShortlisted = shortlisted.includes(variant);
      return <div key={label} className={`lab-variant-option${value === variant ? " is-picked" : ""}`}><button type="button" role="radio" className="lab-variant-pick" aria-checked={value === variant} onClick={() => onChange(variant)}><strong>{variant}</strong><span>{label}</span></button><button type="button" className={`lab-variant-star${isShortlisted ? " is-shortlisted" : ""}`} aria-pressed={isShortlisted} aria-label={`${isShortlisted ? "Remove" : "Add"} ${label} from shortlist`} title={`${isShortlisted ? "Remove" : "Add"} ${label} ${isShortlisted ? "from" : "to"} shortlist`} onClick={() => onToggleShortlist(variant)}>★</button></div>;
    })}
    <div className="lab-shortlist-summary"><span>Shortlist</span><strong>{shortlisted.length ? shortlisted.map((variant) => `0${variant}`).join(" / ") : "None yet"}</strong></div>
  </div>;
}

function LabSection({ id, eyebrow, title, description, selections, setSelection, shortlists, toggleShortlist, notes, setNote, children }: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  selections: LabSelections;
  setSelection: (id: string, value: number) => void;
  shortlists: LabShortlists;
  toggleShortlist: (id: string, value: number) => void;
  notes: LabNotes;
  setNote: (id: string, value: string) => void;
  children: ReactNode;
}) {
  return <section className="lab-section paper-stack" id={`lab-${id}`}>
    <header className="lab-section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><div className="lab-picked-mark"><small>Preferred</small><strong>0{selections[id]}</strong><em>{shortlists[id]?.length ?? 0} kept</em></div></header>
    <div className="lab-section-body">{children}</div>
    <footer className="lab-section-footer"><div><span className="lab-control-label">Pick a primary direction · star the useful alternates</span><LabVariantPicker id={id} value={selections[id]} onChange={(value) => setSelection(id, value)} shortlisted={shortlists[id] ?? []} onToggleShortlist={(value) => toggleShortlist(id, value)} /></div><label className="lab-note"><span className="lab-control-label">Your note</span><textarea value={notes[id] ?? ""} onChange={(event) => setNote(id, event.target.value)} placeholder="What should this feel like on the mat?" rows={2} /></label></footer>
  </section>;
}

function DesignLab({ theme, onToggleTheme, onToast }: DesignLabProps) {
  const initial = readLabState();
  const [selections, setSelections] = useState<LabSelections>(initial.selections);
  const [shortlists, setShortlists] = useState<LabShortlists>(initial.shortlists);
  const [notes, setNotes] = useState<LabNotes>(initial.notes);
  const [density, setDensity] = useState<LabDensity>(initial.settings.density);
  const [reducedMotion, setReducedMotion] = useState(initial.settings.reducedMotion);
  const [toastDuration, setToastDuration] = useState<string>(initial.settings.toastDuration);
  const [activeModal, setActiveModal] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("Current filing");
  const [fieldValue, setFieldValue] = useState("DDB-FIELD-07");
  const [toggleValue, setToggleValue] = useState(true);
  const [lastAction, setLastAction] = useState("No test action filed yet.");
  const [effectIntensity, setEffectIntensity] = useState<string>(initial.settings.effectIntensity);
  const [confettiVisible, setConfettiVisible] = useState(false);
  const [confettiMode, setConfettiMode] = useState<"round" | "win">("round");
  const [confettiEffect, setConfettiEffect] = useState<ConfettiEffect>("cannon");
  const [confettiPattern, setConfettiPattern] = useState(1);
  const [screenShake, setScreenShake] = useState(false);
  const [shakeKind, setShakeKind] = useState<ShakeKind>("hit");
  const [impact, setImpact] = useState<{ kind: ImpactKind; id: number } | null>(null);
  const [matchMode, setMatchMode] = useState<MatchMode>("duel");
  const [activeZone, setActiveZone] = useState("Center");
  const [playerHp, setPlayerHp] = useState(8);
  const [opponentHp, setOpponentHp] = useState(8);
  const [focus, setFocus] = useState(2);
  const [selectedCard, setSelectedCard] = useState(0);
  const [caseClosed, setCaseClosed] = useState(false);
  const [refereeEvents, setRefereeEvents] = useState<RefereeEvent[]>([
    { id: 1, label: "R01", title: "Match opened", detail: "The table has been cleared for legally questionable technique.", tone: "blue" },
    { id: 2, label: "R00", title: "Deck certified", detail: "Fifteen cards accepted. One sleeve remains suspicious.", tone: "brass" },
  ]);
  const confettiTimer = useRef<number | undefined>(undefined);
  const confettiInterval = useRef<number | undefined>(undefined);
  const confettiEffectRef = useRef<ConfettiEffect>("cannon");
  const shakeTimer = useRef<number | undefined>(undefined);
  const impactTimer = useRef<number | undefined>(undefined);
  const impactShakeIndex = useRef<Record<ImpactKind, number>>({ hit: 0, block: 0, combo: 0, boss: 0 });
  const eventSequence = useRef(3);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    updateUserPreferences({ density, reducedMotion, toastDuration: toastDuration as ToastDuration, effectIntensity: effectIntensity as EffectIntensity, lab: { selections, shortlists, notes } });
  }, [density, effectIntensity, notes, reducedMotion, selections, shortlists, toastDuration]);

  useEffect(() => () => {
    window.clearTimeout(confettiTimer.current);
    window.clearInterval(confettiInterval.current);
    window.clearTimeout(shakeTimer.current);
    window.clearTimeout(impactTimer.current);
  }, []);

  useEffect(() => {
    if (!activeModal && !drawerOpen && !popoverOpen) return;
    const dialogSelector = activeModal ? "[data-lab-modal]" : drawerOpen ? "[data-lab-drawer]" : "[data-lab-popover]";
    const focusables = () => Array.from(document.querySelectorAll<HTMLElement>(`${dialogSelector} button, ${dialogSelector} input, ${dialogSelector} select, ${dialogSelector} textarea, ${dialogSelector} [tabindex]:not([tabindex=\"-1\"])`)).filter((element) => !element.hasAttribute("disabled"));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeModal) setActiveModal(false);
        else if (drawerOpen) setDrawerOpen(false);
        else setPopoverOpen(false);
        return;
      }
      if (event.key !== "Tab" || !activeModal && !drawerOpen) return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = activeModal || drawerOpen ? "hidden" : "";
    if (activeModal) modalCloseRef.current?.focus();
    if (drawerOpen) drawerCloseRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeModal, drawerOpen, popoverOpen]);

  const setSelection = (id: string, value: number) => setSelections((current) => ({ ...current, [id]: value }));
  const toggleShortlist = (id: string, value: number) => setShortlists((current) => ({ ...current, [id]: (current[id] ?? []).includes(value) ? (current[id] ?? []).filter((item) => item !== value) : [...(current[id] ?? []), value].sort((a, b) => a - b) }));
  const setNote = (id: string, value: string) => setNotes((current) => ({ ...current, [id]: value }));
  const testToast = (kind: ToastInput["kind"], title: string, message: string) => {
    setLastAction(`Toast fired: ${title}`);
    onToast({ kind, title, message, eyebrow: "Design Lab", duration: Number(toastDuration), variant: selections.toast });
  };
  const resetLab = () => {
    setSelections(DEFAULT_SELECTIONS);
    setShortlists(DEFAULT_SHORTLISTS);
    setNotes({});
    setDensity(DEFAULT_SETTINGS.density);
    setReducedMotion(DEFAULT_SETTINGS.reducedMotion);
    setToastDuration(DEFAULT_SETTINGS.toastDuration);
    setEffectIntensity(DEFAULT_SETTINGS.effectIntensity);
    setLastAction("Preferences reset. The clipboard is blank again.");
    window.localStorage.removeItem("paper-fu-design-lab-v2");
    replaceUserLab({ selections: { ...DEFAULT_SELECTIONS }, shortlists: { ...DEFAULT_SHORTLISTS }, notes: {} });
    updateUserPreferences({ density: DEFAULT_SETTINGS.density, reducedMotion: DEFAULT_SETTINGS.reducedMotion, toastDuration: DEFAULT_SETTINGS.toastDuration, effectIntensity: DEFAULT_SETTINGS.effectIntensity });
  };
  const clearConfetti = () => {
    setConfettiVisible(false);
    window.clearTimeout(confettiTimer.current);
    window.clearInterval(confettiInterval.current);
  };
  const nextConfettiEffect = (current: ConfettiEffect) => {
    const index = CONFETTI_EFFECTS.findIndex((effect) => effect.id === current);
    return CONFETTI_EFFECTS[(index + 1 + CONFETTI_EFFECTS.length) % CONFETTI_EFFECTS.length].id;
  };
  const triggerConfetti = (mode: "round" | "win" = "round", requestedEffect?: ConfettiEffect) => {
    const celebrationMode = mode === "win" ? "win" : "round";
    const nextEffect = requestedEffect ?? nextConfettiEffect(confettiEffectRef.current);
    confettiEffectRef.current = nextEffect;
    setConfettiVisible(false);
    setConfettiMode(celebrationMode);
    setConfettiEffect(nextEffect);
    setConfettiPattern((current) => current >= 4 ? 1 : current + 1);
    requestAnimationFrame(() => setConfettiVisible(true));
    if (!reducedMotion) triggerScreenShake("celebrate");
    setLastAction(reducedMotion ? "Celebration acknowledged without motion." : celebrationMode === "win" ? `${CONFETTI_EFFECTS.find((effect) => effect.id === nextEffect)?.label} authorized until the next filing.` : `${CONFETTI_EFFECTS.find((effect) => effect.id === nextEffect)?.label} deployed. The paperwork is festive.`);
    window.clearTimeout(confettiTimer.current);
    window.clearInterval(confettiInterval.current);
    if (celebrationMode === "win") {
      confettiInterval.current = window.setInterval(() => {
        const effect = nextConfettiEffect(confettiEffectRef.current);
        confettiEffectRef.current = effect;
        setConfettiEffect(effect);
        setConfettiPattern((current) => current >= 4 ? 1 : current + 1);
      }, 3000);
    } else {
      confettiTimer.current = window.setTimeout(() => setConfettiVisible(false), effectIntensity === "high" ? 6500 : 4500);
    }
  };
  const triggerScreenShake = (kind: ShakeKind = "hit") => {
    if (reducedMotion) {
      setLastAction(`${kind} motion suppressed by reduced-motion settings.`);
      onToast({ kind: "note", eyebrow: "Motion safeguard", title: "Impact kept still", message: "The hit landed. The pixels stayed professional.", duration: 2400, variant: selections.toast });
      return;
    }
    setShakeKind(kind);
    setScreenShake(false);
    requestAnimationFrame(() => setScreenShake(true));
    window.clearTimeout(shakeTimer.current);
    const duration = kind.startsWith("block") ? 240 : kind.startsWith("boss") || kind === "quake" ? 620 : kind.startsWith("combo") ? 460 : kind.startsWith("hit") ? (effectIntensity === "high" ? 520 : 360) : kind === "tap" ? 180 : effectIntensity === "high" ? 520 : 360;
    shakeTimer.current = window.setTimeout(() => setScreenShake(false), duration);
    setLastAction(`${kind.toLocaleUpperCase()} shake fired with its own rhythm.`);
  };
  const nextImpactShake = (kind: ImpactKind) => {
    const variants = IMPACT_SHAKE_VARIANTS[kind];
    const index = impactShakeIndex.current[kind] % variants.length;
    impactShakeIndex.current[kind] = (index + 1) % variants.length;
    return variants[index];
  };
  const triggerImpactShake = (kind: ImpactKind) => {
    const variant = nextImpactShake(kind);
    triggerScreenShake(variant.id);
    setLastAction(`${kind.toLocaleUpperCase()} / ${variant.label}: ${variant.detail}.`);
  };
  const triggerHaptic = () => {
    const vibrate = typeof navigator !== "undefined" ? navigator.vibrate : undefined;
    if (vibrate) {
      vibrate.call(navigator, effectIntensity === "high" ? [18, 28, 18] : [10, 20, 10]);
      setLastAction("Guarded haptic pulse requested.");
      onToast({ kind: "success", eyebrow: "Haptic check", title: "Pulse requested", message: "The device may have acknowledged the paperwork.", duration: 2400, variant: selections.toast });
    } else {
      setLastAction("This device does not expose haptic feedback.");
      onToast({ kind: "warning", eyebrow: "Haptic check", title: "No pulse available", message: "The interface still provides a visible and audible-safe fallback.", duration: 3000, variant: selections.toast });
    }
  };
  const recordEvent = (title: string, detail: string, tone: RefereeEvent["tone"] = "blue") => {
    const id = eventSequence.current++;
    setRefereeEvents((current) => [{ id, label: `R${String(id).padStart(2, "0")}`, title, detail, tone }, ...current].slice(0, 8));
  };
  const triggerImpact = (kind: ImpactKind) => {
    const copy: Record<ImpactKind, { word: string; title: string; detail: string; toast: ToastInput["kind"]; tone: RefereeEvent["tone"] }> = {
      hit: { word: "POW!", title: "Direct hit recorded", detail: `A hit landed in the ${activeZone.toLowerCase()} zone. The mat has concerns.`, toast: "critical", tone: "action" },
      block: { word: "THWACK!", title: "Block confirmed", detail: "The defense caught the hit and returned the paperwork unopened.", toast: "success", tone: "guard" },
      combo: { word: "KRAKOW!", title: "Combo witnessed", detail: "Two cards became one problem for the opposing side.", toast: "stamp", tone: "brass" },
      boss: { word: "BOOM!", title: "Boss phase changed", detail: "The boss has escalated the filing. Everyone look busy.", toast: "critical", tone: "action" },
    };
    const result = copy[kind];
    setImpact({ kind, id: Date.now() });
    window.clearTimeout(impactTimer.current);
    impactTimer.current = window.setTimeout(() => setImpact(null), reducedMotion ? 1600 : 1200);
    const shake = nextImpactShake(kind);
    triggerScreenShake(shake.id);
    if (kind === "hit") setOpponentHp((current) => Math.max(0, current - 1));
    if (kind === "block") setFocus((current) => Math.min(5, current + 1));
    if (kind === "combo") setOpponentHp((current) => Math.max(0, current - 2));
    if (kind === "boss") setPlayerHp((current) => Math.max(0, current - 1));
    setLastAction(`${result.word} ${result.title}. ${shake.label} rhythm.`);
    recordEvent(result.title, result.detail, result.tone);
    onToast({ kind: result.toast, eyebrow: "Match Theater", title: result.title, message: result.detail, duration: 3000, variant: selections.toast });
  };
  const finishMatch = () => {
    setCaseClosed(true);
    setLastAction("Case closed. The confetti cannon has been authorized.");
    recordEvent("Match closed", "The result was stamped before anyone could appeal.", "brass");
    triggerConfetti("win");
  };
  const resetMatch = () => {
    clearConfetti();
    setPlayerHp(8);
    setOpponentHp(8);
    setFocus(2);
    setCaseClosed(false);
    setSelectedCard(0);
    setActiveZone("Center");
    setRefereeEvents([]);
    eventSequence.current = 1;
    recordEvent("Match reopened", "The mat has been cleared. Please keep elbows inside the filing.", "blue");
  };
  const playTheaterCard = (index: number) => {
    setSelectedCard(index);
    const card = THEATER_CARDS[index];
    recordEvent(`${card.name} played`, `${card.type} card committed in the ${activeZone.toLowerCase()} zone.`, card.type === "Defense" ? "guard" : "action");
    if (card.type === "Defense") triggerImpact("block");
    else if (card.type === "Combo") triggerImpact("combo");
    else triggerImpact("hit");
  };
  const sectionContext = { selections, setSelection, shortlists, toggleShortlist, notes, setNote };
  const impactLayer = impact && typeof document !== "undefined" ? createPortal(<div className={`lab-impact-overlay lab-impact-overlay--${impact.kind}`} role="status" aria-live="polite" aria-label={`${IMPACT_WORDS[impact.kind]} impact preview`}><strong>{IMPACT_WORDS[impact.kind]}</strong><span>{impact.kind === "block" ? "BLOCK CONFIRMED" : impact.kind === "combo" ? "COMBO WITNESSED" : impact.kind === "boss" ? "PHASE CHANGE" : "DIRECT HIT"}</span></div>, document.body) : null;
  const confettiLayer = confettiVisible && typeof document !== "undefined" ? createPortal(<div className={`lab-confetti-layer lab-confetti-layer--${confettiEffect} lab-confetti-layer--${selections.effects} lab-confetti-layer--pattern-${confettiPattern}${confettiMode === "win" ? " lab-confetti-layer--win" : ""}${reducedMotion ? " lab-confetti-layer--reduced" : ""}`} role="status" aria-live="polite" aria-label={confettiMode === "win" ? "Victory confetti celebration" : `${CONFETTI_EFFECTS.find((effect) => effect.id === confettiEffect)?.label ?? "Confetti"} celebration preview`}>{confettiEffect === "cannon" && <div className="lab-confetti-cannon-mouth" aria-hidden="true" />}<strong>{confettiMode === "win" ? "VICTORY FILED" : "ROUND CLEARED"}</strong>{Array.from({ length: effectIntensity === "high" ? 42 : 28 }, (_, index) => <i key={`${confettiEffect}-${confettiPattern}-${index}`} style={{ "--left": `${(index * 37 + confettiPattern * 11) % 96}%`, "--x": `${-46 + ((index * (13 + confettiPattern * 4)) % 92)}vw`, "--y": `${12 + ((index * (19 + confettiPattern * 5)) % 78)}vh`, "--drift": `${-14 + ((index * (17 + confettiPattern * 3)) % 28)}vw`, "--r": `${(index * (47 + confettiPattern * 23)) % 240}deg`, "--delay": `${index * 18}ms`, "--duration": `${1.7 + ((index + confettiPattern) % 6) * .18}s` } as unknown as CSSProperties} />)}</div>, document.body) : null;

  return <main className={`page-shell shell lab-page${reducedMotion ? " lab-motion-reduced" : ""}${screenShake ? ` lab-screen-shake lab-screen-shake--${shakeKind}` : ""}`} data-density={density}>
    <header className="lab-hero paper-stack">
      <div><span className="eyebrow">Paper-Fu / Interface Department</span><h1>Design Lab</h1><p>Try the paper primitives before they get bolted onto the full game mat. Every choice is local to this browser, because the Department is not ready for a committee yet.</p></div>
      <div className="lab-hero-controls"><div className="lab-status-slip"><span>Current filing</span><strong>{lastAction}</strong></div><button className="button ghost" type="button" onClick={onToggleTheme}>{theme === "dark" ? "Test light mode" : "Test dark mode"}</button><button className="button ghost" type="button" onClick={resetLab}>Reset picks</button></div>
    </header>

    <section className="lab-settings paper-stack" aria-labelledby="lab-settings-title"><div><span className="eyebrow">Controls for the controls</span><h2 id="lab-settings-title">Settings</h2><p>Change the conditions around the components, then test them again. Preferences and notes persist locally.</p></div><div className="lab-settings-grid"><label className="lab-setting"><span>Density</span><select value={density} onChange={(event) => setDensity(event.target.value as LabDensity)}><option value="roomy">Roomy paper</option><option value="tight">Tight filing</option></select></label><label className="lab-setting"><span>Toast duration</span><select value={toastDuration} onChange={(event) => setToastDuration(event.target.value)}><option value="1800">Quick 1.8s</option><option value="4200">Standard 4.2s</option><option value="9000">Long 9s</option></select></label><label className="lab-setting"><span>Impact intensity</span><select value={effectIntensity} onChange={(event) => setEffectIntensity(event.target.value)}><option value="quiet">Quiet tap</option><option value="standard">Standard hit</option><option value="high">HIYAH! maximum</option></select></label><label className="lab-setting lab-check"><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /><span>Use reduced motion in this lab</span></label><div className="lab-setting-summary"><strong>{Object.values(selections).filter(Boolean).length}/{Object.keys(DEFAULT_SELECTIONS).length}</strong><span>component picks filed</span></div></div></section>

    <LabSection {...sectionContext} id="toast" eyebrow="01 / Notifications" title="Toast stack" description="Warnings, messages, informational slips, success receipts, and critical incidents. Fire the real global toast primitive with the currently selected variant."><div className="lab-toast-grid"><button className="lab-action-button lab-action-note" type="button" onClick={() => testToast("note", "A note from the desk", "The Department has acknowledged your excellent paperwork.")}>Informational</button><button className="lab-action-button lab-action-success" type="button" onClick={() => testToast("success", "Filed successfully", "The card entered the binder without further incident.")}>Success</button><button className="lab-action-button lab-action-warning" type="button" onClick={() => testToast("warning", "Warning: loose card", "A reaction window is open and someone is pretending not to notice.")}>Warning</button><button className="lab-action-button lab-action-critical" type="button" onClick={() => testToast("critical", "Critical: mat breach", "The current interface has exceeded its approved amount of chaos.")}>Critical</button><button className="lab-action-button lab-action-stamp" type="button" onClick={() => testToast("stamp", "Stamped for review", "This one is official enough to survive a meeting.")}>Stamped</button></div><div className={`lab-toast-preview lab-toast-preview--${selections.toast}`}><span>Selected treatment 0{selections.toast}</span><strong>{VARIANT_LABELS.toast[selections.toast - 1]} notification</strong><p>Hover or focus a live toast to pause its timer. Press Escape or use the close control to dismiss it.</p></div></LabSection>

    <LabSection {...sectionContext} id="modal" eyebrow="02 / Interactive messages" title="Pop-up messages" description="These are the kinds of interactive notices the future full game will need: confirmations, interruptions, rule calls, and moments where the player must make a choice."><div className={`lab-modal-preview lab-modal-preview--${selections.modal}`}><div><span>Preview 0{selections.modal}</span><strong>{VARIANT_LABELS.modal[selections.modal]} message</strong><p>Open the live modal to test focus, Escape, action hierarchy, and the amount of paper a decision deserves.</p></div><button className="button primary" type="button" onClick={() => { setActiveModal(true); setLastAction("Interactive message opened."); }}>Open interactive message</button></div></LabSection>

    <LabSection {...sectionContext} id="buttons" eyebrow="03 / Actions" title="Buttons" description="Compare the physical language of primary actions, quiet actions, destructive actions, and small utility controls before the game mat gets every possible button at once."><div className="lab-button-grid">{[1, 2, 3, 4, 5].map((variant) => <button key={variant} type="button" className={`lab-button-sample lab-button-sample--${variant}${selections.buttons === variant ? " is-picked" : ""}`} onClick={() => { setLastAction(`Button variant ${variant} pressed.`); onToast({ kind: "note", eyebrow: "Button test", title: `Variant ${variant} pressed`, message: VARIANT_LABELS.buttons[variant - 1], duration: 2200, variant: selections.toast }); }}><span>0{variant}</span><strong>{VARIANT_LABELS.buttons[variant - 1]}</strong><small>Press to test</small></button>)}</div></LabSection>

    <LabSection {...sectionContext} id="fields" eyebrow="04 / Inputs" title="Fields & toggles" description="Type into the live controls. The five variants change the material treatment, not the underlying behavior, so we can decide what belongs in setup, search, and combat."><div className="lab-field-grid">{[1, 2, 3, 4, 5].map((variant) => <article key={variant} className={`lab-field-sample lab-field-sample--${variant}${selections.fields === variant ? " is-picked" : ""}`}><span>0{variant} / {VARIANT_LABELS.fields[variant - 1]}</span><label>Filing number<input value={variant === 1 ? fieldValue : undefined} defaultValue={variant === 1 ? undefined : `MAT-${String(variant).padStart(2, "0")}`} onChange={(event) => variant === 1 && setFieldValue(event.target.value)} placeholder="DDB-FIELD-07" /></label><label>Mode<select defaultValue={variant === 3 ? "boss" : "duel"}><option value="duel">Quick Duel</option><option value="team">Tag Team</option><option value="boss">Boss Blitz</option></select></label><label className="lab-toggle"><input type="checkbox" checked={variant === 1 ? toggleValue : variant % 2 === 0} onChange={(event) => variant === 1 && setToggleValue(event.target.checked)} /><span>Keep this filing visible</span></label></article>)}</div></LabSection>

    <LabSection {...sectionContext} id="menus" eyebrow="05 / Wayfinding" title="Menus, tabs & drawers" description="A future full-game interface will need dense navigation without becoming a cockpit. Try the tabs, popover, and drawer together, then tell me which rhythm survives contact with the mat."><div className="lab-menu-stage"><div className="lab-tabs" role="tablist" aria-label="Design lab tab preview">{["Current filing", "Open issues", "Archive"].map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => { setActiveTab(tab); setLastAction(`Tab selected: ${tab}.`); }}>{tab}</button>)}</div><div className="lab-menu-actions"><button className="button ghost" type="button" onClick={() => setPopoverOpen((current) => !current)} aria-expanded={popoverOpen}>Open popover ▾</button><button className="button ghost" type="button" onClick={() => setDrawerOpen(true)}>Open drawer →</button>{popoverOpen && <div className="lab-popover" data-lab-popover role="dialog" aria-label="Lab popover"><strong>Contextual help</strong><p>Use this for a short rule explanation, not a second rulebook.</p><button type="button" onClick={() => setPopoverOpen(false)}>Dismiss</button></div>}</div><div className={`lab-menu-preview lab-menu-preview--${selections.menus}`}><span>Selected tab</span><strong>{activeTab}</strong><p>Variant 0{selections.menus} is currently preferred for this family.</p></div></div></LabSection>

    <LabSection {...sectionContext} id="states" eyebrow="06 / System feedback" title="Loading, empty, success & error" description="The game mat will have pauses, missing data, failed actions, and celebratory moments. This is the place to make those states feel intentional instead of apologetic."><div className="lab-state-grid"><article className="lab-state-card lab-state-loading"><span>Loading</span><strong>Shuffling the paperwork…</strong><i /><i /><i /></article><article className="lab-state-card lab-state-empty"><span>Empty</span><strong>No cards filed.</strong><p>The binder is innocent for now.</p><button type="button" onClick={() => testToast("note", "Nothing filed yet", "A blank binder is still a kind of potential.")}>Test empty action</button></article><article className="lab-state-card lab-state-success"><span>Success</span><strong>Round cleared.</strong><p>The receipt has been stapled to the victory.</p><button type="button" onClick={() => testToast("success", "Round cleared", "The Department reluctantly approves.")}>Test success action</button></article><article className="lab-state-card lab-state-error"><span>Error</span><strong>Choice required.</strong><p>The mat cannot continue until someone picks a zone.</p><button type="button" onClick={() => testToast("critical", "Choice required", "Select a zone before the next HIYAH!.")}>Test error action</button></article></div></LabSection>
    <LabSection {...sectionContext} id="effects" eyebrow="07 / Impact layer" title="Confetti, shake & feedback" description="Test the effects that make a real moment feel real: celebration, impact, and guarded device feedback. Reduced motion keeps the meaning and removes the theatrics."><div className="lab-effect-grid"><article className={`lab-effect-card lab-effect-card--celebrate lab-effect-preview--${selections.effects}`}><span>Celebration</span><strong>Confetti test</strong><p>Use for a cleared round, promotion, or an especially irresponsible Combo.</p><button className="button primary" type="button" onClick={() => triggerConfetti()}>Cycle celebration</button></article><article className={`lab-effect-card lab-effect-card--impact lab-effect-preview--${selections.effects}`}><span>Impact</span><strong>Screen shake</strong><p>Reserve this for a meaningful hit. Each action cycles through its own physical signatures.</p><button className="button ghost" type="button" onClick={() => triggerImpactShake("hit")}>Test hit rhythm</button></article><article className="lab-effect-card lab-effect-card--haptic"><span>Device enhancement</span><strong>Guarded haptics</strong><p>Requests a short pulse where supported, then reports a visible fallback when it is not.</p><button className="button ghost" type="button" onClick={triggerHaptic}>Test haptic pulse</button></article></div><div className="lab-confetti-roster"><div><span className="lab-control-label">Six celebration treatments</span><strong>The cannon is only one filing in the confetti department.</strong></div><div className="lab-confetti-grid" role="group" aria-label="Confetti effect tests">{CONFETTI_EFFECTS.map((effect) => <button key={effect.id} type="button" onClick={() => triggerConfetti("round", effect.id)} className={confettiEffect === effect.id ? "is-active" : ""}><b>{effect.label}</b><small>{effect.detail}</small></button>)}</div></div><div className="lab-shake-roster"><div><span className="lab-control-label">Ten motion signatures</span><strong>A block should catch. A hit should crack. A victory should bounce.</strong></div><div className="lab-shake-grid" role="group" aria-label="Screen shake signature tests">{SHAKE_LABELS.map((shake) => <button key={shake.id} type="button" onClick={() => triggerScreenShake(shake.id)}><b>{shake.label}</b><small>{shake.detail}</small></button>)}</div><div className="lab-impact-variant-grid" role="group" aria-label="Impact action shake variants">{(Object.keys(IMPACT_SHAKE_VARIANTS) as ImpactKind[]).map((kind) => <div key={kind}><span>{kind}</span>{IMPACT_SHAKE_VARIANTS[kind].map((variant) => <button key={variant.id} type="button" onClick={() => triggerScreenShake(variant.id)}><b>{variant.label}</b><small>{variant.detail}</small></button>)}</div>)}</div></div><div className="lab-effect-rules"><span className="lab-control-label">Effect rule</span><strong>Meaning first. HIYAH! second.</strong><p>Confetti celebrates. Shake punctuates. Haptics whisper. Reduced motion gets the same information without movement.</p></div></LabSection>

    <LabSection {...sectionContext} id="match" eyebrow="08 / Match theater" title="The mat comes alive" description="A miniature, presentation-only round for testing how the future Quick Duel, solo boss, tag team, and full table modes should feel. The mechanics are a rehearsal; the drama is real."><div className={`lab-match-theater lab-match-theater--${selections.match}`}><div className="lab-match-toolbar"><div><span className="lab-control-label">Mode filing</span><strong>{matchMode === "duel" ? "Quick Duel" : matchMode === "boss" ? "Solo Boss" : matchMode === "team" ? "Tag Team" : "Full Table"}</strong></div><div className="lab-mode-switcher" role="tablist" aria-label="Match mode preview">{([{ id: "duel", label: "Quick Duel" }, { id: "boss", label: "Solo Boss" }, { id: "team", label: "Tag Team" }, { id: "full", label: "Full Table" }] as { id: MatchMode; label: string }[]).map((mode) => <button key={mode.id} type="button" role="tab" aria-selected={matchMode === mode.id} className={matchMode === mode.id ? "active" : ""} onClick={() => { setMatchMode(mode.id); recordEvent(`${mode.label} selected`, "The mat has changed its paperwork and is pretending this was planned.", "blue"); }}>{mode.label}</button>)}</div></div><div className="lab-match-board"><article className="lab-fighter-card lab-fighter-card--player"><span>Player / field agent</span><strong>YOU</strong><div className="lab-meter"><i style={{ width: `${playerHp * 10}%` }} /><b>HP {playerHp}/8</b></div><small>FOCUS {focus} · TEMPO 2 · BELT WHITE</small></article><div className="lab-match-center"><div className="lab-match-round"><span>Round 01</span><strong>{caseClosed ? "CASE CLOSED" : "YELL"}</strong><em>{activeZone.toUpperCase()} ZONE</em></div><div className="lab-zone-strip" role="group" aria-label="Combat zone preview">{["Left", "Center", "Right"].map((zone) => <button key={zone} type="button" className={activeZone === zone ? "active" : ""} aria-pressed={activeZone === zone} onClick={() => { setActiveZone(zone); recordEvent(`${zone} zone declared`, "The declaration was loud enough for the back row.", "brass"); }}>{zone}</button>)}</div><div className="lab-match-actions"><button className="button primary" type="button" onClick={() => triggerImpact("hit")}>Play hit</button><button className="button ghost" type="button" onClick={() => triggerImpact("block")}>Block hit</button><button className="button ghost" type="button" onClick={() => triggerImpact("combo")}>Declare Combo</button><button className="button ghost" type="button" onClick={() => triggerImpact("boss")}>Boss phase</button></div></div><article className="lab-fighter-card lab-fighter-card--opponent"><span>{matchMode === "boss" ? "Boss / escalation desk" : "Opponent / witness"}</span><strong>{matchMode === "boss" ? "THE BOSS" : "RIVAL"}</strong><div className="lab-meter lab-meter--danger"><i style={{ width: `${opponentHp * 10}%` }} /><b>HP {opponentHp}/8</b></div><small>{matchMode === "boss" ? "PHASE 01 · ENRAGE PENDING" : "FOCUS 1 · TEMPO 3 · BELT ORANGE"}</small></article></div><div className="lab-match-footer"><span>Impact actions feed the referee desk, toast stack, screen effects, and recap below.</span><button className="button danger" type="button" onClick={finishMatch}>Close the match</button><button className="button ghost" type="button" onClick={resetMatch}>Reset rehearsal</button></div></div></LabSection>

    <LabSection {...sectionContext} id="referee" eyebrow="09 / Referee desk" title="Every action leaves a receipt" description="The game should always explain itself. This audit trail is the bridge between dramatic presentation and rules clarity when somebody asks, ‘wait, why did that happen?’"><div className="lab-referee-grid"><div className="lab-referee-log"><div className="lab-referee-log-heading"><span>Live audit trail</span><b>{refereeEvents.length} filings</b></div>{refereeEvents.length ? refereeEvents.map((event) => <article key={event.id} className={`lab-referee-event lab-referee-event--${event.tone}`}><strong>{event.label}</strong><div><b>{event.title}</b><p>{event.detail}</p></div></article>) : <p className="lab-referee-empty">No rulings yet. The desk is suspiciously peaceful.</p>}</div><aside className="lab-referee-call"><span>Last call</span><strong>{lastAction}</strong><p>Give the player a reason, a receipt, and a next move. Confusion is not a difficulty setting.</p><button className="button ghost" type="button" onClick={() => { recordEvent("Ruling requested", "The Department has been asked to explain itself in complete sentences.", "brass"); onToast({ kind: "stamp", eyebrow: "Referee desk", title: "Ruling requested", message: "The answer will arrive after a brief but meaningful review.", duration: 3200, variant: selections.toast }); }}>Request ruling</button></aside></div></LabSection>

    <LabSection {...sectionContext} id="cards" eyebrow="10 / Card theater" title="Cards should perform" description="This is where we tune hand feel, inspection, targeting, and the little moments that make playing a card feel like making a decision instead of clicking a rectangle."><div className="lab-card-theater"><div className={`lab-card-fan lab-card-fan--${selections.cards}`} aria-label="Interactive card hand preview">{THEATER_CARDS.map((card, index) => <button key={card.name} type="button" className={`lab-theater-card${selectedCard === index ? " is-selected" : ""}`} onClick={() => setSelectedCard(index)}><span>{card.type}</span><strong>{card.name}</strong><small>{card.copy}</small><b>{card.cost} FOCUS</b></button>)}</div><article className="lab-card-inspector"><span>Selected filing</span><strong>{THEATER_CARDS[selectedCard].name}</strong><p>{THEATER_CARDS[selectedCard].copy}</p><dl><div><dt>TYPE</dt><dd>{THEATER_CARDS[selectedCard].type}</dd></div><div><dt>COST</dt><dd>{THEATER_CARDS[selectedCard].cost} FOCUS</dd></div><div><dt>TARGET</dt><dd>{activeZone} zone</dd></div></dl><button className="button primary" type="button" onClick={() => playTheaterCard(selectedCard)}>Play selected card</button></article></div></LabSection>

    <LabSection {...sectionContext} id="recap" eyebrow="11 / Case closed" title="Make the ending worth sharing" description="A memorable match should leave behind more than a win screen. It should leave a stamped story: what happened, who survived, and which decision deserves to be argued about later."><div className={`lab-case-file lab-case-file--${selections.recap}${caseClosed ? " is-closed" : ""}`}><div className="lab-case-file-heading"><div><span>Department of Competitive Safety</span><strong>{caseClosed ? "CASE CLOSED" : "CASE IN PROGRESS"}</strong></div><div className="lab-case-file-stamp">{caseClosed ? "FILED" : "OPEN"}</div></div><div className="lab-case-file-grid"><div><span>Result</span><strong>{caseClosed ? "Victory by paperwork" : "Awaiting decisive nonsense"}</strong></div><div><span>Highlight</span><strong>{caseClosed ? "The POW! moment" : "No incident selected"}</strong></div><div><span>Official note</span><p>{caseClosed ? "The table survived. The rulebook has requested a vacation." : "Close the rehearsal to generate a shareable-looking result."}</p></div></div><div className="lab-case-file-actions"><button className="button primary" type="button" onClick={finishMatch}>Generate case file</button><button className="button ghost" type="button" onClick={() => { clearConfetti(); setCaseClosed(false); setLastAction("Case file reopened for one more bad decision."); }}>Reopen file</button></div></div></LabSection>

    <section className="lab-handoff paper-stack"><div><span className="eyebrow">The next filing</span><h2>Tell me which numbers earn a belt.</h2><p>Use the numbered picks and notes above. I’ll carry the strongest patterns into the full solo, boss, and multiplayer mat redesign.</p></div><div className="lab-handoff-stamp">LOCAL ONLY<br /><strong>READY FOR REVIEW</strong></div></section>

    {impactLayer}
    {confettiLayer}

    {activeModal && <div className={`lab-modal-overlay lab-modal-overlay--${selections.modal}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setActiveModal(false)}><section className="lab-live-modal" data-lab-modal role="dialog" aria-modal="true" aria-labelledby="lab-live-modal-title"><button ref={modalCloseRef} className="modal-close" type="button" onClick={() => setActiveModal(false)} aria-label="Close interactive message">×</button><span className="eyebrow">Design Lab / live message</span><h2 id="lab-live-modal-title">The mat requests a decision.</h2><p className="modal-lede">This is the interactive message surface. It should be clear enough for a first-time player, dramatic enough for a fight, and short enough that nobody starts a second game while reading it.</p><div className="lab-live-choice"><span>Question</span><strong>Do you spend 2 Focus to keep the filing open?</strong></div><div className="revision-actions"><button className="button primary" type="button" onClick={() => { setActiveModal(false); testToast("success", "Choice accepted", "Two Focus spent. The paperwork continues."); }}>Approve & continue</button><button className="button ghost" type="button" onClick={() => { setActiveModal(false); testToast("warning", "Choice declined", "The filing was closed with dignity."); }}>Decline</button></div></section></div>}
    {drawerOpen && <><button className="lab-drawer-scrim" type="button" onClick={() => setDrawerOpen(false)} aria-label="Close lab drawer" /><aside className={`lab-drawer lab-drawer--${selections.menus}`} data-lab-drawer role="dialog" aria-modal="true" aria-label="Design lab drawer"><div><span className="eyebrow">Drawer variant 0{selections.menus}</span><h2>Side filing</h2><p>A drawer is useful when the mat needs a secondary surface without abandoning the current board state.</p></div><button className="button primary" type="button" onClick={() => { setDrawerOpen(false); setLastAction("Drawer action accepted."); }}>Accept drawer action</button><button ref={drawerCloseRef} className="button ghost" type="button" onClick={() => setDrawerOpen(false)}>Close drawer</button></aside></>}
  </main>;
}

export default DesignLab;
