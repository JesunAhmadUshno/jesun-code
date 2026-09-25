# Changelog

All notable changes to Jesun.Code are recorded here. Dates are America/Toronto.

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
