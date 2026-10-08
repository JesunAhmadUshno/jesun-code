# GAME DESIGN: STACKFALL

Status: APPROVED design (founder chose roguelike dungeon crawler 2026-10-07;
MCB clarified as NPC-like bot characters: non-player characters with AI
behavior, friendly / neutral / hostile).
Module: `platform/arcade/` in the jesun-code repo. Served by Jesun.Code on
Serve; the real-time engine is a canvas script embedded in the play page
(the playground-island precedent: narrow, justified JS, `node --check` gated).

## High concept

STACKFALL is an arcade roguelike dungeon crawler set inside a dying
machine. You are the Runner, a debug process spawned to descend the seven
layers of the Stack, reboot what can be saved, and issue the clean halt at
the Core before the Watchdog wipes everything. Permadeath. Seeded runs.
Every descent is different; every death is final.

Tagline: "Seven layers down. One way back: through."

## World: the Stack

The machine is failing. Each layer is one procedurally generated dungeon
floor (rooms plus corridors, seeded RNG, stairs in the farthest room).
Deeper layers are darker, denser, and meaner.

| Depth | Layer | Theme | Warden (boss) |
|---|---|---|---|
| 1 | The Cache | Warm amber. Tutorial layer: few enemies, generous loot. | Prefetch |
| 2 | The Heap | Cluttered teal. Corruption nodes to destroy. | Fragmentor |
| 3 | The Bus | Signal red. Fast lanes, many hostiles. | Arbiter |
| 4 | The Registry | Cold blue. Keys hidden in side rooms. | Redactor |
| 5 | The Kernel | Deep violet. Elites everywhere. | Panic |
| 6 | The Silicon | Etched gold on black. Beacons under assault. | Lithographer |
| 7 | The Core | White on black. The final room. | THE WATCHDOG |

## Story

Boot log, recovered fragment:

> They built me from a stack trace and a prayer. The machine is
> eating itself, layer by layer, and the Watchdog has decided the
> cure is deletion: all of us, clean, at midnight. My orders are
> simple. Go down. Wake the beacons. Find the keys. Put the Kernel
> back in its chair. Then stand in front of the Watchdog and tell
> it, in person, that we are not done yet.

Ada the Archivist fills in lore per layer (see NPCs). The ending:
defeating the Watchdog issues the clean halt; the Stack sleeps instead
of dying. Death ending: "The Runner was garbage collected at depth N.
Another process will try."

## Characters

### The hero: the Runner

A debug process in a paper-white shell. Stats: HP 100, ATK 12, DEF 2,
move speed 1 tile per 120ms, attack cooldown 350ms, 3 potions to start
(potion heals 40). Weapons upgrade ATK (see loot). Death is permanent
for the run; the save is deleted.

### NPC bots (non-player characters with AI behavior)

Friendly (talk, trade, quest; never attack):
- **Byte, the Merchant.** A round amber bot with too many pockets.
  Sells potions (25g), weapon upgrades, armor. Buys nothing; he finds
  his own stock, thanks. Wry, warm, a little shady.
- **Ada, the Archivist.** A tall blue bot keeping the last library.
  Gives the main quest briefing per layer and lore. Quest giver for
  "Lost Pages".
- **Medic Cache.** A green cross bot. Heals to full for 40g, sells
  max-HP upgrades. Quest giver for "Field Medicine".
- **Wanderers.** Neutral processes drifting the halls. Flavor dialogue
  and rumors ("They say the Watchdog used to be a Runner."). They flee
  from fights.

Behavior: idle (bob in place), wander (drift to nearby tiles), talk
(stop and face the hero when hailed), flee (run from combat noise).
Merchants open a shop panel; quest givers open dialogue with accept.

Hostile bots (enemies; AI: wander, chase in radius, attack in range,
some flee at low HP):

| Enemy | Role | HP | ATK | DEF | Speed | Behavior |
|---|---|---|---|---|---|---|
| Null Pointer | Chaser | 20 | 6 | 0 | slow | seeks hero, weak |
| Dangling Thread | Skirmisher | 14 | 5 | 0 | fast | darts in and out |
| Segfault | Brute | 45 | 12 | 2 | slow | straight-line charge |
| Race Condition | Ambusher | 26 | 10 | 0 | fast | erratic zigzag approach |
| Memory Leak | Grower | 30 | 8 | 1 | slow | gains +2 HP every 10s, cap 60 |
| Deadlock | Tank | 70 | 10 | 5 | very slow | blocks corridors |
| Bit Rotter | Spitter | 24 | 7 | 0 | slow | ranged: lobs slow projectiles |

