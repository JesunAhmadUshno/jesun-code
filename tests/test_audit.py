"""Audit regression tests: bugs found by the audit/fuzz, plus new built-ins.

Sprint 4 migration (spec 9.2a): every program test is differential-green.
Each program runs through the bootstrap and through jesun.jc as
subprocesses (mind fixtures via JESUNCODE_AI_COMMAND with a fresh
per-leg MIND_COUNT_FILE, so mind transcripts never leak across legs).
The exact-output assertion stays on the bootstrap leg; the walker leg
must be byte-identical.

Pinned exclusions (spec 9.2c):
- ReplBehavior (6 tests): the REPL is the bootstrap's interactive loop;
  the walker has no REPL (out of scope: the spec covers running
  programs, section 2.2).
- test_keyboard_interrupt_in_main_is_plain: mocks SIGINT delivery;
  bootstrap-harness-only.
- test_tool_call_deeply_nested_parens_is_plain_english: calls the
  bootstrap's _parse_call_args directly (unit test of interpreter
  internals, not a program).
"""

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from selfhost_harness import JESUN_JC, JESUN_PY  # noqa: E402
from selfhost_harness import SelfHostDiffCase, run  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
AI_VAR = "JESUNCODE_AI_COMMAND"
COUNT_VAR = "MIND_COUNT_FILE"


def mind_command(script: str) -> str:
    """Build JESUNCODE_AI_COMMAND for a fixture mind, portable to Windows."""
    return '"{}" "{}"'.format(sys.executable, (FIXTURES / script).as_posix())


class AuditDiff(SelfHostDiffCase):
    """Hermetic per-leg runs: own count file, own working folder."""

    def run_legs(self, src, script=None):
        outs = []
        for args in ([JESUN_PY], [JESUN_PY, JESUN_JC]):
            d = tempfile.mkdtemp(prefix="audit_leg_")
            self.addCleanup(shutil.rmtree, d, True)
            env = dict(os.environ)
            if script is None:
                env.pop(AI_VAR, None)
            else:
                env[AI_VAR] = mind_command(script)
            count = os.path.join(d, "count")
            open(count, "w", encoding="utf-8").close()
            env[COUNT_VAR] = count
            prog = os.path.join(d, "prog.jc")
            mode = "wb" if isinstance(src, bytes) else "w"
            with open(prog, mode) as handle:
                handle.write(src)
            outs.append(run(args + [prog], cwd=d, env=env))
        return tuple(outs)

    def run_both(self, src, script=None):
        boot, selfhost = self.run_legs(src, script)
        return boot, selfhost


class AuditBugs(AuditDiff):
    def test_ai_stderr_traceback_sanitized(self):
        boot, selfhost = self.run_both('ask ai "hi" giving r\n',
                                       script="mind_traceback.py")
        self.assert_differential(boot, selfhost, "ai-stderr-sanitized")
        self.assertEqual(boot[1], "Line 1: the mind exited with an error.\n")
        self.assertNotIn("Traceback", boot[1])
        self.assertNotIn("ValueError", boot[1])

    def test_mind_cannot_call_unlisted_tool(self):
        boot, selfhost = self.run_both(
            'to listed\n    give back "ok"\n'
            'to secret\n    give back "CLASSIFIED"\n'
            'ask ai "hi" with tools [listed] giving answer\n'
            "show answer\n",
            script="mind_sneaky.py")
        self.assert_differential(boot, selfhost, "unlisted-tool")
        self.assertEqual(boot[1], "done\n")

    def test_function_type_name_in_bridge_error(self):
        boot, selfhost = self.run_both(
            "to f with x\n    show x\nimport builtins\nshow builtins.len(f)\n")
        self.assert_differential(boot, selfhost, "function-to-bridge")
        self.assertIn("I cannot hand function to Python.", boot[1])

    def test_bom_is_ignored(self):
        boot, selfhost = self.run_both("﻿show 1\n".encode("utf-8-sig"))
        self.assert_differential(boot, selfhost, "bom")
        self.assertEqual(boot[1], "1\n")

    def test_crlf_line_endings(self):
        boot, selfhost = self.run_both(
            b'x is 5\r\nshow x\r\nif x is 5 then\r\n    show "y"\r\n')
        self.assert_differential(boot, selfhost, "crlf")
        self.assertEqual(boot[1], "5\ny\n")

    def test_empty_file(self):
        boot, selfhost = self.run_both("")
        self.assert_differential(boot, selfhost, "empty")
        self.assertEqual(boot[1], "")
        boot, selfhost = self.run_both("\n\n  \n")
        self.assert_differential(boot, selfhost, "empty-whitespace")
        self.assertEqual(boot[1], "")

    def test_unicode_strings(self):
        boot, selfhost = self.run_both(
            'show "héllo wörld 中"\nshow length of "héllo"\n')
        self.assert_differential(boot, selfhost, "unicode")
        self.assertEqual(boot[1], "héllo wörld 中\n5\n")

    def test_huge_numbers(self):
        boot, selfhost = self.run_both(
            "show 999999999999999999999 * 999999999999999999999\n")
        self.assert_differential(boot, selfhost, "huge-numbers")
        self.assertEqual(
            boot[1], "999999999999999999998000000000000000000001\n")


