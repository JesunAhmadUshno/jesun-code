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

## What v0.3 is, honestly

v0.3 ships as a native binary. You never install Python and never see it,
period. Under the hood the interpreter core is written in Python and
bundled inside the binary; the full standard library rides along so the
Python bridge works out of the box.

The full language spec lives in `docs/spec-v0.1.md`; the v0.2 agent
framework is specified in `docs/spec-v0.2.md`, and deeper agents
(persistent memory, agent-to-agent calls, streaming) in
`docs/spec-v0.3.md`.

## Roadmap

- **v0.3 candidates:** disk-persistent agent memory, agent-to-agent calls,
  streaming answers.
- **Long term: self-hosting.** The interpreter rewritten in Jesun.Code
  itself, so the language no longer rides on any other runtime. This does
  not exist yet, and we will not claim otherwise until it does.

## License

MIT. See [LICENSE](LICENSE).
