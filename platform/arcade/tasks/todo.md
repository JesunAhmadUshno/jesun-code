# Todo: arcade (STACKFALL)

Convention: each task states acceptance + verify + files. TDD: red-green.
No em dash anywhere. No mocked Serve/jweb/sqlite. No `.github/`.

## Task 1: content.jc (data package platform_arcade_data)

**Description:** Transcribe GAME-DESIGN.md into Jesun.Code tables with
serializer sentences that produce the exact GET /arcade/data JSON shape
from SPEC.md.

**Acceptance criteria:**
- [ ] 7 layers with names, themes, wardens, enemy sets matching the design doc
- [ ] 7 main missions + 3 side quests with objectives and rewards
- [ ] 4 friendly/neutral NPCs with dialogue + shops, 7 enemies with stats,
      5 weapons, 3 armor, hero stats, intro/death/victory dialogue
- [ ] Serializer output parses as JSON and matches the SPEC.md contract keys

**Verification:**
- [ ] `python3 jesun.py` probe script prints the JSON; `python3 -c json.load` OK
- [ ] Key spot-checks (layer count 7, mission count 10, npc count, enemy stats)

**Files:** `platform/arcade/content.jc`

**Estimated scope:** M (1 file, large data)

## Task 2: server.jc pages + data route

**Description:** `arcade_init` (arcade_runs, arcade_saves,
arcade_missions_done via serve_table + serve_migrate), `arcade_routes`:
GET /arcade, GET /arcade/play (canvas + boot stub), GET /arcade/leaderboard,
GET /arcade/data (application/json from content.jc).

**Acceptance criteria:**
- [ ] All four GETs return 200 with layout chrome on a live server
- [ ] /arcade/data JSON matches the content.jc serializer output exactly
- [ ] Leaderboard page renders top runs; empty state when none
- [ ] Play page carries the canvas element and engine boot call

**Verification:**
- [ ] `python3 -m unittest tests.test_platform_arcade.ArcadePagesBootstrap -v`

**Files:** `platform/arcade/server.jc`

**Estimated scope:** M (1 file)

## Task 3: run APIs + throttle

**Description:** POST /arcade/run/start, /save, /end, GET /arcade/run/mine.
Login required (require_login). Score computed server-side. 10/min/IP
throttle on /end. Mission completions recorded in arcade_missions_done.

**Acceptance criteria:**
- [ ] Start returns run_id + seed; second start abandons the first (dead, kept)
- [ ] Save round-trips the blob; foreign run 403; oversize blob 413; bad run 400
- [ ] End computes score = depth*1000 + kills*25 + gold (+5000 victory);
      clamps tampered values; deletes the save; 11th end in 60s -> 429
- [ ] Anonymous POSTs redirect to /login

**Verification:**
- [ ] `python3 -m unittest tests.test_platform_arcade.ArcadeRunApiBootstrap -v`

**Files:** `platform/arcade/server.jc`

**Dependencies:** Task 2

**Estimated scope:** M (1 file)

## Task 4: arcade test suite

**Description:** tests/test_platform_arcade.py: live HTTP on bootstrap +
walker, differential on /arcade/data and landing, XSS/SQLi corpus.

**Acceptance criteria:**
- [ ] Every route and guard branch covered; every API validation branch covered
- [ ] XSS corpus (NPC names, dialogue, handles) renders escaped
- [ ] SQLi corpus inert (parameterized by construction)
- [ ] Differential: /arcade/data + landing byte-identical across interpreters

**Verification:**
- [ ] `python3 -m unittest tests.test_platform_arcade -v` green (bootstrap);
      walker classes green run sequentially on a quiet machine

**Files:** `tests/test_platform_arcade.py`

**Dependencies:** Tasks 2, 3

**Estimated scope:** M (1 file)

## Checkpoint: Server

- [ ] Tasks 1-4 done; suite green bootstrap + walker; differential clean

## Task 5: engine core (gen, render, input, loop)

**Description:** engine.js: mulberry32 RNG, room+corridor dungeon gen,
canvas renderer (tiles, entities, HUD), keyboard input, rAF loop, pause.

**Acceptance criteria:**
- [ ] Same seed -> same floor on repeated runs (node test)
- [ ] Stairs reachable from spawn (flood fill, node test)
- [ ] 60fps-ish loop with pause; canvas renders without errors

