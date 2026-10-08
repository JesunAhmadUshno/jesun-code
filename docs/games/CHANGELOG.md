# DEEPDELVE REALMS: Changelog

Newest first. Each entry is one shipped loop iteration (or a pre-loop build).

## 2026-10-08

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
