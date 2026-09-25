# Jesun.Code

[![Release](https://img.shields.io/github/v/release/JesunAhmadUshno/jesun-code)](https://github.com/JesunAhmadUshno/jesun-code/releases)
[![CI](https://github.com/JesunAhmadUshno/jesun-code/actions/workflows/ci.yml/badge.svg)](https://github.com/JesunAhmadUshno/jesun-code/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-112%20passing-brightgreen)](https://github.com/JesunAhmadUshno/jesun-code)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A programming language that reads like plain English. If a sentence makes
sense to a person, it should make sense to the machine.

## Install

One line, no Python needed, no setup. The binary carries everything inside.

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/JesunAhmadUshno/jesun-code/main/scripts/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/JesunAhmadUshno/jesun-code/main/scripts/install.ps1 | iex
```

Then:

```bash
jesun program.jc   # run a file
jesun              # open the REPL
jesun --version    # Jesun.Code v0.3
```

Prefer the source? `python3 jesun.py program.jc` works too (Python 3,
standard library only, nothing to install).

## Hello world

```jesun
note comments start with note

ask "What is your name? " giving name

to cheer with name
    repeat 3 times
        show "Go, " + name + "!"

if name is not "" then
    cheer with name
otherwise
    show "The quiet type. I respect that."
```

## The language in one page

```jesun
name is "Jesun"            note variables: <name> is <value>
age is 29
awake is true
mystery is nothing

show "Hello, " + name      note show prints a value

if age is at least 18 then       note decisions
    show "adult"
otherwise if age is 13 then
    show "teen"
otherwise
    show "child"

repeat 3 times            note counted loop
    show "hi"

repeat while age is less than 30    note condition loop
    age is age + 1

for each friend in ["Mara", "Wren"]   note loop over a list
    show friend

to add with a and b        note functions
    give back a + b

show add with 2 and 3
```

Comparisons use words: `is`, `is not`, `is greater than`, `is less than`,
`is at least`, `is at most`, `contains`, plus `and`, `or`, `not`.

Built-ins: `length of x`, `first of x`, `last of x`, `uppercase of x`,
`lowercase of x`, `split of x by sep`, `join of x with sep`, `trim of x`,
`keys of x` (python dictionaries). `stop` ends a loop, `skip` jumps to the
next round.

## The Python bridge

Every Python package ever published works in Jesun.Code on day one.
At the border you use Python's manners; everywhere else you speak Jesun.Code.

```jesun
import math
show math.sqrt(16)
show math.pi

import random as chance
show chance.randint(1, 10)

import json
x is json.loads("[1, 2, 3]")
show x[1]

names is ["b", "a"]
import builtins
show builtins.sorted(names, reverse=true)
```

`[0]` subscripts work on Jesun.Code lists too. A bad import never
tracebacks:

```
Line 1: I could not find the Python package "numpyp". Did you mean "numpy"? If it is a pip package, install it first: pip install numpyp
```

## Minds and machines

Connect any model with one environment variable: a command that reads a
prompt on stdin and writes the answer on stdout.

```bash
export JESUNCODE_AI_COMMAND="ollama run llama3.1"
```

Then:

```jesun
ask ai "Summarize this in one line: the sky is blue" giving summary
show summary

to read_logs
    give back "ERROR: disk full at 02:14"

ask ai "What went wrong?" with tools [read_logs] within 20 steps giving answer
show answer
```

With `with tools`, the mind calls your functions by writing
`CALL: name(arg1, arg2)`; Jesun.Code runs them and feeds the results back
until the mind answers or runs out of steps (10 by default).

### Give it a real AI brain (free forever, no key)

The easiest brain needs nothing at all: no key, no account, no billing.
Pollinations.ai is a free community service:

```bash
export JESUNCODE_AI_COMMAND="$HOME/.jesun-code/providers/pollinations-provider"
```

Pick the model with `JESUNCODE_AI_MODEL` (default `openai`; options at
text.pollinations.ai/models). It can be slower and rate-limited at busy
times; for heavier use, switch to Gemini or OpenAI below.

### Give it a real AI brain (Gemini, free with your Google account)

The installer already put provider scripts at `~/.jesun-code/providers/`.
The easiest brain is Gemini: sign in with Google at
aistudio.google.com/apikey, create a free key (no billing needed), then:

```bash
printf '%s' 'your-key' > ~/.jesun-code/gemini.key
chmod 600 ~/.jesun-code/gemini.key
export JESUNCODE_AI_COMMAND="$HOME/.jesun-code/providers/gemini-provider"
```

Prefer an environment variable? Set `GEMINI_API_KEY` instead of the key
file. Pick the model with `JESUNCODE_AI_MODEL` (default
`gemini-3-flash-preview`).

### Give it a real AI brain (OpenAI)

Same idea with the OpenAI provider:

```bash
printf '%s' 'sk-your-key' > ~/.jesun-code/openai.key
chmod 600 ~/.jesun-code/openai.key
export JESUNCODE_AI_COMMAND="$HOME/.jesun-code/providers/openai-provider"
```

Get a key at platform.openai.com. `OPENAI_API_KEY` works instead of the
key file; `JESUNCODE_AI_MODEL` picks the model (default `gpt-4o-mini`).

On Windows (PowerShell):

```powershell
$env:JESUNCODE_AI_COMMAND = "py $HOME\.jesun-code\providers\gemini-provider"
```

Then `ask ai` and every agent talks to a real model.

## Agents

v0.2: named, reusable AI agents with a persona, their own tools, and
memory. Anyone can build an AI agent in plain English:

```jesun
to read_notes
    give back "Launch is Sep 30. Budget is 40k."

agent scout
    persona is "You are Scout, a careful desk researcher. Answer briefly."
    tools are [read_notes]
    remember is true
    steps are 10

ask scout "what is the launch date?" giving brief1
show brief1
ask scout "remind me of the date again" giving brief2
show brief2
```

With `remember is true`, the agent carries conversation history across
asks in the same run. v0.3 goes deeper:

```jesun
agent researcher
    persona is "You find facts. Be brief."
    tools are [read_notes]
    remember is always

agent writer
    persona is "You write launch briefs."
    tools are [researcher]

ask writer "brief me on the launch" giving brief streaming
show brief
```

- `remember is always`: the agent's history is saved to
  `~/.jesun-code/memory/<name>.json` after every ask and reloaded next
  time, so it remembers across runs. `forget researcher` wipes it.
- Agents can call agents: list an agent in another agent's `tools are`
  and the mind reaches it with `CALL: researcher("find the date")`
  (3 levels deep, max).
- `streaming` prints the answer as it arrives, then binds it as usual.

See `examples/deep_agent.jc` and `docs/spec-v0.3.md`.

## Files and words

v0.4: Jesun.Code reads and writes files, strings can think, and `jpm`
fetches packages:

```jesun
write "dear diary\n" to file "journal.txt"
append "today I learned file I/O\n" to file "journal.txt"
read file "journal.txt" giving pages
show pages

name is "Jesun"
show "Hello, {name}! Two plus two is {2 + 2}."

use "github.com/jesun/time"
bring in "time"
show "It is " + time_now + " on " + time_today
```

- `write <value> to file "<path>"` replaces the file's contents;
  `append <value> to file "<path>"` adds to the end. Values are converted
  the way `show` converts them, so numbers and lists work too.
- `read file "<path>" giving <name>` reads the whole file as text.
- Paths resolve from the current folder and may not escape it (`..`
  climbs are refused in plain English). Missing files, folders passed as
  files, and missing parent folders all fail with a line number, never a
  traceback.
- `{expression}` inside any string evaluates and splices in its `show`
  form. `{{` and `}}` are literal braces. Note: this means literal braces
  in strings now need doubling (breaking change from v0.3).
- `use "github.com/user/pkg"` installs a Jesun.Code package into
  `~/.jesun-code/packages/` (shallow git clone, 120-second timeout, no
  `..` escapes; refused in plain English when the repo is unknown, the
  network fails, or git is missing). `bring in "pkg"` loads its code so
  its functions are ready to call. Installing twice is a no-op; a
  checkout with local changes is never overwritten. The repo ships three
  starter packages in `packages/`: `time`, `files`, and `http`.

See `examples/file_demo.jc` and `docs/spec-v0.4.md`.

## The Bangla flavor

v0.5: Jesun.Code speaks Bangla. Start the file with `use bangla` (or a
line with only `বাংলা`) and every keyword becomes a Bangla word. Same
grammar, same blocks, same plain-English errors with line numbers; comments
start with `মন্তব্য`, identifiers and Bengali digits (`৫`, `৩.১৪`) work
throughout:

```jesun
বাংলা
মন্তব্য মাসের খরচের হিসাব
খরচগুলো হয় [["চাল", ১২০], ["ডাল", ৯০], ["তেল", ২০০]]
মোট হয় ০
জন্য প্রতিটি খরচ ভেতরে খরচগুলো
    মোট হয় মোট + খরচ[1]
দেখাও "মোট খরচ: {মোট} টাকা"
```

In Bangla mode the English words are ordinary names (and vice versa): one
file, one tongue. The full keyword table is in `docs/spec-v0.5.md`
section 23. A working expense-report demo lives in
`examples/bangla_demo.jc`.

## VS Code

v0.5: first-class editing in `editors/vscode/`: syntax highlighting for
English and Bangla keywords (the grammar is generated from the interpreter
itself, so it can never drift), snippets, and a run-file command
(`Ctrl+Alt+R`). Copy the folder to `~/.vscode/extensions/jesun-code` and
reload.

Real tmux underneath, plain English on top:

```jesun
open terminal named "worker"
send "python train.py" to terminal "worker"
read terminal "worker" giving output
show output
close terminal "worker"
```

## Truthiness

`false`, `nothing`, `0`, `""` and `[]` count as false. Everything else
counts as true.

## Errors

Errors are plain English with a line number. Nothing ever dumps a raw
traceback, and no Python internals ever leak through:

```
Line 3: I do not know the word "naem". Did you mean "name"?
Line 7: "greet" needs 1 input, but you gave 2.
Line 2: I cannot divide by zero.
```

## Examples and tests

`examples/` holds runnable programs covering every feature, including
nested loops, recursion, `give back`, and the flagship
`examples/doctor.jc`: a server doctor written entirely in Jesun.Code that
checks the machine through the Python bridge, asks the AI to diagnose it
with real tools, and looks around through a tmux terminal. Run the suite:

```bash
python3 -m unittest discover -s tests
```

## What v0.4 is, honestly

v0.4 ships as a native binary. You never install Python and never see it,
period. Under the hood the interpreter core is written in Python and
bundled inside the binary; the full standard library rides along so the
Python bridge works out of the box.

## What v0.5 is, honestly

v0.5's Bangla flavor is a keyword flavor, not a translation: the grammar
stays English-shaped, only the words change, and error messages stay in
plain English (Bangla error text is queued, not silently dropped). The
binary still bundles the Python runtime until v1.1; self-hosting is
roadmap until v1.0. Never claimed otherwise.

The full language spec lives in `docs/spec-v0.1.md`; the v0.2 agent
framework is specified in `docs/spec-v0.2.md`, deeper agents (persistent
memory, agent-to-agent calls, streaming) in `docs/spec-v0.3.md`, files
plus interpolation in `docs/spec-v0.4.md`, and the Bangla flavor plus the
VS Code extension in `docs/spec-v0.5.md`.

## Roadmap

The public milestone ladder lives in [ROADMAP.md](ROADMAP.md): v0.4
files and sharing (shipped), v0.5 Bangla flavor plus the VS Code
extension, v0.6 agent fleets, v1.0 self-hosting (the interpreter rewritten
in Jesun.Code itself, which does not exist yet and will not be claimed
until it does), v1.1 native binaries.

## License

MIT. See [LICENSE](LICENSE).
