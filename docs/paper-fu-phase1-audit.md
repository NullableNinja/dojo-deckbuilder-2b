# Paper-Fu Phase 1 audit

Date: 2026-11-14

## Structural inventory

- Routes: Home, Play the Game (`#play`; old `#playtest` links redirect), Quick Start, Backstory, Full Rules, Card Library, Rulings & Variants, Glossary, and Search.
- Route shell: `app/companion-app.tsx` owns the global header, mobile menu, theme persistence, search, progress, toasts, modal primitive, footer, and most companion pages.
- Route adapters: `app/routing.ts`, `app/site-navigation.ts`, and `app/search-page.tsx`.
- Gameplay: `app/playtest.tsx`, `app/playtest.css`, runtime/bridge modules, and the engine. Mechanics and canonical data are out of scope for Phase 1.
- Supporting UI: `app/card-inspector.tsx`, `app/card-inspector.css`, and the card route lifecycle.
- Assets: `app/assets/art` contains brand, hero, chapter, roster, card, and rules illustrations. Phase 1 reuses the existing hero/roster/chapter art; no card content is rewritten.

## Findings

1. `app/globals.css` was 4,668 lines and contained multiple competing style layers: an original base, a later Paper-Fu v2 override block, and scattered dark/mobile exceptions.
2. Green served as brand, navigation/selection, recommended surface, and gameplay status in the companion shell. The color system did not distinguish action, guard, certification, or danger semantics.
3. Dark mode was largely an exception list. Several components were readable only because of local overrides, which made new states risky to add.
4. The shell had working navigation, search, theme persistence, progress, toasts, and focus management, but its presentation read as a dark SaaS dashboard with paper decorations instead of a coherent paper-craft field desk.
5. The current desktop hero was the strongest visual area. The rest of the home page did not carry the same material language consistently.
6. The mobile navigation and drawer existed, but the live field test used a mobile notice/hide strategy rather than a responsive layout.
7. Baseline verification before redesign: `npm run build` passed; `npm test` passed with 127 tests.

## Phase 1 guardrails

- Preserve route IDs, navigation contracts, canonical card IDs, card JSON, structured effects, and engine/runtime behavior.
- Consolidate the companion cascade into one token-first `app/globals.css` authority. Keep `app/playtest.css` as the gameplay presentation boundary; only shared token compatibility belongs in the global layer.
- Verify both themes continuously, not as a final patch.
