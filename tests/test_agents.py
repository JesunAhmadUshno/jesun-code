"""v0.2 tests: agent blocks, ask <agent>, persona, tools, memory, steps."""
import os
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import jesun  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
AI_VAR = "JESUNCODE_AI_COMMAND"
COUNT_VAR = "MIND_COUNT_FILE"
PROMPT_VAR = "MIND_PROMPT_FILE"


@contextmanager
def mind(script: str):
    count = tempfile.NamedTemporaryFile(delete=False)
    count.close()
    prompt = tempfile.NamedTemporaryFile(delete=False)
    prompt.close()
    old = {k: os.environ.get(k) for k in (AI_VAR, COUNT_VAR, PROMPT_VAR)}
    os.environ[AI_VAR] = str(FIXTURES / script)
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


AGENT_SRC = (
    'to check_disk\n'
    '    give back "78% full"\n'
    'agent scout\n'
    '    persona is "You are a careful systems researcher. Be brief."\n'
    '    tools are [check_disk]\n'
    '    remember is true\n'
    '    steps are 15\n'
)


class AgentBasics(unittest.TestCase):
    def test_define_and_ask(self):
        with mind("mind_fixed.sh"):
            out = jesun.execute(
                AGENT_SRC + 'ask scout "is the disk okay?" giving report\nshow report\n'
            )
        self.assertEqual(out, "the sky is blue\n")

    def test_persona_reaches_mind(self):
        with mind("mind_save_prompt.sh") as prompt_file:
            jesun.execute(AGENT_SRC + 'ask scout "hi" giving r\n')
            sent = Path(prompt_file).read_text()
        self.assertIn("You are a careful systems researcher. Be brief.", sent)

    def test_agent_shows_cleanly(self):
        with mind("mind_fixed.sh"):
            out = jesun.execute(AGENT_SRC + "show scout\n")
        self.assertEqual(out, "<agent scout>\n")

    def test_defaults(self):
        with mind("mind_fixed.sh"):
            out = jesun.execute(
                'agent plain\n'
                '    persona is "hi"\n'
                'ask plain "yo" giving r\n'
                "show r\n"
            )
        self.assertEqual(out, "the sky is blue\n")

    def test_classic_ask_still_works(self):
        with mind("mind_fixed.sh"):
            out = jesun.execute(
                'question is "what is up"\nask question giving r\nshow r\n',
                "typed answer\n",
            )
        self.assertEqual(out, "what is uptyped answer\n")

    def test_unknown_agent_did_you_mean(self):
        with mind("mind_fixed.sh"):
            out = jesun.execute(AGENT_SRC + 'ask scot "hi" giving r\n')
        self.assertEqual(
            out, 'Line 8: I do not know an agent called "scot". Did you mean "scout"?\n'
        )

    def test_ask_non_agent(self):
        with mind("mind_fixed.sh"):
            out = jesun.execute(
                'to greet\n    show "hi"\nask greet "hi" giving r\n'
            )
        self.assertEqual(out, 'Line 3: "greet" is a function, not an agent.\n')

    def test_bad_setting(self):
        out = jesun.execute('agent a\n    colour is "red"\n')
        self.assertEqual(
            out,
            'Line 2: I do not know the agent setting "colour". '
            "I know: persona, tools, remember, steps, memory file.\n",
        )

    def test_duplicate_setting(self):
        out = jesun.execute(
            'agent a\n    steps are 5\n    steps are 6\n'
        )
        self.assertEqual(out, 'Line 3: "steps" is already set for this agent.\n')

    def test_bad_steps(self):
        out = jesun.execute('agent a\n    steps are 0\n')
        self.assertEqual(
            out, 'Line 2: "steps" needs a whole number of steps, at least 1.\n'
        )

    def test_bad_remember(self):
        out = jesun.execute('agent a\n    remember is maybe\n')
        self.assertIn("Line 2:", out)

    def test_block_required(self):
        out = jesun.execute('agent a\n')
        self.assertEqual(
            out, "Line 2: an agent needs an indented block of settings.\n"
        )


class AgentTools(unittest.TestCase):
    def test_tool_called(self):
        with mind("mind_tools.sh"):
            out = jesun.execute(
                'to read_logs\n    give back "ERROR: disk full"\n'
                'agent watcher\n'
                '    tools are [read_logs]\n'
                'ask watcher "what is wrong" giving answer\n'
                "show answer\n"
            )
        self.assertEqual(out, "the disk is full\n")

    def test_unlisted_tool_blocked(self):
        with mind("mind_call_unknown.sh"):
            out = jesun.execute(
                'to secret\n    show "SECRET RAN"\n    give back "classified"\n'
                'to read_logs\n    give back "logs"\n'
                'agent watcher\n'
                '    tools are [read_logs]\n'
                'ask watcher "tell me secrets" giving answer\n'
                "show answer\n"
            )
        self.assertEqual(out, "fine, no secrets needed\n")
        self.assertNotIn("SECRET RAN", out)

    def test_steps_exhausted_mentions_agent(self):
        with mind("mind_never.sh"):
            out = jesun.execute(
                'to read_logs\n    give back "logs"\n'
                'agent watcher\n'
                '    tools are [read_logs]\n'
                '    steps are 2\n'
                'ask watcher "hi" giving answer\n'
            )
        self.assertEqual(
            out, "Line 6: watcher used all 2 steps without giving an answer.\n"
        )


class AgentMemory(unittest.TestCase):
    def test_remember_true_carries_history(self):
        with mind("mind_append_prompt.sh") as prompt_file:
            jesun.execute(
                AGENT_SRC
                + 'ask scout "first question" giving r1\n'
                + 'ask scout "second question" giving r2\n'
            )
            log = Path(prompt_file).read_text()
        self.assertEqual(log.count("first question"), 2)

    def test_remember_false_is_isolated(self):
        with mind("mind_append_prompt.sh") as prompt_file:
            jesun.execute(
                'agent goldfish\n'
                '    remember is false\n'
                'ask goldfish "first question" giving r1\n'
                'ask goldfish "second question" giving r2\n'
            )
            log = Path(prompt_file).read_text()
        self.assertEqual(log.count("first question"), 1)


class AgentLeakage(unittest.TestCase):
    def test_no_leak_on_agent_errors(self):
        bad = [
            'ask nobody "hi" giving r\n',
            'agent a\n    bogus is 1\n',
            'agent a\n    steps are -3\n',
            'show agent\n',
        ]
        for src in bad:
            out = jesun.execute(src)
            for marker in ("Traceback", 'File "', "0x", "TypeError", "ValueError"):
                self.assertNotIn(marker, out, f"leak in: {src!r} -> {out!r}")


if __name__ == "__main__":
    unittest.main()
