# Changelog

All notable changes to Jesun.Code are recorded here. Dates are America/Toronto.

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
