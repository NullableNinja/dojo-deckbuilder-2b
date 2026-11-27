// A page opened before a new deploy asks for game files (hashed names) that the new deploy removed.
// Recovery: reload once to fetch the new page; if that does not help within the window, stop and tell the player.
export const STALE_BUILD_RETRY_KEY = "ddb-stale-build-retry-at";
export const STALE_BUILD_WINDOW_MS = 30_000;

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

/** True when an automatic reload is allowed right now (and records it). Blocked storage never auto-reloads, so a page can never loop. */
export function claimStaleBuildReload(store: KeyValueStore | null, now: number): boolean {
  if (!store) return false;
  try {
    const last = Number(store.getItem(STALE_BUILD_RETRY_KEY) ?? 0);
    if (Number.isFinite(last) && now - last < STALE_BUILD_WINDOW_MS) return false;
    store.setItem(STALE_BUILD_RETRY_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

export function sessionStoreOrNull(): KeyValueStore | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}
