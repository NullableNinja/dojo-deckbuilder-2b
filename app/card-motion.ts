// Presentation-only card motion: work out which cards changed zones between two renders.
// Pure and DOM-free so it can be unit tested; see docs/paper-fu-card-motion-plan.md.

export type CardZone = "deck" | "hand" | "discard" | "playArea" | "destroyed" | "market" | "filing";
export type CardMotionName = "fold-in" | "crumple" | "draw" | "restock" | "destroy" | "move";
export type ZoneSnapshot = Partial<Record<CardZone, readonly string[]>>;

/** One physical card copy: the id plus which copy it is (two Bad Habits are two cards). */
export type CardMotion = {
  cardId: string;
  copy: number;
  from: CardZone | null;
  to: CardZone | null;
  motion: CardMotionName;
};

const ZONES: CardZone[] = ["deck", "hand", "discard", "playArea", "destroyed", "market", "filing"];

const copiesByZone = (snapshot: ZoneSnapshot) => {
  const map = new Map<string, CardZone[]>();
  for (const zone of ZONES) {
    for (const id of snapshot[zone] ?? []) {
      const list = map.get(id) ?? [];
      list.push(zone);
      map.set(id, list);
    }
  }
  return map;
};

/** Pick the animation for a zone change. `null` means the card is not on screen on that side. */
export function motionFor(from: CardZone | null, to: CardZone | null): CardMotionName {
  if (to === "destroyed") return "destroy";
  if (to === "discard" && (from === "hand" || from === "playArea" || from === "filing")) return "crumple";
  if (to === "hand" && (from === "deck" || from === null)) return "draw";
  if (to === "market") return "restock";
  if (to === "playArea" || to === "filing") return "fold-in";
  return "move";
}

/**
 * Compare two snapshots and list every card copy whose zone changed.
 * Copies keep their zone when possible, so a hand of [A, A] that discards one A reports a
 * single crumple, not two moves. Zones not present in a snapshot are treated as empty.
 */
export function diffCardZones(previous: ZoneSnapshot, next: ZoneSnapshot): CardMotion[] {
  const before = copiesByZone(previous);
  const after = copiesByZone(next);
  const ids = new Set([...before.keys(), ...after.keys()]);
  const motions: CardMotion[] = [];

  for (const cardId of ids) {
    const left = [...(before.get(cardId) ?? [])];
    const right = [...(after.get(cardId) ?? [])];
    // Cancel out copies that stayed in the same zone.
    for (let i = left.length - 1; i >= 0; i -= 1) {
      const match = right.indexOf(left[i]);
      if (match !== -1) {
        left.splice(i, 1);
        right.splice(match, 1);
      }
    }
    // Pair remaining copies in zone order: each pair is one card that moved.
    const pairs = Math.max(left.length, right.length);
    for (let copy = 0; copy < pairs; copy += 1) {
      const from = left[copy] ?? null;
      const to = right[copy] ?? null;
      motions.push({ cardId, copy, from, to, motion: motionFor(from, to) });
    }
  }
  return motions;
}

/** Durations in ms, mirrored by the CSS keyframes in app/playtest.css (CARD MOTION PRIMITIVES). */
export const CARD_MOTION_DURATION: Record<CardMotionName, number> = {
  "fold-in": 420,
  crumple: 380,
  draw: 320,
  restock: 360,
  destroy: 450,
  move: 260,
};

/** True when any reduced-motion signal is on: OS setting, site Settings, or the in-game Motion select. */
export function cardMotionDisabled(gameMotion?: string): boolean {
  if (gameMotion === "off" || gameMotion === "reduced") return true;
  if (typeof document !== "undefined" && document.documentElement.dataset.motion === "reduced") return true;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return false;
}
