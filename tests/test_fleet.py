"""v0.6 tests: fleet blocks, parallel asks, shared memory, errors.

Sprint 4 migration (spec 9.2a): every program test is differential-green.
Each program runs through the bootstrap and through jesun.jc as
subprocesses. Each interpreter leg gets its own temp dir holding its own
MIND_COUNT_FILE, MIND_PROMPT_FILE, and JESUN_CODE_HOME, plus its own
working folder (fleet memory files are cwd-relative), so memory files
and mind transcripts never leak across legs. The exact-output
assertion stays on the bootstrap leg; the walker leg must be
byte-identical. Saved prompt files are compared across legs where a
test inspects them.

Pinned gap (spec 8.4.1): the fleet-nesting guard inside a tool loop.
The bootstrap feeds the refusal back to the mind as the tool's RESULT
and finishes; the self-hosted walker ends the run with the refusal's
text. Pinned on both legs exactly (test_fleet_cannot_nest_in_asks).
"""

import json
import os
import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from selfhost_harness import JESUN_JC, JESUN_PY  # noqa: E402
from selfhost_harness import SelfHostDiffCase, run  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
AI_VAR = "JESUNCODE_AI_COMMAND"
COUNT_VAR = "MIND_COUNT_FILE"
PROMPT_VAR = "MIND_PROMPT_FILE"
HOME_VAR = "JESUN_CODE_HOME"


def mind_command(script: str) -> str:
    return '"{}" "{}"'.format(sys.executable, (FIXTURES / script).as_posix())


SCOUT_CRITIC = (
    'agent scout\n'
    '    persona is "You are a careful systems researcher. Be brief."\n'
    'agent critic\n'
    '    persona is "You are a skeptical reviewer. Be brief."\n'
)


class FleetsDiff(SelfHostDiffCase):
    """Differential base: one hermetic leg dir per interpreter."""

    def leg_env(self, script=None):
        d = tempfile.mkdtemp(prefix="fleets_leg_")
        self.addCleanup(shutil.rmtree, d, True)
        env = dict(os.environ)
        if script is None:
            env.pop(AI_VAR, None)
        else:
            env[AI_VAR] = mind_command(script)
        paths = {
            "count": os.path.join(d, "count"),
            "prompt": os.path.join(d, "prompt"),
        }
        env[COUNT_VAR] = paths["count"]
        env[PROMPT_VAR] = paths["prompt"]
        env[HOME_VAR] = os.path.join(d, "home")
        return env, paths

    def run_leg(self, src, args, script=None, legdir=None, progname="prog.jc",
                corrupt_mem=None):
        """One interpreter leg: its own env and (unless legdir is given)
        its own working folder. Returns (result, paths, workdir)."""
        env, paths = self.leg_env(script)
        if legdir is None:
            d = tempfile.mkdtemp(prefix="fleets_prog_")
            self.addCleanup(shutil.rmtree, d, True)
        else:
            d = legdir
        if corrupt_mem is not None:
            with open(os.path.join(d, corrupt_mem), "w",
                      encoding="utf-8") as fh:
                fh.write("{garbage")
        p = os.path.join(d, progname)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(src)
        return run(args + [p], cwd=d, env=env), paths, d

    def run_fleet_src(self, src, script=None, corrupt_mem=None):
        boot, _, _ = self.run_leg(src, [JESUN_PY], script=script,
                                  corrupt_mem=corrupt_mem)
        selfhost, prompt_paths, _ = self.run_leg(
            src, [JESUN_PY, JESUN_JC], script=script,
            corrupt_mem=corrupt_mem)
        return boot, selfhost

    def run_fleet_prompts(self, src, script):
        """Like run_fleet_src but also returns both legs' prompt files."""
        boot, paths_b, _ = self.run_leg(src, [JESUN_PY], script=script)
        selfhost, paths_s, _ = self.run_leg(src, [JESUN_PY, JESUN_JC],
                                            script=script)
        return boot, selfhost, [paths_b["prompt"], paths_s["prompt"]]

    def check_fleet(self, src, expected, script=None, label=None,
                    corrupt_mem=None):
        boot, selfhost = self.run_fleet_src(src, script=script,
                                            corrupt_mem=corrupt_mem)
        self.assert_differential(boot, selfhost, label or f"program {src!r}")
        self.assertEqual(boot[1], expected)
        return boot

    def read_prompt(self, prompt_file):
        try:
            return Path(prompt_file).read_text(encoding="utf-8")
        except OSError:
            return ""


