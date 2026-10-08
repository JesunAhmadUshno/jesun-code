# Spec: arcade (STACKFALL)

Status: APPROVED for build (coordinator; design approved by founder 2026-10-07).
Game design: `GAME-DESIGN.md` (same folder). Stack law: Jesun.Code on Serve.
Module id: `arcade`. Package name: `platform_arcade`.

## Objective

A fully playable roguelike dungeon crawler inside the platform webpages.
A visitor opens `/arcade`, reads the lore, presses play, descends seven
seeded dungeon layers in a canvas engine, talks to NPC bots, finishes
missions, dies permanently, and lands on a leaderboard. All pages and
APIs are Jesun.Code on Serve; the real-time engine is the one embedded
script on the play page (the playground-island precedent).

## Tech Stack

- Jesun.Code (bootstrap `jesun.py` for dev/tests, walker for differential)
- Serve (`packages/serve/serve.jc`), jweb, sqlite, time packages
- Client engine: one embedded `<script>` on `GET /arcade/play`
  (validated with `node --check`; pure logic unit-tested under node)
- Storage: sqlite, English tables, additive migrations, `_serve_migrations`

## Commands

```
Dev:   python3 jesun.py platform/app.jc        (from repo root)
Test:  python3 -m unittest tests.test_platform_arcade -v
JS:    node --check platform/arcade/engine.js
JS tests: node platform/arcade/engine.test.js
```

## Project Structure

```
platform/arcade/
  GAME-DESIGN.md   -> world, story, missions, characters (this module's design)
  SPEC.md          -> this file
  content.jc       -> game data as Jesun.Code tables (layers, missions, NPCs,
                      enemies, loot, hero, dialogue), package platform_arcade_data
  server.jc        -> arcade_init, arcade_routes, run APIs, leaderboard
                      (package platform_arcade; brings in platform_arcade_data)
  engine.js        -> canvas game engine (embedded into the play page)
  engine.test.js   -> node tests for RNG, dungeon gen, combat math, NPC AI
  tasks/plan.md    -> implementation plan
  tasks/todo.md    -> task list with acceptance criteria
tests/
  test_platform_arcade.py -> live HTTP tests (bootstrap + walker + differential)
```

## Routes

- `GET /arcade` - landing: lore, how to play, controls, NPC roster,
  leaderboard preview (top 5), career stats if logged in. Public.
- `GET /arcade/play` - the game page: canvas + embedded engine script +
  mission log panel + HUD. Public to view; starting a run needs login.
- `GET /arcade/leaderboard` - top 20 all-time (dead or completed runs).
  Public.
- `GET /arcade/data` - JSON: layers, missions, npcs, enemies, loot,
  hero, dialogue. Public. Byte-identical across interpreters.
- `POST /arcade/run/start` - require_login. Creates a run, returns
  `{run_id, seed}`. One live run per user (starting a new run abandons
  the old live one: marked dead, score computed from its last-saved
  depth/kills/gold as depth*1000 + kills*25 + gold). Throttled:
  30/min/IP.
- `POST /arcade/run/save` - require_login. Body: run_id, depth, hp,
  gold, kills, blob (JSON text, max 16 KiB). Only the run owner may
  save; only live runs accept saves.
- `POST /arcade/run/end` - require_login. Body: run_id, depth, kills,
  gold, victory (true/false). Server validates ranges, computes the
  score, marks the run dead/completed. Throttled: 10/min/IP.
- `GET /arcade/run/mine` - require_login. Returns the live run + save
  blob for "continue", or nothing.

Route order: `/arcade/data`, `/arcade/play`, `/arcade/leaderboard`,
`/arcade/run/start`, `/arcade/run/save`, `/arcade/run/end`,
`/arcade/run/mine` before `GET /arcade` (first match wins; none
collide, but explicit order is the platform convention).

## Data Model (English tables, ISO-text timestamps)

