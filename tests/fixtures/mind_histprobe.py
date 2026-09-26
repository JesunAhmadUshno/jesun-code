#!/usr/bin/env python3
"""Fixture mind for agent_forget_history.jc: answers 'saw history' when the
prompt carries an earlier exchange (the 'Earlier in this conversation'
prefix), else 'fresh'. Lets the differential suite see whether forget
actually cleared the in-run history."""
import sys

prompt = sys.stdin.read()
if "Earlier in this conversation" in prompt:
    sys.stdout.write("saw history\n")
else:
    sys.stdout.write("fresh\n")
