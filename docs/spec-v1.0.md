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
