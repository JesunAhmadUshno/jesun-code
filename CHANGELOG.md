# Changelog

All notable changes to Jesun.Code are recorded here. Dates are America/Toronto.

## v1.4.0 - 2026-09-30: INTEROP

Spec `docs/spec-v1.4.md`. Founder's law: one language, all solutions.
The Python bridge is bootstrap only and never counts as the solution:
`wordpress` imports only raw transport primitives (`urllib.request`,
`urllib.parse`, `base64`, `builtins`), the same boundary v1.2's `sqlite`
drew (raw driver in, every rule and every error message in Jesun.Code).
`react` and `php` are pure text generation; only their scaffolders import
one raw primitive (`os.makedirs`) to create folders.

- `wordpress` package (`packages/wordpress/wordpress.jc`): `wp_site`
  (base URL normalization, Basic-auth header, public sites carry no
  credentials), `wp_request` (GET/POST, 10s timeout, `attempt`-catchable
  transport), `wp_get_json` / `wp_post_json` (shape-checked JSON),
  `wp_rendered`, `wp_posts` / `wp_post` (shape-checked post records),
  `wp_search`, `wp_comments`, `wp_create_post` (201 + auth failures as
  plain-English errors). Zero tracebacks, zero Python internals, line
  numbers on every failure.
- `react` package (`packages/react/react.jc`): `jsx_escape` (escapes `&`
  first), `jsx_props` (insertion-order attributes), `jsx_element` /
  `jsx_text`, `component` (validated PascalCase names, indented bodies),
  `state_hook` (`useState` with derived setter name), `scaffold_app`
  (writes a runnable Vite skeleton: `package.json`, `index.html`,
  `src/main.jsx`, `src/App.jsx`). JSX braces in string literals are
  written doubled (`{{title}}` renders `{title}`).
- `php` package (`packages/php/php.jc`): `php_escape` (plus `&#039;`),
  `php_route` (case-insensitive method, `Controller@action` validated and
  split, quotes escaped), `controller` (validated names, indented
  methods), `blade_page` (escaped title, raw body), `php_scaffold`
  (`routes.php`, `app/PostController.php`, `views/home.blade.php`).
- Demos: `examples/wp_client_demo.jc` (optional base URL from
  `arguments`), `examples/react_demo.jc`, `examples/php_demo.jc`,
  each verified through the interpreter.
- New tests: `tests/test_interop.py` (34 differential cases across the
  three packages: every API, every pinned error shape, both interpreters
  byte-identical; wordpress cases run against a fixture HTTP server, no
  live network).

## v1.3.0 - 2026-09-26: FRONTEND

Spec `docs/spec-v1.3.md`. The Python bridge is bootstrap only; everything
below is pure Jesun.Code, zero imports, zero bridge.

- `html` package (`packages/html/html.jc`): `escape_html` (escapes `&`
  first), `element` / `void_element` (validated tag names, escaped
  attributes), `text_node`, `heading` (1-6), `paragraph`, `link_to`,
  `image`, `unordered_list` / `ordered_list`, `button`, `input_field`,
  `form`, `data_table` (shapes numbers, true/false, nothing), `style_block`,
  `page` (complete document). Escaping by default; raw HTML only through
  the documented low-level builders.
- `template` package (`packages/template/template.jc`): `{{ name }}`
  placeholders (dotted lookup, missing renders `""`), `{% for x in xs %}`
  loops (missing list loops zero times), `{% if name %}` / `{% else %}` /
  `{% endif %}`, nested loops and conditionals, deterministic HTML
  escaping, `render_template` / `render_file`, syntax errors with template
  character positions. Inline templates double every brace (`{{{{x}}}}`
  renders `{{x}}`); files use single braces.
