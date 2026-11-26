# Packs, collections and Clearance Levels

Status: proposal, Nov 26, 2026. Nothing here is wired into gameplay or the UI yet. Owner decisions are
listed at the end, each with a recommendation.

The data proposal is `content/packs.json` (shape: `content/packs.schema.json`), checked by
`scripts/check-packs.mjs` (`npm run packs:check`, and `tests/packs-data.test.mjs` in `npm test`).

## Goals

1. New players start with a small, readable game and grow into the full 500-card catalog.
2. Winning (and, more slowly, losing) earns free booster packs. No money, no accounts, no server.
3. A career level track gives long-term goals and paces new content.
4. Matches stay fair. A veteran's collection must not beat a newcomer's by itself, and online
   lockstep PvP must agree on every card in play before the first shuffle.
5. Everything is data. A fork can redefine packs, rarities, earn rates and levels in one JSON
   file, or switch collections off.
6. Pack membership is easy to rebalance: move one line in `packs.json`. `cards.json` stays the printed
   catalog and is not bulk-edited.

## What the catalog already says about where a card comes from

`content/cards.json` has 597 cards. Every one is `availability: "Approved"`, `v2Status: "Approved"` and
`rulesVersion: "v2.3"`, so those fields carry no information about where a card comes from.

| `cardType` / `subtype` | `deck` | Cards | Used in a match as |
| --- | --- | ---: | --- |
| Technique / Attack | Technique Deck | 71 | Market |
| Technique / Defense | Technique Deck | 50 | Market |
| Technique / Kata | Technique Deck | 62 | Market |
| Item / Weapon | Item Deck | 65 | Market |
| Item / Consumable | Item Deck | 62 | Market |
| Item / Defense Equipment | Item Deck | 46 | Market |
| Item / Gear | Item Deck | 24 | Market |
| Item / Reaction Item | Item Deck | 12 | Market |
| Combo / Learned Combo | Combo Deck | 55 | shared Combo deck |
| Location / Location | Location Deck | 53 | shared Location deck |
| Starter / Starter | Starter Deck | 11 (15 copies) | every player's fixed starting deck |
| Character / Fighter | Character Deck | 41 | chosen fighters |
| Boss / Profile, Attack, Technique, Defense, Stage | Boss Profile / Arsenal / Materials | 45 | Boss Blitz only |

Fields that already describe origin or theme:

- **`deck`** decides the match zone. The engine builds the Market from `economy.market.decks`
  (`Technique Deck`, `Item Deck`), the Combo deck from `Combo Deck` and the scene deck from Locations.
  Everyone shares all of them, and every player starts with `definition.starterDeck`.
- **`catalogSystem.countedMainPool: 500`** is exactly Technique + Item + Combo + Location. It is the
  natural collectible set.
- **`lineage`** is set on only 66 cards: `Dojo Original` (all 41 Characters) and `Paper-Fu Original` (25,
  including 8 Boss Profiles). That is authorship, not distribution.
- **`sourceSheet`** (17 values such as `Techniques - Attack`, `Base 500 Growth`, `v2.0 Belt Support`)
  records which design spreadsheet a card came from. It is useful history but not a player-facing set.
- **`buildPaths`** (346 of 500 collectible cards have one to three): Fortress 90, Pressure 78, Combo 57,
  Momentum 54, Flow 52, Control 51, Arsenal 44, Counter 38, Economy 36, Sustain 20, Kata 19, Anti-Armor
  11, Deck-Thin 7, Catch-Up 6, Anti-Weapon 6, and a few singletons. These are the best theme signal and
  drive the booster themes below.
- **`tags`** (Kick, Guard, Flow, Weapon, Blade, Counter, ...) and **`category`** (Armor, Attack Chain,
  Street, Commercial, ...) refine themes and feed Combo requirements.
- `catalogId` prefixes (`ATK`, `DEF`, `KAT`, `WPN`, `CON`, `DEQ`, `GEA`, `RIT`, `CMB`, `LOC`) match the
  subtypes one to one and have stable numbers, which suits compact collection codes.

Nothing in the catalog says "starter pack", "booster", "rarity" or "owned". That is new data.

### Why pack membership lives in `packs.json`, not in each card

- **One place to rebalance.** Moving a card between packs or rarities is a one-line diff in one file. A
  per-card field spreads that decision over 500 records and invites merge conflicts with card redesigns.
- **The printed card should not change.** AGENTS.md treats `cards.json` as the printed catalog that is
  redesigned one card at a time. Distribution is a game-economy choice, not printed text.
