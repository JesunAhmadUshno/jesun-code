# Jesun.Code v0.6: fleets

Status: shipped in v0.6.0 (2026-09-25). Previous: v0.5 (Bangla flavor, VS Code extension).

## The idea

One agent is a mind. A fleet is a team: named agents run their asks in
parallel, the answers come back as one list, and the fleet keeps a shared
memory every member can read. Many minds, one mission, one sentence each.

## Syntax

```
agent scout
    persona is "You are a careful systems researcher. Be brief."
    tools are [check_disk]

agent critic
    persona is "You are a skeptical reviewer. Be brief."

fleet crew with scout and critic
    ask scout "is the disk okay?" giving disk_report
    ask critic "is the memory okay?" giving mem_report

show crew         # ["the sky is blue", "all clear"] -- in ask order
show disk_report  # "the sky is blue"
```

## Rules

1. Header: `fleet <name> with <agent> [and <agent> ...]`. One member or
   more. Each member must already be a defined agent; a typo gets the
   usual did-you-mean. The same agent may appear twice only by naming it
   twice, which is allowed and runs two asks against it.
2. The block holds one `ask` per line: `ask <member> <prompt> giving
   <name>`. Every member named in an ask must belong to the fleet, or the
   line fails with `"<x>" is not a member of fleet "<fleet>".`
3. Optional setting line, agent-block style: `memory file is "crew.json"`.
   Any other setting fails like the agent block does.
4. Streaming asks are forbidden in fleets: `Line N: streaming asks cannot
   run in a fleet; take "streaming" out.` (Parallel minds cannot share
   one screenful of output without interleaving.)
5. Prompts are evaluated up front, in the enclosing scope, in ask order,
   before any thread starts. Then all asks run concurrently.
6. Results: the fleet name becomes a list of answers in ask order, and
   each `giving` name is set in the enclosing scope too.
7. Shared fleet memory: when `memory file is` is given, the fleet loads
   past (question, answer, agent) triples and prepends them to every
   member's prompt as `The fleet remembers:` lines. After the run, the new
   triples are appended (capped at 200) and saved. Member agents keep
   their own histories and `remember` behavior unchanged.
8. Failure: if any ask fails, the fleet fails with the first failure's
   plain-English message and line number. No partial list is set.
9. Concurrency: each ask runs in its own thread with a child scope.
   Per-agent locks keep one agent's history and tool runs from
   interleaving with itself; different agents truly run side by side.
   Lines printed by tools stay whole.
10. `fleet` is a block opener in the REPL. Bangla: `দল` for `fleet`
    (`সহ` for `with` already exists). Errors stay English.

## Not in v0.6

- No fleet-of-fleets. A fleet ask's tools cannot open another fleet
  (the depth cap turns it into a plain-English error).
- No timeouts per ask beyond the existing 60-second mind timeout.
- No priority or ordering guarantees beyond ask-order results.

## Tests

- Two asks run in parallel (wall-clock under the sum of two slow minds).
- Results list is in ask order; `giving` names set.
- Non-member ask, unknown member, duplicate setting, streaming ask:
  plain-English errors.
- Fleet memory file round-trips; shared lines reach the mind's prompt.
- Same agent asked twice in one fleet: both answers land, history sane.
- Grammar regen picks up `fleet`; Bangla `দল` parses.
