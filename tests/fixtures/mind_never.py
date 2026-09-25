#!/usr/bin/env python3
"""Fixture mind: never answers, only calls tools. Used to test step exhaustion."""
import sys

sys.stdin.read()
sys.stdout.write("CALL: read_logs()\n")