- **Forks swap one file.** Different packs, or none, mean replacing `packs.json` and leaving the cards alone.
- **Lookups are still easy.** The generator can derive `catalogId → { pack, rarity }` into
  `app/data/packs.json` so the card inspector can show "Found in: Iron Wall · Brass Seal".

A per-card field would earn its place only if a **set symbol is printed on the card face**, as in printed
TCGs. That belongs to the Phase 2 card redesign. Even then the field should be generated from
`packs.json` and never hand-edited (see decision 15).

Each entry repeats the card name next to its `catalogId`. The checker fails if a name drifts from
`cards.json`, as it already does for `card-effects`. The names make rebalancing diffs readable.

## How a collection changes play

What you own has to affect matches, or packs mean nothing. The options:

| Option | Fair? | Lockstep PvP | Verdict |
| --- | --- | --- | --- |
| **A. Constructed starting decks**: build your 15-card deck from owned cards | No. Veterans start stronger, and it replaces the deckbuilding core. | Each deck goes into setup | Rejected |
| **B. Personal Markets**: each player buys only from their own pool | No. A bigger pool means better choices. | Needs per-seat Markets in the engine | Rejected |
| **C. Shared pool from the union of seated collections** | Yes. One Market row for everyone; your cards can be bought by your opponent too. | The union of both lists goes into setup | **Recommended** |
| D. Intersection of collections | Yes, but a newcomer shrinks a veteran's game to the smallest pool | Same as C | Rejected |
| E. Host's collection only | Fair, but a guest's progress never matters | Simple | Fallback for odd cases |
| F. Cosmetic only | Fair, but weak motivation | No effect | Rejected as the main model |

**Recommendation (C, "pooled dojo").** Each seated player's owned cards (the Starter Deck, the Orientation
Kit, their Starter Kit and every booster card they have opened) are merged into one Market pool, one
Combo pool and one Location pool for the match. Everyone draws from the same shared rows.

Why C works:

- **Fair.** Everyone shops from the same row, so a collection adds variety and themes, not power.
- **Lying gains nothing.** In PvP a player who claims to own everything only enlarges the shared pool
  for both sides. The open-table, no-anti-cheat stance of the PvP plan holds.
- **Lockstep-friendly.** The pool is a sorted list of catalog IDs (or a compact bitset) inside the match
  `setup`, hashed together with the seed. Replays, saves and spectators keep working, because setup plus
  moves is still the whole game.
- **Newcomers benefit.** Playing a veteran shows a newcomer cards they do not own yet: a preview, not a
  handicap.
- **No engine branching.** The engine just receives pools. It never learns about packs or owners.

Things to watch:

