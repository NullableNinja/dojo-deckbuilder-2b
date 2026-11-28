# Optimization audit

Audited Nov 28, 2026 against `main` at `1e342f0`, on a clean checkout (Node 22.23, 4 cores). Every number below was
measured; where something measured fine it says so. Light and dark mode were exercised for the route and duel checks.

How it was measured: `npm run build` output; a source-map byte attribution of each chunk; a headless Chromium (served with gzip,
CPU throttled 1x/4x/6x) for load timings, image sizes and touch targets; Node scripts that drive the engine for hot-path
timings; a static import-graph walk for dead code; `tsc --noUnusedLocals`; per-file `node --test` timings.

Legend: **Impact** H/M/L for players or contributors; **Effort** S (under a day) / M / L; **Risk** of changing behaviour or
looks. "Done" rows are implemented in this worktree (uncommitted, see the end).

## Done in this worktree

| # | Change | Before | After |
| --- | --- | --- | --- |
| L1 | `vite.config.ts`: remove the forced `playtest` chunk group | Home loads `index` 119 KB + `playtest` 375 KB + `structured-effects` 30 KB gzip = **511 KiB JS**, 4 scripts, 2.15 MB minified | **311 KiB JS**, 2 scripts, 1.5 MB minified (-39% transferred, -650 KB parsed). Home timings at 1x CPU: DOMContentLoaded 170 to 127 ms, first paint 362 to 322 ms; at 6x about 10% better |
| L2 | `engine/rng.mjs`: move the seeded `Rng` out of `engine/core.mjs` (re-exported, same code) so the career economy stops importing the rules engine | the whole engine (about 156 KB minified) sat in the entry graph via `app/career.ts` to `engine/collection.mjs` | engine now loads with Play (`career-payroll` chunk, lazy). Together with L1; the `playtest` chunk itself fell 1,748 to 433 KB |
| A1 | Guard blocked site storage: `readInitialTheme`, `writeUserPreferences`, the theme effect (`companion-app.tsx`), `src/playtest-vfx-runtime.ts`, and the Play shell's setting/mode/binder/match writes and mode read (`playtest.tsx`, `quick-duel-table.tsx`) | With `localStorage` throwing `SecurityError` (Safari "block all cookies", locked-down browsers, sandboxed iframes) **every route rendered a blank page** (measured: `#root` empty on Home, Cards, Settings, Play, Collection) | All five routes render and a Quick Duel starts with storage blocked; no page errors |

Verification: `npm run verify` is green with all of it (349 tests, workflow check, 907/907 runtime certification, build and the
Card Inspector bundle check). Route sweep of 13 hashes in light and dark: no console errors, same headings as before.

## 1. Load performance and bundle

Baseline build: `index` 405 KB (119 gz), `playtest` 1,748 KB (376 gz), `structured-effects` 260 KB (30 gz), `quick-duel-table` 56 KB,
`career-payroll` 52 KB, CSS `index` 601 KB (100 gz), 675 hashed WebP files, 3 woff2 (46 KB). Build takes 12 s.

