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

## 8. Phase B, part 2: agents, fleets, jpm, Bangla keywords

Part 2 brings the v0.2-v0.6 surface into the walker: `ask ai` (spec
16/17), agents with memory and tool loops, `fleet` blocks, `jpm`
(`use`/`bring in`), and the Bangla keyword flavor (spec v0.5 s23).
Sprint order inside part 2: Bangla first (lexer-only, no subprocess),
then `ask ai`, then agents, then fleets, then jpm.

### 8.1 Bangla keyword flavor in the walker (this sprint)

The parser needs no changes: Bangla keywords map to the same kinds
(`দেখাও` is `show`), so the tree format and the walker are untouched.
All the work is in the lexer, mirroring the bootstrap exactly:

- Header detection (`bangla_header`): the first non-blank line of the
  file, where blank means blank after cutting an English `note`
  comment (the header itself is read in English mode). The header is
  exactly `use bangla` or the lone word `বাংলা`, else 0. `lex` skips
  the header line: it is a directive, not a statement.
- `bangla_kinds`: the Bangla word-to-kind table, one for one with the
  bootstrap's `BANGLA_KEYWORDS`. `keyword_kind` takes the mode and
  picks the table; unknown words are `name` in both modes (English
  keywords are plain names in Bangla mode and vice versa).
- Comment word: `cut_comment` takes the comment word (`মন্তব্য` in
  Bangla mode, `note` otherwise), with the same word-boundary rule.
- `is_word_start` widens through the bridge (`str.isalpha()`), so
  `দ` starts a word exactly like the bootstrap's `ch.isalpha()`.
  Combining marks never start a word (`isalpha()` is false for marks),
  matching the bootstrap.
- `is_digit` goes through the bridge (`str.isdigit()`), so Bengali
  digits (`৫`) read as numbers. The digit run is accumulated as text
  and converted with `int()` on the whole run; a run that is not
  decimal (e.g. `²`, where `isdigit()` is true but `int()` raises)
  fails with the bootstrap's bare
  `I hit something I did not expect and stopped instead of guessing.`
  (no line prefix, via `fail with`), exactly like the bootstrap's
  unexpected-exception path.
- `is_word_char` is tightened to the exact bootstrap predicate
  (`isalnum()` or `_` or a combining mark, via `unicodedata.category`),
  closing the phase-A exotic-symbol gap: a non-letter symbol like `→`
  now ends the word and fails `I do not know what "→" means here.`
  on both sides.

### 8.2 `ask ai` (shipped)

`parse_ask_ai`: `ask ai <prompt> giving <name>`, with optional
`with tools [name, ...]`, optional `within <n> steps` (only when
`with tools` is present, matching the bootstrap), and optional
trailing `streaming`. `within` takes a whole number of at least 1
(Bengali digits work: `within ২ steps`); anything else is a parse
error at the target line. `ask` with a named agent stays a parse
error for the next sprint. Bangla spells it
`জিজ্ঞেস এআই ... রেখে ...` with `হাতিয়ার`, `মধ্যে`, `ধাপ`,
`সরাসরি`; the walker's lexer maps them to the same kinds, so one
parser covers both flavors.

The subprocess half lives in one constant template,
`_AI_HELPERS_SRC`, defined once at the top of `jesun.jc` as joined
text and loaded with `builtins.exec` into a fresh namespace per
`ask ai`. Security review: the template is fixed source; it never
contains program text, and user data travels only as values in the
helper arguments. It cannot raise: every outcome is a
`["code", ...]` list, and the walker (`ai_finish`) maps each code to
a plain-English error at the target program's line:

- `missing`: `no mind connected. Set JESUNCODE_AI_COMMAND to a
  command that reads a prompt and writes an answer, for example:
  export JESUNCODE_AI_COMMAND="ollama run llama3.1"`
- `not_found`: `I could not run the mind command.`
- `timeout`: `the mind took too long to answer (over 60 seconds).`
- `talk`: `I could not talk to the mind.`
- `bad_exit`: `the mind exited with an error.` plus the first safe
  stderr line when it carries no traceback or address.

`argv` comes from `JESUNCODE_AI_COMMAND`, shlex-split
(Windows-aware), exactly like the bootstrap. The prompt goes on
stdin; the answer is stdout with one trailing newline trimmed.
Streaming writes each chunk to stdout as it arrives and normalizes
CRLF to LF.

