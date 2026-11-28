// "Experimental updates" in the match setup: switch v1.7 test packages on or off, and single cards inside them.
// Presentation only: it edits the player's switches; engine/experiments.mjs decides what they do.
import registry from "../content/experimental/experiments.json" with { type: "json" };
import experimentalCards from "../content/experimental/experimental-cards.json" with { type: "json" };
import retunes from "../content/experimental/retunes.json" with { type: "json" };
import catalog from "./data/cards.json" with { type: "json" };
import type { ExperimentSettings } from "./experiment-settings.ts";
import "./experiment-panel.css";

type Module = { id: string; name: string; kind: string; group?: string; requires?: string[]; summary: string };
type Entry = { id: string; name: string; kind: string; cost: string; text: string; note?: string };

const MODULES = registry.modules as Module[];
const PRINTED = new Map((catalog as unknown as { cards: { catalogId: string; fpCost: number | string; rulesText: string }[] }).cards.map((card) => [card.catalogId, card]));

function entriesFor(module: Module): Entry[] {
  if (module.kind === "cards") {
    return (experimentalCards.cards as unknown as { group: string; card: { catalogId: string; name: string; subtype: string; fpCost: number | string; rulesText: string }; engineNote?: string }[])
      .filter((entry) => entry.group === module.group)
      .map((entry) => ({ id: entry.card.catalogId, name: entry.card.name, kind: entry.card.subtype, cost: entry.card.fpCost === "—" ? "" : `${entry.card.fpCost} Focus`, text: entry.card.rulesText, note: entry.engineNote }));
  }
  if (module.kind === "retunes") {
    return (retunes.retunes as unknown as { group: string; catalogId: string; name: string; patch: { fpCost?: number; rulesText?: string }; engineNote?: string }[])
      .filter((entry) => entry.group === module.group)
      .map((entry) => {
        const printed = PRINTED.get(entry.catalogId);
        const cost = entry.patch.fpCost !== undefined && printed && Number(printed.fpCost) !== entry.patch.fpCost ? `${printed.fpCost} → ${entry.patch.fpCost} Focus` : printed ? `${printed.fpCost} Focus` : "";
        return { id: entry.catalogId, name: entry.name, kind: "Retune", cost, text: entry.patch.rulesText ?? printed?.rulesText ?? "", note: entry.engineNote ?? (entry.patch.rulesText ? undefined : "Text unchanged; new cost or tags.") };
      });
  }
  return [];
}

const required = (id: string) => MODULES.filter((module) => module.requires?.includes(id)).map((module) => module.id);

export function ExperimentPanel({ value, onChange, disabled }: { value: ExperimentSettings; onChange: (next: ExperimentSettings) => void; disabled?: boolean }) {
  const on = new Set(value.modules);
  // A module another enabled module needs stays on (Paperwork cards need Status effects).
  const lockedOn = (id: string) => required(id).some((dependent) => on.has(dependent));
  const toggleModule = (module: Module) => {
    const next = new Set(on);
    if (next.has(module.id)) { if (lockedOn(module.id)) return; next.delete(module.id); }
    else { next.add(module.id); for (const need of module.requires ?? []) next.add(need); }
    onChange({ ...value, modules: MODULES.map((entry) => entry.id).filter((id) => next.has(id)) });
  };
  const toggleEntry = (id: string) => onChange({ ...value, exclude: value.exclude.includes(id) ? value.exclude.filter((entry) => entry !== id) : [...value.exclude, id] });
  const count = value.modules.length;
  return <fieldset className={`experiment-panel${disabled ? " is-disabled" : ""}`} disabled={disabled}>
    <legend>Experimental updates · v1.7 test</legend>
    <p>Try draft rules, new cards and card changes before they become official. Everything is off until you switch it on, and your choices are remembered on this device. {disabled ? "Choose the shared rules engine to use them." : "They apply to Quick Duel, Tag Team and Boss Blitz on the shared engine."}</p>
    <div className="experiment-panel__bulk">
      <span className="experiment-panel__count">{count ? `${count} of ${MODULES.length} on` : "All off"}</span>
      <button type="button" className="button ghost" onClick={() => onChange({ modules: MODULES.map((module) => module.id), exclude: value.exclude })}>Switch all on</button>
      <button type="button" className="button ghost" onClick={() => onChange({ modules: [], exclude: value.exclude })} disabled={!count}>Switch all off</button>
    </div>
    {MODULES.map((module) => {
      const entries = entriesFor(module);
      const enabled = on.has(module.id);
      const off = entries.filter((entry) => value.exclude.includes(entry.id)).length;
      return <div className={`experiment-module${enabled ? " is-on" : ""}`} key={module.id}>
        <label className="experiment-module__switch">
          <input type="checkbox" checked={enabled} onChange={() => toggleModule(module)} aria-describedby={`experiment-${module.id}-summary`} />
          <span><b>{module.name}</b><small id={`experiment-${module.id}-summary`}>{module.summary}{lockedOn(module.id) ? " Needed by another update you switched on." : ""}</small></span>
          <em className="experiment-module__tag">{module.kind === "rules" ? "Rules" : module.kind === "cards" ? `${entries.length} new` : `${entries.length} changed`}</em>
        </label>
        {entries.length > 0 && <details className="experiment-module__cards">
          <summary>Review {module.kind === "retunes" ? "the changes" : "the cards"}{off ? ` · ${off} switched off` : ""}</summary>
          <ul>{entries.map((entry) => <li key={entry.id} className={value.exclude.includes(entry.id) ? "is-excluded" : ""}>
            <label>
              <input type="checkbox" checked={!value.exclude.includes(entry.id)} onChange={() => toggleEntry(entry.id)} disabled={disabled || !enabled} />
              <span><b>{entry.name}</b><small className="experiment-entry__meta">{entry.kind}{entry.cost ? ` · ${entry.cost}` : ""}</small><small>{entry.text}</small>{entry.note && <small className="experiment-entry__note">Test version: {entry.note}</small>}</span>
            </label>
          </li>)}</ul>
        </details>}
      </div>;
    })}
  </fieldset>;
}
