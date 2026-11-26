# Dojo Deckbuilder / Paper-Fu project guidance

## Non-negotiable design rule

Light mode and dark mode are co-equal deliverables. Every route, component, token, state, modal, toast, navigation pattern, animation, and responsive layout must be deliberately designed and verified in both themes. Do not build light mode first and patch dark mode later.

## Phase boundaries

- Phase 1 is a presentation and interaction redesign. Preserve canonical card IDs, structured effects, rules data, engine behavior, and gameplay mechanics.
- Do not bulk rewrite card content. Card copy and flavor are redesigned one card at a time only after Phase 1 is approved.
- Treat `app/playtest.tsx`, engine modules, generated data, and canonical JSON as behavior-sensitive. Presentation-only changes must not change their contracts.
- `#lab` is the local Design Lab for evaluating interaction primitives. Keep its five-way choices and notes presentation-only until the user approves a direction for the full game mat.
- The Design Lab is an internal route for project iteration only. Do not expose it in player-facing navigation, footers, Settings, search, or onboarding. Preserve direct `#lab` access in local development for internal review; production builds must not render it.
- Personal Settings belong behind the Field Agent menu. Do not add a second standalone Settings button to the public shell.
- When the full game-mat / gameplay UI phase begins, revisit the Design Lab hand treatment: one selected card standing upright with the remaining hand fanned behind it. Treat it as a candidate interaction pattern, not a decorative flourish, and test it for touch, keyboard, focus, and reduced-motion behavior.

## Architecture direction: one engine

- `engine/` is becoming the single rules runtime for the browser, the simulator and online play. See `docs/one-engine-plan.md` for the phases.
- New rules go into canonical JSON plus a generic engine resolver. Do not add rules to `app/playtest.tsx` or the `app/*` runtime modules, and never branch on a card ID or name.
- The repository is meant to be open and forkable. Keep the engine framework-free, deterministic (seeded RNG only) and readable.
- Use the `martin-clean-code` skill (`.claude/skills/clean-code-skill/`) when refactoring or reviewing code.

## Paper-Fu visual language

- Use the authoritative token system in `app/globals.css`.
- Paper surfaces, ink-blue structure, ember action, brass certification, crisp lines, clipped corners, tape, stamps, and offset paper shadows are intentional primitives.
- Green is a narrow guard/safety semantic. It is not the brand, default surface, or default action color.
- Decorative layers must be owned by and move with their component. Avoid arbitrary noise and one-off CSS overrides.
- Prefer semantic tokens and reusable components over hardcoded colors.

## Interaction and accessibility

- Keep keyboard focus visible and meaningful. Preserve modal focus trapping/restoration, Escape handling, combobox/listbox semantics, and `aria-current` navigation state.
- Honor `prefers-reduced-motion`; remove bobbing, shake, confetti, and smooth-scroll theatrics when requested.
- Keep touch targets at least 44px and verify desktop, tablet, and mobile layouts in both themes.
- Use haptic feedback only as a guarded enhancement and never as the only feedback channel.

## Verification

- Run `npm run build` and `npm test` after presentation changes.
- Check light and dark modes separately, plus desktop and mobile widths.
- Before handoff, check for accidental green styling, theme drift, dead selectors, overlapping cascade layers, and regressions in search, navigation, modals, toasts, and the live field test.
