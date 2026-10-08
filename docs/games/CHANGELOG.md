# DEEPDELVE REALMS: Changelog

Newest first. Each entry is one shipped loop iteration (or a pre-loop build).

## 2026-10-08

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
