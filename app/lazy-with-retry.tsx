import { lazy, type ComponentType } from "react";
import { claimStaleBuildReload, sessionStoreOrNull } from "./stale-build.ts";

/** Reload once to pick up the newest deploy. Returns false when it already tried (or cannot track that safely). */
export function reloadForNewVersion(): boolean {
  if (!claimStaleBuildReload(sessionStoreOrNull(), Date.now())) return false;
  window.location.reload();
  return true;
}

function NewVersionNotice() {
  return <section className="mat-loading paper-stack" role="alert">
    <span className="eyebrow">Department memo</span>
    <h2>A newer version of the game was filed</h2>
    <p>This page was opened before the latest update, so part of it can no longer be found. Reloading fetches the new version; your career and saved settings stay on this device.</p>
    <button type="button" className="button primary" onClick={() => window.location.reload()}>Reload the game</button>
  </section>;
}

/** React.lazy that survives a deploy: a failed file load reloads the page once, then explains instead of crashing. */
export function lazyWithRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await load();
    } catch {
      if (reloadForNewVersion()) return new Promise<{ default: T }>(() => undefined); // the fallback stays up while the page reloads
      return { default: NewVersionNotice as unknown as T };
    }
  });
}