- **Dilution.** A full collection gives the same 392-card Market as today, so each card shows up less
  often. A later "Dojo Box" option could cap what you bring (for example "Orientation + up to three
  boosters"), but it stays off until simulations show a problem (decision 13).
- **Small pools.** A brand-new player brings about 97 Market cards (80 Orientation + 17 kit), 12 Combos
  and 11 Locations. The engine already reshuffles the Market discard when the deck runs out. The checker
  enforces a minimum starter pool (`collection.minimumStarterPool`): every subtype present, Attacks in
  High, Mid and Low, and Defenses covering every zone. The Purple exam (buy two different card types) and
  the Blue exam (two Equipment) can therefore always be completed.
- **Open Dojo.** Any table can switch to the full catalog. Open Dojo earns nothing, keeps today's
  behaviour for anyone who wants it, and is what tests and simulations use by default.

## Starter packs: what a new player owns

| Pack | Grant | Cards | Contents |
| --- | --- | ---: | --- |
| Starter Deck (existing) | always | 11 (15 copies) | Unchanged, from `definition.starterDeck` |
| **Orientation Kit** | every new profile | 100 | The most readable card of each kind: 16 Attacks (5 High, 5 Mid, 4 Low, 2 Any), 11 Defenses (3 Any plus each zone), 12 Katas, 12 Consumables, 12 Weapons, 9 Defense Equipment, 5 Gear, 3 Reaction Items, 10 Combos completable with these cards alone, 10 Locations |
| **Striker Kit** | choose one at level 1 | 20 | Pressure, Momentum, Anti-Armor, blades (6 Attacks, 4 Weapons) |
| **Guardian Kit** | choose one | 20 | Fortress, Counter, Sustain (4 Defenses, 4 Defense Equipment) |
| **Strategist Kit** | choose one | 20 | Flow, Kata, Economy, Control (5 Katas, 3 Consumables) |

The two kits you did not pick unlock at Clearance Levels 5 and 9. You choose which comes first. Every kit
is 20 cards, and the checker enforces equal size within a choice group, so no first choice is a trap.
Characters and Boss cards are not collectible (decision 3).

Orientation cards were picked by a simplicity score (short rules text, low cost, no Belt, Reversal or
Market dependencies), with the zone quotas above. Kit and booster cards were picked by theme affinity
(build paths, tags, category). The result is a proposal for the designer to adjust by hand.

## Booster packs

### Series (all free)

Eight themed series of 42 or 43 cards each, 340 cards in total. Each series has a balanced spread: about
5–6 Attacks, 4 Defenses, 5–6 Katas, 5–6 Consumables, 5–6 Weapons, 3–4 Defense Equipment, 1–2 Gear, 1
Reaction Item, 5 Combos and 5 Locations. The theme comes from which cards are picked, not from skewed
counts, so every series is playable on top of the Orientation Kit.

| Series | Unlocks at level | Cards | Theme |
| --- | ---: | ---: | --- |
| Iron Wall | 1 | 42 | Fortress, Sustain, Anti-Weapon: guards, armor, healing |
| Pressure Point | 1 | 43 | Pressure, Anti-Armor: heavy strikes, armor breakers |
| Flow State | 1 | 42 | Flow, Kata, Speed: spins, jumps, Flow chains |
| Back-Room Armory | 1 | 42 | Arsenal: traditional and improvised Weapons |
| Counter Culture | 4 | 43 | Counter: parries, dodges, Reaction Items |
| Stockroom Hustle | 6 | 43 | Economy, Deck-Thin: Focus, Market tricks, Consumables |
| Combo Theory | 8 | 42 | Combo, Momentum: chains, zone changes, finishers |
| Red Tape Riot | 10 | 43 | Control, Chaos: disruption, Belt Exam bureaucracy |

Every Combo in a pack must be completable from the Starter Deck, the Orientation Kit and that pack alone.
The checker evaluates each requirement with the engine's own `stepMatches` (now exported from
`engine/combo-runtime.mjs`), so a Combo never arrives without the cards that complete it.

### Opening a booster

- A **Booster Ticket** opens one pack from **any unlocked series you choose**. Choosing lets players
  chase a theme, and the randomness stays inside the pack.
- **5 cards per pack**, in slots: 2 Plain Paper; 1 Plain Paper (70%) or Carbon Copy (30%); 1 Carbon Copy;
  1 Brass Seal (75%) or Black Ink (25%).
- **Rarity tiers**: Plain Paper (common, 50% of each series), Carbon Copy (uncommon, 30%), Brass Seal
  (rare, 15%), Black Ink (legendary, 5%, two per series). Starter cards are "Issued" and never rolled.
  In a game with a shared Market, rarity sets **how soon** you find a card, not how strong it is. The
  tiers were assigned by a complexity percentile within each subtype, so commons are the cards a new
  player reads fastest.
- **Duplicates**: none. Ownership is binary (owning a card means it can appear), so a pack only rolls
  cards you do not own yet. If a slot's tier is used up in that series, the slot takes the nearest tier
  that still has cards, preferring the higher one. A series completes in 9 packs (8 full plus 1 partial).
- **Pity**: if you have not opened a Black Ink card from a series by its 5th pack, the seal slot gives one.
- **Completed series** cannot be chosen. Once the whole collection is complete, each further ticket
  becomes 50 Merit.
- **Seeded randomness.** Each profile gets a random seed when it is created. Pack *n* is rolled with the
  engine's `Rng` from (profile seed, *n*), and the result is saved **before** the reveal animation.
  Reloading never rerolls a pack, and any pack can be audited.

### Earning packs

| Event | Reward |
| --- | --- |
| Win | 1 Booster Ticket + 100 Merit |
| Loss | 1 Ticket Stub + 40 Merit (3 stubs = 1 ticket) |
| First win of the local day | +1 stub, +50 Merit |
| Every third win in a row | +2 stubs |
| Each in-match Belt promotion | +5 Merit |
| Win against Master difficulty | +1 stub |
| Difficulty Merit multiplier | Student ×0.75, Certified ×1, Master ×1.25 |

Eligibility: a match must reach 3 completed rounds to pay out, conceding earlier pays nothing, and each
match ID pays once. Open Dojo pays nothing, and local hot-seat pays Merit only (decision 11).

