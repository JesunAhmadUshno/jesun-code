"""Audit regression tests: bugs found by the audit/fuzz, plus new built-ins.

Each test here pins a specific bug fix. See the audit report for details.
"""
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import jesun  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
AI_VAR = "JESUNCODE_AI_COMMAND"
COUNT_VAR = "MIND_COUNT_FILE"


def with_env(**extra):
    old = dict(os.environ)
    os.environ.update(extra)
    return old


def restore_env(old):
    os.environ.clear()
    os.environ.update(old)


def run_mind(script, src):
    count = tempfile.NamedTemporaryFile(delete=False)
    count.close()
    old = with_env(**{AI_VAR: str(FIXTURES / script), COUNT_VAR: count.name})
    try:
        return jesun.execute(src, "")
    finally:
        restore_env(old)
        os.unlink(count.name)


def run_repl(lines):
    """Feed lines to the REPL; return everything printed."""
    it = iter(lines)
    buf = StringIO()
    with mock.patch("builtins.input", side_effect=lambda _p="": next(it)), \
            redirect_stdout(buf):
        try:
            jesun.repl()
        except StopIteration:
            pass
    return buf.getvalue()


class AuditBugs(unittest.TestCase):
    def test_ai_stderr_traceback_sanitized(self):
        out = run_mind("mind_traceback.sh", 'ask ai "hi" giving r\n')
        self.assertEqual(out, "Line 1: the mind exited with an error.\n")
        self.assertNotIn("Traceback", out)
        self.assertNotIn("ValueError", out)

    def test_tool_call_deeply_nested_parens_is_plain_english(self):
        interp = jesun.Interpreter()
        with self.assertRaises(jesun.JesunError) as ctx:
            interp._parse_call_args("(" * 5000, 7)
        self.assertIn("too deep", str(ctx.exception))

    def test_mind_cannot_call_unlisted_tool(self):
        out = run_mind(
            "mind_sneaky.sh",
            'to listed\n    give back "ok"\n'
            'to secret\n    give back "CLASSIFIED"\n'
            'ask ai "hi" with tools [listed] giving answer\n'
            "show answer\n",
        )
        self.assertEqual(out, "done\n")

    def test_function_type_name_in_bridge_error(self):
        out = jesun.execute(
            "to f\n    show 1\nimport builtins\nshow builtins.len(f)\n"
        )
        self.assertIn("I cannot hand function to Python.", out)

    def test_bom_is_ignored(self):
        self.assertEqual(jesun.execute("\ufeffshow 1\n"), "1\n")

    def test_keyboard_interrupt_in_main_is_plain(self):
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

    def test_crlf_line_endings(self):
        self.assertEqual(
            jesun.execute('x is 5\r\nshow x\r\nif x is 5 then\r\n    show "y"\r\n'),
            "5\ny\n",
        )

    def test_empty_file(self):
        self.assertEqual(jesun.execute(""), "")
        self.assertEqual(jesun.execute("\n\n  \n"), "")

    def test_unicode_strings(self):
        out = jesun.execute('show "héllo wörld 中"\nshow length of "héllo"\n')
        self.assertEqual(out, "héllo wörld 中\n5\n")

    def test_huge_numbers(self):
        out = jesun.execute("show 999999999999999999999 * 999999999999999999999\n")
        self.assertEqual(out, "999999999999999999998000000000000000000001\n")


class ReplBehavior(unittest.TestCase):
    def test_multiline_block(self):
        out = run_repl(['if true then', '    show "a"', '    show "b"', "", ""])
        self.assertIn("a\nb\n", out)

    def test_single_line_runs_immediately(self):
        out = run_repl(["show 40 + 2", ""])
        self.assertIn("42\n", out)

    def test_repl_error_is_plain_english(self):
        out = run_repl(["show zebra", ""])
        self.assertIn('Line 1: I do not know the word "zebra".', out)

    def test_repl_give_back_translated(self):
        out = run_repl(["give back 1", ""])
        self.assertIn('"give back" only makes sense inside a function.', out)

    def test_repl_stop_translated(self):
        out = run_repl(["stop", ""])
        self.assertIn('"stop" only makes sense inside a loop.', out)

    def test_repl_bad_indent_shows_error(self):
        out = run_repl(["if true then", "show 1", "", ""])
        self.assertIn("I expected an indented block here.", out)


class NewBuiltins(unittest.TestCase):
    def test_split(self):
        self.assertEqual(
            jesun.execute('show split of "a,b,c" by ","\n'), "[a, b, c]\n"
        )

    def test_split_needs_nonempty_by(self):
        out = jesun.execute('show split of "abc" by ""\n')
        self.assertEqual(out, 'Line 1: "split of" needs a non-empty "by" text.\n')

    def test_split_needs_text(self):
        out = jesun.execute("show split of 42 by \",\"\n")
        self.assertEqual(out, 'Line 1: "split of" needs text.\n')

    def test_join(self):
        self.assertEqual(
            jesun.execute('show join of ["a", "b"] with " and "\n'), "a and b\n"
        )

    def test_join_of_variable_operand(self):
        # Regression: the with keyword belongs to the built-in, not to a
        # call on the operand. Used to fail with: I expected "with" here.
        out = jesun.execute('words is ["a", "b"]\nshow join of words with "-"\n')
        self.assertEqual(out, "a-b\n")

    def test_split_of_variable_operand(self):
        out = jesun.execute('text is "a,b"\nshow split of text by ","\n')
        self.assertEqual(out, "[a, b]\n")

    def test_join_of_call_result_operand(self):
        # A call's result works as an operand when parenthesized.
        out = jesun.execute(
            'to shout with word\n'
            '    give back [word, word]\n'
            'show join of (shout with "hey") with "-"\n'
        )
        self.assertEqual(out, "hey-hey\n")

    def test_join_needs_list_of_text(self):
        out = jesun.execute('show join of [1, 2] with ","\n')
        self.assertEqual(out, 'Line 1: "join of" needs a list of text.\n')

    def test_trim(self):
        self.assertEqual(jesun.execute('show trim of "  hi  "\n'), "hi\n")

    def test_keys_of_foreign_dict(self):
        out = jesun.execute(
            "import json\nd is json.loads('{\"a\": 1}')\nshow keys of d\n"
        )
        self.assertEqual(out, "[a]\n")

    def test_keys_of_non_dict(self):
        out = jesun.execute('show keys of "hi"\n')
        self.assertEqual(out, 'Line 1: "keys of" needs a python dictionary.\n')

    def test_suggest_prefix_match(self):
        out = jesun.execute('name is "Jesun"\nshow nam\n')
        self.assertIn('Did you mean "name"?', out)

    def test_suggest_still_fixes_typos(self):
        out = jesun.execute('name is "Jesun"\nshow naem\n')
        self.assertIn('Did you mean "name"?', out)


if __name__ == "__main__":
    unittest.main()
