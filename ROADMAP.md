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

## In progress

- **v0.4: files and sharing.**
  - Shipped this sprint: file I/O (`read file "<p>" giving <t>`,
    `write <t> to file "<p>"`, `append <t> to file "<p>"`; paths resolve
    from the current folder and may not escape it) and string
    interpolation (`"Hello, {name}!"`, with `{{`/`}}` escapes). Breaking
    change: literal braces in strings now need doubling.
  - Next shift: `jpm`, the package manager. `use "github.com/user/pkg"`
    installs a Jesun.Code package from GitHub into
    `~/.jesun-code/packages/` (shallow clone, arg lists only, timeouts,
    no `..` escapes), then makes its files importable by name. Starter
    packages to ship: `http`, `files`, `time`.

## Up next (in order, no skipping)

- **v0.5: home turf.** The Bangla keyword flavor (a `bangla` mode where
  keywords are Bangla words; spec first) plus a VS Code extension
  (syntax highlighting, snippets, run-file command) in
  `editors/vscode/`.
- **v0.6: fleets.** `fleet` blocks: named agents run asks in parallel,
  results collected into a list. Shared fleet memory.
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

1. `.github/workflows/` needs `gh auth login --web` with `workflow`
   scope, then the workflow files can be pushed: unlocks macOS/Windows
   binaries via Actions.
2. A real LLM for `JESUNCODE_AI_COMMAND` (his call which provider) to
   dogfood `ask ai` against a true model.
