# Site experience plan: bring the Home energy to every page

Status: in progress, Nov 26, 2026. Presentation only. Card copy, rules text, canonical JSON, the engine
and the live game mats are untouched.

The Home page earns its energy from a stage: curtains, two fighters, a VS slam. The other pages should not
copy the stage. Each one gets the kind of delight that fits its job: a librarian's thrill for the Card
Library, a certified reader's pride for the Rules, a quick hit of clarity for the Glossary. The rule of
thumb is **one memorable moment per page, plus a handful of small rewards**, all in light and dark, all
44 px touch targets, all switched off or made instant under reduced motion.

Ideas are ranked by delight per effort: **A** is cheap and loud, **B** is worth it, **C** is a later bet.

## Survey (light and dark, 1440 / 820 / 390)

Every content page shares the same frame: a navy section header with a taped "visual evidence" photo,
then the page body on a paper desk. That frame is handsome but identical everywhere, so after the first
visit nothing on the page is new. Dark mode holds up on every page (graphite surfaces, warm ember and
brass). The Rules reader also re-mounted on every chapter and section click (the app shell keyed the
view on the section), which reset search and replayed the page entrance animation.

## Card Library (`#cards`)

**Job.** Browse 597 printed cards, open any one as a Dossier, save favourites to the Dojo Binder, and,
once Clearance Levels exist, see what you own and what you are chasing.

**Works.** Real printed art on every collectible card; a filter set that covers deck, subtype, timing and
cost; a Dossier with paging, keyboard arrows, a structured-effect breakdown and binder stars.

**Flat.** The page opens on a wall of 18 filter controls; there is no "start here". All cards look equally
important, nothing says where a card comes from, the binder has no moment when you save, the Dossier never
points you to another card, and the page cannot express "you do not own this yet".

| Rank | Idea | Notes |
| --- | --- | --- |
| A | **Card of the Day dossier** | A date-seeded featured card in an ink folder with a "Today's filing" stamp and one-click Dossier. Gives the page a front door. |
| A | **Rarity seals on every tile** | Plain Paper, Carbon Copy, Brass Seal and Black Ink from `content/packs.json`, drawn as paper primitives (plain tab, offset carbon, brass wax seal, black ink seal). Brass and Black Ink get a foil sheen on hover. |
| A | **"Filed" stamp moment** | Saving to the Binder thumps a FILED stamp onto the Dossier card; removing it shows a "withdrawn" ink mark. Instant under reduced motion. |
| A | **Collection ledger + series filters** | A ledger of the eight booster series and the starter kits with progress bars; clicking a series filters the grid. Rarity chips filter too. |
| B | **Sealed-envelope state (preview)** | Unowned cards render as sealed manila envelopes that still show name, series and rarity. Default is **Open Dojo** (everything owned, clearly labelled); a "Preview new recruit" toggle shows what a level-1 profile would see. Nothing is ever really locked. Ownership is read from one module (`app/collection.ts`) so it can be wired to the career store later. |
| B | **Related filings in the Dossier** | Up to six cards that share a series, build path or tag, as clickable thumbnails. |
| B | **Dossier provenance strip** | "Found in Iron Wall · Brass Seal" plus owned/sealed status. |
| B | **Pull a random file** | A shuffle button that opens a random card in the current filter. |
| C | Card back flip on first open, booster-opening preview, binder export as a printable contact sheet. |

## Full Rules (`#rules`)

**Job.** Teach and settle the game: read a chapter start to finish, or jump straight to the paragraph that
ends an argument.

**Works.** Sixteen focused chapters, search across all of them, a chapter index and section list, mobile
chapter picker, mobile tables that reflow into cards.

**Flat / broken.** The desktop chapter index is not sticky (a later `@layer responsive` rule resets it to
`position: static`); the "In this chapter" list squeezes titles into a 26 px column so they wrap one word
per line; desktop shows the section list twice. Search lands on a section, not the paragraph. Callouts
("FLOW", "FINAL COMBAT FORMULA", "RULE PRIORITY") lose their title line. There is no sense of progress
through a 16-chapter manual and no reward for finishing.