The tool loop (`ai_tool_loop`) is Jesun.Code. The transcript starts
with the system prompt
`You are a helper inside Jesun.Code. You can call tools by writing
one per line like this:\nCALL: toolname("some text", 2)\nAvailable
tools: <names>\nCall no other tools. Anything you write outside CALL
lines is your final answer to the human.`
followed by `Human: <prompt>`; each round appends `(You have used
<n> of <m> steps.)`, then `Mind:\n<reply>\n\nResults:\n<results>`.
A reply line matches `CALL: name(args)` (leading/trailing spaces
allowed); every other line is a candidate answer line. With no CALL
lines, the answer is the non-CALL lines joined and trimmed. Tool
arguments split at top-level commas (strings and nested brackets
respected, mirroring the bootstrap's `_split_top_level`) and parse
as Jesun.Code expressions in the current scope. Dispatch:

- a name not in the declared list, or a declared name that is not a
  Jesun function, answers
  `RESULT of <name>: I do not know a tool called "<name>".`
  (undeclared names also get the `I only have these tools: ...`
  prefix, matching the bootstrap);
- a wrong argument count answers
  `RESULT of <name>: "<name>" needs <n> input(s), but got <m>.`;
- otherwise the tool runs through the walker's own foreign-call
  path (`call_function`) and its rendered return becomes
  `RESULT of <name>: <value>`.

Step exhaustion fails
`the mind used all <n> steps without giving an answer.` at the
target line. Differential fixtures use fixture minds
(`tests/fixtures/mind_*.py`) with `JESUNCODE_AI_COMMAND` pointed at
them, so both sides are deterministic; `tests/fixtures/selfhost/`
carries `ask_ai_basic.jc`, `ask_ai_tools.jc`, and
`ask_ai_bangla.jc`, and `tests/fuzz_selfhost.py` covers the error
codes plus the `within`/`streaming` grammar shapes.

### 8.3 Agents (this sprint)

`agent <name>` blocks (persona, tools, remember on/off/always, memory
file, max steps), `ask <agent> <prompt> giving <name> [streaming]`,
`forget <name>`. Agent values live in the walker's env as nested lists
`["agent", name, persona, tools, remember, memory_file, max_steps,
history]`; `persona`/`memory_file` are text or `nothing` when unset;
`remember` is `"off"`, `"run"`, or `"always"`; history is a list of
`[prompt, answer]` pairs, newest last, appended in place so aliases see
the same history.

The subprocess half is the same `_AI_HELPERS_SRC` template: `agent_ask`
always runs the mind through `ai_tool_loop` (never the direct path,
even with no tools), extended with four arguments:

- `persona`: text or `nothing`. The system head becomes
  `rstrip(persona) + "\n\n"` instead of the plain helper voice,
  exactly like the bootstrap.
- `history`: the agent's history list, or `nothing` when
  `remember is off`. Non-empty history is spliced into the transcript
  as `\n\nEarlier in this conversation:` followed by
  `\nHuman: <prompt>\nMind: <answer>` per turn, newest last.
- `agent_name`: text, or `""` for plain `ask ai`. Step exhaustion
  fails `<agent> used all <n> steps without giving an answer.` at the
  target line; the `ask ai` wording is unchanged.
- `agent_depth`: the agent-nesting depth (0 at a top-level ask).
  `ai_run_tool` takes it too: the function branch keeps the walker's
  own `depth` for the 100-call cap; the agent branch uses
  `agent_depth`.

Agents calling agents: when a declared tool names an agent value,
`ai_run_tool` parses the CALL arguments, then requires exactly one
text argument
(`RESULT of <name>: I can only ask <name> one question at a time, as
text.`), and refuses deeper nesting: at `agent_depth + 1 > 3` the
run fails with `agents called agents too deep (3 levels max).`
(the bootstrap raises `_AgentDepthExceeded`, which its own tool loop
re-raises instead of feeding back, so both sides end the run with the
identical message at the target line). It then runs the sub-agent's
own tool loop with `agent_depth + 1`, no streaming. The sub-agent's
answer comes back as `RESULT of <name>: <answer>`.

Memory on disk: one more constant audited bridge template,
`_AGENT_HELPERS_SRC` (generated mechanically from a Python source like
`_AI_HELPERS_SRC`; never contains program text; nothing in it raises:
every outcome is a `["code", ...]` list). `_jc_agent_mempath`
replicates the bootstrap exactly: the explicit `memory file` when set,
else `JESUN_CODE_HOME/memory/<safe>.json` (or
`~/.jesun-code/memory/<safe>.json`), with the same
`[^A-Za-z0-9_-] -> _` sanitization and `agent` fallback.
`_jc_agent_load` returns `["missing"]` (silent, like the bootstrap's
`FileNotFoundError`), `["unreadable"]` (the walker emits
`Line N: saved memory for <name> was unreadable, starting fresh.` and
continues), or `["ok", turns]`. `_jc_agent_save` caps at the newest
200 turns and returns `["failed"]` on any error (the walker emits
`Line N: I could not save memory for <name>.`). `forget` clears the
in-run history in place (bridge `clear`, so aliases see it), unlinks
the file: missing prints `<name> has nothing to forget.`, an OSError
fails `Line N: I could not forget <name>.`, success prints
`Memory of <name> cleared.` Forgetting an unknown name uses the
default path, exactly like the bootstrap.

Parse notes: `ask` + NAME + not-`giving` now parses as an agent ask
(the old "phase B part 2" parse error is gone); `ask` + NAME +
`giving` stays the classic human ask. `agent` and `forget` leave the
"later phase" guard; stray `memory` also leaves it (the bootstrap
reads it as a broken expression: `I expected a value here.`). The
agent block requires its indented settings block
(`an agent needs an indented block of settings.`); duplicate settings
fail `"<field>" is already set for this agent.`; unknown settings
fail `I do not know the agent setting "<got>". I know: persona,
tools, remember, steps, memory file.`; `tools are [...]` accepts `is`
or `are`; `remember` takes `true`/`false`/`always`
(`"remember" needs true, false, or always.`); `steps` takes a whole
number of at least 1 (`"steps" needs a whole number of steps, at
least 1.`). Bangla works through the existing kinds (no parser
changes). Unknown agents fail with did-you-mean over defined agents
(prefix match, then `difflib` at 0.6, mirroring the bootstrap);
asking a non-agent value fails `"<name>" is a function, not an
agent.` / `"<name>" is not an agent, not an agent.`

### 8.3.1 Known gap: failures inside the tool loop (honest, not hidden)

Jesun.Code has no try/catch, so the walker cannot do what the
bootstrap does in `_run_tool`: catch a failing tool and feed
`RESULT of <name>: <message>` back to the mind. When a Jesun.Code
tool function or a sub-agent fails during a tool loop, the
self-hosted run ends with the failure's message (for `fail with`,
the bare text; for runtime errors, `Line N: <message>`), where the
bootstrap feeds the mind `RESULT of <name>: <message>` and continues
the loop. The depth-cap refusal is NOT part of this gap: both sides
end the run with the identical fatal
`Line N: agents called agents too deep (3 levels max).` (the
bootstrap re-raises its `_AgentDepthExceeded` instead of feeding it
back). The proper fix is a language-level `attempt`/`catch`, the same
future spec that unblocks the 7.3 gap; until then the differential
suite pins the exact divergence with a dedicated assertion (it fails
if either side changes behavior). The fuzzer never generates failing
tools, so differential fuzzing stays byte-identical.