| # | Finding | Impact | Effort | Risk | Evidence | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| L3 | The card catalog ships whole in the entry chunk: `cards.json` is 1.13 MB raw / 127 KB gz, of which `details` is 383 KB. Home, Search and the library need name, type, tags and art; the long `details`, `rulesText` and `flavorText` are only needed when a card opens | H | M | M | Source-map attribution: about 780 KB of the 1.46 MB entry chunk is catalog and rules JSON. `details` 383 KB, `rulesText` 58 KB, `flavorText` 32 KB of the raw file | Generate a slim index projection (id, name, type, subtype, tags, cost, art slug) for the entry, and load full records on demand (library page, inspector, Play). The generator already writes `app/data/`; `game:check` guards drift. Search ranking tests are needed first (see D3) |
| L4 | Rules JSON in the entry: `rules.json` (133 KB / 31 gz) and `rules-projection.json` (149 KB / 33 gz) are fully present in the entry chunk (78 of 80 sampled strings found), yet 7 of the exports of `canonical-presentation.ts` that derive from them are never imported (`CANONICAL_RULES_PROJECTION`, `PHASE_RULES`, `QUICKSTART_CANONICAL_SUMMARY`, ...) | M | S | L | Default-imported JSON cannot be tree-shaken per key | Delete the unused exports, then import the remaining data lazily with the Rules, Rulings and Play pages, or switch to named top-level imports so Vite can drop keys. About 60 KB gz |
| L5 | Hero and header art is far larger than it is shown: `full-rules-field-guide-v1` is 484 KB shown at 485x330 (1536x1024 source); the other page heroes are 290-340 KB | H | S | L (visual) | Rules page: 543 KB of images for 2 `<img>`. Re-encoding at 1000 px wide with Pillow gives 166 KB (rules), 117 KB (home), 121 KB (quickstart): about -65% | Add 1000 px derivatives (or `srcset` with 2 widths) for the 7 expo/field-guide images; keep originals as sources |
| L6 | Avatars are decoded from full 640x960 art: the header chip (30x30) downloads `honorable-trash-panda` at 71 KB **on every page**. The Settings avatar picker (27 images at 168x139) loads 2.6 MB of 3.1 MB total page weight, all at once. `loading="lazy"` does not help (tested): the whole grid is inside the browser's lazy-load margin | H | S | L | `#settings`: 27 images, 2,643 KB. A 96x144 thumbnail of the chip image is 5 KB (-93%); 160x240 is 9 KB | Commit small `-thumb` WebP derivatives (96 and 300 px wide) for the 21 roster avatars and use them in the chip, the picker, Home roster shelf (150x210 shown from 720x1080 at 55-77 KB each, 10 loaded) and Collection grid (131x196 from 720x1080) |
| L7 | Fighter illustrations and the Collection and Home shelves load 720x1080 art at 131-150 px wide (4.2-5.5x oversampled) | M | S | L | `#collection` 1.8 MB of images for 27 tiles; Home 685 KB for 12 images | Same derivative set as L6 |
| L8 | `public/downloads` (73 MB, 84 files) is copied into every Pages deploy, and nothing links to it: `DOWNLOADS` in `companion-app.tsx` is declared and never used (`tsc` flags it). It is 64% of the 114 MB `dist` | M | S | M (owner call) | `du`: dist 114 MB, dist/downloads 73 MB; `grep downloads/` finds only the dead constant | Either link a Downloads page, or move the ORA/zip sources to Releases and keep the 4 small documents. Needs an owner decision |
| L9 | CSS is one render-blocking 601 KB (100 KB gz) file: `playtest.css` alone is 379 KB raw, and it is unlayered with 962 `!important` (see C4). Lab-only rules (366 rules, 37 KB raw, in `globals.css`) ship to production although the Design Lab does not render there | M | M | M | Dead selectors are otherwise low (below). `quick-duel-table.css` already splits out | After the classic mat goes (C1), about 110 KB raw of `playtest.css` has no remaining user. Move `.lab-*` rules to a `design-lab.css` that only the dev-only lab imports (confirm Vite drops it in production) |
| L10 | Fonts are `font-display: swap` and small (46 KB), but not preloaded; the swap on a cold load was not measured | L | S | L | 3 woff2 in dist; no `<link rel="preload">` | Import the font URLs with `?url` and emit preload links, or accept the swap |
| L11 | The service worker never caches `assets/` (network only, by design, to avoid mixing chunk versions). Hashed files are content-addressed, so cache-first would be safe; today repeat visits depend on GitHub Pages' 10 minute cache | M | M | M | `public/sw.js` | Cache-first for `assets/*` with hash-named files and prune old entries on activate; gives instant repeat loads and an offline shell |
| L12 | Page-level image attributes: 29 `<img>` have no `loading`, 13 have `lazy`; the page hero image sets `fetchPriority="high"` | L | S | L | grep of `<img` in `app/*.tsx` | Fine as is for above-the-fold art. Add `loading="lazy"` to below-fold avatar/portrait lists only after L6 thumbs exist |
| L13 | `index.html` carries `Cache-Control/Pragma/Expires` `<meta http-equiv>` tags. Browsers ignore them; they do not control caching | L | S | L | HTML | Remove to avoid a false sense of cache control |

