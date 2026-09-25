"""v0.6 tests: fleet blocks, parallel asks, shared memory, errors."""
import os
import sys
import tempfile
import time
import unittest
from contextlib import contextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import jesun  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
AI_VAR = "JESUNCODE_AI_COMMAND"
COUNT_VAR = "MIND_COUNT_FILE"
PROMPT_VAR = "MIND_PROMPT_FILE"


def mind_command(script: str) -> str:
    return '"{}" "{}"'.format(sys.executable, (FIXTURES / script).as_posix())


@contextmanager
def mind(script: str):
    count = tempfile.NamedTemporaryFile(delete=False)
    count.close()
    prompt = tempfile.NamedTemporaryFile(delete=False)
    prompt.close()
    old = {k: os.environ.get(k) for k in (AI_VAR, COUNT_VAR, PROMPT_VAR)}
    os.environ[AI_VAR] = mind_command(script)
    os.environ[COUNT_VAR] = count.name
    os.environ[PROMPT_VAR] = prompt.name
    try:
        yield prompt.name
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        os.unlink(count.name)
        os.unlink(prompt.name)


SCOUT_CRITIC = (
    'agent scout\n'
    '    persona is "You are a careful systems researcher. Be brief."\n'
    'agent critic\n'
    '    persona is "You are a skeptical reviewer. Be brief."\n'
)


class FleetBasics(unittest.TestCase):
    def test_two_asks_in_order(self):
        with mind("mind_fixed.py"):
            out = jesun.execute(
                SCOUT_CRITIC +
                'fleet crew with scout and critic\n'
                '    ask scout "is the disk okay?" giving disk_report\n'
                '    ask critic "is the memory okay?" giving mem_report\n'
                'show crew\n'
                'show disk_report\n'
                'show mem_report\n'
            )
        self.assertEqual(
            out,
            '[the sky is blue, the sky is blue]\n'
            "the sky is blue\n"
            "the sky is blue\n",
        )

    def test_single_member_fleet(self):
        with mind("mind_fixed.py"):
            out = jesun.execute(
                SCOUT_CRITIC +
                'fleet solo with scout\n'
                '    ask scout "hi" giving r\n'
                'show solo\n'
            )
        self.assertEqual(out, '[the sky is blue]\n')

    def test_same_agent_twice(self):
        with mind("mind_fixed.py"):
            out = jesun.execute(
                SCOUT_CRITIC +
                'fleet crew with scout and scout\n'
                '    ask scout "first" giving a\n'
                '    ask scout "second" giving b\n'
                'show crew\n'
            )
        self.assertEqual(out, '[the sky is blue, the sky is blue]\n')

    def test_prompt_evaluated_in_enclosing_scope(self):
        with mind("mind_save_prompt.py") as prompt_file:
            jesun.execute(
                SCOUT_CRITIC +
                'question is "disk?"\n'
                'fleet crew with scout\n'
                '    ask scout question giving a\n'
            )
            sent = Path(prompt_file).read_text()
        self.assertIn("disk?", sent)


class FleetParallel(unittest.TestCase):
    def test_asks_run_side_by_side(self):
        with mind("mind_sleep.py"):
            start = time.monotonic()
            out = jesun.execute(
                SCOUT_CRITIC +
                'fleet crew with scout and critic\n'
                '    ask scout "one" giving a\n'
                '    ask critic "two" giving b\n'
                'show crew\n'
            )
            wall = time.monotonic() - start
        self.assertEqual(out, '[done sleeping, done sleeping]\n')
        # Serial would take ~4s; parallel takes ~2s.
        self.assertLess(wall, 3.2, f"fleet asks did not run in parallel: {wall:.2f}s")


