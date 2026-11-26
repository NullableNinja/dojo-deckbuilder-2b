# Boss Blitz: card review (Nov 26, 2026)

## What exists

45 Boss cards, all with art (`app/assets/cards/bosses/`) and structured effects:

| Kind | Count | Role |
| --- | --- | --- |
| Boss Profile (`DDB-BPR-CORE-001…010`) | 10 | The Boss you fight: name, art, ATK / DEF / Speed, a Stage Fit and one Boss Rule |
| Boss Stage (`DDB-BST-CORE-001…003`) | 3 | Rival 30 HP +0, Mini-Boss 45 HP +1, Final Boss 60 HP +2 (Enraged at 30: 2 attacks) |
| Boss Arsenal (`BAT` 20, `BDF` 6, `BTQ` 6) | 32 | The Boss's shared deck: Attacks, Guard cards, Techniques |

Rulebook chapter 14 ("Dojo Drama: Boss Blitz") covers setup, the Boss Turn, Boss Guard, the ladder,
winning, and co-op. `content/dojo-game.json` (`modes[dojo-drama].boss`) and `engine/boss-blitz.mjs`
implement it: each stage pairs a Profile (stats and rule) with a Stage card (HP, bonus, attacks).

## Why the Bosses looked generic

The mat's card-art loader never included the `bosses` folder, so every Boss Profile showed the
placeholder card instead of its art. Fixed in `app/card-art.ts` (shared by both mats); the Card Library
already loaded it.

## Where the cards and the rulebook disagree

1. **Stage cards talk about a "Boss Character".** Rival and Mini-Boss say "Use the chosen Boss
   Character's printed ATK, DEF, and Speed. Ignore its Character abilities." Chapter 14 says the Boss
   *Profile* supplies the stats and one Boss Rule. This reads like an older design where a normal
   Character card was the Boss.
2. **Boss Defense math.** The cards say "reduce damage by 3", which works like prevention after the hit
   is calculated. Chapter 14 says "add that card's Guard to the Boss's Defense", which is part of the
   Block calculation. The two differ with Piercing, with "if this Attack Hits" effects, and with
   Reversals. The engine follows the rulebook (Guard added to Defense).
3. **Final Boss KO XP.** The Final Boss Stage card says "Scenario victory; normal KO XP also applies"
   (+2). Chapter 14 says every Boss KO gives 5 XP, replacing the +2.
4. **Stage rewards.** Rival and Mini-Boss give "+5 XP; heal active fighter 8 HP" on the card, and the
   chapter agrees. Neither says whether the heal can exceed the fighter's max HP; the engine caps it.

## Rules the cards need that aren't spelled out

5. **Captain Cone and Chief Inspector Buffer** trigger when a player "changes an Attack's zone". Only a
   few cards change a declared zone, and the engine has no "zone changed" event yet, so these two Bosses
   currently fight with stats only.
6. **Chairman Foldwell** ("exhausts Equipment → discard 1") and **Madam Misdemeanor** ("readies
   Equipment outside Initiate → +1 to the next Boss Attack") depend on Equipment timing that is still
   being fixed in the engine (parity audit row E-T5).
7. **Director Clipwell** lets "the active player" discard at the start of the Boss Turn. In solo the
   Boss acts on its own turn, so "active player" has to mean "the player the Boss will attack". The
   engine and old mat read it that way.
8. **Challenge Boss Blitz** (choose your three Profiles) is in the rulebook, but neither mat offers it;
   both use Quick Boss Blitz (random Profile per stage by Stage Fit).
9. **Ties and targeting.** The engine gives players Speed ties against the Boss and has the Boss attack
   the active fighter of the player it targets (co-op: different players, then lowest HP). Chapter 14
   implies this but doesn't state the Speed tie.
