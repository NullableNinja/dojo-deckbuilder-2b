import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import CompanionApp from "../app/companion-app";
import PlaytestCardRouteLifecycle from "../app/playtest-card-route-lifecycle";
import "../app/card-inspector.css";
import "../app/playtest.css";
import { reloadForNewVersion } from "../app/lazy-with-retry";
import { applyThemeToDocument, readInitialTheme, readUserPreferences } from "../app/user-preferences";

const initialPreferences = readUserPreferences();
document.documentElement.dataset.accent = initialPreferences.accent;
applyThemeToDocument(readInitialTheme());

const buildMeta = document.querySelector<HTMLMetaElement>('meta[name="ddb-build"]');
const currentBuild = buildMeta?.content;

if (import.meta.env.MODE !== "offline" && currentBuild && currentBuild !== "__DDB_BUILD__") {
  fetch(`${import.meta.env.BASE_URL}build.json?ts=${Date.now()}`, { cache: "no-store" })
    .then((response) => response.ok ? response.json() as Promise<{ build?: string }> : null)
    .then((payload) => {
      const latestBuild = payload?.build;
      if (!latestBuild || latestBuild === currentBuild) return;
      const reloadKey = `ddb-reloaded-${latestBuild}`;
      if (window.sessionStorage.getItem(reloadKey)) return;
      window.sessionStorage.setItem(reloadKey, "1");
      const refreshedUrl = new URL(window.location.href);
      refreshedUrl.searchParams.set("_ddb_build", latestBuild.slice(0, 12));
      window.location.replace(refreshedUrl.toString());
    })
    .catch(() => undefined);
}

if (import.meta.env.DEV && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const scope = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
    navigator.serviceWorker.getRegistrations()
      .then(async (registrations) => {
        const localRegistrations = registrations.filter((registration) => registration.scope.startsWith(scope));
        if (!localRegistrations.length) return;
        await Promise.all(localRegistrations.map((registration) => registration.unregister()));
        const reloadKey = "ddb-dev-service-worker-cleared";
        if (navigator.serviceWorker.controller && !window.sessionStorage.getItem(reloadKey)) {
          window.sessionStorage.setItem(reloadKey, "1");
          window.location.reload();
        }
      })
      .catch(() => undefined);
  }, { once: true });
}

if (import.meta.env.PROD && import.meta.env.MODE !== "offline" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    let refreshingForWorker = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshingForWorker) return;
      refreshingForWorker = true;
      window.location.reload();
    });

    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => undefined);
  }, { once: true });
}

// Vite reports a failed preload of a deploy-removed file here; recover instead of leaving a blank page.
window.addEventListener("vite:preloadError", (event) => { if (reloadForNewVersion()) event.preventDefault(); });

const rootElement = document.getElementById("root")!;

createRoot(rootElement).render(
  <StrictMode>
    <>
      <CompanionApp />
      <PlaytestCardRouteLifecycle />
    </>
  </StrictMode>,
);
