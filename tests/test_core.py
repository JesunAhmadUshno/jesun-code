"""Jesun.Code core tests: examples run byte-exact, errors speak plain English."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import jesun  # noqa: E402

EXAMPLES = ROOT / "examples"


def run_file(name: str, stdin_text: str = "") -> str:
    return jesun.execute((EXAMPLES / name).read_text(encoding="utf-8"), stdin_text)


class CoreExamples(unittest.TestCase):
    def test_hello(self) -> None:
        self.assertEqual(
            run_file("hello.jc", "Mara\n"),
            "Hello, Jesun\n29\ntrue\nnothing\nWhat is your name? Nice to meet you, Mara\n",
        )

    def test_decisions(self) -> None:
        self.assertEqual(
            run_file("decisions.jc"),
            "B\nit is you\nnot Mara\nat most 85\ncontains works on text\n"
            "contains works on lists\nand works\nor works\nnot works\n",
        )

    def test_loops(self) -> None:
        self.assertEqual(
            run_file("loops.jc"),
            "hi\nhi\nhi\n0\n1\n2\nMara\nWren\nLeo\nstopping early\n"
            "1\n2\n4\n5\nnested\nnested\nnested\nnested\n",
        )

    def test_functions(self) -> None:
        self.assertEqual(
            run_file("functions.jc"),
            "dancing, no inputs needed\nHello, Jesun\n5\n120\n13\n",
        )

    def test_lists(self) -> None:
        self.assertEqual(
            run_file("lists.jc"),
            "[Mara, Wren, Leo]\nMara\nLeo\n3\nHELLO\nloud\n0\n[]\n6\n",
        )

    def test_cheer(self) -> None:
        self.assertEqual(
            run_file("cheer.jc", "Jesun\n"),
            "What is your name? Go, Jesun!\nGo, Jesun!\nGo, Jesun!\n",
        )

    def test_nesting(self) -> None:
        self.assertEqual(
            run_file("nesting.jc"),
            "checking a\nfound b\nchecking a\nfound b\nchecking a\nfound b\ndone searching\n",
        )


class CoreErrors(unittest.TestCase):
    def test_undefined_name_with_suggestion(self) -> None:
        out = jesun.execute('name is "Jesun"\nshow naem\n')
        self.assertEqual(out, 'Line 2: I do not know the word "naem". Did you mean "name"?\n')

    def test_wrong_arg_count(self) -> None:
        out = jesun.execute('to greet with name\n    show name\ngreet with "a" and "b"\n')
        self.assertEqual(out, 'Line 3: "greet" needs 1 input, but you gave 2.\n')

    def test_missing_block(self) -> None:
        out = jesun.execute("if true then\nshow 1\n")
        self.assertEqual(out, "Line 2: I expected an indented block here.\n")

    def test_bad_dedent(self) -> None:
        out = jesun.execute("if true then\n    show 1\n  show 2\n")
        self.assertEqual(out, "Line 3: this line does not line up with any block I opened.\n")

    def test_type_mismatch(self) -> None:
        out = jesun.execute('show "a" - "b"\n')
        self.assertEqual(out, 'Line 1: I can only use "-", "*", "/" and "%" with numbers.\n')

    def test_division_by_zero(self) -> None:
        out = jesun.execute("show 1 / 0\n")
        self.assertEqual(out, "Line 1: I cannot divide by zero.\n")

    def test_first_of_empty(self) -> None:
        out = jesun.execute("show first of []\n")
        self.assertEqual(out, "Line 1: there is no first of an empty list.\n")

    def test_stop_outside_loop(self) -> None:
        out = jesun.execute("stop\n")
        self.assertEqual(out, 'Line 1: "stop" only makes sense inside a loop.\n')

    def test_give_back_outside_function(self) -> None:
        out = jesun.execute("give back 1\n")
        self.assertEqual(out, 'Line 1: "give back" only makes sense inside a function.\n')

    def test_unknown_character(self) -> None:
        out = jesun.execute("show @\n")
        self.assertEqual(out, 'Line 1: I do not know what "@" means here.\n')

    def test_ask_at_eof(self) -> None:
        out = jesun.execute('ask "Q?" giving x\n', "")
        self.assertEqual(out, "Q?Line 1: I asked a question, but the input ended.\n")

    def test_calling_non_function(self) -> None:
        out = jesun.execute('x is 5\nx with 1\n')
        self.assertEqual(out, 'Line 2: "x" is not a function I can call.\n')


class CoreSemantics(unittest.TestCase):
    def test_is_assigns_at_statement_start(self) -> None:
        self.assertEqual(jesun.execute("x is 5\nshow x\n"), "5\n")

    def test_is_compares_inside_expressions(self) -> None:
        self.assertEqual(jesun.execute("x is 5\nshow x is 5\nshow x is 6\n"), "true\nfalse\n")

    def test_true_is_not_one(self) -> None:
        self.assertEqual(jesun.execute("show true is 1\n"), "false\n")

    def test_recursion_depth_is_plain_english(self) -> None:
        out = jesun.execute("to f with n\n    f with n\nf with 1\n")
        self.assertTrue(out.startswith("Line 2: the functions are calling each other too deep;"))

    def test_no_traceback_leaks(self) -> None:
        nasties = [
            "",
            "\n\n\n",
            "if\n",
            "to\n",
            "show (1 +\n",
            '"unterminated',
            "repeat while true\n    show 1\n",
            "x is [1,\n",
            "for each in\n",
            "give\n",
            "otherwise\n",
            "1 2 3\n",
            "show 1 2\n",
            "to f with x and\n    show x\n",
        ]
        for src in nasties:
            out = jesun.execute(src)
            self.assertNotIn("Traceback", out, f"leak in {src!r}")
            self.assertNotIn('File "', out, f"leak in {src!r}")
            self.assertNotIn("0x", out, f"leak in {src!r}")


if __name__ == "__main__":
    unittest.main()
