#!/usr/bin/env python3
"""Fixture mind for agent_depth.jc: chains agent calls a1->a2->a3->a4->a3,
tripping the 3-level agent-to-agent cap. Counts invocations in
$MIND_COUNT_FILE."""
import os
import sys


def call_count() -> int:
    path = os.environ["MIND_COUNT_FILE"]
    try:
        with open(path, encoding="utf-8") as handle:
            n = int(handle.read().strip() or 0)
    except (OSError, ValueError):
        n = 0
    n += 1
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(str(n))
    return n


sys.stdin.read()
names = {1: "a2", 2: "a3", 3: "a4", 4: "a3"}
sys.stdout.write('CALL: %s("deeper")\n' % names.get(call_count(), "a2"))
