# One Engine: rules from JSON, the mat as a view, then online PvP

Status: plan, started Nov 26, 2026. Owner decisions are marked **Decision**.

## Goal

Every rule the game enforces comes from the canonical JSON (`content/*.json`) and is executed by one
engine. The browser, the simulator, the CLI and online play all drive that same engine. Anyone can
download the repository, read the engine, change a JSON file and get a different game, with no rules
hidden in UI code.

## Where things stand

There are two rules engines today.

| | `engine/core.mjs` (+ `boss-blitz.mjs`) | The Quick Duel mat (`app/playtest.tsx` + ~40 `app/*` runtime modules) |
| --- | --- | --- |
| Size | ~2,300 lines | `playtest.tsx` is 5,805 lines (about 2,600 of rule helpers, 2,000 of rules inside React event handlers); the runtime modules add ~11,000 more |
| Shape | Pure, framework-free. Seats `0..n`, a legal-action list, a pending-choice queue, seeded RNG, an event log. Replays move-for-move. | Rules live in React state updates on a two-sided `player`/`ai` match. Shuffles use `Math.random`. |
| Data | Generic resolvers keyed on the structured effects in `card-effects.json` | Mostly generic resolver modules, but with card-specific flows (Air Horn, Fire Drill, Trail Mix, Raffle, Sparring Dummy, Lucky reveal, Courtesy Notice, Discount Dim Mak, Tornado Crescent, a hard-coded `DDB-CON-CORE-033`), and `stage3c*` names left over from development stages |
| Modes | Quick Duel, Standard Clash 2–6, Tag Team (incl. 2v2), Dojo Drama solo and co-op | Quick Duel, plus Tag Team and Boss Blitz bolted on via `app/tag-team.ts` and `app/boss-blitz.ts` |
| Fidelity | All 907 structured effects certified, but some are approximations and some core rules were missing (below) | The richer rules implementation, iterated in live play |

**Decision (made): `engine/` becomes the one engine.** Its shape (seats, actions, choices, seeded
RNG, replayable move log) is exactly what the mat, the simulator and peer-to-peer play all need, and its
effects are already data-driven. The mat's extra fidelity is ported into the engine as generic,
JSON-described behaviour, not copied as card-specific code. The mat's runtime is then deleted.

## Gaps found so far

Fixed on Nov 26 (tests in `tests/core-rules-engine.test.mjs`):

- **Defenses ignored zones.** Any Defense blocked any attack. The rulebook (glossary: Zone) says a
  Defense must match the declared zone. The engine now offers only Defenses that cover the zone
  (`Any` covers all three), and its bots pick only from what is offered.
- **Defense Equipment and Reaction Items could be played from hand as Defenses** because the engine
  treated "has Guard" as "is a Defense". Now only printed Defenses (Techniques and Starters) are.
- **A knockout left a stale choice behind**: an "opponent discards a card" choice could outlive the
  opponent's elimination and stall the game. A knockout now voids choices about that fighter.

These change simulation results. The Quick Duel fingerprint moved from `332033cbde805616ccff17b0` to
`340f87ee9f34a97de97560d1`, and solo Boss Blitz dropped from ~85% to ~62% player wins.

Also fixed on Nov 26 (tests in `tests/engine-table-options.test.mjs`; the fingerprint did not move):

