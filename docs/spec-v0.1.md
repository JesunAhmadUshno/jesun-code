# Jesun.Code v0.1 Language Specification
Author: Jesun Ahmad Ushno | Status: draft for implementation | Date: 2026-09-25

## 1. Philosophy

Jesun.Code reads like plain English. If a sentence makes sense to a person, it should make sense to the machine.

- No semicolons. No braces. No mandatory parentheses.
- Blocks are indentation, like Python.
- Keywords are ordinary English words, never symbols where a word will do.
- Dynamic typing. Errors speak plain English with a line number.

## 2. Running programs

- Source files end in `.jc`.
- `python jesun.py hello.jc` runs a file.
- `python jesun.py` with no arguments opens an interactive REPL.

## 3. Comments

`note` starts a comment that runs to the end of the line.

```
note This is a comment. The machine ignores it.
```

## 4. Showing output

`show` prints a value followed by a newline.

```
show "Hello, world"
show 42
show name
```

## 5. Variables

`<name> is <expression>` assigns. Reassignment uses `is` as well.

```
name is "Jesun"
age is 29
pi is 3.14159
awake is true
mystery is nothing
```

Types: number, text, list, true/false, nothing. Names are letters, digits, underscores, and must not start with a digit.

## 6. Asking for input

```
ask "What is your name?" giving name
show "Hello, " + name
```

`ask <prompt> giving <name>` prints the prompt, reads one line, stores the text.

## 7. Arithmetic and text

Operators: `+ - * / %` with usual precedence, parentheses allowed. `+` joins text.

```
total is price * quantity
greeting is "Hello, " + name
remainder is 10 % 3
```

## 8. Comparisons (words, not symbols)

| Jesun.Code | Meaning |
|---|---|
| `a is b` | equal |
| `a is not b` | not equal |
| `a is greater than b` | `>` |
| `a is less than b` | `<` |
| `a is at least b` | `>=` |
| `a is at most b` | `<=` |
| `a contains b` | text contains text, or list contains item |
| `not x`, `a and b`, `a or b` | boolean logic |

`is` inside a condition means equality; `is` at statement start means assignment. The parser distinguishes by position.

## 9. Decisions

```
if age is at least 18 then
    show "adult"
otherwise if age is at least 13 then
    show "teen"
otherwise
    show "child"
```

`then` closes the condition line. `otherwise if` chains. `otherwise` catches the rest.

## 10. Loops

Counted loop:

```
repeat 5 times
    show "hi"
```

Condition loop:

```
count is 0
repeat while count is less than 5
    show count
    count is count + 1
```

Loop over a list:

```
for each friend in friends
    show friend
```

`stop` ends the loop immediately. `skip` jumps to the next round.

## 11. Functions

Definition:

```
to greet with name
    show "Hello, " + name

to add with a and b
    give back a + b

to dance
    show "dancing, no inputs needed"
```

- `to <name>` starts a definition. Parameters follow `with`, joined by `and`.
- `give back <expression>` returns a value. Without it, the function gives back `nothing`.
- Calls:

```
greet with "Jesun"
total is add with 2 and 3
show total
dance
```

A call is a statement starting with a defined function name, or an expression anywhere a value is expected. Argument lists split on top-level `and`; parenthesize boolean `and` inside an argument: `check with (a and b)`.

## 12. Lists and built-ins

```
friends is ["Mara", "Wren", "Leo"]
show first of friends
show last of friends
show length of friends
show uppercase of "hello"
show lowercase of "LOUD"
```

Built-in prefix functions: `length of x`, `first of x`, `last of x`, `uppercase of x`, `lowercase of x`.

Text helpers:

```
show split of "a,b,c" by ","
show join of ["a", "b", "c"] with ", "
show trim of "  hello  "
```

`split of` needs a non-empty `by` text; `join of` needs a list of text. For python dictionaries from the bridge:

```
import json as j
d is j.loads('{"a": 1}')
show keys of d
```

## 13. Errors

Every error is plain English with a line number. Examples:

```
Line 3: I do not know the word "naem". Did you mean "name"?
Line 7: "greet" needs 1 input, but you gave 2.
Line 2: I expected a number here, but found "hello".
```

## 14. Full example

