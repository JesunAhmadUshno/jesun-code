"""Phase 2 tests: the Python bridge, minds and machines, zero leakage.

Sprint 4 migration (spec 9.2a): every program-behavior test is
differential-green. Each program runs through the bootstrap and through
jesun.jc as subprocesses; the walker leg must equal the bootstrap leg,
and the exact-output assertion stays on the bootstrap leg. Ask-ai tests
run with JESUNCODE_AI_COMMAND pointed at fixture minds, each leg with
its own MIND_COUNT_FILE.

Pinned exclusions (spec 9c): MindCommand (the mock changes platform
identity: os.name is patched) and MachinesLive (live tmux sessions;
the walker does not run terminals, spec 8.3.2).
Pinned divergences: MachinesNoTmux (the bootstrap's "tmux is not
installed" line vs the walker's honest later-phase line; both legs run
with tmux scrubbed from PATH so the bootstrap takes the no-tmux path)
and the `open terminal named 42` zero-leakage program (the bootstrap's
"type" error vs the walker's later-phase line). The zero-leakage
foreign-call program uses the spec 7.3 line normalizer (call-time
foreign failures report at the walker's bridge line).
"""

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from selfhost_harness import JESUN_JC, JESUN_PY  # noqa: E402
from selfhost_harness import LINE_RE, SelfHostDiffCase, run  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
AI_VAR = "JESUNCODE_AI_COMMAND"
COUNT_VAR = "MIND_COUNT_FILE"


def mind_command(script: str) -> str:
    """Build JESUNCODE_AI_COMMAND for a fixture, portable to Windows."""
    return '"{}" "{}"'.format(sys.executable, (FIXTURES / script).as_posix())


def calls_made(count_file: str) -> int:
    try:
        return int(Path(count_file).read_text().strip())
    except (OSError, ValueError):
        return 0


class P2Diff(SelfHostDiffCase):
    """Differential base with inline-program and mind-program runners."""

    def run_src(self, src, env=None):
        d = tempfile.mkdtemp(prefix="p2_prog_")
        try:
            p = os.path.join(d, "prog.jc")
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(src)
            boot = run([JESUN_PY, p], cwd=d, env=env)
            selfhost = run([JESUN_PY, JESUN_JC, p], cwd=d, env=env)
            return boot, selfhost
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def mind_env(self, script=None):
        tmp = tempfile.mkdtemp(prefix="p2_mind_")
        self.addCleanup(shutil.rmtree, tmp, True)
        env = dict(os.environ)
        if script is None:
            env.pop(AI_VAR, None)
        else:
            env[AI_VAR] = mind_command(script)
        env[COUNT_VAR] = os.path.join(tmp, "count")
        return env, env[COUNT_VAR]

    def check_mind(self, src, script, expected, label):
        env, _ = self.mind_env(script)
        boot, selfhost = self.run_src(src, env=env)
        self.assert_differential(boot, selfhost, label)
        self.assertEqual(boot[1], expected)
        return boot

    def check_mind_calls(self, src, script, expected, want_calls, label):
        boot, selfhost, counts = self.run_src_calls(src, script)
        self.assert_differential(boot, selfhost, label)
        self.assertEqual(boot[1], expected)
        self.assertEqual(counts[0], want_calls, "bootstrap mind call count")
        self.assertEqual(counts[1], want_calls, "walker mind call count")

    def run_src_calls(self, src, script):
        d = tempfile.mkdtemp(prefix="p2_prog_")
        try:
            p = os.path.join(d, "prog.jc")
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(src)
            outs, counts = [], []
            for args in ([JESUN_PY], [JESUN_PY, JESUN_JC]):
                env, count_file = self.mind_env(script)
                outs.append(run(args + [p], cwd=d, env=env))
                counts.append(calls_made(count_file))
            return outs[0], outs[1], counts
        finally:
            shutil.rmtree(d, ignore_errors=True)


