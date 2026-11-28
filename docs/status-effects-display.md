# How status effects look: design brief

The problem with the first passes: every effect was a decoration sitting on the art, every effect landed with the same
screen shake as a normal hit, and stacks just drew more copies of the same thing on top of each other.
This brief sets the rules the arena visuals follow.

## The idea: effects are paperwork happening to the fighter's dossier

On the mat each fighter is a **dossier card**: a filed document with a photo, stats, HP and a status tray.
Status effects are things that happen to that document: it gets burned, inked, laminated, stapled, cut, taped,
stamped, soaked, filed in a folder, charged with static, rushed, creased. So every effect is shown in three layers,
and each layer has one job.

| Layer | Job | Where | When |
|---|---|---|---|
| **1. The File Tab** | Tell you exactly what is on the fighter, how many stacks, how long | A coloured index tab clipped to the card's inner edge, one per effect, buffs on top | Always, while the effect lasts |
| **2. The Condition** | Show *how hurt* the document is, at a glance from across the table | One fixed region of the card per effect | Always, escalating with stacks |
| **3. The Moment** | Make landing, stacking, ticking and ending *feel* like that prop | On the card, about one second | Once, when it happens |

### 1. File Tabs (the legible layer)
- An index tab per effect: its colour, its icon, its name, **stack pips** (■■□ = 2 of 3) and a countdown ("2 rd", "1 turn").
- Buffs (Barrier, Rush Order) are filed on top, debuffs below, in a fixed order, so tabs never reshuffle.
- A new stack **pops a pip in** with a small stamp. The last round **flashes the countdown**.
- This is where exact numbers live, so the card art never needs to show "×3".

### 2. Conditions (the ambient layer)
**Every effect owns its own region of the card**, so several effects can coexist without piling up:

| Region | Effects |
|---|---|
| Bottom-left corner (and top-right at 3 stacks) | Scorch |
| Upper-left of the face | Ink Blot |
| Top edge | Stapled (staples and tag), Rush Order (sticker, top-right) |
| Right half of the face | Paper Cut slits |
| Lower third, wrapped round | Red Tape |
| Header (beside the name) | Denied (stamp waiting to land) |
| Bottom edge | Wet Floor (water) |
| Side edges | Barrier (folder flaps), Static Shock (crackling border) |
| Whole card, topmost | Laminated (plastic), Dog-Eared (creases) |

**Stacks escalate. They never copy.** Each stack adds a new stage, not another instance:

| Effect | 1 stack | 2 stacks | 3+ stacks |
|---|---|---|---|
| Scorch | the corner smoulders: browned, a thin ember line | the corner is burnt away, ember line glowing, sparks | a second corner catches, burn holes, heavy smoke |
| Ink Blot | one blot | blot runs: drips down the face | a second blot, the stats smudge; at 4 the ink pools across the top |
| Paper Cut | one slit | a second slit, steady drip | three slits, pooling at the bottom edge |
| Red Tape | one band round the card | a second band crosses it with the 27-B seal | n/a |
| Barrier | flaps with 1 sheet on the tab | more sheets; each absorbed point tears one out | 5 sheets |
| Dog-Eared | one crease and a folded corner | crumpled: second crease, paper goes soft and grey | n/a |

### 3. Moments (the feel layer)
Each effect has its **own prop, its own sound word and its own motion**. Screen shake is reserved for heavy, physical
impacts; everything else uses its own movement:

| Effect | Lands | Stacks / ticks / triggers | Word | Shakes? |
|---|---|---|---|---|
| Scorch | a lit match strikes in from off-card and touches the corner; the corner flashes | the burn flares; an orange −N floats up | FWOOSH! | no (heat shimmer) |
| Ink Blot | an ink pot tips over the card; drops spray | a fat drip falls; violet −N | SPLORT! | no |
| Laminated | a laminator roller sweeps down the card, leaving plastic behind | when Hit: the pouch rips in two, scraps fly | SEALED! / RIIIP! | rip only |
| Stapled | a stapler head slams down twice | when the pin redirects an Attack, the staples strain | KA-CHUNK! | yes, a short vertical jolt |
| Red Tape | a tape gun zips a band round the card | a second band and the seal pressed on | ZZZIP! | no |
| Denied | a stamp handle slams down huge, then the mark shrinks into the header | when it voids a card: VOID stamp, the card greys | DENIED! | yes, a short jolt |
| Paper Cut | a paper edge slices across, then red seeps | the slit reopens when you swing; red −N | SHHK! | no |
| Wet Floor | a bucket splashes from above; the puddle spreads | ripples | SPLOOSH! | no (a slip wobble) |
| Barrier | folder flaps snap shut | an absorbed hit tears out sheets; blue −N blocked | SNAP! | no |
| Static Shock | a jagged bolt strikes; the card flashes negative for two frames | the jolt: bolt plus inverted flash, yellow −N | ZZZT! | yes, a jitter |
| Rush Order | a RUSH sticker slaps on with a bounce, speed lines whip past | an extra card: "+1 CARD" | RUSH! | no |
| Dog-Eared | the card crumples, then unfolds with creases | a Hit crinkles it again: +N | CRUMPLE! | yes, a squash |
| Reimburse | (weapon equipped: a ledger slot) | a receipt prints and tears off: rose +N | KA-CHING! | no |

### Motion language
- **Props move like paper puppets:** stop-motion steps (4–8 frames), with snappy overshoot on slams.
- **Only light and heat move smoothly:** ember glow, sheen, sparks.
- **Moments are short:** about 1 second, never blocking play.
- **Reduced motion** (OS setting, site setting or the game's Motion setting):
  - Moments become a two-frame appearance with no travel and no shake.
  - Conditions and tabs stay exactly as they are, so no information is lost.

### Colour
Each effect has one signature colour, used on its tab, its sound word and its life-bar look:
- Scorch: ember orange.
- Ink: violet.
- Laminate: ice.
- Stapled: steel.
- Red Tape and Denied: stamp red.
- Paper Cut: blood red.
- Wet Floor: water blue.
- Barrier: guard blue.
- Shock: volt yellow.
- Rush Order: rush gold.
- Dog-Eared: paper grey.
- Reimburse: rose.
