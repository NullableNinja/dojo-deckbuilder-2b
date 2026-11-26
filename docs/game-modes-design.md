# Game Modes Design: Standard Clash, Tag Team, Dojo Drama

## Build status (Nov 23, 2026)

| Mode | Headless engine | Browser game |
| --- | --- | --- |
| Quick Duel | The mode work left it unchanged. On Nov 26 the engine started enforcing Defense zones (see `docs/one-engine-plan.md`), so the fingerprint (`npm run engine:fingerprint`) is now `340f87ee9f34a97de97560d1`. | Live. |
| Standard Clash (2–6) | Executable. 800/800 parallel games, 0 failures, 0 replay mismatches. | **Live (you + 2–5 bots)**: an engine-driven Clash table (`app/clash-table.tsx`) with seat targeting, the engine's legal actions and choices, bots fighting each other, eliminations and Black Belt Victory. |
| Tag Team (individual, 2v2 Dojo War) | Executable. 800/800, 0 failures, 0 replay mismatches. | **Live (1v1 vs the computer)**: team setup, roster rails, tag during Initiate, owner's "Next in" pick, KO replacement with Equipment discard and Scene Change, Black Belt Victory. 2v2 not yet. |
| Dojo Drama (solo, co-op) | Executable (`engine/boss-blitz.mjs`). 600/600, 0 failures, 0 replay mismatches. | **Live (solo)**: three-fighter team vs the Rival → Mini-Boss → Final Boss ladder, Arsenal reveals, Boss Guard, Enraged double Attacks, stage clears, Scenario Victory. Co-op not yet. |

Run `npm run simulate:modes -- 300` for per-mode completion, win distribution, KOs, tags and invariant counts.

### Browser Tag Team notes

- Roster rules live in `app/tag-team.ts`; the active fighter is mirrored on the existing board so every Quick Duel rule applies unchanged. `settleRoster` runs inside `write()` and `setMatch`, so a knockout from any source swaps in the next fighter immediately and the game ends only when a whole roster is down.
- The computer tags out a fighter at 8 HP or less when a benched teammate has at least 6 more HP, and picks its healthiest fighter after a KO.
- The browser game cannot yet tell when a Location (rather than the opponent) causes a KO; the existing +2 KO XP from combat still applies only to combat KOs.

### Browser Standard Clash notes

- The Clash table runs the canonical headless engine directly in the browser (`app/clash-engine.ts` builds the engine data from the generated JSON), so every rule, including bot-versus-bot strikes with full card effects, matches the simulator exactly.
- It is a simpler surface than the Quick Duel mat: seat cards, your hand with the engine's legal actions, the Market at Ascend, a decision dialog for Defenses and other choices, and a fight log. It does not yet have the mat's stage, animations or Decision Coach, and a refresh ends the game (it is not saved).

### Browser Boss Blitz notes

- Rules live in `app/boss-blitz.ts`. The computer's board becomes the Boss (Profile stats, Stage HP and Attack bonus, 32-card Arsenal); Boss Attacks run through the normal strike pipeline, so player Defenses, Reactions and Reversals all apply.
- Boss Attack hit/block effects and the Profile rules Kata DEF, Consumable heal, Equip penalty, block DEF, block Speed and the start-of-turn discard (auto-discards your Junk if you have one, otherwise +1 to the first Boss Attack) are enforced. Exhaust discard, ready-Equipment power and the two zone-change Profiles are shown on the Boss dossier as "not yet automated".
- The next Boss appears on the mat as soon as the previous one falls and is marked "Waiting for the bell"; it does not act until the next round, which matches DDB-RUL-001/002.
- The stage-clear reward adds +3 XP on top of the +2 KO XP the strike already awarded (5 in total), which assumes the KO came from a player strike.

### Still open in the engine

