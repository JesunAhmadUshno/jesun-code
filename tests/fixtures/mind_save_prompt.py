#!/usr/bin/env python3
"""Fixture mind: saves the full prompt it received, then answers one line."""
import os
import sys

prompt = sys.stdin.read()
with open(os.environ["MIND_PROMPT_FILE"], "w", encoding="utf-8") as handle:
    handle.write(prompt)
sys.stdout.write("understood\n")
