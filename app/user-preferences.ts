import { AVATAR_OPTIONS } from "./avatar-catalog";

export type AccentKey = "ember" | "crimson" | "hot-pink" | "cobalt" | "brass" | "plum" | "guard";
export type Theme = "light" | "dark";
export type AvatarKey = "baron-von-backflip" | "blurry-monk" | "boo-fu" | "century-bob" | "coach-karen" | "crash-test-dummy" | "disco-dojo-dan" | "doodle-bopper" | "dopplebopper" | "flaming-monk-dude-broski" | "glitterpunch" | "honorable-trash-panda" | "ink-fist" | "janitor-joe" | "karatesaurus" | "master-mimefu" | "miss-direction" | "paper-crain" | "punchline-pete" | "sleepy-chad" | "the-belt-collector" | "the-nerfhammer" | "the-rebooter" | "el-pollo-rojo" | "mr-bobby" | "sensei-ducktape" | "wavey-davey";
export type PreferenceDensity = "roomy" | "tight";
export type ToastDuration = "1800" | "4200" | "9000";
export type EffectIntensity = "quiet" | "standard" | "high";
export type DisplayFace = "classic" | "condensed";

export type LabProfile = {
  selections: Record<string, number>;
  shortlists: Record<string, number[]>;
  notes: Record<string, string>;
};

export type UserPreferences = {
  displayName: string;
  avatar: AvatarKey;
  accent: AccentKey;
  density: PreferenceDensity;
  reducedMotion: boolean;
  toastDuration: ToastDuration;
  effectIntensity: EffectIntensity;
  displayFace: DisplayFace;
  lab: LabProfile;
};

export type PresentationPreferences = Pick<UserPreferences, "density" | "reducedMotion" | "toastDuration" | "effectIntensity" | "displayFace">;

export const USER_PREFERENCES_STORAGE_KEY = "paper-fu-user-profile-v1";
export const LEGACY_LAB_STORAGE_KEY = "paper-fu-design-lab-v2";
export const THEME_STORAGE_KEY = "paper-fu-theme";

const THEME_COLORS: Record<Theme, string> = {
  light: "#d7dbe1",
  dark: "#181a1e",
};

export const readInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  // Blocked site storage throws on access; fall back to the system theme instead of a blank page.
  let saved: string | null = null;
  try { saved = window.localStorage.getItem(THEME_STORAGE_KEY); } catch { /* storage blocked: use the system theme */ }
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const applyThemeToDocument = (theme: Theme) => {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = THEME_COLORS[theme];
};

export const ACCENT_OPTIONS: Array<{ id: AccentKey; label: string; shortLabel: string; description: string }> = [
  { id: "ember", label: "Ember", shortLabel: "HIYAH! red", description: "The original action stamp. Warm, loud, and certified." },
  { id: "crimson", label: "Crimson", shortLabel: "Deep red", description: "A clear, cool red for action and emphasis." },
  { id: "hot-pink", label: "Hot Pink", shortLabel: "Electric pink", description: "A bright, unapologetic pop of Paper-Fu energy." },
  { id: "cobalt", label: "Cobalt", shortLabel: "Ink blue", description: "A colder, official filing with extra authority." },
  { id: "brass", label: "Brass", shortLabel: "Victory gold", description: "For users who want every click to feel promoted." },
  { id: "plum", label: "Plum", shortLabel: "Rival purple", description: "A sly alternate palette for questionable technique." },
  { id: "guard", label: "Guard", shortLabel: "Safety teal", description: "Calm on the surface. Still capable of a counter." },
];

export { AVATAR_OPTIONS } from "./avatar-catalog";

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  displayName: "Paper-Fu Agent",
  avatar: "honorable-trash-panda",
  accent: "ember",
  density: "roomy",
  reducedMotion: false,
  toastDuration: "4200",
  effectIntensity: "standard",
  displayFace: "classic",
  lab: { selections: {}, shortlists: {}, notes: {} },
};

