#!/usr/bin/env python3
"""Fixture mind for agent_tool_fail_gap.jc: first call triggers the failing
tool, second call answers. Counts invocations in $MIND_COUNT_FILE."""
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
if call_count() == 1:
    sys.stdout.write("CALL: boom()\n")
else:
    sys.stdout.write("got it\n")
