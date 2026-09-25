#!/usr/bin/env python3
"""Fixture mind for the agent_scout.jc demo: uses both tools across three asks."""
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
    sys.stdout.write("CALL: read_notes()\n")
elif n == 2:
    sys.stdout.write("Launch date: Sep 30.\n")
elif n == 3:
    sys.stdout.write("CALL: read_risks()\n")
elif n == 4:
    sys.stdout.write("Risks: venue not booked; budget approval pending.\n")
else:
    sys.stdout.write("Sep 30, as established above.\n")
