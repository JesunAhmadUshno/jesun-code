#!/usr/bin/env python3
"""Fixture mind for the agent-depth cap: every agent calls the next one,
so a calls b calls c calls d calls e, past the 3-level maximum."""
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
n = call_count()
if n == 1:
    sys.stdout.write('CALL: b("go")\n')
elif n == 2:
    sys.stdout.write('CALL: c("go")\n')
elif n == 3:
    sys.stdout.write('CALL: d("go")\n')
elif n == 4:
    sys.stdout.write('CALL: e("go")\n')
else:
    sys.stdout.write("too far\n")
