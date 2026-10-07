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
- **v1.1.0 (2026-09-26): NATIVE.** `jesun build` transpiles Jesun.Code
  to C11 and compiles real native binaries with `cc`, no bundled
  runtime. 48/48 build tests; 413 tests green full suite.
- **v1.2.0 (2026-09-26): jweb.** Native web framework in Jesun.Code:
  HTTP server, routing, sessions, sqlite (parameterized queries,
  plain-English errors). 463 tests green.


## Up next (in order, no skipping)

- **v3.0: Serve (IN PROGRESS).** A full-stack web framework written in
  Jesun.Code itself: Route, Page, Island, Table + admin (M2), live
  views over SSE and 3D scenes (M3), fenced POST /run playground API
  (M4), deployment package (playground.jc + Dockerfile + fly.toml).
  Spec `docs/spec-serve.md` (founder-approved 2026-09-30). M4's 7-day
  soak runs on the founder's laptop (hosting revised 2026-10-01); the
  v3.0.0 release ships only on soak numbers (spec section 11). Soak
  and release are founder-blocked, see below.

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
- **v1.5: the site builds itself (shipped 2026-09-30, v1.5.0; pipeline
  made real 2026-09-30).** A static site generator written in Jesun.Code
  itself: the `sitegen` package (chrome builders, blog builders, machine
  files) plus one driver file and one `sitegen_build` call. The release
  commit migrated the tree by hand; the committed pipeline
  (`site/build.jc` plus authored fragments in `site/content/`) landed in
  the commit after and rebuilds the whole `docs/` tree (15 pages,
  sitemap.xml, robots.txt, llms.txt) page-for-page identical, byte for
  byte, on both interpreters: `python3 jesun.py site/build.jc`. Spec-first
  in `docs/spec-v1.5.md`; 34 differential tests plus
  `tests/test_site_build.py`, all green on both interpreters.
- **v2.0: games on PC (shipped v2.0.0, 2026-09-30).** Native 2D graphics, input, audio,
  and game loop. A visual game written in Jesun.Code, running on PC,
  no bridge. Sprint 1: the `game` package, the snake demo, `\uXXXX`
  string escapes; live window and live keyboard stay sprint 2.
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

1. [CLEARED 2026-09-25] A real LLM for `JESUNCODE_AI_COMMAND`: Gemini
   connected via the secure connector and verified live end-to-end
   through the interpreter (ask ai, streaming, agent with persistent
   memory). Pollinations ships keyless for end users. No longer
   blocking.
2. v3.0 M4: the 7-day dogfood soak runs on the founder's laptop (his
   tap starts the clock); the v3.0.0 release is gated on soak numbers
   per `docs/spec-serve.md` section 11.

## Dated amendments (append-only; newest last)

- 2026-09-30: v3.0 is the Serve web framework (spec
  `docs/spec-serve.md`, founder-approved "Go ahead", v3.0). The
  earlier "v3.0: mobile" placeholder above is superseded; mobile
  moves to a later number to be set. M2 (Route, Page, Island,
  Table + admin) is in progress; M3 (Live view, Scene) follows.
- 2026-09-30: v3.0 M2 committed and pushed (7f20a8e); M3
  implemented and under test (Live view over SSE, Scene via the
  `threejs` package, jweb SSE primitives per spec sections 3.4,
  3.6, 5). tests/test_serve.py 80/80 green, differential
  bootstrap/walker; fuzz_serve.py clean. M4's fenced `POST /run`
  playground API is implemented, differentially tested, and wired
  into `playground.jc` (verified live through the Linux binary:
  all 5 routes 200, timeout enforced at 5s, network cut confirmed).
  M4's 7-day soak still needs the founder's hosting decision
  before its clock can start.
- 2026-10-01: v3.0 M4 hosting REVISED by the founder (supersedes the
  separate-host note): the dogfood soak starts LOCAL on his laptop;
  the public cloud host (his pick: Railway) is deferred, not
  cancelled. The 7-day soak and the v3.0.0 release stay gated on his
  tap and on soak numbers per spec section 11.
- 2026-10-04: test count 711/711 at 93a5165 (full suite green); the
  live site shows v2.0.0 with v3.0 Serve in progress. The platform
  campaign's Serve framework checkpoint fixes (jweb_rotate_session,
  404 XSS escape, serve_live draft preservation, sitegen escaping)
  sit uncommitted in the worktree; adoption needs that campaign's
  handover and is not taken up here.
- 2026-10-06/07: the grind stood down on the 90%+ weekly Power
  budget hold per the standing guardrail (no ladder work, no pushes).
- 2026-10-07: D19 (founder, "Use them"): the founder's additional
  lifetime token pool lifts the grind's token guardrail. Below 90%
  weekly usage the grind runs on the weekly budget; at/above 90% it
  continues from the additional pool (publish-only below 100k,
  full stop below 20k). The grind resumes after the reset.
