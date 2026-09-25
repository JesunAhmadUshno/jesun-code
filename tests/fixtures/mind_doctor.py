#!/usr/bin/env python3
"""Fixture mind for the doctor.jc demo: investigates with both tools,
then gives a one-line diagnosis."""
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
    sys.stdout.write("CALL: disk_report()\n")
elif n == 2:
    sys.stdout.write("CALL: load_report()\n")
else:
    sys.stdout.write(
        "All clear: plenty of free disk and the load is light. Nothing to fix.\n"
    )
