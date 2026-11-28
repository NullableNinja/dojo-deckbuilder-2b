# Paperwork module (v1.7): card build list

Status: **built as experimental updates, switchable in game.** Every card and change below is playable now: open the
match setup and use **Experimental updates** to switch on a module, then open **Review the cards** to switch single cards
or changes off. Each module and each card can be judged on its own; nothing touches the canonical catalog until it is
approved and promoted (one card at a time, per the project rule). The Test Arena (`#arena`) has everything on.

| Module (`content/experimental/experiments.json`) | What it switches on | Data |
|---|---|---|
| `status-effects` | the 13 statuses, Reimburse, the guardrails, Denied's discard-or-cancel | `status-effects.json`, `engine/arena-rules.mjs` |
| `paperwork-cards` | Part A1 to A3: 30 cards, 4 Combos, 3 Locations (needs `status-effects`) | `experimental-cards.json` (group `paperwork`) |
| `support-cards` | Part A4: 12 support cards (needs `status-effects`) | `experimental-cards.json` (group `support`) |
| `retunes-draw` | Part B1: 14 retunes | `retunes.json` (group `draw`) |
| `retunes-fortress` | Part B2: 12 retunes (their Barrier / Static Shock riders need `status-effects`) | `retunes.json` (group `fortress`) |

**Test-version notes.** Where the built version differs from the text below, the data carries an `engineNote`, and the
setup panel shows it under the card. The notable ones:
- **Paper Trail** leaves out the Flow draw rider.
- The three **Locations** leave out their Scene Change Triggers, and Archive Basement also leaves out its On Reveal.
- **Carbon Copy** draws first, then puts back.
- **Archive Dive** has no Barrier rider yet.
- **Sensei's Advice** destroys a Junk card if you have one (not optional).
- **Sensei's Disapproving Stare** only changes cost.
- **Naihanchi** gives +1 to your next Attack in any zone and has no Barrier rider yet.
- **Dojo Door's** "use Flow" means no Flow draw.

Everything is written against the current catalog, **v2.3, 597 entries** (`app/data/cards.json`), and the status rules in
`docs/status-effects-rules.md`, including its **guardrails (section 6)**. The v1.7 audit merge is explained in
`docs/v1.7-audit-response.md`.

---

## 0. Brief for whoever builds these

1. **Where they go.** New cards live in `content/experimental/experimental-cards.json` (each entry: `group`, a `card` record in
   the shape of `app/data/cards.json`, structured `effects`, and `requirements` for Combos); retunes live in
   `content/experimental/retunes.json` (`patch` plus replacement `effects`). Never edit `app/data/cards.json` or
   `content/cards.json` for these. `tests/experiments.test.mjs` plays them in real games.
2. **One record per card**, so each card can be reviewed and approved on its own. Do not bulk-rewrite existing cards: the
   retunes in Part B are delivered as one proposed record each, with the current text alongside.
3. **IDs.** New cards use provisional IDs `DDB-<TYPE>-PPR-NNN` ("PPR" = Paperwork module). Type codes match the catalog:
   ATK, DEF, KAT, WPN, DEQ, GEA, CON, RIT, CMB, LOC. Retunes keep their **real** catalog IDs.
4. **Record fields** (copy an existing card of the same subtype): `catalogId`, `name`, `cardType`, `subtype`, `category`,
   `fpCost`, `focusValue`, `zone`, `timing`, `rulesText`, `flavorText`, `tags`, `stats`, `buildPaths`, `deck`,
   `availability: "Proposed"`, `rulesVersion: "v1.7-draft"`.
   | Subtype | cardType / category | timing | stats | deck |
   |---|---|---|---|---|
   | Attack | Technique / Attack | Turn | `{"Attack Power": "N"}` | Technique Deck |
   | Defense | Technique / Defense | Reaction | `{"Guard": "N"}` | Technique Deck |
   | Kata | Technique / Kata | Turn | `{"Value": "—"}` | Technique Deck |
   | Weapon | Item / Weapon | Equip | `{"Attack Bonus": "N", "Hands": "1"}` | Item Deck |
   | Defense Equipment | Item / Armor | Equip | `{"Guard": "N", "Slot": "1 Hand"}` | Item Deck |
   | Gear | Item / Gear | Equip | `{"Slot": "Accessory"}` | Item Deck |
   | Consumable | Item / Consumable | Reaction | `{"Value": "—"}` | Item Deck |
   | Reaction Item | Item / Reaction Item | Reaction | `{"Guard": "0"}` | Item Deck |
   | Learned Combo | Combo / Combo | Combo | `{"Difficulty": "Basic/Standard/Advanced"}` | Combo Deck |
   | Location | Location / Location | Scene | `{"Intensity": "N"}` | Location Deck |
