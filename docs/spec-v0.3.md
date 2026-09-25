# Jesun.Code v0.3 Specification: deeper agents

## 19. Agents grow up

### Memory that survives the run

```
agent scout
    persona is "You are a careful researcher."
    tools are [check_disk]
    remember is always

ask scout "the launch date is Sep 30" giving a
```

- `remember is true`: memory lives for the run only (v0.2 behavior, unchanged).
- `remember is always`: conversation history is saved to disk after every ask and reloaded the next time the agent is defined. Default location: `~/.jesun-code/memory/<agent-name>.json`. Set `JESUN_CODE_HOME` to redirect the base directory elsewhere.
- The memory file is JSON: a list of `[prompt, answer]` pairs, newest last. Only the most recent 200 turns are kept.
- `memory file is "path/to.json"`: overrides the location (relative paths resolve from the working directory).
- `forget scout`: clears the agent's in-run history too, deletes the saved file, and prints `Memory of scout cleared.` Forgetting an agent with no saved memory prints `scout has nothing to forget.`
- Corrupt memory files do not crash: the agent starts fresh and prints `Line N: saved memory for scout was unreadable, starting fresh.` (a warning, not an error; execution continues).

### Agents calling agents

```
agent researcher
    persona is "You find facts. Be brief."
    tools are [search_web]

agent writer
    persona is "You write launch briefs."
    tools are [researcher]

ask writer "brief me on the launch" giving brief
```

- An agent listed in another agent's `tools are` becomes a callable tool. The mind writes `CALL: researcher("find the launch date")` and the sub-agent's answer comes back as the RESULT.
- The sub-call uses the sub-agent's own persona, tools, memory setting, and step budget.
- Depth cap: 3 levels of agent-to-agent calls. Deeper attempts end the loop with `Line N: agents called agents too deep (3 levels max).`
- If the sub-agent itself fails, its caller gets the failure as plain-English RESULT text, never a crash.
- An agent listing itself in its own tools is a plain-English definition error: `Line N: scout cannot list itself as a tool.`

### Streaming answers

```
ask ai "tell me a short story" giving story streaming
ask scout "status report" giving report streaming
```

- With `streaming` at the end, the answer prints as it arrives (each chunk flushed immediately), then is stored in the variable as usual.
- Works with both `ask ai` and `ask <agent>`, with or without tools.
- In a tool loop, intermediate replies stream raw as they arrive, so `CALL:` lines may be visible mid-stream; the variable still receives the cleaned final answer.
- Without `streaming`, behavior is exactly v0.2 (print nothing until the answer is complete).

### v0.4 candidates (non-goals for v0.3)

File input/output, string interpolation, classes, the Bangla keyword flavor, `jpm` package manager, multi-agent fleets with parallel asks.