**Pacing.** Completing all 340 booster cards takes 68 packs. At a 50% win rate a match earns about 0.67
tickets on average, and the level track adds 36 tickets by level 30 (11 of them by level 10). The whole
collection lands at roughly **70–80 matches**, or 20–25 hours of Quick Duel, with all eight series open
by about match 30.

## Clearance Levels: the career track

In-match progression already uses **Belts**, **XP** and **Training Stripes**, which reset every match. The
career track uses different words so the two never blur:

- **Merit** is career experience. It is never called XP.
- **Clearance Level** runs from 1 to 30. It is shown on the Field Agent menu, which already frames the
  player as a "Field Agent".
- **Diplomas** are framed certificates on the dojo wall. They borrow the nine Belt colors in order (White
  Diploma at level 1, Gold at 3, Orange 6, Green 9, Purple 12, Blue 15, Red 19, Brown 23, Black 27). The
  UI shows a diploma frame, never a belt, so "Brown Diploma" cannot be mistaken for being Brown Belt in
  the current match. The checker requires every diploma to name a real belt id from `dojo-game.json`.

The curve: level 2 needs 150 Merit, and each level after that costs 25 more (level 10 at 2,250; level 30
at 14,500, about 200 average matches). After level 30, every 2,000 Merit gives a booster ticket
("Continuing Education").

Rewards by level (full list in `packs.json`):

| Level | Rewards |
| ---: | --- |
| 1 | Orientation Kit (profile creation), choose a Starter Kit, unlock 4 series, 1 ticket |
| 2–3 | 1 ticket each; carbon-copy card back at 3 |
| 4 | Unlock Counter Culture, 1 ticket |
| 5 | Second Starter Kit, 1 ticket |
| 6 | Unlock Stockroom Hustle, 1 ticket |
| 7 | 1 ticket, Orange Diploma mat frame |
| 8 | Unlock Combo Theory, 1 ticket |
| 9 | Third Starter Kit, 1 ticket |
| 10 | Unlock Red Tape Riot, 2 tickets, title "Certified Field Agent" |
| 11–29 | 1 ticket each; 2 tickets plus a card back at 15, 20 and 25 |
| 30 | 3 tickets, title "Licensed Black Diploma", Black Diploma mat frame |

Cosmetic ids (`card-back:*`, `mat-frame:*`, `title:*`) are placeholders until those cosmetics are
designed in both themes. Existing avatars stay unlocked; nothing players have today gets locked.

## Storage: localStorage, versioning, export, anti-loss

New key: `paper-fu-career-v1`, separate from `paper-fu-user-profile-v1` (preferences) and `dojo-binder-v1`
(saved favourites, which stays a wishlist and gains "owned" badges).

```jsonc
{
  "schema": 1,
  "profileId": "c0ffee…",            // random, for display and merge
  "createdAt": "2026-11-26T12:00:00Z",
  "packsRevision": "packs-proposal-2026-11-26", // the packs.json last reconciled against
  "rngSeed": 123456789,               // pack rolls: Rng(seed, packSerial)
  "packSerial": 7,
  "starterKits": ["kit-guardian"],
  "pendingKitChoices": 0,
  "opened": ["DDB-DEF-CORE-005", "…"], // booster cards only; starter grants are derived, not stored
  "wallet": { "booster-ticket": 1, "ticket-stub": 2 },
  "merit": 1340,
  "claimedLevels": [1, 2, 3, 4, 5],
  "pity": { "iron-wall": 3 },
  "streak": { "current": 2, "best": 5, "lastWinDay": "2026-11-26" },
  "stats": { "wins": 14, "losses": 9, "byMode": { "quick-duel": { "wins": 10, "losses": 6 } } },
  "receipts": [ { "matchId": "…", "mode": "quick-duel", "result": "win", "rewards": {…}, "at": "…" } ] // last 50, for idempotency
}
```

- **Derived ownership.** Owned = Starter Deck ∪ every-profile packs ∪ chosen kits ∪ `opened`. When
  `packs.json` moves a card between packs, nothing breaks, because ownership is by `catalogId`. A card
  newly added to the Orientation Kit is granted automatically. A card that leaves the catalog is ignored.
- **Versioning.** `schema` bumps get pure migration functions (`v1 → v2`), each tested. An unknown future
  schema is never overwritten; the app opens read-only and offers export.
- **Write-ahead rewards.** Match rewards and pack results are saved before any animation. A match pays
  out once per `matchId` (hash of setup and seed).