class Bridge(P2Diff):
    def test_import_and_call(self):
        self.check_program(
            "import math\nshow math.sqrt(16)\nshow math.pi\n",
            "4\n3.141592653589793\n")

    def test_import_alias(self):
        self.check_program(
            "import random as chance\nshow chance.randint(1, 1)\n", "1\n")

    def test_dotted_module(self):
        self.check_program("import os.path\nshow os.path.sep\n",
                           os.sep + "\n")

    def test_kwargs(self):
        self.check_program(
            'names is ["b", "a"]\nimport builtins\n'
            "show builtins.sorted(names, reverse=true)\n",
            "[b, a]\n")

    def test_list_conversion(self):
        self.check_program(
            'import json\nx is json.loads("[1, 2, 3]")\nshow x[1]\n', "2\n")

    def test_dict_stays_foreign_but_usable(self):
        self.check_program(
            "import json\nd is json.loads('{{\"a\": 7}}')\nshow d[\"a\"]\n", "7\n")

    def test_missing_module_with_suggestion(self):
        self.check_program(
            "import jsoon\n",
            'Line 1: I could not find the Python package "jsoon".'
            ' Did you mean "json"?'
            " If it is a pip package, install it first: pip install jsoon\n")

    def test_missing_module_plain(self):
        self.check_program(
            "import zzzqqqk\n",
            'Line 1: I could not find the Python package "zzzqqqk".'
            " If it is a pip package, install it first: pip install zzzqqqk\n")

    def test_native_subscript(self):
        self.check_program(
            "x is [10, 20, 30]\nshow x[0]\nshow x[2]\nshow x[-1]\n",
            "10\n30\n30\n")

    def test_subscript_out_of_range(self):
        self.check_program(
            "x is [1]\nshow x[5]\n",
            "Line 2: position 5 is outside this a list of 1.\n")

    def test_foreign_object_shows_cleanly(self):
        self.check_program("import math\nshow math\n",
                           'the python module "math"\n')

    def test_foreign_call_error_is_plain_english(self):
        # Pinned spec 7.3 gap: call-time foreign failures report at the
        # walker's bridge line instead of the target line. Same message,
        # line normalized; the marker is required so a real divergence
        # still fails.
        boot, selfhost = self.run_src('import math\nshow math.sqrt("nope")\n')
        self.assertIn("the python call failed", boot[1])
        self.assertIn("the python call failed", selfhost[1])
        self.assertEqual(
            (selfhost[0], LINE_RE.sub("Line N", selfhost[1])),
            (boot[0], LINE_RE.sub("Line N", boot[1])),
            "foreign-call-error differs beyond the known 7.3 gap:\n"
            f"bootstrap={boot!r}\nselfhost={selfhost!r}")
        self.assertTrue(boot[1].startswith("Line 2: the python call failed: "))
        self.assertNotIn("TypeError", boot[1])

    def test_dot_on_native_value(self):
        boot, selfhost = self.run_src('x is "hi"\nshow x.upper\n')
        self.assert_differential(boot, selfhost, "dot-on-native")
        self.assertTrue(boot[1].startswith("Line 2: only python values use dots;"))

    def test_cannot_hand_function_to_python(self):
        boot, selfhost = self.run_src(
            "to f with x\n    show x\nimport builtins\nshow builtins.len(f)\n")
        self.assert_differential(boot, selfhost, "cannot-hand-function")
        self.assertIn("I cannot hand", boot[1])


class Minds(P2Diff):
    def test_ask_ai_fixed_answer(self):
        self.check_mind('ask ai "summarize" giving r\nshow r\n',
                        "mind_fixed.py", "the sky is blue\n", "ask-fixed")

    def test_ask_ai_with_tools(self):
        self.check_mind_calls(
            'to read_logs\n    give back "ERROR: disk full"\n'
            'ask ai "what is wrong" with tools [read_logs] giving answer\n'
            "show answer\n",
            "mind_tools.py", "the disk is full\n", 2, "ask-with-tools")

    def test_ask_ai_unknown_tool_fed_back(self):
        self.check_mind_calls(
            'to read_logs\n    give back "logs"\n'
            'ask ai "hi" with tools [read_logs] giving answer\n'
            "show answer\n",
            "mind_unknown_tool.py", "done\n", 2, "ask-unknown-tool")

    def test_ask_ai_steps_exhausted(self):
        self.check_mind(
            'to read_logs\n    give back "logs"\n'
            'ask ai "hi" with tools [read_logs] within 3 steps giving answer\n',
            "mind_never.py",
            "Line 3: the mind used all 3 steps without giving an answer.\n",
            "ask-steps-exhausted")

    def test_ask_ai_no_mind(self):
        self.check_mind(
            'ask ai "hi" giving r\n', None,
            "Line 1: no mind connected. Set JESUNCODE_AI_COMMAND to a command "
            "that reads a prompt and writes an answer, for example: "
            'export JESUNCODE_AI_COMMAND="ollama run llama3.1"\n',
            "ask-no-mind")

    def test_ask_ai_prompt_must_be_text(self):
        self.check_mind("ask ai 42 giving r\n", "mind_fixed.py",
                        "Line 1: the question I ask the mind must be text.\n",
                        "ask-prompt-must-be-text")


class MindCommand(unittest.TestCase):
    """Pinned exclusion (spec 9c): these tests patch os.name, changing
    platform identity. The walker twin runs on the real platform, so a
    differential twin cannot share the premise. The original
    bootstrap-only tests stay."""

    def _argv(self, command, os_name):
        import jesun  # noqa: E402
        from unittest import mock
        interp = jesun.Interpreter()
        with mock.patch("os.name", os_name):
            with mock.patch.dict(os.environ, {AI_VAR: command}):
                return interp._ai_argv(1)

    def test_windows_backslash_path_survives(self):
        argv = self._argv("C:\\tools\\ollama.exe run llama3.1", "nt")
        self.assertEqual(argv, ["C:\\tools\\ollama.exe", "run", "llama3.1"])

    def test_windows_quoted_path_with_spaces(self):
        argv = self._argv(
            '"C:\\Program Files\\mind\\mind.exe" --fast', "nt"
        )
        self.assertEqual(argv, ["C:\\Program Files\\mind\\mind.exe", "--fast"])

    def test_posix_quoting_still_works(self):
        argv = self._argv('"/opt/my mind/mind" run "hello world"', "posix")
        self.assertEqual(argv, ["/opt/my mind/mind", "run", "hello world"])


