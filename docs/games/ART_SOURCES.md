# DEEPDELVE REALMS art sources

All sprite art is used under permissive licenses. No GPL/copyleft art is used
anywhere in this game.

## 1. Kenney "Roguelike/RPG Pack" (1,700+ tiles) - CC0 1.0
- Source: https://kenney.nl/assets/roguelike-rpg-pack
- Mirror downloaded from: https://opengameart.org/content/roguelikerpg-pack-1700-tiles
- License: Creative Commons Zero (CC0) - public domain. No attribution required.
- File in this repo: `assets/tiles.png` (original `Spritesheet/roguelikeSheet_transparent.png`, unmodified)
- Used for: dungeon wall/floor, grass, flowers, trees, water, path, house roof/wall,
  cave door, gold pile, potion, bridge planks, torch, FPP wall texture.

## 2. Kenney "Roguelike Characters" (450 sprites) - CC0 1.0
- Source: https://kenney.nl/assets/roguelike-characters
- Mirror downloaded from: https://opengameart.org/content/roguelike-character-pack
- License: Creative Commons Zero (CC0) - public domain. No attribution required.
- File in this repo: `assets/chars.png` (original `Spritesheet/roguelikeChar_transparent.png`, unmodified)
- Used for: knight (player), goblin, ogre, merchant, elder, villagers, wanderer.

## 3. Hand-drawn companion sprites - CC0 1.0 (drawn for this game)
- File in this repo: `assets/custom.png` (original work, released CC0)
- Contents: `rat`, `bat` (no suitable CC0 rat/bat found in the Kenney packs, so these
  were drawn in matching 16x16 style); `warden` (dark-crimson recolor of the Kenney
  knight armor for the boss); `well`, `stairs_down`, `stairs_sealed`, `ladder`,
  `shrine_might`, `shrine_vitality` (no matching tiles in the packs, drawn to match).

## 4. Hand-drawn dark character set - CC0 1.0 (drawn for this game, 2026-10-08)
- File in this repo: `assets/dark.png` (original work, released CC0)
- Generator script: `goals/arcade-roguelike-playable-online-in-pure-jesun-code/hidden_files/dark_art/make_dark.py`
- Contents: full 32x32 replacements for every character/enemy sprite in a dark,
  gritty, mature style: `knight` (horned helm, glowing visor, crimson tabard),
  `goblin`, `ogre`, `rat`, `bat`, `warden` (boss), `merchant`, `elder`,
  `villager0`, `villager1`, `wanderer`. Near-black outlines, cold rim light,
  glowing eyes. Replaces the cartoonish Kenney lookups for these 11 names in
  `assets/atlas.json`; the Kenney files are untouched.
- Phase 2 (2026-10-08): polish pass on all 11 (deeper gradient, edge vignette,
  ordered dither grain, armor plate seams, fur tufts, cloth folds, stronger
  rim light) plus second walk/attack frames `knight2`, `goblin2`, `ogre2`,
  `rat2`, `bat2`, `warden2` appended as new cells (base cells never moved).

## Title-screen credit line
"Sprite art: Kenney (kenney.nl), public domain (CC0)."