Measured fine: the Card Library is paged (PAGE_SIZE) with lazy images; `loading="lazy" decoding="async"` is on library tiles and
the home roster; the build is fast (12 s); structured effects are already their own lazy chunk; no duplicate assets (0 MD5
duplicate groups in `app/assets`); card art itself (550x750 WebP, about 45 KB) is reasonable.

Unreferenced art: 37 WebP files (3.7 MB, `app/assets/rules/chapter-*-v2`, old `header-*`, `hero-paper-fu*`, `brand-emblem`, a few
v1 starters) are imported by nothing and are not in `dist`. They cost clone size only. Left alone (an art library, not a runtime
cost). The 232 non-WebP files (67 MB of PNG/ORA sources under `app/assets/art/*/source|ready`) are repo weight, not shipped.

## 2. Runtime performance

| # | Finding | Impact | Effort | Risk | Evidence | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | **livePreviews is cheap; no change needed.** It already runs once per game tick (`useMemo(..., [tick])`), not per render. A turn's previews (one engine clone per hand Attack, three for Any-zone cards) cost p50 1.5-1.8 ms, p95 3.8-5.7 ms, max 14 ms on this machine; `cloneGame` is 0.4 ms (state about 13 KB plus a shared 1.2 MB rules blob that is not cloned); defence previews p95 1.4-2.6 ms | none | none | none | 20 Master and 8 Certified games profiled (`previewAttack` n=1,130 and 396). At a 4x slower CPU the worst case is about 60 ms once per turn | Leave. Incremental caching would add code for no visible gain |
| R2 | Engine hot paths are fast: a whole Master-difficulty game is 111 ms mean (164 ms p95); bot action p95 1.8 ms, bot choice p95 4.5 ms; `engine:simulate` runs 200 games with replay checks in 13 s (67 ms/game). The Master look-ahead (`difficulty.mjs`) is the only slow tail (max 15.6 ms per action) | none | none | none | profile script, see Method | Leave |
| R3 | Hand hover/selection re-renders the whole `QuickDuelTable` (about 770 lines, 460 DOM nodes, 7 hand cards). Measured cost is small: 21 hover moves = 18 ms of script at 1x (about 1 ms per move), 52 ms style recalculation (about 5 recalcs per move). Interaction latency does not scale with CPU throttle (1x to 6x all about 100 ms), so it is paint/transition-bound in software rendering rather than React-bound | L | M | L | CDP `Performance.getMetrics` over a hover sweep | No action. If a real-device profile shows jank, memoize `HandCard` (props are plain) and move hover state (`handOpen`) into the hand component so the table does not re-render |
| R4 | `legalFor(HUMAN)` and `coachLine(...)` run on every render, not per tick. Cheap at current size (bot `chooseAction` p50 0.01 ms) | L | S | L | profile above | If R3 is ever pursued, memoize them on `[tick]` like `previews` |
| R5 | Timers and listeners: all `addEventListener` sites are paired with removals, intervals are cleared; the one poll is the Play shell's rules manifest fetch every 60 s (aborts on unmount). The Design Lab confetti interval is cleared | none | none | none | grep audit of `addEventListener`, `setInterval`, `clearTimeout` | Leave. Optionally stop the 60 s poll while the tab is hidden |
| R6 | `src/playtest-vfx-runtime.ts` loads on every page from `index.html`, and monkey-patches the global `Storage.prototype.setItem/removeItem` to watch the Classic mat's `ddb-field-match` key. It serves only the Classic mat | M | S | M | `src/playtest-vfx-runtime.ts:215-245`; the shared-engine mat uses `ddb-engine-duel` and never triggers it | Retire with the Classic mat (C1). Until then load it only from the Play route |
| R7 | Long lists: the Card Library is paged; Search and Rulings render a few dozen rows. No unvirtualised long list found | none | none | none | routes swept | Leave |

