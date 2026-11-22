# Paper-Fu card motion plan

Status: preparation. The diff helper, its tests and the inert CSS primitives are in place;
nothing is wired into the live mat yet.

## Goal

Cards should move like paper: they fold open when revealed, crumple when discarded,
slide in when drawn, and slot into the Market when it restocks. Motion explains *what
changed*; it never decides what happens. Game state, rules and engine behavior are untouched.

## Motions

| Motion | Trigger (zone change) | Feel | Duration |
| --- | --- | --- | --- |
| `fold-in` (reveal) | card enters `playArea` / opponent filing lane, or a face-down card is revealed | rotateY from 90deg with a paper crease shadow, small overshoot | 420ms |
| `crumple` (discard) | card leaves `hand` and enters `discard` | scale down with a skew and clip-path wad, drop and fade | 380ms |
| `draw` | card enters `hand` from `deck` | slide up from the hand's bottom edge, settle into its fan angle | 320ms, 40ms stagger |
| `restock` | card enters `market` | drop in from above with a stamp bounce | 360ms |
| `destroy` | card leaves to `destroyed` | tear: two halves split apart (clip-path) | 450ms |

## How it works

1. `app/card-motion.ts` exports `diffCardZones(previous, next)`. It takes two snapshots of
   zone -> card ids (duplicates allowed: two Bad Habits are two cards) and returns the
   cards that moved, entered or left, each with `from` and `to` zones and a `motion`
   name from the table above. It is pure and unit tested (`tests/card-motion.test.mjs`).
2. A small React hook (next step, not built yet) keeps the previous snapshot in a ref,
   diffs on each render of the live mat, and sets `data-card-motion="<name>"` on the
   matching card element for one animation cycle.
3. CSS in `app/playtest.css` (section "CARD MOTION PRIMITIVES") owns the keyframes. Every
   rule is keyed on `[data-card-motion]`, so until the hook sets that attribute the CSS is
   inert.

Leaving cards are already gone from the DOM after a re-render. The hook therefore renders
a short-lived *ghost* (a static copy of the card art, `aria-hidden`, pointer-events none)
at the card's last known position for crumple, destroy and fold-out. Ghosts live in one
absolutely positioned layer inside the live shell, never in the hand row, so layout
doesn't shift.

## Accessibility and settings

- `prefers-reduced-motion: reduce`, the in-app Motion setting `reduced` or `off`, and the
  site Settings reduced-motion toggle all disable these animations. The diff still runs,
  so screen-reader announcements are unaffected; only the visual motion is skipped.
- Motion never moves focus. A card that is focused keeps focus through a re-render.
- No animation blocks input. Ghosts are `pointer-events: none`; the hand stays
  interactive during a draw.
- Touch: animations are transform/opacity/clip-path only, so they stay on the compositor
  on phones.

## Hook points in `app/playtest.tsx` (for wiring)

- Hand row: `PlayCard` rendered with key `${id}-${index}` inside `.play-card-row`.
  The key includes the index, so the hook must diff by card id plus occurrence, not by key.
- Opponent filings and your filed cards: `MatLane` renders `.mat-lane-cards > button`.
- Market: `.ascend-market-grid` renders `PlayCard` per `match.market` id.
- Board snapshot: `match.player` / `match.ai` expose `hand`, `discard`, `playArea`,
  `destroyed`; `match.market` is the Market row.

## Verification checklist (when wiring)

- Both themes, 1440x900, 1366x768 and 390x844.
- Full duels via the Playwright bot still finish with no failed clicks.
- Reduced motion (OS, in-app Motion off, Settings toggle): no animation runs, nothing
  is missing.
- `npm run verify` passes; `playtest:runtime` stays 907/907.
