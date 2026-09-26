# Jesun.Code v1.0 Language Specification: self-hosting

Author: Anvil (Language Smith) | Status: draft for implementation | Date: 2026-09-25

## 1. What self-hosting means

`jesun.jc` is the Jesun.Code interpreter written in Jesun.Code itself:
a lexer, a parser, and a tree-walking evaluator, all in plain-English
Jesun.Code. The Python implementation becomes the bootstrap only.

```
python jesun.py jesun.jc program.jc
```

The outer (Python) interpreter runs `jesun.jc`; `jesun.jc` reads
`program.jc`, lexes, parses, and evaluates it, and `show`s the output.
When `jesun.jc` passes the entire test suite, the Python interpreter
is the bootstrap and v1.0 ships. That is the victory condition.

## 2. The bootstrap contract

### 2.1 `arguments`: the program's command-line words

`arguments` is a list of text holding the command-line words that came
after the program file. It exists so a Jesun.Code program can learn
what it was asked to do.

```
python jesun.py jesun.jc program.jc
```

Inside `jesun.jc`, `arguments` is `["program.jc"]`. With no extra words
it is `[]`. `python jesun.py` with no file still opens the REPL.

### 2.2 How jesun.jc runs a program

1. Take the first of `arguments` as the program path. If `arguments`
   is empty, say how to call it and finish.
2. `read file <path> giving source` (the v0.4 file primitive, served
   by the bootstrap interpreter).
3. Lex `source` into tokens, tracking line numbers.
4. Parse the tokens into a tree (nested lists; see section 4).
5. Walk the tree with an environment of scopes and `show` the output.

### 2.3 Error contract

Every failure in the target program is plain English with the target
program's line number, starting with `Line N:`. The bootstrap's own
failures (missing file, unreadable program path) are plain English
too. No tracebacks, no Python internals, no em dashes, anywhere.

## 3. Phase A: the v0.1 core (this sprint)

The first self-hosted interpreter covers spec v0.1 sections 3-13, plus
the two core semantics that landed later:

- Comments (`note`), `show`, `<name> is <expr>`.
- Arithmetic `+ - * / %`, precedence, parentheses.
- Word comparisons: `is`, `is not`, `is greater than`, `is less than`,
  `is at least`, `is at most`, `contains`; `not`, `and`, `or`.
- `if ... then` / `otherwise if` / `otherwise`.
- `repeat <n> times`, `repeat while <cond>`, `for each <x> in <list>`;
  `stop`, `skip`.
- `to <name> [with <a> [and <b> ...]]`, `give back <expr>`, calls
  `f with <args>`, zero-input functions auto-called where a value is
  expected.
- Lists, `length of`, `first of`, `last of`, `uppercase of`,
  `lowercase of`, `trim of`, `split of <t> by <s>`, `join of <l> with <s>`.
- String interpolation `"Hello, {name}!"` (v0.4), with `{{`/`}}`
  escaping matching the bootstrap.
- Value rules identical to the bootstrap: `show_text` formatting
  (floats that are whole show without the point), truthiness
  (`nothing`, `false`, `0`, `""`, `[]` are not truthy), equality
  (true/false never equal numbers; numbers mix freely).
- Two small core additions the self-hosted lexer needs, useful to
  every Jesun.Code programmer:
  - `push <expr> to <name>`: appends the value to the list held by
    `<name>` (in place; the name must already hold a list).
  - `characters of <text>`: gives back the list of one-character
    texts in `<text>`, so programs can scan text character by
    character. Fails plainly on non-text.

Deferred to phase B: `ask` (needs stdin), the `import` bridge,
`read file`/`write file` inside interpreted programs, `use`/`bring in`
(jpm), agents (`ask ai`, `agent`, `with tools`, tmux), fleets,
Bangla keywords. Each gets its own sprint and spec section.

## 4. The tree format (nested lists)

Statements and expressions are plain Jesun.Code lists whose first item
is a tag word. Examples:

```
["show", expr]
["is", name, expr]                       note assignment
["if", cond, then_block, elseifs, else_block]
["repeat_times", expr, block]
["repeat_while", cond, block]
["foreach", var, expr, block]
["to", name, params, block]
["giveback", expr]
["stop"]  ["skip"]
["call", name, args]
["binop", op, left, right]               note op: "add", "sub", "mul", "div", "mod"
["compare", op, left, right]             note op: "eq", "ne", "gt", "lt", "ge", "le", "contains"
["and", left, right]  ["or", left, right]  ["not", expr]
["neg", expr]
["var", name]
["lit", value]
["list", items]
["interp", parts]                       note parts: ["text", t] or ["expr", e] items
["builtin", kind, operand]              note kind: "length", "first", ...
["builtin2", kind, operand, extra]       note split by / join with
```

Blocks are lists of statements. Line numbers ride on every token and
are threaded into errors as `Line N:`.

## 5. Differential testing

`tests/test_selfhost.py` runs a corpus of small programs
(`tests/fixtures/selfhost/*.jc`) twice: once through the Python
interpreter's `execute()`, once through the bootstrap running
`jesun.jc` (`python jesun.py jesun.jc <program>`). Stdout must match
exactly. Error programs must both fail with a `Line N:` message.

## 6. Roadmap inside v1.0

- Sprint 1 (this spec): bootstrap contract + phase A core. `arguments`
  lands in the Python interpreter.