- `arcade_runs`: id (integer pk), user_handle (text), seed (integer),
  depth (integer), kills (integer), gold (integer), score (integer),
  state (text: live/dead/completed), victory (integer 0/1),
  started_at (text), updated_at (text). v1.
- `arcade_saves`: run_id (integer pk), depth (integer), hp (integer),
  gold (integer), kills (integer), blob (text, max 16384 chars),
  updated_at (text). v1. One row per live run; deleted when the run ends.
- `arcade_missions_done`: id (integer pk), run_id (integer),
  mission_id (text), done_at (text). v1. Audit of completed missions.

Migrations via `serve_table` + `serve_migrate`; ledger
`_serve_migrations` holds `arcade_runs`, `arcade_saves`,
`arcade_missions_done` at v1. Additive only, forever.

## JSON Contracts

`GET /arcade/data` (served with `application/json`):

```json
{
  "hero": {"hp": 100, "atk": 12, "def": 2, "potions": 3, "potion_heal": 40},
  "layers": [
    {"depth": 1, "name": "The Cache", "floor": "#0b0b0d", "wall": "#2a2a2e",
     "accent": "#ffb347",
     "warden": {"id": "prefetch", "name": "Prefetch", "hp": 220, "atk": 16,
                "def": 2, "patterns": ["charge", "summon"]},
     "enemies": ["nullpointer", "dangling_thread"], "elite_from": false}
  ],
  "missions": [
    {"id": "cold_boot", "layer": 1, "title": "Cold Boot",
     "brief": "Reach the stairs down.",
     "objective": {"kind": "reach_stairs"},
     "reward": {"gold": 50}}
  ],
  "npcs": [
    {"id": "byte", "kind": "friendly", "name": "Byte",
     "role": "Merchant",
     "dialogue": ["Welcome to the last shop before nowhere."],
     "shop": [{"id": "potion", "name": "Patch potion", "cost": 25},
              {"id": "w_iron", "name": "Iron Dagger", "cost": 150, "atk": 16}]}
  ],
  "enemies": [
    {"id": "nullpointer", "name": "Null Pointer", "hp": 20, "atk": 6,
     "def": 0, "speed": "slow", "behavior": "chase", "gold": [5, 15]}
  ],
  "loot": {"weapons": [{"id": "w_stick", "name": "Stick", "atk": 12},
                       {"id": "w_iron", "name": "Iron Dagger", "atk": 16}],
           "armor": [{"id": "a_cloth", "name": "Cloth Wrap", "def": 1}]},
  "dialogue": {"intro": ["..."], "death": ["..."], "victory": ["..."]}
}
```

`POST /arcade/run/start` -> `{"run_id": 7, "seed": 123456789}`
`POST /arcade/run/save` -> `{"ok": true}` (400 on bad run, 403 on
foreign run, 413 on oversize blob)
`POST /arcade/run/end` -> `{"score": 2345, "best": true}`
  (score = depth*1000 + kills*25 + gold + victory?5000:0, computed
  server-side; depth clamped 1..7, kills/gold 0..1000000)
`GET /arcade/run/mine` -> `{"run_id":..,"seed":..,"depth":..,"hp":..,
  "gold":..,"kills":..,"blob":"..."}` or `{"run_id": null}`

## Engine Interface (client)

The play page embeds `engine.js` and boots it with:

```js
Stackfall.boot({
  canvas: document.getElementById("game"),
  dataUrl: "/arcade/data",
  api: { start: "/arcade/run/start", save: "/arcade/run/save",
         end: "/arcade/run/end", mine: "/arcade/run/mine" },
  loggedIn: true
});
```

Engine responsibilities: fetch data, start/continue run, requestAnimationFrame
loop, seeded dungeon gen (mulberry32, rooms + L corridors), entities,
combat, NPC AI (idle/wander/talk/flee/chase/attack), mission tracking,
shop/dialogue panels, HUD, pause, game over/victory, autosave (30s +
floor change), score submit. Anonymous viewers get a "log in to play"
overlay; the engine still renders an attract-mode demo dungeon.

