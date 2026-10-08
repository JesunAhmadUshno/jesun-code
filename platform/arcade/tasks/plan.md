# Implementation Plan: arcade (STACKFALL)

## Overview

Build the STACKFALL roguelike dungeon crawler as platform module `arcade`
(package `platform_arcade`, data package `platform_arcade_data`), per
`GAME-DESIGN.md` and `SPEC.md`. Server in Jesun.Code on Serve; real-time
engine as one embedded canvas script; sqlite for runs/saves/leaderboard.
Ship behind the normal platform test gates; no deployment (founder-gated).

## Architecture Decisions

- Server-authoritative scoring, client-simulated gameplay. The Jesun.Code
  walker is seconds-per-request, so per-frame server round-trips are
  unplayable; the engine simulates locally from the server-issued seed,
  and the server validates and scores run-end submissions.
- Game content (layers, missions, NPCs, enemies, loot, dialogue) is
  authored as Jesun.Code tables in `content.jc`, served verbatim as JSON
  by `GET /arcade/data`. One source of truth, differential-safe.
- Engine JS is one file, no dependencies, embedded via the playground
  island precedent (`{{`/`}}` brace rule, `node --check` gate).
- Throttling for `POST /arcade/run/end` lives inside the arcade module
  (10/min/IP sliding window, the ratelimit pattern) so no
  platform-campaign files are touched except the app.jc wiring lines.

## Task List

### Phase 1: Server module

- [ ] Task 1: content.jc - transcribe GAME-DESIGN.md into Jesun.Code
      tables with JSON serializers (data package).
- [ ] Task 2: server.jc - arcade_init (3 tables, additive v1), landing,
      play, leaderboard pages, GET /arcade/data.
- [ ] Task 3: server.jc - run APIs (start/save/end/mine) + end throttle
      + score math + mission-done audit.
- [ ] Task 4: tests/test_platform_arcade.py - live HTTP suite
      (bootstrap + walker + differential), XSS/SQLi corpus.

### Checkpoint: Server
- [ ] Arcade suite green on bootstrap; walker live tests green;
       differential byte-identical on /arcade/data and landing.

### Phase 2: Engine

- [ ] Task 5: engine.js - RNG, dungeon gen, rendering, input, game loop.
- [ ] Task 6: engine.js - entities, combat, NPC AI, missions, shop,
      dialogue, HUD, pause, game over/victory.
- [ ] Task 7: engine.js - server wiring (data fetch, run start/save/end,
      autosave, leaderboard submit), attract mode for anonymous viewers.
- [ ] Task 8: engine.test.js - node unit tests (determinism, gen
      validity, combat math, AI transitions); `node --check` gate.

### Checkpoint: Engine
- [ ] node tests green; engine boots against a live test server and
      completes a scripted floor (smoke via node harness or manual).

### Phase 3: Ship

- [ ] Task 9: wire `platform/app.jc` (bring-ins, init, routes).
- [ ] Task 10: independent review (quality + security); fix
      Critical/Required.
- [ ] Task 11: full regression (arcade + core + identity suites),
      BUILD-LOG.md + OPERATOR.md updates, commit + push.

### Checkpoint: Complete
- [ ] All SPEC.md success criteria met; review findings fixed;
      commit pushed to origin/main; deployment NOT done (founder-gated).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Walker slowness (live tests 30+ min/class) | Schedule slip | Run suites sequentially, quiet machine; bootstrap-first, walker on key paths |
| JS/Jesun.Code gen divergence (seed mismatch) | Unreproducible floors | Gen lives ONLY in JS; server never re-simulates; determinism tested in node |
| Score spoofing | Fake leaderboard | Server-side score math, range clamps, throttle, login required |
| Transcription drift (design doc -> content.jc) | Wrong game data | Tests assert counts/keys/values from the design doc |
| Grind job touching the repo mid-build | Merge noise | New files only under platform/arcade/ + one test file; verify git status before commit |

## Open Questions

- (SPEC.md Q1-Q4) Audio, mobile, boons, daily challenge: all v2.
