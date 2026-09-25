#!/usr/bin/env python3
"""Fixture mind for agent-to-agent calls.
Call 1 (writer): asks the researcher for the date.
Call 2 (researcher): answers with the date.
Call 3 (writer): writes the brief using the researcher's answer."""
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
    sys.stdout.write('CALL: researcher("find the date")\n')
elif n == 2:
    sys.stdout.write("Sep 30\n")
else:
    sys.stdout.write("Brief: Sep 30.\n")
