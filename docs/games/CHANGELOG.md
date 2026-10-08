# DEEPDELVE REALMS: Changelog

Newest first. Each entry is one shipped loop iteration (or a pre-loop build).

## 2026-10-08

### REALMS 3D phase (e): overworld in real 3D, no more top-down sprites (indie dev loop)
- Emberhold is now real 3D geometry whenever WebGL is available. Jesun.Code
  emits an oblique third-person scene (`cam3do` camera over the knight):
  one textured terrain quad per tile in a 13x13 window (grass, flowers,
  path, two-frame shimmering water, wood, stone, dark cave ground), house
  walls as vertical quads with raised roof planes, and low-poly prop models
  for pine/round trees, the well, and the cave mouth.
- Five new driver models in the dark style (all under 20 boxes): the knight
  player character (horned helm, glowing visor, walk-cycle limbs, faces the
  last travel direction via a new `G["pyaw"]` tracked in `try_move`), tree1,
  tree2, well, cave. NPCs, gold, potions, shrines, and spark particles reuse
  the existing models, culled to the view window.
- Driver: atlas expanded to 256x256 with 9 new hand-drawn terrain cells
  (grass, water x2, path, wood, roof, stone, dark, flowers); `renderGL`
  handles `cam3do` with a sky-blue clear, sun light at the camera, and light
  distance fog; damage floaters project as `text3d` in the 3D overworld;
  HUD view label shows OVERWORLD 3D. 2D top-down stays as the fallback when
  WebGL is missing (`G["gl3d"]` false).
- Game logic stays 100% Jesun.Code; deepdelve.jc/deepdelve.html untouched.
- Driver: `APP_VERSION` bumped to `20261008h` (initial ship).
- Verified: CPython unit checks (cam3do/knight/trees/grass, yaw tracks WASD,
  water frames, 2D fallback intact), 50-tick determinism byte-identical
  across overworld-3D and dungeon-FPP3D, 400-tick randomized pumps on all
  three difficulties with gl3d on plus a 2D regression (zero exceptions,
  ~10ms/tick), Node+Pyodide exact bridge flow 120 ticks avg 14.9ms/tick
  (budget 120ms), existing `move_regress.mjs` 13/13 green, driver JS syntax
  checked. New tests: `docs/games/tests/over3d_bridge.mjs`.
- Browser playtest of the pushed page with screenshots still owed
  (delegated next).
- Playtest follow-up (same run): live playtest confirmed the new build
  (HUD shows OVERWORLD 3D), 3D terrain/houses/trees/river/knight all render,
  WASD movement works with the knight facing travel direction, no page
  errors. Two findings fixed in this ship: the knight rendered as a near-
  black silhouette, and the whole overworld read too dark. Driver now uses
  a per-camera ambient uniform (0.45 for the overworld sun-lit camera,
  0.22 unchanged for the dungeon torch), and the knight's armor colors were
  brightened (dark style kept, silhouette gone). The "blue roof" note was
  the river bending behind a house, not a bug. Console could not be
  inspected in the automation environment; no page-visible errors.
- Driver: `APP_VERSION` bumped to `20261008i` for the lighting fix.
- Visual confirmation of (i) still owed: a follow-up screenshot ~4 minutes
  after the push showed the old look (knight still black, no brighter
  scene), consistent with GitHub Pages deploy/CDN propagation lag rather
  than an ineffective change (the math triples the knight's lit value; the
  old shader would have had to be served). Next loop run: reload the live
  page and screenshot-verify the knight reads detailed and the scene
  brighter before calling phase (e) fully done.

### REALMS movement hardening: stranded rescue, spawn clearing, NPC soft-lock fix (playtest bugfixes)
- Root causes addressed for "WASD dead while M works": the water-rescue
  branch could loop forever when the last-walkable tile was also bad, and
  the random seed could box the spawn or let the meandering river sever the
  village path to the cave.
- `try_move` rescue now falls back to a spiral search (`rescue_spot`) for
  the nearest walkable tile, so movement can never die while other keys
  keep working. Verified: a forcibly stranded player is rescued and the
  next move works.
- `gen_overworld` paves a walkable ring around the spawn and repairs any
  water gaps on the village-to-bridge-to-cave route, so the cave mouth is
  reachable on every seed (30/30 seeds checked, including one seed where
  the river previously cut the path).
- NPC soft-lock fixed: `try_move` remembers the blocking NPC
  (`G["block_npc"]`), and E talks to that NPC even if it wandered a step
  before the keypress. Elder Marla can no longer block-then-dodge into
  "Nobody to talk to here."
