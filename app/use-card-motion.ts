// React wiring for card motion (presentation only). Diffs zone snapshots after each render and
// marks the affected card elements with data-card-motion for one cycle. Cards that already left
// the DOM (crumple, destroy) are replayed as ghosts at their last known position.
// See docs/paper-fu-card-motion-plan.md. Errors are swallowed: motion must never break play.

import { useLayoutEffect, useRef, type RefObject } from "react";
import { CARD_MOTION_DURATION, cardMotionDisabled, diffCardZones, type CardMotion, type ZoneSnapshot } from "./card-motion";

type LastSeen = { left: number; top: number; width: number; height: number; src: string | null };

/** Key for one physical copy: id plus its occurrence index among same-id elements. */
const copyKey = (id: string, copy: number) => `${id}#${copy}`;

const ENTERING = new Set(["draw", "restock", "fold-in", "move"]);
const LEAVING = new Set(["crumple", "destroy"]);
/** Zones the live mat actually renders as [data-card-id] elements. Moves into hidden zones (deck) are skipped. */
const VISIBLE_ZONES = new Set(["hand", "market", "playArea", "filing"]);

export function useCardMotion(containerRef: RefObject<HTMLElement | null>, snapshot: ZoneSnapshot | null, gameMotion?: string, resetKey?: unknown) {
  const previous = useRef<ZoneSnapshot | null>(null);
  const previousReset = useRef<unknown>(resetKey);
  const lastSeen = useRef(new Map<string, LastSeen>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    try {
      // A new duel (or no match) is a fresh start: remember the state, animate nothing.
      const fresh = previous.current === null || previousReset.current !== resetKey || snapshot === null;
      const motions: CardMotion[] = !fresh && snapshot && !cardMotionDisabled(gameMotion) ? diffCardZones(previous.current ?? {}, snapshot) : [];
      if (container && motions.length) play(container, motions, lastSeen.current);
      if (container) lastSeen.current = measure(container);
    } catch {
      /* presentation only: never interrupt the game */
    }
    previous.current = snapshot;
    previousReset.current = resetKey;
  });
}

function cardElements(container: HTMLElement) {
  const byId = new Map<string, HTMLElement[]>();
  container.querySelectorAll<HTMLElement>("[data-card-id]").forEach((element) => {
    const id = element.dataset.cardId;
    if (!id || element.closest(".card-motion-ghost-layer")) return;
    const list = byId.get(id) ?? [];
    list.push(element);
    byId.set(id, list);
  });
  return byId;
}

function measure(container: HTMLElement) {
  const origin = container.getBoundingClientRect();
  const seen = new Map<string, LastSeen>();
  for (const [id, elements] of cardElements(container)) {
    elements.forEach((element, copy) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      seen.set(copyKey(id, copy), {
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        width: rect.width,
        height: rect.height,
        src: element.querySelector("img")?.getAttribute("src") ?? null,
      });
    });
  }
  return seen;
}

function play(container: HTMLElement, motions: CardMotion[], lastSeen: Map<string, LastSeen>) {
  const elements = cardElements(container);
  let enterIndex = 0;
  for (const motion of motions) {
    const duration = CARD_MOTION_DURATION[motion.motion] + 80;
    if (ENTERING.has(motion.motion) && motion.to && VISIBLE_ZONES.has(motion.to)) {
      // The newest copy of this id is the one that just arrived.
      const list = elements.get(motion.cardId) ?? [];
      const target = list[list.length - 1 - motion.copy] ?? list[list.length - 1];
      if (!target) continue;
      target.style.setProperty("--card-motion-index", String(enterIndex++));
      target.dataset.cardMotion = motion.motion;
      window.setTimeout(() => {
        if (target.dataset.cardMotion === motion.motion) delete target.dataset.cardMotion;
        target.style.removeProperty("--card-motion-index");
      }, duration + enterIndex * 40);
    } else if (LEAVING.has(motion.motion)) {
      const seen = lastSeen.get(copyKey(motion.cardId, motion.copy)) ?? lastSeen.get(copyKey(motion.cardId, 0));
      if (seen) ghost(container, seen, motion.motion, duration);
    }
  }
}

function ghost(container: HTMLElement, seen: LastSeen, motion: string, duration: number) {
  let layer = container.querySelector<HTMLElement>(":scope > .card-motion-ghost-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "card-motion-ghost-layer";
    layer.setAttribute("aria-hidden", "true");
    container.append(layer);
  }
  const node = document.createElement("div");
  node.className = "card-motion-ghost";
  node.dataset.cardMotion = motion;
  Object.assign(node.style, { left: `${seen.left}px`, top: `${seen.top}px`, width: `${seen.width}px`, height: `${seen.height}px` });
  if (seen.src) {
    const image = document.createElement("img");
    image.src = seen.src;
    image.alt = "";
    node.append(image);
  }
  layer.append(node);
  window.setTimeout(() => node.remove(), duration);
}