- **Backups.** After every successful write the previous good state goes to `paper-fu-career-v1-backup`.
  Every state carries a checksum, and if the primary fails to parse, the backup is restored with a toast.
- **Export code.** `PFC1.` + base64url(deflate-raw(JSON)) with a CRC32 suffix. `opened` is encoded as one
  bitset per catalog prefix (`ATK`, `DEF`, …) indexed by the stable catalog number, which keeps a full
  collection under about 150 characters. It is offered as copy text, a QR code and a "Download Dojo
  Record" `.json` file.
- **Import merges, never overwrites**: union of `opened` and kits, maximum of Merit, sum of unspent
  wallets only when the profile IDs differ (decision 14). Importing can never lose cards.
- **Persistence.** Call `navigator.storage.persist()` after the first pack. Prompt to export after the first
  pack and every 10 packs. Safari deletes script-written storage after 7 days without a visit unless the
  site is installed to the home screen, so the export nudge says so on iOS.
- **Trust model.** Anyone can edit their own localStorage. That is fine: a collection is personal progress,
  not a ranking, and under the pooled model an inflated collection gives no PvP advantage.

## How a forker defines their own packs

1. Edit `content/packs.json`: rename series, move `{ catalogId, name, rarity }` lines, change slots,
   earn rates or levels. Keep `$schema` so editors autocomplete.
2. Run `npm run packs:check`. It reports every unassigned, duplicated, unknown or renamed card,
   arithmetic that does not add up, a starter pool too thin to play, an uncompletable Combo, and track or
   earn rules that name a missing mode, belt, currency or pack.
3. To switch collections off, set `collection.enabled: false`. Every collectible card is then available
   to everyone and packs are ignored (the same as Open Dojo).
4. A forker adding new cards to `cards.json` must place them in a pack, or the check fails. That is
   deliberate, so a card is never silently unobtainable.

## Modes and tables

The pool is resolved before the match and passed into setup. Modes differ only in rewards.

| Mode | Pool | Rewards |
| --- | --- | --- |
| Quick Duel (vs bot) | Your collection; the bot shares it | Standard |
| Standard Clash 2–6 (bots) | Your collection | Winner takes the win reward; others take the loss reward plus 10 Merit per opponent beyond the first |
| Tag Team (incl. 2v2) | Union of human seats | Standard; both winning teammates earn the win |
| Boss Blitz solo / co-op | Union of human seats; Boss decks unaffected | Beating the Boss is a win; Merit ×1 / ×1.25 / ×1.5 for Rival / Mini-Boss / Final Boss |
| Online PvP (lockstep) | Union of both manifests | Standard, recorded by each browser for itself |
| Local hot-seat | This device's collection | Merit only |
| Open Dojo (any mode) | Full catalog | None |

**Lockstep setup.** During pairing each browser sends its collection manifest (the same bitset as the
export code, about 100 bytes) in the invite or reply code. Both compute
`resolveMatchPools(packs, cards, [manifestA, manifestB])`, which sorts and dedupes, so the order of
arrival does not matter. The resulting `pools` and the `packsRevision` go into `setup` and into the state
hash. If the two sides run different `packsRevision`s, they still agree, because the pools are explicit
catalog IDs; the hash catches any real mismatch as a "Paperwork Discrepancy".

## Implementation phases

Each phase ends green on `npm run verify`.

0. **Proposal (this change).** `content/packs.json`, its schema, `scripts/check-packs.mjs`,
   `tests/packs-data.test.mjs`, this plan. `stepMatches` is exported from `engine/combo-runtime.mjs` for
   the Combo check, with no behaviour change.
1. **Approve the data.** Settle the decisions below, adjust membership by hand, set `status: "approved"`.
   Register `content/packs.json` in `sourcePolicy.authoritativeFiles`, have `game:generate` emit
   `app/data/packs.json` (plus a `catalogId → pack/rarity` index), and extend `check-generated-game-data`
   to fail on drift. *Tests:* generated-equality, index completeness.
2. **Engine pools.** `Game` and `BossBlitzGame` accept `config.pools = { market, combo, location }` (catalog
   ID lists). When pools are absent, the full catalog is used, so simulations and the Quick Duel
   fingerprint do not move. Setup records the pools. A new pure, framework-free module
   `engine/collection.mjs` provides `ownedCards`, `resolveMatchPools`, `openBooster(packs, state, rng)`,
   `applyMatchResult(packs, state, receipt)` and `levelFor(merit)`. *Tests:* the fingerprint is unchanged
   without pools; pools restrict the decks; union is order-independent; replays carry pools; booster rolls
   are deterministic per seed and serial, never duplicate, fall back between tiers and honour pity; rewards
   are idempotent per match ID; level-ups grant exactly once. *Simulation:* add `--pool orientation`
   (and orientation + one kit) to `simulate` and `simulate:modes`; check game length, round-limit rate
   and win-rate spread against full-catalog runs.
