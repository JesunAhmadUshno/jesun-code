#!/usr/bin/env python3
"""Fixture mind: sleeps 2s, then answers. Two parallel asks finish in ~2s,
two serial asks would take ~4s, so this proves fleets run side by side."""
import sys
import time

sys.stdin.read()
time.sleep(2)
sys.stdout.write("done sleeping\n")