class FleetErrors(unittest.TestCase):
    def test_non_member_ask(self):
        out = jesun.execute(
            SCOUT_CRITIC +
            'fleet crew with scout\n'
            '    ask critic "hi" giving r\n'
        )
        self.assertEqual(
            out, 'Line 6: "critic" is not a member of fleet "crew".\n')

    def test_unknown_member_suggests(self):
        out = jesun.execute(
            'agent scout\n'
            '    persona is "hi"\n'
            'fleet crew with scot\n'
            '    ask scot "hi" giving r\n'
        )
        self.assertIn('I do not know an agent called "scot".', out)
        self.assertIn("scout", out)

    def test_streaming_forbidden(self):
        out = jesun.execute(
            SCOUT_CRITIC +
            'fleet crew with scout\n'
            '    ask scout "hi" giving r streaming\n'
        )
        self.assertEqual(
            out, 'Line 6: streaming asks cannot run in a fleet; '
                 'take "streaming" out.\n')

    def test_duplicate_memory_file(self):
        out = jesun.execute(
            SCOUT_CRITIC +
            'fleet crew with scout\n'
            '    memory file is "a.json"\n'
            '    memory file is "b.json"\n'
            '    ask scout "hi" giving r\n'
        )
        self.assertEqual(
            out, 'Line 7: "memory file" is already set for this fleet.\n')

    def test_block_required(self):
        out = jesun.execute('fleet crew with scout\n')
        self.assertEqual(
            out, "Line 2: a fleet needs an indented block of asks.\n")

    def test_unknown_fleet_line(self):
        out = jesun.execute(
            SCOUT_CRITIC +
            'fleet crew with scout\n'
            '    dance\n'
        )
        self.assertIn("I do not know the fleet line", out)

    def test_failing_ask_fails_the_fleet(self):
        with mind("mind_fails.py"):
            out = jesun.execute(
                SCOUT_CRITIC +
                'fleet crew with scout and critic\n'
                '    ask scout "one" giving a\n'
                '    ask critic "two" giving b\n'
                'show crew\n'
            )
        self.assertIn("the mind exited with an error.", out)
        self.assertNotIn("[", out)  # the fleet list never gets set

    def test_no_partial_results_on_failure(self):
        with mind("mind_fails.py"):
            out = jesun.execute(
                SCOUT_CRITIC +
                'fleet crew with scout\n'
                '    ask scout "one" giving a\n'
                'show crew\n'
            )
        self.assertIn("the mind exited with an error.", out)
        self.assertNotIn("done", out)

    def test_no_mind_connected(self):
        old = os.environ.pop(AI_VAR, None)
        try:
            out = jesun.execute(
                SCOUT_CRITIC +
                'fleet crew with scout\n'
                '    ask scout "hi" giving r\n'
            )
        finally:
            if old is not None:
                os.environ[AI_VAR] = old
        self.assertIn("no mind connected", out)

    def test_fleet_cannot_nest_in_asks(self):
        # The guard fires in plain English; the tool loop feeds it back
        # to the mind as the tool's result, per the agentic contract.
        with mind("mind_probe_always.py") as prompt_file:
            out = jesun.execute(
                'to probe\n'
                '    fleet inner with scout\n'
                '        ask scout "deep" giving d\n'
                '    give back "probed"\n'
                'agent scout\n'
                '    tools are [probe]\n'
                'fleet crew with scout\n'
                '    ask scout "hello" giving r\n'
                'show r\n'
            )
            sent = Path(prompt_file).read_text()
        self.assertIn("a fleet cannot open inside another fleet's asks.", sent)
        self.assertIn("noted, no more tools", out)


class FleetMemory(unittest.TestCase):
    def test_shared_memory_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            mem = str(Path(tmp) / "crew.json")
            with mind("mind_fixed.py"):
                jesun.execute(
                    SCOUT_CRITIC +
                    'fleet crew with scout and critic\n'
                    f'    memory file is "{mem}"\n'
                    '    ask scout "is the disk okay?" giving a\n'
                    '    ask critic "is the memory okay?" giving b\n'
                )
            saved = Path(mem).read_text(encoding="utf-8")
            self.assertIn("is the disk okay?", saved)
            self.assertIn("scout", saved)
            self.assertIn("critic", saved)
            import json as _json
            triples = _json.loads(saved)
            # Documented order: (question, answer, agent), in ask order.
            self.assertEqual(triples[0],
                             ["is the disk okay?", "the sky is blue", "scout"])
            self.assertEqual(triples[1],
                             ["is the memory okay?", "the sky is blue", "critic"])
            with mind("mind_save_prompt.py") as prompt_file:
                jesun.execute(
                    SCOUT_CRITIC +
                    'fleet crew with scout and critic\n'
                    f'    memory file is "{mem}"\n'
                    '    ask scout "and now?" giving a\n'
                )
                sent = Path(prompt_file).read_text()
            self.assertIn("The fleet remembers:", sent)
            self.assertIn(
                '- scout was asked "is the disk okay?" '
                'and answered "the sky is blue"',
                sent,
            )
            self.assertIn("the sky is blue", sent)

    def test_member_histories_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            mem = str(Path(tmp) / "crew.json")
            with mind("mind_fixed.py"):
                interp = jesun.Interpreter()
                jesun.run_source(
                    'agent scout\n'
                    '    persona is "hi"\n'
                    '    remember is true\n'
                    'fleet crew with scout\n'
                    f'    memory file is "{mem}"\n'
                    '    ask scout "hi" giving r\n',
                    interp,
                )
                scout = interp.global_env.get("scout", 1)
            self.assertEqual(scout.history, [("hi", "the sky is blue")])

    def test_unreadable_memory_starts_fresh(self):
        with tempfile.TemporaryDirectory() as tmp:
            mem = Path(tmp) / "crew.json"
            mem.write_text("not json at all", encoding="utf-8")
            with mind("mind_fixed.py"):
                out = jesun.execute(
                    SCOUT_CRITIC +
                    'fleet crew with scout\n'
                    f'    memory file is "{mem.as_posix()}"\n'
                    '    ask scout "hi" giving r\n'
                    'show r\n'
                )
        self.assertIn("starting fresh", out)
        self.assertIn("the sky is blue", out)


class FleetBangla(unittest.TestCase):
    def test_bangla_fleet_parses(self):
        with mind("mind_fixed.py"):
            out = jesun.execute(
                'use bangla\n'
                'এজেন্ট scout\n'
                '    পারসোনা হয় "hi"\n'
                'দল crew সহ scout\n'
                '    জিজ্ঞেস scout "প্রশ্ন" রেখে উত্তর\n'
                'দেখাও crew\n'
            )
        self.assertEqual(out, '[the sky is blue]\n')


if __name__ == "__main__":
    unittest.main()