5. **Wording.** Use the catalog's words: **Attack Power** (never "Damage" as a stat), **Hits**, **Blocks**, **Guard**, **DEF**,
   **Focus**, **Tempo**, **Flow**, **Initiate / Yell / Ascend / Hide / Honor**, **Equip**, **Exhaust**, **Junk**.
   Status verbs: "Scorch the target ×1", "Ink Blot", "Laminate", "Staple", "Red Tape", "Deny", "Paper Cut", "Wet Floor",
   "gain Barrier ×N", "Shock", "gain Rush Order", "Dog-Ear". Combos read "Requirement: … Payoff: …".
6. **Every new Market card has Focus Value 1.** Flavour: one line, funny, reinforces the card's decision, never explains rules.
7. **Status rules** are in `docs/status-effects-rules.md`; do not invent new timings. In short:
   - **Scorch**: 1 HP per stack at Honor; max 3; 2 rounds.
   - **Ink Blot**: 1 HP per stack at Honor, then fades 1; max 4; healing is 1 less while Inked.
   - **Laminated**: until the end of your next turn, no Attacks and −2 Speed; the first Hit tears it for +2 damage; immune until the next Honor.
   - **Stapled**: 2 rounds, pinned to the zone of your last Attack.
   - **Red Tape**: +1 Focus per stack on purchases and Combos; max 2; 2 rounds.
   - **Denied**: your next card on your turn is void.
   - **Paper Cut**: lose 1 HP per stack whenever you declare an Attack; max 3; 3 rounds.
   - **Wet Floor**: 2 rounds, −2 Speed and −1 DEF.
   - **Barrier**: absorbs 1 Hit damage per stack; max 3; until used or the end of your next turn.
   - **Static Shock**: until the end of your next turn, your first card jolts you for 2 HP and you cannot gain Tempo.
   - **Rush Order** (buff): 2 rounds, +2 Speed, and 1 extra card at your next Initiate (once).
   - **Dog-Eared**: 2 rounds, +1 damage taken and −1 Guard per stack; max 2.
   - **Reimburse** (Weapon keyword): recover 1 HP when your Attack Hits for 2 or more; once per round.

---

## Part A: new cards (49)

### A1. Status cards (30)

