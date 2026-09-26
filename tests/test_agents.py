"""v0.2 tests: agent blocks, ask <agent>, persona, tools, memory, steps.

Sprint 4 migration (spec 9.2a): every program test is differential-green.
Each program runs through the bootstrap and through jesun.jc as
subprocesses. Each interpreter leg gets its own temp dir holding its
own MIND_COUNT_FILE, MIND_PROMPT_FILE, and JESUN_CODE_HOME, so agent
memory and mind transcripts never leak across legs. The exact-output
assertion stays on the bootstrap leg; the walker leg must be
byte-identical. Saved prompt files are compared across legs where a
test inspects them.
"""

import os
import shutil
import sys
import tempfile
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
    """Build JESUNCODE_AI_COMMAND for a fixture mind, portable to Windows."""
    return '"{}" "{}"'.format(sys.executable, (FIXTURES / script).as_posix())


def calls_made(count_file: str) -> int:
    try:
        return int(Path(count_file).read_text().strip())
    except (OSError, ValueError):
        return 0


AGENT_SRC = (
    'to check_disk\n'
    '    give back "78% full"\n'
    'agent scout\n'
    '    persona is "You are a careful systems researcher. Be brief."\n'
    '    tools are [check_disk]\n'
    '    remember is true\n'
    '    steps are 15\n'
)


class AgentsDiff(SelfHostDiffCase):
    """Differential base: one hermetic leg dir per interpreter."""

    def leg_env(self, script=None):
        d = tempfile.mkdtemp(prefix="agents_leg_")
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

    def run_agent_src(self, src, script=None, stdin_text=None):
        d = tempfile.mkdtemp(prefix="agents_prog_")
        try:
            p = os.path.join(d, "prog.jc")
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(src)
            outs, prompt_files = [], []
            for args in ([JESUN_PY], [JESUN_PY, JESUN_JC]):
                env, paths = self.leg_env(script)
                outs.append(run(args + [p], cwd=d, stdin_text=stdin_text,
                                env=env))
                prompt_files.append(paths["prompt"])
            return outs[0], outs[1], prompt_files
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def check_agent(self, src, expected, script=None, stdin_text=None,
                    label=None):
        boot, selfhost, _ = self.run_agent_src(
            src, script=script, stdin_text=stdin_text)
        self.assert_differential(boot, selfhost, label or f"program {src!r}")
        self.assertEqual(boot[1], expected)
        return boot

    def read_prompt(self, prompt_file):
        try:
            return Path(prompt_file).read_text(encoding="utf-8")
        except OSError:
            return ""


class AgentBasics(AgentsDiff):
    def test_define_and_ask(self):
        self.check_agent(
            AGENT_SRC + 'ask scout "is the disk okay?" giving report\nshow report\n',
            "the sky is blue\n",
            script="mind_fixed.py",
            label="define-and-ask")

    def test_persona_reaches_mind(self):
        boot, selfhost, prompts = self.run_agent_src(
            AGENT_SRC + 'ask scout "hi" giving r\n', script="mind_save_prompt.py")
        self.assert_differential(boot, selfhost, "persona-reaches-mind")
        sent_boot = self.read_prompt(prompts[0])
        sent_selfhost = self.read_prompt(prompts[1])
        self.assertIn("You are a careful systems researcher. Be brief.",
                      sent_boot)
        self.assertEqual(sent_selfhost, sent_boot,
                         "walker leg sent a different prompt to the mind")

    def test_agent_shows_cleanly(self):
        self.check_agent(
            AGENT_SRC + "show scout\n",
            "<agent scout>\n",
            script="mind_fixed.py",
            label="agent-shows-cleanly")

    def test_defaults(self):
        self.check_agent(
            'agent plain\n'
            '    persona is "hi"\n'
            'ask plain "yo" giving r\n'
            "show r\n",
            "the sky is blue\n",
            script="mind_fixed.py",
            label="defaults")

    def test_classic_ask_still_works(self):
        self.check_agent(
            'question is "what is up"\nask question giving r\nshow r\n',
            "what is uptyped answer\n",
            stdin_text="typed answer\n",
            label="classic-ask-stdin")

    def test_unknown_agent_did_you_mean(self):
        self.check_agent(
            AGENT_SRC + 'ask scot "hi" giving r\n',
            'Line 8: I do not know an agent called "scot". Did you mean "scout"?\n',
            script="mind_fixed.py",
            label="unknown-agent-suggest")

    def test_ask_non_agent(self):
        self.check_agent(
            'to greet\n    show "hi"\nask greet "hi" giving r\n',
            'Line 3: "greet" is a function, not an agent.\n',
            script="mind_fixed.py",
            label="ask-non-agent")

    def test_bad_setting(self):
        self.check_agent(
            'agent a\n    colour is "red"\n',
            'Line 2: I do not know the agent setting "colour". '
            "I know: persona, tools, remember, steps, memory file.\n",
            label="bad-setting")

    def test_duplicate_setting(self):
        self.check_agent(
            'agent a\n    steps are 5\n    steps are 6\n',
            'Line 3: "steps" is already set for this agent.\n',
            label="duplicate-setting")

    def test_bad_steps(self):
        self.check_agent(
            'agent a\n    steps are 0\n',
            'Line 2: "steps" needs a whole number of steps, at least 1.\n',
            label="bad-steps")

    def test_bad_remember(self):
        boot, selfhost, _ = self.run_agent_src(
            'agent a\n    remember is maybe\n')
        self.assert_differential(boot, selfhost, "bad-remember")
        self.assertEqual(boot[1],
                         'Line 2: "remember" needs true, false, or always.\n')

    def test_block_required(self):
        self.check_agent(
            'agent a\n',
            "Line 2: an agent needs an indented block of settings.\n",
            label="block-required")