- `js` package (`packages/js/js.jc`): `js_string` (escapes `"`, `\`,
  newlines, and `<` as `\x3c` so values cannot break out of `<script>`),
  `js_value` (text/number/true-false/nothing/list/table to JS literals,
  depth cap 5, functions refused), `script_tag`, `dom_ready`, `on_event`,
  `js_fetch` (JSON POST against jweb routes).
- Example: `examples/todo_frontend.jc` + `examples/todo_template.html`
  (the v1.3 flagship: template-rendered list, HTML-built form, JS-built
  client wiring, verified on both interpreters).
- New tests: `tests/test_frontend.py` (38 differential cases: every API,
  every error shape, both interpreters byte-identical),
  `tests/fuzz_frontend.py` (differential package fuzzer).

## v1.2.0 - 2026-09-26: JWEB

Spec `docs/spec-v1.2.md`. Everything the milestone promises, in order:

- Tables: native `{key: value}` tables, `a new table`, subscripts, `keys of`,
  `contains`, missing keys give back `nothing`.
- JSON: `json of` serializes (with cycle protection), `parse json`
  deserializes (with plain-English errors, depth cap, no floats-with-trailing-junk).
- `attempt`: `r is attempt expr` gives back `{"ok", "value"}` or
  `{"ok", "error"}`. Only plain-English failures are caught; `give back`,
  `stop`, `skip` pass through untouched. Inner attempts catch first.
  Bangla: `চেষ্টা`.
- New reserved words: `new`, `table`, `json`, `parse`. Bangla:
  `নতুন`, `সারণি`, `জেসন`, `বিশ্লেষণ`.
- `jweb` package (`packages/jweb/jweb.jc`, written in Jesun.Code): routing
  (`GET /users/:id`), query params, JSON bodies, `json_response`,
  sessions (signed cookies, no bytes leave the machine), static files
  (sandboxed, traversal refused), plain-English 404/400/500, `serve with port`.
- `sqlite` package (`packages/sqlite/sqlite.jc`, written in Jesun.Code):
  `open_database` (working-folder sandbox: absolute paths and `..`
  refused), `db_run` / `db_query` with `?` parameters (one statement per
  call, NULL becomes `nothing`, rows come back as tables),
  `close_database`. All failures plain-English via `attempt`.
  Params are always passed; a bare statement passes `nothing` (the
  language has no optional parameters).
- Examples: `examples/hello_web.jc`, `examples/todo.jc` (the v1.2
  flagship: sqlite storage, session visitor counter, JSON API at
  `/api/todos`, HTML at `/`), both verified live on the loopback.
- New tests: `tests/test_v12.py` (tables, JSON, attempt),
  `tests/test_jweb.py` (real loopback servers on both interpreters),
  `tests/test_sqlite.py` (CRUD, NULL, params, sandbox, every error
  shape, differential). The differential fuzzer grew `attempt` shapes.

## v1.1.0 - 2026-09-26: NATIVE

`jesun build`: the Jesun.Code transpiler (`jesun_build.py`) turns the v1.1
core subset into C11 and compiles it with `cc` into a real native binary
(spec `docs/spec-v1.1.md`). No bundled Python interpreter. The core
language, decisions, loops, functions (including closures), lists, text,
interpolation, files, and stdin build natively. Unsupported features
(`ask ai`, agents, fleets, terminal control, the Python bridge, jpm)
fail at build time with plain-English line-numbered errors.

- Sequenced evaluation: every sub-expression emits as statements into
  temporaries, so evaluation order and error precedence match the
  interpreter exactly (call targets and arity check before arguments,
  push targets and write paths check before their values, `and`/`or`
  short-circuit, left-to-right binaries).
- Loop control survives function calls: `stop`/`skip` unwind through
  native frames to the caller's loop, and `give back` inside a loop
  retires the loop's control entry so a later `stop` cannot jump into a
  dead frame.
- Numbers: Python's shortest-round-trip float formatting is matched,
  whole-valued doubles print as full integer digits, and integer
  literals past 2**63 go out as double literals (no C overflow).
- Bangla keyword flavor builds natively; the AST is keyword-agnostic.
- New tests: `tests/test_build.py` (native build suite) and
  `tests/fuzz_build.py` (differential interpreter-vs-native fuzzer).
  Example programs: `examples/native_*.jc`, each verified through a
  real compiled binary.

Release: https://github.com/JesunAhmadUshno/jesun-code/releases/tag/v1.1.0

## v1.0.0 - 2026-09-26: SELF-HOSTING

`jesun.jc`: the Jesun.Code interpreter rewritten in Jesun.Code
itself (lexer, parser, tree-walker), developed against the Python
bootstrap with differential testing (spec `docs/spec-v1.0.md`). The
Python implementation is now the bootstrap only. Victory condition
met: the full suite passes through `jesun.jc`.

- Phase A (v0.1 core): lexer, parser, tree-walker for the full v0.1
  language.
- Phase B: plain `ask`, file read/write/append, the `import` bridge
  (Python attributes, calls, subscripts, kwargs); the Bangla keyword
  flavor (header detection, 68-word keyword table, comments, Bengali
  digits); `ask ai` (spec 8.2, with the `CALL:` tool loop, step
  budgets, streaming) via one audited constant bridge template;
  agents (spec 8.3, tool loop, memory files, the pinned 8.3.1
  tool-failure gap); fleets (spec 8.4, sequential in the walker, the
  pinned 8.4.1 gap); jpm execution (spec 8.5: `use`/`bring in` in
  the walker, package error tagging identical to the bootstrap, the
  pinned 8.5.5 deep-source gap); later-phase statement parsing
  (`use`, `bring in`, tmux terminal shapes).
- Sprint 4: the suite itself migrated onto the shared differential
  harness (`tests/selfhost_harness.py`): all 9 program-behavior test
  files run each program through both interpreters as subprocesses.
  The migration caught and fixed real walker fidelity bugs
  (unknown-word suggestions, per-leg file sandboxing, `show`
  rendering agents, foreign-call argument checking).
- Classification audit (`tests/check_classification.py`, spec 9.7):
  365 tests - 309 differential-green (walker byte-identical to the
  bootstrap), 8 pinned gaps, 2 pinned divergences, 46 pinned
  exclusions (spec 9.2c). No test was weakened to pass.
- Differential fuzzer (`tests/fuzz_selfhost.py`) clean on every run.

Honest framing: the shipped binary still bundles the Python runtime
until v1.1; self-hosting is the interpreter, not yet the packaging.

## v1.0 grind details

`jesun.jc`: the interpreter rewritten in Jesun.Code itself, developed
against the Python bootstrap with differential testing (spec
`docs/spec-v1.0.md`). Not claimed until the full suite passes through
it.

- Phase A (v0.1 core): lexer, parser, tree-walker for the full v0.1
  language. Differential suite green.
- Phase B part 1: plain `ask`, file read/write/append, the `import`
  bridge (Python attributes, calls, subscripts, kwargs). 19
  differential fixtures; differential fuzzing clean.
- Phase B part 2, first slice: the Bangla keyword flavor in the
  walker. Header detection (`use bangla` / `বাংলা`), the 68-word
  keyword table, `মন্তব্য` comments, Bengali digits, and the exact
  bootstrap word-boundary rules. 11 differential fixtures; the
  differential fuzzer now generates Bangla-mode cases.
- Fidelity fixes found by differential fuzzing: `keys of` for Python
  dictionaries (a phase-A hole), exotic symbols (e.g. arrows) now end
  words and fail exactly like the bootstrap, non-decimal digit runs
  (e.g. superscripts) fail with the bootstrap's bare unexpected error.
- Phase B part 2, `ask ai` (spec 8.2): the self-hosted walker now asks
  minds. `ask ai <prompt> giving <name>` with optional `with tools
  [...]`, `within <n> steps`, and trailing `streaming`. The subprocess
  half (argv from `JESUNCODE_AI_COMMAND`, 60s timeout, the streaming
  reader) is one constant, audited bridge template that never contains
  program text; the transcript, the `CALL:` tool loop, and tool
  dispatch (the walker's own foreign-call path, with arity checks)
  are Jesun.Code. Bangla spells it `জিজ্ঞেস এআই ... রেখে ...`.
  10 differential fixtures against fixture minds; the differential
  fuzzer now generates `ask ai` cases (grammar shapes, error codes,
  Bangla flavor).
- Phase B part 2, agents (spec 8.3): agent blocks (persona, tools,
  remember off/run/always, memory file, max steps), `ask <agent>
  <prompt> giving <name> [streaming]`, `forget <name>`. Agents are
  nested-list values with in-place history; memory files go through a
  second constant bridge template (`_AGENT_HELPERS_SRC`). Agents can
  call agents (3-level cap, bootstrap-identical refusal). One pinned
  honest gap (spec 8.3.1): a tool failing mid-loop ends the
  self-hosted run with the failure's message where the bootstrap
  feeds it back to the mind; the suite asserts the exact divergence.
  22 differential fixtures against fixture minds; the differential
  fuzzer now generates agent cases (failing tools excluded).
- Later-phase statement parsing parity (spec 8.3.2): the walker now
  parses `use`, `bring in`, `fleet`, and the tmux terminal
  statements with the bootstrap's exact diagnostics (`read` routes
  on `file` vs `terminal`, `fleet` reuses the bootstrap's own block
  checks). Valid shapes fail at run time with the honest later-phase
  line; `bring in` first mirrors the bootstrap's package-name and
  "not fetched" errors via a `_jc_jpm_find` bridge helper. Caught by
  differential fuzzing: the old guard rejected `read terminal ...`
  with the wrong message.
- Phase B part 2, fleets (spec 8.4): the self-hosted walker now
  runs `fleet <name> with <a> [and <b> ...]` blocks. Prompts are
  evaluated up front in the enclosing scope in ask order; each ask
  runs to completion as a spec-8.3 agent ask in a child scope with
  the fleet memory prefix, sequentially, stopping at the first
  failure. Shared fleet memory goes through a third constant bridge
  template (`_FLEET_HELPERS_SRC`): `memory file is "<p>"` loads
  (question, answer, agent) triples, prepends `The fleet remembers:`
  lines, and saves the newest 200; corrupt files start fresh with a
  note. No streaming in fleets and no nested fleets stay parse-time
  errors. One pinned honest gap (spec 8.4.1): the bootstrap runs
  asks on threads and reports the lowest-index failure after running
  them all; the walker runs sequentially and stops at the first, so
  wall time, later-ask side effects, and same-agent history order
  diverge by design; the suite pins the exact divergence. 16
  differential fixtures against fixture minds (valid, memory,
  corrupt memory, Bangla, agent-history, 10 parse-error shapes, 2
  pinned gaps); the differential fuzzer now generates fleet cases
  (failing asks excluded).
- Phase B part 2, jpm in self-host (spec 8.5): `use
  "github.com/user/pkg"` and `bring in "pkg"` now run in the walker.
  The subprocess and filesystem halves are one constant, audited
  bridge template (`_JPM_HELPERS_SRC`: find, fetch, manifest-pick,
  read); address and name validation, the find/exec flow, and the
  package-body execution are Jesun.Code, and the walker's own
  lexer/parser read package sources (BOM strip, Bangla header
  detection, the package's own line numbers). Package functions are
  re-bound with their origin, so errors say `in the "pkg" package:`
  exactly like the bootstrap, including nested-package accumulation
  and the no-double-tag rule; circular packages fail with the
  bootstrap's exact chain message. One pinned honest gap (spec
  8.5.5): a package source nested deeper than the parsers can recurse
  diverges the way deep main programs already do (the bootstrap
  reports its own TOO_DEEP at the bring-in line with the tag; the
  self-hosted side trips the call-depth guard at a jesun.jc line
  without the tag); the suite asserts the exact divergence. 16
  differential fixtures (working, body-fail, call-fail, nested tags,
  circle, bad manifest, escape, missing file, manifest main, Bangla,
  dirty `use`, no-git `use`, already-installed `use`, not-fetched,
  bad address, bad host, plus the pinned deep gap); the differential
  fuzzer now generates jpm cases (never a network `use` or a deep
  shape).
- Still to come in v1.0: sprint 4, the full test suite passing
  through `jesun.jc` (the victory condition).
- Sprint 4 begins (spec section 9): the shared harness
  `tests/selfhost_harness.py` consolidates every differential run
  helper (`run_both` protocol, `run_inline`, `InlineSandbox`,
  `SelfHostDiffCase`, plus the mind/agent/fleet/jpm category helpers)
  as a pure refactor of `tests/test_selfhost.py`; suite 360/360 green
  before and after.
- Fidelity fix found by the sprint-4 migration: the walker's
  unknown-word suggestion (`suggest_name` in `jesun.jc`) now matches
  the bootstrap exactly: case-insensitive prefix check, innermost-scope
  candidate order, and the `difflib.get_close_matches` fallback (the
  module and agent suggestion sites already had it). Three new
  differential fixtures: `err_suggest_close.jc`,
  `err_suggest_prefix.jc`, `err_suggest_first.jc` (shadowing:
  innermost name wins).
- `tests/test_core.py` migrated (spec 9.2a): 23 differential-green
  (7 example programs, 12 error shapes, 4 semantics including
  zero-leakage checks on both legs) and 2 pinned walker-guard gaps
  (spec 9.1 call-depth, 9.2 million-iteration loop: identical message
  text, jesun.jc line attribution, line numbers normalized).
- `tests/test_v04.py` migrated (spec 9.2a): all 25 file-I/O and
  interpolation tests differential-green through `InlineSandbox`,
  which gives each interpreter leg its own hermetic working folder
  (bootstrap files never leak into the walker leg's view, and
  write-then-read sequences still work within a leg). The migration
  caught a test-isolation flaw in the harness itself (shared cwd let
  the bootstrap leg's files pollute the walker leg); the harness now
  runs one interpreter per leg dir.
- `tests/test_v05.py` migrated (spec 9.2a): all 36 Bangla
  interpreter-behavior tests differential-green (headers, core,
  keywords, file I/O through `InlineSandbox`, error shapes, stdin
  `ask`, the Python-bridge `আনো ... হিসেবে ...` import), zero-leakage
  checks on both legs. Two pinned exclusions: `BanglaRepl` (the REPL
  is the bootstrap's interactive loop; the walker has none, spec 9c)
  and `VSCodeExtension` (asset validation tests, no interpreter
  behavior). The migration caught a helper bug in the draft (the
  Bangla-header helper double-applied the header on header tests).
- `tests/test_v03.py` migrated (spec 9.2a): all 15 deeper-agent tests
  differential-green as subprocess runs with one hermetic
  `JESUN_CODE_HOME` per interpreter leg (cross-run memory works
  within a leg, never across legs). Memory triples and saved prompt
  files are byte-identical on both legs. One pinned exclusion: the
  streaming write-granularity assertion (`writes > 2`) stays
  bootstrap-harness-only, because it observes in-process write calls
  while the walker leg runs in a subprocess whose pipe writes
  coalesce by design. The migration caught a test bug in the draft
  (memory read after the second run instead of the first).
- `tests/test_phase2.py` migrated (spec 9.2a): all 14 bridge tests
  differential-green (imports, aliases, kwargs, list conversion,
  foreign dicts, missing-module suggestions, native subscripts, error
  shapes) and all 6 `ask ai` mind tests differential-green through
  fixture minds with a fresh `MIND_COUNT_FILE` per interpreter leg
  (call counts asserted on both legs). The foreign-call-error test
  uses the pinned spec 7.3 line normalizer (call-time foreign
  failures report at the walker's bridge line). Two pinned
  exclusions: `MindCommand` (the mock patches `os.name`, changing
  platform identity; the walker runs on the real platform, spec 9c)
  and `MachinesLive` (live tmux sessions; the walker does not run
  terminals, spec 8.3.2). Two pinned divergences: `MachinesNoTmux`
  (no-tmux message vs the walker's later-phase line, both legs with
  tmux scrubbed from `PATH`) and the `open terminal named 42`
  zero-leakage program (terminal-name type error vs the later-phase
  line). The migration caught a real walker fidelity bug: handing a
  function to a foreign call recursed forever (the bootstrap
  deep-copies lists handed to foreign calls; the walker's cyclic
  function value blew the copy up) instead of failing with `I cannot
  hand function to Python.` The walker now has a `to_python` twin
  (`bridge_check_arg` in `jesun.jc`): function and agent values are
  rejected with the bootstrap's exact messages, lists are checked
  recursively, and a depth cap reports `I got in too deep` at the
  call line for cyclic lists, matching the bootstrap.
- `tests/test_agents.py` migrated (spec 9.2a): all 18 agent tests
  differential-green as subprocess runs (agent blocks, `ask <agent>`,
  persona reaching the mind, tools with per-leg mind call counts,
  unlisted-tool blocking, steps exhaustion, remember true/false via
  prompt-file comparison, agent error shapes, stdin `ask`). Each
  interpreter leg gets its own `MIND_COUNT_FILE`, `MIND_PROMPT_FILE`,
  and `JESUN_CODE_HOME`, so agent memory and mind transcripts never
  leak across legs; saved prompt files are byte-identical on both
  legs. No exclusions. The migration caught a real walker fidelity
  bug: `show` rendered an agent as its raw nested list instead of
  `<agent scout>`. The walker's `render` now has the agent branch,
  matching the bootstrap's `show_text`.
- `tests/test_fleet.py` migrated (spec 9.2a): 18 differential-green and
  1 pinned gap. All 19 fleet tests run through both interpreters as
  subprocesses (basics, errors, shared memory round trip with
  byte-identical `crew.json` files, member-history prompt comparison,
  Bangla, the parallel timing case). Each interpreter leg gets its own
  `MIND_COUNT_FILE`, `MIND_PROMPT_FILE`, `JESUN_CODE_HOME`, and working
  folder (fleet memory files are cwd-relative); saved prompt files are
  byte-identical on both legs. The wall-time assertion stays on the
  bootstrap leg only, since the walker runs fleet asks in order by
  design (spec 8.4.1). Pinned gap: `test_fleet_cannot_nest_in_asks`:
  the bootstrap feeds the nesting refusal back to the mind as the
  tool's RESULT and finishes `(0, "noted, no more tools")`; the walker
  ends the run with `(1, "Line 2: a fleet cannot open inside another
  fleet's asks.")`. No walker fidelity bugs found this round.

- `tests/test_jpm.py` migrated (spec 9.2a): 15 differential-green
  (bad addresses each as its own program, non-string address,
  non-github host, dirty checkout refusing before any clone, bad
  names, unknown package, load-and-call, manifest main, manifest
  escape, missing code file, package error tag, package circle,
  no-git via a scrubbed PATH, starter time/files packages through
  both interpreters). Each interpreter leg gets its own
  `JESUN_CODE_HOME` with the identical package tree seeded on disk
  and its own working folder; the exact-output assertion stays on
  the bootstrap leg. Pinned exclusions (spec 9.2c): the three
  mocked-clone tests stay bootstrap-only (`test_clone_failure_is_
  plain`, `test_install_then_reuse`, `test_address_expression`); the
  clone path is covered by `test_selfhost_jpm_bridge.py` plus the
  no-git fixture. No walker fidelity bugs found this round; one
  harness-class flake fixed (clock ticks between legs are
  normalized, the date/time shape still asserted).

- `tests/test_audit.py` migrated (spec 9.2a): 21 differential-green
  (stderr-traceback sanitization, unlisted-tool call, function handed
  to the bridge, BOM, CRLF, empty file, unicode strings, huge
  numbers, split/join/trim/keys/suggest built-ins). 8 pinned
  exclusions (spec 9.2c): the 6 REPL tests (the walker has no REPL),
  the SIGINT-delivery test (bootstrap-harness-only), and the
  `_parse_call_args` unit test (bootstrap internals, not a program).
  The exact-output assertion stays on the bootstrap leg. No walker
  fidelity bugs found this round; the migration did catch a test
  authoring bug: the JSON braces in `test_keys_of_foreign_dict` are
  Jesun.Code brace-escaping (`{{`/`}}` in the source), and dropping a
  level broke both legs identically.

- Sprint 4 exit classification (spec 9.7): new
  `tests/check_classification.py` tags every one of the 365 test
  methods into exactly one bucket and fails if a tag drifts from the
  code: 309 differential-green, 8 pinned gaps (8.3.1/8.4.1/8.5.5/9.1/
  9.2/7.3), 2 pinned divergences (spec 8.3.2 no-tmux and terminal-name
  lines), 46 pinned exclusions (spec 9.2c). It also caught the
  jpm-bridge tests misclassified as differential: the module docstring
  now pins the circular exclusion. The 9.7 classification table is in
  `docs/spec-v1.0.md`; the audit reader can tag any single test in
  under a minute.

## v0.6 - 2026-09-25

Fleets. Named agents run asks in parallel as a team, answers collected
into one list, with shared fleet memory.

- `fleet <name> with <a> [and <b> ...]` blocks (spec `docs/spec-v0.6.md`):
  one `ask <member> <prompt> giving <name>` per line, plus an optional
  `memory file is "<path>"` line. Bangla: `দল` / `সহ` / `জিজ্ঞেস` / `রেখে`.
- Asks run concurrently, one thread each with a child scope; the fleet
  name becomes the answers in ask order and each `giving` name is set in
  the enclosing scope. Prompts are evaluated up front, in ask order,
  before any thread starts.
- A per-agent lock (re-entrant) serializes asks to the same agent so its
  history and tool runs never interleave with themselves; different
  agents truly run side by side.
- Shared fleet memory: past (question, answer, agent) triples are
  prepended to every member's prompt as `The fleet remembers:` lines;
  new triples are appended after the run, capped at 200. Corrupt or
  missing files start fresh with a plain-English note, never a crash.
- Failure rules: the first failing ask fails the fleet with its
  plain-English message and line number (no partial list); streaming
  asks are forbidden in fleets; a fleet cannot open inside another
  fleet's asks; non-member asks and unknown members fail with
  did-you-mean suggestions.
- New example `examples/fleet_demo.jc` (a launch-readiness panel),
  verified through the binary with a fixture mind.
- VS Code grammar regenerated (`fleet`, `দল` picked up); new `fleet`
  snippet. The REPL continues blocks on `fleet` / `দল` lines.
- 220 tests (19 new in `tests/test_fleet.py`, 3 new mind fixtures);
  both fuzz sweeps clean (fleet seeds and hostile cases added).

## v0.5 - 2026-09-25

Home turf. Jesun.Code speaks Bangla, and `.jc` files get first-class
editing in VS Code.

- The Bangla flavor: a file whose first non-blank line is `use bangla`
  (or a lone `বাংলা`) runs entirely in Bangla keywords (67 words, spec
  `docs/spec-v0.5.md` section 23). Same grammar and blocks as English;
  errors stay plain English with line numbers; comments start with
  `মন্তব্য`; identifiers may use Bangla or English letters; Bengali
  digits (`৫`, `৩.১৪`) work. Mixing is not allowed: in Bangla mode the
  English words are ordinary names, and vice versa.
- The lexer now treats Unicode combining marks as word characters, so
  Bangla vowel signs never split a keyword (this also fixed nothing in
  English; it only widened the definition correctly).
- The REPL continues blocks on Bangla openers (`যদি...তাহলে`, `আবার`,
  `জন্য`, `জন্যে`, `নইলে`, `এজেন্ট`) too.
- `editors/vscode/`: TextMate grammar generated from the interpreter
  (`python3 build-grammar.py`; a test fails if the checked-in grammar
  drifts from `jesun.py`), snippets, language configuration, and a
  run-file command (`Ctrl+Alt+R`) that uses the `jesun` binary when it
  is on PATH.
- New example `examples/bangla_demo.jc`: a monthly expense report written
  fully in Bangla (loops, functions, file I/O, interpolation), verified
  through the binary.
- 201 tests (43 new in `tests/test_v05.py`); both fuzz sweeps clean with
  Bangla seeds and words added.

## v0.3.1

Packaging fix over v0.3.0: the same language, plus the Windows AI-command
path fix. First release with macOS and Windows binaries.

- `JESUNCODE_AI_COMMAND` now splits Windows backslash paths correctly
  (double-quote arguments that contain spaces on Windows).
- Test-suite fixture minds are now Python scripts instead of shell scripts,
  so the suite passes on Linux, macOS, and Windows.
- The "did you mean" import suggestion test no longer depends on numpy
  being installed.
- The release workflow checks out the requested tag on manual runs instead
  of the moving default branch.

## v0.4 - 2026-09-25

Files, words, and sharing. `jpm`, the Jesun.Code package manager,
installs packages straight from GitHub and loads them into your program.

- `use "github.com/user/pkg"`: shallow git clone (`--depth 1`, arg list
  only, 120-second timeout) into `~/.jesun-code/packages/<host>/<user>/<pkg>/`
  (`JESUN_CODE_HOME` redirects it). Installing twice is a no-op; a
  checkout with local changes is never overwritten.
- `bring in "pkg"`: loads the package's main file (`jpm.json`'s `main`,
  default `<pkg>.jc`) so its functions are ready to call. Unknown
  packages, missing code files, manifests pointing outside the package
  folder, and packages that bring each other in a circle all fail in
  plain English with a line number.
- Package functions carry their origin: an error inside one says
  `in the "pkg" package: ...`, never a bare package line number.
- Three starter packages ship in `packages/`: `time` (`time_now`,
  `time_today`, `time_stamp`, `time_wait`), `files` (`files_exists`,
  `files_size`, `files_list`, `files_copy`, `files_move`,
  `files_delete`), `http` (`http_get`, `http_status`, 10-second timeout).
- Zero-input functions are now called automatically where a value is
  expected: `show time_today` runs it (the spec already said a call is
  "an expression anywhere a value is expected"; the code now agrees).
- `use` and `bring` are now keywords.
- 158 tests passing (18 new for jpm), `fuzz.py` extended with 10 jpm
  seeds, `fuzz_phase2.py` extended with 21 jpm cases (hostile addresses,
  manifests, and package code; no network), both sweeps clean.

Files and words (shipped earlier in the v0.4 cycle):

- Pollinations provider: `scripts/ai-providers/pollinations-provider`
  implements the `JESUNCODE_AI_COMMAND` protocol against the free
  Pollinations.ai API: no key, no account, no billing. Model from
  `JESUNCODE_AI_MODEL` (default `openai`).
- Gemini provider: `scripts/ai-providers/gemini-provider` implements the
  `JESUNCODE_AI_COMMAND` protocol against the Gemini API (key from
  `GEMINI_API_KEY` or `~/.jesun-code/gemini.key`, free at
  aistudio.google.com/apikey with a Google sign-in; model from
  `JESUNCODE_AI_MODEL`, default `gemini-3-flash-preview`). Both installers fetch
  it alongside the OpenAI provider.

- `write <value> to file "<path>"`: writes text, replacing the file.
  `append <value> to file "<path>"`: adds to the end. Values convert the
  way `show` converts them, so numbers, lists, and `nothing` work.
- `read file "<path>" giving <name>`: reads the whole file as UTF-8 text.
- Paths resolve from the current folder and may not escape it: `..`
  climbs, absolute paths outside the folder, and null bytes all fail in
  plain English with a line number. Missing files, folders-as-files, and
  missing parent folders get friendly errors too.
- String interpolation: `{expression}` inside any string evaluates and
  splices in its `show` form (`"Hello, {name}!"`,
  `"two plus two is {2 + 2}"`). `{{` and `}}` are literal braces; a lone
  `}` stays literal; empty `{}` and unclosed `{` are parse errors with
  line numbers.
- Breaking change from v0.3: literal braces in strings now interpolate,
  so JSON-style strings need doubling (`'{{"a": 1}}'`). Two existing
  tests updated for this.
- `write` and `append` are now keywords.
- `examples/file_demo.jc`: a tiny journal demo using all three features.
  Full spec in `docs/spec-v0.4.md`.
- 137 tests passing (25 new), `fuzz_phase2.py` extended with 100 v0.4
  cases (hostile paths, braces, escapes), 300-case core fuzz clean.

## v0.3.0 - 2026-09-25

Deeper agents: memory that survives the run, agents calling agents, and
streaming answers.

- `remember is always`: the agent's conversation history is saved to
  `~/.jesun-code/memory/<name>.json` after every ask and reloaded when
  the agent is defined again, so it remembers across runs. `JESUN_CODE_HOME`
  redirects the base directory.
- `memory file is "<path>"`: per-agent override for where memory is saved
  (relative paths resolve from the working directory).
- `forget <agent>`: wipes the saved memory (`Memory of scout cleared.`);
  `scout has nothing to forget.` when there is nothing saved. Corrupt
  memory files warn in plain English and start fresh, never crash.
- Agents calling agents: an agent in another agent's `tools are` is
  reachable with `CALL: researcher("find the date")`, using its own
  persona, tools, memory, and step budget. Cap: 3 levels deep, then
  `Line N: agents called agents too deep (3 levels max).` An agent
  listing itself as a tool is a definition error.
- `streaming` on `ask ai` and `ask <agent>`: the answer prints chunk by
  chunk as it arrives, then binds to the variable as usual. Without it,
  behavior is exactly v0.2.
- `examples/deep_agent.jc`: a two-agent research team demo using all
  three features. Full spec in `docs/spec-v0.3.md`.
- `always`, `forget`, `memory`, `file`, `streaming` are now keywords.
- 112 tests passing, plus the fuzz sweep extended with 100 v0.3 cases.

## v0.2.0 - 2026-09-25

The agent framework. Anyone can build their own AI agents in plain English.

- `agent <name>` blocks: `persona is`, `tools are`, `remember is`,
  `steps are`, all optional with sane defaults (no persona, no tools,
  no memory, 10 steps).
- `ask <agent> "<prompt>" giving <name>`: the ReAct loop with the agent's
  persona, restricted tools, and step budget. Memory (`remember is true`)
  carries conversation history across asks within a run.
- Plain-English errors: unknown agents with did-you-mean, asking
  non-agents, bad block settings.
- `examples/agent_scout.jc`: a desk researcher demo with tools and memory.
- Full spec in `docs/spec-v0.2.md`.
- `agent` is now a keyword (it can no longer be a variable name).
- 97 tests passing, plus a fuzz sweep extended with 100 agent cases.

## v0.1.0 - 2026-09-25

First public release.

- Core language: variables, `show`, `ask`, arithmetic, word comparisons
  (`is`, `is not`, `is greater than`, `is less than`, `is at least`,
  `is at most`, `contains`), `if` / `otherwise if` / `otherwise`,
  `repeat N times`, `repeat while`, `for each`, functions with
  `to name with a and b` / `give back`, lists, `stop` / `skip`.
- Built-ins: `length of`, `first of`, `last of`, `uppercase of`,
  `lowercase of`, `split of x by sep`, `join of x with sep`, `trim of`,
  `keys of` (python dictionaries).
- The Python bridge: `import` any installed Python package (stdlib or pip);
  dotted access, foreign calls, subscripts, two-way value conversion,
  plain-English import errors with did-you-mean and pip hints.
- Minds and machines: `ask ai` one-shot prompting and agentic tool loops
  (`with tools`, `within N steps`) via `JESUNCODE_AI_COMMAND`; tmux control
  (`open` / `send` / `read` / `close terminal`).
- Zero-leakage guarantee: every failure is a plain-English `Line N:` message;
  no tracebacks, no Python internals in any user-visible output.
- REPL with banner, `--version` flag, `.jc` file extension.
- Standalone one-file binaries (Linux, macOS, Windows): no Python needed
  by the user, period.
- 79 tests, all passing, plus a fuzz sweep asserting no-leakage on
  hundreds of generated programs.
