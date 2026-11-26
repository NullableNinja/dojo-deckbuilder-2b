// Per-device record kept by the website pages (never by the game engine): Dojo Binder saves, Certified
// Reader stamps and recent searches. One place for the storage keys so Settings can show the record.
export const PERSONAL_STORAGE_KEYS = {
  binder: "dojo-binder-v1",
  rulesCertified: "paper-fu-rules-certified-v1",
  recentSearches: "paper-fu-recent-searches-v1",
} as const;

export function readStoredList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function writeStoredList(key: string, values: Iterable<string>) {
  try { window.localStorage.setItem(key, JSON.stringify([...values])); } catch { /* storage blocked: lasts this visit */ }
}

export function readPersonalRecord() {
  return {
    binderCards: readStoredList(PERSONAL_STORAGE_KEYS.binder).length,
    certifiedChapters: readStoredList(PERSONAL_STORAGE_KEYS.rulesCertified).length,
    recentSearches: readStoredList(PERSONAL_STORAGE_KEYS.recentSearches).length,
  };
}