class FleetBasics(FleetsDiff):
    def test_two_asks_in_order(self):
        self.check_fleet(
            SCOUT_CRITIC +
            'fleet crew with scout and critic\n'
            '    ask scout "is the disk okay?" giving disk_report\n'
            '    ask critic "is the memory okay?" giving mem_report\n'
            'show crew\n'
            'show disk_report\n'
            'show mem_report\n',
            '[the sky is blue, the sky is blue]\n'
            "the sky is blue\n"
            "the sky is blue\n",
            script="mind_fixed.py",
            label="two-asks-in-order")

    def test_single_member_fleet(self):
        self.check_fleet(
            SCOUT_CRITIC +
            'fleet solo with scout\n'
            '    ask scout "hi" giving r\n'
            'show solo\n',
            '[the sky is blue]\n',
            script="mind_fixed.py",
            label="single-member-fleet")

    def test_same_agent_twice(self):
        self.check_fleet(
            SCOUT_CRITIC +
            'fleet crew with scout and scout\n'
            '    ask scout "first" giving a\n'
            '    ask scout "second" giving b\n'
            'show crew\n',
            '[the sky is blue, the sky is blue]\n',
            script="mind_fixed.py",
            label="same-agent-twice")

    def test_prompt_evaluated_in_enclosing_scope(self):
        boot, selfhost, prompts = self.run_fleet_prompts(
            SCOUT_CRITIC +
            'question is "disk?"\n'
            'fleet crew with scout\n'
            '    ask scout question giving a\n',
            script="mind_save_prompt.py")
        self.assert_differential(boot, selfhost,
                                 "prompt-in-enclosing-scope")
        sent_boot = self.read_prompt(prompts[0])
        sent_self = self.read_prompt(prompts[1])
        self.assertIn("disk?", sent_boot)
        self.assertEqual(sent_self, sent_boot,
                         "walker leg sent a different prompt to the mind")


class FleetParallel(FleetsDiff):
    def test_asks_run_side_by_side(self):
        src = (SCOUT_CRITIC +
               'fleet crew with scout and critic\n'
               '    ask scout "one" giving a\n'
               '    ask critic "two" giving b\n'
               'show crew\n')
        start = time.monotonic()
        boot, _, _ = self.run_leg(src, [JESUN_PY], script="mind_sleep.py")
        wall = time.monotonic() - start
        selfhost, _, _ = self.run_leg(src, [JESUN_PY, JESUN_JC],
                                      script="mind_sleep.py")
        self.assert_differential(boot, selfhost, "parallel-output")
        self.assertEqual(boot[1], '[done sleeping, done sleeping]\n')
        # Serial would take ~4s; parallel takes ~2s. The wall-time
        # assertion stays on the bootstrap leg only: the walker runs
        # fleet asks in order by design (spec 8.4.1), so it is
        # expected to take the serial time there.
        self.assertLess(wall, 3.2,
                        f"fleet asks did not run in parallel: {wall:.2f}s")