Determinism rule: the same seed yields the same floor layout on every
browser (no Math.random in gen; mulberry32 only).

## Code Style

Jesun.Code reads like English (platform SPEC.md conventions):
`to <verb>_<noun> with ...`, `give back`, plain-English `fail with`,
user text through `escape_html`, user values only via `?` params,
table/field names validated by `serve_valid_name` before DDL.
Content tables in `content.jc` mirror the JSON contract key for key.
No em dash anywhere, including dialogue and docs.

JS style: plain script, no modules/bundler, `"use strict"`, small
named functions, no dependencies. Follows the playground island
precedent for embedding (script text built in Jesun.Code with the
`{{`/`}}` brace rule, validated by `node --check`).

## Testing Strategy

- Framework: unittest (`python3 -m unittest`), mirroring
  `tests/test_platform_*.py`. Real Serve/jweb/sqlite, no mocks.
- Harness: `tests/platform_harness.py` MODULES pattern; the arcade
  test mutates MODULES at import (blog-test precedent), no edits to
  the harness file.
- Live HTTP (bootstrap + walker): landing/play/leaderboard/data 200s;
  data JSON shape + key content assertions; run lifecycle
  (start -> save -> end) over HTTP with a logged-in user; foreign-run
  save 403; bad input 400s; oversize blob 413; end-throttle 429 after
  10; anonymous POSTs redirect to /login; leaderboard shows the ended
  run; XSS corpus against NPC names/dialogue/leaderboard handles.
- Differential: `GET /arcade/data` byte-identical across interpreters;
  one static page (landing) byte-identical.
- JS: `node --check` on the embedded script (gating); node unit tests
  for mulberry32 determinism, dungeon gen (same seed -> same rooms;
  stairs reachable via flood fill; room count in range), combat math
  (damage formula, scaling), NPC AI transitions.
- Coverage bar: every route, every guard branch, every API validation
  branch.

## Boundaries

- Always: escape user HTML; `?` params for values; plain-English
  errors; run the arcade suite before any commit; migrations additive.
- Ask first (coordinator): new bridge primitives; schema changes after
  v1 ships; touching `packages/` or any platform-campaign file outside
  the arcade wiring lines in `platform/app.jc`.
- Never: commit secrets; interpolate user input into SQL; mock
  Serve/jweb/sqlite; present a mockup as a working game; deploy
  anywhere; touch `.github/`; the em dash.

## App Wiring (coordinator does this last)

`platform/app.jc` gains, in order: `bring in "platform_arcade_data"`
then `bring in "platform_arcade"` (after the admin bring-in);
`arcade_init with platform_db` (after `admin_init`); `arcade_routes`
(after `admin_routes`). The content package must be brought in before
the server package (server brings the data sentences at call time via
its own bring-in; the app-level order matches the academy precedent).

## Success Criteria

- [ ] `GET /arcade`, `/arcade/play`, `/arcade/leaderboard`,
      `/arcade/data` return 200 with correct content on both
      interpreters; data JSON byte-identical across interpreters.
- [ ] A logged-in user can start a run, save, die, and appear on the
      leaderboard; anonymous run POSTs redirect to /login.
- [ ] Score math is server-side; tampered submissions are clamped or
      rejected; the end throttle 429s after 10/min.
- [ ] The embedded engine passes `node --check`; node unit tests for
      gen/combat/AI are green.
- [ ] XSS corpus (dialogue, names, handles) renders escaped; SQLi
      corpus is inert.
- [ ] The full arcade suite is green on bootstrap and walker; the
      platform regression suites touched by wiring stay green.

## Open Questions

1. WebAudio bleeps: v2 (needs an asset decision).
2. Mobile touch controls: v2.
3. Starting boons / meta unlocks: v2.
4. Daily seeded challenge: v2.