| Rank | Idea | Notes |
| --- | --- | --- |
| A | **Fix the reader chrome** | Sticky index, readable section list, no duplicate list on desktop, a manual progress meter. |
| A | **Certified Reader stamps** | Reaching the end of a chapter stamps it CERTIFIED in the index and footer (saved on this device). All sixteen earn a "Licensed Rules Lawyer" notice. |
| A | **Department Notice callouts** | Single-cell rule tables render as stamped notices with their title split out (FLOW, ANTI-LOOP RULE, ENRAGED...). Examples render as an "Official Example · Exhibit" clipboard. |
| A | **Search to the paragraph** | Results show the matching sentence with the term highlighted; opening one scrolls to that paragraph and marks it briefly. |
| B | **Inline glossary hovercards** | The first use of a defined term in each section becomes a dotted-underlined button; hover, focus or tap opens its definition with a link to the Glossary. Escape closes. |
| B | **Pocket reference cards** | Tear-off cards for H.I.Y.A.H. phases, the combat formula, rule priority and the Golden Rule, built from `canonical-presentation.ts`. |
| B | **Copy link to section** | A pilcrow button on each section heading copies its permalink with a toast. |
| C | Reading time per chapter, "previous chapter" in the footer, printable chapter sheets. |

## Glossary (`#glossary`)

**Job.** Look up a defined term fast.
**Flat.** 57 identical tiles; numbering by index is meaningless; the Dossier modal repeats the tile.

| Rank | Idea |
| --- | --- |
| A | A–Z letter rail that jumps and shows which letters have terms. |
| A | "Term of the day" index card and a "used in N rules sections" count that links into the Rules reader. |
| B | Tiles as index cards with a tab per letter; the modal lists the rule sections that use the term (search-to-paragraph). |
| B | Related terms (terms mentioned inside the definition) as chips. |

## Quick Start (`#quickstart`)

**Job.** Get a table playing in ten minutes.
**Works.** Strong hero, four mode cards, starter deck lesson, combat example.
| Rank | Idea |
| --- | --- |
| A | A checklist you can tick (setup steps) with a "Table ready" stamp when every box is checked. |
| B | Combat example as a step-through "replay" (Attack Power, then Defense, then result) with the numbers counting up. |
| B | A round timeline (H, I, Y, A, H) you can step through. |

## Backstory (`#story`)

**Job.** Sell the world and the tone.
| Rank | Idea |
| --- | --- |
| A | Case-file framing: redacted words that reveal on hover/focus, "Exhibit" stamps on each panel. |
| B | A scroll-linked timeline of the Department's incidents. |

## Rulings & Variants (`#rulings`)

**Job.** Settle disputes; offer optional house rules.
| Rank | Idea |
| --- | --- |
| A | Each official ruling as a numbered docket slip with "Filed" date stamp; house rules with a "supported in Quick Duel" seal. |
| B | "Settle a dispute" flow: pick a topic chip, see the two or three rulings that apply. |

## Search (`#search`) and Settings (behind the Field Agent menu)

Search already has a strong hero. **A:** recent searches as paper tabs, and a "Try: Flow, Reversal,
Brass Seal" suggestion row. Settings: **A:** a live "ID badge" preview that updates as you choose name,
avatar and accent; **B:** a "certified" stamp when a preference saves.

## Play (`#playtest`) setup

The live mats are out of scope here (other work owns them). The setup screen could later borrow the
Home VS card for the chosen fighters.

## Build order

1. Card Library (this change set): collection module, rarity seals, ledger and series filters, preview
   sealed envelopes, Card of the Day, Dossier provenance, related filings and the Filed stamp.
2. Full Rules: reader chrome fixes, Certified Reader stamps, notices and exhibits, paragraph search,
   glossary hovercards, pocket reference, section permalinks.
3. Glossary, then Quick Start, Rulings, Story, Search and Settings in that order.

## Decisions for the owner

1. **Rarity art.** The four seals are drawn in CSS from existing tokens. Approve them, or commission
   illustrated seals for Phase 2 card faces.
2. **Preview toggle.** The "Preview new recruit" toggle shows sealed envelopes before progression exists.
   Keep it public as a teaser, or hide it until Clearance Levels ship.
3. **Card of the Day.** Seeded by the local date across the whole catalog (Characters and Bosses
   included). Restrict it to collectible cards if preferred.
4. **Glossary hovercards.** Which terms are too common to underline (the current skip list is Attack,
   Defense, Damage, Draw, Discard, Round, Hit, Printed, Ready, Slot, Tag, Combo, Equip, Equipment, Destroy).