class FleetErrors(FleetsDiff):
    def test_non_member_ask(self):
        self.check_fleet(
            SCOUT_CRITIC +
            'fleet crew with scout\n'
            '    ask critic "hi" giving r\n',
            'Line 6: "critic" is not a member of fleet "crew".\n',
            label="non-member-ask")

    def test_unknown_member_suggests(self):
        src = ('agent scout\n'
               '    persona is "hi"\n'
               'fleet crew with scot\n'
               '    ask scot "hi" giving r\n')
        boot, selfhost = self.run_fleet_src(src)
        self.assert_differential(boot, selfhost, "unknown-member-suggests")
        self.assertIn('I do not know an agent called "scot".', boot[1])
        self.assertIn("scout", boot[1])

    def test_streaming_forbidden(self):
        self.check_fleet(
            SCOUT_CRITIC +
            'fleet crew with scout\n'
            '    ask scout "hi" giving r streaming\n',
            'Line 6: streaming asks cannot run in a fleet; '
            'take "streaming" out.\n',
            label="streaming-forbidden")

    def test_duplicate_memory_file(self):
        self.check_fleet(
            SCOUT_CRITIC +
            'fleet crew with scout\n'
            '    memory file is "a.json"\n'
            '    memory file is "b.json"\n'
            '    ask scout "hi" giving r\n',
            'Line 7: "memory file" is already set for this fleet.\n',
            label="duplicate-memory-file")

    def test_block_required(self):
        self.check_fleet(
            'fleet crew with scout\n',
            "Line 2: a fleet needs an indented block of asks.\n",
            label="block-required")

    def test_unknown_fleet_line(self):
        src = (SCOUT_CRITIC +
               'fleet crew with scout\n'
               '    dance\n')
        boot, selfhost = self.run_fleet_src(src)
        self.assert_differential(boot, selfhost, "unknown-fleet-line")
        self.assertIn("I do not know the fleet line", boot[1])

    def test_failing_ask_fails_the_fleet(self):
        boot, selfhost = self.run_fleet_src(
            SCOUT_CRITIC +
            'fleet crew with scout and critic\n'
            '    ask scout "one" giving a\n'
            '    ask critic "two" giving b\n'
            'show crew\n',
            script="mind_fails.py")
        self.assert_differential(boot, selfhost, "failing-ask-fails-fleet")
        self.assertIn("the mind exited with an error.", boot[1])
        self.assertNotIn("[", boot[1])  # the fleet list never gets set

    def test_no_partial_results_on_failure(self):
        boot, selfhost = self.run_fleet_src(
            SCOUT_CRITIC +
            'fleet crew with scout\n'
            '    ask scout "one" giving a\n'
            'show crew\n',
            script="mind_fails.py")
        self.assert_differential(boot, selfhost,
                                 "no-partial-results-on-failure")
        self.assertIn("the mind exited with an error.", boot[1])
        self.assertNotIn("done", boot[1])

    def test_no_mind_connected(self):
        boot, selfhost = self.run_fleet_src(
            SCOUT_CRITIC +
            'fleet crew with scout\n'
            '    ask scout "hi" giving r\n',
            script=None)
        self.assert_differential(boot, selfhost, "no-mind-connected")
        self.assertIn("no mind connected", boot[1])

    def test_fleet_cannot_nest_in_asks(self):
        """Spec 8.4.1 (pinned gap): the fleet-nesting guard fires in
        plain English; the bootstrap tool loop feeds it back to the
        mind as the tool's result and finishes, while the walker ends
        the run with the failure's text. Both sides pinned exactly."""
        src = ('to probe\n'
               '    fleet inner with scout\n'
               '        ask scout "deep" giving d\n'
               '    give back "probed"\n'
               'agent scout\n'
               '    tools are [probe]\n'
               'fleet crew with scout\n'
               '    ask scout "hello" giving r\n'
               'show r\n')
        boot, selfhost, prompts = self.run_fleet_prompts(
            src, script="mind_probe_always.py")
        self.assertEqual(
            boot, (0, "noted, no more tools\n"),
            f"fleet-nesting: bootstrap changed behavior:\n{boot!r}")
        self.assertEqual(
            selfhost,
            (1, "Line 2: a fleet cannot open inside another fleet's asks.\n"),
            f"fleet-nesting: self-host changed behavior:\n{selfhost!r}")
        sent_boot = self.read_prompt(prompts[0])
        self.assertIn("a fleet cannot open inside another fleet's asks.",
                      sent_boot)


