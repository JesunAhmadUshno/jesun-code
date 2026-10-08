# DEEPDELVE REALMS: Game Roadmap

Created 2026-10-07 by the solo indie dev loop (first run). Played the live build
end to end via a CPython pump harness: overworld, cave entry, dungeon gen,
FPP toggle, combat, merchant, shrines, boss floor. Ordered by player value per
unit of risk. One item ships per run, top first. Done items move to CHANGELOG.md.

## Open

### 1. Enemy separation steering
Chasers conga-line behind each other in corridors. Add a cheap sidestep: when
the target tile is occupied by another enemy, try the perpendicular tile before
giving up. Keeps per-tick cost O(enemies).

### 2. Ranged enemy: Gloom Spitter (depth 2+)
First ranged threat. Slow projectiles as a small entity list (1 tile per 2
ticks, die on wall or player hit). Needs one new sprite in `assets/custom.png`
plus an `atlas.json` entry, drawn in the existing 16x16 style.

### 3. Villager quest log
One elder quest is the whole quest system. Add three turn-in quests from
villagers/wanderers (rat pelts x6, gold tithe 50g, deep shard from depth 3+),
tracked in the quest HUD line, rewarding atk / max HP / potions.

### 4. Second boss: Gloom Matriarch (depth 6)
The Deep Warden is the only boss. A second boss on depth 6 that periodically
spawns bats, reusing the stairs lock/seal logic and boss HP bar.

### 5. Overworld day/night tint
Slow palette cycle on overworld top-down tiles driven by tick. Cheap
atmosphere, zero gameplay cost, no driver change.

### 6. FPP torch flicker lighting
Per-column brightness noise tied to tick in the FPP renderer. Sells the dungeon
mood; bounded by the existing 48-ray budget.

### 7. Boot progress readout
Phone boot (Pyodide + atlas fetch) feels long and silent. Show a % counter on
the loading overlay while fetching atlas files. Driver-only change.

## Done

### 2026-10-08: Pause with P key and touch button (roadmap item 1)
Shipped. `G["paused"]` freezes the tick pump: world clock, enemy AI,
particles and floaters hold; queued keys are dropped; only P unpauses.
A gold-bordered PAUSED panel stamps through the display list on the frozen
frame in top-down and first-person modes. Driver maps the P key and adds a
II button in the touch dpad. Pure Jesun.Code, no driver logic change.
Verified: 1200-tick CPython pump zero exceptions, pause unit checks
(freeze/drop-keys/overlay/resume), determinism byte-identical,
Node+Pyodide bridge FPP avg 40.1ms/tick (budget 120ms). Next up: Enemy
separation steering.

### 2026-10-08: FPP minimap (roadmap item 1)
Shipped. Top-right 1px-per-tile dungeon overview in first-person mode:
rooms as dark rects, corridor dots, stairs gold, up-ladder cyan, boss red,
player white arrow tracking facing. Corridor cells precomputed at floor gen;
per-tick draw O(rooms + cells). Pure Jesun.Code, no driver change.
Verified: 1600-tick CPython pump zero exceptions, determinism byte-identical,
Node+Pyodide FPP avg 43.9ms/tick (budget 120ms). Next up: Pause.

### 2026-10-07: Procedural sound effects (Web Audio)
Shipped as roadmap item 1. New `OUT["snd"]` channel: Jesun.Code emits
`["tone", f0, f1, dur_ms, wave, vol]` and `["noise", dur_ms, vol]` commands on
17 game events (swing, hit, crit, kill, hurt, death, potion, gold, stairs,
surface, shrine, buy, bless, bossdie, heal, error, UI click). `realms.html`
plays them through a lazily created AudioContext unlocked on the START tap,
with a SOUND ON/OFF toggle in the HUD persisted to localStorage. Verified:
1200-tick CPython pump zero exceptions, determinism byte-identical, Node+
Pyodide exact bridge flow FPP dungeon avg 71.4ms/tick (budget 120ms), audio
functions stub-tested (tones, noise, unknown-op ignored, mute silences).
