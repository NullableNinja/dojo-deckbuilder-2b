# Packs, collections and Clearance Levels

Status: **approved** (owner answers of Nov 27, 2026). Nothing is wired into gameplay or the UI yet; the
implementation phases are at the end. The owner asked for small decisions to be made here rather than
sent back, so the final section lists what was decided and why, and no open questions remain.

The data is `content/packs.json` (shape: `content/packs.schema.json`), checked by
`scripts/check-packs.mjs` (`npm run packs:check`, and `tests/packs-data.test.mjs` in `npm test`).

## Goals

1. New players start with a small, readable game and grow into the full 500-card catalog.
2. Playing earns free booster packs. **Nothing ever costs money.** There are no accounts and no server.
3. Not everything is available on day one. New **Characters** and new **Bosses** arrive over time, so
   there is always a new fighter to try and a new challenge to beat.
4. The collection is about fun. There are no rarities and no duplicates, and every pack holds only cards
   you do not own yet.
5. Matches stay fair. A veteran's collection must not beat a newcomer's by itself, and online
   lockstep PvP must agree on every card in play before the first shuffle.
6. Everything is data. A fork can redefine packs, unlocks, earn rates and levels in one JSON file, or
   unlock everything with one switch (`"unlockEverything": true`).
7. Pack membership is easy to rebalance: move one line in `packs.json`. `cards.json` stays the printed
   catalog and is not bulk-edited.

## What is Merit?

Merit is your career score across all matches you play. You earn it at the end of every match that
counts: 100 for a win and 40 for a loss. Small bonuses add to it: 50 for your first win of the day, and 5
for each Belt promotion during the match. Harder computer opponents pay a little more and easier ones a
little less, and Boss Blitz pays more the further up the Boss ladder you get. Merit is never spent and
never resets. As it adds up it raises your Clearance Level from 1 to 30. Each new level hands out
rewards: Booster Tickets, new booster series to open, your other Starter Kits, new playable
Characters, new Bosses to fight, and cosmetics such as card backs, mat frames and titles. Merit is not
the XP you earn inside a match. That XP pays for Belt promotions and starts again at zero every match.

## What the catalog already says about where a card comes from

`content/cards.json` has 597 cards. Every one is `availability: "Approved"`, `v2Status: "Approved"` and
`rulesVersion: "v2.3"`, so those fields carry no information about where a card comes from.

| `cardType` / `subtype` | `deck` | Cards | Used in a match as | In this plan |
| --- | --- | ---: | --- | --- |
| Technique / Attack, Defense, Kata | Technique Deck | 71 / 50 / 62 | Market | collectible |
| Item / Weapon, Consumable, Defense Equipment, Gear, Reaction Item | Item Deck | 65 / 62 / 46 / 24 / 12 | Market | collectible |
| Combo / Learned Combo | Combo Deck | 55 | shared Combo deck | collectible |
| Location | Location Deck | 53 | shared Location deck | collectible |
| Starter | Starter Deck | 11 (15 copies) | every player's starting deck | always available |
| Character / Fighter | Character Deck | 41 | chosen fighters | 12 starting, 29 unlockable |
| Boss / Profile | Boss Profile Deck | 10 | Boss Blitz opponents | 5 starting, 5 unlockable |
| Boss / Attack, Technique, Defense, Stage | Boss Arsenal Deck, Boss Materials | 35 | the Boss's own deck | always available |

Fields that already describe origin or theme:

- **`deck`** decides the match zone. The engine builds the Market from `economy.market.decks`
  (`Technique Deck`, `Item Deck`), the Combo deck from `Combo Deck` and the scene deck from Locations.
  Today everyone shares all of them.
- **`catalogSystem.countedMainPool: 500`** is exactly Technique + Item + Combo + Location, the
  collectible set.
- **`lineage`** (`Dojo Original` for all 41 Characters; `Paper-Fu Original` on 25 cards) records
  authorship. **`sourceSheet`** records which design spreadsheet a card came from. Neither says where a
  player gets the card.
- **`buildPaths`** (346 of 500 collectible cards have one to three: Fortress 90, Pressure 78, Combo 57,
  Momentum 54, Flow 52, Control 51, Arsenal 44, Counter 38, Economy 36, Sustain 20, Kata 19, ...),
  **`tags`** and **`category`** are the theme signals behind the booster series.