**Verification:**
- [ ] `node --check platform/arcade/engine.js`
- [ ] `node platform/arcade/engine.test.js` (gen tests green)

**Files:** `platform/arcade/engine.js`, `platform/arcade/engine.test.js`

**Estimated scope:** L (2 files)

## Task 6: engine gameplay (entities, combat, NPC AI, missions)

**Description:** Hero/enemy/NPC entities, melee + projectiles, damage
formula + layer scaling, NPC AI state machines, mission tracker, shop +
dialogue panels, warden patterns (2 each, telegraphed), game over/victory.

**Acceptance criteria:**
- [ ] Combat math matches design doc (node tests)
- [ ] NPC AI transitions: idle/wander/talk/flee/chase/attack (node tests)
- [ ] All 10 missions completable in a scripted node walkthrough
- [ ] Boss patterns telegraph before damage

**Verification:**
- [ ] `node platform/arcade/engine.test.js` all green

**Files:** `platform/arcade/engine.js`, `platform/arcade/engine.test.js`

**Dependencies:** Task 5

**Estimated scope:** L (2 files)

## Task 7: engine server wiring

**Description:** Fetch /arcade/data, run start/save/end via the API table,
30s autosave + floor-change save, score submit on death/victory,
attract-mode demo dungeon for anonymous viewers, login overlay.

**Acceptance criteria:**
- [ ] Full loop against a live test server: start -> play scripted moves
      -> save -> end -> leaderboard shows the score
- [ ] Anonymous viewer sees attract mode, no API calls fired
- [ ] Engine embedded in the play page passes node --check after embedding

**Verification:**
- [ ] Live smoke test (scripted); `node --check` on the embedded script

**Files:** `platform/arcade/engine.js`, `platform/arcade/server.jc`
(play page embed)

**Dependencies:** Tasks 3, 6

**Estimated scope:** M (2 files)

## Task 8: engine test hardening

**Description:** Extend engine.test.js: determinism across 100 seeds,
elite scaling, Memory Leak growth cap, warden pattern timers, save blob
round-trip shape.

**Acceptance criteria:**
- [ ] 100-seed determinism + reachability sweep green
- [ ] All scaling formulas match the design doc numbers

**Verification:**
- [ ] `node platform/arcade/engine.test.js` green

**Files:** `platform/arcade/engine.test.js`

**Dependencies:** Task 6

**Estimated scope:** S (1 file)

## Checkpoint: Engine

- [ ] Tasks 5-8 done; node suite green; live smoke green

## Task 9: app wiring

**Description:** platform/app.jc: bring in platform_arcade_data +
platform_arcade (after admin), arcade_init with platform_db (after
admin_init), arcade_routes (after admin_routes).

**Acceptance criteria:**
- [ ] Full app boots with arcade routes live; all prior suites unaffected

**Verification:**
- [ ] Boot probe: GET /arcade 200 on the full app; core suite still green

**Files:** `platform/app.jc`

**Dependencies:** Checkpoint: Server

**Estimated scope:** XS (1 file, 3 lines)

## Task 10: independent review

**Description:** Fresh reviewer (quality + security skills): 5-axis review
of server.jc, content.jc, engine.js, tests. Fix Critical/Required.

**Acceptance criteria:**
- [ ] Review report with categorized findings delivered
- [ ] All Critical + Required fixed, re-verified

**Verification:**
- [ ] Arcade suite + affected platform suites green after fixes

**Files:** review report in `platform/arcade/tasks/review.md`

**Dependencies:** Checkpoints Server + Engine, Task 9

**Estimated scope:** M

## Task 11: ship

**Description:** Full regression, BUILD-LOG.md + OPERATOR.md updates,
commit platform/arcade/ + tests/test_platform_arcade.py, push origin/main.
No deployment.

**Acceptance criteria:**
- [ ] Regression green (arcade + core + identity + ratelimit)
- [ ] BUILD-LOG.md has the arcade entry; OPERATOR.md documents routes
- [ ] Commit pushed; git status shows no arcade leftovers

**Verification:**
- [ ] `git log --oneline -1` + `git status --short` (arcade files tracked)

**Files:** `platform/arcade/BUILD-LOG` entry, `platform/OPERATOR.md`,
`tests/test_platform_arcade.py`

**Dependencies:** Task 10

**Estimated scope:** S