- New bridge-level regression test `docs/games/tests/move_regress.mjs`
  (13 checks, all green): fresh-boot WASD movement, spawn/cave reachability
  across seeds, rescue recovery, E dialogue, block-then-wander E, M.
- Driver key mapping verified correct and unchanged (WASD/arrows/M all map
  to the right tokens in the deployed page); game input handling verified
  through the exact bridge flow under Node+Pyodide.
- APP_VERSION 20261008f. FPP-3D scene build 15.8ms/tick (budget 120ms).
  CPython pump 400 ticks zero exceptions, determinism byte-identical.

### REALMS 3D phase (d): real WebGL 3D renderer, no sprites in first-person (founder directive)
- First-person mode is now real 3D geometry. Jesun.Code emits a 3D scene
  (`cam3d` camera, `quad3d` textured dungeon quads, `model3d` entities,
  `text3d` world-anchored text, `sword3d` attack swing); the driver draws it
  with WebGL: true perspective projection, depth testing, a torch point
  light at the camera, and distance fog. Zero sprites in FPP.
- Dungeon from the grid: one 13x13 window around the player, one quad per
  exposed wall face, single floor and ceiling quads with repeating
  procedural stone textures (canvas-generated, dark style).
- 13 low-poly cuboid character/prop models in the driver (all under 20
  boxes): goblin, ogre, cave rat, gloom bat, Deep Warden, merchant, elder,
  villager, wanderer, gold pile, potion, shrine, plus spark particles and a
  3D sword viewmodel. Walk pose swings limbs on the tick parity; glowing
  eyes are emissive. Enemies face the player in 8 coarse directions
  (no trig in the language).
- Fallback: if WebGL is unavailable the game keeps the 2D raycaster
  (`G["gl3d"]` flag, set by the driver at boot). Top-down overworld stays
  2D (phase (e)).
- Three playtest bugs fixed in game logic: (1) water rescue: the knight can
  never be stranded on an unwalkable tile (last-walkable tracking plus an
  explicit walkability guard); (2) NPCs can no longer block the cave mouth,
  rope ladder, or stairs (special tiles win over NPC blocking, NPCs never
  wander onto them); (3) M reliably enters FPP in the dungeon (rope ladder
  never spawns adjacent to the dungeon entry, and stepping in place on the
  ladder no longer surfaces the player).
- Driver: `APP_VERSION` bumped to `20261008e`.
- Verified: CPython 400-tick pump zero exceptions, determinism byte-identical
  (2D and 3D paths), bug-fix reproductions (water rescue, cave unblockable,
  ladder placement 0/200 adjacent, no false surface, legit surfacing intact),
  Node+Pyodide exact bridge flow FPP-3D scene build 18.5ms/tick (budget
  120ms). Browser playtest with screenshots still owed (delegated).

### Dark art phase 2: polish + walk frames (indie dev loop)
- Polish pass on all 11 dark sprites: deeper multi-stop shading gradient,
  silhouette edge vignette, ordered dither grain, stronger cold rim light,
  plus per-sprite texture detail (armor plate seams and rivets, chainmail,
  goblin warts, ogre mottling and scar, rat fur tufts, bat membrane ribs,
  warden cape folds and engraved sigil, cloth folds on all robes).
- Six new second animation frames appended to `assets/dark.png` (base cells
  never moved): `knight2`, `goblin2`, `ogre2`, `rat2`, `bat2`, `warden2`
  (walk poses, raised weapons, beating wings).
- Game logic (100% Jesun.Code): `draw_enemy` and `draw_player` alternate
  frames on a 4-tick period with a per-enemy offset so packs do not march in
  lockstep; `fpp_spr_name` uses the same parity so the 3D billboards agree
  with the top-down view. `sprw_of` covers the 6 new names (32px).
- Driver: `APP_VERSION` bumped to `20261008d` so the new game code can never
  mix with a cached old driver.
- Verified: CPython 400-tick pump zero exceptions (12.5ms/tick), determinism
  byte-identical, walk-frame unit checks (both frames in top-down and FPP,
  parity agrees), Node+Pyodide exact bridge flow FPP 63.5ms/tick with sprites
  in view (budget 120ms). Next: NPC idle frames.

### Dark art overhaul: real gamer character set + cache-busting driver fix (indie dev loop)
- New `assets/dark.png`: 11 hand-drawn 32x32 character/enemy sprites in a dark,
  gritty, mature style (CC0, original work; generator script kept with the goal
  files). Knight with horned helm and glowing visor, goblin, ogre, cave rat,
  gloom bat, Deep Warden boss, merchant, elder, two villagers, wanderer.
  Near-black outlines, cold rim light, glowing eyes. Replaces the cartoonish
  Kenney lookups for these names in `assets/atlas.json`.