- **Boss Profile tags** carry their Stage Fit (`Rival`, `Mini-Boss`, `Final Boss`), which matches
  `boss.stages[].stageFit` in `dojo-game.json`. The checker uses this to prove the starting Bosses can
  fill the whole ladder.

### Why membership and unlocks live in `packs.json`, not in each card

- **One place to rebalance.** Moving a card between packs, or a Character to another level, is a
  one-line diff in one file, with no merge conflicts against card redesigns.
- **The printed card does not change.** `cards.json` is the printed catalog, redesigned one card at a
  time. How a player gets a card is a game-economy choice, not printed text.
- **Forks swap or switch off one file.** `"unlockEverything": true` makes every card, Character and Boss
  available, with no packs.
- **Lookups stay easy.** The generator can derive `catalogId → { pack }` and `catalogId → { unlock }`
  into `app/data/packs.json`, so the card inspector can show "Found in: Iron Wall" or "Unlocks at
  Clearance Level 12".

Each entry repeats the card name next to its `catalogId`, and the checker fails if a name drifts from
`cards.json`, which keeps diffs readable.

## How a collection changes play

| Option | Fair? | Lockstep PvP | Verdict |
| --- | --- | --- | --- |
| Constructed starting decks from owned cards | No; veterans start stronger, and it replaces the deckbuilding core | Each deck in setup | Rejected |
| Personal Markets (each buys from their own pool) | No; a bigger pool means better choices | Per-seat Markets in the engine | Rejected |
| **Shared pool: union of everyone's collection** | Yes; one Market row for all | The union goes into setup | **Approved** |
| Intersection of collections | Yes, but the newest player shrinks everyone's game | Same | Rejected |
| Host's collection only | Fair, but a guest's progress never matters | Simple | Rejected |

**Approved model ("pooled dojo").** Each seated player's owned cards are merged into one Market pool,
one Combo pool and one Location pool for the match, and everyone draws from the same rows.

- **Fair.** Everyone shops from the same row, so a collection adds variety, not power.
- **Lying gains nothing.** In PvP, claiming to own everything only enlarges the shared pool for both
  players. This matches the open-table, no-anti-cheat stance of the PvP plan.
- **Lockstep-friendly.** The pool is a sorted list of catalog IDs inside the match `setup`, hashed
  together with the seed. Replays, saves and spectators keep working.
- **Newcomers benefit.** Playing a veteran previews cards the newcomer does not own yet.
- **Starter pool health.** A new player brings about 97 Market cards, 12 Combos and 11 Locations. The
  checker enforces `collection.minimumStarterPool`: every subtype is present, Attacks reach High, Mid and
  Low, and Defenses cover every zone, so every Belt exam can still be completed.
- **Open Dojo** switches any table to the full catalog. It earns nothing and is the default for tests and
  simulations.

Characters and Bosses work differently from cards: they are a **personal roster**, not a pool. You
choose fighters only from your own unlocked Characters (in PvP each player picks from their own).
Computer opponents may field any Character, which also previews what is coming (decided below).
Boss Blitz draws Bosses from the unlocked Bosses of the humans at the table (the union, as with cards).

## Starter packs: what a new player owns

| Pack | Grant | Cards | Contents |
| --- | --- | ---: | --- |
| Starter Deck (existing) | always | 11 (15 copies) | Unchanged |
| **Orientation Kit** | every new profile | 100 | The most readable card of each kind: 16 Attacks (5 High, 5 Mid, 4 Low, 2 Any), 11 Defenses, 12 Katas, 12 Consumables, 12 Weapons, 9 Defense Equipment, 5 Gear, 3 Reaction Items, 10 Combos completable with these cards alone, 10 Locations |
| **Striker Kit** | choose one at level 1 | 20 | Pressure, Momentum, Anti-Armor, blades |
| **Guardian Kit** | choose one | 20 | Fortress, Counter, Sustain |
| **Strategist Kit** | choose one | 20 | Flow, Kata, Economy, Control |

The other two kits unlock at Clearance Levels 5 and 9, in the order you choose. The checker enforces
equal kit sizes, so no first choice is a trap.

## Booster packs

### Series

Eight themed series of 42 or 43 cards (340 in total), each with a balanced spread: about 5–6 Attacks,
4 Defenses, 5–6 Katas, 5–6 Consumables, 5–6 Weapons, 3–4 Defense Equipment, 1–2 Gear, 1 Reaction Item,
5 Combos and 5 Locations. Completing a series also unlocks its featured Character.

