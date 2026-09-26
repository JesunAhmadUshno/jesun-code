"""Jesun.Code core tests: examples run byte-exact, errors speak plain English.

Sprint 4 migration (spec 9.2a): every test is differential-green. Each
program runs through the bootstrap and through jesun.jc (run_both via
SelfHostDiffCase); the walker leg must equal the bootstrap leg, and the
exact-output assertion stays on the bootstrap leg. Two pinned gaps
(spec 9.2b, the walker-guard family): the call-depth guard and the
million-iteration loop guard fire on the bootstrap's own counters while
it interprets jesun.jc, so they surface at a jesun.jc line with the
identical message text.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from selfhost_harness import LINE_RE, SelfHostDiffCase, run_inline  # noqa: E402

EXAMPLES = ROOT / "examples"


class CoreExamples(SelfHostDiffCase):
    def test_hello(self) -> None:
        self.check_example(
            str(EXAMPLES / "hello.jc"),
            "Hello, Jesun\n29\ntrue\nnothing\nWhat is your name? Nice to meet you, Mara\n",
            stdin="Mara\n",
        )

    def test_decisions(self) -> None:
        self.check_example(
            str(EXAMPLES / "decisions.jc"),
            "B\nit is you\nnot Mara\nat most 85\ncontains works on text\n"
            "contains works on lists\nand works\nor works\nnot works\n",
        )

    def test_loops(self) -> None:
        self.check_example(
            str(EXAMPLES / "loops.jc"),
            "hi\nhi\nhi\n0\n1\n2\nMara\nWren\nLeo\nstopping early\n"
            "1\n2\n4\n5\nnested\nnested\nnested\nnested\n",
        )

    def test_functions(self) -> None:
        self.check_example(
            str(EXAMPLES / "functions.jc"),
            "dancing, no inputs needed\nHello, Jesun\n5\n120\n13\n",
        )

    def test_lists(self) -> None:
        self.check_example(
            str(EXAMPLES / "lists.jc"),
            "[Mara, Wren, Leo]\nMara\nLeo\n3\nHELLO\nloud\n0\n[]\n6\n",
        )

    def test_cheer(self) -> None:
        self.check_example(
            str(EXAMPLES / "cheer.jc"),
            "What is your name? Go, Jesun!\nGo, Jesun!\nGo, Jesun!\n",
            stdin="Jesun\n",
        )

    def test_nesting(self) -> None:
        self.check_example(
            str(EXAMPLES / "nesting.jc"),
            "checking a\nfound b\nchecking a\nfound b\nchecking a\nfound b\ndone searching\n",
        )


class CoreErrors(SelfHostDiffCase):
    def test_undefined_name_with_suggestion(self) -> None:
        self.check_program(
            'name is "Jesun"\nshow naem\n',
            'Line 2: I do not know the word "naem". Did you mean "name"?\n',
        )

    def test_wrong_arg_count(self) -> None:
        self.check_program(
            'to greet with name\n    show name\ngreet with "a" and "b"\n',
            'Line 3: "greet" needs 1 input, but you gave 2.\n',
        )

    def test_missing_block(self) -> None:
        self.check_program(
            "if true then\nshow 1\n",
            "Line 2: I expected an indented block here.\n",
        )

    def test_bad_dedent(self) -> None:
        self.check_program(
            "if true then\n    show 1\n  show 2\n",
            "Line 3: this line does not line up with any block I opened.\n",
        )

    def test_type_mismatch(self) -> None:
        self.check_program(
            'show "a" - "b"\n',
            'Line 1: I can only use "-", "*", "/" and "%" with numbers.\n',
        )

    def test_division_by_zero(self) -> None:
        self.check_program(
            "show 1 / 0\n",
            "Line 1: I cannot divide by zero.\n",
        )

    def test_first_of_empty(self) -> None:
        self.check_program(
            "show first of []\n",
            "Line 1: there is no first of an empty list.\n",
        )

    def test_stop_outside_loop(self) -> None:
        self.check_program(
            "stop\n",
            'Line 1: "stop" only makes sense inside a loop.\n',
        )

    def test_give_back_outside_function(self) -> None:
        self.check_program(
            "give back 1\n",
            'Line 1: "give back" only makes sense inside a function.\n',
        )

    def test_unknown_character(self) -> None:
        self.check_program(
            "show @\n",
            'Line 1: I do not know what "@" means here.\n',
        )

    def test_ask_at_eof(self) -> None:
        self.check_program(
            'ask "Q?" giving x\n',
            "Q?Line 1: I asked a question, but the input ended.\n",
            stdin="",
        )

    def test_calling_non_function(self) -> None:
        self.check_program(
            "x is 5\nx with 1\n",
            'Line 2: "x" is not a function I can call.\n',
        )


class CoreSemantics(SelfHostDiffCase):
    def test_is_assigns_at_statement_start(self) -> None:
        self.check_program("x is 5\nshow x\n", "5\n")

    def test_is_compares_inside_expressions(self) -> None:
        self.check_program("x is 5\nshow x is 5\nshow x is 6\n", "true\nfalse\n")

    def test_true_is_not_one(self) -> None:
        self.check_program("show true is 1\n", "false\n")

    def test_recursion_depth_guard_gap(self) -> None:
        """Pinned gap 9.1 (walker-guard family): the target program
        recurses forever. The bootstrap trips its own call-depth guard
        at the target line; the walker trips the bootstrap's guard
        while the bootstrap interprets the walker's exec recursion, so
        the identical message surfaces at a jesun.jc line. Line numbers
        are normalized; the message text must match exactly. Closing
        this gap would need the walker's target-level depth guard to
        fire before the bootstrap's own guard does while it interprets
        jesun.jc."""
        boot, selfhost = run_inline("to f with n\n    f with n\nf with 1\n")
        self.assertEqual(
            boot,
            (1, "Line 2: the functions are calling each other too deep; "
                "I stopped before falling over.\n"),
            f"recursion guard: bootstrap changed behavior:\n{boot!r}")
        self.assertEqual(selfhost[0], 1,
                         f"recursion guard: self-host exit changed:\n{selfhost!r}")
        self.assertEqual(
            LINE_RE.sub("Line N", selfhost[1]),
            "Line N: the functions are calling each other too deep; "
            "I stopped before falling over.\n",
            f"recursion guard: self-host changed behavior:\n{selfhost!r}")

    def test_no_traceback_leaks(self) -> None:
        nasties = [
            "",
            "\n\n\n",
            "if\n",
            "to\n",
            "show (1 +\n",
            '"unterminated',
            "x is [1,\n",
            "for each in\n",
            "give\n",
            "otherwise\n",
            "1 2 3\n",
            "show 1 2\n",
            "to f with x and\n    show x\n",
        ]
        for src in nasties:
            boot, selfhost = run_inline(src)
            self.assert_differential(boot, selfhost, f"nasty {src!r}")
            for label, out in (("bootstrap", boot[1]),
                               ("self-host", selfhost[1])):
                self.assertNotIn("Traceback", out, f"leak in {src!r} ({label})")
                self.assertNotIn('File "', out, f"leak in {src!r} ({label})")
                self.assertNotIn("0x", out, f"leak in {src!r} ({label})")

    def test_loop_millions_guard_gap(self) -> None:
        """Pinned gap 9.2 (walker-guard family): an infinite
        repeat-while loop. The bootstrap trips its own million-iteration
        guard at the target line; the walker trips the bootstrap's guard
        while the bootstrap interprets the walker's own repeat-while in
        exec_repeat_while, so the identical message surfaces at a
        jesun.jc line. Line numbers are normalized; the message text must
        match exactly. Both legs are also leak-checked. This case costs
        ~90s through the walker (a million interpreted iterations); it
        dominates the suite budget and is kept because it exercises the
        walker's loop guard end to end. Closing the gap would need the
        walker's target-level iteration guard to fire before the
        bootstrap's own guard does while it interprets jesun.jc."""
        boot, selfhost = run_inline("repeat while true\n    show 1\n")
        self.assertEqual(
            boot,
            (1, "1\n" * 1000000 +
                "Line 1: this loop ran a million times; I stopped it.\n"),
            f"loop guard: bootstrap changed behavior (tail):\n"
            f"{boot[1][-120:]!r}")
        self.assertEqual(selfhost[0], 1,
                         f"loop guard: self-host exit changed:\n"
                         f"{selfhost[1][-120:]!r}")
        self.assertEqual(
            LINE_RE.sub("Line N", selfhost[1]),
            LINE_RE.sub("Line N", boot[1]),
            "loop guard: self-host differs beyond the known gap")
        for label, out in (("bootstrap", boot[1]),
                           ("self-host", selfhost[1])):
            self.assertNotIn("Traceback", out, f"leak ({label})")
            self.assertNotIn('File "', out, f"leak ({label})")
            self.assertNotIn("0x", out, f"leak ({label})")


if __name__ == "__main__":
    unittest.main()
