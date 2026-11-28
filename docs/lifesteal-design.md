# Lifesteal ("Reimburse"): design proposal

Status: **proposal, nothing built yet.** Needs three decisions from the owner (bottom of this page).
Nothing here changes the engine until those are answered and the numbers below are checked in the simulator.

## Why be careful

Healing is the one effect that can quietly break a 25-HP, eight-round game.

- A typical Hit is 3 to 6 HP and a fighter lands about two Attacks a round.
- An unrestricted "heal half of what you deal" would be worth +4 to +6 HP **every round**, which is a whole extra life by round five.
- Healing also lengthens matches, and the round limit and Honor tiebreaks (HP is one of them) would start rewarding whoever carries it.

So the effect has to be **small, capped, conditional and earned**, and it must be a generic engine feature, never a branch on a card.

## Name and fiction

Keyword: **Reimburse N**. On brand: damage is filed, the Department pays you back.
"When an Attack with this Hits, you Reimburse N: recover N HP, up to your Max HP."
(Alternatives if you prefer plain words: *Leech*, *Drain*, *Siphon*.)

## The rule, precisely

Define it once in `content/dojo-game.json` (a `reimburse` block) and a ruling (next free DDB-RUL number):

1. **Trigger:** an Attack that carries the effect **Hits** and removes **at least `minDamage` HP** from its target.
   Damage that is prevented, absorbed by Armor, or blocked does not count. "Damage dealt" means HP actually lost, so overkill does not count either.
2. **Amount:** a flat N (default 1), not a percentage. Flat numbers are legible on a card and easy to cap.
3. **Caps (all three, checked in this order):**
   - `perAttack`: at most N per Attack.
   - `perRound`: at most 1 HP per round per fighter, **shared across every source** (two Reimburse cards do not stack). Resets at Honor.
   - Never above Max HP; healing cannot revive a fighter at 0 HP.
4. **Not triggered by:** Reversals made outside your turn (decision point: see below), Friendly Fire strikes, status or self damage, Boss Guard prevention.
5. **Tag Team:** the cap is per fighter on the mat (the one holding the item).
6. **Boss Blitz:** Bosses do not Reimburse (their stages already heal on clear). Players may.
7. **Events/UI:** the engine already emits `attack` events with a breakdown; add a `heal` event with `source: "reimburse"`.
   The live damage preview reads engine events, so "+1 HP to you" appears on the preview automatically once the resolver exists.

## How it is delivered (pick one; recommendation first)

**A. A one-handed Weapon (recommended).**
Weapons already cost a Hand (`weaponHands`), so it competes with a Shield for the second Hand. Example card (copy and name are placeholders):
*Ledger Fang* (Weapon, Hands 1): "When an Attack with this Weapon Hits for 2 or more, Reimburse 1 (once per round)."
Why: the cost is built in (Hand slot, Focus cost, can be disarmed), it is visible, and it is one more reason to open boosters.

**B. A one-handed Defense Equipment ("shield").**
*Reimbursement Buckler* (Hands 1): "After you Block an Attack, Reimburse 1 (once per round)."
Heals from defending, not from dealing damage, which fits a defensive build but is not quite the idea of "a portion of the damage done". Could ship alongside A as the defensive twin.

**C. A Combo.** A learned Combo that grants Reimburse to its Attack. Strong thematic fit with Combos but harder to reason about; keep for later.

## Where it comes from (unlock)

Not in the starter kit. Options: a booster series completion reward (a "special unlockable weapon" in the sense you described), a Clearance Level reward (the level track already unlocks cosmetics and fighters), or a Boss reward. Recommendation: **a series completion reward**, so it is earned by collecting rather than bought.

## Data and engine plan (when approved)

1. Add the `reimburse` rule block and one structured effect in `content/card-effects.json` (e.g. `combat.reimburse`, params `amount`, `minDamage`), with a generic resolver in `engine/core.mjs` after damage is applied. No card ID or name checks.
2. Add the card(s) to the catalog and the pack content (`content/packs.json`), art slot reserved (new art needs to be drawn or generated; I cannot generate illustrations).
3. Tests: cap per Attack, cap per round across two sources, Armor/prevention gives no heal, no heal at Max HP, no revive, Friendly Fire, Reversal, Tag Team swap, preview shows the heal and matches the real result (the existing preview parity test pattern).
4. Glossary entry and rules text via the normal rulings flow. Card copy is written one card at a time (project rule).

## Balance check before it ships

Use the simulator (`npm run simulate`, `simulate:modes`) with a Reimburse carrier against the same deck without it, at Student, Certified and Master difficulty, thousands of seeds each.
Targets: carrier wins **52 to 55%**; average match length rises by **under one round**; no deck wins more than 58%. If it overshoots, tighten `minDamage` before touching N or the cap.

## Decisions I need from you

1. **Delivery:** Weapon (A) only, or Weapon plus Shield (A + B)?
2. **Cap:** 1 HP per round (recommended) or 1 HP per Attack?
3. **Unlock:** series completion reward (recommended), a Clearance Level, or a Boss reward?

Optional: whether computer opponents may carry it (I would say yes at Certified and Master, no at Student).
