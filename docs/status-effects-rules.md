# Status Effects: draft rules (arena variant)

Status: **draft, for testing in the Test Arena (`#arena`)**. None of this is in the printed rules or normal play.
All thirteen effects (and the Reimburse keyword) are built and playable in the arena (`engine/arena-rules.mjs`, data in
`content/experimental/status-effects.json`). Revised for the **v1.7 audit** (`docs/v1.7-audit-response.md`): the balance
guardrails in section 6 now apply, Barrier caps at 3, Laminate shuts only the Attack lane, and Rush Order's extra card is paid once.

Every effect is a thing that happens to paper: it burns, smudges, gets laminated, stapled, cut, taped, stamped, soaked.
Each keeps a plain-language alias (Burn, Poison, Freeze, Bleed, …) so players can talk about it the usual way.

---

## 1. How status effects work

**1.1 Applying.** A card, Weapon, Combo or ability *applies* an effect to a fighter ("the target becomes Scorched").
Most effects are applied **on Hit**: when the Attack that carries them Hits (deals at least 1 damage after DEF, Guard, Armor and prevention). A Blocked Attack applies nothing.

**1.2 Stacks.** Some effects have *stacks* (Scorch ×2). Applying an effect a fighter already has adds stacks, up to the effect's maximum. Effects without stacks cannot be applied twice; the second application does nothing unless the effect says it *refreshes*.

**1.3 Refresh.** "Refreshes" means applying it again resets its duration to full.

**1.4 Duration.** Effects last one of:
- **N rounds:** counted at **Honor**. "2 rounds" ends at the second Honor after it was applied.
- **Until the end of your next turn:** ends at your next **Hide** (the same timing as Witness Protection).
- **Until used:** ends the moment it does its job (Denied, Barrier).
- **Fading:** loses a stack each Honor and ends at 0 (Ink Blot).

**1.5 Honor order.** At Honor, before initiative is decided, effects resolve for each fighter in this order:
1. damage from Scorch, then from Ink Blot;
2. Ink Blot fades one stack;
3. round durations count down; effects at 0 end;
4. immunities ("cannot be X again until after the next Honor") wear off.

Damage at Honor ignores DEF, Guard and Armor. It can knock a fighter out; check for a winner right away.

**1.6 Who caused it.** Damage from an effect counts as caused by the fighter who applied it (for "last damaged by" and knockout XP).

**1.7 Card text wins.** If a card's text contradicts this chapter, the card wins (the Golden Rule).

---

## 2. The effects

### 2.1 Scorch (Burn)
*The card catches fire at the corner and the edge creeps inward.*
- At each Honor, lose **1 HP per stack**. DEF, Guard and Armor do not help.
- **Stacks:** up to 3. **Duration:** 2 rounds; refreshes when applied again.
- **Melts Laminate:** applying Scorch to a Laminated fighter ends Laminate immediately.
- Total value: 1 stack ≈ 2 HP, 3 stacks ≈ 6 HP if left alone.
- *Sample card:* **Hot Coffee Spill** (Kata, 2 Focus): "Your next Attack this turn, if it Hits, Scorches the target ×1."

### 2.2 Ink Blot (Poison)
*Ink spills over the card, runs down it and smudges the numbers.*
- At each Honor, lose **1 HP per stack**, then remove **1 stack**. (3 stacks = 3 + 2 + 1 = 6 HP over three rounds.)
- **Stacks:** up to 4. **Duration:** fades on its own.
- **Smudged:** while Inked, every healing you receive (Reimburse, Training Stripes, card effects) is **1 less**.
- *Sample card:* **Leaky Fountain Pen** (Weapon, Hands 1): "When an Attack with this Hits, Ink Blot the target ×1."

### 2.3 Laminated (Freeze)
*The whole card is sealed in a glossy plastic pouch. The fighter can't move.*
- **Until the end of your next turn:** you **cannot declare Attacks** and your **Speed is 2 lower** (so you usually lose initiative and Tempo). You **can still play Defense cards**: Laminate shuts one lane, not all of them (guardrail 6.4).
- **Tear:** the first Hit you take tears the pouch open: that Hit deals **+2 damage**, then Laminate ends.
- **Immunity:** when Laminate ends for any reason, you cannot be Laminated again until after the next Honor.
- Scorch melts it (see 2.1).
- *Why it's fair:* the defender loses a turn of offence, but can still block, and the next Hit frees them, so the attacker must choose between holding the lock and cashing it in for +2.
- *Sample card:* **Laminating Press** (Kata, 4 Focus): "Your next Attack this turn, if it Hits, Laminates the target."

