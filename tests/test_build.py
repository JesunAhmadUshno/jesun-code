"""Jesun.Code v1.1 tests: `jesun build` native compilation.

The differential rule (spec-v1.1 section 6): for every supported program,
interpreted output and compiled-binary output must be byte-identical,
covering stdout and the exit code. Error paths count too.
"""
import io
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import jesun  # noqa: E402
import jesun_build  # noqa: E402

HAVE_CC = shutil.which("cc") is not None


def run_interpreted(source, stdin_text="", args=()):
    """Run through the interpreter; return (stdout, returncode)."""
    out = io.StringIO()
    interp = jesun.Interpreter(stdin=io.StringIO(stdin_text), stdout=out)
    interp.global_env.set("arguments", list(args))
    try:
        jesun.run_source(source, interp)
    except jesun.JesunError as err:
        out.write(str(err) + "\n")
        return out.getvalue(), 1
    except KeyboardInterrupt:
        return out.getvalue(), 130
    return out.getvalue(), 0


def build_and_run(source, stdin_text="", args=(), cwd=None):
    """Build to a temp dir and run the binary; return (stdout, returncode)."""
    tmp = Path(tempfile.mkdtemp(prefix="jcbuild"))
    src = tmp / "prog.jc"
    src.write_text(source, encoding="utf-8")
    out_bin = tmp / "prog"
    rc = jesun_build.build_file(str(src), str(out_bin))
    if rc != 0:
        shutil.rmtree(tmp, ignore_errors=True)
        raise AssertionError("build failed")
    try:
        proc = subprocess.run(
            [str(out_bin), *args], input=stdin_text, capture_output=True,
            text=True, timeout=60, cwd=cwd or str(tmp),
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return proc.stdout, proc.returncode


@unittest.skipUnless(HAVE_CC, "no C compiler")
class NativeDiffCase(unittest.TestCase):
    def diff(self, source, stdin_text="", args=(), cwd=None):
        want_out, want_rc = run_interpreted(source, stdin_text, args)
        got_out, got_rc = build_and_run(source, stdin_text, args, cwd)
        self.assertEqual(got_rc, want_rc, f"return code differs\nsource:\n{source}")
        self.assertEqual(got_out, want_out, f"output differs\nsource:\n{source}")


class CoreLanguage(NativeDiffCase):
    def test_hello(self):
        self.diff('show "Hello, world"\n')

    def test_arithmetic(self):
        self.diff(
            "show 6 * 7\nshow 10 / 4\nshow 10 % 3\nshow -7 % 3\nshow 7 % -3\n"
            "show 2 + 3 * 4\nshow (2 + 3) * 4\nshow 0.1 + 0.2\n"
            "show 0.00001\nshow 123.456\nshow -0.0\nshow 100000000000000000000\n"
        )

    def test_text_ops(self):
        self.diff(
            'name is "Jesun"\nshow "Hello, {name}!"\n'
            'show "a" + "b"\nshow uppercase of "hello"\nshow lowercase of "HeLLo"\n'
            'show trim of "  padded  "\nshow split of "a,b,c" by ","\n'
            'show join of ["a", "b"] with "-"\nshow characters of "hey"\n'
        )

    def test_comparisons(self):
        self.diff(
            "show 3 is 3\nshow 3 is not 4\nshow 5 is greater than 4\n"
            "show 2 is less than 3\nshow 3 is at least 3\nshow 3 is at most 4\n"
            'show "abc" contains "b"\nshow [1, 2] contains 2\n'
            "show true and false\nshow true or false\nshow not true\n"
            "show 1 is true\nshow nothing is nothing\n"
        )

    def test_decisions(self):
        self.diff(
            "age is 20\nif age is at least 18 then\n"
            '    show "adult"\notherwise if age is at least 13 then\n'
            '    show "teen"\notherwise\n    show "child"\n'
        )

    def test_loops(self):
        self.diff(
            "total is 0\nrepeat 5 times\n    total is total + 1\nshow total\n"
            "i is 0\nrepeat while i is less than 3\n    i is i + 1\nshow i\n"
            "s is 0\nfor each x in [1, 2, 3]\n    s is s + x\nshow s\n"
            "n is 0\nrepeat 10 times\n    n is n + 1\n    if n is 3 then\n        stop\nshow n\n"
            "m is 0\nfor each x in [1, 2, 3, 4]\n    if x is 2 then\n        skip\n    m is m + x\nshow m\n"
        )

    def test_lists(self):
        self.diff(
            "nums is [3, 1, 4]\nshow length of nums\nshow first of nums\n"
            "show last of nums\npush 9 to nums\nshow nums\n"
            "show nums[0]\nshow nums[-1]\nshow length of \"hello\"\n"
        )

    def test_functions(self):
        self.diff(
            "to add with a and b\n    give back a + b\nshow add with 3 and 4\n"
            "to fib with n\n    if n is at most 1 then\n        give back n\n"
            "    otherwise\n        give back (fib with n - 1) + (fib with n - 2)\n"
            "show fib with 15\n"
            "to shout with words\n    show words\nshout with \"hey\"\n"
        )

    def test_builtins(self):
        self.diff(
            "show text of [1, true, \"x\"]\nshow kind of 42\nshow kind of \"s\"\n"
            "show kind of [1]\nshow kind of nothing\nshow kind of true\n"
        )

    def test_nested(self):
        self.diff(
            "matrix is [[1, 2], [3, 4]]\nshow matrix[1][0]\n"
            "total is 0\nfor each row in matrix\n    for each cell in row\n"
            "        total is total + cell\nshow total\n"
        )

    def test_shadow_and_scope(self):
        self.diff(
            "x is 10\nto readx\n    show x\nreadx\n"
            "to shadow\n    x is 99\n    show x\nshadow\nshow x\n"
        )

    def test_arguments(self):
        self.diff("show arguments\nshow length of arguments\n", args=("one", "two"))

    def test_bangla(self):
        self.diff("বাংলা\nদেখাও \"হ্যালো\"\nx হয় 40 + 2\nদেখাও x\n")

    def test_closures(self):
        # A nested definition closes over its definition site: the inner
        # function still sees `base` after `make` has returned.
        self.diff(
            "to make with base\n"
            "    to addbase with x\n"
            "        give back base + x\n"
            "    give back addbase\n"
            "adder is make with 10\n"
            "show adder with 5\n"
            "show adder with 7\n"
        )

    def test_short_circuit(self):
        # `and`/`or` never touch the right side when the left decides it.
        self.diff("show false and (1 / 0)\nshow true or (1 / 0)\n")


class ErrorPaths(NativeDiffCase):
    def test_divide_by_zero(self):
        self.diff("show 1 / 0\n")

    def test_mod_by_zero(self):
        self.diff("show 1 % 0\n")

    def test_unknown_word(self):
        self.diff("show mystery\n")

    def test_unknown_word_suggest(self):
        self.diff("name is 1\nshow naem\n")

    def test_fail_with(self):
        self.diff('fail with "stopping here"\n')

    def test_fail_with_needs_text(self):
        self.diff("fail with 42\n")

    def test_too_deep(self):
        self.diff(
            "to boom\n    boom\nboom\n"
        )

    def test_repeat_needs_number(self):
        self.diff('repeat "x" times\n    show 1\n')

    def test_index_outside(self):
        self.diff("x is [1, 2]\nshow x[5]\n")

    def test_first_of_empty(self):
        self.diff("show first of []\n")

    def test_ask_needs_text(self):
        self.diff("ask 42 giving n\n")

    def test_ask_eof(self):
        self.diff('ask "Name? " giving n\nshow n\n', stdin_text="")

    def test_stop_outside_loop(self):
        # Like the interpreter, `stop` outside a loop fails at runtime with
        # the plain-English message, not at compile time.
        self.diff("stop\n")
        self.diff("skip\n")

    def test_give_back_outside_function(self):
        with self.assertRaises(jesun_build.BuildError):
            jesun_build.transpile_source("give back 1\n")

    def test_and_evaluates_right_when_true(self):
        self.diff("show true and (1 / 0)\n")

    def test_eval_order_push_target_first(self):
        # The push target is checked before the pushed value is worked out.
        self.diff("x is 5\npush (1 / 0) to x\n")

    def test_eval_order_write_path_first(self):
        # The write path is safety-checked before the value is worked out.
        self.diff('write (1 / 0) to file "../evil"\n')

    def test_eval_order_call_target_first(self):
        # The call target is checked before the arguments are worked out.
        self.diff("x is 5\nshow x with (1 / 0)\n")

    def test_eval_order_call_arity_first(self):
        self.diff(
            "to f with a\n    give back a\nshow f with (1 / 0) and (2 / 0)\n"
        )

    def test_eval_order_left_to_right(self):
        self.diff("show (1 / 0) + nosuchvar\n")

    def test_stop_through_function(self):
        # `stop` inside a function unwinds to the caller's loop, like the
        # interpreter, and the loop ends.
        self.diff(
            "to f\n    stop\nrepeat 2 times\n    show \"in loop\"\n    f\n"
            "    show \"after f\"\n"
        )

    def test_give_back_abandons_loop(self):
        # A `give back` inside a loop abandons the loop; its control
        # entry must not stay live, or the later `stop` would jump into
        # a dead frame instead of failing in plain English.
        self.diff(
            "to f\n    repeat 3 times\n        give back 1\n"
            "    show \"unreached\"\nshow f\nstop\n"
        )


class AskAndFiles(NativeDiffCase):
    def test_ask(self):
        self.diff('ask "Name? " giving n\nshow "hi {n}"\n', stdin_text="Jesun\n")

    def test_files(self):
        tmp = Path(tempfile.mkdtemp(prefix="jcfiles"))
        src = (
            'write "hello file" to file "out.txt"\n'
            'read file "out.txt" giving t\nshow t\n'
            'append "!" to file "out.txt"\n'
            'read file "out.txt" giving t2\nshow t2\n'
        )
        old = os.getcwd()
        os.chdir(tmp)
        try:
            want_out, want_rc = run_interpreted(src)
            (tmp / "out.txt").unlink(missing_ok=True)
            got_out, got_rc = build_and_run(src, cwd=str(tmp))
        finally:
            os.chdir(old)
        shutil.rmtree(tmp, ignore_errors=True)
        self.assertEqual(got_rc, want_rc)
        self.assertEqual(got_out, want_out)

    def test_read_missing(self):
        self.diff('read file "nope.txt" giving t\n')

    def test_path_escape(self):
        self.diff('read file "../secret.txt" giving t\n')


class Unsupported(unittest.TestCase):
    def build_err(self, source):
        with self.assertRaises(jesun_build.BuildError) as ctx:
            jesun_build.transpile_source(source)
        return str(ctx.exception)

    def test_ask_ai(self):
        msg = self.build_err('ask ai "hi" giving r\n')
        self.assertIn("native builds", msg)

    def test_agent(self):
        msg = self.build_err('agent scout\n    persona is "x"\nask scout "hi" giving r\n')
        self.assertIn("native builds", msg)

    def test_terminal(self):
        msg = self.build_err('open terminal named "w"\n')
        self.assertIn("native builds", msg)

    def test_import(self):
        msg = self.build_err("import math\nshow math.pi\n")
        self.assertIn("native builds", msg)

    def test_use(self):
        msg = self.build_err('use "github.com/x/y"\n')
        self.assertIn("native builds", msg)

    def test_plain_english_with_line(self):
        with self.assertRaises(jesun_build.BuildError) as ctx:
            jesun_build.transpile_source('show 1\nask ai "hi" giving r\n')
        self.assertTrue(str(ctx.exception).startswith("Line 2:"))

    def test_cli_missing_file(self):
        rc = jesun_build.build_file("/tmp/jcb/does-not-exist.jc", "/tmp/jcb/x")
        self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()
