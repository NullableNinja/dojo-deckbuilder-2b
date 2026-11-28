// The player's experimental-update switches (engine/experiments.mjs), remembered on this device.
// A convenience only: the table option they produce is recorded in each game's setup, so saves and replays never
// depend on this storage.
import registry from "../content/experimental/experiments.json" with { type: "json" };
import type { TableOptions } from "./engine-session.ts";

export type ExperimentSettings = { modules: string[]; exclude: string[] };

const STORAGE_KEY = "ddb-experiments";
const KNOWN = new Set(registry.modules.map((module) => module.id));
export const EMPTY_EXPERIMENTS: ExperimentSettings = { modules: [], exclude: [] };

export function loadExperimentSettings(): ExperimentSettings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ExperimentSettings> | null;
    if (!saved) return EMPTY_EXPERIMENTS;
    const modules = Array.isArray(saved.modules) ? saved.modules.filter((id) => typeof id === "string" && KNOWN.has(id)) : [];
    const exclude = Array.isArray(saved.exclude) ? saved.exclude.filter((id) => typeof id === "string") : [];
    return { modules, exclude };
  } catch { return EMPTY_EXPERIMENTS; }
}

export function saveExperimentSettings(settings: ExperimentSettings) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* storage blocked: the switches last for this visit */ }
}

/** The `experiments` table option for these switches, or undefined when nothing is on. */
export function experimentsTableOption(settings: ExperimentSettings): TableOptions["experiments"] {
  if (!settings.modules.length) return undefined;
  return settings.exclude.length ? { modules: [...settings.modules], exclude: [...settings.exclude] } : { modules: [...settings.modules] };
}
