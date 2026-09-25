#!/usr/bin/env python3
"""Fixture mind: appends each received prompt to a log file, then answers."""
import os
import sys

prompt = sys.stdin.read()
with open(os.environ["MIND_PROMPT_FILE"], "a", encoding="utf-8") as handle:
    handle.write(prompt)
    handle.write("\n--- prompt boundary ---\n")
sys.stdout.write("ok\n")