class MachinesLive(unittest.TestCase):
    """Pinned exclusion (spec 9c): live tmux sessions. The walker does not
    run terminals (spec 8.3.2); grammar shapes stay covered by the
    differential fuzzer at parse level."""

    @unittest.skip("live tmux is bootstrap-harness-only by design")
    def test_tmux_open_send_read_close(self):
        pass

    @unittest.skip("live tmux is bootstrap-harness-only by design")
    def test_tmux_no_such_terminal(self):
        pass

    @unittest.skip("live tmux is bootstrap-harness-only by design")
    def test_tmux_double_open(self):
        pass


class MachinesNoTmux(P2Diff):
    """Pinned divergence: with tmux scrubbed from PATH, the bootstrap
    takes its honest no-tmux path ("tmux is not installed"), while the
    walker gives its honest later-phase line (it parses terminals but
    never runs them, spec 8.3.2). Both messages are pinned exactly."""

    def test_tmux_missing_is_plain_english(self):
        empty_bin = tempfile.mkdtemp(prefix="p2_notmux_")
        try:
            env = dict(os.environ)
            env["PATH"] = empty_bin
            boot, selfhost = self.run_src('open terminal named "w"\n', env=env)
            self.assertEqual(
                boot[1],
                "Line 1: tmux is not installed. Install it first:"
                " sudo apt install tmux\n")
            self.assertEqual(
                selfhost[1],
                'Line 1: "open" is for a later phase; this interpreter'
                " does not speak it yet.\n")
            self.assertNotIn("Traceback", boot[1])
            self.assertNotIn("Traceback", selfhost[1])
        finally:
            shutil.rmtree(empty_bin, ignore_errors=True)


class ZeroLeakage(P2Diff):
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
        "show 1 / 0\n",
        "x is [1]\nshow x[5]\n",
        "bogusname\n",
        "import zzzqqqk\n",
        "import math\nshow math.nope\n",
        "if true then\nshow 1\n  show 2\n",
        "to f with a\n    give back a\nf with 1 and 2\n",
        "repeat 2.5 times\n    show 1\n",
        'x is "hi"\nshow x[10]\n',
    ]
    # Spec 7.3: call-time foreign failures report at the walker's bridge
    # line instead of the target line, so this program needs the line
    # normalizer before the byte comparison (both legs still banned-clean).
    FOREIGN_CALL_PROGRAM = 'import math\nshow math.sqrt("x")\n'
    # Pinned divergence: the walker parses terminals but never runs them
    # (spec 8.3.2), so it gives its later-phase line where the bootstrap
    # gives the terminal-name error. Both are banned-clean.
    TMUX_PROGRAM = 'open terminal named 42\n'

    def check_banned(self, out, program):
        for banned in self.BANNED:
            self.assertNotIn(
                banned, out, f"leaked {banned!r} from {program!r}: {out!r}")

    def test_no_leaked_internals(self):
        for program in self.BAD_PROGRAMS:
            with self.subTest(program=program):
                boot, selfhost = self.run_src(program)
                self.assert_differential(boot, selfhost, f"program {program!r}")
                self.check_banned(boot[1], program)
                self.check_banned(selfhost[1], program)

    def test_foreign_call_error_gap(self):
        program = self.FOREIGN_CALL_PROGRAM
        boot, selfhost = self.run_src(program)
        self.assertIn("the python call failed", boot[1])
        self.assertIn("the python call failed", selfhost[1])
        import re
        norm = lambda s: re.sub(r"Line \d+", "Line N", s)
        self.assertEqual(norm(selfhost[1]), norm(boot[1]),
                         f"foreign-call differs beyond the 7.3 gap: {boot!r} vs {selfhost!r}")
        self.check_banned(boot[1], program)
        self.check_banned(selfhost[1], program)

    def test_tmux_program_divergence(self):
        program = self.TMUX_PROGRAM
        boot, selfhost = self.run_src(program)
        self.assertEqual(boot[1], "Line 1: the terminal name must be text.\n")
        self.assertEqual(
            selfhost[1],
            'Line 1: "open" is for a later phase; this interpreter'
            " does not speak it yet.\n")
        self.check_banned(boot[1], program)
        self.check_banned(selfhost[1], program)


if __name__ == "__main__":
    unittest.main()