| Series | Opens at level | Cards | Theme | Complete it to unlock |
| --- | ---: | ---: | --- | --- |
| Iron Wall | 1 | 42 | Fortress, Sustain: guards, armor, healing | Mr. Clip |
| Pressure Point | 1 | 43 | Pressure, Anti-Armor: heavy strikes | The Nerfhammer |
| Flow State | 1 | 42 | Flow, Kata, Speed: spins and jumps | Whirlwind Wynn |
| Back-Room Armory | 1 | 42 | Arsenal: traditional and improvised Weapons | The Rebooter |
| Counter Culture | 4 | 43 | Counter: parries, dodges, Reaction Items | Wavey Davey |
| Stockroom Hustle | 6 | 43 | Economy, Deck-Thin: Focus and Market tricks | Master Bento Blitz |
| Combo Theory | 8 | 42 | Combo, Momentum: chains and finishers | Tia Three Gates |
| Red Tape Riot | 10 | 43 | Control, Chaos: disruption and Belt Exam bureaucracy | The Belt Collector |

Every Combo in a pack must be completable from the Starter Deck, the Orientation Kit and that pack alone.
The checker evaluates each requirement with the engine's own `stepMatches`
(`engine/combo-runtime.mjs`).

### Opening a booster

- A **Booster Ticket** opens one 5-card pack from **any unlocked series you choose**.
- **Only new cards.** A pack holds 5 cards you do not own yet, drawn at random from that series. There
  are no duplicates and no rarities. A series' last pack holds whatever is left (2 or 3 cards), so each
  series takes 9 packs.
- A **completed series** cannot be chosen. Once the whole collection is complete, each further ticket
  becomes 50 Merit.
- **Seeded randomness.** Each profile gets a random seed at creation. Pack *n* is rolled with the
  engine's `Rng` from (profile seed, *n*), and the result is saved before the reveal animation, so
  reloading never rerolls a pack.

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

A match must reach 3 completed rounds to pay, conceding earlier pays nothing, and each match ID pays
once.

**Pacing.** All 340 booster cards take 68 packs. At a 50% win rate a match averages about 0.67 tickets,
and the level track adds 36 tickets by level 30 (11 by level 10). The full card collection lands at
roughly **70–80 matches**, with all eight series open by about match 30.

## Characters and Bosses: unlocked over time

### Characters

**12 available from the start**, chosen for clear abilities and a spread of stat lines: four
strikers, four guardians and four speed or tactics fighters, one group for each Starter Kit style. Twelve
covers a Tag Team roster of three with plenty of choice, and any number of Clash seats (fighters may
repeat across seats).

| Style | Starting Characters |
| --- | --- |
| Striker (ATK 4 or Attack-focused) | Karatesaurus, Knuckleton the Brawler, Gramma Uppercut, Punchline Pete |
| Guardian (DEF 4) | Auntie Parry, Sentry Bobby, Crash Test Dummy, Honorable Trash Panda |
| Speed / tactics | Paper Crane, Disco Dojo Dan, Coupon Carl, Sir Kixalot |

**29 unlockable.** 21 arrive one per Clearance Level from 2 to 22, roughly from the simplest ability to
the most involved. 8 are series-completion rewards (table above).

| Level | Character | Level | Character | Level | Character |
| ---: | --- | ---: | --- | ---: | --- |
| 2 | El Pollo Rojo | 9 | Custodian Kwon | 16 | Librarian Lin |
| 3 | Glitterpunch | 10 | Ink Fist | 17 | Blurred Monk |
| 4 | Margo Two-Forms | 11 | Doodle Bopper | 18 | Venue Val |
| 5 | Flaming Monk Dude Broski | 12 | Sensei Ducktape | 19 | Janitor Joe |
| 6 | Late Bell Lee | 13 | Boo-Fu | 20 | Three Squirrels in One Gi |
| 7 | Ronin Reroll | 14 | Some guy named Steve | 21 | Coach Karen |
| 8 | Baron von Backflip | 15 | Miss Direction | 22 | Master Mimen |

Profile avatars are separate cosmetics and stay unlocked, so nothing players have today is taken away.

### Bosses

Boss Blitz climbs Rival → Mini-Boss → Final Boss and needs a different Boss Profile at each stage, picked
by Stage Fit.