### 2.4 Stapled (Pinned)
*Big staples punch through the card and pin it to one spot on the mat.*
- **2 rounds:** you are pinned to the **zone of your last Attack**. If your last Attack was Low, every Attack you declare must be **Low**.
- An Attack that cannot be declared in that zone (its printed zone and any zone grants don't include it) **cannot be played as an Attack**.
- If you have not attacked yet, you are pinned to the zone of your **next** Attack.
- **Refreshes** when applied again. Ending it clears the pin.
- *Why it matters:* the opponent knows exactly where you will strike and can hold the right Defense.
- *Sample card:* **Industrial Stapler** (Gear): "Exhaust: after you Block an Attack, Staple the attacker."

### 2.5 Red Tape
*The card is bundled in red tape with a wax seal and a "Pending Approval" slip.*
- Market purchases and learning a Combo cost **+1 Focus per stack**.
- **Stacks:** up to 2. **Duration:** 2 rounds; refreshes.
- *Sample card:* **Form 27-B** (Consumable): "Play in your Yell. Red Tape the opponent ×2."

### 2.6 Denied
*A rubber stamp slams across the card: DENIED.*
- The **next card you play on your turn** (an Attack, Kata, Equipment or Consumable) is **void**: it goes to your discard pile and does nothing. Focus already spent stays spent; an Attack voided this way is not declared and deals nothing.
- **Duration:** until used. Defense and Reaction cards played on an opponent's turn are not affected.
- *Sample card:* **Rubber Stamp of Refusal** (Reaction Item): "When an opponent declares an Attack, Deny them."

### 2.7 Paper Cut (Bleed)
*The card is slit open and bleeds red ink whenever it moves.*
- Each time you **declare an Attack**, lose **1 HP per cut** (before the Attack resolves). Standing still costs nothing.
- **Stacks:** up to 3 cuts. **Duration:** 3 rounds; refreshes.
- *Why it's interesting:* it punishes aggression, so it suits a defensive fighter.
- *Sample card:* **Sharp Memo** (Attack, Mid, Power 2): "If this Hits, Paper Cut the target ×1."

### 2.8 Wet Floor
*The card stands in a puddle beside a caution sign, and the fighter keeps slipping.*
- **2 rounds:** your **Speed is 2 lower** and your **DEF is 1 lower**.
- Refreshes when applied again.
- *Sample card:* **Mop Bucket** (Gear, Location-flavoured): "Ascend: Wet Floor an opponent."

### 2.9 Reimburse (Lifesteal), a Weapon keyword
*Receipts print out of the card each time it pays you back.*
- When one of your Attacks **Hits for 2 or more damage**, **recover 1 HP** (never above your Max HP).
- **Once per round**, counting every Reimburse source together; two Reimburse Weapons do not stack.
- Blocked, prevented and Armor-absorbed damage does not count; only HP the target actually lost.
- Ink Blot reduces it by 1 (so a Smudged fighter recovers nothing from it).
- Does not trigger on Friendly Fire, effect damage (Scorch, Ink) or self damage.

#### The Reimburse Weapon (a card ready to make)
> **Petty Cash Letter Opener**. *Item · Weapon · Hands 1 · Cost 4 Focus*
> **Reimburse.** *(When an Attack you make Hits for 2 or more damage, recover 1 HP. Once per round. Never above Max HP.)*
> *"Every cut is an expense. Every expense is reimbursed."*

Why these numbers: an average Hit is 3 to 6 damage, so +1 HP once per round is worth about one HP a round, roughly a 4–8% swing over a match, which is noticeable without being a must-pick. One Hand means it competes with a shield for the second Hand slot. Suggested unlock: a **booster series completion reward**, so it's earned by collecting.

Variants to test later: a two-handed version that Reimburses on 3+ damage but twice per round, and a shield, **Expense Report Buckler** (Hands 1): "After you Block an Attack, recover 1 HP (once per round)".

---

## 3. Interactions (built ones marked ✓)

| Combination | Result |
|---|---|
| Scorch on a Laminated fighter ✓ | Laminate melts and ends; Scorch applies. |
| Hit on a Laminated fighter ✓ | +2 damage, Laminate ends, fighter becomes immune until after next Honor. |
| Ink Blot + any healing ✓ | Healing is 1 less. |
| Stapled + Denied ✓ | A voided Attack does not set your pinned zone (it was never declared). |
| Paper Cut + Laminate ✓ | You cannot attack while Laminated, so the cut cannot reopen. |
| Wet Floor + Laminate ✓ | Speed penalties add (−4 total). |
| *Proposed:* Wet Floor douses Scorch | Applying Wet Floor to a Scorched fighter removes Scorch. |
| *Proposed:* Wet Floor runs Ink | Ink Blot fades 2 stacks per Honor instead of 1 while Wet. |
| *Proposed:* Shock + Wet Floor | Shock's jolt deals double damage on a Wet fighter. |

---

## 4. Four more effects (built in the arena)

### 4.1 Static Shock (Shock)
*Sparks crackle along the card's edge; the fighter's hair stands up.*
- **Until the end of your next turn:** the **first card you play on your turn jolts you for 2 HP**, and you **cannot gain Tempo**.
- No stacks; refreshes.
- *Design role:* a tempo-control debuff. Unlike Laminate it doesn't stop you acting; it taxes the first action and takes away the Speed edge.
- *Sample card:* **Carpet Shuffle** (Kata): "Your next Attack this turn, if it Hits, Shocks the target."
- *Visual idea:* jagged yellow paper lightning bolts stapled around the card edge, the card jitters in two-frame steps, and a burst of "ZZT!" when the jolt lands.

### 4.2 Rush Order (Haste), a buff
*A red RUSH ORDER sticker on the card; speed lines streak behind the fighter.*
- **2 rounds:** **+2 Speed**, and **draw 1 extra card at your next Initiate** (once, not every turn: a cost-3 card may not give more than one net card plus a combat bonus, guardrail 6.1).
- No stacks; refreshes.
- *Design role:* the first positive status. It wins initiative and Tempo and smooths your hand.
- *Sample card:* **Express Courier** (Consumable): "Play in your Ascend. Rush Order yourself."
- *Visual idea:* a slanted sticker slaps onto the card, motion streaks scroll behind the art, and the fighter leans forward.

### 4.3 Barrier (Filed Folder), a buff
*A manila folder closes around the card; the tab shows how many sheets are left.*
- **Barrier N** absorbs the next **N damage** from Hits (after DEF and Guard), then is used up. Effect damage at Honor is not absorbed.
- **Stacks:** up to 3 (each stack is 1 point of absorption; guardrail 6.6). **Duration:** until used up, or until the end of your next turn, whichever comes first.
- *Design role:* a short, readable shield; it pairs with Laminate (a Barrier fighter can survive the tear).
- *Sample card:* **File in Triplicate** (Defense, Any, Guard 1): "If this Blocks, gain Barrier 2."
- *Visual idea:* folder flaps fold over the card edges; each absorbed point tears one sheet out of the folder.

### 4.4 Dog-Eared (Brittle)
*The card is creased and dog-eared, the paper gone soft and crumply.*
- **2 rounds:** Hits against you deal **+1 damage**, and Defense cards you play give **1 less Guard**.
- **Stacks:** up to 2 (+2 damage, −2 Guard). Refreshes.
- *Design role:* a setup debuff for burst turns. It makes Laminate's tear and big Attacks land harder.
- *Sample card:* **Crumple Zone** (Attack, Low, Power 3): "If this Hits, Dog-Ear the target."
- *Visual idea:* fold creases appear across the card with shadowed ridges, the corners curl, and each Hit adds a new crease with a crinkle burst.

---

## 5. Promoting an effect into the real game
1. Pick the effect and approve its numbers after arena and simulator testing (`npm run simulate`).
2. Move its rule block into `content/dojo-game.json`, add an official ruling in `content/rules.json`, and add a glossary entry.
3. Implement it in the engine's real resolvers (the arena variant is the reference) with the same tests.
4. Write the card(s) that apply it, one card at a time (project rule), and give them art.

---

## 6. Balance guardrails (v1.7)
Adopted from the v1.7 audit. Every status card is checked against these before it is approved.
1. **Card advantage.** A cost-2 or cost-3 card gives at most one net card **and** a combat bonus in one resolution, unless the bonus is conditional (on a miss, a discard or self-damage).
2. **Repeatable draw** says *once per turn* or *once per round*.
3. **Damage statuses cap at 3 stacks** (Scorch 3, Paper Cut 3). Ink Blot keeps 4 because it fades every Honor (4 stacks = 4+3+2+1 = 10 HP if left completely alone; watch it in testing).
4. **One lane per status.** Laminated, Stapled, Static Shock and Denied may each shut one lane (Attacks, zone choice, Tempo, the next card). No single status stops Attacking, Defending and Tempo at once, and the control statuses should not be chained to lock a fighter for more than one turn.
5. **Separate setup from payoff.** Where possible a card either applies a status or cashes it in, not both on a cheap card.
6. **Barrier** caps at 3 and never absorbs damage at Honor. It is a short shield, not a second Armor layer.
7. **Full cancellation** of an Attack is once per game, a real choice, or replaced by a capped reduction.
8. **Healing** (Reimburse, Expense Report Buckler, Correction Fluid) is once per round or once per turn.
9. **Win-rate band.** 45–55% in repeated 1v1 tests is healthy; 55–60% is a watch list; over 60% across several opponents is a real balance signal.

### 6.1 Where this differs from the audit's own glossary
The audit proposed a lighter glossary (for example a Laminate that only stops Tempo and a Rush Order that is +1 damage on one
Attack). We kept the richer definitions above, which the owner approved and which are built and tested in the arena, and took
the audit's guardrails instead. The card texts in `docs/arena-card-proposals.md` are written against *this* document.