- **Two Boss Profile rules are not wired**: Captain Cone and Chief Inspector Buffer trigger when a player *changes an Attack's zone*. The engine does not yet publish a "zone changed" event, so these Bosses currently fight with stats only.
- **Healing a benched fighter**: healing Consumables always heal the active fighter. The bench option (and Ice Pack's +2 on the bench) needs a target choice.
- **Reversal and Interfere windows** are not modelled by the headless engine in any mode (Quick Duel included). No current card has the Interfere keyword.
- **Two Quick Duel behaviours differ from the rulebook** and are kept as-is so duel results do not silently change: Speed ties use seat order instead of the passing referee marker, and the 40-round cap uses HP then random instead of ruling DDB-RUL-102. Switching them is a deliberate one-line change once you approve it.

### Balance findings from bot simulations

These come from the baseline bots, so they measure the rules plus a simple AI, not expert play.

- **Co-op Boss Blitz is too easy**: players won 199 of 200. Solo players win about 62% (85% before Defenses had to match the attack's zone). Two players deal roughly double damage while co-op Boss HP is only ~40% higher (45/65/85 vs 30/45/60), and the second Boss Attack is split across both players.
- **Black Belt Victory almost never happens** before a knockout (1 in 450 Tag Team games). The 35 XP race is much slower than the fight.
- **Standard Clash seat balance is fair** once bots spread their attacks: 3-player wins 33/33/35%, 4-player about 25% each.

Status: design + build plan. Source of truth: `content/rules.json` (v2.3), `content/dojo-game.json` (v2.3-r5), `content/cards.json`, `content/card-effects/*.json`.

Quick Duel is the only executable mode today. This document turns the other three modes into executable designs that stay inside the printed rules, lists every place the rules are silent or contradictory, and files a proposed ruling for each gap so the engine never has to guess.

## 1. What exists today

| Layer | State |
| --- | --- |
| Rules prose | All four modes fully described (Ch. 3, 13, 14, 16) plus Boss rulings. |
| Mechanical definition | `definition.mode` describes Quick Duel only (2 players, 25 HP, no Black Belt Victory, 40-round cap). |
| Cards | 41 Fighters, 3 Boss Stages, 10 Boss Profiles, 32-card Boss Arsenal (20 Attacks, 6 Defenses, 6 Techniques). All boss cards already carry structured effects (`content/card-effects/bosses.json`). |
| Headless engine | `engine/core.mjs`: 2 players, 1 fighter each. `engine/modes.mjs` refuses any mode not declared canonically. |
| Browser game | `app/playtest.tsx` + host modules: player vs AI, 1 fighter each. `app/boss-runtime.ts` resolves boss card events but no boss match exists. |

## 2. Rules digest by mode

Everything below is taken from the rulebook; section numbers are cited so each line can be checked.

### 2.1 Shared core (all modes)

- **Round** = one global Honor Phase, then each eligible turn in the initiative order locked at Honor (Ch. 6, ruling "Initiative is locked").
- **Honor**: Scene Change (first round: just reveal), resolve On Reveal, +1 XP to each non-eliminated player, refresh Tempo, order turns by current Speed (high→low), ties broken by referee marker then clockwise. Referee marker passes clockwise after each round.
- **Turn**: Initiate (ready, tag, equip, start effects) → Yell (play cards, unlimited legal Attacks, first Flow Attack draws 1, one Defense Practice, one Bad Habit cash-in) → Ascend (buy any number, one Combo attempt, promote ≤1 Belt) → Hide (end effects, discard, draw 7 / 8 at Blue, Focus to 0).
- **End of round**: end-of-round effects; Market Mercy if no purchase this round; pass referee marker.
- **Combat**: Attack Power = printed + ATK + Weapons + modifiers (+1 Tempo if faster). Defense = DEF + matching Armor + one Defense card's Guard + modifiers. Damage = max(0, AP − Def). Hit ≥1, Blocked 0. +1 XP attacker per legal Attack, +1 XP defender per legal Defense, +2 XP for causing a KO. Reversal once per round after a Block.
- **KO procedure** (Ch. 16): 0 HP → finish the effect → +2 XP to the responsible player (none if a Location caused it) → discard the fighter's Equipment and statuses → KO triggers → replace (roster modes) or eliminate → check victory after all KOs from that effect → one Scene Change if the game continues.
- **Elimination**: the player's hand, deck, discard and Equipment leave the game; their Ongoing effects end unless they belong to a Location or scenario.

### 2.2 Standard Clash (Ch. 3, 4) — 2 to 6 players

- One Character per player, 25 HP, shared Market/Combo/Location decks.
- Attack **any** opposing active fighter.
- Victory: **Black Belt Victory** (35 XP + Licensing Final + promote during Ascend) or **Last Fighter Standing**.
- Reaction Window proceeds from the affected player clockwise; bystanders may play one **Interfere** card per Attack. (No current card has the Interfere keyword; Rubber Chicken only references it. The window is modelled so future cards can use it.)

### 2.3 Tag Team: Swap-Fu (Ch. 13) — recommended core format

- Three Characters per player, one active, two benched; each at 25 HP; the player shares one deck, hand, Focus, XP, Belt and Tempo.
- Choose the starting active fighter before drawing the opening hand.
- **Tag**: once during Initiate, before equipping, swap with a conscious benched fighter. Free. Statuses and Equipment stay with their Character. The incoming fighter uses their own stats and may attack/use abilities that turn. No tagging while resolving an Attack or Reaction. Tagging does not refresh Tempo or reorder initiative.
- **Bench**: only the active fighter attacks, is targeted, uses ordinary abilities or contributes stats. Bench abilities work only when they say Bench/Team. No automatic bench healing. Healing Consumables without a named target may heal the active or one conscious benched fighter (Ice Pack heals 6 instead of 4 on a benched fighter).
- **KO**: discard that fighter's Equipment; if a conscious benched fighter remains, choose one and make it active immediately after the current effect; it does not get an Initiate and cannot Equip until the player's next turn. All three KO'd → eliminated.
- Victory: Black Belt Victory or Last Fighter Standing.
- **Variants**: Individual Tag Team (free-for-all), **2v2 Dojo War** (teammates sit opposite, share victory, cannot target each other, individual XP/Belt), **Shared Rank** (teammates share XP, Belt, tasks and rewards; individual initiative).

### 2.4 Dojo Drama: Boss Blitz (Ch. 14 + 5 Boss rulings) — solo or 2-player co-op

- Players use Tag Team rules (3 fighters each).
- **Ladder**: Rival (30 HP, +0, 1 Attack) → Mini-Boss (45 HP, +1, 1 Attack) → Final Boss (60 HP, +2, 1 Attack; **Enraged** at ≤30 HP: 2 Attacks). Co-op: 45/65/85 HP, 2 Attacks per Boss Turn, no Enrage.
- **Boss selection**: Quick Boss Blitz reveals a random Profile whose Stage Fit includes the stage; Challenge Boss Blitz chooses them. A Profile contributes only ATK, DEF, Speed and one Boss Rule.
- **Boss Arsenal**: all 32 cards, reshuffled fresh at the start of each stage.
- **Boss Turn** (once per round, placed in initiative by Speed; players win Speed ties): reveal until an Attack; Techniques resolve immediately; Defenses go to Boss Guard (replacing any old one). Attack the instructed active fighter in the printed zone. Boss AP = printed + Profile ATK + Stage bonus. Normal Reaction Window and combat math. Discard the Attack. Repeat if entitled to another Attack.
- **Fighting the Boss**: printed DEF always applies; Boss Guard adds its Guard when the player's Attack zone matches, then is discarded (unmatched Attacks leave it in place). Effects that need the Boss to discard/draw/gain/spend/Equip/tag/choose do nothing; the rest resolves. No Destroy, instant-KO or alternate-win shortcuts.
- **Boss doesn't**: buy, earn XP, hold a hand, spend Focus, learn Combos, Equip, tag or use Tempo. A faster player may still use Tempo against it.
- **Stage victory**: +5 XP (replaces the +2 KO award), heal the active fighter 8 HP (co-op: each player heals their active fighter 8), normal KO Scene Change; if the game continues, refresh all seven Market cards (replaces that round's end-of-round refresh), reveal the next Boss at the next Honor, reshuffle the Arsenal.
- **Boss KO timing** (rulings): during your Yell → finish your Ascend and Hide, remaining players skip that round. Outside your own Yell → if during a player turn, that player finishes Ascend and Hide; otherwise transition immediately.
- **Win**: KO the Final Boss (promote to Black first if that KO completes the task and XP ≥ 35). **Lose**: all your fighters KO'd (co-op: win or lose together). **Style Victory**: enter the Final stage already at Black Belt and win.

## 3. Gaps, contradictions and proposed filings

Each item below is a place where the rules are silent or contradict a card. The proposed ruling is filed in `content/rules.json` under `officialRulings` with tag **"Modes"** (IDs `DDB-RUL-101` onward) so the engine, the site and future printed rulebooks share one answer. Each is a proposal for your review; changing one is a one-line edit plus regeneration.

| # | Gap | Proposed filing |
| --- | --- | --- |
| 101 | Card text says "an opponent"/"that opponent"/"the target" with no named player. In Standard Clash there are several. | In combat, "opponent" is the opposing fighter in that combat. Outside combat, the acting player chooses one legal opposing active fighter when the effect resolves. "Each opponent" affects all. |
| 102 | Ch. 16 refers to "the normal tiebreakers" but never lists them; the digital game also needs a round cap (Quick Duel already uses 40). | Digital round cap per mode. At the cap, or when every remaining player is KO'd by one effect: most conscious fighters → highest total current HP → highest Belt → most XP → Sudden-Death Tiebreaker (top-card Focus Cost). |
| 103 | Which modes use Black Belt Victory is only stated for Quick Duel (no) and implied for Dojo Drama. | Standard Clash and Tag Team: yes. Quick Duel: no. Dojo Drama: promotion to Black never ends the game; only the scenario (Final Boss KO) does. |
| 104 | Belt stat rewards (+1 ATK at Orange, +1 Speed at Green, +1 DEF at Brown) are "permanent", but stats belong to Characters while the Belt belongs to the player (Ch. 12). | Belt stat rewards belong to the player and apply to whichever of that player's Characters is active. |
| 105 | Locations limit things "the first time each fighter …". In roster modes, tagging could reset them. | In roster modes "each fighter"/"each player" first-time limits on Locations are tracked per player (delegation). A Character's own once-per-turn/round abilities stay per Character card. |
| 106 | A player's own active fighter can be KO'd during their turn (self-damage, Reversal). The rules say the replacement enters "immediately" but not whether the turn continues. | The turn continues from the current step with the replacement active. The replacement cannot Equip until the next turn (as printed) but may play other cards and attack. |
| 107 | Boss Stage cards (Rival, Mini-Boss) say "Use the chosen Boss Character's printed ATK, DEF, and Speed. Ignore its Character abilities." This predates Boss Profiles. | "Boss Character" means the paired Boss Profile. Its printed Boss Rule still applies; "Character abilities" refers to normal Fighter abilities, which Bosses never have. |
| 108 | Bell of the Final Round checks the Boss's "Enrage Threshold". Only the solo Final Boss has one; Rival and Mini-Boss print "—", and co-op has no Enrage. | A Boss with no Enrage Threshold is never "at or below" it. Bell gives +1 in that case. |
| 109 | Co-op Boss targeting says "different players when possible; otherwise the lowest-HP active fighter" without saying who gets the first Attack. | First Boss Attack each Boss Turn: the conscious active fighter with the lowest current HP (random ties). Second: a different player's active fighter if one exists; otherwise the lowest-HP active fighter again. |
| 110 | Location and global text says "each fighter"/"each player"; the Boss is neither a player nor a normal fighter. | Global effects apply to the Boss only for combat values (ATK, DEF, Speed, Attack Power, Guard, damage, healing). Parts needing a hand, deck, Focus, XP, Equipment or a choice do nothing to the Boss (Ch. 14). |
| 111 | Who gets XP when the Boss KOs a fighter, and can a player Reversal a Boss? | The Boss earns nothing. The defending player gains Defense XP normally and may Reversal the Boss under the normal once-per-round rule. |
| 112 | Initiative ties between players are broken by the referee marker; the digital game needs a deterministic holder. | Seat 1 holds the referee marker in round 1 (the table may randomise it); it passes clockwise each round. Players still beat the Boss on ties. |
| 113 | 2v2 Dojo War: does one teammate's Black Belt promotion win for the team? | Yes. Victory is shared; any teammate's Black Belt promotion wins for the team. |
| 114 | Training Stripes (Belt Check HP recovery) are a digital Quick Duel rule absent from the printed rulebook. | Quick Duel only, until the printed rulebook adopts them. Other modes use the printed Belt rules. |
| 115 | Tag Team KO replacement: who chooses when the AI controls a roster, and what happens if the player who caused the KO is the one choosing? | The KO'd fighter's owner always chooses. |

Not gaps (checked and consistent):
- Boss Defense cards print "reduce damage by X" while Ch. 14 says "add its Guard". With damage floored at 0 the results are identical, and Piercing ignores neither. The engine adds Guard.
- Boss Arsenal count: 20 + 6 + 6 = 32 matches the catalog.
- "Layers of Hoodies … the first time you swap this" refers to replacing Equipment, not tagging.

## 4. Canonical data model

`content/dojo-game.json` keeps `definition.mode` (Quick Duel) unchanged for existing consumers and gains `definition.modes`, one entry per mode:

```jsonc
{
  "id": "tag-team",
  "title": "Tag Team: Swap-Fu",
  "rulesSection": "13-tag-team-swap-fu",
  "executable": { "engine": true, "playtest": false },
  "players": { "min": 2, "max": 6, "default": 2 },
  "roster": { "size": 3, "active": 1, "chooseActiveBeforeOpeningHand": true },
  "startingHp": 25,
  "victory": { "lastFighterStanding": true, "blackBelt": true },
  "tagging": { "enabled": true, "phase": "Initiate", "usesPerTurn": 1, "beforeEquip": true, "refreshesTempo": false },
  "knockout": { "xpForResponsiblePlayer": 2, "replacement": "owner-chooses-conscious-benched", "replacementMayEquipThisTurn": false },
  "maxRounds": 60,
  "tiebreakers": ["consciousFighters", "totalCurrentHp", "belt", "xp", "suddenDeath"],
  "trainingStripes": false,
  "variants": [ ... ]
}
```

Dojo Drama adds a `boss` block (stages with solo and co-op HP, Attack bonus, Attacks per turn, Enrage; Arsenal composition; stage-victory rewards; targeting; selection modes). Values come straight from Ch. 14 and the Boss Stage cards.

`engine/modes.mjs` reads `definition.modes` and only reports a mode executable when its `executable.engine` flag is set, so the declared-but-unbuilt state stays explicit.

## 5. Engine architecture

The headless engine is generalised without changing Quick Duel results.

1. **Seats and rosters.** A player keeps the player-owned state (deck, hand, Focus, XP, Belt, Tempo, Combos). Character-owned state (character card, HP, Max HP, base ATK/DEF/Speed, Equipment, exhausted Equipment, statuses) lives in `player.roster[]`. The active fighter's fields are mirrored on the player object, so every existing rule that reads `player.hp` or `player.equipment` keeps working. Tagging and KO replacement stash the outgoing fighter and load the incoming one. Belt stat rewards move to player-level bonuses (ruling 104).
2. **Opponent resolution.** Every `1 - player.id` site becomes `opponentOf(player, context)`: the combat opponent during combat; otherwise the target chosen by ruling 101 (the bot policy picks). With two players this returns exactly the old value.
3. **Targeting.** `play-attack` accepts `targetId`. Legal targets exclude self, teammates, eliminated players and (later) Untargetable fighters.
4. **Turn order.** Honor sorts by current Speed of each active fighter, ties by referee marker then clockwise (ruling 112). In two-player games this matches the old seat-id tiebreak in round 1.
5. **Victory.** `checkWinner` uses the mode: last player/team with a conscious fighter; Black Belt Victory when enabled; round cap → tiebreakers (ruling 102).
6. **Boss seat.** Dojo Drama adds a non-player Boss actor with its own initiative slot, Arsenal deck, Boss Guard, stage ladder and structured Profile rule, resolved through the same structured boss effects `app/boss-runtime.ts` already understands.

Quick Duel regression: run a fixed seed set before and after; every result (winner, rounds, XP, HP, telemetry) must match.

## 6. AI policy additions

- **Target choice** (Standard Clash): finish a fighter you can KO this turn; otherwise attack the leader (highest Belt/XP) to stop a Black Belt Victory; otherwise the lowest Defense in the declared zone.
- **Tagging** (Tag Team): tag out a fighter at ≤8 HP if a healthier benched fighter exists; tag in a fighter whose zone Armor or Speed beats the expected attacker.
- **KO replacement**: highest current HP, then best Speed.
- **Healing target**: most-injured conscious fighter (Ice Pack prefers the bench).
- **Boss**: fully automated from the Arsenal; no choices.

## 7. Browser game plan

Order chosen to reuse the existing two-board Quick Duel mat:

1. **Tag Team vs AI (1v1).** Same two boards; each side gains a roster rail of three fighter cards (active, two benched with HP, Equipment and statuses), a Tag action at Initiate, a KO-replacement chooser, and a healing-target chooser.
2. **Boss Blitz (solo).** The AI board becomes the Boss: stage ladder (Rival/Mini/Final), Boss HP, Boss Guard slot, Arsenal reveal animation reusing the scene-reveal pattern, Enraged state.
3. **Standard Clash (3–6 seats).** The opponent side becomes a row of opponent seats with a target picker; turn order rail across the top.
4. **Co-op Boss Blitz** and **2v2 Dojo War** once hot-seat or AI teammates exist.

Every surface must ship in light and dark, desktop and phone, with keyboard and reduced-motion support (AGENTS.md).

## 8. Test plan

- Canonical data: `npm run game:check` validates `definition.modes` and the new rulings.
- Engine unit tests per mode: tag legality, Equipment staying with its fighter, KO replacement, elimination, Black Belt Victory on/off, targeting legality, Boss Arsenal loop, Boss Guard match/miss, Enrage, stage transition rewards.
- Simulation: thousands of seeded games per mode with zero invariant failures and zero stuck games.
- Quick Duel regression: identical results on a fixed seed set.
- Browser: full scripted games per mode in both themes at desktop and phone widths.