| # | Provisional ID | Name | Type · zone/slot | Cost | Stats | Rules text | Flavour |
|---|---|---|---|---|---|---|---|
| 1 | DDB-KAT-PPR-001 | **Hot Coffee Spill** | Kata | 2 | — | Your next Attack this turn, if it Hits, Scorches the target ×1. If the target was already Scorched, draw 1 card, then discard 1 card. | *The meeting was too calm. The coffee fixed that.* |
| 2 | DDB-ATK-PPR-001 | **Toaster Uppercut** | Attack · High | 4 | AP 4 | On Hit, Scorch the target ×1. If they were already Scorched, Scorch them ×2 instead. | *Golden brown on both sides.* |
| 3 | DDB-RIT-PPR-001 | **Burn After Reading** | Reaction Item · Any | 3 | Guard 0 | Reaction. After you Block an Attack, Scorch the attacker ×1. Then you may draw 1 card and discard 1 card. | *The warning was printed in very small, very hot type.* |
| 4 | DDB-WPN-PPR-001 | **Leaky Fountain Pen** | Weapon · 1 Hand | 5 | Attack Bonus 1 | Your first Attack each turn gets +1 Attack Power. If that Attack Hits, Ink Blot the target ×1. | *Signed, sealed, smudged.* |
| 5 | DDB-CON-PPR-001 | **Toner Cloud** | Consumable | 2 | — | Yell: Ink Blot an opponent ×2. You lose 1 HP. | *The copier jammed, and everyone became part of the document.* |
| 6 | DDB-CON-PPR-002 | **Correction Fluid** | Consumable | 2 | — | Any time on your turn: remove all Ink Blot from yourself, then recover 2 HP. Once per turn. | *Mistakes were made. Mistakes were covered.* |
| 7 | DDB-KAT-PPR-002 | **Laminating Press** | Kata | 4 | — | Your next Attack this turn, if it Hits, Laminates the target. | *Permanent record.* |
| 8 | DDB-ATK-PPR-002 | **Cold Storage Kick** | Attack · Low | 4 | AP 3 | If this Hits a target with Wet Floor, remove their Wet Floor and Laminate them. | *Slip, then seal.* |
| 9 | DDB-ATK-PPR-003 | **Laminate Ripper** | Attack · Mid | 3 | AP 3 | +1 Attack Power against a Laminated target (the tear's +2 still applies). | *Peel here.* |
| 10 | DDB-GEA-PPR-001 | **Industrial Stapler** | Gear · Accessory | 4 | — | Exhaust after you Block an Attack: Staple the attacker. Ready this during your next Initiate. | *Holds up to 200 sheets and one martial artist.* |
| 11 | DDB-DEF-PPR-001 | **Pinning Stance** | Defense · Any | 3 | Guard 2 | If this Blocks, Staple the attacker. | *Stay right there.* |
| 12 | DDB-CON-PPR-003 | **Form 27-B** | Consumable | 2 | — | Yell: Red Tape an opponent ×2. | *Request for Permission to Request Permission.* |
| 13 | DDB-DEQ-PPR-001 | **Bureaucratic Wall** | Defense Equipment · 1 Hand · Any | 4 | Guard 1 | Occupies one hand. +1 DEF against all zones. Once per round, when an opponent buys a Market card, Red Tape them ×1. | *Every purchase requires a signature. Several.* |
| 14 | DDB-RIT-PPR-002 | **Rubber Stamp of Refusal** | Reaction Item · Any | 4 | Guard 0 | Reaction. Destroy this after an opponent declares an Attack targeting you: Deny that opponent. | *No.* |
| 15 | DDB-ATK-PPR-004 | **Appeal Rejected** | Attack · High | 4 | AP 3 | If this Hits a fighter who Blocked one of your Attacks this round, Deny them. | *Your objection has been noted and shredded.* |
| 16 | DDB-ATK-PPR-005 | **Sharp Memo** | Attack · Mid | 2 | AP 2 | On Hit, Paper Cut the target ×1. | *Fresh off the printer.* |
| 17 | DDB-WPN-PPR-002 | **Envelope Edge** | Weapon · 1 Hand | 4 | Attack Bonus 1 | Once per turn, the first time your Attack Hits, Paper Cut the target ×1. | *Lick it, and regret it.* |
| 18 | DDB-CON-PPR-004 | **First-Aid Tape** | Consumable | 2 | — | Any time: remove up to 2 Paper Cut from yourself, then draw 1 card. | *Department-issued. Beige.* |
| 19 | DDB-CON-PPR-005 | **Mop Bucket** | Consumable | 2 | — | Ascend: Wet Floor an opponent. | *Caution sign sold separately.* |
| 20 | DDB-ATK-PPR-006 | **Slip Sweep** | Attack · Low | 3 | AP 2 | +2 Attack Power against a target with Wet Floor. If this Hits, the target loses Tempo. | *Physics did most of the work.* |
| 21 | DDB-DEF-PPR-002 | **File in Triplicate** | Defense · Any | 3 | Guard 1 | If this Blocks, gain Barrier ×2. | *One for you, one for them, one for the cabinet.* |
| 22 | DDB-DEQ-PPR-002 | **Accordion Folder** | Defense Equipment · 1 Hand · Any | 5 | Guard 1 | Occupies one hand. At the start of your turn, gain Barrier ×1 (this cannot take you above 2). If you began the turn with no Barrier, draw 1 card, then discard 1 card. | *Expands under pressure.* |
| 23 | DDB-KAT-PPR-003 | **Carpet Shuffle** | Kata | 2 | — | Your next Attack this turn, if it Hits, Shocks the target. If the target had Tempo, draw 1 card, then discard 1 card. | *Socks, wool carpet, intent.* |
| 24 | DDB-ATK-PPR-007 | **Photocopier Jam** | Attack · Mid | 4 | AP 3 | If this Hits a target with Tempo, Shock them and they lose their Tempo. | *PC LOAD LETTER.* |
| 25 | DDB-CON-PPR-006 | **Express Courier** | Consumable | 3 | — | Ascend: gain Rush Order. | *Absolutely, positively, by Honor.* |
| 26 | DDB-ATK-PPR-008 | **Overnight Delivery Kick** | Attack · High | 4 | AP 3 | If you have Rush Order, this gets +1 Attack Power. If it Hits, draw 1 card, then your Rush Order ends. | *Signed for on arrival.* |
| 27 | DDB-ATK-PPR-009 | **Crumple Zone** | Attack · Low | 3 | AP 3 | On Hit, Dog-Ear the target ×1. If they were already Dog-Eared, draw 1 card, then discard 1 card. | *Soft paper folds first.* |
| 28 | DDB-ATK-PPR-010 | **Paper Shredder** | Attack · Mid | 6 | AP 4 | +1 Attack Power per Dog-Eared stack on the target (up to +2). If this Hits a Dog-Eared target, Paper Cut them ×1 and remove 1 Dog-Eared. | *Cross-cut, for your safety.* |
| 29 | DDB-WPN-PPR-003 | **Petty Cash Letter Opener** | Weapon · 1 Hand | 4 | Attack Bonus 1 | **Reimburse.** *(Once per round, when your Attack Hits for 2 or more damage, recover 1 HP.)* | *Every cut is an expense. Every expense is reimbursed.* |
| 30 | DDB-DEQ-PPR-003 | **Expense Report Buckler** | Defense Equipment · 1 Hand · Any | 4 | Guard 1 | Occupies one hand. +1 DEF against all zones. Once per round, after you Block an Attack, recover 1 HP. | *Itemised. Approved. Grudgingly.* |

### A2. Combos (4)

| # | ID | Name | Learn | Difficulty | Rules text | Flavour |
|---|---|---|---|---|---|---|
| 31 | DDB-CMB-PPR-001 | **Slip and Seal** | 5 | Standard | Requirement: Wet Floor a fighter, then Hit them with a Low Attack in the same turn. Payoff: Laminate them, then draw 1 card and discard 1 card. | *The floor was slippery. The paperwork was permanent.* |
| 32 | DDB-CMB-PPR-002 | **Inkfire** | 5 | Advanced | Requirement: Hit a fighter who has both Ink Blot and Scorch. Payoff: their Ink Blot and Scorch each deal their Honor damage now, then remove 1 Ink Blot and 1 Scorch. | *Toxic, flammable, and still awaiting approval.* |
| 33 | DDB-CMB-PPR-003 | **Red Tape Bonfire** | 4 | Standard | Requirement: Hit a fighter who has Red Tape. Payoff: remove up to 2 Red Tape from them and Scorch them ×1 per stack removed. If you removed 2, draw 1 card, then discard 1 card. | *The fastest way through bureaucracy is apparently arson.* |
| 34 | DDB-CMB-PPR-004 | **Paper Trail** | 4 | Basic | Requirement: two Attacks you play this turn Hit the same fighter. Payoff: Paper Cut that fighter ×2. *(The audit's Flow draw rider is left out of the test version.)* | *Every hit leaves a record.* |

### A3. Locations (3)

| # | ID | Name | Intensity | Rules text | Flavour |
|---|---|---|---|---|---|
| 35 | DDB-LOC-PPR-001 | **Server Room** | 2 | On Reveal: each fighter with Tempo loses it. Ongoing: Static Shock lasts until the end of the affected fighter's next two turns. A Hit of 2 or less does not tear Laminate. Scene Change Trigger: a fighter is Shocked for the third time here. | *The fans are loud and the tournament has entered maintenance mode.* |
| 36 | DDB-LOC-PPR-002 | **Break Room Sink** | 2 | On Reveal: each fighter may remove 1 Scorch from themselves. Ongoing: at Honor, each Scorched fighter removes 1 extra Scorch. Wet Floor lasts 1 extra round. Scene Change Trigger: three Low Attacks Hit fighters with Wet Floor here. | *Someone left the faucet running. Someone else challenged the faucet.* |
| 37 | DDB-LOC-PPR-003 | **Archive Basement** | 2 | On Reveal: each player may look at the top 2 cards of their deck and return them in any order. Ongoing: Ink Blot fades only every other Honor. The first time each round a player destroys a Junk card, they may draw 1 card, then discard 1 card. Scene Change Trigger: a player destroys their third Junk card here. | *The dust is poisonous and the filing system is somehow excellent.* |

### A4. Support cards for draw, cycling and deck-thinning (12)
Build these **last** and only if the retunes in Part B do not make draw/thin decks playable.

| # | ID | Name | Type · zone/slot | Cost | Stats | Rules text | Flavour |
|---|---|---|---|---|---|---|---|
| 38 | DDB-CON-PPR-007 | **Margin Notes** | Consumable | 2 | — | Discard 1 card, then draw 2 cards. If you discarded a Junk card, destroy it and draw only 1 card instead. | *The important part was underlined.* |
| 39 | DDB-KAT-PPR-004 | **Index Finger Feng Shui** | Kata | 3 | — | Look at the top 5 cards of your deck. Put 1 into your hand and the rest on the bottom in any order. | *The whole deck moved two inches and became spiritually organised.* |
| 40 | DDB-DEF-PPR-003 | **Carbon Copy** | Defense · Any | 3 | Guard 2 | If this Blocks, you may put a Kata or Consumable from your discard pile on the bottom of your deck. If you do, draw 1 card. | *The duplicate was somehow more official.* |
| 41 | DDB-ATK-PPR-011 | **Footnote Feint** | Attack · Mid | 3 | AP 2 | If you drew a card earlier this turn (not counting Initiate), this gets +2 Attack Power. If it Hits, you may discard 1 card to draw 1 card. | *The real argument was in the footnote.* |
| 42 | DDB-KAT-PPR-005 | **Archive Dive** | Kata | 4 | — | Return 1 card from your discard pile to your hand, then discard 1 card. If you returned a Defense, gain Barrier ×1. | *Full of things you swore you had thrown away.* |
| 43 | DDB-CON-PPR-008 | **Staple Remover** | Consumable | 3 | — | Any time: remove Stapled or Laminated from yourself. If you removed one, draw 1 card. | *The tool is tiny. The liberation is not.* |
| 44 | DDB-WPN-PPR-004 | **Red Pen** | Weapon · 1 Hand | 4 | Attack Bonus 1 | Your first Attack each turn against a fighter with Red Tape or Denied gets +1 Attack Power. If it Hits, you may remove 1 Red Tape from them. | *The correction is final, legible and deeply personal.* |
| 45 | DDB-GEA-PPR-002 | **Binder Clip** | Gear · Accessory | 3 | — | Once per turn, the second time you draw a card outside your Initiate draw that turn, gain 1 Focus or gain Barrier ×1. | *Prevents the plan from becoming a wind event.* |
| 46 | DDB-ATK-PPR-012 | **Recycling Kick** | Attack · Low | 3 | AP 2 | If you discarded a card this turn, this gains Flow. If it Hits, you may put 1 card from your discard pile on the bottom of your deck. | *Nothing is wasted, especially not the kick you regret.* |
| 47 | DDB-RIT-PPR-003 | **Unfiled Appeal** | Reaction Item | 3 | Guard 0 | Reaction. When a card or status would make you discard a card, discard this instead and draw 1 card. | *Never filed, but it arrived exactly on time.* |
| 48 | DDB-KAT-PPR-006 | **Open-Hand Ledger** | Kata | 3 | — | Reveal the top 3 cards of your deck. Put a card with Focus Value 2 or more into your hand and return the rest in any order. If none qualify, draw 1 card. | *The books are open. The auditor is impressed.* |
| 49 | DDB-CON-PPR-009 | **Clean Counter** | Consumable | 3 | — | Destroy 1 Junk card from your hand or discard pile. The next card you buy this turn costs 1 less Focus (minimum 1). | *A clean counter is a beautiful thing. It will not stay that way.* |

---

## Part B: retunes of existing cards (26)
Real catalog IDs. Current text is in `app/data/cards.json`; each is delivered as its own proposed record and approved one at a time.
Riders that mention **Barrier** or **Static Shock** (B23 to B26) only make sense once the Paperwork module is in the game; ship them with it.

### B1. Draw, cycling and deck-thinning (14)
| # | ID | Name | Cost now → new | Proposed rules text | Tags to add |
|---|---|---|---|---|---|
| 1 | DDB-KAT-CORE-010 | Clean Slate Drill | 4 → **3** | *(unchanged)* Destroy 1 Junk card from your hand or discard pile. If you destroyed it from your hand, draw 1 card. | Draw |
| 2 | DDB-KAT-CORE-031 | Kata of the Unlearned Bad Habit | 5 → **4** | Destroy 1 Junk card from your hand or discard pile. If you destroyed it from your hand, draw 1 card, then discard 1 card. | Cycle |
| 3 | DDB-KAT-CORE-025 | Gekisai Dai Ichi | 3 | Look at the top 5 cards of your deck. Put 1 Attack or Kata into your hand. Discard the rest. | Tutor |
| 4 | DDB-KAT-CORE-029 | Kanku Dai | 6 → **4** | Look at the top 4 cards of your deck. Put 1 card into your hand. Return the rest in any order. | Tutor |
| 5 | DDB-KAT-CORE-055 | Shadowboxing | 2 | Discard up to 2 cards, then draw that many cards. If you discarded a Junk card this way, draw 1 card, then discard 1 card. | Draw, Cycle |
| 6 | DDB-CON-CORE-006 | Caffeinated Mochi | 5 → **4** | Draw 2 cards, then discard 1 card. Lose 1 Speed until end of round. | Draw, Cycle |
| 7 | DDB-CON-CORE-024 | Fresh Martial Arts Gi | 5 → **4** | Destroy 1 Junk card from your hand or discard pile. If you do, draw 2 cards, then discard 1 card. | Draw |
| 8 | DDB-CON-CORE-025 | Green Tea | 5 → **4** | Draw 2 cards, then discard 1 card. If you discarded a Junk card, gain 1 Focus. | Draw, Cycle |
| 9 | DDB-CON-CORE-048 | Sensei's Advice | 3 | You may destroy 1 Junk card from your hand or discard pile. If you do, draw 2 cards, then discard 1 card; otherwise draw 1 card. | Draw |
| 10 | DDB-CON-CORE-051 | Sparring Dummy | 3 | Reveal the top 4 cards of your deck. Put 1 Attack or Kata among them into your hand; discard the rest. You may destroy 1 Junk discarded this way. | Tutor |
| 11 | DDB-DEF-CORE-044 | Step Back | 2 | *(unchanged)* | Draw, Cycle; build paths + Deck-Thin |
| 12 | DDB-ATK-CORE-025 | Front Jab | 4 → **3** | *(unchanged)* If this is your first Attack this turn, draw 1 card, then discard 1 card. | Draw, Cycle |
| 13 | DDB-CON-CORE-026 | Herbal Tea | 4 | Draw 2 cards, then discard 1 card. If you discarded a Junk card, destroy it. | Cycle, Deck-Thin |
| 14 | DDB-CON-CORE-018 | Energy Gel of Questionable Origin | 4 | If you played a Kata this turn, draw 3 cards; otherwise draw 2. Then discard 2 cards. | Draw, Cycle |

*(Herbal Tea differs from the audit: the audit gave it the same "gain 1 Focus" rider as Green Tea, which made it a second copy of Green Tea. Destroying the Junk makes it the deck-thin version.)*

### B2. Fortress compression and tank counterplay (12)
| # | ID | Name | Cost now → new | Proposed rules text |
|---|---|---|---|---|
| 15 | DDB-DEQ-CORE-003 | Bubble Wrap Gi | 3 → **4** | Chest slot. +1 DEF against all zones. The first time you take damage each round, reduce it by **1**; then exhaust this card. Ready it during your next Initiate. |
| 16 | DDB-DEQ-CORE-010 | Dojo Door | 6 (Guard 4 → **3**) | Occupies both hands. **+3** DEF against all zones and −2 Speed. You cannot Attack with a Weapon **or use Flow** while this is Equipped. |
| 17 | DDB-DEQ-CORE-029 | Museum Rope Barrier | 3 → **4** | Accessory. The first Attack targeting you each round gets **−1** Attack Power. Destroy this after it has affected **two** Attacks. |
| 18 | DDB-DEQ-CORE-032 | Participation Trophy Shield | 3 | Occupies one hand. +1 DEF against all zones. If you are **at least 3 XP behind the leader**, it provides +2 DEF instead. |
| 19 | DDB-DEQ-CORE-037 | Sensei's Disapproving Stare | 3 → **4** | Accessory. Once per round, the first Attack targeting you gets −1 Attack Power. If that Attack still deals damage, exhaust this card. |
| 20 | DDB-DEQ-CORE-040 | Stunt Double | 3 → **4** | Accessory. Once per game, when you would take damage, destroy this to prevent **up to 4** of that damage. |
| 21 | DDB-DEQ-CORE-044 | Trash Can Lid | 4 → **5** (Guard 2 → **1**) | Occupies one hand. **+1** DEF against all zones. **Once per round**, if you Block a Weapon Attack, your next purchase costs 1 less Focus, minimum 1. |
| 22 | DDB-RIT-CORE-012 | X-Ray Paper | 3 → **4** | Reaction. When you are targeted by an Attack, destroy this to prevent **up to 3** damage from that Attack. This provides 0 Guard. |
| 23 | DDB-ATK-CORE-003 | Ankle Invoice | 5 → **4** | On Hit, choose one matching Armor or Gear card on the target. It provides 2 less DEF until end of turn. If the target has Barrier, remove 1 Barrier. |
| 24 | DDB-ATK-CORE-009 | Centerline Breaker | 6 → **5** | If the target has matching Armor or Barrier, this Attack gains Piercing 2. On Hit, remove 1 Barrier from the target. |
| 25 | DDB-ATK-CORE-069 | Uppercut | 6 → **5** | If the target has already used Tempo this round or has Static Shock, this Attack gets +2 Attack Power. |
| 26 | DDB-KAT-CORE-040 | Naihanchi | 4 | Your **next** Low or Mid Attack this turn gets +1 Attack Power. If it Hits a target with Barrier, remove 1 Barrier. |

### B3. Do not nerf (anchors for the alternative builds)
Step Back (DDB-DEF-CORE-044), Clean Slate Drill (DDB-KAT-CORE-010), Guarded Optimism (DDB-CMB-CORE-017), and the cycling
fighters Late Bell Lee (DDB-CHR-CORE-020), Master Bento Blitz (DDB-CHR-CORE-023), Three Squirrels in One Gi (DDB-CHR-CORE-037),
Some guy named Steve (DDB-CHR-CORE-033), Venue Val (DDB-CHR-CORE-039) and Coach Karen (DDB-CHR-CORE-005).

---

## Part C: data tasks (no card text)
1. **Split the `Deck Control` tag** into `Draw`, `Cycle`, `Deck-Thin`, `Tutor` and `Recursion` across the catalog (metadata only).
   Today 59 Market cards mention drawing but only 20 carry a `Draw` tag, and 6 carry `Deck-Thin`.
2. **Tag the 49 new cards** with their status (`Scorch`, `Ink Blot`, …) and a build path (`Pressure`, `Control`, `Counter`,
   `Sustain`, `Flow`, `Deck-Thin`, `Combo`).
3. **Combo requirements**: each new Combo also needs a structured entry in `content/combo-requirements.json` so the engine can check it.

## Part D: rules tasks
1. **Market access guardrail: not adopted** (owner decision 92). The owner played with Market Scramble on and off and found
   it a matter of taste, so the Market stays as it is and Market Scramble stays an optional house rule.
2. **Promote the status glossary** into `content/dojo-game.json` and `content/rules.json` and the real engine once the arena
   numbers are signed off (`docs/status-effects-rules.md`, section 5).
3. **Matchup testing** with the simulator: the audit's scenarios A–E (Starter vs Fortress, Draw vs Pressure, Status vs Tank,
   Combo vs Control, Market access over 100 games each), judged against the 45–55% win-rate band.

## Suggested build order
1. **First batch (8):** Hot Coffee Spill, Leaky Fountain Pen, Laminating Press, Rubber Stamp of Refusal, File in Triplicate,
   Petty Cash Letter Opener, Slip Sweep, Crumple Zone.
2. The other 22 status cards, then the 4 Combos and 3 Locations.
3. The 26 retunes (Part B).
4. The 12 support cards, only if still needed.