3. **Career storage.** `app/career-store.ts`: schema v1, migrations, backup key, checksums, export/import
   codes, merge. All pure functions, tested in Node.
4. **Career UI** (both themes designed together, 44 px targets, reduced motion honoured): a Collection
   page behind the Field Agent menu (owned and unowned by series, binder favourites, "Found in"), the
   kit choice at onboarding, a pack-opening screen (instant reveal under reduced motion; haptics only as
   an extra), a level track with Diplomas, a post-match reward receipt, and the Career / Open Dojo toggle
   in match setup. The card inspector shows series and rarity.
5. **Gameplay wiring.** Pass pools into matches. This belongs on the engine-driven mat (One Engine
   phase 3), which keeps `app/playtest.tsx` out of it (decision 16).
6. **PvP.** Manifest exchange in the pairing codes; pools and `packsRevision` in setup and the state hash.
7. **Tuning.** Revisit earn rates, the curve and the Dojo Box cap from play data and simulations.

## Decisions for the owner

1. **Collection model.** *Recommend:* pooled dojo, a shared Market, Combo and Location pool built from the
   union of seated collections.
2. **Open Dojo.** *Recommend:* always one toggle away in match setup, earns nothing, used by tests and
   simulations. New profiles default to Career after onboarding.
3. **What is collectible.** *Recommend:* the 500-card main pool (Techniques, Items, Combos, Locations).
   The Starter Deck, all 41 Characters and the Boss cards stay free for everyone. Locking fighters would
   take away what players already enjoy, and Tag Team needs three.
4. **Starter packs.** *Recommend:* everyone gets the 100-card Orientation Kit and chooses one of three
   20-card Starter Kits; the other two arrive at levels 5 and 9.
5. **Booster structure.** *Recommend:* 8 themed series of about 42 cards, 5-card packs, and the player
   chooses which unlocked series to open with each ticket.
6. **Rarity.** *Recommend:* four tiers (Plain Paper 50%, Carbon Copy 30%, Brass Seal 15%, Black Ink 5%)
   that set discovery order, not power. Approve or rename the tier names.
7. **Duplicates.** *Recommend:* none (binary ownership); packs roll only unowned cards; a completed
   collection turns tickets into Merit.
8. **Earn rates.** *Recommend:* win = 1 ticket, loss = 1 stub (3 stubs = 1 ticket), plus small daily,
   streak and Master bonuses, aiming at about 75 matches to complete the collection.
9. **Career naming.** *Recommend:* Merit / Clearance Level / Diplomas in Belt colors, 30 levels. It never
   uses "Belt", "XP" or "Stripe".
10. **Series gating.** *Recommend:* 4 series open at level 1; Counter Culture, Stockroom Hustle, Combo
    Theory and Red Tape Riot unlock at levels 4, 6, 8 and 10.
11. **Rewards by table.** *Recommend:* bots and online PvP pay in full, hot-seat pays Merit only, Open Dojo
    pays nothing; a match needs 3 completed rounds; no anti-cheat.
12. **Characters and Bosses.** *Recommend:* keep them all available. If more track rewards are wanted
    later, add cosmetic fighter variants or a Boss-defeat stamp book rather than locks.
13. **Market dilution.** *Recommend:* start uncapped (bring everything you own); add an optional Dojo Box
    cap only if simulations or play show large collections play worse.
14. **Storage and recovery.** *Recommend:* localStorage with a backup key, `storage.persist()`, export
    codes, QR and file download, and merge-only import. No cloud sync, since the site has no server.
15. **Per-card set field.** *Recommend:* none now. If Phase 2 card redesign prints a set symbol, generate
    it from `packs.json` rather than authoring it in `cards.json`.
16. **When collections reach the mat.** *Recommend:* build data, engine pools, storage and the
    Collection page now, and switch real matches to Career pools once the mat runs on the engine (One
    Engine phase 3), instead of patching the market setup in `app/playtest.tsx`.
17. **Membership review.** *Recommend:* a designer pass over the proposed lists (especially the Orientation
    Kit and each series' two Black Ink cards) before setting `status: "approved"`.
