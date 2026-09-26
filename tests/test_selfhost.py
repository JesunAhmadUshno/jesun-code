"""Differential tests: the self-hosted interpreter (jesun.jc) must behave
exactly like the Python bootstrap on the fixture corpus.

Each fixture runs twice: once through `python jesun.py <fixture>`
(bootstrap), once through `python jesun.py jesun.jc <fixture>`
(self-hosted). Stdout and the exit code must match exactly.

Phase B (ask, file I/O, the import bridge): fixtures that touch stdin
run with piped input; fixtures that touch the disk run in a fresh
temporary sandbox (the self-hosted sandbox rule forbids programs
outside the working folder). Import fixtures have no side effects and
run in the repo.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = os.path.join(REPO, "tests", "fixtures", "selfhost")
TIMEOUT = 120
LINE_RE = re.compile(r"Line \d+")


def run(args, cwd=REPO, stdin_text=None, env=None):
    full_env = None
    if env is not None:
        full_env = dict(os.environ)
        full_env.update(env)
    proc = subprocess.run(
        [sys.executable] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=TIMEOUT,
        input=stdin_text,
        env=full_env,
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

    def check_stdin(self, name, stdin_text):
        fixture = os.path.join("tests", "fixtures", "selfhost", name)
        boot = run(["jesun.py", fixture], stdin_text=stdin_text)
        selfhost = run(["jesun.py", "jesun.jc", fixture], stdin_text=stdin_text)
        self.assertEqual(
            selfhost, boot,
            f"fixture {name} differs:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )

    def check_sandbox(self, name, stdin_text=None):
        sandbox = tempfile.mkdtemp(prefix="selfhost_pb_")
        try:
            shutil.copy(os.path.join(FIXTURES, name), sandbox)
            jesun_py = os.path.join(REPO, "jesun.py")
            jesun_jc = os.path.join(REPO, "jesun.jc")
            boot = run([jesun_py, name], cwd=sandbox, stdin_text=stdin_text)
            selfhost = run([jesun_py, jesun_jc, name], cwd=sandbox,
                           stdin_text=stdin_text)
            self.assertEqual(
                selfhost, boot,
                f"fixture {name} differs:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
            )
        finally:
            shutil.rmtree(sandbox, ignore_errors=True)

    def check_known_gap(self, name):
        """Spec 7.3: call-time foreign failures report at the walker's
        bridge line instead of the target line. Same message, line differs:
        normalize and require the marker, so a real divergence still fails.
        """
        fixture = os.path.join("tests", "fixtures", "selfhost", name)
        boot = run(["jesun.py", fixture])
        selfhost = run(["jesun.py", "jesun.jc", fixture])
        self.assertIn("the python call failed", boot[1])
        self.assertIn("the python call failed", selfhost[1])
        self.assertEqual(
            (selfhost[0], LINE_RE.sub("Line N", selfhost[1])),
            (boot[0], LINE_RE.sub("Line N", boot[1])),
            f"fixture {name} differs beyond the known 7.3 gap:\n"
            f"bootstrap={boot!r}\nselfhost={selfhost!r}",
        )

    def check_ai(self, name, mind=None, fresh_count=True):
        """Differential ask-ai run (spec 8.2) with JESUNCODE_AI_COMMAND
        pointed at a fixture mind, or unset when mind is None. Counting
        minds (mind_tools, mind_unknown_tool) get a fresh MIND_COUNT_FILE
        before each side, so both sides see the same call sequence."""
        fixture = os.path.join("tests", "fixtures", "selfhost", name)
        env = {}
        if mind is not None:
            env["JESUNCODE_AI_COMMAND"] = (
                sys.executable + " " + os.path.join(REPO, "tests", "fixtures", mind))
        count_path = None
        if fresh_count:
            fd, count_path = tempfile.mkstemp(prefix="mindcount_")
            os.close(fd)
            env["MIND_COUNT_FILE"] = count_path
        try:
            boot = run(["jesun.py", fixture], env=env)
            if count_path is not None:
                with open(count_path, "w", encoding="utf-8") as handle:
                    handle.write("0")
            selfhost = run(["jesun.py", "jesun.jc", fixture], env=env)
            self.assertEqual(
                selfhost, boot,
                f"fixture {name} differs:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
            )
        finally:
            if count_path is not None:
                os.unlink(count_path)

    def check_ai_nomind(self, name):
        """ask-ai with JESUNCODE_AI_COMMAND scrubbed from the environment."""
        fixture = os.path.join("tests", "fixtures", "selfhost", name)
        saved = os.environ.pop("JESUNCODE_AI_COMMAND", None)
        try:
            boot = run(["jesun.py", fixture])
            selfhost = run(["jesun.py", "jesun.jc", fixture])
            self.assertEqual(
                selfhost, boot,
                f"fixture {name} differs:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
            )
        finally:
            if saved is not None:
                os.environ["JESUNCODE_AI_COMMAND"] = saved

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

    def test_err_otherwise_lead(self):
        self.check("err_otherwise_lead.jc")

    # -- phase B part 1: ask, file I/O, the import bridge -----------------

    def test_phaseb_ask(self):
        self.check_stdin("phaseb_ask.jc", "Ada\n")

    def test_phaseb_ask_eof(self):
        self.check_stdin("phaseb_ask_eof.jc", "")

    def test_phaseb_ask_nontext(self):
        self.check("phaseb_ask_nontext.jc")

    def test_phaseb_file_rw(self):
        self.check_sandbox("phaseb_file_rw.jc")

    def test_phaseb_read_missing(self):
        self.check_sandbox("phaseb_read_missing.jc")

    def test_phaseb_read_folder(self):
        self.check_sandbox("phaseb_read_folder.jc")

    def test_phaseb_write_escape(self):
        sandbox = tempfile.mkdtemp(prefix="selfhost_pb_")
        try:
            shutil.copy(os.path.join(FIXTURES, "phaseb_write_escape.jc"), sandbox)
            jesun_py = os.path.join(REPO, "jesun.py")
            jesun_jc = os.path.join(REPO, "jesun.jc")
            boot = run([jesun_py, "phaseb_write_escape.jc"], cwd=sandbox)
            selfhost = run([jesun_py, jesun_jc, "phaseb_write_escape.jc"],
                           cwd=sandbox)
            self.assertEqual(selfhost, boot)
            self.assertIn("leaves the current folder", boot[1])
            parent = os.path.dirname(sandbox)
            self.assertFalse(os.path.exists(
                os.path.join(parent, "phaseb_evil.txt")),
                "escape wrote outside the sandbox")
        finally:
            shutil.rmtree(sandbox, ignore_errors=True)

    def test_phaseb_write_nodir(self):
        self.check_sandbox("phaseb_write_nodir.jc")

    def test_phaseb_import_ok(self):
        self.check("phaseb_import_ok.jc")

    def test_phaseb_import_dotted(self):
        self.check("phaseb_import_dotted.jc")

    def test_phaseb_import_alias(self):
        self.check("phaseb_import_alias.jc")

    def test_phaseb_import_missing_suggest(self):
        self.check("phaseb_import_missing_suggest.jc")

    def test_phaseb_import_missing_plain(self):
        self.check("phaseb_import_missing_plain.jc")

    def test_phaseb_attr_missing(self):
        self.check("phaseb_attr_missing.jc")

    def test_phaseb_attr_nonpython(self):
        self.check("phaseb_attr_nonpython.jc")

    def test_phaseb_foreign_kwargs(self):
        self.check("phaseb_foreign_kwargs.jc")

    def test_phaseb_foreign_sub(self):
        self.check("phaseb_foreign_sub.jc")

    def test_phaseb_sub_fail(self):
        self.check("phaseb_sub_fail.jc")

    def test_phaseb_call_fail(self):
        self.check_known_gap("phaseb_call_fail.jc")

    # -- phase B part 2: ask ai (spec 8.2) --------------------------------

    def test_askai_basic(self):
        self.check_ai("ask_ai_basic.jc", "mind_fixed.py", fresh_count=False)

    def test_askai_nomind(self):
        self.check_ai_nomind("ask_ai_nomind.jc")

    def test_askai_fails(self):
        self.check_ai("ask_ai_fails.jc", "mind_fails.py", fresh_count=False)

    def test_askai_tools(self):
        self.check_ai("ask_ai_tools.jc", "mind_tools.py")

    def test_askai_unknown_tool(self):
        self.check_ai("ask_ai_unknown_tool.jc", "mind_unknown_tool.py")

    def test_askai_steps_exhausted(self):
        self.check_ai("ask_ai_steps.jc", "mind_tools.py")

    def test_askai_arity(self):
        self.check_ai("ask_ai_arity.jc", "mind_tools.py")

    def test_askai_streaming(self):
        self.check_ai("ask_ai_streaming.jc", "mind_fixed.py", fresh_count=False)

    def test_askai_within_zero(self):
        self.check_ai("ask_ai_within_zero.jc", fresh_count=False)

    def test_askai_bangla(self):
        self.check_ai("ask_ai_bangla.jc", "mind_fixed.py", fresh_count=False)

    def test_bn_basic(self):
        self.check("bn_basic.jc")

    def test_bn_header_alt(self):
        self.check("bn_header_alt.jc")

    def test_bn_header_blank(self):
        self.check("bn_header_blank.jc")

    def test_bn_digits(self):
        self.check("bn_digits.jc")

    def test_bn_comment(self):
        self.check("bn_comment.jc")

    def test_bn_compare(self):
        self.check("bn_compare.jc")

    def test_bn_builtin(self):
        self.check("bn_builtin.jc")

    def test_bn_loop(self):
        self.check("bn_loop.jc")

    def test_bn_keys(self):
        self.check("bn_keys.jc")

    def test_bn_err_sup(self):
        self.check("bn_err_sup.jc")

    def test_bn_err_arrow(self):
        self.check("bn_err_arrow.jc")


if __name__ == "__main__":
    unittest.main()
