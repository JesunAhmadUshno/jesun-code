# DEEPDELVE REALMS: Design Audit

Version: 1.0 | Date: 2026-10-07 | Author: FirstMate (indie dev loop)
Files: `jc/realms.jc` (1909 lines, pure Jesun.Code, zero imports), `realms.html` (driver)
Status: verified (see Performance Budget). Not committed, not deployed.

## 1. Systems list

Every system from `deepdelve.jc` is preserved, then extended:

| System | Status | Notes |
|---|---|---|
| Procedural dungeon (rooms + corridors) | kept | 60x42 grid, up to 11 rooms, L corridors, unchanged |
| Park-Miller RNG | kept | `rnd with n`, deterministic per seed |
| 5 enemy types (rat, bat, goblin, ogre, Deep Warden) | kept | stats now scaled by difficulty multipliers |
| Deep Warden boss every 3rd floor | kept | locked stairs until boss dies, unchanged |
| Locked stairs | kept | plus new rope ladder back to the surface on depth 1 |
| NPC wanderer (heal + hints) | kept | now with idle bob animation |
| NPC merchant (20g potion) | kept | unchanged trade logic |
| Items: gold, potion, shrines (might/vitality) | kept | shrine spawn chance reduced on nightmare |
| Permadeath | kept | `G["over"]`, score shown on death |
| Score formula | kept | `gold + (depth-1)*100 + kills*10`, depth floored at 1 for overworld |
| Top-down renderer | kept + improved | torch flicker, walk cycles, particles |
| First-person raycaster | NEW | 48 rays, 66 deg FOV, DDA, billboarded sprites, z-buffer occlusion |
| Overworld (Emberhold village) | NEW | houses, well, paths, river + bridge, trees, flowers, cave entrance |
| Quest NPCs (elder, villagers) | NEW | multi-line dialogue, elder blessing quest (30g -> +2 atk) |
| 3 difficulties | NEW | `set_difficulty with d`: story / delver / nightmare |
| Particles | NEW | hit sparks, potion bubbles, shrine glints, kill bursts, 36 cap, lifetimes |
| Mode toggle | NEW | M key switches top-down / first-person (dungeon only) |

Driver contract (unchanged shape): globals `G`, `OUT`; routines `seed_game with s`,
`set_difficulty with d`, `press with k`, `tick`; `OUT["dl"]` display list with
`["rect",x,y,w,h,color]`, `["circle",x,y,r,color]`, `["line",x1,y1,x2,y2,color]`,
`["clear",color]`; `OUT` also carries `hud` (now with `mode`, `diff`, `realm`),
`msgs`, `over`, `score`.

## 2. Renderer math

### 2.1 Top-down (both maps)
192x128 frame, 8px tiles, 24x16 viewport. Camera clamped to keep the 60x42 grid
in range: `camx = clamp(px-12, 0, 36)`, `camy = clamp(py-8, 0, 26)`.

### 2.2 First-person raycaster (dungeon only)
The language has no trig, so all rotation uses fixed float constants:

- Turn step 15 deg: cos 0.96593, sin 0.25882. Facing vector `(fdx, fdy)` is
  maintained exactly; A/D rotate it by +/-15 deg per press.
- Ray fan: leftmost ray = facing rotated by -33 deg (cos 0.83867, sin 0.54464),
  then 47 steps of +66/47 deg (cos 0.99970, sin 0.02450). 48 rays, 66 deg FOV.
- DDA on the 0/1 dungeon grid, max 32 steps per ray (view distance cap;
  corridors longer than 32 tiles foreshorten, which is visually negligible).
- Perpendicular distance `depth = dist * dot(raydir, facedir)` removes fisheye.
  Wall strip height = `128 / depth`, drawn 4px wide at `x = i*4`.
- Shading: 4 distance bands (<1.5, <3, <6, else) x 2 wall sides = 8 flat colors
  (`G["xcols"]`, `G["ycols"]`). Side-1 (y-facing) walls render one step darker.
- Ceiling: 8 horizontal bands (8px each, dark blue gradient toward horizon).
  Floor: 8 bands (dark slate gradient). 16 rects total.
- Sprites: entities projected to camera space.
  `depth = rel . facing`, `lateral = rel . right` where `right = (-fdy, fdx)`.
  Screen x = `96 + lateral * 147.83 / depth` (focal = 96 / tan(33deg) = 147.83).
  Sprite height = `147.83 * 0.85 / depth`, clamped to 120px.
  Cull: depth outside 0.4..14, or center column's z-buffer nearer than depth-0.3.
  Sort: insertion sort far-to-near (n <= ~35, fine). Two rects per sprite
  (body + head) with 2-level distance tinting.
- Particles project the same way as 1-4px rects.
- Player blade: 2 static rects at bottom center (viewmodel).
- All output coordinates are integers (`ipart`), because the JS rasterizer
  misbehaves on fractional pixel indices.