**5 available from the start:** Captain Cone and Snack-Fu 5000 (Rival), Sister Cinder and Lord
Leasehold (Mini-Boss), and The Warranty Void (Final Boss). That fills every stage with two choices for
the first two, and the checker proves a distinct assignment exists.

**5 unlockable,** each a new challenge, mostly at the top of the ladder:

| Level | Boss | Stage Fit |
| ---: | --- | --- |
| 3 | Director Clipwell and the Three Staplers of Doom | Rival or Mini-Boss |
| 6 | Chief Inspector Buffer, Keeper of the Wet Floor | Rival or Mini-Boss |
| 9 | Chairman Foldwell, Supreme Director of Seating | Final Boss |
| 13 | Madam Misdemeanor, Leaseholder of the Unlicensed Trolley | Final Boss |
| 17 | Archive of Practical Fighting Wisdom, Now Upright | Mini-Boss or Final Boss |

Boss Arsenal and Stage cards are the Boss's own deck and are always available.

### How it is modelled and checked

`packs.json` has `unlockables.characters.starting` and `unlockables.bosses.starting`. Every other
Character or Boss Profile is unlocked by exactly one reward: `{ "kind": "unlock-character" | "unlock-boss",
"catalogId", "name" }` on a Clearance Level, or as a booster's `completionReward`. The checker fails if:

- a Character or Boss Profile is neither starting nor unlocked, or is made available twice;
- an unlock names a card from the wrong deck, or a name drifts from `cards.json`;
- the starting Characters are fewer than the largest roster in any mode (3, for Tag Team);
- the starting Bosses cannot fill every Boss Blitz stage with a different profile.

`"unlockEverything": true` skips all of this and makes every card, Character and Boss available. That
is the single data change a forker needs.

## Clearance Levels: the career track

In-match progression uses **Belts**, **XP** and **Training Stripes**, which reset every match. The career
track uses different words so the two never blur: **Merit** (above), **Clearance Level** 1–30 (shown on
the Field Agent menu), and **Diplomas**. Diplomas are framed certificates in the nine Belt colors,
starting with White Diploma at level 1, then Gold at 3, Orange 6, Green 9, Purple 12, Blue 15, Red 19,
Brown 23 and Black 27. The UI shows a diploma frame, never a belt, so a Brown Diploma is never mistaken
for Brown Belt in the current match.

The curve: level 2 needs 150 Merit, and each level after costs 25 more (level 10 at 2,250; level 22 at
8,400; level 30 at 14,500). After level 30, every 2,000 Merit gives a ticket.

| Level | Rewards (plus the Character in the table above) |
| ---: | --- |
| 1 | Orientation Kit at profile creation, choose a Starter Kit, 4 series open, 1 ticket |
| 2–3 | 1 ticket each; Boss Clipwell and a card back at 3 |
| 4 | Counter Culture opens, 1 ticket |
| 5 | Second Starter Kit, 1 ticket |
| 6 | Stockroom Hustle opens, Boss Buffer, 1 ticket |
| 7 | 1 ticket, Orange Diploma mat frame |
| 8 | Combo Theory opens, 1 ticket |
| 9 | Third Starter Kit, Boss Foldwell, 1 ticket |
| 10 | Red Tape Riot opens, 2 tickets, title "Certified Field Agent" |
| 11–29 | 1 ticket each; Bosses at 13 and 17; 2 tickets and a card back at 15, 20 and 25 |
| 30 | 3 tickets, title "Licensed Black Diploma", Black Diploma mat frame |

Cosmetic ids (`card-back:*`, `mat-frame:*`, `title:*`) are placeholders until the cosmetics are designed
in both themes.

## Storage: localStorage, versioning, export, anti-loss

New key: `paper-fu-career-v1`, separate from `paper-fu-user-profile-v1` (preferences) and `dojo-binder-v1`
(saved favourites, which gains "owned" badges).

```jsonc
{
  "schema": 1,
  "profileId": "c0ffee…",
  "createdAt": "2026-11-27T12:00:00Z",
  "packsRevision": "packs-2026-11-27",
  "rngSeed": 123456789,              // pack rolls: Rng(seed, packSerial)
  "packSerial": 7,
  "starterKits": ["kit-guardian"],
  "pendingKitChoices": 0,
  "opened": ["DDB-DEF-CORE-005", "…"], // booster cards only
  "wallet": { "booster-ticket": 1, "ticket-stub": 2 },
  "merit": 1340,
  "claimedLevels": [1, 2, 3, 4, 5],
  "claimedSeriesRewards": ["iron-wall"],
  "streak": { "current": 2, "best": 5, "lastWinDay": "2026-11-27" },
  "stats": { "wins": 14, "losses": 9, "byMode": { "quick-duel": { "wins": 10, "losses": 6 } } },
  "receipts": [ { "matchId": "…", "mode": "quick-duel", "result": "win", "rewards": {…}, "at": "…" } ]
}
```