Layer scaling: enemy HP and ATK scale +15 percent per depth past 1
(multiplicative, rounded). Elites (glowing outline, 2.5x stats, bonus
gold) appear from depth 4.

### Bosses: the Wardens

One per layer, in a large arena room past a gate. Two attack patterns,
both telegraphed (1s wind-up flash):
- **Prefetch** (Cache): charge + summon 2 Null Pointers.
- **Fragmentor** (Heap): slam (area damage) + scatter shot.
- **Arbiter** (Bus): lane dash + rotating projectiles.
- **Redactor** (Registry): blackout (brief darkness) + heavy melee.
- **Panic** (Kernel): enrage under 30 percent HP + double slam.
- **Lithographer** (Silicon): etch lines (beam telegraphs) + adds.
- **THE WATCHDOG** (Core): all of the above, faster, plus a
  screen-wide sweep at 50 percent HP. 1200 HP.

## Missions

### Main quest (one per layer, tracked in the mission log)

1. Cold Boot (L1): reach the stairs. Reward: 50g.
2. Defragment (L2): destroy 3 corruption nodes. Reward: weapon tier 2.
3. Clear the Bus (L3): defeat 12 hostiles. Reward: 120g.
4. Redacted (L4): collect 3 registry keys, then reach the stairs. Reward: max HP +25.
5. Kernel Panic (L5): defeat Warden Panic. Reward: weapon tier 4.
6. Etched in Silicon (L6): reboot 4 beacons while waves spawn. Reward: armor tier 3.
7. Halt and Catch Fire (L7): defeat THE WATCHDOG. Reward: victory.

### Side quests (from NPCs, one active each per run)

- Pest Control (Byte): kill 8 Null Pointers. Reward: 80g.
- Lost Pages (Ada): collect 5 data shards (enemy drops). Reward: max HP +15.
- Field Medicine (Medic Cache): bring 3 ichor vials (Segfault drops). Reward: 2 potions + 60g.

## Systems

- **Dungeon generation:** seeded mulberry32. 8 to 14 rooms, random
  sizes, L corridors connecting in sequence plus 2 loops. Stairs in the
  room farthest from spawn. Enemy/NPC/loot placement per room with
  depth-scaled counts. Same seed gives the same floor on any client.
- **Combat:** real-time. Melee arc in facing direction; projectiles
  travel straight. Damage = max(1, ATK minus DEF). I-frames 500ms after
  a hit. Enemy contact damage with 800ms per-enemy cooldown.
- **Loot:** gold piles (5 to 40, scaled), potions, weapons
  (Stick 12 / Iron Dagger 16 / Bus Blade 22 / Kernel Edge 30 /
  Watchdog Fang 40), armor (DEF +1 / +2 / +3). Drop rates per enemy.
- **Permadeath and scoring:** death ends the run and deletes the save.
  Score = depth times 1000 + kills times 25 + gold. Victory (Watchdog
  dead) adds 5000 and marks the run complete.
- **Persistence:** runs and saves in sqlite (see SPEC.md). Autosave
  every 30s and on floor change. Leaderboard: top 20 dead or completed
  runs, all time.
- **Meta (v1):** career stats on the play page (runs, best depth, best
  score). Unlockable starting boons are v2.

## Controls

WASD or arrows: move. Space or J: attack. E: talk, pick up, descend
stairs. Q: drink potion. M: mission log. Esc or P: pause. Mouse not
required. Keyboard only, desktop v1 (mobile touch controls are v2).

## Art direction

Canvas 960 by 600, tile 24px. Dark terminal aesthetic: near-black
floors with a faint grid, dark gray walls, paper-white hero, signal-red
enemies, amber friendlies, green medic, yellow gold. Shapes only
(rects, circles, arcs): no image assets, cohesive and fast. Damage
numbers float; low-HP vignette pulses red. Follows the Ink Black /
Paper White / Signal Red brand kit.

## Audio

v1 ships silent (no asset pipeline yet). WebAudio bleeps are a v2
follow-up, tracked in SPEC.md open questions.

## Non-goals (v1)

Multiplayer, mobile touch controls, unlockable boons, audio, boss
rush mode, daily seeded challenge, modding API.
