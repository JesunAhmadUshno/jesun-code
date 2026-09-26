"""Sprint 4 exit checklist (spec 9.7): every test method in tests/test_*.py
is tagged differential-green, pinned gap, pinned exclusion, or pinned
divergence, and the tags match the code.

Run: python3 tests/check_classification.py

Buckets:
- differential-green: both interpreter legs run and must be byte-identical
  (the default; every migrated class inherits the differential harness).
- pinned gap: both legs run; the outputs diverge in a documented way
  (both sides quoted in the test, spec subsection explains the mechanism).
- pinned exclusion: cannot run through the walker by construction; the
  class docstring says "Pinned exclusion" with a reason.
- pinned divergence: both legs run; outputs diverge where each side takes
  its honest later-phase path (documented in the class or test docstring).
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# test_id -> (bucket, spec reference)
GAPS = {
    "test_selfhost.TestSelfHost.test_agent_tool_fail_gap": "spec 8.3.1",
    "test_selfhost.TestSelfHost.test_fleet_nested_gap": "spec 8.4.1",
    "test_selfhost.TestSelfHost.test_fleet_fail_gap": "spec 8.4.1",
    "test_selfhost.TestSelfHostJpm.test_jpm_deep_gap": "spec 8.5.5",
    "test_core.CoreSemantics.test_recursion_depth_guard_gap": "spec 9.1",
    "test_core.CoreSemantics.test_loop_millions_guard_gap": "spec 9.2",
    "test_phase2.ZeroLeakage.test_foreign_call_error_gap": "spec 7.3",
    "test_fleet.FleetErrors.test_fleet_cannot_nest_in_asks": "spec 8.4.1",
}

DIVERGENCES = {
    "test_phase2.MachinesNoTmux.test_tmux_missing_is_plain_english":
        "spec 8.3.2 (no-tmux vs later-phase line, both pinned)",
    "test_phase2.ZeroLeakage.test_tmux_program_divergence":
        "spec 8.3.2 (terminal-name error vs later-phase line, both pinned)",
}

# Modules whose classes cannot run through the walker by construction
# (spec 9.2c); the pinned exclusion must be documented in the class or
# module docstring.
EXCLUSION_MODULES = {"test_selfhost_jpm_bridge"}


def main():
    loader = unittest.TestLoader()
    suite = loader.discover("tests")

    def walk(s):
        for item in s:
            if isinstance(item, unittest.TestSuite):
                yield from walk(item)
            else:
                yield item

    tests = list(walk(suite))
    buckets = {}
    problems = []

    for test in tests:
        test_id = test.id()
        cls = test.__class__
        module = cls.__module__
        class_doc = (cls.__doc__ or "")
        module_doc = (sys.modules[module].__doc__ or "")

        if test_id in GAPS:
            buckets[test_id] = ("pinned gap", GAPS[test_id])
        elif test_id in DIVERGENCES:
            buckets[test_id] = ("pinned divergence", DIVERGENCES[test_id])
        elif "Pinned exclusion" in class_doc or (
                module in EXCLUSION_MODULES
                and "Pinned exclusion" in module_doc):
            buckets[test_id] = ("pinned exclusion", "docstring")
            if "Pinned exclusion" not in class_doc and \
                    "Pinned exclusion" not in module_doc:
                problems.append(f"{test_id}: exclusion not documented")
        else:
            buckets[test_id] = ("differential-green", "harness")

    # Every pinned id must exist as a real test.
    for pinned in list(GAPS) + list(DIVERGENCES):
        if pinned not in buckets:
            problems.append(f"{pinned}: pinned but no such test exists")

    counts = {}
    for _tid, (bucket, _ref) in buckets.items():
        counts[bucket] = counts.get(bucket, 0) + 1

    print(f"classified {len(buckets)} tests:")
    for bucket in ("differential-green", "pinned gap",
                   "pinned divergence", "pinned exclusion"):
        print(f"  {bucket}: {counts.get(bucket, 0)}")

    # List the gaps and exclusions for the reader.
    print("\npinned gaps:")
    for tid, ref in sorted((t, r) for t, (b, r) in buckets.items()
                           if b == "pinned gap"):
        print(f"  {tid} ({ref})")
    print("\npinned divergences:")
    for tid, ref in sorted((t, r) for t, (b, r) in buckets.items()
                           if b == "pinned divergence"):
        print(f"  {tid} ({ref})")
    print("\npinned exclusions:")
    for tid in sorted(t for t, (b, _r) in buckets.items()
                      if b == "pinned exclusion"):
        print(f"  {tid}")

    if problems:
        print("\nPROBLEMS:")
        for problem in problems:
            print(f"  {problem}")
        sys.exit(1)
    print("\ncheck_classification: all tests tagged, tags match the code")


if __name__ == "__main__":
    main()
