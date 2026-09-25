# Jesun.Code v0.2 Language Specification (agents)

Companion to `spec-v0.1.md`. Only what v0.2 adds or clarifies is here.

## 18. Agents (final)

Named, reusable AI agents with a persona, tools, memory, and a step budget.
Built on the v0.1 `ask ai ... with tools` loop.

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

### 18.1 The `agent` block

```
agent <name>
    persona is <text>
    tools are [f, g]
    remember is true
    steps are 15
```

- Every field is optional. Defaults: no persona (a plain helper voice),
  no tools, `remember is false`, `steps are 10`.
- `persona is` takes any text expression, usually a string.
- `tools are` lists function names defined with `to`. An empty list `[]`
  is allowed. Tool functions resolve when called, so they may be defined
  after the agent block.
- `remember is` takes `true` or `false` only.
- `steps are` takes a whole number, at least 1.
- Unknown settings, duplicate settings, and bad values are plain-English
  errors with line numbers. The block must be indented; an `agent` line
  with no block is an error.
- `agent` is a keyword in v0.2 and can no longer be a variable name.

### 18.2 Asking an agent

```
ask scout "is the disk okay?" giving report
```

- Runs the v0.1 ReAct tool loop, but with the agent's persona prepended
  to the system instructions, restricted to the agent's tool list, and
  bounded by the agent's step budget.
- The persona travels with every prompt the mind receives.
- A tool the mind calls that is not in the agent's list is fed back as a
  `RESULT` error ("I only have these tools: ..."), exactly like v0.1.
- Step exhaustion names the agent and its budget:
  `scout used all 15 steps without giving an answer.`
- Unknown agent names get did-you-mean over defined agents:
  `I do not know an agent called "scot". Did you mean "scout"?`
- Asking something that is not an agent is a plain-English error:
  `"greet" is a function, not an agent.`

### 18.3 Memory

- With `remember is true`, each ask appends its prompt and the mind's
  final answer to the agent's history, and the history is included in
  later prompts under "Earlier in this conversation:". The agent builds
  context across asks ("the number again" works).
- With `remember is false` (the default), every ask is isolated.
- Memory is per-run and in-memory in v0.2. Nothing is written to disk.
  Restarting the program starts the agent with a blank slate.

### 18.4 Disambiguation from classic `ask`

`ask question giving r` (a NAME directly followed by `giving`) is still
the classic human-prompt ask: it prints the value of `question` and reads
a line of input. `ask scout "prompt" giving r` (a NAME followed by anything
else) asks the agent. If `scout` is not a defined agent, the error says so
in plain English.

### 18.5 What v0.2 does not do

No disk persistence for memory, no agent-to-agent calls, no streaming of
partial answers, no parallel asks. Candidates for v0.3.