class FleetMemory(FleetsDiff):
    def test_shared_memory_round_trip(self):
        write_src = (SCOUT_CRITIC +
                     'fleet crew with scout and critic\n'
                     '    memory file is "crew.json"\n'
                     '    ask scout "is the disk okay?" giving a\n'
                     '    ask critic "is the memory okay?" giving b\n')
        boot, _, dir_b = self.run_leg(write_src, [JESUN_PY],
                                      script="mind_fixed.py")
        selfhost, _, dir_s = self.run_leg(write_src, [JESUN_PY, JESUN_JC],
                                          script="mind_fixed.py")
        self.assert_differential(boot, selfhost, "fleet-memory-write")
        mem_b = Path(dir_b, "crew.json").read_text(encoding="utf-8")
        mem_s = Path(dir_s, "crew.json").read_text(encoding="utf-8")
        self.assertEqual(mem_s, mem_b,
                         "walker leg wrote a different fleet memory file")
        self.assertIn("is the disk okay?", mem_b)
        triples = json.loads(mem_b)
        # Documented order: (question, answer, agent), in ask order.
        self.assertEqual(triples[0],
                         ["is the disk okay?", "the sky is blue", "scout"])
        self.assertEqual(triples[1],
                         ["is the memory okay?", "the sky is blue", "critic"])
        read_src = (SCOUT_CRITIC +
                    'fleet crew with scout and critic\n'
                    '    memory file is "crew.json"\n'
                    '    ask scout "and now?" giving a\n')
        boot2, paths_b, _ = self.run_leg(
            read_src, [JESUN_PY], script="mind_save_prompt.py",
            legdir=dir_b, progname="prog2.jc")
        selfhost2, paths_s, _ = self.run_leg(
            read_src, [JESUN_PY, JESUN_JC], script="mind_save_prompt.py",
            legdir=dir_s, progname="prog2.jc")
        self.assert_differential(boot2, selfhost2, "fleet-memory-read")
        sent_boot = self.read_prompt(paths_b["prompt"])
        sent_self = self.read_prompt(paths_s["prompt"])
        self.assertIn("The fleet remembers:", sent_boot)
        self.assertIn(
            '- scout was asked "is the disk okay?" '
            'and answered "the sky is blue"',
            sent_boot,
        )
        self.assertIn("the sky is blue", sent_boot)
        self.assertEqual(sent_self, sent_boot,
                         "walker leg sent a different memory prompt")

    def test_member_histories_untouched(self):
        # Observable twin of the old in-process history assertion: with
        # `remember is true`, the first ask's turn reaches the second
        # ask's prompt on both legs.
        src = ('agent scout\n'
               '    persona is "hi"\n'
               '    remember is true\n'
               'fleet crew with scout\n'
               '    ask scout "hi" giving r1\n'
               '    ask scout "yo" giving r2\n'
               'show r1\n'
               'show r2\n')
        boot, selfhost, prompts = self.run_fleet_prompts(
            src, script="mind_save_prompt.py")
        self.assert_differential(boot, selfhost, "fleet-agent-history")
        self.assertEqual(boot[1], "understood\nunderstood\n")
        sent_boot = self.read_prompt(prompts[0])
        sent_self = self.read_prompt(prompts[1])
        self.assertIn("Earlier in this conversation:", sent_boot)
        self.assertIn("Human: hi\nMind: understood", sent_boot)
        self.assertEqual(sent_self, sent_boot,
                         "walker leg sent a different prompt to the mind")

    def test_unreadable_memory_starts_fresh(self):
        boot, selfhost = self.run_fleet_src(
            SCOUT_CRITIC +
            'fleet crew with scout\n'
            '    memory file is "crew.json"\n'
            '    ask scout "hi" giving r\n'
            'show r\n',
            script="mind_fixed.py",
            corrupt_mem="crew.json")
        self.assert_differential(boot, selfhost, "fleet-corrupt-memory")
        self.assertIn("starting fresh", boot[1])
        self.assertIn("the sky is blue", boot[1])


class FleetBangla(FleetsDiff):
    def test_bangla_fleet_parses(self):
        self.check_fleet(
            'use bangla\n'
            'এজেন্ট scout\n'
            '    পারসোনা হয় "hi"\n'
            'দল crew সহ scout\n'
            '    জিজ্ঞেস scout "প্রশ্ন" রেখে উত্তর\n'
            'দেখাও crew\n',
            '[the sky is blue]\n',
            script="mind_fixed.py",
            label="bangla-fleet")


if __name__ == "__main__":
    unittest.main()