class AuditExcluded(unittest.TestCase):
    """Pinned exclusions (spec 9.2c): unit tests of bootstrap internals
    or platform behavior the walker twin cannot share. The original
    bootstrap-only tests stay."""

    def test_tool_call_deeply_nested_parens_is_plain_english(self):
        import jesun
        interp = jesun.Interpreter()
        with self.assertRaises(jesun.JesunError) as ctx:
            interp._parse_call_args("(" * 5000, 7)
        self.assertIn("too deep", str(ctx.exception))

    def test_keyboard_interrupt_in_main_is_plain(self):
        from contextlib import redirect_stdout
        from io import StringIO
        import jesun
        with tempfile.NamedTemporaryFile(
                mode="w", suffix=".jc", delete=False) as tmp:
            tmp.write('show 1\n')
            path = tmp.name
        buf = StringIO()
        try:
            with mock.patch.object(
                    jesun, "run_source", side_effect=KeyboardInterrupt), \
                    redirect_stdout(buf):
                code = jesun.main([path])
        finally:
            os.unlink(path)
        self.assertEqual(code, 130)
        self.assertIn("Stopped.", buf.getvalue())


class ReplBehavior(unittest.TestCase):
    """Pinned exclusion (spec 9.2c): the REPL is the bootstrap's
    interactive loop; the walker has no REPL. The original tests stay."""

    def run_repl(self, lines):
        from contextlib import redirect_stdout
        from io import StringIO
        import jesun
        it = iter(lines)
        buf = StringIO()
        with mock.patch("builtins.input",
                        side_effect=lambda _p="": next(it)), \
                redirect_stdout(buf):
            try:
                jesun.repl()
            except StopIteration:
                pass
        return buf.getvalue()

    def test_multiline_block(self):
        out = self.run_repl(
            ['if true then', '    show "a"', '    show "b"', "", ""])
        self.assertIn("a\nb\n", out)

    def test_single_line_runs_immediately(self):
        out = self.run_repl(["show 40 + 2", ""])
        self.assertIn("42\n", out)

    def test_repl_error_is_plain_english(self):
        out = self.run_repl(["show zebra", ""])
        self.assertIn('Line 1: I do not know the word "zebra".', out)

    def test_repl_give_back_translated(self):
        out = self.run_repl(["give back 1", ""])
        self.assertIn('"give back" only makes sense inside a function.', out)

    def test_repl_stop_translated(self):
        out = self.run_repl(["stop", ""])
        self.assertIn('"stop" only makes sense inside a loop.', out)

    def test_repl_bad_indent_shows_error(self):
        out = self.run_repl(["if true then", "show 1", "", ""])
        self.assertIn("I expected an indented block here.", out)


