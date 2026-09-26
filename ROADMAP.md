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

## In progress

- **v1.0: SELF-HOSTING.** `jesun.jc` exists and runs: phase A (v0.1
  core), phase B part 1 (`ask`, file I/O, the `import` bridge), the
  Bangla keyword flavor, and `ask ai` (spec 8.2, with the `CALL:`
  tool loop) are differential-green against the bootstrap
  (spec `docs/spec-v1.0.md`). Still to come: agents, fleets,
  jpm. The milestone is claimed only when the full suite passes
  through `jesun.jc`.

## Up next (in order, no skipping)

- **v1.0: SELF-HOSTING.** `jesun.jc`: the full interpreter (lexer,
  parser, tree-walker) written in Jesun.Code, using the Python bridge
  only for file I/O and subprocess. It must pass the entire test suite.
  This is the victory condition of the grind; the Python implementation
  becomes the bootstrap only.
- **v1.1: native.** A `jesun build` command producing real native
  binaries (transpile Jesun.Code to C, compile with cc). No bundled
  runtime.

## Honest framing

Until v1.1, releases ship as a single binary that bundles a runtime; you
never install Python, but the interpreter core inside is Python-based.
Self-hosting is roadmap until v1.0. Neither claim will be made before
its milestone ships green.

## Blocked on the founder (not worked around)

1. A real LLM for `JESUNCODE_AI_COMMAND` (his call which provider) to
   dogfood `ask ai` against a true model.
2. A real LLM for `JESUNCODE_AI_COMMAND` (his call which provider) to
   dogfood `ask ai` against a true model.
