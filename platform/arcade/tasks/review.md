# Code review: STACKFALL arcade module

Reviewer: independent review agent (did not write the code).
Date: 2026-10-07.
Scope: `platform/arcade/server.jc`, `platform/arcade/content.jc`,
`platform/static/arcade/engine.js`, `tests/test_platform_arcade.py`,
the arcade wiring in `platform/app.jc`.
Method: 5-axis review (correctness, readability, architecture, security,
performance) per `code-review-and-quality`; threat model per
`security-and-hardening` (STRIDE over the run APIs). Static analysis
only; suites were not re-run.

## Verdict: REQUEST CHANGES

Two Critical findings block merge:

1. The engine cannot run against the real `/arcade/data` payload. It was
   written against a different mission/data schema than `content.jc`
   (which follows SPEC.md exactly). With server data, `genFloor` throws
   on the missing `wanderer_lines` key, so the game never gets past the
   boot screen; even past that, `m.goal` vs `m.objective` throws in
   `checkMissions`, five warden pattern ids have no engine handler, and
   Byte's side quest can never activate. The 26 green node tests only
   exercise the engine's fallback schema, never the server payload.
2. The landing page renders the NPC dialogue opener without
   `escape_html` (stored-XSS sink; SPEC's "user text through
   `escape_html`" boundary violated). The existing test
   `test_landing_npc_dialogue_escaped` asserts the opposite, so the
   suite and the code contradict each other.

## Threat model (run APIs)

| Boundary | Spoofing | Tampering | DoS | Notes |
|---|---|---|---|---|
| `POST /arcade/run/start` | login required | seed is server-minted | **no throttle**: authenticated user can spam run creation, growing `arcade_runs` unboundedly | Required finding |
| `POST /arcade/run/save` | owner check (403) | blob opaque, 16 KiB cap, values validated as whole numbers | no throttle; each save is DELETE+INSERT+UPDATE | Optional: throttle |
| `POST /arcade/run/end` | login required | score computed server-side; depth/kills/gold clamped; `victory` is client-asserted per the SPEC contract | throttled 10/min/IP, checked before DB work | residual: victory spoof within clamps (Optional hardening) |
| Pages | n/a | NPC opener unescaped (Critical); handles/names/roles/titles/briefs escaped | n/a | `started_at` unescaped but server-generated (Nit) |
| SQL | n/a | all queries use `?` params; table names static | n/a | clean |

## Findings

### Critical

**C1. Engine schema does not match the `/arcade/data` contract; the game
cannot start against the real backend.**
Files: `platform/static/arcade/engine.js` vs `platform/arcade/content.jc`
(which mirrors SPEC.md key for key).
Evidence:
- `genFloor` does `data.wanderer_lines.length` (engine.js, wanderer
  spawn). Server data has no `wanderer_lines` key (content.jc ships the
  wanderer as an NPC with dialogue instead). `undefined.length` throws,
  so `enterFloor` never completes with server data; the canvas sits on
  "STACKFALL booting..." forever.
- `missionCount`/`missionGoal` read `m.goal`; server missions carry
  `m.objective` (SPEC contract). `g.kind` on `undefined` throws every
  frame in `checkMissions` once the intro panel is dismissed.
- Reward keys differ: server sends `{"max_hp": 25}` / `{"max_hp": 15}`;
  `applyReward` reads `r.maxhp`. Redacted and Lost Pages rewards are
  silently dropped.
- Mission kinds differ: server uses `destroy`, `boss`, `reboot` kinds and
  targets `corruption_node`, `registry_key`, `beacon`, `data_shard`,
  `ichor_vial` with a `count` field; the engine handles `kill_count`,
  `warden`, targets `node`/`key`/`shard`/`ichor`, and a `target` field.
- Warden pattern ids differ: server sends `lane_dash`, `rotating_shots`
  (Arbiter), `double_slam` (Panic), `etch_lines` (Lithographer),
  `all_patterns` (Watchdog); `firePattern` handles `dash`, `rotating`,
  `doubleslam`, `etchlines`, and nothing for `all_patterns`. Those
  patterns fizzle silently; the bosses lose their signature attacks.
- Byte's side quest `pest_control` can never activate: `checkMissions`
  skips giver missions unless active, and `acceptQuest` only maps
  ada/medic; talking to Byte opens the shop instead, with no quest path.
Fix: align the engine to the SPEC/`content.jc` schema (the contract is
the authority): consume `objective`/`count`/SPEC target names,
`reward.max_hp`, the SPEC pattern ids, and either ship `wanderer_lines`
in `content.jc` or spawn wanderers from the NPC table. Add a quest-accept
path for Byte (or auto-activate `pest_control`). Then update
`defaultMissions()`/`defaultData()` to the same schema so the fallback
path stays consistent.

**C2. NPC dialogue opener rendered without escaping on the landing page
(stored-XSS sink).**
File: `platform/arcade/server.jc`, `arcade_landing`.
Evidence: the roster line concatenates `(escape_html with opener)` for
nothing; the actual code is
`... "): " + (escape_html with opener) + "</li>"` with `opener` being
`n["dialogue"][0]` raw, while name and role are escaped on the same
line. Lore lines two screens up are escaped; this one is not. Today the
data is static authored content, so this is latent rather than remotely
exploitable, but it violates SPEC's "user text through `escape_html`"
boundary and the task's explicit XSS threat model for NPC dialogue.
Fix: `+ (escape_html with opener) + "</li>"`. Note this also resolves
the failing test below.

### Required (no prefix)

**R1. No throttle on `POST /arcade/run/start`: unbounded run creation.**
File: `platform/arcade/server.jc`, `arcade_run_start`.
Evidence: `arcade_run_end` is throttled 10/min/IP; `arcade_run_start`
has no throttle at all. Each start is SELECT (live run) + UPDATE +
DELETE + INSERT + SELECT, and every start abandons the previous live
run, so a logged-in client in a loop grows `arcade_runs` without bound
and churns abandon writes. Fix: apply the same sliding-window throttle
to start (e.g. 30/min/IP via `arcade_hit` with its own bucket).

**R2. `arcade_int` silently truncates JSON floats instead of rejecting
them.**
File: `platform/arcade/server.jc`, `arcade_int`.
Evidence: for `kind of raw is "number"` it returns `bmod.int(raw)`, so
JSON `1.5` becomes `1`. The code's own error text promises "run_id has
to be a whole number" / "have to be whole numbers". Text `"1.5"` is
rejected (the test covers this) but numeric `1.5` is coerced. It cannot
inflate values past clamps, but silent coercion at a validation
boundary is a correctness bug. Fix: for numbers, reject when
`raw != bmod.int(raw)` (give back nothing).

**R3. `GET /arcade/run/mine` returns `hp` unnormalized: JSON carries
`"hp":88.0`.**
File: `platform/arcade/server.jc`, `arcade_run_mine`.
Evidence: `hp is save["hp"]` with no `arcade_whole` wrap, while
`run_id`/`seed`/`depth`/`gold`/`kills` are normalized on the same line.
The JSON serializer renders integral floats with `.0` (jesun.py
`_jc_json_encode`: "integral floats keep their .0"), and content.jc's
own note requires integers at the JSON boundary ("the SPEC contracts
show 7, not 7.0"). The test asserts `payload["hp"] == 88`, which passes
for `88.0` in Python, so the test does not catch it. Fix: wrap with
`arcade_whole`; extend the test with `assertIsInstance(payload["hp"],
int)`.

**R4. Node engine tests never run against the real `/arcade/data`
payload.**
File: `platform/arcade/engine.test.js` (referenced), `tests/test_platform_arcade.py`.
Evidence: 26/26 green, yet C1 shipped: the node tests exercise
`defaultData()`/`defaultMissions()` (the fallback schema), while the
Python suite asserts the server JSON shape. Nothing feeds the server
payload through `genFloor`, `checkMissions`, `missionDef`, or the
wanderer/pattern paths. Fix: add a node integration test that fetches
(or fixtures) the real `/arcade/data` JSON and runs floor gen for all 7
depths plus mission progress/reward application against it.

**R5. `test_landing_npc_dialogue_escaped` contradicts the code.**
File: `tests/test_platform_arcade.py`.
Evidence: the test asserts `&quot;down is the only way&quot;` is present
and the raw quotes absent. Ada's `dialogue[0]` contains raw double
quotes and the roster renders it unescaped (C2), so both assertions fail
against the current code. The test's claim is correct per SPEC; the
code is wrong. Fix with C2; do not weaken the test.

### Nit

- **N1.** Throttle buckets are never pruned: `arcade_hit` writes back
  empty `recent` lists but keeps the bucket key, so `arcade_state["hits"]`
  grows one entry per IP that ever hits `/arcade/run/end`. Fix: delete
  the bucket when `recent` is empty.
- **N2.** `started_at` is interpolated raw in `arcade_board_rows`. It is
  server-generated (`time_today`), so not exploitable today, but
  escaping it costs nothing (defense in depth).
- **N3.** `arcade_run_save` accepts negative and unbounded
  depth/hp/gold/kills (only whole-number shape is checked). A negative
  hp persists and `mine` hands it back; the engine then insta-dies on
  restore. Clamp save inputs to sane ranges (depth 1..7, hp/gold/kills
  >= 0).
- **N4.** `arcade_record_missions` does not dedupe mission ids; a
  repeated id inserts duplicate audit rows. Dedupe before insert.
- **N5.** The 16 KiB blob cap measures characters (`length of blob`),
  not UTF-8 bytes; a multibyte blob can exceed 16 KiB on the wire. Minor;
  measure bytes if the bridge exposes it.
- **N6.** `arcade_career` renders "Best depth: . Best score: ." for a
  logged-in user with no runs (MAX over empty set is nothing). Cosmetic;
  guard the empty case.
- **N7.** `test_landing_empty_board` is vacuous: the `or "run_ada" in
  text` fallback passes because earlier tests (alphabetical order) seed
  runs, so the "empty" state is never actually asserted. Reset the board
  or drop the fallback.
- **N8.** Death line transcription drift: GAME-DESIGN.md says "The Runner
  was garbage collected at depth N. Another process will try.";
  content.jc drops "at depth N" (static string). Consider interpolating
  depth at render time.
- **N9.** `arcade_429` carries no `Retry-After` header. Trivial to add
  (`Retry-After: 60`).
- **N10.** The end throttle is consumed before param validation, so
  malformed/foreign attempts burn the caller's own 10/min budget. The
  ordering is good for DoS (cheap reject before DB work); just document
  the tradeoff.

### Optional / Consider

- **O1.** Throttle `POST /arcade/run/save` (generous, e.g. 60/min/IP):
  every save is DELETE + INSERT + UPDATE with a 16 KiB blob, and the
  cadence is client-driven.
- **O2.** Anti-spoof hardening for `victory`: the flag is client-asserted
  per the SPEC contract, so a cheat client can always claim the +5000.
  Cheap mitigation: require the run's last server-stored save depth to
  be 7 when `victory` is true (the engine autosaves on floor change, so
  a legitimate victory always has a depth-7 save).
- **O3.** Abandon scoring: `arcade_run_start` marks the old live run
  dead but leaves `score` at 0, so abandoned mid-run descents appear on
  the leaderboard as 0-score deaths. Either compute the abandon score
  from the last-saved depth/kills/gold (the save handler already keeps
  the run row current) or clarify in SPEC.md that "score kept" means the
  as-is 0.
- **O4.** `arcade_peer` falls back to `"unknown"` and has no
  X-Forwarded-For handling; behind a proxy, all users share one throttle
  bucket. Fine for a single direct Serve process; revisit if proxied.

### FYI (no action)

- **F1.** Wiring in `platform/app.jc` matches SPEC: `platform_arcade_data`
  brought in before `platform_arcade` (lines 27-28), `arcade_init` after
  `admin_init` (line 45), `arcade_routes` after `admin_routes` (line 66);
  route order inside `arcade_routes` matches the SPEC list. The test-only
  `POST /arcade/test/reset-throttle` route exists only in the test app
  copy; verified absent from the shipped `app.jc`.
- **F2.** SQL hygiene is clean: every query uses `?` params, table/column
  names are static, no user input reaches DDL. `test_sqli_corpus_inert`
  proves the corpus is rejected-as-bad-input (run_id) or stored inert
  (blob) and tables survive; the parameterization itself is proven by
  inspection.
- **F3.** `time_stamp` is `timemod.time()` (epoch seconds, float), so the
  60 s sliding window in `arcade_hit` is correct.
- **F4.** The end throttle is in-memory per process. Correct for one
  Serve process; it would need a shared store if the app ever scales
  past one process (the security skill's standard caveat).
- **F5.** `test_end_throttle_429s_after_ten` skips when 10 ends take over
  50 s, so the throttle is proven only on fast runs (bootstrap). Honest
  skip, but the coverage is conditional.
- **F6.** The engine has no DOM XSS sinks: all rendering is canvas
  `fillText`/shapes; no `innerHTML`, `document.write`, or `eval`
  anywhere in `engine.js`. Server-data trust issues manifest as crashes
  (C1), not script injection.
- **F7.** Determinism claim holds for generation: `genFloor` uses only
  the mulberry32 stream (the sole `Math.random` in the file is the
  offline-fallback seed in `newRun`, not a generation path). Combat
  drops and wander directions use the session rng, which is outside the
  SPEC's floor-layout determinism rule.
- **F8.** Deviation D1 (external `/static/arcade/engine.js` instead of an
  embedded script) is documented in `server.jc` and pinned by
  `test_play_page_zero_inline_js`. No inline JS on the play page.
- **F9.** `content.jc` transcription fidelity vs GAME-DESIGN.md is high:
  hero stats, 7 layers/wardens (Watchdog 1200 HP), elite-from-4, 10
  missions with correct ids/rewards (tier mapping w_iron/w_kernel/a_warded
  matches), 4 NPCs with correct shop prices (potion 25g, full repair
  40g), all 7 enemy stat lines exact, 5 weapons / 3 armor exact, intro /
  death / victory beats, 8-14 rooms, L corridors + 2 loops, stairs in
  farthest room, +15%/depth scaling, 2.5x elites, damage formula,
  i-frames/contact timings, autosave cadence, leaderboard top-20, and the
  controls table all check out.
- **F10.** Two concurrent `POST /arcade/run/start` calls can briefly
  create two live runs (SELECT-then-INSERT is not atomic); the second
  start abandons only the one it saw. Low likelihood, no data loss; noted
  for completeness.

## Verification notes

- Did not re-run suites per instructions. Static findings above are
  grounded in file reads; interpreter behavior claims cite `jesun.py`
  (`show_text` normalizes integral floats for `text of`, hence no
  "6300.0" rendering bug on leaderboard HTML; `_jc_json_encode` keeps
  `.0` for integral floats in JSON, hence R3).
- `node --check` status and the 26/26 node results were taken as given;
  R4 explains why green node tests did not catch C1.

## Counts

- Critical: 2 (C1 engine/data schema mismatch; C2 unescaped NPC dialogue)
- Required: 5 (R1 start throttle; R2 float truncation; R3 mine hp
  normalization; R4 engine-vs-payload integration test; R5 failing
  test/code contradiction)
- Nit: 10 (N1-N10)
- Optional: 4 (O1-O4)
- FYI: 10 (F1-F10)
