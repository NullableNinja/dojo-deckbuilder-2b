// Plain-language labels for career rewards, shared by the payroll slip, the header panel and the Collection page.
import { economy, type Reward } from "./career";

export const titleCase = (key: string) => key.split(/[-:\s]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
export const packName = (id?: string) => economy.boosters.find((pack) => pack.id === id)?.name ?? titleCase(id ?? "");

export function rewardLabel(reward: Reward) {
  if (reward.kind === "booster-ticket") return plural(reward.count ?? 1, "Booster Ticket");
  if (reward.kind === "unlock-booster") return `${packName(reward.pack)} series opens`;
  if (reward.kind === "unlock-character") return `${reward.name} cleared for duty`;
  if (reward.kind === "unlock-boss") return `New Boss: ${reward.name}`;
  if (reward.kind === "starter-kit-choice") return "Another Starter Kit to choose in the Card Library";
  if (reward.kind === "title") return `Title: ${titleCase((reward.id ?? "").replace(/^title:/, ""))}`;
  const [slot, name] = (reward.id ?? "").split(":");
  return `${titleCase(slot ?? "")}: ${titleCase(name ?? "")} (design pending)`;
}
