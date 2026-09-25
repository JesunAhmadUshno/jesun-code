#!/usr/bin/env python3
"""Fixture mind: calls probe() until it sees the tool result, then saves the
prompt (which carries the RESULT line) and answers. Proves the fleet-nesting
guard fires in plain English inside a tool run."""
import os
import sys

prompt = sys.stdin.read()
if "RESULT of probe" in prompt:
    with open(os.environ["MIND_PROMPT_FILE"], "w", encoding="utf-8") as handle:
        handle.write(prompt)
    sys.stdout.write("noted, no more tools\n")
else:
    sys.stdout.write("CALL: probe()\n")
