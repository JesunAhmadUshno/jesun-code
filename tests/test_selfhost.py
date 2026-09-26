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
import shutil
import sys
import tempfile
import unittest

from selfhost_harness import (
    FIXTURES,
    JESUN_JC,
    JESUN_PY,
    REPO,
    SelfHostTestCase,
    run,
)


class TestSelfHost(SelfHostTestCase):


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

    # -- phase B part 2: agents (spec 8.3) ---------------------------------

    def test_agent_basic(self):
        self.check_agent("agent_basic.jc", "mind_fixed.py", fresh_count=False)

    def test_agent_tools(self):
        self.check_agent("agent_tools.jc", "mind_tools.py")

    def test_agent_to_agent(self):
        self.check_agent("agent_to_agent.jc", "mind_agent_inner.py")

    def test_agent_depth(self):
        self.check_agent("agent_depth.jc", "mind_agent_deep.py")

    def test_agent_streaming(self):
        self.check_agent("agent_streaming.jc", "mind_fixed.py", fresh_count=False)

    def test_agent_remember_run(self):
        self.check_agent("agent_remember_run.jc", "mind_agent_one_call.py")

    def test_agent_remember_always(self):
        self.check_agent("agent_remember_always.jc", "mind_agent_one_call.py")

    def test_agent_forget(self):
        self.check_agent("agent_forget.jc", "mind_agent_one_call.py")

    def test_agent_corrupt_memory(self):
        self.check_agent("agent_corrupt_memory.jc", "mind_agent_one_call.py",
                         corrupt_mem="mem")

    def test_agent_tool_fail_gap(self):
        self.check_agent_gap("agent_tool_fail_gap.jc", "mind_agent_one_call.py")

    def test_agent_bangla(self):
        self.check_agent("agent_bangla.jc", "mind_fixed.py", fresh_count=False)

    def test_agent_nontext_persona(self):
        self.check_agent("agent_nontext_persona.jc")

    def test_agent_nontext_prompt(self):
        self.check_agent("agent_nontext_prompt.jc")

    def test_agent_not_agent(self):
        self.check_agent("agent_not_agent.jc")

    def test_agent_not_agent2(self):
        self.check_agent("agent_not_agent2.jc")

    def test_agent_unknown(self):
        self.check_agent("agent_unknown.jc")

    def test_agent_parse_no_block(self):
        self.check_agent("agent_parse_no_block.jc")

    def test_agent_parse_dup(self):
        self.check_agent("agent_parse_dup.jc")

    def test_agent_parse_unknown_setting(self):
        self.check_agent("agent_parse_unknown_setting.jc")

    def test_agent_parse_bad_remember(self):
        self.check_agent("agent_parse_bad_remember.jc")

    def test_agent_parse_bad_steps(self):
        self.check_agent("agent_parse_bad_steps.jc")

    def test_agent_parse_self_tool(self):
        self.check_agent("agent_parse_self_tool.jc")

    def test_agent_forget_history(self):
        self.check_agent("agent_forget_history.jc", "mind_histprobe.py")


    def test_fleet_basic(self):
        self.check_fleet("fleet_basic.jc")

    def test_fleet_memory(self):
        self.check_fleet("fleet_memory.jc")

    def test_fleet_memory_corrupt(self):
        self.check_fleet("fleet_memory_corrupt.jc", corrupt_mem="crew.json")

    def test_fleet_bangla(self):
        self.check_fleet("fleet_bangla.jc")

    def test_fleet_agent_history(self):
        self.check_fleet("fleet_agent_history.jc")

    def test_fleet_parse_bad_memfile(self):
        self.check_fleet("fleet_parse_bad_memfile.jc", mind=None,
                         fresh_count=False)

    def test_fleet_parse_bad_prompt(self):
        self.check_fleet("fleet_parse_bad_prompt.jc", mind=None,
                         fresh_count=False)

    def test_fleet_parse_dupmem(self):
        self.check_fleet("fleet_parse_dupmem.jc", mind=None,
                         fresh_count=False)

    def test_fleet_parse_member_not_agent(self):
        self.check_fleet("fleet_parse_member_not_agent.jc", mind=None,
                         fresh_count=False)

    def test_fleet_parse_noblock(self):
        self.check_fleet("fleet_parse_noblock.jc", mind=None,
                         fresh_count=False)

    def test_fleet_parse_nonmember(self):
        self.check_fleet("fleet_parse_nonmember.jc", mind=None,
                         fresh_count=False)

    def test_fleet_parse_streaming(self):
        self.check_fleet("fleet_parse_streaming.jc", mind=None,
                         fresh_count=False)

    def test_fleet_parse_unknown_agent(self):
        self.check_fleet("fleet_parse_unknown_agent.jc", mind=None,
                         fresh_count=False)

    def test_fleet_parse_unknownline(self):
        self.check_fleet("fleet_parse_unknownline.jc", mind=None,
                         fresh_count=False)

    def test_fleet_nested_gap(self):
        self.check_fleet_gap(
            "fleet_nested.jc", "mind_fleet_nested.py",
            (0, "nested done\n"),
            (1, "Line 2: a fleet cannot open inside another fleet's asks.\n"),
            "nested fleets are refused; the bootstrap feeds the refusal "
            "back to the mind as a tool RESULT, the walker ends the run",
        )

    def test_fleet_fail_gap(self):
        """Spec 8.4.1: the bootstrap runs fleet threads side by side, the
        walker runs the asks in order. When the first ask fails, the
        bootstrap has already run the second thread's tool (side.txt
        exists); the walker stops before it (side.txt absent)."""
        fixture = os.path.join(FIXTURES, "fleet_fail_gap.jc")
        mind = sys.executable + " " + os.path.join(
            REPO, "tests", "fixtures", "mind_fleet_gap.py")
        jesun_py = os.path.join(REPO, "jesun.py")
        jesun_jc = os.path.join(REPO, "jesun.jc")
        for tag, args in (("boot", [jesun_py]),
                          ("selfhost", [jesun_py, jesun_jc])):
            sandbox = tempfile.mkdtemp(prefix="fleet_gap_")
            try:
                shutil.copy(fixture, sandbox)
                fd, count_path = tempfile.mkstemp(prefix="mindcount_")
                os.close(fd)
                with open(count_path, "w", encoding="utf-8") as handle:
                    handle.write("0")
                env = dict(os.environ)
                env["JESUNCODE_AI_COMMAND"] = mind
                env["MIND_COUNT_FILE"] = count_path
                code, out = run(args + ["fleet_fail_gap.jc"], cwd=sandbox,
                                env=env)
                side = os.path.join(sandbox, "side.txt")
                if tag == "boot":
                    self.assertEqual(
                        (code, out),
                        (1, "Line 16: the mind exited with an error. "
                            "It said: mind exploded\n"),
                        f"fleet_fail_gap.jc: bootstrap changed:\n{(code, out)!r}")
                    self.assertTrue(
                        os.path.exists(side),
                        "fleet_fail_gap.jc: bootstrap should have run the "
                        "second thread's tool (side.txt missing)")
                else:
                    self.assertEqual(
                        (code, out),
                        (1, "Line 16: the mind exited with an error. "
                            "It said: mind exploded\n"),
                        f"fleet_fail_gap.jc: self-host changed:\n{(code, out)!r}")
                    self.assertFalse(
                        os.path.exists(side),
                        "fleet_fail_gap.jc: walker should stop before the "
                        "second ask's tool (side.txt present)")
            finally:
                shutil.rmtree(sandbox, ignore_errors=True)
                os.unlink(count_path)


