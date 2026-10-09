# DEEPDELVE REALMS: Game Roadmap

Created 2026-10-07 by the solo indie dev loop (first run). Played the live build
end to end via a CPython pump harness: overworld, cave entry, dungeon gen,
FPP toggle, combat, merchant, shrines, boss floor. Ordered by player value per
unit of risk. One item ships per run, top first. Done items move to CHANGELOG.md.

## Open

### 1. REALMS 3D upgrade (founder directive 2026-10-08)
Founder order: "I want 3D. Not 2D any more." Then: "I don't want pixel style
any more, I need real 3D. Everything in 3D." No more sprites, no pixel art:
everything becomes REAL 3D geometry rendered with WebGL. Characters are
low-poly 3D models in the dark style, the dungeon is real 3D space. All game
logic and scene math stay 100% Jesun.Code; the browser's WebGL renderer is
the host (honest boundary, same as before).
Phases, one per run:
- (a) DONE 2026-10-08: billboarded sprites in FPP (stepping stone, replaced
  by (d)).
- (b) Floor and ceiling casting with textures. (Superseded by (d).)
- (c) Distance fog, dynamic per-column lighting, weapon overlay. (Superseded
  by (d).)
- (d) SHIPPED 2026-10-08 (browser screenshot verification pending): WebGL 3D
  renderer. Jesun.Code emits the 3D scene (cam3d camera, quad3d textured
  dungeon quads from a 13x13 grid window, model3d entities with 8-direction
  facing and walk pose, text3d, sword3d); the driver draws it with WebGL:
  real perspective, depth testing, torch light at the camera, distance fog.
  13 low-poly cuboid models (dark style, all under 20 boxes, emissive eyes).
  2D raycaster kept as fallback when WebGL is missing. Scene build
  18.5ms/tick under Node+Pyodide (budget 120ms). Playtest bug fixes in this
  ship: water rescue, NPCs cannot block cave/ladder/stairs, M reliably
  enters FPP (ladder placement + no false surfacing).
- (e) PULLED BACK 2026-10-08 (founder: "Ewww"): the oblique overworld 3D
  shipped too early and looked cheap (flat garish colors, crude geometry).
  Overworld is back to the 2D top-down, which carries the dark art direction.
  The `render_over3d` code stays in the file, bypassed, for a future real art
  pass. Dungeon first-person stays real 3D.
Budget guard stays: scene build per tick under ~120ms under Node+Pyodide;
WebGL draw itself is GPU-cheap.

### 2. UX/UI overhaul program (founder directive 2026-10-08) [IN PROGRESS]
Founder: "Get ux ui even better." A full pass over every screen with fresh
eyes, judged like the videos: sharper than the last build or it does not ship.
- [x] Title screen (shipped 2026-10-08, APP_VERSION 20261008p): clearer START
  prompt (pulsing full-width CTA + tap/Enter hint), difficulty select
  readability (44px+ tap targets, glowing selected state, brighter
  description), credit line legible on phone, overlay scrolls on small screens.
- HUD: HP/gold/potions/depth readable at phone size, quest tracker clarity,
  boss HP bar polish, low-HP vignette tuning, message log shows last 3.
- Touch controls: bigger hit areas, dpad plus action buttons layout, pressed
  states, pause button easy to reach.
- Dialogs: merchant/wanderer/elder text readable, toast timing tuned, no
  overlapping panels.
- Onboarding: first-run hints (where the cave is, M for 3D sight, Q drinks a
  potion), contextual tips on depth 1.
- Consistency: one visual language across top-down and FPP, one message
  style, zero slop.
Verify with phone-viewport browser playtest screenshots before shipping.

### 3. Red Dead style overworld expansion (founder directive 2026-10-08)
Founder: "completely like Red Dead Redemption style." Turn Emberhold into a
living frontier. Phases, one per run:
- Day/night cycle: sun and moon, sky tint by hour, night darkness with a light
  radius around the player, stars.
- Campfire: rest point that heals over time, warm light glow, procedural
  crackle sound through the existing snd channel.
- Nature: more tree variety, gardens, wood logs, riverbank details, a sea at
  the map edge.
- Castle: explorable keep on the overworld with its own encounters and loot.
- Animals: horses and cows as ambient NPCs (graze, wander, flee); horse
  riding as a later phase.
- Player customization: character select screen with face/appearance variants
  from the atlas, name entry.
- Player tools: lantern (bigger light radius at night), bedroll/bunk rest.
Art: hand-drawn CC0 matching sprites where the Kenney packs lack coverage.

### 4. Real-time multiplayer (founder directive 2026-10-08)
Founder: "It has to be multiplayer. Player can chat each other. In real time.
Exchange tools potions guns awards with each other."
Honest boundary: the game is a static site with no server, so multiplayer
cannot run on GitHub Pages alone. The path is WebRTC peer-to-peer: one player
hosts the authoritative game (still 100% Jesun.Code), others join with a
shareable code, inputs go up and game state comes down over a data channel.
No game server to run, nothing to host.
Phases, one per run:
- (a) Connection layer: host/join with code, player names, peer link.
- (b) Shared overworld: see each other move around Emberhold in real time.
- (c) Chat: real-time text chat, clean UI, mute/block.
- (d) Trading: exchange potions, tools, gold, awards with accept/confirm.
- (e) Co-op dungeon: shared depths, shared enemies, revive.
- Guns: new ranged player weapon for the frontier (tradable, ties into (d)).

### 5. MCP server for AI agents (founder confirmed 2026-10-08)
Founder said yes to MCP tools. Reading: an MCP server so AI agents can play
and control DEEPDELVE REALMS (start_run, press_key, read_state, read_screen),
running against the CPython harness. Player tools (lantern, bedroll) are
already covered under item 3. Correct this item if he meant something else.

### 6. Enemy separation steering
Chasers conga-line behind each other in corridors. Add a cheap sidestep: when
the target tile is occupied by another enemy, try the perpendicular tile before
giving up. Keeps per-tick cost O(enemies).

### 7. Ranged enemy: Gloom Spitter (depth 2+)
First ranged threat. Slow projectiles as a small entity list (1 tile per 2
ticks, die on wall or player hit). Needs one new sprite in `assets/custom.png`
plus an `atlas.json` entry, drawn in the existing 16x16 style.

### 8. Villager quest log
One elder quest is the whole quest system. Add three turn-in quests from
villagers/wanderers (rat pelts x6, gold tithe 50g, deep shard from depth 3+),
tracked in the quest HUD line, rewarding atk / max HP / potions.

### 9. Second boss: Gloom Matriarch (depth 6)
The Deep Warden is the only boss. A second boss on depth 6 that periodically
spawns bats, reusing the stairs lock/seal logic and boss HP bar.

### 10. Overworld day/night tint
Slow palette cycle on overworld top-down tiles driven by tick. Cheap
atmosphere, zero gameplay cost, no driver change.

### 11. FPP torch flicker lighting
Per-column brightness noise tied to tick in the FPP renderer. Sells the dungeon
mood; bounded by the existing 48-ray budget.

### 12. Boot progress readout
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