class AgentTools(AgentsDiff):
    def test_tool_called(self):
        d = tempfile.mkdtemp(prefix="agents_prog_")
        try:
            p = os.path.join(d, "prog.jc")
            src = (
                'to read_logs\n    give back "ERROR: disk full"\n'
                'agent watcher\n'
                '    tools are [read_logs]\n'
                'ask watcher "what is wrong" giving answer\n'
                "show answer\n"
            )
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(src)
            outs, counts = [], []
            for args in ([JESUN_PY], [JESUN_PY, JESUN_JC]):
                env, paths = self.leg_env("mind_tools.py")
                outs.append(run(args + [p], cwd=d, env=env))
                counts.append(calls_made(paths["count"]))
            boot, selfhost = outs
            self.assert_differential(boot, selfhost, "tool-called")
            self.assertEqual(boot[1], "the disk is full\n")
            self.assertEqual(counts[0], 2, "bootstrap mind call count")
            self.assertEqual(counts[1], 2, "walker mind call count")
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def test_unlisted_tool_blocked(self):
        boot, selfhost, _ = self.run_agent_src(
            'to secret\n    show "SECRET RAN"\n    give back "classified"\n'
            'to read_logs\n    give back "logs"\n'
            'agent watcher\n'
            '    tools are [read_logs]\n'
            'ask watcher "tell me secrets" giving answer\n'
            "show answer\n",
            script="mind_call_unknown.py")
        self.assert_differential(boot, selfhost, "unlisted-tool-blocked")
        self.assertEqual(boot[1], "fine, no secrets needed\n")
        self.assertNotIn("SECRET RAN", boot[1])
        self.assertNotIn("SECRET RAN", selfhost[1])

    def test_steps_exhausted_mentions_agent(self):
        self.check_agent(
            'to read_logs\n    give back "logs"\n'
            'agent watcher\n'
            '    tools are [read_logs]\n'
            '    steps are 2\n'
            'ask watcher "hi" giving answer\n',
            "Line 6: watcher used all 2 steps without giving an answer.\n",
            script="mind_never.py",
            label="steps-exhausted")


class AgentMemory(AgentsDiff):
    def check_history_counts(self, src, want, label):
        boot, selfhost, prompts = self.run_agent_src(
            src, script="mind_append_prompt.py")
        self.assert_differential(boot, selfhost, label)
        log_boot = self.read_prompt(prompts[0])
        log_selfhost = self.read_prompt(prompts[1])
        self.assertEqual(log_boot.count("first question"), want,
                         "bootstrap prompt log count")
        self.assertEqual(log_selfhost, log_boot,
                         "walker leg sent different prompts to the mind")

    def test_remember_true_carries_history(self):
        self.check_history_counts(
            AGENT_SRC
            + 'ask scout "first question" giving r1\n'
            + 'ask scout "second question" giving r2\n',
            2,
            "remember-true")

    def test_remember_false_is_isolated(self):
        self.check_history_counts(
            'agent goldfish\n'
            '    remember is false\n'
            'ask goldfish "first question" giving r1\n'
            'ask goldfish "second question" giving r2\n',
            1,
            "remember-false")


class AgentLeakage(AgentsDiff):
    BANNED = (
        "Traceback",
        'File "',
        "0x",
        "TypeError",
        "ValueError",
        "AttributeError",
        "KeyError",
        "IndexError",
        "ModuleNotFoundError",
        "ImportError",
        "Error:",
    )
    BAD_PROGRAMS = [
        'ask nobody "hi" giving r\n',
        'agent a\n    bogus is 1\n',
        'agent a\n    steps are -3\n',
        'show agent\n',
    ]

    def test_no_leak_on_agent_errors(self):
        for program in self.BAD_PROGRAMS:
            with self.subTest(program=program):
                boot, selfhost, _ = self.run_agent_src(program)
                self.assert_differential(boot, selfhost,
                                         f"program {program!r}")
                for out in (boot[1], selfhost[1]):
                    for banned in self.BANNED:
                        self.assertNotIn(
                            banned, out,
                            f"leaked {banned!r} from {program!r}: {out!r}")


if __name__ == "__main__":
    unittest.main()
