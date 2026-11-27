# Decision log

The owner has given standing approval for small design and rules calls (Nov 26, 2026): follow the
rulebook first, keep the tone, decide, and record it here so any line can be rolled back. Only big,
hard-to-reverse questions go to the owner. Those are listed at the top.

## Big questions for the owner

None open right now.

## How the small calls are made

1. **The rulebook (`content/rules.json`) wins over old mat behaviour.**
2. **The Golden Rule:** a card's specific text beats the general rules. When a card and a chapter disagree
   only because one of them is out of date, the newer, more detailed source wins, and the other is
   corrected so they agree.
3. **Fair and readable beats clever:** no hidden handicaps, no hidden information used against the player,
   and every automatic decision is shown in the fight log.
4. **Printed cards are not edited to settle a contradiction**: their text is part of the card art. The
   rulebook gets a filed ruling (DDB-RUL-1xx) and the engine follows it.

## Decided

| # | Topic | Decision | Who | Status |
| --- | --- | --- | --- | --- |
| 1 | Difficulty | Computer skill only (Student / Certified / Master); every opponent has rulebook HP and stats. | Claude (owner asked) | Done |
| 2 | Quick Duel Locations | Every Location is in play. | Owner | Done |
| 3 | Tempo | Rulebook: only against a slower fighter; +1 Guard on a Defense. | Owner | Done |
| 4 | Tempo switched off | No fighter has Tempo. | Kept | Done |
| 5 | Locations switched off | No Location at all, no scene changes. | Owner | Done |
| 6 | Open Market option | Removed once the missing Weapon art arrived. | Owner | Done |
| 7 | Piercing | Ignores Armor only. | Owner | Done |
| 8–11, 13, 15, 16 | Reversal details | As implemented (Tempo spent; next-Attack bonuses used; declining keeps the once-per-round Reversal; Tattoo Pass reading; bonus to the Reversal if made; not "an Attack this turn"; void if the attacker swapped). | Owner | Done |
| 12 | Witness Protection Stance | Protection lasts until the end of your next turn (ruling DDB-RUL-119). | Owner | Done |
| 14 | Clock In, Block Out | Requires a Reversal step. | Owner | Done |
| 17–21 | Weapons in hand | Replace rather than block, always with a warning; player picks; restriction checked on equip; only subtype Weapon uses Hands; Fast Belts everywhere. | Owner | Done |
| 22 | Steal the Belt, Friendly Fire | Engine house-rule variants (`progression.knockoutCompletesBeltTask`, `combat.friendlyFire`). Friendly Fire: each fighter may attack a teammate once per round; that Attack earns no XP, task credit, KO reward, Tempo or Combo trigger; computers never pick an ally. | Owner (spec: Claude) | Done |
| 23–34 | Packs and progression | Shared-pool collections, Open Dojo, Orientation Kit plus Starter Kits, 8 themed series, packs only contain new cards, earn rates, Merit / Clearance Levels / Diplomas, series gating, rewards by table type, local saves with export codes. | Owner | Done (plan + `content/packs.json`, approved) |
| 25 | What is free | Everything is free of money, always. 12 Characters and 5 Bosses at the start; the rest unlock through Clearance Levels and completed series. | Owner | Done (plan) |
| 28, 35 | Rarity | None. | Owner | Done |
| 36 | Prevention to 0 damage | It's a Block (no damage dealt), not a Hit. | Claude | Done (engine already) |
| 37 | Off-turn Focus | Rulebook: a card played outside your own turn generates no printed Focus, Defense cards included. | Claude | Done |
| 38 | Attack and Defense XP | Always, Hit or Block. | Claude | Done |
| 39 | Starter Attacks in Combos | They are Attacks (the rulebook lists them as Attacks). | Claude | Done |
| 40 | Equipment readies | At its controller's Initiate (rulebook). | Claude | Done |
| 41 | Optional Tempo | Stays automatic: it's never worse to use it, and fewer prompts keep turns fast. | Claude | Kept |
| 42 | Quick Duel ties and round cap | Rulebook: referee-marker Speed ties (DDB-RUL-112) and the full tiebreak list (DDB-RUL-102), same as every other mode. | Claude | Done |
| 43 | Combo limits | Once per round unless the card says otherwise. | Claude | Kept |
| 44 | "If the first … Hit" Combos | Seven Combos now require the earlier Attack(s) to Hit (Swan Song, Body Shop Special, One-Two-Oh-No, …). | Claude | Done |
| 45 | Reaction Items | Destroyed after use (as printed). | Claude | Done |
| 46 | Damage bonus and Hits | A bonus can't turn a 0-damage strike into a Hit. | Claude | Kept |
| 47 | Combo offer | Each player reveals their own offer in Ascend (rulebook). | Claude | Done |
| 48 | Computer and your hand | Student and Certified play without looking at your hand; Master still reads the table (it is the "Bad decision" difficulty). | Claude | Done |
| 50 | Switching to the shared engine | Done Nov 27: full browser games of Quick Duel, Tag Team and Boss Blitz passed on the engine, so it is the default; "Classic mat (retiring)" stays in setup until the old rules code is deleted. | Claude | Done |
| 51 | Boss Stage cards | Printed cards stay as they are (the text is on the card art); ruling DDB-RUL-116 says the Stage card's "Boss Character" means the stage's Boss Profile. | Claude | Done |
| 52 | Boss Defense | Golden Rule: the printed cards win. Boss Guard reduces the matching Attack's damage (DDB-RUL-117); chapter 14 and the engine now say so. | Claude | Done |
| 53 | Final Boss KO | Golden Rule: the Final Boss Stage card wins, so the normal +2 KO XP (DDB-RUL-118); Rival and Mini-Boss still give 5. | Claude | Done |
| 54 | Stage-clear heal | Capped at max HP. | Claude | Kept |
| 55 | Challenge Boss Blitz | Yes: a "Choose your Bosses" option in Boss Blitz setup. | Claude | Backlog |
| 56 | Boss Speed ties, Clipwell | Players win ties; "active player" = the player the Boss is attacking. | Claude | Kept |
| 57 | Missing Weapon art | Imported from the main repo; all 597 cards have art. | Owner | Done |
| 58–61, 63 | Combat details | As implemented (Armor text decides; Guard bonuses need a Defense card; Piercing leaves Weapon/Gear DEF; Tempo checked at declaration; "next round" Speed ends at Honor). | Claude | Kept |
| 62 | Two-handed Weapons | A Weapon with `Hands: 2` counts as Two-Handed for card text. | Claude | Done |
| 64 | XP anti-loop rule | Implement the rulebook's once-per-physical-card-per-round XP limit. | Claude | Backlog |
| 65–71 | Combo / Character / Market details | As implemented (Gramma Uppercut automatic; "temporary" bonus list; off-turn "first time" abilities; Three Squirrels counts your own turn; Swan Wing lasts the turn; Belt Collector counting; Aisle Map ends). | Claude | Kept |
| 72 | Ronin Reroll | Automate it. | Claude | Backlog |
| 73 | Card Library "Preview new recruit" | Keep it public as a clearly labelled teaser; Open Dojo stays the default until unlocks ship. | Claude | Done |
| 74 | Ascend desk guidance | The engine table's Ascend desk is a guided three-step flow (Buy, Combo, Belt) with a coach line, a requirements checklist for the next Belt (XP, exam steps, Belt Check availability), a "Promotion ready" banner and pill button, and a confirm before finishing with a promotion still available. Opens on the Belt step when you can already promote. | Claude | Done |
| 75 | Hand cards: look first | Every hand card (Kata, Defense, Junk, even unplayable ones) stands up and zooms on the first press so you can read it; a second press plays it. Hovering the hand with a mouse raises it like "Show hand". | Claude | Done |