- New `sprw_of` routine in Jesun.Code: per-sprite texture width table so the
  FPP billboard column math samples the full 32px texture (tiles stay 16px).
  Game logic stays 100% Jesun.Code.
- Dungeon mood deepened slightly: FPP distance shading now `1 - d/24` with a
  0.45 floor (was `1 - d/28`, floor 0.5).
- Cache-busting fix (driver-only): every game asset fetch in `realms.html`
  now appends `?v=` plus a single `APP_VERSION` constant (bump per ship),
  covering `jc/jesun.py`, `jc/realms.jc`, `assets/atlas.json`, and all atlas
  PNG loads. A returning browser can no longer mix new game code with a cached
  old driver (which silently dropped the new `sslice` ops and left enemies
  invisible).
- Verified: CPython 400-tick randomized pump zero exceptions; determinism
  byte-identical; `sprw_of` unit checks (11 dark names to 32, tiles and
  unknown names to 16); staged FPP billboard checks for rat/bat/goblin/ogre/
  warden with exact texture bounds; Node+Pyodide exact bridge flow: FPP
  61.0ms/tick with dark sprites in view, 44.4ms/tick without (budget 120ms).

### Audit + red-team hardening pass (founder-ordered)
- Slop audit of every user-facing string: no placeholders, no garbled text,
  no em dashes, no dead menu options. Fixed the potion message to report the
  actual HP restored ("+10 HP") instead of always claiming +40.
- HUD label "Mood" renamed to "Risk" (it shows the difficulty: STORY / DELVER
  / NIGHTMARE).
- Fixed floating combat text rendering: damage numbers, crits, and loot text
  were drawn at raw tile coordinates as screen pixels, so they appeared near
  the top-left of the canvas instead of over the fight. Floaters are now
  projected properly: camera-relative in top-down modes (with off-screen
  culling) and ray-projected into the 3D view in first-person mode.
- Red-teamed through the CPython harness: 2000-tick random key spam,
  pause/unpause flapping during combat and hit-stop, difficulty switch
  mid-run, M-toggle flapping, potion/merchant/elder/wanderer edge cases
  (0 gold, 0 potions, full HP, exact-change buys, no double bless), seeds 0
  and huge, idle soaks, stairs/ladder transitions, boss kill plus stairs
  unlock, enemy wall-clip sweep, pause during death. No crashes, no softlocks,
  no invalid state (negative gold/HP/potions, enemies in walls).
- Hardening from the findings: `set_difficulty` now applies once per run
  (a second call can no longer compound enemy stat scaling); `tick` holds
  the last frame after death instead of processing keys on a corpse.
- Verified: CPython 400-tick randomized pump zero exceptions, determinism
  byte-identical, Node+Pyodide bridge FPP 68.5ms/tick with sprites
  (49.2ms/tick without), top-down 18.0ms/tick, all under the 120ms budget.
  Game logic stays 100% Jesun.Code; deepdelve.jc/deepdelve.html untouched.

### REALMS 3D phase (a): billboarded sprites in FPP (indie dev loop)
- Every visible enemy, NPC, and item in first-person mode is now a true-3D
  billboarded sprite: projected to camera space, scaled by distance, drawn
  as textured vertical strips from the atlas (new `sslice` display-list
  command), mirroring the existing textured wall-column technique.
- Per-column depth test against the 48-ray depth buffer, so sprites clip
  correctly behind wall edges instead of popping. Visible columns are
  coalesced into runs (usually one strip per sprite) to keep the display
  list small.
- Exact early-outs keep it fast: fully-behind-wall sprites are skipped and
  fully-visible sprites take a single-strip fast path (min/max over covered
  ray columns). Sprite draw capped at the 12 nearest.
- Founder texture-quality pass: shading is deliberately subtle (min 0.5, was
  0.15) so texture detail stays readable at range; the driver smooth-filters
  sprite strips (bilinear, high quality) so close sprites are not blocky.
  Shaded sprite cache is source-atop, so transparent pixels stay transparent.
- No projectiles exist in the game yet (Gloom Spitter is a later roadmap
  item); when it ships its bolts reuse this path.
- Game logic stays 100% Jesun.Code; driver adds only the `sslice` strip
  renderer plus the shade cache (small, driver-only).
- Verified: CPython 400-tick randomized pump across modes/difficulties zero
  exceptions; determinism byte-identical; occlusion unit tests (visible /
  fully hidden / partial wall edge / behind camera) all exact; PIL render of
  a staged FPP frame confirms textured billboards with correct depth order;
  Node+Pyodide exact bridge flow: FPP 60.9ms/tick with 6 sprites in view,
  45.6ms/tick without sprites (budget 120ms).

