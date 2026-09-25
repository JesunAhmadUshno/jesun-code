#!/usr/bin/env python3
"""Fixture mind: exits 1 with a Python-style traceback on stderr."""
import sys

sys.stdin.read()
sys.stderr.write(
    'Traceback (most recent call last):\n  File "x", line 1\nValueError: boom\n'
)
sys.exit(1)