- **Derived ownership and unlocks.** Owned cards = Starter Deck ∪ Orientation Kit ∪ chosen kits ∪
  `opened`. Unlocked Characters and Bosses = starting ∪ rewards of every level up to the current one ∪
  rewards of completed series. None of these are stored, so when `packs.json` moves a card or a
  Character, saves follow automatically. Only choices (kits) and random results (`opened`) are stored.
- **Versioning.** `schema` bumps get pure, tested migration functions. An unknown future schema is never
  overwritten; the app opens read-only and offers export.
- **Write-ahead rewards.** Match rewards and pack results are saved before any animation, and each
  `matchId` pays once.
- **Backups.** The previous good state goes to `paper-fu-career-v1-backup` after every write, with a
  checksum. A corrupt primary is restored from the backup with a toast.
- **Export code.** `PFC1.` + base64url(deflate-raw(JSON)) with a CRC32 suffix. `opened` is encoded as one
  bitset per catalog prefix, which keeps a full collection under about 150 characters. Offered as copy
  text, a QR code and a "Download Dojo Record" `.json` file.
- **Import merges, never overwrites**: union of `opened` and kits, the higher Merit, and unspent wallets
  added together only when the profile IDs differ. Importing can never lose progress.
- **Persistence.** Call `navigator.storage.persist()` after the first pack. Prompt to export after the first
  pack and every 10 packs. Safari deletes script-written storage after 7 days without a visit unless the
  site is installed to the home screen, so the iOS prompt says so.
- **Trust model.** Anyone can edit their own localStorage. A collection is personal progress, not a
  ranking, and under the pooled model it gives no PvP advantage.

## How a forker defines their own packs

1. Edit `content/packs.json`: rename series, move `{ catalogId, name }` lines between packs, change which
   Characters and Bosses start unlocked, move unlock rewards between levels, change earn rates or the
   curve.
2. Run `npm run packs:check`. It reports unassigned, duplicated, unknown or renamed cards; a starter pool
   too thin to play; an uncompletable Combo; Characters or Bosses that are never unlocked; a starting
   roster that cannot play a mode; and earn rules or rewards that name a missing mode, belt, currency or
   pack.
3. To skip progression entirely, set `"unlockEverything": true`.
4. New cards added to `cards.json` must be placed in a pack (and new Characters or Bosses given an unlock),
   or the check fails, so nothing is silently unobtainable.

## Modes and tables

| Mode | Card pool | Fighters / Bosses | Rewards |
| --- | --- | --- | --- |
| Quick Duel (vs computer) | Your collection | You: your unlocked Characters; computer: any | Standard |
| Standard Clash 2–6 | Your collection | Same | Winner takes the win reward; others take the loss reward plus 10 Merit per opponent beyond the first |
| Tag Team (incl. 2v2) | Union of human seats | Three from your unlocked Characters | Standard; both winning teammates earn the win |
| Boss Blitz solo / co-op | Union of human seats | Bosses from the union of your unlocked Bosses | Beating the Boss is a win; Merit ×1 / ×1.25 / ×1.5 for Rival / Mini-Boss / Final Boss |
| Online PvP (lockstep) | Union of both manifests | Each player from their own unlocks | Standard, recorded by each browser |
| Local hot-seat | This device's collection | This device's unlocks | Merit only |
| Open Dojo (any mode) | Full catalog | Everything | None |

**Lockstep setup.** During pairing each browser sends its manifest (owned-card bitset plus unlocked
Boss list, about 100 bytes) in the invite or reply code. Both compute
`resolveMatchPools(packs, cards, [manifestA, manifestB])`, which sorts and dedupes, so arrival order does
not matter. The pools, the chosen rosters and `packsRevision` go into `setup` and the state hash. A real
mismatch shows as a "Paperwork Discrepancy".

## Implementation phases

Each phase ends green on `npm run verify`.

