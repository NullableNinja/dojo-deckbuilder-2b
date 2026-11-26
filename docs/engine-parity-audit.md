# Engine parity audit: Quick Duel mat vs `engine/`

Status: audit, Nov 26, 2026. Documentation only; no code was changed. This document drives the next round
of engine work in Phase 1 of `docs/one-engine-plan.md`.

## Scope and method

- **Baseline:** commit `25056d0`. All `file:line` references are to that commit. `engine/core.mjs` and
  `app/playtest.tsx` are unchanged there since `b87f780`.
- **Mat side:** `app/playtest.tsx` (React handlers and helpers) plus the runtime modules it calls
  (`app/equipment-structured.ts`, `app/training-stripes.ts`, `app/quick-duel-transition-host.ts`,
  `app/quick-duel-combo-executor.ts`, `app/tag-team.ts`, `app/consumable-effect-resolvers.ts`,
  `app/location-playtest-bridge.ts`, and others named in the rows).
- **Engine side:** `engine/core.mjs`, `engine/combo-runtime.mjs` and `engine/bots.mjs`.
  `engine/boss-blitz.mjs` was not audited in depth (see the Tag Team and Boss Blitz section).
- **Rules source:** `content/rules.json`, cited by section id (for example `§tempo-advantage`) or by
  ruling id (`DDB-RUL-1xx`). Glossary entries are cited as `glossary:Term`.
- **Verification:** besides reading the code, throwaway Node probes (not committed) drove `engine/core.mjs`
  directly. A row marked **(probe)** was confirmed that way. The probes were:
  1. one-off `resolveAttack` calls with chosen Equipment, Locations, statuses and Defense cards;
  2. 300 seeded games with a random-legal policy and rotating Characters, instrumenting `applyCardEffects`
     to list which (card subtype, trigger) pairs and resolvers ever run;
  3. a learned-Combo scenario (Flow Kata, then an Attack, with *Breathe In, Violence Out* and
     *Paperwork and Pain* learned).

### Facts already on `main` (not re-audited)

- The engine enforces Defense zones: it offers only Defenses whose printed zone covers the declared zone
  (`Any` covers all three) (`engine/core.mjs:18`, `:1556`). Defense Equipment and Reaction Items are no
  longer playable as Defenses (`:16`).
- A knockout voids any pending choice about the knocked-out fighter (`engine/core.mjs:1893`).
- The working tree on `main` adds a Yell legal action `bad-habit-focus` (uncommitted at the time of this
  audit). The Bad Habit rule itself is already at parity: once per turn, discard one Bad Habit for +1 Focus
  (`engine/core.mjs:1470`, `app/playtest.tsx:4384`).

### Out of scope (other workers own these)

These appear only where they explain another row: the Reversal window, rich attack event breakdowns,
the Weapon two-Hand limit, table options (Tempo on/off, Locations on/off, open market, balanced opening
market, house rules such as Fast Belts and Market Scramble) and AI difficulty (Student / Certified / Master).

### Legend

- **Status.** **same**: the engine does what the mat does. **approximated**: the engine does something
  simpler or different (the row says exactly what). **missing**: the engine does not do it at all.
- **Priority.** **P1**: affects normal play often. **P2**: specific cards or situations. **P3**: edge cases.
- **Estimate.** **S**: under a day. **M**: one to three days. **L**: more than three days.
- Every fix must follow `AGENTS.md`: rules go into canonical JSON plus a generic resolver. Never branch on
  a card ID or name.

## Summary

| Status | P1 | P2 | P3 | Total |
| --- | --- | --- | --- | --- |
| same | 14 | 12 | 3 | 29 |
| approximated | 11 | 20 | 20 | 51 |
| missing | 15 | 18 | 2 | 35 |
| **Total** | **40** | **50** | **25** | **115** |

Rows already at parity are still listed so that each rule area is complete. The counts above are the
audit baseline; rows fixed since then say "Fixed" (or "Partly fixed") in their notes. Combat math (Nov 27):
E-TP1, E-TP2, E-TP3, E-A6, E-A7, E-A8, E-A12, E-A14, E-D3, E-D4, E-D11, E-D12, E-S3, and part of E-L3
(tests in `tests/engine-combat-math.test.mjs`). Combos, Characters, statuses and Market (Nov 27): E-CB2,
E-CH1, E-CH2, E-S1, E-S4, E-M1-E-M4, E-B2, E-B6, E-T3, and parts of E-CB3, E-K3, E-S2 and E-A1 (tests in
`tests/engine-combos-characters.test.mjs`).

### Top P1 gaps

1. **E-A8** (fixed) A current Location with "attack" effects replaces the Attack card's own passive and
   on-declaration effects, and applies the Location bonus three times. Most Locations have such effects. (probe)
2. **E-R1** Playing a Reaction Item puts the card in both `played` and `discard`. The invariant check then
   aborts the game. (probe)
3. **E-A14** (fixed) Weapon printed Attack Bonus is never added; 59 of 65 Weapons have one. (probe)
4. **E-A15** Equipment `onAttackDeclared`, `onDefenseDeclared` and `afterResolve` effects never fire
   (36 Weapon, 6 Gear and 6 Armor effects). (probe)
5. **E-T5** Exhausted Equipment never readies; once exhausted, it stays exhausted for the whole game. (probe)
6. **E-D3** (fixed) Armor printed Guard is ignored unless it is also encoded as an effect; 13 Armor cards are affected. (probe)
7. **E-D4** (fixed) Piercing is subtracted from the whole Defense, Character DEF included, not only from Armor. (probe)
8. **E-TP1** (fixed) Tempo +1 is applied to the first Attack each round even when the attacker is slower. (probe)
9. **E-TP2** (fixed) Tempo +1 Guard on a Defense card is not implemented.
10. **E-A6 / E-A7** (fixed) Attack XP is awarded only on a Hit and Defense XP only on a Block. The rulebook and
    the mat award both every time. (probe)
11. **E-C1** Consumables go to the discard pile and are reused. The rulebook and the mat return them to
    the box after use.
12. **E-C2 / E-R4** Consumables are playable only in Yell; the 9 Reaction, 11 Anytime and 2 Ascend
    Consumables never get their windows.
13. **E-CB2** A Combo that completes when its Attack is declared never resolves its `onHit` or
    `afterResolve` payoff. This affects 10 multi-trigger Combos and several Hit-only ones. (probe)
    *Fixed Nov 27.*
14. **E-CH1 / E-CH2** Green Character abilities are active from White Belt, and about 43 of 70 Character
    resolvers are never triggered (no `onAttackDeclared` and most passive events). (probe)
    *Fixed Nov 27 (Ronin Reroll still open).*
15. **E-S3 / E-A12** (fixed) Temporary Speed modifiers never change Speed, and opponent-targeted Speed and Guard
    penalties land on the source player. (probe)

### Fixed after the audit: equipment, Reactions, Consumables and choices

See `tests/engine-equipment-reactions.test.mjs`. Rows E-T5, E-A15, E-R1, E-R3, E-R4, E-C1, E-C2, E-X16 and
E-X18 are now at parity; E-T8, E-A1, E-D8, E-R2, E-E3 and E-X19 are partly fixed (each row says what is
left). The counts in the summary table are as of the audit. Choice plumbing was fixed at the same time:

- Pending choices are queued (`offerChoice`) instead of overwriting each other; a queued choice is
  re-checked when it comes up (cards that left their zone drop out; attack windows are rebuilt).
- Structured `choiceKind` choices offer only options the engine resolves (zone calls, discard-or-retarget,
  an opposing-Equipment pick, an optional draw-then-discard); an unknown kind is reported as unsupported
  instead of offering options that stall. The `dodge-block-cycle` effect-ID branch is gone.
- `play-attack` checks `zone` against the card's zones and grants. `forcedAttackZone` and `nextAttackZone`
  statuses, and the `incoming-zone` / `next-attack-zone` calls, are read.
- Effects with an `incomingZones` list apply only to Attacks in those zones (a Low-only Reaction no longer
  answers a High Attack). `resolvedCardType` is a real condition ("after you play a Kata").

Next in line: E-L1 (Quick Duel Location pool), E-M1 (purchase price formula, *fixed Nov 27*), E-S1
(status durations, *fixed Nov 27*), E-E3 (Equipment activation windows) and E-D6 (damage-prevention layers).

