# Decisions waiting on the owner

Collected while moving every rule onto the shared engine (Nov 26–27, 2026). Each item lists what
the engine does **right now** (the provisional choice) so the game keeps working until you decide.
Reply with the item numbers you want changed; everything not mentioned stays as is.

## Answered (Nov 26)

| # | Decision | Status |
| --- | --- | --- |
| 1 | Difficulty is computer skill only (Student / Certified / Master); every opponent has rulebook HP and stats. No hidden handicaps, which also keeps online play fair. (Owner: "your best judgement".) | Done in the engine table |
| 2 | Quick Duel uses every Location. | Done (engine default) |
| 3 | Tempo follows the rulebook: only against a slower fighter, and usable on a Defense for +1 Guard. | Done |
| 4 | "Tempo off" means no fighter has Tempo (unchanged; owner unsure). | Unchanged |
| 5 | Locations off means no Location at all. | To do |
| 6 | Drop the Open Market option once the missing Weapon art lands. | Waiting on art |
| 7 | Piercing ignores Armor only. | Done |
| 8–11 | Reversal choices as implemented (Tempo spent, next-Attack bonuses used, declining keeps the once-per-round Reversal, Temporary Tattoo Pass reading). | Kept |
| 12 | Witness Protection Stance lasts until the end of your next turn. | To do |
| 13 | Reversal-or-next-Attack bonuses as implemented. | Kept |
| 14 | Clock In, Block Out gets a Reversal step in its requirements. | In progress |
| 15 | A Reversal doesn't count as "an Attack this turn" but counts for Honor-scoped exams. | Kept |

## A. Quick Duel on the engine

1. **Difficulty.** The old mat's Student / Certified / Grandmaster also changed the computer's HP
   (20 / 25 / 35) and gave Grandmaster +1 stats. The engine mat currently plays every opponent at the
   rulebook's 25 HP and only changes how well the computer plays. *Keep difficulty as skill only, or
   make the HP/stat handicap a named table option?*
2. **Quick Duel Location pool.** The old mat used 12 named Locations for Quick Duel; the engine draws
   from every Location. *Restrict Quick Duel to a list in `content/dojo-game.json`, or use them all?*
3. **Tempo needs a faster fighter.** The rulebook and old mat give Tempo only against a slower
   opponent and allow it on a Defense (+1 Guard); the engine spends it on the first Attack of the round
   regardless of Speed. *Fix to the rulebook?* (Changes balance numbers.)
4. **Tempo switched off** means "no fighter ever has Tempo" (also turns off "if you have Tempo" card
   conditions). *Or only remove the +1 bonus, as the old mat did?*
5. **Locations switched off** keeps a fixed Tournament Mat (which has its own rule) in play. *Or no
   Location at all?*
6. **Open Market** is really an art-readiness filter (20 Weapons without art). *Drop the option once
   their art lands?*
7. **Piercing** ignores all Defense in the engine; the rulebook says it ignores Armor only. *Fix?*

## B. Reversals

8. A Reversal spends the defender's unused Tempo. *OK?*
9. A Reversal uses up "next Attack" power and piercing bonuses. *OK?*
10. Declining a Reversal window keeps your once-per-round Reversal for a later Block. *OK?*
11. Temporary Tattoo Pass "if you do not make a Reversal" = this Block's window closed without one. *OK?*
12. **Witness Protection Stance** has no effect as written (its protection ends before anyone can
    Reverse you). *Should it last until the end of your next turn?*
13. Green Counter-Signature and Rental Chair Recoil read as Reversal bonuses but their data says "next
    Attack": the engine gives the bonus to a Reversal if you make one, otherwise to your next Attack. *OK?*
14. **Clock In, Block Out** says "your Reversal" but its requirements have no Reversal step, so it
    also fires on normal attacks. *Add a Reversal step to its canonical requirements?*
15. A Reversal does not count as "an Attack this turn" (turn counters, "two attacks hit this turn",
    impact Focus) but does count for the Honor-scoped exams. *OK?*
16. Tag Team: if the attacker was swapped out before the window opens, the window is void. *OK?*

## C. Weapons and table options

17. A Weapon that doesn't fit **replaces** equipped Weapons (rulebook: "Replacing an occupied slot
    discards the old Equipment first"); the old mat blocked it instead. *Replace or block?*