- **Weapon two-Hand limit.** `definition.equipment.weaponHands` gives a fighter two Hands; a Weapon
  occupies its printed Hands. When a Weapon does not fit, the legal actions offer one equip per set of
  equipped Weapons it would replace, and those are discarded first ("Replacing an occupied slot
  discards the old Equipment first"). A `noTwoHandedWeapon` restriction on equipped gear forbids
  two-handed Weapons.
- **Table options.** Tempo, Locations, Open Market, a balanced opening Market and house rules are
  declared in `definition.tableOptions` and passed as `new Game(data, { table: { ... } })`. Market
  Scramble and Fast Belts are executable house-rule variants. `game.tableOptions` exposes the resolved
  options and `setup.table` records them for replays.

Also fixed on Nov 26 (tests in `tests/engine-reversal.test.mjs`):

- **Reversal window.** After a Defense card Blocks, the defender gets a `reversal` choice (once per
  round) and the chosen Attack resolves through the normal pipeline against the original attacker, who
  may defend. Reversals earn no Focus, draw no Flow card, cannot trigger another Reversal and stay out
  of the owner's turn sequence. "If played as a Reversal" conditions now read the timing, not the
  card's Reversal tag, and "your Reversal against that attacker gets +X" text arms a bonus only a
  Reversal consumes.
- **Rich combat records.** The `attack` event carries `zone`, `reversal` and a `breakdown` of labelled
  Attack and Defense parts plus prevented damage and piercing.

The Quick Duel fingerprint moved from `340f87ee9f34a97de97560d1` to `d9c357ef5dba71bf9e18ca19`.

Also fixed on Nov 27 (tests in `tests/engine-combos-characters.test.mjs`):

- **Combos pay every part.** A Combo completed when its Attack is declared now also pays its on-Hit
  and after-resolve parts in the same strike; its passive part applies once on completion. *Clock In,
  Block Out* gained the owner-approved Reversal step in `content/combo-requirements.json`.
- **Character abilities.** `engine/character-abilities.mjs` runs every Character resolver but one on
  engine events (Attack declared, incoming Attack, damage, Hit, Block, card played, discard, Speed
  change, equip, Scene Change, promotion, exam progress, Combo reveal, Initiate), with their once
  per turn/round/game limits. Green abilities unlock at Green Belt (`progression.greenAbility`).
  Character zone changes widen the Attack zone choice; *Librarian Lin* really reveals two Combos.
- **Status durations and current Speed.** `nextTurn`, `duringNextTurn`, `nextInitiate`, `nextRound`,
  `endOfTargetNextTurn`, `nextKata` and `scene` work; Speed statuses count toward current Speed,
  initiative and Speed conditions.
- **Market prices.** One price plan: printed cost, Item penalty, Purple discount, qualified discounts
  with their floors, end-slot Equipment discounts and the Character price hook, known before buying.
  A purchase consumes only the discounts it used and the refill takes the bought card's slot.
- **Belts.** Attacks count toward the Brown exam's four cards; Training Stripes follow the mode flag.

The Quick Duel fingerprint moved from `d9c357ef5dba71bf9e18ca19` to `084900af728bc7f20c2885ac`.

Still open (the parity work in Phase 1 will find the rest):

- **Tempo needs a faster fighter**: the rulebook and the mat grant Tempo only against a slower opposing
  fighter, and allow it on a Defense (+1 Guard). The engine spends it on the first Attack of the round
  regardless of Speed. Fixing it will move the fingerprint.
- **After-Block Reaction Items** (e.g. a Reaction whose only timing is "after you Block") are never
  offered by the engine; only Reactions that act when an Attack is declared are.
- **Kata watchers**: Kata effects that trigger later on Hit, Block or after an attack never fire,
  because the engine does not set up a watcher when the Kata is played.
- **Piercing** ignores all Defense in the engine; the rulebook says it ignores Armor only.
- **AI difficulty** (Student / Certified / Master) is mat-only. It becomes engine policies.
- **Ronin Reroll** (replace a revealed Market card or Location, once per game) is not triggered, and
  "an opponent modifies your card" (*Coach Karen*) only sees opposing next-Attack and Guard penalties.
- **Market leftovers:** restricted Focus, Location purchase modifiers, and the *Laminated Lunch
  Voucher* qualifiers (5+ cards, minimum 4), which its canonical data does not carry yet.
- **Approximated resolvers**, e.g. `defense.reversalTargetProtection` is simplified to "prevent 1".
- **Interfere** is not modelled (no current card uses it).

## Phases

Each phase ends green on `npm run verify` and is pushed on its own.

**Progress (Nov 27):**
- Phase 1 has a map: `docs/engine-parity-audit.md` compares 115 mat behaviours with the engine (29
  same, 51 approximated, 35 missing). P1 fixes are under way.
- Phase 2 is done: table options and house rules from JSON (`engine/table-options.mjs`), difficulty
  policies (`engine/difficulty.mjs`), attack breakdown events, the Reversal window, the Weapon Hand
  limit, and save/resume as setup + decisions (`app/engine-session.ts`).
- Phase 3 is running side by side: `app/quick-duel-table.tsx` plays Quick Duel, Tag Team and Boss
  Blitz on the engine with the mat's look. Players opt in with **Rules engine → Shared engine (beta)**
  in setup; the classic mat stays the default until the P1 gaps are closed (owner decision 50).

1. **Parity spec.** Turn the mat's certification scenarios (`runPlaytestRuntimeCertification`, 907
   card routes) and the `quick-duel-*` host tests into engine-level scenario tests. Every behaviour the
   mat has and the engine lacks becomes a failing test, then a generic engine fix driven by JSON
   parameters (never a card ID). Exit: the engine passes every mat scenario.
2. **Engine features the mat needs.** House-rule variants from JSON, difficulty policies, rich
   exchange events, and save/resume as `setup + decisions` (the replay already proves this works).
3. **The mat on the engine.** Build the mat against a view model derived from engine state, with
   handlers that dispatch engine actions. It runs side by side with the current mat until it matches
   in the browser, then replaces it. Tag Team, Boss Blitz and the Clash table become modes of the same
   mat, which needs to handle more than two seats.
4. **Delete and document.** Remove the old match model and the browser runtime modules, rename what
   is left in domain terms, keep one data loader, and write an engine README for people who fork it.
5. **Online PvP** (below).

## Online PvP without a server

The site stays static on GitHub Pages. Nobody runs a game server.

- **Lockstep.** Both browsers run the same engine from the same seed and exchange only moves (a few
  hundred bytes each). The engine is deterministic, so both tables stay identical. A small hash of the
  state travels with each move; if the two tables ever disagree, both players get a stamped
  **"Paperwork Discrepancy"** notice instead of a silent desync.
- **Pairing codes.** The host taps *Open a table* and gets an invite code (a trimmed WebRTC offer,
  roughly 100–200 characters), shown as a link, a QR code and a copy button. The guest opens it, and their
  browser shows a reply code to send back. After that the two browsers talk directly. Any messenger
  works for the swap.
- **Postcard mode.** Some networks block direct connections, and the only general fix (a relay
  server) costs money. As a fallback, each turn produces a short "postcard" link holding the moves
  since the last one. Paste it to your opponent in any chat and their browser plays the turn. It also
  covers play spread over days, and needs nothing but the static site.
- **Open table.** Each browser knows the full game, hands and deck order included. No anti-cheat:
  anyone can peek or mod their copy, which suits an open, hackable game. The discrepancy stamp only
  shows when the two tables no longer agree, which is also how a modded rule gets noticed.
- **Saves, rematches, spectators** all fall out of the move log: setup + moves is the whole game.
- **Network note.** Direct connections usually need a public STUN server to discover addresses
  (free, no account; e.g. Google's). That is the only third-party contact. Postcard mode has none.

## Open source

**Decision needed:** the repository has no license, and `package.json` is `"private": true`, so
legally nobody may reuse it yet. A common split is MIT for the code and CC BY 4.0 for the rules text
and card content. The card art needs its own call depending on where it came from. Forkers also get a
README covering `npm run dev`, the offline build, and how to change a card or a rule in JSON.