### Pause with P key and touch button (indie dev loop, run 3)
- New `G["paused"]` flag toggled by the P key (keyboard) and a II button in
  the touch dpad. While paused the tick pump freezes the world clock, enemy
  AI, particles and floaters; queued keys are dropped instead of piling up;
  only P is honored so the player can always resume.
- A PAUSED panel stamps itself through the display list on the frozen frame
  (gold-bordered plate with "PAUSED" and "press P", 192x128 canvas coords),
  in both top-down and first-person modes.
- Game logic stays 100% Jesun.Code; driver maps P in the keydown handler and
  adds the touch button plus help/title copy.
- Verified: CPython 1200-tick pump across difficulties zero exceptions,
  pause freeze/drop-key/resume unit checks, determinism byte-identical,
  Node+Pyodide exact bridge flow FPP avg 40.1ms/tick (budget 120ms).
  Two harness-caught bugs fixed pre-ship (overlay missed on the toggle tick,
  overlay stamped on the resume tick).

### FPP minimap (indie dev loop, run 2)
- First-person mode now draws a 1px-per-tile dungeon overview in the top-right
  corner of the 192x128 canvas via the display list: rooms as dark rects,
  corridor cells as dark dots, stairs in gold, up-ladder in cyan, boss in
  red, player as a white arrow that tracks facing.
- Corridor cells are precomputed once per floor at gen time (one 60x42 pass),
  so the per-tick draw stays O(rooms + corridor cells), about 180 small
  rects.
- Game logic stays 100% Jesun.Code; no driver change.
- Verified: 1600-tick CPython pump across modes/maps/difficulties zero
  exceptions, determinism byte-identical, minimap markers track player and
  facing, Node+Pyodide exact bridge flow FPP avg 43.9ms/tick (budget 120ms).

## 2026-10-07

### Procedural sound effects (indie dev loop, run 1)
- New `OUT["snd"]` channel. Jesun.Code emits `["tone", f0, f1, dur_ms, wave,
  vol]` and `["noise", dur_ms, vol]` commands; 17 named sounds (swing, hit,
  crit, kill, hurt, death, potion, gold, stairs, surface, shrine, buy, bless,
  bossdie, heal, error, UI click) wired into every game event.
- `realms.html` plays them via Web Audio (oscillator + filtered noise, ADSR
  envelopes), AudioContext unlocked on the START tap for mobile autoplay
  policy. SOUND ON/OFF toggle in the HUD, persisted to localStorage.
- Game logic stays 100% Jesun.Code; the driver only renders commands.

### REALMS sprite art + textured 3D + 12 UX juice systems (2672ff1)
- Kenney CC0 sprite art wired through `assets/atlas.json` (tiles, characters,
  hand-drawn rat/bat/warden/well/stairs/ladder/shrines in `custom.png`).
- Textured first-person walls via atlas slices; distance-banded shading.
- 12 UX juice systems: hit-stop, screen shake, death delay, particles,
  floaters (damage numbers), walk cycles, attack lunges, torch flicker, water
  animation, shrine glow, boss HP bar, flash-on-hit.

### DEEPDELVE REALMS initial build (454c711)
- Pure Jesun.Code roguelike: procedural dungeon, 5 enemy types, Deep Warden
  boss every 3rd floor, locked stairs, NPC wanderer/merchant, gold/potions/
  shrines, permadeath, score.
- First-person raycaster (48 rays, 66 deg FOV, DDA, billboarded sprites).
- Emberhold overworld: village, river + bridge, well, houses, cave entrance,
  elder/villager NPCs, blessing quest.
- 3 difficulties (story / delver / nightmare). Space attack key fix.

## 20261008g - REALMS: fix 3D mode never activating (seed_game wiped the WebGL flag)
- Root cause: boot set G["gl3d"]=true when WebGL was available, but seed_game
  (run on every new game) reset G["gl3d"] to false. First-person mode therefore
  always used the 2D fallback and the WebGL canvas stayed hidden.
- Fix: seed_game now preserves G["gl3d"] across the reset (display capability,
  not game state).
- Diagnosis aids kept: "3D status: GL_OK=... (...)" line in the FPP log on first
  entry, plus "3D display fault" surfacing if the renderer ever throws.

## 20261008h+ - REALMS: overworld back to 2D top-down (founder: "Ewww")
- The oblique overworld 3D shipped too early and looked cheap (flat garish
  colors, crude geometry). Pulled back to the 2D top-down overworld, which
  carries the dark gritty art direction properly.
- Dungeon first-person stays real 3D (WebGL). Overworld 3D returns only with
  a real art pass, not programmer art.