```
note Jesun.Code: cheer program

ask "What is your name?" giving name

to cheer with name
    repeat 3 times
        show "Go, " + name + "!"

if name is not "" then
    cheer with name
otherwise
    show "The quiet type. I respect that."
```

## 15. Out of scope for v0.1

File input/output, classes, string interpolation. Candidate v0.2 features: a Bangla keyword flavor, `wait <n> seconds`, `otherwise` on loops, a Jesun.Code package manager (working name `jpm`), multi-agent fleets.

## 16. The Python bridge (v0.1)

Jesun.Code rides on Python's back. Every package installed for Python, stdlib or pip, is available to Jesun.Code through the bridge. Install it with pip as usual, then import it.

```
import math
show math.sqrt(16)
show math.pi

import random as chance
show chance.randint(1, 10)
```

- `import <module>` and `import <module> as <name>` use Python's own import system. If Python can import it, Jesun.Code can use it.
- At the border, use Python's manners: dotted names, calls with parentheses and commas, like `math.sqrt(16)`. Inside Jesun.Code you keep speaking Jesun.Code; when talking to Python, you speak Python.
- Values cross the border automatically: Python None becomes `nothing`; numbers, text, true/false, and lists become Jesun.Code values. Anything else (dictionaries, objects) arrives as a Python object you can still use: attributes with `.name`, calls with `(args)`, items with `["key"]` or `[0]`.
- `[index]` subscripts also work on Jesun.Code lists: `friends[0]` is the first friend, alongside `first of friends`.
- Foreign calls accept `name=value` keyword arguments: `sorted(names, reverse=true)`.
- Import failures speak plain English:

```
Line 4: I could not find the Python package "numpyy". Did you mean "numpy"? If it is a pip package, install it first: pip install numpy
```

## 17. Minds and machines (v0.1)

### Talking to AI

```
ask ai "Summarize this in one line: the sky is blue" giving summary
show summary
```

`ask ai <prompt> giving <name>` sends the prompt to the connected mind and stores the reply text. You connect your own mind with one environment variable: `JESUNCODE_AI_COMMAND` is a command that reads a prompt on stdin and writes the answer on stdout (a wrapper around any model or API you like, local or hosted). Without it, the failure is plain English:

```
Line 2: no mind connected. Set JESUNCODE_AI_COMMAND to a command that reads a prompt and writes an answer, for example: export JESUNCODE_AI_COMMAND="ollama run llama3.1"
```

### Giving the AI tools (agentic loop)

```
to read_logs
    give back "ERROR: disk full at 02:14"

ask ai "What went wrong?" with tools [read_logs] giving answer
show answer
```

With `with tools [f, g]`, the mind can call your Jesun.Code functions by writing `CALL: name(arg1, arg2)` on its own line. Jesun.Code runs them, feeds the results back, and loops until the mind answers or runs out of steps (10 by default, raised with `within N steps`):

```
ask ai "What went wrong?" with tools [read_logs] within 20 steps giving answer
```

Anything the mind writes outside a CALL line becomes the final answer.

### Commanding terminals (tmux)

```
open terminal named "worker"
send "python train.py" to terminal "worker"
read terminal "worker" giving output
show output
close terminal "worker"
```

Real tmux underneath, plain English on top. `read terminal` captures the visible pane text. If tmux is missing:

```
Line 1: tmux is not installed. Install it first: sudo apt install tmux
```

## 18. Agents (v0.2)

Named, reusable AI agents with a persona, tools, and memory. Built on the v0.1 `ask ai ... with tools` loop.

```
to check_disk
    give back "78% full"

agent scout
    persona is "You are a careful systems researcher. Be brief."
    tools are [check_disk]
    remember is true
    steps are 15

ask scout "is the disk okay?" giving report
show report
ask scout "and what was the number again?" giving report2
show report2
```

- An `agent <name>` block configures: `persona is <text>`, `tools are [f, g]`, `remember is true/false` (default false), `steps are N` (default 10).
- `ask <agent> "<prompt>" giving <name>` runs the ReAct loop with the agent's persona, tools, and step budget.
- With `remember is true`, conversation history persists across asks in the same run, so the agent builds context ("the number again" works).
- Memory is per-run in v0.2 (no disk persistence yet).