18. The player picks which Weapon(s) to replace among the smallest sets that free enough Hands. *OK?*
19. A "no two-handed Weapon" restriction is checked only when equipping a Weapon. *OK?*
20. Only subtype Weapon uses Hands; a Weapon with no printed Hands uses 1. *OK?*
21. Fast Belts applies in every mode (including Black Belt Victory and Boss Blitz). *OK?*
22. House rules only have a Quick Duel status. *Should Steal the Belt and Friendly Fire get rules for
    Clash and Tag Team?* (Skipped until there's a spec.)

## D. Packs and progression (proposal in `docs/packs-and-progression-plan.md`, data in `content/packs.json`)

23. **Collection model:** every card owned by anyone at the table goes into one shared Market for
    that match (fair, and works for peer-to-peer play). *Approve?*
24. **Open Dojo** (full catalog, earns nothing) is always one toggle away. *Approve?*
25. Only the 500 main-pool cards are collectible; starters, all Characters and Bosses stay free. *Approve?*
26. Everyone gets the Orientation Kit and picks one of three Starter Kits; the other two unlock at
    levels 5 and 9. *Approve?*
27. Eight themed booster series, 5-card packs; you choose which unlocked series to open. *Approve?*
28. Rarity names and odds: Plain Paper 50%, Carbon Copy 30%, Brass Seal 15%, Black Ink 5%; rarity is
    about how soon you find a card, not power. *Approve or rename?*
29. No duplicates: packs only roll cards you don't own; once complete, tickets turn into Merit. *Approve?*
30. Earn rates: a win = 1 Booster Ticket, a loss = 1 Ticket Stub (3 stubs = 1 ticket), plus small
    daily/streak/Master/promotion bonuses; about 75 matches to complete. *Approve?*
31. Career naming: Merit, Clearance Level 1–30, Diplomas (never "Belt" or "XP"). *Approve?*
32. Four series open at the start; the rest unlock at levels 4, 6, 8, 10. *Approve?*
33. Rewards by table type: vs computer and online pay fully, local hot-seat pays Merit only, Open Dojo
    pays nothing; a match must reach round 3 to pay; no anti-cheat. *Approve?*
34. Storage: this browser only, with backup and export/import codes (no accounts). *Approve?*
35. The pack membership lists are a first pass by script. *Please review them, especially the
    Orientation Kit and each series' Black Ink cards, before they go live.*

## E. Rules questions from the parity audit (`docs/engine-parity-audit.md` §18–19)

36. **Prevented damage.** If prevention reduces a strike to 0, is it a Hit (old mat) or a Block
    (engine)? This decides on-Hit effects, exam and Combo Hit counts, and whether a Reversal can follow.
37. **Off-turn Focus.** The rulebook says a Defense played on the opponent's turn generates no Focus;
    both runtimes currently grant it. *Follow the rulebook?*
38. **Attack and Defense XP** are awarded whether you Hit or Block (rulebook, old mat). The engine's
    data names (`attackXpOnHit`, `defenseXpOnBlock`) say otherwise. *Confirm "always".*
39. **Starter Attacks** (Basic Jab, Basic Body Kick, Basic Shin Kick, Wild Swing) don't count as
    Attacks for Combos in either runtime. *Should they?*
40. **Equipment readies** at its controller's Initiate (rulebook) or at Honor (old mat)?
41. **Optional Tempo.** The rulebook says using Tempo is optional; both runtimes apply it
    automatically. *Offer it as a choice?*
42. **Quick Duel Speed ties and round cap.** Adopt the referee rotation (DDB-RUL-112) and full
    tiebreak list (DDB-RUL-102) for Quick Duel too?
43. **Combo limits.** Can a Combo with no printed limit fire more than once a round?
44. **"If the first … Hit" Combos** (e.g. Swan Song) have no Hit requirement in the data. *Add them?*
45. **Reaction Items**: destroyed or discarded after use? (Card text says "Destroy this".)
46. **Damage bonuses after a Hit.** Can a Location or Character damage bonus turn a 0-damage strike
    into a Hit?
47. **Combo offer.** The old mat showed one shared Combo offer; the rulebook (and engine) reveal the
    top Combo for each player during their own Ascend. *Engine follows the rulebook; OK?*

## F. Computer opponents (`engine/difficulty.mjs`)

48. Certified and Master **read your hand** when choosing attacks and zones, as the old mat's
    computer did. *Keep, or make them play blind for fairness?*
49. **Difficulty and handicaps** (see item 1): skill only, or also HP/stat handicaps?

## G. Switching over

50. **When should Quick Duel default to the shared engine?** It's playable now as "Shared engine
    (beta)" in Quick Duel setup. The audit's high-priority gaps are being fixed. My recommendation is
    to switch the default once those land and a few full games feel right to you, then delete the old
    mat's rules code.

## H. Boss Blitz (`docs/boss-blitz-review.md`)

51. **Stage cards say "Boss Character … ignore its Character abilities."** Chapter 14 uses Boss
    Profiles. *Update the Rival / Mini-Boss Stage card text to say "Boss Profile", or is a normal
    Character as a Boss meant to be an option?*
52. **Boss Defense:** "reduce damage by N" (cards) or "add Guard to the Boss's Defense" (rulebook)?
    The engine uses the rulebook.
53. **Final Boss KO XP:** +5 (rulebook) or the normal +2 (Final Boss Stage card)?
54. Should the **8 HP stage-clear heal** be capped at max HP? (Engine: capped.)
55. Should the mat offer **Challenge Boss Blitz** (pick your three Bosses) as well as random Bosses?
56. Players win **Speed ties** against the Boss, and Director Clipwell's "active player" means the
    player the Boss is about to attack. *OK?*

## I. Weapon art

57. The 20 Weapons without art (`DDB-WPN-CORE-046`–`065`) are not in `dojo-deckbuilder-2a` yet. Its
    only branch, `main`, was last updated Nov 23 and its weapons folder matches ours exactly. *Push
    the new files to 2a (or tell me where they are) and I'll bring them over without touching anything
    else.*

## J. Combat math (engine fixes, Nov 26)

58. **Armor whose text restates its Guard.** Kote: Guard 2, "+2 DEF against High and Mid Attacks from
    Weapons". The engine lets the text decide (2 Guard only against Weapons); the old mat added both.
59. **Guard bonuses need a Defense card.** "+X Guard" from a Location or status applies only when you
    play a Defense card, and a card's Guard never drops below 0 (Strip-Mall McDojo −1). *OK?*
60. **Piercing vs Weapon/Gear DEF** (e.g. Fan +1 DEF): not Armor, so Piercing doesn't remove it. *OK?*
61. **When Tempo is checked:** when the Attack is declared, before the card's own Speed changes; ties
    give no Tempo. *OK?*
62. **"Two-handed Weapons" Location text**: no Weapon has a Two-Handed tag; only `Hands: 2`. *Should
    Hands 2 count as Two-Handed?*
63. **"−X Speed next round"** is currently "until the next Honor", so it never changes next round's
    turn order. *Should it last through the next round's Honor (affecting initiative)?*
64. **XP anti-loop rule** (each physical card earns XP once per round) isn't implemented yet. *Keep it?*