class TestSelfHostJpm(SelfHostTestCase):


    def test_jpm_basic(self):
        self.check_jpm("jpm_basic.jc")

    def test_jpm_body_fail(self):
        self.check_jpm("jpm_body_fail.jc")

    def test_jpm_call_fail(self):
        self.check_jpm("jpm_call_fail.jc")

    def test_jpm_nested(self):
        self.check_jpm("jpm_nested.jc")

    def test_jpm_circle(self):
        self.check_jpm("jpm_circle.jc")

    def test_jpm_manifest_bad(self):
        self.check_jpm("jpm_manifest_bad.jc")

    def test_jpm_escape(self):
        self.check_jpm("jpm_escape.jc")

    def test_jpm_no_file(self):
        self.check_jpm("jpm_no_file.jc")

    def test_jpm_manifest_main(self):
        self.check_jpm("jpm_manifest_main.jc")

    def test_jpm_bangla(self):
        self.check_jpm("jpm_bangla.jc")

    def test_jpm_use_dirty(self):
        self.check_jpm("jpm_use_dirty.jc", git_dirty=True)

    def test_jpm_use_no_git(self):
        self.check_jpm("jpm_use_no_git.jc", no_git=True)

    def test_jpm_use_already(self):
        self.check_jpm("jpm_use_already.jc")

    def test_jpm_missing(self):
        self.check_jpm("jpm_missing.jc")

    def test_jpm_bad_address(self):
        self.check_jpm("jpm_bad_address.jc")

    def test_jpm_bad_host(self):
        self.check_jpm("jpm_bad_host.jc")

    def test_jpm_deep_gap(self):
        self.check_jpm_gap("jpm_deep_gap.jc")


if __name__ == "__main__":
    unittest.main()
