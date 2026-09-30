# Jesun.Code Roadmap

The public milestone ladder. Shipped items stay listed with their release;
the top uncompleted item is the only active work. Dates are
America/Toronto.

## Shipped

- **v0.1.0 (2026-09-25):** the core language. Plain-English variables,
  `show`, decisions, loops, functions, lists, friendly errors. 79 tests.
- **v0.2.0 (2026-09-25):** the agent framework. Named agents with
  personas, restricted tools, step budgets, and per-run memory, plus the
  Python bridge, `ask ai` with tool loops, and tmux control. 97 tests.
- **v0.3.0 (2026-09-25):** deeper agents. Disk-persistent memory
  (`remember is always`), agents calling agents (3-level cap), and
  streaming answers. 112 tests.
- **v0.4 (2026-09-25):** files and sharing. File I/O (`write` / `append` /
  `read file ... giving`), string interpolation (`"Hello, {name}!"`),
  and `jpm`: `use "github.com/user/pkg"` installs a Jesun.Code package
  into `~/.jesun-code/packages/` (shallow clone, timeouts, no `..`
  escapes, plain-English errors), `bring in "pkg"` loads it. Ships
  three starter packages: `time`, `files`, `http`. 158 tests.
- **v0.5.0 (2026-09-25):** home turf. Bangla keyword flavor (67 words,
  `use bangla` header, `মন্তব্য` comments, Bengali digits) plus the VS
  Code extension (generated TextMate grammar, snippets, run-file).
  GitHub Pages site with blog, FAQ, SEO/GEO (sitemap, robots.txt,
  llms.txt, JSON-LD). 201 tests.
- **v0.6.0 (2026-09-25):** fleets. `fleet` blocks run named agents'
  asks in parallel (per-agent locks, child scopes), answers collected
  into a list in ask order, shared fleet memory
  (`The fleet remembers:`). Plain-English failures, no nesting, no
  streaming in fleets. 220 tests.
- **v1.0.0 (2026-09-26): SELF-HOSTING.** `jesun.jc`: the full
  interpreter (lexer, parser, tree-walker) written in Jesun.Code,
  using the Python bridge only for file I/O and subprocess. It passes
  the entire test suite: 365 tests, 309 differential-green (walker
  byte-identical to the bootstrap), 8 pinned gaps, 2 pinned
  divergences, 46 pinned exclusions (spec `docs/spec-v1.0.md`,
  section 9.7; `tests/check_classification.py` enforces the tagging).
  The victory condition of the grind; the Python implementation is now
  the bootstrap only.


## Up next (in order, no skipping)

- **v1.1: native (IN PROGRESS, not shipped).** A `jesun build` command
  producing real native binaries (transpile Jesun.Code to C, compile
  with cc). No bundled runtime. Spec: `docs/spec-v1.1.md`. The core
  language, decisions, loops, functions (including closures), lists,
  text, and files build natively today; unsupported features fail at
  build time with plain-English errors. Until v1.1 ships green, releases
  remain honestly described as runtime-bundled.

## The founder's law (2026-09-25): one language, all solutions

Everything below must be possible NATIVELY in Jesun.Code. The Python
bridge is bootstrap only; it never counts as the solution. If a domain
works only through the bridge, that domain is not done.

- **v1.2: jweb.** Native web framework in Jesun.Code: HTTP server,
  routing, JSON, sessions, sqlite. Frontend and backend, full stack,
  no Python in the path.
- **v1.3: frontend (shipped 2026-09-26, v1.3.0).** Native HTML DSL, templates, and JS
  interop, so real sites and React-level apps are expressible in
  Jesun.Code. Spec `docs/spec-v1.3.md`; `html`, `template`, `js` packages
  pure Jesun.Code, zero bridge.
- **v1.4: interop packages (shipped 2026-09-30, v1.4.0).** Native jpm packages for the stacks the
  world runs on: `wordpress` (any WP REST API; raw urllib primitives in,
  every rule and every error in Jesun.Code), `react` (JSX builders plus a
  Vite scaffolder), `php` (Laravel routes, controllers, Blade pages, plus
  a project scaffolder). Spec `docs/spec-v1.4.md`; 34 differential tests,
  all green on both interpreters.
- **v1.5: the site builds itself (shipped 2026-09-30, v1.5.0).** A
  static site generator written in Jesun.Code itself: the `sitegen`
  package (chrome builders, blog builders, machine files) plus one
  driver file and one `sitegen_build` call. The whole `docs/` tree (15
  pages, sitemap.xml, robots.txt, llms.txt) rebuilds page-for-page
  identical, byte for byte, on both interpreters. Spec-first in
  `docs/spec-v1.5.md`; 34 differential tests, all green on both
  interpreters.
- **v2.0: games on PC (active).** Native 2D graphics, input, audio,
  and game loop. A visual game written in Jesun.Code, running on PC,
  no bridge.
- **v2.1: 3D and physics.** Native 3D rendering and physics on PC.
- **v3.0: mobile.** Native mobile pipeline: touch input, mobile
  rendering, APK/IPA packaging. The hardest phase, saved for last.

Order is dependency order; no skipping. Each phase ships only when
its domain runs natively, tested, in Jesun.Code.

## Honest framing

Until v1.1, releases ship as a single binary that bundles a runtime; you
never install Python, but the interpreter core inside is Python-based.
Self-hosting is real: `jesun.jc` is the interpreter. Packaging is
roadmap until v1.1. Neither claim will be made before
its milestone ships green.

## Blocked on the founder (not worked around)

1. A real LLM for `JESUNCODE_AI_COMMAND` (his call which provider) to
   dogfood `ask ai` against a true model.
2. A real LLM for `JESUNCODE_AI_COMMAND` (his call which provider) to
   dogfood `ask ai` against a true model.