- Sprint 2: phase B, part 1: `ask`, file I/O, and the `import` bridge
  inside interpreted programs (delegating to the bootstrap's bridge).
- Sprint 3: phase B, part 2: agents, fleets, jpm, Bangla keywords.
- Sprint 4: `jesun.jc` passes the full test suite. Victory declared,
  grind stands down to maintenance.

Honest framing, standing: until v1.0 ships, the binary bundles the
Python runtime and self-hosting is roadmap. Neither claim is made
before its time.

## 7. Phase B, part 1: `ask`, file I/O, the `import` bridge (this sprint)

The walker serves these by delegating to the bootstrap through its own
bridge imports at the top of `jesun.jc` (`builtins`, `sys`, `pathlib`,
`os`, `importlib.util`, `operator`, `difflib`, `pkgutil`). The walker's
own source is parsed by the bootstrap, so static bridge calls
(`sys.stdout.write(prompt)`, `path.read_text(...)`) work directly; only
the interpreted program's dynamic foreign calls need a dynamic apply.

### 7.1 New syntax

```
ask <prompt> giving <name>
read file <path> giving <name>
write <value> to file <path>
append <value> to file <path>
import <dotted.module> [as <alias>]
<expr>.<name>                (attribute access on python values)
<expr>(<args>, <name>=<value>)  (foreign call, kwargs allowed)
<expr>[<index>]              (already parsed; now works on python values)
```

Tree nodes: `["ask", prompt, name, ln]`, `["readfile", path, name, ln]`,
`["writefile", value, path, append, ln]`, `["import", modname, alias, ln]`
(alias is `""` when absent), `["attr", obj, name, ln]`,
`["callf", func, args, kwargs, ln]` (kwargs: list of `[name, expr]`).

`ask ai` and `ask <agent> ...` stay parse-time errors naming phase B
part 2; the walker only asks plain questions so far.

### 7.2 Delegation rules

- `ask`: prompt must be text (`the question I ask must be text.`);
  the walker writes it with `sys.stdout.write` + `flush` (no newline,
  exactly like the bootstrap), reads `sys.stdin.readline()`, fails
  `I asked a question, but the input ended.` on `""`, and strips one
  trailing newline only (a `\r\n` line keeps its `\r`, matching the
  bootstrap).
- File I/O: the safe-path rule is replicated (`pathlib`, resolved
  against the current folder, string-prefix containment check):
  `I cannot <read|write to> "<shown>": it leaves the current folder.`
  Pre-checks, in bootstrap order, give byte-identical errors:
  `"<shown>" is a folder, not a file.`,
  `I could not find the file "<shown>".`,
  `I could not write "<shown>": its folder does not exist.`
  Values are rendered with `text of` (exactly `show_text`).
- `import`: progressive `find_spec` (top-level first, so a missing
  parent can never raise), then `import_module`. A missing module
  fails byte-identically:
  `I could not find the Python package "<mod>".` plus the same
  suggestion the bootstrap computes (prefix match over the sorted
  installed top-level modules, else `difflib.get_close_matches` at
  cutoff 0.6) plus ` If it is a pip package, install it first:
  pip install <top>`. Binds the alias, or the top package name.
- Attribute access: non-python values fail
  `only python values use dots; this is <kind>, and dots are for the
  Python bridge.` Missing attributes are pre-checked with `hasattr`:
  `the python "<typename>" has no "<name>".`
- Foreign calls: non-python or non-callable targets are pre-checked:
  `I can only call python functions with parentheses.` The dynamic
  apply is one `builtins.eval` of the CONSTANT template
  `__jc_f(*__jc_a, **__jc_k)` with a namespace dict holding the
  function, the argument list, and the kwargs dict. Security review:
  the template never contains target-program text; user data travels
  only as values in the namespace, so nothing can inject. Any Python
  exception inside becomes `the python call failed: <cleaned>`,
  exactly like the bootstrap's own foreign calls.
- Foreign subscript: `operator.getitem`, native key conversion.
- Foreign values elsewhere: `kind of` is `python value` (automatic);
  `show` renders `the python module "<name>"` / `a python "<type>"`
  (automatic via `text of`); equality of two python values is identity
  (`a is b` on the wrapped values); truthiness follows the bootstrap.

### 7.3 Known gap (honest, not hidden)

The walker cannot catch exceptions: Jesun.Code has no try/catch, so a
foreign call that fails AT CALL TIME (wrong arity, bad argument types)
reports at the walker's bridge line instead of the target program's
line. The message stays plain-English with zero leakage
(`the python call failed: ...`, never a traceback or an exception
name); only the line number differs. Foreign subscripts get a
membership pre-check (`bridge_lookup_miss`): a miss on a container
(dict, list, set, text) reports byte-identically at the target line
(`that lookup failed: ...`), exactly like the bootstrap. A subscript
on a non-container python value still reports at the bridge line.
Every other failure the walker CAN pre-check (prompt not text, input
ended, missing file, folder paths, path escapes, missing module,
missing attribute, non-callable target) carries the target line and is
byte-identical with the bootstrap. Closing the gap properly wants a
language-level `attempt`/`catch`, which is a future spec, not a hack.

### 7.4 Differential coverage

Landed: 19 fixtures `tests/fixtures/selfhost/phaseb_*.jc` and 20 new
tests in `tests/test_selfhost.py` (40 total): ask success with piped
stdin, ask at EOF, ask with a non-text prompt, file write/read/append
round-trips, write-overwrites, read-missing, read-folder,
write-escapes-cwd (with an assertion nothing lands outside the
sandbox), write-to-missing-folder, import success, dotted import,
import alias, import-missing byte-identical with and without a
suggestion hit, attr-missing, attr on a non-python value, foreign
calls with kwargs (`json.dumps` with `sort_keys=true`), foreign
subscript on dicts (hit and miss, both byte-identical), and
`kind of`/`show` on python values. The call-time arity failure runs
through `check_known_gap` (spec 7.3: line normalized, marker required).
File fixtures run in a fresh temp sandbox per side (the self-hosted
sandbox rule); ask fixtures run with piped stdin.
`tests/fuzz_selfhost.py` gains a phase-B generator: every third case
is an ask/file/import program with piped stdin and a fresh temp cwd
per case for both sides; `the python call failed` line-number diffs
are classified as the known 7.3 gap, not failures.