HONEST CEILING (also noted in code): the driver only understands rect/circle/line.
There is no texture memory or image blitting, so "textures" here means flat-shaded
pixel art: multi-rect sprites, distance-banded walls, two-tone checker dithering
on static top-down tiles, and animated color cycling. True per-pixel dithering or
lightmapping would need new driver primitives.

### 2.3 Overworld terrain codes
0 grass, 1 tree, 2 water, 3 path, 4 house, 5 well, 6 flowers, 7 cave.
Blocking: 1, 2, 4, 5. Walkable: 0, 3, 6, 7.

## 3. Balance tables per difficulty

`set_difficulty with d` is called once after `seed_game`, before the first tick
(the HTML bridge calls it inside `start_game(seed, diff)`). Enemy stats scale by
`ehp`/`edmg` percent via integer math `idiv(stat * pct, 100)`.

| | Story (1) | Delver (2) | Nightmare (3) |
|---|---|---|---|
| Enemy HP | 60% | 100% | 150% |
| Enemy damage | 60% | 100% | 150% |
| Starting potions | 2 | 1 | 0 |
| Shrine chance per floor | 55% | 55% | 20% |

Depth-1 enemy stats (base, before difficulty):

| Enemy | HP | Atk | Speed (ticks/move) | Behavior |
|---|---|---|---|---|
| Cave Rat | 16 | 4 | 3 | wander |
| Gloom Bat | 12 | 5 | 1 | wander, fast |
| Goblin | 28 | 7 | 2 | chase < 10 tiles |
| Deep Ogre | 57 | 11 | 3 | chase < 10 tiles |
| Deep Warden (depth 3) | 156 | 17 | 2 | chase, boss |

Depth scaling per floor: HP `+ idiv(d*5, 2)`, Atk `+ idiv(d*4, 5)` (non-boss);
Warden HP `120 + d*12`, Atk `14 + d`.

Story examples (depth 1): rat 9 HP / 2 atk; bat 7 / 3; goblin 16 / 4; ogre 34 / 6.
Nightmare examples (depth 1): rat 24 / 6; bat 18 / 7; goblin 42 / 10; ogre 85 / 16;
Warden (depth 3): 234 HP / 25 atk.

Player: 100 HP, 12 atk + rnd(0..3) per swing. Potion +40 HP. Wanderer heal +30
(once). Shrine of Might +2 atk, Shrine of Vitality +10 max HP. Merchant potion 20g.
Elder blessing (overworld quest): 30g -> +2 atk, once per run.

Economy: enemy loot `3 + rnd(6) + idiv(depth*3, 2)`; Warden hoard `60 + depth*10`;
gold piles `5 + rnd(6 + depth*3)`.

## 4. Map-gen algorithms

### 4.1 Dungeon (`gen_floor with d`)
Unchanged from deepdelve: random non-overlapping rooms (5-11 x 4-8, up to 11 rooms,
200 placement tries), carved, connected by L corridors between consecutive room
centers. Player spawns at rooms[0] center, stairs at last room center. Enemies
`4 + d*2` (cap 22), type mix shifts with depth (ogres after depth 3, goblins after
depth 1). 1-2 NPCs, 5-8 gold/potion items, one shrine at 55% (20% nightmare).
NEW: on depth 1, a rope ladder (`upx`,`upy`) is placed via `free_spot`; stepping
on it returns to a freshly generated overworld.

### 4.2 Overworld (`gen_overworld`)
1. Fill 60x42 with grass.
2. 14 tree clusters: random center, 3-6 trees in a 3x3 blob (grass only).
3. River: random walk from x = 26+rnd(10), 2 tiles wide, dx in {-1,0,1} per row,
   clamped to x 8..50. Records x at row 34 for the bridge.
4. Bridge: the 2 river tiles at row 34 become path.
5. Well: 2x2 at (14..15, 11..12).
6. 4 houses: 5x4 blocks at grid positions (7/19, 7/16) with jitter, grass-only
   placement, door tile (path) at bottom center, L-path carved door -> well.
7. Paths: well -> bridge, bridge east end -> cave.
8. 40 flower tufts on grass.
9. Cave: 2x2 at (50..51, 34..35).
10. NPCs: Elder Marla near the well, 2 villagers near houses (walkable-spot search).
11. Items: 6 gold caches, 3 potions on walkable tiles.
12. Player at (15,15), mission "Explore Emberhold. Find the cave east of the river."

Village/house construction only overwrites grass/flowers, so the river is never
damaged by later steps.

### 4.3 Realm connections
- Overworld cave tile (code 7), step-on -> `enter_dungeon` (dungeon depth 1).
- Dungeon depth-1 rope ladder, step-on -> `gen_overworld` (surface).
- Dungeon stairs, step-on -> descend (locked on boss floors until Warden dies).

## 5. Animation frame tables