## 3. Code health

| # | Finding | Impact | Effort | Risk | Evidence | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | **Classic mat retirement inventory.** `app/playtest.tsx` is 5,778 lines: `SetupView`, the `PlaytestView` component (lines 3044-5240, about 2,200 lines in one function), about 2,300 lines of rule helpers and the certification above it, and `runPlaytestRuntimeCertification` (line 2469). 61 further `app/*` files (about 11,500 lines: `stage3c-*`, `quick-duel-*-host`, `*-effect-resolvers`, `effect-resolvers-legacy`, `equipment-structured`, `character-runtime`, `combo-runtime`, `location-*`, `kata-*`, `boss-runtime`, `reaction-item-runtime`, `family-effect-runtime`, ...) are reachable only through `playtest.tsx`. Another 12 files under it are shared with the engine tables and must stay (`quick-duel-table`, `clash-table`, `engine-session`, `mat-view`, `belt-progress`, `career-payroll`, `payroll-reveal`, `card-motion`, `use-card-motion`, `scene-reveal`, `career-match`, `clash-engine`) | H | L | M | Import-graph walk from `src/main.tsx` with `playtest.tsx` blocked | **Still depends on it:** `npm run playtest:runtime` (part of `verify`, 907 route certification), `scripts/playtest-certification.mjs`, `scripts/workflow-check.mjs`, 11 `tests/quick-duel-*` and `structured-effects` tests (they import `playtest.tsx` or the host modules), `site-routing.test`, and the setup UI (`SetupView`, `HouseSettings`) which is also the entry to the shared-engine mat. **Safe order:** (1) move `SetupView`, `RosterRail`-free setup state and the engine/clash launchers into `play-setup.tsx` and `lazy` the classic match view only when `rulesEngine === "classic"`; (2) port the certification to `engine/behavioral-coverage.mjs` (`engine:behavior`); (3) delete the 61 files and their tests; (4) delete `rulesEngine` and the Classic option. Each step keeps `verify` green. Gain: Play route loses most of the 115 KB gz `playtest` chunk, about 110 KB raw CSS and 17k lines |
| C2 | Dead code with zero risk: 24 unused locals (`tsc --noUnusedLocals --noUnusedParameters`): `companion-app.tsx` (`ReactNode`, `createPortal`, `cardSearchText`, `publicCardDetails`, `DESKTOP_NAVIGATION`, `DOWNLOADS`, `mobileGlobalActiveDescendant`), `playtest.tsx` (`MobilePlaytestNotice`, `resolveAttackOption`), `quick-duel-table.tsx` (`selectedAttack`), `character-runtime.ts`, `effect-resolvers-legacy.ts` (13 parameters). 64 exports are referenced nowhere (not even tests), e.g. 11 `structuredLocation*Modifier` in `location-effect-resolvers.ts`, 7 in `canonical-presentation.ts`, 5 in `defense-effect-resolvers.ts`, 3 in `engine/core.mjs` (`createGame`, `isGameOver`, `getWinner`), `searchResultRank`, `activePageForRoute` | L | S | L | `tsc` and the export scan | Remove in one commit; `tsc` is the safety net. Turn on `noUnusedLocals` afterwards so it stays clean |
| C3 | Rule predicates are duplicated, including once in the UI: `isAttack`/`isDefense`/`coversZone` exist in `engine/core.mjs`, again in `engine/difficulty.mjs` (with a comment that it "mirrors the engine"), in `engine/character-abilities.mjs`, and `isAttackCard`/`isDefenseCard` in `app/quick-duel-table.tsx`. `num` is redefined in 5 files | M | S | L | grep | Export the three predicates from one engine module (e.g. `engine/card-facts.mjs`) and import them everywhere. This is exactly the drift the one-engine plan warns about |
| C4 | Cascade debt: `app/playtest.css` is 6,638 lines (379 KB), **unlayered** while `globals.css` declares `@layer reset, tokens, base, components, utilities, responsive`, so every playtest rule beats every layered token or component rule regardless of specificity; it has 962 `!important` (globals 17, inspector 23, quick-duel-hand 10). Dead class selectors are small: playtest.css 9 classes (57 rules, 7.6 KB), globals.css 14 (41 rules, 4.3 KB), inspector 1; the rest are built dynamically (`tone-${x}`) and are live | M | L | H | `cssdead` scan with template-prefix awareness | Do not hunt selectors yet. After C1, wrap the survivors in `@layer components`/`responsive` and delete `!important` in layers (each removal is a visual check in both themes). Until then new rules go in the layered files |
| C5 | The two stray large units: `CompanionApp` is one 360-line component (`companion-app.tsx:563-927`, 927-line file with very long JSX lines); `PlaytestView` is about 2,200 lines (C1). `stage3c*` names and `QUICK_DUEL_*` constants are development-stage leftovers (named in the one-engine plan) | M | M | M | line counts | Split `CompanionApp` into shell, header menu and route switch; rename only as part of C1 deletion |
| C6 | Unused dependencies: none found. `package.json` has 2 runtime deps (react, react-dom) and 5 dev deps; `@electron/packager` and `electron` are used by `desktop/` and the offline packager | none | none | none | package.json vs imports | Leave |
| C7 | `tsconfig` does not type `engine/*.mjs` (`allowJs: false`), so `app/engine-modules.d.ts` and `any` stand in. `previewAttack` results are `any` in `mat-view.ts` | L | M | L | tsconfig, `mat-view.ts` | Add `.d.ts` for `engine/preview.mjs` and `engine/difficulty.mjs`, or JSDoc plus `checkJs` on `engine/` |

