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
| 76 | Animated payroll slip | The result slip files itself beat by beat: pay lines stamp in while the Merit total counts up, Ticket Stubs tear in as pips (a full set turns into a Booster Ticket), the Merit meter fills (a level-up fills it, bursts, lists the rewards, then restarts toward the next level) and the Paid / Promoted stamp lands last. A Skip button and a click finish it at once; reduced motion shows the finished slip. | Claude | Done |
| 77 | Career woven through the site | The Clearance Level / collection layer now shows up everywhere: a progress ring and level badge on the Field Agent avatar (with a dot when Booster Tickets are waiting), a career card in the Field Agent menu, a "Your dojo record" band on Home, a Payroll-for-this-match preview in game setup, a one-time ticket reminder toast on arrival, a ring card in the Dojo Index, and a new `#collection` page (level track with every reward, card series progress, fighters and Bosses still locked, how Merit is earned). Links from the payroll slip and Card Library lead there. | Claude | Done |
| 78 | Training Stripes on the Ascend desk | The Belt step now shows the Stripe rack (held of three, one just earned is hatched), the rule in one line, a "Spend a Stripe: recover 2 HP" button, and the reason when it is blocked (none held, earned this turn, HP full, Belt Check used). A "Training Stripe ready" banner, a "heal ready" tag and a pill button surface it on the other steps. Quick Duel only (DDB-RUL-114). | Claude | Done |
| 79 | Card of the Day is claimable | If today's Card of the Day is a collectible card you do not own, Home and the Card Library offer "Unwrap today's card": it files into your collection with a single-card version of the pack-opening animation, no ticket spent (engine `claimCard`). Only today's card can be claimed from the UI ("Draw another" is just browsing). Fighter and Boss cards say which level opens them; Open Dojo says to switch to My Collection. | Claude | Done |
| 80 | Boss art | Bosses are never mirrored (a flipped printed card read backwards). Each Boss Profile now gets a standee cutout made from its printed card's illustration (`scripts/make-boss-cutouts.py`, output in `app/assets/fighters/<boss-name>.webp`, covered by a test). Hand-drawn or newly generated cutouts with the same file name replace them automatically. | Claude | Done |
| 81 | Ascend Combo step | Shows the Combo's printed card, "You need" (the requirement), "You get" (the payoff), the cost against your Focus, a plain reason when you cannot learn it, and the Combos you know as small cards. | Claude | Done |
| 82 | Dark-mode contrast | Text on ember fills is ink in dark mode (cream was 2.6:1); the Home fighter-count footnote was invisible on the dark stage. All in `app/a11y-contrast.css`. | Claude | Done |
| 83 | Test Arena (`#arena`) | An internal playground with two "Dummy" fighters (a flour sack on a stick with a helmet, wooden shield and wooden sword, drawn as SVG). Effects Lab: draft burn, poison, freeze and Reimburse (lifesteal) from `content/experimental/status-effects.json`, resolved by `engine/status-effects.mjs` (tested), each with its own animation and a log of the numbers. Card Sandbox: summon any catalog card into the real engine and play it. Not in any navigation. Draft effects are NOT in the rules or the real engine until promoted. It is reachable in production at `#arena`; to hide it there, gate the route like `#lab` (`import.meta.env.DEV`). | Claude | Done |
| 84 | Deploy stamp never touches JavaScript | The Pages workflow added `?build=` to every script URL, which made the browser load the entry chunk twice (once with the query, once without, as lazy chunks import it) and run a second copy of React: "Invalid hook call", blank site, first seen on `#arena`. The stamp now lives in `scripts/stamp-build.mjs`, leaves JS alone (file names are content-hashed already) and only stamps stylesheets and the build marker; a test guards it. | Claude | Done |
| 85 | Arena effects redrawn in the game's own language | The draft effects now look like Paper-Fu props, not fantasy magic, and move in stop-motion frames: Laminated (Freeze: a sealed pouch that rips open), Scorch (Burn: construction-paper flames and charred hem), Ink Blot (Poison: spreading ink), Reimburse (Lifesteal: receipts fly to the attacker, a PAID stamp lands). Five new drafts: Stapled (pinned to the zone you last attacked), Red Tape (every card costs more Focus), Denied (the next card is stamped void), Paper Cut (swinging stings you) and Wet Floor (-2 Speed, -1 DEF). Attacks and Braces now cost Focus in the arena. All of it is still draft data in `content/experimental/status-effects.json`; nothing is in the real rules. | Claude | Done |
| 86 | Test Arena plays a real battle | `#arena` is now the real game mat running a real Quick Duel (Dummy vs Dummy, real decks, Market, Locations, Combos, Belts, computer opponent) under an arena rule variant: `engine/arena-rules.mjs` extends the engine like Boss Blitz does and adds the nine draft effects through the engine's own seams (Speed/DEF statuses, damage events, Honor, Hide, attack legality, Defense options, prices). Effects land with the mat's own impact cue and screen shake, and linger as paper props on the fighter plus status chips. A console drawer applies effects, loads them onto a fighter's next Hit, hands out Reimburse weapons and summons cards. Draft rules only; normal play is untouched (tested). | Claude | Done |
| 87 | Card-level effects, colourful life bars, Barrier | Arena effects now transform the fighter's card (burning corners with a live ember edge, ink spill, laminate, staples, bleeding slits, red tape, stamp, flood, Barrier folder). The HUD life bar has five colour bands, a gloss stripe, 5-HP notches, a chip trail after Hits, a heal flash, and a look per status (ink bubbles, fire, frost, water, guarded blue with a shield badge, bleeding). Barrier (Guarded) is a new arena effect that absorbs Hit damage. Full draft rules: `docs/status-effects-rules.md`. | Claude | Done |