class NewBuiltins(AuditDiff):
    def test_split(self):
        boot, selfhost = self.run_both('show split of "a,b,c" by ","\n')
        self.assert_differential(boot, selfhost, "split")
        self.assertEqual(boot[1], "[a, b, c]\n")

    def test_split_needs_nonempty_by(self):
        boot, selfhost = self.run_both('show split of "abc" by ""\n')
        self.assert_differential(boot, selfhost, "split-empty-by")
        self.assertEqual(
            boot[1], 'Line 1: "split of" needs a non-empty "by" text.\n')

    def test_split_needs_text(self):
        boot, selfhost = self.run_both('show split of 42 by ","\n')
        self.assert_differential(boot, selfhost, "split-needs-text")
        self.assertEqual(boot[1], 'Line 1: "split of" needs text.\n')

    def test_join(self):
        boot, selfhost = self.run_both('show join of ["a", "b"] with " and "\n')
        self.assert_differential(boot, selfhost, "join")
        self.assertEqual(boot[1], "a and b\n")

    def test_join_of_variable_operand(self):
        # Regression: the with keyword belongs to the built-in, not to a
        # call on the operand. Used to fail with: I expected "with" here.
        boot, selfhost = self.run_both(
            'words is ["a", "b"]\nshow join of words with "-"\n')
        self.assert_differential(boot, selfhost, "join-variable-operand")
        self.assertEqual(boot[1], "a-b\n")

    def test_split_of_variable_operand(self):
        boot, selfhost = self.run_both(
            'csv is "a,b"\nshow split of csv by ","\n')
        self.assert_differential(boot, selfhost, "split-variable-operand")
        self.assertEqual(boot[1], "[a, b]\n")

    def test_join_of_call_result_operand(self):
        # A call's result works as an operand when parenthesized.
        boot, selfhost = self.run_both(
            'to shout with word\n'
            '    give back [word, word]\n'
            'show join of (shout with "hey") with "-"\n')
        self.assert_differential(boot, selfhost, "join-call-operand")
        self.assertEqual(boot[1], "hey-hey\n")

    def test_join_needs_list_of_text(self):
        boot, selfhost = self.run_both('show join of [1, 2] with ","\n')
        self.assert_differential(boot, selfhost, "join-needs-list-of-text")
        self.assertEqual(boot[1], 'Line 1: "join of" needs a list of text.\n')

    def test_trim(self):
        boot, selfhost = self.run_both('show trim of "  hi  "\n')
        self.assert_differential(boot, selfhost, "trim")
        self.assertEqual(boot[1], "hi\n")

    def test_keys_of_foreign_dict(self):
        # Note the doubled braces: {{ }} is Jesun.Code brace-escaping
        # for a literal { } inside a string (the walker reads the same
        # source, so the same rule applies on both legs).
        boot, selfhost = self.run_both(
            "import json\nd is json.loads('{{\"a\": 1}}')\n"
            "show keys of d\n")
        self.assert_differential(boot, selfhost, "keys-of-foreign-dict")
        self.assertEqual(boot[1], "[a]\n")

    def test_keys_of_non_dict(self):
        boot, selfhost = self.run_both('show keys of "hi"\n')
        self.assert_differential(boot, selfhost, "keys-of-non-dict")
        self.assertEqual(
            boot[1], 'Line 1: "keys of" needs a python dictionary.\n')

    def test_suggest_prefix_match(self):
        boot, selfhost = self.run_both('name is "Jesun"\nshow nam\n')
        self.assert_differential(boot, selfhost, "suggest-prefix")
        self.assertIn('Did you mean "name"?', boot[1])

    def test_suggest_still_fixes_typos(self):
        boot, selfhost = self.run_both('name is "Jesun"\nshow naem\n')
        self.assert_differential(boot, selfhost, "suggest-typo")
        self.assertIn('Did you mean "name"?', boot[1])


if __name__ == "__main__":
    unittest.main()