## 4. Accessibility and robustness

| # | Finding | Impact | Effort | Risk | Evidence | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | **Done**, see top. Blocked storage blanked the whole site | H | S | L | measured | Add a Node test that stubs a throwing `localStorage` for `readInitialTheme` and `writeUserPreferences` (they import `avatar-catalog`, which imports WebP, so the test needs a small asset stub loader first) |
| A2 | **No app-level error boundary.** Only the Card Inspector has one. Any render error in any page or mat unmounts the whole tree to a blank page (seen during the storage test: after the Play route threw, every later hash stayed blank because the tree was dead) | H | S | L | `grep ErrorBoundary`: `card-inspector.tsx` only; reproduced | Add a small boundary around the route stage with a Paper-Fu "file jammed" panel, a Reload button and a link Home, and reset it on route change. For the mat, offer "Leave the mat" and keep the saved duel |
| A3 | Remaining storage sites are guarded by try/catch elsewhere (`career.ts`, `personal-record.ts`, `quickstart-setup.tsx`, `stale-build.ts`), so after A1 no unguarded access remains on the main paths. `design-lab.tsx:274` (`removeItem`) is dev-only | L | S | L | grep | Consider one shared `safeStorage` helper so new code cannot regress |
| A4 | Touch targets (44 px): mobile 390 px passes on Home, Cards, Search, Collection and Settings. Failures: Glossary A-Z jump buttons 40x44 (mobile) and 40x40 (desktop); inline `gloss-term` buttons in the rules text 45x29 and 53x29; Search chips 40 px high; Cards select filters 43 px and Play setup selects 34 px on desktop (inputs wrapped by larger labels are fine). Visually hidden Quickstart checkboxes report 1x1 but are driven by their label | M | S | L | headless sweep of 9 routes at 390 and 1280 px | Raise the A-Z buttons and search chips to `min-height: 44px; min-width: 44px`; give `gloss-term` a 44 px tap area with padding or `::after` hit slop |
| A5 | Reduced motion: `prefers-reduced-motion` appears 8 times in `globals.css` and 22 in `playtest.css`, plus the in-app Combat motion setting and `cardMotionDisabled`; the quick duel shortens bot delay to 150 ms and uses instant scroll | none | none | none | grep, code read | Leave. Verify the new scene-reveal and payroll animations in the reduced setting when touched |
| A6 | Hash routing is robust: bad card ids, chapters, terms, malformed percent escapes, `%00`, `#play/extra` and unknown pages never throw. Legacy `#playtest` rewrites to `#play`; `#lab` falls back to Home in production | none | none | none | 9 odd hashes tested | Leave. See P2 for the silent fallbacks |
| A7 | Stale-build recovery exists in three layers: build meta vs `build.json` check, `vite:preloadError` reload, and `lazyWithRetry`; the service worker excludes `build.json` and `assets/`. No gap found | none | none | none | `src/main.tsx`, `lazy-with-retry.tsx`, `sw.js`, `tests/stale-build.test.mjs` | Leave |
| A8 | Dialog focus: modals restore focus and trap Tab (companion menus, Play dialogs, scene reveal, Ascend desk, Card Inspector); search is a combobox; navigation uses `aria-current`; 20 live-region/status roles. No gap found by reading; no automated a11y test runs | L | M | L | code read | See D4 |