## 1. Turn structure and phases

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-T1 | Honor: every surviving fighter gains +1 XP and Tempo refreshes, once per round | `app/playtest.tsx:5583-5584` | `engine/core.mjs:1694` | §honor-phase-global-round-start | same | — | P1 | — |
| E-T2 | Initiative is set at Honor by current Speed. Ties go to the human player (seat 0); there is no referee rotation | `app/playtest.tsx:3330`, `:5590` | `engine/core.mjs:1696`, `:1875` (legacy Quick Duel uses seat order) | §honor-phase step 5, DDB-RUL-004, DDB-RUL-112 | same | Both ignore the referee marker that DDB-RUL-112 requires (see Contradictions) | P2 | — |
| E-T3 | Next-round Speed modifiers (status duration `nextRound`) are applied before initiative is computed | `app/playtest.tsx:1643` (`stage3cAdvanceRound`), `:5583` then `:5590` | `engine/core.mjs:1696` sorts by `speed + tempSpeed`; `tempSpeed` is reset at Hide (`:1704`) and Speed statuses are never read | DDB-RUL-003 | **fixed** | Fixed Nov 27: `nextRound` Speed statuses become current Speed at Honor before initiative is sorted by current Speed | P2 | S |
| E-T4 | Initiate resolves delayed start-of-turn effects: queued Focus (`nextInitiateFocus`), queued draws (`nextInitiateDraw`), `readyAtInitiate` Equipment, and statuses with duration `nextTurn` or `nextInitiate` | `app/playtest.tsx:743`, `:1612` | none; Initiate only runs `onInitiate` triggers (`engine/core.mjs:1678`) | §initiate-phase step 4 | missing | No `nextInitiate` or `nextTurn` durations; effects that queue Focus or draws for the next Initiate do nothing | P2 | M |
| E-T5 | Exhausted Equipment readies for the next round (the mat resets `exhaustedEquipment` at Honor) | `app/playtest.tsx:5583-5584`, plus `readyAtInitiate` and `readyAtHide` lists (`:743`, `:855`) | none; `setEquipmentReady(…, true)` is only called by specific effects (`engine/core.mjs:260`) | §armor-and-gear ("All of your exhausted Equipment readies at your Initiate Phase"), glossary:Ready | same | **Fixed:** exhausted Equipment (benched fighters' too) readies when its controller's turn starts. `definition.equipment.readiness.readyAt` is `own-initiate` (rulebook); `honor` reproduces the mat (designer question 6) | P1 | S |
| E-T6 | Permanent Equipment is equipped only during Initiate, from hand, and generates its printed Focus | `app/playtest.tsx:3355` | `engine/core.mjs:1533`, `:1683`, `:1475` | §equipping-permanent-equipment | same | — | P1 | — |
| E-T7 | Yell: play Attacks, Katas and Consumables, Defense Practice once, and the Bad Habit Focus rule once | `app/playtest.tsx:4860-4890` | `engine/core.mjs:1534`, `:1465`, `:1470` | §yell-phase-play-cards | same | — | P1 | — |
| E-T8 | Ascend window: Ascend-timed Consumables (2 cards) and Ascend Katas (2 cards) are playable during Ascend, and Ascend-only Katas are not playable in Yell. The AI plays an Ascend Kata before buying | `app/playtest.tsx:3799-3802`, `:4885`, `:5515` | `engine/core.mjs:1507` (only Yell may play Katas and Consumables); Ascend offers no `play-card` (`:1535-1541`) | card timing field "Ascend" | approximated | **Partly fixed:** Ascend and Anytime Consumables are `play-card` legal actions during Ascend, and Ascend Consumables are no longer playable in Yell. Ascend Katas are still Yell-only | P2 | S |
| E-T9 | Hide: run end-of-turn effects, discard hand and play area, draw 7 (+1 at Blue Belt), Focus to 0 | `app/playtest.tsx:4467`, `:2661` | `engine/core.mjs:1704` | §hide-phase-cleanup | same | — | P1 | — |
| E-T10 | Hide-time Consumable follow-ups, such as "lose HP at end of turn" (*Expired Protein Shake*, *Overtime Espresso*), damage the player who played them | `app/playtest.tsx:2662` (`resolveConsumableHideStatuses`) | `engine/core.mjs:1411`: the generic `dealDamage` always damages `effectContext.opponent` | card text | approximated | Effects with `target: "self"` damage the opponent instead. The generic `dealDamage` must honour `effect.target` | P2 | S |
| E-T11 | Market Mercy: if a whole round passes without a purchase, all 7 Market cards are replaced | `app/playtest.tsx:5585-5589` | `engine/core.mjs:1702` | §end-of-the-round step 3 | same | — | P1 | — |
| E-T12 | The mat starts round 1 with one revealed Location | `app/playtest.tsx:3329` | `engine/core.mjs:180` (constructor reveal) and `:1696` (Honor reveal) | §honor-phase step 1 ("On the first round … simply reveal the first one") | approximated | The engine reveals two Locations in round 1 and immediately discards the first. This only changes the RNG stream | P3 | S |

## 2. Tempo and Speed

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-TP1 | Tempo +1 Attack Power only when the attacker's current Speed is higher than the defender's | `app/playtest.tsx:3536`, `:5372` | `engine/core.mjs:1443` (`useTempo && attacker.tempo`, with no Speed check) | §tempo-advantage, DDB-RUL-003 | same | Fixed: Tempo +1 Attack Power only when the attacker's current Speed is higher than the defender's (a Boss by printed Speed); still spent automatically when legal (`hasTempoAdvantage`) | P1 | — |
| E-TP2 | Tempo +1 Guard on the defender's Defense card when the defender is faster | `app/playtest.tsx:4558` (the human defending; the mat AI never gets it) | none (`engine/core.mjs:1445`) | §tempo-advantage, §tempo-in-combat | same | Fixed: a faster defender spends Tempo for `turn.tempoDefenseGuard` (+1) Guard on the Defense card; no Defense card, no Tempo Guard | P1 | — |
| E-TP3 | Current Speed includes Equipment Speed modifiers, Belt Speed, temporary modifiers and minimum-Speed floors | `app/playtest.tsx:1891` (`fighterStat`) | `engine/core.mjs:1406` (Speed statuses are written, never read), `:1412` (`minimumSpeed` permanently raises base Speed) | glossary:Current Speed | same | Fixed: `currentSpeed()` adds `tempSpeed`, timed `modifySpeed` statuses and static Equipment Speed, then applies equipped Speed floors; `minimumSpeed` no longer rewrites printed Speed, and `whileEquipped` Speed is no longer stored as a status on every strike | P1 | — |
| E-TP4 | Effects that take away the target's Tempo for the round (the *Discount Dim Mak* hit choice) | `app/playtest.tsx:4234` | `engine/core.mjs:1323` (`tempo-loss`) | card text | same | — | P3 | — |

## 3. Attacks, zones and Flow

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-A1 | Attack zone choice: printed zone; `Any`; "next Attack may be declared in any zone" grants; conditional alternate zones (`attack.final.alternateZone`); Equipment first-Attack any-zone; Character zone overrides | `app/playtest.tsx:1214` (`attackAllowedZones`) | `engine/core.mjs:1554`: only printed `Any` prompts. `nextAttackAnyZone` is written (`:1137`, `:1142`, `:1153`, `:1235`, `:1417`) but never read | §the-three-zones, card text | same | Fixed Nov 27 in two passes: `nextAttackAnyZone` grants and Character zone abilities widen the `attack-zone` choice (printed zones first); `play-attack` validates `zone`; `nextAttackZone` statuses, the Attack's own `chooseZone`/`alternateZone` effects and Equipment `chooseZone` effects (spent when used) also grant zones; a forced zone (`forcedAttackZone`) narrows the choice | P2 | S |
| E-A2 | An Untargetable fighter cannot be attacked (*Smoke Bomb*) | `app/playtest.tsx:3511` | `engine/core.mjs:1835` (`isLegalTarget`), `:1370` (status lasts until `nextHonor`) | glossary:Untargetable | approximated | The duration differs: the card says until your turn or until you attack; the engine uses next Honor | P3 | S |
| E-A3 | Attack restrictions: "this is your only Attack this turn" (`attack.final.onlyAttackLock`), a no-Weapon-Attacks Equipment restriction, and status restrictions | `app/playtest.tsx:3347`, `:467`, `:3507` | `engine/core.mjs:1374` (`restrictAttack` until `nextHonor`); `equipmentRestriction` statuses are written (`:1168`, `:1204`) but never read | card text | approximated | The only-Attack lock works approximately. `noWeaponAttacks` is not enforced | P2 | S |
| E-A4 | Play any number of Attacks per Yell, each resolved separately | `app/playtest.tsx:3506` | `engine/core.mjs:1534` | §multiple-attacks | same | — | P1 | — |
| E-A5 | Flow: the first Flow Attack each turn draws one card. Flow comes from next-Attack grants, statuses, a conditional `attack.currentAttackFlow` effect ("if you have a Weapon equipped") and Equipment-granted Flow | `app/playtest.tsx:2573` (`attackHasFlow`), `:3625` | `engine/core.mjs:1433`, `:1458` | §flow | approximated | The engine also treats a printed `Flow` tag as unconditional Flow, so *Loading-Dock Lunge* always flows, Weapon or not. Equipment Flow never fires (see E-A15) | P2 | S |
| E-A6 | The attacker gains +1 XP for every legal Attack, Hit or Blocked | `app/playtest.tsx:3622`, `:5383` | `engine/core.mjs:1446` (`attackXpOnHit`, Hit only) | §attack-sequence step 8, §how-to-earn-xp | same | Fixed: +`progression.xpPerLegalAttack` for every legal Attack, Hit or Blocked (field renamed from `attackXpOnHit`). The anti-loop rule is still backlog | P1 | — |
| E-A7 | The defender gains +1 XP for every legal Defense card, whether it blocks or not | `app/playtest.tsx:3652`, `:4565` | `engine/core.mjs:1446` (`defenseXpOnBlock`, Block only) | §attack-sequence step 8 | same | Fixed: +`progression.xpPerLegalDefense` for every legal Defense card, Block or not (field renamed from `defenseXpOnBlock`) | P1 | — |
| E-A8 | The Attack card's own `passive` and `onAttackDeclared` effects resolve, and Location attack modifiers apply once | `app/playtest.tsx:3538-3541`, `:619` | `engine/core.mjs:1434-1436`: `applyLocationEvent` returns a context that still carries `effectOverride` (the Location's effects). The next two `applyCardEffects` calls reuse it | §attack-sequence step 2 | same | Fixed: `applyLocationEvent` resolves the Location in its own frame and returns only the results, so the Attack card's effects run and the Location bonus applies once | P1 | — |
| E-A9 | `onDefenseDeclared` effects on the Attack card, such as +X if the defender played a Defense (`attack.afterDefensePower`) | `app/playtest.tsx:3609`, `:4577` | none (only the Defense card's `onDefenseDeclared` runs, `engine/core.mjs:1442`) | card text | missing | The Attack's after-Defense bonus never applies (probe: resolver never reached) | P2 | S |
| E-A10 | `afterResolve` effects of Defense cards and Katas | `app/playtest.tsx:3683`, `:4656`, `:3891` | `engine/core.mjs:1455` (only the Attack card's `afterResolve` runs); `playCard` runs `onPlay` only (`:1480`) | card text | missing | 10 Defense and 11 Kata `afterResolve` effects never fire (probe) | P2 | S |
| E-A11 | Kata effects with `onHit`, `onBlock` or `onAttackDeclared` triggers are armed as statuses and resolve on the later event (`kata.deferredEvent`, `kata.comboHitReward`, `kata.linkedAttackOutcome`) | `app/playtest.tsx:2088` (`applyStage3CCommands`) | Triggers run only for the card in combat, never for a Kata played earlier | card text | missing | Deferred Kata payoffs never fire (probe: resolvers never reached) | P2 | M |
| E-A12 | On-Hit target debuffs: target's next Attack −X, target's next Defense −X Guard, target −X Speed until Honor | `app/playtest.tsx:1956` (`applyTargetHitDebuffs`) | `engine/core.mjs:1404` handles the next-Attack penalty correctly; `:1406-1409` put Speed, Guard, Defense and prevention statuses on the source player regardless of `effect.target` | card text | same | Fixed: timed Speed, Guard, DEF and prevention changes, and immediate Speed changes, land on `effect.target`; immediate opponent Guard/DEF changes from an Attack apply to that exchange's Defense | P1 | — |
| E-A13 | On a Hit, the target discards cards | `app/playtest.tsx:3641`, `:4721` | `engine/core.mjs:1395` (`queueCardChoice` against the opponent) | card text | same | — | P2 | — |
| E-A14 | Weapon printed Attack Bonus is added to every Attack | `app/playtest.tsx:1900` (`fighterStat` sums `stats["Attack Bonus"]`) | none; `stats["Attack Bonus"]` is never read (`engine/core.mjs:1444`) | §weapons, §final-combat-formula | same | Fixed: every equipped Weapon adds its printed Attack Bonus to each Attack ("Weapon" in the breakdown); Location `modifyWeaponAttackBonus` text adjusts each matching Weapon by its tags, with `minimumFinalValue` floors | P1 | — |
| E-A15 | Equipment triggers: Weapon, Gear and Armor `onAttackDeclared` (35), `onDefenseDeclared` (7) and `afterResolve` (5) effects | `app/playtest.tsx:654` (Equipment conditional power), `:1254`, `:982`, `:1105` | `engine/core.mjs:866` (passive), `:891` (onHit and onBlock only) | card text | same | **Fixed:** Equipment `onAttackDeclared` effects fire for the attacker (own Attack) and, at declaration, for the defender (effects with an incoming-Attack condition); `onDefenseDeclared` fires when the owner plays a Defense card; `afterResolve` fires after the owner's Attack or played card resolves. An ability with an exhaust cost is skipped while its card is exhausted. Attacker-side manual activations (*Orange Permit Puncher*) are still not offered | P1 | M |
| E-A16 | Equipment that reacts when you equip another card (exhaust self to draw, ready another, next Attack +X, discard) | `app/playtest.tsx:3373-3384`, `:5671-5688` | `engine/core.mjs:1480` (`onEquip` runs only for the card being equipped) | card text | missing | 5 Gear and 1 Weapon `onEquip` watchers are not supported | P2 | S |
| E-A17 | Weapon Attacks are blocked while a no-Weapon-Attacks restriction is active, and a two-handed Weapon cannot be equipped under a no-two-handed-Weapon restriction (*Body Shield*) | `app/playtest.tsx:433-470`, `:3359` | `engine/core.mjs:1168` writes `equipmentRestriction` statuses and never reads them; it adds a new one on every Attack | card text | missing | Restrictions are not enforced, and the status list grows every Attack | P2 | S |

## 4. Defense and damage math

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-D1 | A Defense card must cover the declared zone | `app/playtest.tsx:2586` | `engine/core.mjs:18`, `:1556` | glossary:Zone, §defense-limits | same | Fixed on `main` | P1 | — |
| E-D2 | One Defense card per Attack | `app/playtest.tsx:4507` | `engine/core.mjs:1556` | §defense-limits | same | — | P1 | — |
| E-D3 | Armor contributes its printed Guard when its slot or zone matches the Attack, even with no explicit effect | `app/equipment-structured.ts:127-158` (`baseArmorDefense`), `app/playtest.tsx:1929` | `engine/core.mjs:1445` (only effect amounts via `applyPassiveEquipment`) | §armor-and-gear, §final-combat-formula | same | Fixed: printed Armor Guard applies when the card's zone covers the declared zone (`Any` = Universal). An Armor effect restating the same amount is the printed value and is not doubled ("Armor" in the breakdown) | P1 | — |
| E-D4 | Piercing X ignores up to X Armor DEF only | `app/playtest.tsx:714`, `:3549` | `engine/core.mjs:1445` subtracts piercing from DEF + Guard + all modifiers | §critical-terms (Piercing X), glossary:Piercing X | same | Fixed: Piercing reduces Armor DEF (printed plus Armor effects) only; Character DEF, Guard and other modifiers are untouched | P1 | — |
| E-D5 | Armor suppression: "the target's Equipment provides 1 less DEF against your next Attack" (`attack.nextAttackArmorPenalty`), and "choose an opposing Equipment and reduce its DEF contribution" (`attack.final.equipmentSuppression`) | `app/playtest.tsx:709`, `:511`, `:4036` | `engine/core.mjs:1117` (a `modifyDefense` status on the whole Defense); the suppression routes to `modifyGuard` on the attacker (`:1407`) | card text | approximated | The penalty is not capped at Armor, and the suppression helps the attacker's own next Defense instead | P2 | S |
| E-D6 | Damage-prevention layers in order: Location and Character damage modifiers; prevention statuses; Equipment prevention; mandatory Equipment reduction (exhausts); Character `damageIncoming`; optional exhaust reduction (first combat damage each round); threshold protection after damage | `app/playtest.tsx:3616-3621`, `:1341`, `:785`, `:804`, `:1302` | `engine/core.mjs:1445` (one subtraction of context, status and reaction prevention) | glossary:Damage | approximated | No Equipment exhaust costs, no once-per-round reductions, no Location damage modifiers, no threshold protection | P1 | M |
| E-D7 | Hit is decided before prevention: `hit = attackPower > defensePower`; prevention then reduces the damage | `app/playtest.tsx:3615`, `:4578` | `engine/core.mjs:1445-1446` (`hit = damage > 0` after prevention) | §critical-terms, glossary:Hit | approximated | A strike prevented to 0 is a Block in the engine and a Hit in the mat. Designer question Q1 | P2 | S |
| E-D8 | Defence-window Equipment activations: call a zone for −X Attack Power (`incoming-zone-penalty`); +X Guard and a Reversal bonus (`defense-guard`) | `app/playtest.tsx:3391-3450`, `:4926` | none (`activate-equipment` exists only in Initiate, `engine/core.mjs:1533`) | card text | approximated | **Partly fixed:** the call-a-zone plan (`incoming-zone`) is offered in the Reaction Window as `activate:<id>`; its payoff applies only if the Attack uses the called zone. The `defense-guard` plan is still missing | P2 | M |
| E-D9 | Optional "exhaust to reduce this combat damage" prompt, readying at Hide when it qualifies | `app/playtest.tsx:804`, `:4587-4605` | none | card text | missing | — | P2 | S |
| E-D10 | Post-Block cycle Equipment (exhaust after a zone-matched Block: draw, then discard) | `app/playtest.tsx:829`, `:4698` | none | card text | missing | — | P2 | S |
| E-D11 | Defense Practice does not count as playing a Defense for card or Combo conditions | `app/playtest.tsx:4393` | `engine/core.mjs:1467` sets `playedDefenseSinceLastTurn` and counts `defenseCount` | §defense-practice | same | Fixed: Defense Practice no longer counts as a played Defense for "first Defense" or "played a Defense" conditions | P3 | — |
| E-D12 | Location defence modifiers apply only to a played Defense card (for example *Traditional Dojo*: first Defense Technique each round +1 Guard) | `app/playtest.tsx:602` | `engine/core.mjs:1441` (the "defense" event fires on every incoming Attack and leaks `effectOverride` into the Defense card's `onDefenseDeclared`) | Location text | same | Fixed: no `effectOverride` leak (E-A8), and Guard changes from any source apply only when a Defense card is played; the card's Guard total never drops below 0 | P2 | — |
| E-D13 | Defense card conditional Guard (`defense.conditionalGuard`, 14 effects) | `app/playtest.tsx:1227` | `engine/core.mjs:1442` | card text | same | The E-D12 leak is fixed | P2 | — |

## 5. Reactions and Reaction Items

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-R1 | A Reaction Item played when an Attack is declared resolves once and leaves play | `app/playtest.tsx:3836-3850`, `app/reaction-item-runtime.ts` | `engine/core.mjs:1660`: the card is pushed to `played` and to `discard` | §items-and-tools | same | **Fixed:** a played Reaction Item goes to exactly one zone (destroyed, per `definition.equipment.afterUse`); 400 random-policy games run clean | P1 | S |
| E-R2 | Reaction Item windows other than declaration: `onPlay` (off-turn shield), `onDefenseDeclared` (played as the Defense: *defenseBeltExamCredit*), `onBlock` in the Reversal window, and passive watchers (`preserveMarketDiscount`, `preventForcedDiscard`, `cancelComboPayoff`) | `app/playtest.tsx:3803-3835`, `:4867-4875` | `engine/core.mjs:1555` (offers only Reaction Items with `onAttackDeclared` effects) | §the-reaction-window | approximated | **Partly fixed:** declaration Reactions are offered only when their conditions apply; after-Block (`onBlock`) Reaction Items get an `after-block` window before the Reversal window; "as a Defense card" Reaction Items are Defense options. The out-of-turn-Consumable trigger (*Instant Noodle Smokescreen*) and the passive watchers are still missing | P2 | M |
| E-R3 | Reaction Items are destroyed after use, as printed | `app/playtest.tsx:3823`, `:3851` | `engine/core.mjs:1660` (discard) | §items-and-tools ("destroy or discard them exactly as the card says") | same | **Fixed:** Reaction Items are destroyed (`definition.equipment.afterUse.bySubtype`); designer question 11 | P2 | S |
| E-R4 | Reaction and Anytime Consumables can be played in the defence window off-turn (the AI auto-plays defensive Consumables); they generate no Focus | `app/playtest.tsx:3803`, `:2593`, `:3579-3592` | none (Consumables are Yell-only, `engine/core.mjs:1507`) | Consumable timing field, §focus-purchasing-power | same | **Fixed:** Reaction (when they prevent damage, add Defense or make you Untargetable) and Anytime Consumables are offered in the defender's Reaction Window, which stays open until the defender passes; cards played off-turn generate no printed Focus | P1 | M |
| E-R5 | *Air Horn* (`consumable.cancelReaction`) cancels an announced opposing Reaction, Consumable or Defense before it resolves; the cancelled card still completes its supply lifecycle | `app/playtest.tsx:3729-3793`, `:4516-4533`, `:3857-3876` | `engine/core.mjs:1257` (pre-emptive `restrictReaction` status on the opponent for their next Attack) | card text | approximated | No cancellation prompt; it only suppresses Reaction Items, not Defenses or Consumables | P2 | M |

## 6. Consumables

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-C1 | After resolving, a Consumable returns to supply (out of the game) unless it says Destroy | `app/playtest.tsx:1804`, `:3895-3898`, `app/consumable-effect-resolvers.ts:340-358` | `engine/core.mjs:1480` puts it in `played`, which is discarded at Hide (`:1704`) | §consumables, glossary:Consumable | same | **Fixed:** a resolved Consumable goes to its owner's `box` zone (out of the game) unless its own effect destroyed it | P1 | S |
| E-C2 | Play windows follow the card's timing: Turn (Yell), Anytime (Yell, Ascend and the defence window), Reaction (defence window), Ascend | `app/playtest.tsx:3799-3810` (`canPlayCoreConsumableInPhase`) | `engine/core.mjs:1507` | card timing field | same | **Fixed:** `definition.equipment.consumableWindows.byTiming`: Turn → Yell; Anytime → Yell, Ascend, Reaction Window; Reaction → Reaction Window; Ascend → Ascend | P1 | M |
| E-C3 | Healing modifiers (Location `modifyHealing`, next-healing reduction, minimum 1) | `app/playtest.tsx:1522` | `engine/core.mjs:1410` (raw heal); Location `modifyHealing` statuses are never read (`:1221`) | Location text | approximated | Unmodified healing | P3 | S |
| E-C4 | Consumable follow-ups armed for the Attack ("if your next Attack is Blocked, lose 1 HP"; Focus on a qualifying Attack) | `app/playtest.tsx:3658-3665`, `:4619-4626` | `engine/core.mjs:1262` checks `previousAttackBlocked` when the Consumable is played | card text | approximated | Checked at play time, not after the next Attack | P3 | S |

## 7. Katas

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-K1 | Kata played in Yell generates printed Focus plus Location Kata modifiers (*Traditional Dojo* and *Public Library*: first Kata +1; *Parking Lot*: Katas generate 0) | `app/playtest.tsx:612`, `:3880` | `engine/core.mjs:1480`; the `kataPlay` Location event is never fired | Location text | approximated | Printed Focus only (probe: *Parking Lot* still gave 1) | P2 | S |
| E-K2 | Kata deck looks, recover, recycle and equip-from-hand choices (including Gear entering ready, next-Attack power and extra Focus) | `app/playtest.tsx:3919-3932`, `:4076` | `engine/core.mjs:1001-1064`, `:1286-1288` | card text | same | — | P2 | — |
| E-K3 | Kata discounts are qualified: the Combo-learn discount applies to the next Combo learn; purchase discounts carry type and minimum-cost qualifiers | `app/playtest.tsx:4436` (`qualifiedNextComboLearnDiscount`), `:485` | `engine/core.mjs:1285` (`kata.comboDiscount` becomes a plain next-Market-purchase discount); `learnCombo` ignores discounts (`:525`) | card text | approximated | Partly fixed Nov 27: `kata.comboDiscount` is a Combo-learn discount (`comboLearnCost`) that `learnCombo` applies and consumes; Kata purchase discounts carry their minimum-cost and type qualifiers | P2 | S |
| E-K4 | Kata attack modifiers, Flow grants, piercing and restrictions | `app/playtest.tsx:1655-1700` | `engine/core.mjs:1271-1291` | card text | same | Except status qualifiers (E-S2) | P2 | — |

## 8. Equipment readiness, exhaustion and activation

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-E2 | An exhausted card cannot use exhaust abilities again until it readies; passive stats stay on while exhausted | `app/playtest.tsx:720-733` | `engine/core.mjs:258-266`, `:899` | §armor-and-gear | same | — | P1 | — |
| E-E3 | Manual activation windows per Equipment plan: Initiate with Tempo ready (+Focus); Yell next-Attack power; choose a zone for an armed effect; after a Kata (+Focus); after the first Hit (discard for Focus); after a Hit (direct damage, or Focus next Initiate); numbered-Attack power at a Belt; Speed and cycle; defence-window plans (E-D8) | `app/playtest.tsx:752` (`equipmentActivationAvailable`), `:3391-3450` | `engine/core.mjs:899`, `:1533` (Initiate only, effects marked `manualActivation`) | card text | approximated | Initiate activations plus the defence-window zone call (E-D8); the other after-event and Yell windows are still missing | P1 | M |
| E-E4 | Character equip permissions and other equip legality hooks | `app/playtest.tsx:3364` (`publishQuickDuelPlaytestEquip`) | `engine/core.mjs:170` (`cannotEquipWeapons` only) | Character text | approximated | Only the no-Weapons Character is enforced | P3 | S |

## 9. Market

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-M1 | Purchase price = printed cost + flat cost modifiers + Item penalty − Purple first-purchase discount + qualified next-purchase discounts (type, minimum cost) + Equipment purchase discounts + floors (`minimumFinalCost`) + Character price hooks; some Focus may only be spent on certain cards | `app/playtest.tsx:485-510`, `:4406-4413`, `app/stage3c-consumable-surface.ts` | `engine/core.mjs:1483` (printed + Character discount at cost ≥ 5 + Purple + every `modifyCost` status + Item penalty, floor 0) | §the-shared-market, card text | **fixed** | Fixed Nov 27: `purchasePlan()` = printed + Item penalty, then each applicable discount: Purple first-purchase, qualified statuses (card type, minimum printed cost, novel card type), the ready end-slot Equipment discount (either end), the Character price hook (once per round, 5+ only, minimum 4); each discount's floor caps how low it can go (never above the undiscounted price), floor 0. Not modelled: restricted Focus, Location purchase modifiers, and *Laminated Lunch Voucher*'s 5+/minimum-4 qualifiers (not in its data) | P1 | M |
| E-M2 | A purchase consumes only the discounts that applied to it | `app/playtest.tsx:1732` (`stage3cConsumePurchase`) | `engine/core.mjs:1497` (clears every `modifyCost` status except `endOfRound`) | card text | **fixed** | Fixed Nov 27: a purchase consumes only the `nextPurchase` discounts that applied to it | P2 | S |
| E-M3 | The end-slot (last Market position) price is known before buying (`marketEndSlot` Equipment discounts) | `app/playtest.tsx:4412`, `:5530` | `engine/core.mjs:746` (only evaluated in `onPurchase`, after paying) | card text | **fixed** | Fixed Nov 27: end-slot discounts are part of the price before buying; the Equipment exhausts on that purchase | P2 | S |
| E-M4 | The refill card takes the purchased card's slot | `app/playtest.tsx:562` (`refillPurchasedMarketSlot`) | `engine/core.mjs:1497` (`remove(this.market, card)`, then `refillMarket` appends) | §the-shared-market | **fixed** | Fixed Nov 27: the refill takes the purchased card's slot | P2 | S |
| E-M5 | Buy any number of cards one at a time; refill immediately; reshuffle the Market discard when the deck empties | `app/playtest.tsx:546`, `:4406` | `engine/core.mjs:331`, `:1492` | §the-shared-market, §when-a-shared-deck-empties | same | — | P1 | — |

## 10. Combos

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-CB1 | One Combo attempt per Ascend: pay to learn (at most 2 known) or return it to the bottom | `app/playtest.tsx:4432` | `engine/core.mjs:488-537` | §learning-combos | same | The offer model differs (see Contradictions) | P1 | — |
| E-CB2 | A Combo that completes at Attack declaration keeps a session, so its `onHit` and `afterResolve` payoffs still resolve later in the same strike | `app/quick-duel-combo-executor.ts` (`activateQuickDuelComboPlan`, `publishQuickDuelComboTrigger`) | `engine/core.mjs:599` with `engine/combo-runtime.mjs:222` (the first eligible trigger marks the Combo used for the round; later triggers are refused) | §combo-timing-modifier-vs-aftermath | **fixed** | Fixed Nov 27: a Combo completes at the first trigger whose requirements hold; within the same strike its later parts (on Hit, after resolve) pay out without re-checking requirements or counting a second trigger, and its passive part applies once on completion (`activateCombos`, `resolveComboPart`). Test: `tests/engine-combos-characters.test.mjs` | P1 | S |
| E-CB3 | Deferred payoffs are installed as statuses: next-turn Attack bonus, next Initiate draw or discard, next-round Speed for the target | `app/quick-duel-combo-executor.ts:84-112`, `app/playtest.tsx:1643` | `engine/core.mjs:1305` plus the generic actions (`nextHonor` Speed on the wrong player, never read; no `nextInitiate`) | card text | approximated | Partly fixed Nov 27: "that opponent gets −X Speed next round" (`combo.nextRoundSpeed`) is a `nextRound` status on the target that becomes current Speed at the next Honor; the next-Reaction penalty is recorded on the target (`reactionPenalty`) but nothing reads it yet. Next-Initiate draws already work through `onInitiate` Combos | P2 | M |
| E-CB4 | Combo choices, for example "you may discard that Weapon; if you do, +4" | `app/quick-duel-combo-executor.ts:142-160` | `engine/core.mjs:1305` (`combo.discardWeaponChoice` discards the first Weapon automatically) | card text | approximated | No choice, so the payoff becomes mandatory | P3 | S |
| E-CB5 | A Combo is limited only by its printed limit ("Once per turn" / "Once per round") | `app/quick-duel-combo-session-host.ts` | `engine/combo-runtime.mjs:222` (every Combo at most once per round) | §combo-timing-modifier-vs-aftermath | approximated | Unlimited Combos cannot repeat (for example on a Reversal) | P3 | S |

## 11. Belts, exams, promotion and Training Stripes

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-B1 | Exam tracking: three zones, two Attacks with one Hit in one Yell, Equipment count, Combo triggered | `app/playtest.tsx:5252-5268` | `engine/core.mjs:403-426` | §belt-table, §task-clarifications | same | — | P1 | — |
| E-B2 | Brown exam: 4 cards played or equipped in one turn (Attacks count) including an Attack, a Kata, and Equipment or a Consumable | `app/playtest.tsx:5261-5264` (`cardsThisTurn` includes Attacks) | `engine/core.mjs:421` (`playsThisTurn` counts only `playCard`, `:1480`; `resolveAttack` does not increment it) | §task-clarifications (Four-Card Mastery) | **fixed** | Fixed Nov 27: an Attack counts as a card played this turn | P2 | S |
| E-B3 | Promotion: enough XP, exam passed, one Belt Check action per turn; rewards are Gold +2 Focus, +1 ATK / +1 Speed / +1 DEF, Purple discount, Blue hand size; no HP change in Quick Duel | `app/playtest.tsx:4455`, `:5323` | `engine/core.mjs:555-581` | §promotion-rules, §quick-duel | same | — | P1 | — |
| E-B4 | Red Belt reward: a 3+ damage Hit gains 1 Focus | `app/playtest.tsx:3694` (every such Hit) | `engine/core.mjs:1446` (first 3+ Hit each turn) | §belt-table (Red) | same | Same reward; the engine follows the printed "first each turn", the mat over-awards (see Contradictions) | P2 | — |
| E-B5 | Training Stripes: provisional stripe at Ascend when XP is met but the exam is incomplete; reconciled if an Ascend purchase completes the exam; finalized when leaving Ascend; spend 1 to recover 2 HP as the Belt Check action; cleared on promotion | `app/quick-duel-transition-host.ts:459-476`, `app/training-stripes.ts:98-208`, `app/playtest.tsx:3145` | `engine/core.mjs:540`, `:583`, `:505`, `:1678` | DDB-RUL-114, `progression.trainingStripes` | same | — | P2 | — |
| E-B6 | Training Stripes apply only to modes that enable them (`modes[].trainingStripes`) | the mat runs them in every mode (`app/quick-duel-transition-host.ts:457`) | `engine/core.mjs:540` (checks only `progression.trainingStripes.enabled`) | DDB-RUL-114 | **fixed** | Fixed Nov 27: the engine reads `modes[].trainingStripes` | P3 | S |

## 12. Locations and scene changes

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-L1 | The Location deck for Quick Duel (and the mat's Tag Team and Boss Blitz) is a fixed pool of 12 named Locations, `QUICK_DUEL_LOCATION_NAMES`: *City Bus in Motion*, *Community Ice Rink*, *Concrete Stairwell*, *Parking Garage Spiral*, *Public Library*, *Rain-Slick Alley*, *River Dock*, *School Gymnasium*, *Strip-Mall McDojo*, *Tournament Mat*, *Traditional Dojo*, *Yoga Studio* | `app/playtest.tsx:368-382`, used at `:3325`, `:5410`, `:5503`, `:5581` | `engine/core.mjs:180` (every one of the 53 `cardType === "Location"` cards) | none in `rules.json`; mat-only curation | missing | The engine plays all 53 Locations, including the 41 whose events (purchase, healing, round start, scene reveal, KO, …) neither runtime supports in live play. Fix: put the pool in `content/dojo-game.json` as catalog IDs (or a tag) on the `quick-duel` mode, never as names in code. Designer question Q4 | P1 | S |
| E-L2 | Scene Change at every Honor; after a non-final KO in Tag Team and Boss Blitz (the mat flags `nonHonorSceneChangedThisRound`) | `app/playtest.tsx:5581-5582`, `:5410-5415` | `engine/core.mjs:1696`, `:1956` (after a KO); `nonHonorSceneChangedThisRound` is never set in context | §locations-and-scene-changes | approximated | `attack.final.cycle`'s "after a non-Honor Scene Change" condition is never true | P3 | S |
| E-L3 | Live Location modifiers: Attack Power and damage (matching zone, tags, Weapon tags, first Attack); Defense Guard (only with a Defense card); first-Kata Focus | `app/playtest.tsx:588-617` (via `app/location-playtest-bridge.ts:69-138`) | `engine/core.mjs:636` (only "attack" and "defense" events; no damage modifier; `equipmentTagAny` reads the Location's own tags, `:685`) | Location text | approximated | Partly fixed: E-A8's triple application is gone; Location tag, zone and Speed conditions (`attackTagAny`, `defenseZone`, `selfSpeedAtLeast`, `isSlowest`, `firstLowAttackThisTurn`) are now live predicates instead of skipped parameters (before, *River Dock*'s Push +2 and *Rain-Slick Alley*'s Spin −1 hit every Attack); Weapon-tag bonuses read the Weapon's tags (E-A14); Guard only with a Defense card (E-D12). Still missing: Location damage modifiers, and "Two-Handed" Weapon text (no Weapon carries that tag; Hands live in `stats.Hands`) | P1 | M |
| E-L4 | Location-created effects expire with their duration (the mat keeps them in per-turn or per-round host state) | `app/location-runtime.ts:164-193` | `engine/core.mjs:1221-1228` creates statuses with durations `round`, `scene` and `turn`, which nothing expires | Location text | approximated | Healing, XP and damage-reduction modifiers become permanent and stack. Inside the 12-card pool this mostly concerns *Traditional Dojo* and *Public Library* Kata Focus (`turn`) | P2 | S |

## 13. Character abilities

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-CH1 | Green abilities unlock only at Green Belt or higher | `app/character-runtime.ts:4` (`greenCharacterAbilityUnlocked`) and the routes at `:123-137` | none; the 29 `character.green.*` effects carry no Belt condition in the data, and the engine adds no gate | §character-card-information (Green Ability) | **fixed** | Fixed Nov 27: Green abilities (the `character.green.` resolver namespace) unlock at the Belt named in `definition.progression.greenAbility` (Green) | P1 | S |
| E-CH2 | Character effects fire on 20 event types: round start, turn start, Initiate, card played, card modified, discarded, Speed changed, Attack declared, incoming Attack declared, Hit, Block, damage incoming, equip, Kata played, Combo reveal, purchase attempt, promotion, Scene Change, reboot, Hide. Choices pause the Attack and resume it (`character-runtime` pending choice) | `app/quick-duel-character-event-routes.ts`, `app/playtest.tsx:3514-3524`, `:4252-4280` | `engine/core.mjs:1678` (`onInitiate`), `:1451-1452` (`onHit`, `onBlock`), `:1438` (two linked passives), `:238-247` (Junk discard), `:1485` (purchase floor) | §ability-types-limits | **fixed** | Fixed Nov 27: `engine/character-abilities.mjs` implements every Character resolver except *Ronin Reroll* (`character.revealReplacementOnceGame`, still untriggered) on 17 engine events, with per-ability turn/round/game limits; Attack zone changes are offered in the `attack-zone` choice (Miss Direction's discard is paid before Defense), Blurred Monk's slow choice opens before the Defense window, choices queue behind any open choice. Limits: "an opponent modifies your card" fires only for opposing next-Attack penalties and Guard penalties; Gramma Uppercut's once-per-game ability is spent automatically on the first strike with a temporary bonus | P1 | L |
| E-CH3 | Once-per-turn, round and game limits are tracked per Character card | `app/playtest.tsx:185-187` (`usedCharacterEffectIds*`) | `engine/core.mjs:322-330` (per player and effect id) | §ability-types-limits, DDB-RUL-105 | same | Same in one-fighter modes | P3 | — |

## 14. Statuses and durations

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-S1 | Duration vocabulary: `nextTurn`, `nextInitiate`, `endOfTurn`, `endOfRound`, `nextHonor`, `nextRound`, `endOfTargetNextTurn` (delayed damage), `nextAttack`, `nextDefense`, `nextIncomingAttack`, `nextKata`, `nextPurchase`, next Combo learn; damage prevention expires at the next Initiate | `app/playtest.tsx:1591-1750`, `app/structured-damage-prevention.ts` | `engine/core.mjs:285-312` (expires `endOfTurn`, `endOfRound`, `nextHonor`; consumes `nextAttack`, `nextDefense`, `nextIncomingAttack`; `nextPurchase` is cleared on any purchase) | §status-effects | **fixed** | Fixed Nov 27: `nextTurn` (holder's next Initiate), `duringNextTurn`, `nextInitiate` (payload at Initiate), `nextRound` (activates at Honor), `endOfTargetNextTurn` (delayed damage at the holder's Hide), `nextKata`, `scene`, and engine `turn`/`round` aliases; any status may carry an `expires` moment; "this turn" statuses end for every player at the end of the active turn. Deferred statuses no longer count as standing modifiers; next-Defense Guard waits for a Defense card; "prevent damage from the next Attack" is consumed by the next incoming strike | P1 | M |
| E-S2 | Next-Attack statuses carry qualifiers (Attack tag, zone, normal or Reversal) and are consumed only by a matching Attack | `app/playtest.tsx:1655-1702` | `engine/core.mjs:285-305` (consumed by any Attack) | card text | approximated | Partly fixed Nov 27: next-Attack statuses may carry `zone`, `tag` and `targetId` qualifiers and are consumed only by a matching Attack (used by Character abilities); card-created statuses do not set qualifiers yet | P2 | S |
| E-S3 | Temporary Speed modifiers change current Speed until they expire | `app/playtest.tsx:1591-1600`, `:1891` | `engine/core.mjs:1406` (a `modifySpeed` status is written and never read; no `statusValue(…, "modifySpeed")` exists) | glossary:Current Speed, DDB-RUL-003 | same | Fixed: `modifySpeed` statuses count in `currentSpeed()` (with until-Hide changes, equipped Speed and floors; `nextRound` statuses count once Honor activates them), which initiative, Tempo and every Speed condition read; Speed changes are Character `speedChanged` events | P1 | — |
| E-S4 | "Until your next turn" ends at the controller's Initiate | `app/playtest.tsx:1612` (`nextTurn` at Initiate) | `engine/core.mjs:1373` (`nextHonor`) | §status-effects | **fixed** | Fixed Nov 27: untargetable, `modifyDefenseUntilNextTurn` and Equipment "until your next Initiate" Defense use `nextTurn` | P3 | S |
| E-S5 | The player chooses which temporary negative modifier or status to remove (*Pep Talk*, *healAndRemoveStatus*) | `app/playtest.tsx:4289-4307` | `engine/core.mjs:273-283` (removes the first matching negative) | card text | approximated | No choice | P3 | S |

## 15. Knockouts, round cap and victory

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-V1 | Quick Duel ends when a fighter reaches 0 HP, including self-inflicted HP loss; last fighter standing wins; no Black Belt victory | `app/playtest.tsx:3724`, `:4719` | `engine/core.mjs:1706` | §quick-duel, DDB-RUL-103 | same | — | P1 | — |
| E-V2 | KO gives the responsible player +2 XP | `app/playtest.tsx:3695`, `:4713` | `engine/core.mjs:1888` (non-legacy modes only) | §knockout-procedure step 3 | approximated | Not awarded in legacy Quick Duel. Harmless because the game ends, but the event log and stats differ | P3 | S |

## 16. Tag Team and Boss Blitz (mat bolt-ons)

| ID | Rule behaviour the mat enforces | Mat reference | Engine reference | Rule source | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E-TT1 | The owner chooses the KO replacement (pre-declared "next in", otherwise highest HP) | `app/tag-team.ts:103-108`, `app/playtest.tsx:4453` | `engine/core.mjs:1899-1902` (automatic: highest HP) | DDB-RUL-115 | approximated | Needs a replacement choice for the owner | P2 | S |
| E-TT2 | Tag once during Initiate, before any card is played; tagging does not refresh Tempo | `app/tag-team.ts:87-89` | `engine/core.mjs:1813-1822` (before equipping) | §tagging | same | — | P2 | — |

Boss Blitz was not audited row by row. The engine has its own `engine/boss-blitz.mjs` (Arsenal, enrage,
stage victory, DDB-RUL-001/002/108/109/111) and the mat has `app/boss-blitz.ts` plus Profile rules applied
in `app/playtest.tsx:5422-5447`. A separate pass should compare those two files once the core rows above
are fixed.

## 17. Card-specific flows in the mat, by card family

These are the mat's `pendingChoice` kinds (`app/playtest.tsx:231-263`) and hard-coded flows. Fixes must be
generic resolvers with JSON parameters.

### Attacks

| ID | Flow (mat `pendingChoice`) | Mat reference | Engine reference | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E-X1 | `attack-option`: Hit choices for *Courtesy-Notice Knee* (next Item +1 Focus, or next Defense −1 Guard), *Discount Dim Mak* (target loses Tempo, or +1 Focus), *Tornado Crescent Kick* (+1 Focus, or discard then draw) | `app/playtest.tsx:4214-4250` | `engine/core.mjs:1066-1075`, `:1319-1329` | same | Behaviour matches, but the engine hard-codes option sets on `choiceKind` strings (`courtesy-notice`, `discount-dim-mak`); they should be listed in JSON | P2 | S |
| E-X2 | `attack-equipment-target`: choose an opposing Equipment to suppress (`attack.final.equipmentSuppression`) | `app/playtest.tsx:4036-4046` | routed to `modifyGuard` on the attacker (`engine/core.mjs:1407`) | missing | — | P2 | S |
| E-X3 | `ready-equipment`: ready an exhausted Equipment of your choice on Hit (`attack.readyEquipmentOnHit`) | `app/playtest.tsx:4195-4199` | `engine/core.mjs:1397-1402` (the first exhausted card) | approximated | No choice | P3 | S |
| E-X4 | `discard-hand` / `discard-draw` after-resolve cycles (`attack.conditionalCycle`, `attack.optionalDiscardDraw`) | `app/playtest.tsx:4154-4212` | `engine/core.mjs:959-1000` | same | — | P2 | — |

### Defenses

| ID | Flow | Mat reference | Engine reference | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E-X5 | Block discard choice (`defense.discardChoice`) resumes combat afterwards | `app/playtest.tsx:4684-4696`, `:4154-4171` | `engine/core.mjs:1394-1396` | same | — | P2 | — |
| E-X6 | `defense.equipmentChoice`: ready or exhaust a chosen Equipment on Block | `app/defense-effect-resolvers.ts` | `engine/core.mjs:1397-1402` (the first matching card) | approximated | No choice | P3 | S |

### Consumables (`stage3c-*`)

| ID | Flow | Mat reference | Engine reference | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E-X7 | `stage3c-raffle`, *Dojo Raffle Ticket*: during Ascend, reveal the top Market Deck card; buy it at its Market price or put it on the bottom | `app/playtest.tsx:3958-3964`, `:4309-4324` | `engine/core.mjs:1258` (+1 Focus) | approximated | A different effect entirely | P2 | M |
| E-X8 | `stage3c-lucky-reveal`, *Lucky Dumpling*: when a Market card (purchase refill or Market Mercy) or a Location is revealed, replace it from the same deck; can be cancelled by *Air Horn*. The mat finds it by the hard-coded catalog ID `DDB-CON-CORE-033` | `app/playtest.tsx:4427`, `:5599-5605`, `:4326-4352` | `engine/core.mjs:1260` (draw 1) | missing | Needs a generic "card revealed" Reaction window driven by the resolver, never the ID | P2 | M |
| E-X9 | `stage3c-trail-mix`, *Department-Issue Trail Mix*: optionally exhaust a chosen ready Equipment to draw 1, then discard 1 | `app/playtest.tsx:3953-3957`, `:4089-4095` | generic `exhaust` + `draw` + `discard` (first Equipment, not optional) | approximated | — | P3 | S |
| E-X10 | `stage3c-zone-ward`, *Foam Finger*: call a zone; the next Attack in that zone targeting you this round gets −2 | `app/playtest.tsx:3965-3968`, `:4282-4287` | `modifyAttackPower` `nextAttack` on the opponent, with no zone (`engine/core.mjs:1404`) | approximated | The zone qualifier is lost | P2 | S |
| E-X11 | `stage3c-discard-focus`, *Last-Call Electrolytes*: discard up to 2 cards, +2 Focus each | `app/playtest.tsx:3986-3989`, `:4097-4103` | generic `discard` + `gainFocus` | approximated | Fixed amounts, no "up to" | P3 | S |
| E-X12 | `stage3c-weapon-suppress`, *Muscle Ointment*: suppress a chosen Weapon's negative stats until Hide | `app/playtest.tsx:3990-3994`, `:4105-4109` | `engine/core.mjs:1261` (status `suppressWeaponClause`, never read) | missing | — | P3 | S |
| E-X13 | `stage3c-exhaust-focus`, *Receipt-Printer Ribbon*: exhaust a chosen ready Equipment for +3 Focus | `app/playtest.tsx:3995-3999`, `:4111-4115` | generic `exhaust` + `gainFocus` | approximated | No choice | P3 | S |
| E-X14 | `stage3c-sparring-pick` and `-junk`, *Sparring Dummy*: reveal 3, take an Attack, discard the rest, optionally destroy one discarded Junk | `app/playtest.tsx:1794`, `:4123-4137` | `engine/core.mjs:984` (deck look, rest discarded) | approximated | The Junk-destroy follow-up is missing | P3 | S |
| E-X15 | `stage3c-reaction-discard`, *Confetti Cannon*: the opponent discards a Reaction-timed card if able | `app/playtest.tsx:3945-3951`, `:4117-4121` | generic opponent `discard` (any card) | approximated | No Reaction filter | P3 | S |
| E-X16 | *Smoke Bomb* in the defence window cancels the incoming strike and ends the AI's Yell | `app/playtest.tsx:4000-4003` | `engine/core.mjs:1370` (status only, own turn only) | same | **Fixed:** a defender who becomes Untargetable in the Reaction Window spends the strike (`attack-spent` event); no further Attack can target them | P2 | S |
| E-X17 | `deck-order`: reorder the top three; +1 Focus if all three types differ | `app/playtest.tsx:3969-3976`, `:4184-4193` | `engine/core.mjs:984-1000`, `:1642-1656` | same | — | P3 | — |

### Equipment

| ID | Flow | Mat reference | Engine reference | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E-X18 | `equipment-attack-response`: the defender's Equipment forces a discard before Defense, or prevents the Attack's damage, when the Attack is declared | `app/playtest.tsx:1254-1287`, `:4064-4068` | none (Equipment `onAttackDeclared` never fires, E-A15) | same | **Fixed:** *No Soliciting Sign* offers the attacker `discard:<id>` / `retarget:<seat>`; *Cardboard Cutout* prevents the strike and destroys itself | P2 | S |
| E-X19 | `equipment-zone` and `incoming-equipment-zone`: choose the zone for an armed Equipment effect, or call the incoming zone | `app/playtest.tsx:3452-3468` | none (E-E3, E-D8) | approximated | **Partly fixed:** `incoming-zone` and `next-attack-zone` calls are recorded with their source card and read (`armedEquipmentZoneMatched`, incoming payoffs); the piercing payoff of *Laminated Floor Plan* still ignores the zone | P2 | S |
| E-X20 | `equipment-purchase-card`: after buying, file a hand card at the bottom of your deck and draw 1 at the next Initiate | `app/playtest.tsx:4421-4424`, `:4070-4074` | none (no `nextInitiate`, E-T4) | missing | — | P3 | S |

### Katas

| ID | Flow | Mat reference | Engine reference | Status | Engine difference | Pri | Est |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E-X21 | `kata-equip-from-hand`, plus `deck-pick` with filters (Defense-or-Kata, Technique, Item) and rest actions (discard, reorder, shuffle) | `app/playtest.tsx:3919-3932`, `:4076-4087`, `:4173-4182` | `engine/core.mjs:1001-1064`, `:984-1000` | same | — | P2 | — |

### Hard-coded identities found in the mat

- `DDB-CON-CORE-033` (*Lucky Dumpling*): `app/playtest.tsx:4427`, `:5599`.
- `QUICK_DUEL_LOCATION_NAMES` (12 Location names): `app/playtest.tsx:368`.
- Card family by catalog-ID substring (`-ATK-`, `-DEF-`, `-KAT-`) and by `DDB-*-CORE-` prefix:
  `app/playtest.tsx:421-423`, `:1387-1392`, `app/consumable-effect-resolvers.ts:342`.
- *Tournament Mat* by name when Locations are off: `app/playtest.tsx:3329` (table option, other worker).

Engine-side identity checks that should also go: the `String(effect.id).endsWith("dodge-block-cycle")`
branch (`engine/core.mjs:1350`); the hard-coded *Courtesy* and *Dim Mak* option sets (`:1068-1072`); the
fixed `branchDraw 2 / branchFocus 1 / branchDefense 1` for `kata.discardBranch` (`:1139`); and the
`cost >= 5` threshold in the Character market discount (`:1118`, `:1485`), which belongs in JSON.

### Mat gaps (the engine is not behind here)

- `fire-drill-discard`, `fire-drill-zone` and `attack-cost-discard` are declared in `PendingChoice`
  (`app/playtest.tsx:245-247`) but nothing produces them. `finalAttackFireDrillFeint` and
  `finalAttackOptionalAttackCost` (`app/attack-final-effects.ts:170-189`) are never called. *Fire Drill
  Feint* and the optional Attack cost are not implemented in the mat. The engine approximates the first
  (`engine/core.mjs:1105`: queues a discard only) and treats the second as an unconditional bonus. Implement
  both from the card text, not from the mat.
- The mat has no opening mulligan and no round cap (see Contradictions).
- The engine's baseline bot never equips permanent Equipment (`defaultAction`, `engine/core.mjs:1708`, has
  no Initiate equip branch), so baseline simulations never exercise Equipment. This is AI policy (other
  worker), but simulation results depend on it.

## 18. Where the mat contradicts the rulebook (the engine should follow the rulebook)

1. **No opening mulligan.** `emptyBoard` draws 7 with no check (`app/playtest.tsx:1991`). The rulebook
   requires one mulligan when the hand has no Attack and no Kata (§setup-steps step 5). The engine does
   it (`engine/core.mjs:196`).
2. **Off-turn Defense cards generate Focus.** `applyCardEffects(…, "onPlay")` defaults to
   `grantPrintedFocus = true`, for the AI defender (`app/playtest.tsx:3675`) and the human defender
   (`:4571`). The rulebook says cards played outside your own turn generate no Focus (§focus-purchasing-power).
   The engine has the same bug (`engine/core.mjs:1440`).
3. **Speed ties.** The human (seat 0) always wins ties and there is no referee marker
   (`app/playtest.tsx:3330`, `:5590`). This contradicts §honor-phase step 5 and DDB-RUL-112. The engine's
   legacy Quick Duel copies it (`engine/core.mjs:1875`); its other modes rotate the referee.
4. **Equipment readies at Honor, not at the controller's Initiate** (`app/playtest.tsx:5583-5584`;
   §armor-and-gear). For the second player, Equipment exhausted during the first player's turn should
   ready at their own Initiate in the same round.
5. **A Reversal is offered after a Block by standing DEF or Armor with no Defense card**
   (`app/playtest.tsx:4734`). §reversal requires "a Defense card you played". Passed to the Reversal worker.
6. **Red Belt impact Focus** is given for every 3+ damage Hit (`app/playtest.tsx:3694`). The Belt Table
   says the first such Hit each turn; the engine does that.
7. **Purple exam types** are counted by `cardType` ("Technique" / "Item", `app/playtest.tsx:4418`,
   `:5534`). §task-clarifications counts Attack, Defense, Kata and Item. The engine counts card types
   (`engine/core.mjs:1497`).
8. **Green exam** passes on any Block flag plus any Defense played that round (`app/playtest.tsx:5257`).
   §task-clarifications requires the Defense itself to Block. The engine checks a Defense-card Block.
9. **Tempo is applied automatically and asymmetrically.** It is never offered as optional (§tempo-advantage:
   "Using Tempo is optional"), and the mat AI never gets Tempo Guard when defending. The engine now gives
   Tempo to either side only when faster (owner decision 3), still automatically.
10. **Training Stripes run in Tag Team and Boss Blitz** (`app/quick-duel-transition-host.ts:457-476`).
    DDB-RUL-114 limits them to Quick Duel.
11. **No round cap.** DDB-RUL-102 gives digital play a per-mode cap with tiebreakers: conscious fighters,
    total HP, Belt, XP, Sudden Death. The engine's legacy Quick Duel cap (40 rounds) breaks ties by HP and
    then at random (`engine/core.mjs:1706`); its other modes use the full list (`:1915`).
12. **Data contradicted the rulebook (fixed).** `content/dojo-game.json` named the fields `attackXpOnHit`
    and `defenseXpOnBlock`, and the engine read them as "XP only on Hit / Block". They are now
    `xpPerLegalAttack` and `xpPerLegalDefense`, awarded every time. §attack-sequence step 8
    and §how-to-earn-xp say XP is awarded whether the Attack Hits or the Defense Blocks. The mat follows
    the rulebook.
13. **Shared defect: Starter Attacks are not Attacks for Combos.** Both Combo runtimes test
    `subtype/cardType === "attack"` or an "attack" tag (`engine/combo-runtime.mjs:8`,
    `app/combo-runtime.ts:199`). *Basic Jab*, *Basic Body Kick*, *Basic Shin Kick* and *Wild Swing* are
    subtype `Starter`, so they never satisfy an Attack step (probe). §standard-starter-deck lists them as
    Attacks.
14. **Shared defect: "if the first Attack Hit" Combo conditions are missing from the data.** For example,
    *Swan Song* says "If the opening Kick Hit…", but `combo-requirements.json` has no `hit: true` on the
    opening step. Both runtimes pay out on a Blocked opener.
15. **Combo offer model.** The mat shows one shared face-up Combo offer for both players
    (`app/playtest.tsx:4432`, `comboOfferId`). §ascend-phase says each player reveals the top Combo
    during their own Ascend and returns it face down if not learned. The engine does that
    (`engine/core.mjs:488-500`).

Rulebook rules that neither runtime implements (for the backlog, not parity): Armor slot limits (one item
per slot; equipping into an occupied slot discards the old item, §equipping-permanent-equipment), Interfere,
the anti-loop XP rule (§how-to-earn-xp), the Stunned, Silenced and Disarmed statuses, non-retroactive Belt
Exams (purchase types and zones are counted from game start), and optional Tempo.

## 19. Rules questions for the designer

1. **Prevented damage.** If damage prevention reduces a strike to 0, is it a Hit (mat: Attack Power beat
   Defense) or a Block (engine: no damage dealt)? This decides on-Hit effects, Hit counts for exams and
   Combos, and the Reversal trigger.
2. **Off-turn Focus from Defense cards.** Confirm the rulebook: a Defense card played on the opponent's
   turn generates no printed Focus. Both runtimes currently grant it.
3. **Attack and Defense XP.** Done provisionally as the rulebook says ("always"); the fields are now
   `xpPerLegalAttack` / `xpPerLegalDefense`.
4. **Quick Duel Location pool.** Keep the 12-Location pool as canonical data on the `quick-duel` mode (and
   should Tag Team and Dojo Drama use it, as the mat does), or open all 53 once their events are supported?
5. **Starter Attacks and Combos.** Do Starter Attacks count as Attacks for Combo requirements? The rulebook
   implies yes; both runtimes say no.
6. **Equipment readiness.** Ready at the controller's Initiate (rulebook) or at Honor (mat)?
7. **Optional Tempo.** Should the engine present Tempo as a choice on each eligible Attack and Defense, or
   apply it automatically whenever legal?
8. **Quick Duel Speed ties and round cap.** Adopt the referee rotation of DDB-RUL-112 and the full
   tiebreak list of DDB-RUL-102 for Quick Duel? This changes the certified Quick Duel fingerprint.
9. **Combo limits.** May a Combo with no printed limit trigger more than once per round (for example once
   on your turn and again on a Reversal)?
10. **"If the first … Hit" Combos.** Add Hit requirements to `combo-requirements.json` for *Swan Song* and
    similar Modifier Combos?
11. **Reaction Items.** Destroyed or discarded after use? The mat destroys; the engine discards; card text
    says "Destroy this".
12. **Hit before or after Location damage modifiers.** The mat adds Location and Character damage modifiers
    only after a Hit is established. May a damage bonus turn a 0-damage strike into a Hit?