### 8.3.2 Later-phase statements parse in the walker too

Statements that belong to later phases (`use`, `bring in`, `fleet`,
`open`/`send`/`close`/`read` terminal) parse in the walker with the
bootstrap's exact diagnostics instead of the generic "later phase"
rejection: `read` looks at the next word (`file` vs anything else),
`fleet` reuses the bootstrap's own block/field checks (`a fleet
needs an indented block of asks.`, `I do not know the fleet setting
"<got>". I know: ask, memory.`, ask-name validation). Statement-leading
`terminal` and `within` fall through to the broken-expression parse
(`I expected a value here.`), exactly like the bootstrap. Operands are
evaluated first so their errors match; a shape that survives that fails
at the target line with the honest `"X" is for a later phase; this
interpreter does not speak it yet.` line. `bring in` mirrors the
bootstrap's deterministic checks first (package-name validation, the
"not fetched" message via a `_jc_jpm_find` bridge helper that
replicates the bootstrap's `~/.jesun-code/packages` dir scan); only a
package that is actually fetched hits the later-phase line. Valid
`fleet` and terminal shapes are known execution gaps: the walker does
not run threads, tmux, or the network. The differential fuzzer covers
these grammar shapes.

### 8.4 Fleets (after agents)

`fleet <name>:` blocks with named `ask`s running in parallel and
answers collected into a list in ask order, plus shared fleet memory
(`The fleet remembers:`). The walker runs the asks through the
bridge's threads (`threading.Thread`, one per ask, results joined in
order), each ask a child scope with per-agent locks, mirroring the
bootstrap. No streaming inside fleets, no nested fleets: both stay
parse-time errors naming the rule. Differential fixtures use fixture
minds with small sleeps to prove parallelism does not reorder
answers.

### 8.5 jpm (after fleets)

`use "github.com/user/pkg"` and `bring in "pkg"`. The walker
delegates the install to the bootstrap's jpm path through the bridge
(`~/.jesun-code/packages/`, path-escape checks, no `..` traversal),
then loads the package's `.jc` files through its own lexer/parser.
Differential tests sandbox `JESUN_CODE_HOME` to a temp dir and use a
local `packages/` fixture tree instead of the network.