## 5. Developer experience

| # | Finding | Impact | Effort | Risk | Evidence | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | CI is fast: 75-90 s end to end for verify plus Pages upload on `main`; local `npm run verify` is 36 s (tests 28 s wall, 48 s CPU, build 12 s, `tsc` 10 s). No change needed. The upload step carries 114 MB (see L8) | none | none | none | recent workflow runs, local timing | Leave |
| D2 | `npm test` lists 42 test files by hand in one 1.3 KB `package.json` line; a new file that is not added silently never runs (all 42 present today). One file dominates: `engine-difficulty.test.mjs` takes 19.8 s of the 28 s wall (next: `engine-equipment-reactions` 4.7 s, `semantic-coverage` 3.6 s) | M | S | L | per-file timing; script diff | Use `node --test "tests/*.test.mjs"` (Node 22 globs) so files cannot be forgotten. Split `engine-difficulty` per level so it runs in parallel and cut wall time by about 12 s |
| D3 | Coverage gaps: no test for `app/search.ts` ranking (226 lines, drives the header search combobox), `user-preferences.ts` (storage and theme), `site-navigation.ts`, `card-library.tsx` filters, or any React component; no accessibility or visual regression check; `verify` never loads the built site in a browser | M | M | L | tests vs modules map | Add a Playwright smoke test (13 routes, light and dark, blocked storage, a started duel) run after `build`; it is the check this audit used. Add unit tests for `search.ts` before L3 |
| D4 | No automated a11y or contrast check although light and dark parity is a stated non-negotiable | M | M | L | none present | Add `axe-core` to the smoke test for both schemes |
| D5 | Docs drift: `docs/ENGINE-ARCHITECTURE.md` (last edited Sep 20) still calls `app/playtest.tsx` the Quick Duel host and says the CSS is "three application stylesheets" (there are 16, and the engine mat is the default); `docs/one-engine-plan.md` quotes `playtest.tsx` as 5,805 lines (now 5,778) and the Classic mat as the default; `docs/engine-parity-audit.md` pins line numbers to commit `25056d0` | L | S | L | read against code | Refresh when C1 lands; add this audit's chunking rule (no forced `playtest` group) to the architecture doc so L1 is not reintroduced |
| D6 | CI runs only `npm run verify`; `build:offline` / `package:offline` (the desktop package) are not exercised, so an offline-only break would not be caught | L | S | L | workflow file | Optional nightly job that runs `npm run build:offline` |

