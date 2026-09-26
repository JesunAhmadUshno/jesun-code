#!/usr/bin/env python3
"""Fixture mind for fleet_fail_gap.jc (spec 8.4.1): deterministic by
prompt, so thread scheduling cannot flip the outcome. A prompt
containing "knock knock" fails the mind (nonzero exit); any other
prompt runs the mark tool once, then answers. Counts invocations in
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


prompt = sys.stdin.read()
if "knock knock" in prompt:
    sys.stderr.write("mind exploded\n")
    sys.exit(3)
if call_count() == 1:
    sys.stdout.write("CALL: mark()\n")
else:
    sys.stdout.write("good done\n")
