#!/usr/bin/env python3
"""Fixture mind: answers in two slow chunks, to prove streaming prints as they arrive."""
import sys
import time

sys.stdin.read()
sys.stdout.write("first chunk\n")
sys.stdout.flush()
time.sleep(1)
sys.stdout.write("second chunk\n")
