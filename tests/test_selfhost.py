"""Differential tests: the self-hosted interpreter (jesun.jc, phase A) must
behave exactly like the Python bootstrap on the fixture corpus.

Each fixture runs twice: once through `python jesun.py <fixture>`
(bootstrap), once through `python jesun.py jesun.jc <fixture>`
(self-hosted). Stdout and the exit code must match exactly.
"""
import os
import subprocess
import sys
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = os.path.join(REPO, "tests", "fixtures", "selfhost")
TIMEOUT = 120


def run(args, cwd=REPO):
    proc = subprocess.run(
        [sys.executable] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=TIMEOUT,
    )
    return proc.returncode, proc.stdout


class TestSelfHost(unittest.TestCase):
    def check(self, name):
        fixture = os.path.join("tests", "fixtures", "selfhost", name)
        boot = run(["jesun.py", fixture])
        selfhost = run(["jesun.py", "jesun.jc", fixture])
        self.assertEqual(
            selfhost, boot,
            f"fixture {name} differs:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )

    def test_core(self):
        self.check("core.jc")

    def test_compare(self):
        self.check("compare.jc")

    def test_flow(self):
        self.check("flow.jc")

    def test_funcs(self):
        self.check("funcs.jc")

    def test_lists(self):
        self.check("lists.jc")

    def test_interp(self):
        self.check("interp.jc")

    def test_bom(self):
        self.check("bom.jc")

    def test_trailing_ok(self):
        self.check("trailing_ok.jc")

    def test_err_unknown_word(self):
        self.check("err_unknown_word.jc")

    def test_err_divzero(self):
        self.check("err_divzero.jc")

    def test_err_add_type(self):
        self.check("err_add_type.jc")

    def test_err_giveback_top(self):
        self.check("err_giveback_top.jc")

    def test_err_stop_top(self):
        self.check("err_stop_top.jc")

    def test_err_index(self):
        self.check("err_index.jc")

    def test_err_arity(self):
        self.check("err_arity.jc")

    def test_err_unclosed_string(self):
        self.check("err_unclosed_string.jc")

    def test_err_no_block(self):
        self.check("err_no_block.jc")

    def test_err_push_nonlist(self):
        self.check("err_push_nonlist.jc")

    def test_err_fail_with(self):
        self.check("err_fail_with.jc")

    def test_err_with_lead(self):
        self.check("err_with_lead.jc")

    def test_err_bare_params(self):
        self.check("err_bare_params.jc")


if __name__ == "__main__":
    unittest.main()