## 6. Player experience (noticed while reading and driving the site)

| # | Finding | Impact | Effort | Risk | Evidence | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Opening the duel shows the Scene reveal modal immediately; until dismissed it intercepts every pointer event (my first scripted clicks hung on it). Escape and the "Got it" button work, but a first-time player sees a full-screen card before seeing their own hand | L | S | L | scripted run | Fine as a ceremony; consider auto-dismiss after the card has flown on reduced motion, and keep focus on the button (already done) |
| P2 | Unknown pages, bad card ids and bad rule chapters fall back silently (Home, or the list with no dialog). A shared link to a retired card looks like nothing happened | M | S | L | 9 edge hashes | Show a toast or inline "That filing was not found" with a link to the library; correct the hash |
| P3 | Settings avatar picker downloads 2.6 MB on open (L6) | M | S | L | measured | Thumbnails |
| P4 | Blocked or full storage gives no feedback: progress silently does not save (`ddb-engine-duel`, career, binder) | M | S | L | A1 testing | Show one "This browser is not saving your progress" toast when the first write fails |
| P5 | Touch targets under 44 px on the Glossary index and Search chips (A4) | M | S | L | measured | See A4 |

## Do first (at most 10)

1. **Land L1 + L2** (done here): Home JS 511 to 311 KiB gzip. Zero behaviour change; verify green.
2. **Land A1** (done here): the site is blank for anyone with blocked storage. Then add the smoke test that proves it (D3).
3. **A2 root error boundary**: one component stops any future render error from blanking the site.
4. **L6/L7 thumbnails** for avatars and roster art: -65 KB on every page, -2 MB on Settings, -500 KB on Collection and Home. Small committed derivatives, no pipeline needed.
5. **L5 hero art at 1000 px**: about -65% of the largest first-view image on 7 pages.
6. **C2 dead code and `noUnusedLocals`**: one low-risk commit; includes the unused `DOWNLOADS` constant that is hiding L8.
7. **D2 glob the test list and split `engine-difficulty`**: cuts `npm test` wall time by about 12 s and removes the "forgot to register the test" trap.
8. **L3 slim catalog index** (after search tests): the largest remaining bundle win, about 100+ KB gzip off Home.
9. **C3 one source for card-kind predicates**: removes the rule duplicated in the UI and in three engine files.
10. **C1 Classic mat retirement, step 1** (extract setup, lazy the classic view): unlocks C4, L9, R6 and about 110 KB gzip on the Play route.

## Not implemented here, and why

- L3, L4: need search and catalog tests first, and touch the generated-data contract.
- L5-L7 (images): the derivatives change what players see (resampled art) and need an art owner's eye; the numbers above are from
  throwaway encodes with Pillow at quality 80, nothing was committed.
- L8: deleting or relocating 73 MB of downloads is an owner decision.
- L11: a caching change to the service worker deserves its own review.
- C1, C4: large and sequential; must keep `playtest:runtime` and the host tests green at each step.
- A2: small, but the recovery panel is a design piece (both themes) and should not be improvised.
- The unit test for A1: blocked by asset imports in `user-preferences.ts` under plain Node; the browser check is documented in D3.

## Method notes

Scripts used are throwaway (not committed): a gzip-aware static server plus Playwright for load, image and touch-target
sweeps; a CDP `Performance.getMetrics` delta around a scripted hover sweep; `engine/*` driven directly for clone, preview and
bot timings (Certified 8 games, Master 20 games); a regex import-graph walker; `tsc --noUnusedLocals --noUnusedParameters`.
Timings from a loopback server isolate parse and execute cost; real-network gains from the smaller transfer are larger than
the local timings show.
