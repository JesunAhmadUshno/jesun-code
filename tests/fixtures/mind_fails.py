#!/usr/bin/env python3
"""Fixture mind: exits nonzero, so the fleet ask fails plainly."""
import sys

sys.stdin.read()
sys.stderr.write("boom\n")
sys.exit(1)