0. **Data and checker (done).** `content/packs.json`, its schema, `scripts/check-packs.mjs`,
   `tests/packs-data.test.mjs`, this plan.
1. **Generated data.** Register `content/packs.json` in `sourcePolicy.authoritativeFiles`, have
   `game:generate` emit `app/data/packs.json` with `catalogId → pack` and `catalogId → unlock`
   indexes, and extend `check-generated-game-data` to fail on drift.
2. **Engine pools.** `Game` and `BossBlitzGame` accept `config.pools = { market, combo, location, bosses }`
   (catalog ID lists), applied through the existing `marketPool()` hook and the Combo, Location and Boss
   deck builders. With no pools, the full catalog is used, so simulations and fingerprints do not move.
   Setup records the pools. A pure module `engine/collection.mjs` provides `ownedCards`, `unlockedRoster`,
   `resolveMatchPools`, `openBooster(packs, state, rng)`, `applyMatchResult(packs, state, receipt)` and
   `levelFor(merit)`. *Tests:* fingerprint unchanged without pools; pools restrict decks; union is
   order-independent; replays carry pools; packs are deterministic per seed and serial and never repeat a
   card; a series' last pack is short; rewards and unlocks are granted exactly once; series completion
   unlocks its Character. *Simulation:* `--pool orientation` (and orientation plus one kit) in
   `simulate` and `simulate:modes`, compared with full-catalog runs for game length and win-rate spread.
3. **Career storage.** `app/career-store.ts`: schema v1, migrations, backup key, checksums, export/import
   codes, merge. All pure functions, tested in Node.
4. **Career UI** (both themes designed together, 44 px targets, reduced motion honoured): a Collection page
   behind the Field Agent menu (cards by series, Characters and Bosses with how to unlock each), the kit
   choice at onboarding, pack opening (instant reveal under reduced motion; haptics only as an extra), the
   level track with Diplomas, a post-match receipt, locked fighters shown with their unlock level in
   fighter select, and the Career / Open Dojo toggle in match setup.
5. **Gameplay wiring** on the engine-driven mat (One Engine phase 3), so `app/playtest.tsx` stays out of it.
6. **PvP.** Manifest exchange in the pairing codes; pools, rosters and `packsRevision` in setup and the
   state hash.
7. **Tuning** from play data and simulations.

## Decisions

### Answered by the owner (Nov 27)

- Approved: shared-pool collections, Open Dojo, Orientation Kit plus one of three Starter Kits (the others
  at levels 5 and 9), 8 themed series of 5-card packs with the series chosen by the player, the earn
  rates, Merit / Clearance Level / Diplomas, series gating (4 open, the rest at 4/6/8/10), rewards by
  table type, and localStorage with backup and export/import codes.
- **No rarity.** Tiers, odds and pity are removed from the data, schema, checker and plan.
- **No duplicates**: every pack holds only new cards. A finished collection turns tickets into Merit.
- **Free of money, always**, but Characters and Bosses unlock over time (the section above).

### Decided here (small calls the owner asked us to make)

1. **Starting roster:** 12 Characters (4 per Starter Kit style) and 5 Bosses covering every stage. Big
   enough for Tag Team and real choice, small enough that unlocks matter.
2. **Unlock sources:** Characters from Clearance Levels 2–22 (one each) and from completing each series;
   Bosses at levels 3, 6, 9, 13 and 17. Packs never contain Characters or Bosses, so a pack is always 5
   cards.
3. **Computer opponents may field any Character** (`computerOpponents: "any"`). It keeps six-seat Clash
   varied and previews upcoming fighters. Switch to `"unlocked"` in the data if that feels like a spoiler.
4. **Boss Blitz pool:** the union of the unlocked Bosses of the humans at the table, like cards.
5. **Short last pack:** a series' last pack holds just the remaining 2 or 3 cards. The alternative,
   topping up from another series, would break "you chose this series".
6. **No Market cap ("Dojo Box") for now.** Bring everything you own; revisit only if simulations show
   large collections play worse.
7. **No per-card set field in `cards.json`.** If a printed set symbol ever appears, it is generated from
   `packs.json`.
8. **Collections reach real matches on the engine-driven mat** (One Engine phase 3); data, storage and the
   Collection page can land before that.
9. **Membership lists:** the script's first pass stands. Rebalance any time by moving lines; the checker
   keeps it consistent.

### Still waiting on the owner

None.