| Subject | Frames | Driver |
|---|---|---|
| Player walk | 2 (legs alternate by `pph % 2`) | every top-down/FPP step |
| Player attack | lunge blade (6px) for 2 ticks after `patk` | `player_attack` sets `patk` |
| Rat | 2 (body hop + leg swap by `(ph+tick) % 2`) | `ph` increments on move |
| Bat | 2 (wings up / wings down) | `(tick + ph) % 2` |
| Goblin / Ogre | 2 (leg swap) | `(ph + tick) % 2` |
| Warden | 2 (eye pulse red/bright) | `(tick + ph) % 4 == 2` |
| Enemy attack | red slash tick for 2 ticks after `atkT` | set in `enemy_ai` on hit |
| NPC idle | bob 1px every 4th tick | `(tick + ph) % 4 == 3` |
| Gold | 2 (bob 1px) | `(tick + id) % 2` |
| Shrine | 2 (glow / white flash) | `(tick + id) % 4 < 2` |
| Water | 2 colors + foam line | `(x + tick) % 2`, foam `% 4 == 0` |
| Well water | 2 colors | `tick % 4 == 2` |
| Wall torch | 2 shades + sparkle tile | `(x+y+tick) % 2`, sparkle `(3x+5y+tick) % 7 == 0` |
| Particles | lifetime 4-8 ticks, shrink not possible (2px rects), jitter by seed | `tick_parts` expires |

## 6. Performance budget

Budget: 150 ms/frame driver interval; internal target <= ~120 ms/tick under
Node+Pyodide (Pyodide is the slowest supported runtime).

Measured (Node 24 + Pyodide 0.26.4, exact HTML bridge code):

| Scenario | avg ms/tick | p50 | p95 | max | Verdict |
|---|---|---|---|---|---|
| Overworld top-down, 30 ticks | 48.7 | - | - | 110 | OK |
| Dungeon FPP, 60 ticks (movement keys) | 58.3 | 52 | 114 | 223* | OK |
| Dungeon top-down, 30 ticks | ~40 | - | - | 83 | OK |

CPython reference: 20.0 ms/tick average over a 400-tick mixed pump
(overworld + dungeon, both modes, all difficulties).

*The 223 ms max is a single-sample Python GC pause (confirmed: disabling GC on
CPython drops render max from 118 ms to 63 ms). Typical ticks sit far below the
150 ms frame budget; the hitch manifests as one delayed frame, not a stall.

Optimizations applied to fit the budget:
- DDA capped at 32 steps per ray (was 48); rooms never exceed this view distance
  meaningfully.
- `cast_one` pushes depth straight into the z-buffer list and returns only the
  side flag (was allocating a `[depth, side]` list per ray: 48 fewer allocations
  per frame).
- All FPP output coordinates are integers via `ipart` (also a rasterizer
  correctness requirement).
- Particle list capped at 36 with lifetimes; sprite sort is insertion sort over
  at most ~35 entries.
- Top-down tile loop unchanged at 384 iterations; overworld terrain dispatch is
  a single if-chain per tile.

Correctness verification (all green):
1. CPython pump: 400 randomized ticks across modes (top/fpp), difficulties
   (1/2/3), maps (overworld/dungeon), keys incl. `m`, `1`, `x` (unknown keys are
   ignored, no crash). Zero exceptions. Max display list 577 commands.
2. Determinism: same seed + 50 identical input ticks -> byte-identical OUT.
3. Node+Pyodide: exact bridge flow (`seed_game`, `set_difficulty`, `tick`,
   `pump` with keys) for all three difficulties; boot OK, start OK.
4. Scripted gameplay paths: cave -> dungeon depth 1; rope ladder -> overworld;
   elder 30g -> +2 atk blessing; stairs -> depth 2; depth-3 boss floor locked
   with Warden; nightmare floor-1 shrines = 0; overworld score >= 0.
5. Visual sanity: ASCII dumps of FPP frames show coherent wall strips
   (48 columns, 0..188 step 4, heights 3..77, distance-shaded colors,
   all-integer rects); overworld frame 578 commands with terrain/NPCs/items.

## 7. Known limits / honest notes

- FPP works in the dungeon only; M in the overworld prints a message. This is
  by design (raycaster assumes a 0/1 grid).
- The driver still sends `"space"` for the Space key; `handle_key` now accepts
  both `" "` and `"space"` (the old game only accepted `" "`, so its ATK button
  was dead; fixed here).
- Returning to the overworld regenerates the village (new layout). Quest flags
  (`blessed`) and player stats persist; NPC positions do not.
- Jesun.Code parsing quirks hit during development (documented for future work):
  a nested `with`-call greedily consumes following `and` arguments, and a call
  result cannot be compared inline (`if f with x is nothing` fails); hoist to
  temps first. Bare `if f with x then` as a condition is fine.
- `realms.html` is not deployed; only `deepdelve.html` is live. Deploying
  realms is a separate explicit step.