const isAccent = (value: unknown): value is AccentKey => ACCENT_OPTIONS.some((option) => option.id === value);
const isAvatar = (value: unknown): value is AvatarKey => AVATAR_OPTIONS.some((option) => option.id === value);
const isDensity = (value: unknown): value is PreferenceDensity => value === "roomy" || value === "tight";
const isToastDuration = (value: unknown): value is ToastDuration => value === "1800" || value === "4200" || value === "9000";
const isEffectIntensity = (value: unknown): value is EffectIntensity => value === "quiet" || value === "standard" || value === "high";
const isDisplayFace = (value: unknown): value is DisplayFace => value === "classic" || value === "condensed";
const recordNumbers = (value: unknown) => typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === "number")) as Record<string, number> : {};
const recordNumberLists = (value: unknown) => typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value).filter(([, entry]) => Array.isArray(entry)).map(([key, entry]) => [key, (entry as unknown[]).filter((item): item is number => typeof item === "number")])) as Record<string, number[]> : {};
const recordStrings = (value: unknown) => typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === "string")) as Record<string, string> : {};

const readJson = (key: string): Record<string, unknown> => {
  if (typeof window === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

export const readUserPreferences = (): UserPreferences => {
  const saved = readJson(USER_PREFERENCES_STORAGE_KEY);
  const legacy = readJson(LEGACY_LAB_STORAGE_KEY);
  const savedLab = typeof saved.lab === "object" && saved.lab !== null ? saved.lab as Record<string, unknown> : {};
  const legacySettings = typeof legacy.settings === "object" && legacy.settings !== null ? legacy.settings as Record<string, unknown> : {};
  const lab: LabProfile = {
    selections: { ...recordNumbers(legacy.selections), ...recordNumbers(savedLab.selections) },
    shortlists: { ...recordNumberLists(legacy.shortlists), ...recordNumberLists(savedLab.shortlists) },
    notes: { ...recordStrings(legacy.notes), ...recordStrings(savedLab.notes) },
  };
  return {
    displayName: typeof saved.displayName === "string" && saved.displayName.trim() ? saved.displayName.trim().slice(0, 36) : DEFAULT_USER_PREFERENCES.displayName,
    avatar: isAvatar(saved.avatar) ? saved.avatar : DEFAULT_USER_PREFERENCES.avatar,
    accent: isAccent(saved.accent) ? saved.accent : DEFAULT_USER_PREFERENCES.accent,
    density: isDensity(saved.density) ? saved.density : isDensity(legacySettings.density) ? legacySettings.density : DEFAULT_USER_PREFERENCES.density,
    reducedMotion: typeof saved.reducedMotion === "boolean" ? saved.reducedMotion : typeof legacySettings.reducedMotion === "boolean" ? legacySettings.reducedMotion : DEFAULT_USER_PREFERENCES.reducedMotion,
    toastDuration: isToastDuration(saved.toastDuration) ? saved.toastDuration : isToastDuration(legacySettings.toastDuration) ? legacySettings.toastDuration : DEFAULT_USER_PREFERENCES.toastDuration,
    effectIntensity: isEffectIntensity(saved.effectIntensity) ? saved.effectIntensity : isEffectIntensity(legacySettings.effectIntensity) ? legacySettings.effectIntensity : DEFAULT_USER_PREFERENCES.effectIntensity,
    displayFace: isDisplayFace(saved.displayFace) ? saved.displayFace : DEFAULT_USER_PREFERENCES.displayFace,
    lab,
  };
};

export const writeUserPreferences = (preferences: UserPreferences) => {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(USER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences)); } catch { /* storage blocked or full: preferences last this visit */ }
};

export const updateUserPreferences = (update: Partial<Omit<UserPreferences, "lab">> & { lab?: Partial<LabProfile> }) => {
  const current = readUserPreferences();
  const next: UserPreferences = {
    ...current,
    ...update,
    lab: update.lab ? {
      selections: { ...current.lab.selections, ...(update.lab.selections ?? {}) },
      shortlists: { ...current.lab.shortlists, ...(update.lab.shortlists ?? {}) },
      notes: { ...current.lab.notes, ...(update.lab.notes ?? {}) },
    } : current.lab,
  };
  writeUserPreferences(next);
  return next;
};

export const replaceUserLab = (lab: LabProfile) => {
  const current = readUserPreferences();
  const next = { ...current, lab };
  writeUserPreferences(next);
  return next;
};

