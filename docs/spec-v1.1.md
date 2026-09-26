# Jesun.Code v1.1 Language Specification: native builds
Author: Anvil (Language Smith) | Status: draft for implementation | Date: 2026-09-26

## 1. What v1.1 is

`jesun build program.jc` produces a real native binary. The Jesun.Code
source is transpiled to C, then compiled with the system C compiler
(`cc`). The binary runs with no interpreter and no Python anywhere in
the path. This is the first release where the honest framing changes:
until v1.1 the shipped binary bundled a runtime; from v1.1,
`jesun build` output is genuinely native.

```
jesun build hello.jc            # writes ./hello
jesun build hello.jc -o greet   # writes ./greet
./hello
```

The generated C file embeds a small value library (a few hundred lines
of C: a tagged value type, an arena allocator, text and list helpers,
plain-English runtime errors). Like every compiled language, the output
carries a small runtime of its own; what it does NOT carry is an
interpreter, a bytecode VM, or Python.

## 2. Command surface

- `jesun build <file.jc> [-o <name>] [--keep-c]`
- `-o` names the output binary. Default: the source file name without
  `.jc`, in the current folder.
- `--keep-c` keeps the generated `<name>.c` next to the binary.
  Otherwise it is removed after a successful compile.
- Build failures print one plain-English line with a line number, e.g.
  `Line 12: "ask ai" needs a mind to talk to; native builds cannot use it.`
  and exit nonzero. No C compiler output ever reaches the user; if `cc`
  fails, the message says the C compiler failed and names the file.
- A missing `cc` is a plain-English build error, not a traceback.

## 3. Supported subset (v1.1.0)

Everything in v0.1 through v1.0 that does not need Python, a network,
an AI mind, a terminal multiplexer, or a package download:

- `show`, `note` comments
- variables: `<name> is <expr>`, reassignment with `is`
- numbers (whole and fractional), text (with `{...}` interpolation),
  `true` / `false`, `nothing`, lists `[a, b, c]`
- arithmetic `+ - * / %` with interpreter-identical semantics:
  `+` joins text; `/` is true division; `%` follows the same
  sign rules as the interpreter; dividing by zero fails in plain
  English with the line number
- comparisons: `is`, `is not`, `is greater than`, `is less than`,
  `is at least`, `is at most`, `contains`; `and`, `or`, `not`
- `if` / `otherwise if` / `otherwise` with `then`
- `repeat <n> times`, `repeat while <cond>`, `for each <x> in <list>`,
  `stop`, `skip` (the million-iteration guard applies)
- functions: `to <name> with <a>, <b>:` ... `give back <expr>`;
  recursion works; the 100-deep call guard applies
- builtins: `length of`, `first of`, `last of`, `uppercase of`,
  `lowercase of`, `trim of`, `split ... by ...`, `join ... with ...`,
  `characters of`, `text of`, `kind of`
- subscripts: `items[0]`, `name[0]`, negative positions count from the
  end, exactly like the interpreter
- `push <expr> to <name>` (in place, like the interpreter)
- `read file "<path>" giving <name>`, `write <text> to file "<path>"`,
  `append <text> to file "<path>"` (same current-folder sandbox as the
  interpreter)
- `ask "<prompt>" giving <name>` (reads one line from stdin)
- `fail with "<text>"` (prints the text and stops, exit code 1)
- `arguments`: the compiled binary sees its own command-line words in
  `arguments`, a list of text, exactly like the interpreter sees the
  words after the file name

Truthiness, equality (`true` never equals `1`), number printing
(whole-valued numbers print without a decimal point), and list printing
`[1, 2, 3]` all match the interpreter exactly. A program that runs
under `jesun` and under its compiled binary prints the same bytes,
except for the unsupported features below.

## 4. Not supported in native builds (compile-time errors)

These need the Python bridge, a mind, tmux, or the network, so the
transpiler rejects them with a plain-English line-numbered message
naming the feature:

[CORRECTED 2026-09-26: the Bangla keyword flavor IS supported in
v1.1.0 and is NOT in the unsupported list. The transpiler walks the
parser AST, which is keyword-flavor-agnostic: the tokenizer maps Bangla
keywords to the same token types, so `দেখাও "হ্যালো"` parses to the
identical `Show` node as `show "hello"`. Bangla programs build natively
with no extra work; `CoreLanguage.test_bangla` verifies it. The earlier
draft wrongly listed Bangla as unsupported.]

- `ask ai` (with or without tools/streaming)
- agents (`agent`, `ask <agent>`, `remember`), fleets (`fleet`)
- terminal control (`open terminal`, `send`, `read`, `close`)
- `import ... from python` and anything that touches a foreign value
- `use "..."` (jpm install) and `bring in "..."` (jpm load)

Unsupported-syntax errors reuse the interpreter's own words where a
matching runtime error exists, so documentation stays consistent.

## 5. Transpiler architecture

- The transpiler walks the parser AST from `jesun.py` directly
  (`Parser(tokenize(source)).parse_program()`); there is one grammar,
  not two.
- Values become one C type, `JcVal`: a tagged union over nothing,
  number (double), text (arena string), true/false, and list.
- Memory is a bump arena: programs allocate, never free individually.
  Long-running programs reuse the same arena; the OS reclaims it on
  exit. This is documented, not hidden.
- Scopes are runtime frames (name to value), walked like the
  interpreter's environment chain, so shadowing and recursion behave
  the same. Globals live in the root frame.
- Errors are `Line N: <message>` printed to stdout, exit code 1,
  byte-identical in shape to interpreter errors.
- Number printing uses shortest-round-trip formatting with the same
  fixed-vs-scientific choice as the interpreter, so `show 0.1 + 0.2`
  prints identically from both.

## 6. Testing bar (applies from the first sprint)

- Every new transpiler chunk lands with tests in `tests/test_build.py`.
- The differential rule: for every supported program, interpreted output
  and compiled-binary output must be byte-identical (stdout and exit
  code). The fuzzer (`tests/fuzz_build.py`) generates core-subset
  programs and checks both paths.
- Full suite green after every chunk: `python3 -m unittest discover -s tests`.
- Example programs in `examples/native_*.jc`, each verified through a
  real compiled binary, not just the transpiler.

## 7. Roadmap beyond v1.1.0

Later v1.1.x sprints widen the subset (more builtins, better error
positions) and shrink the generated C. The native-domains
ladder (v1.2 jweb, v1.3 frontend, v1.4 interop, v2.0 games, v2.1 3D,
v3.0 mobile) builds ON this transpiler: those phases add native
packages, not a new compiler.
