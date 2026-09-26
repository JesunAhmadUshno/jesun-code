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

    def check_agent(self, name, mind=None, fresh_count=True, corrupt_mem=None):
        """Differential agent run (spec 8.3) with a fixture mind via
        JESUNCODE_AI_COMMAND. Each side gets its own fresh
        JESUN_CODE_HOME, so agent memory files never leak between the
        two sides; counting minds get a fresh MIND_COUNT_FILE per side.
        corrupt_mem seeds a garbage memory file for the named agent on
        both sides (the unreadable-memory path)."""
        fixture = os.path.join("tests", "fixtures", "selfhost", name)
        base_env = dict(os.environ)
        base_env.pop("JESUNCODE_AI_COMMAND", None)
        if mind is not None:
            base_env["JESUNCODE_AI_COMMAND"] = (
                sys.executable + " " + os.path.join(REPO, "tests", "fixtures", mind))
        home_b = tempfile.mkdtemp(prefix="agent_home_b_")
        home_s = tempfile.mkdtemp(prefix="agent_home_s_")
        count_path = None
        if fresh_count:
            fd, count_path = tempfile.mkstemp(prefix="mindcount_")
            os.close(fd)
        try:
            envs = []
            for home in (home_b, home_s):
                env = dict(base_env)
                env["JESUN_CODE_HOME"] = home
                if corrupt_mem is not None:
                    memdir = os.path.join(home, "memory")
                    os.makedirs(memdir, exist_ok=True)
                    with open(os.path.join(memdir, corrupt_mem + ".json"),
                              "w", encoding="utf-8") as handle:
                        handle.write("{garbage")
                envs.append(env)
            if count_path is not None:
                with open(count_path, "w", encoding="utf-8") as handle:
                    handle.write("0")
                envs[0]["MIND_COUNT_FILE"] = count_path
                envs[1]["MIND_COUNT_FILE"] = count_path
            boot = run(["jesun.py", fixture], env=envs[0])
            if count_path is not None:
                # the bootstrap side consumed the counter; the self-hosted
                # side must see the identical call sequence.
                with open(count_path, "w", encoding="utf-8") as handle:
                    handle.write("0")
            selfhost = run(["jesun.py", "jesun.jc", fixture], env=envs[1])
            self.assertEqual(
                selfhost, boot,
                f"fixture {name} differs:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
            )
        finally:
            shutil.rmtree(home_b, ignore_errors=True)
            shutil.rmtree(home_s, ignore_errors=True)
            if count_path is not None:
                os.unlink(count_path)

    def check_agent_gap(self, name, mind):
        """Spec 8.3.1 (known gap): a tool that fails inside the tool loop
        diverges by design. The bootstrap feeds the failure back to the
        mind and finishes; the self-hosted walker ends the run with the
        failure's text. Both sides are pinned exactly, so this fails if
        either side changes behavior."""
        fixture = os.path.join("tests", "fixtures", "selfhost", name)
        base_env = dict(os.environ)
        base_env.pop("JESUNCODE_AI_COMMAND", None)
        base_env["JESUNCODE_AI_COMMAND"] = (
            sys.executable + " " + os.path.join(REPO, "tests", "fixtures", mind))
        home_b = tempfile.mkdtemp(prefix="agent_home_b_")
        home_s = tempfile.mkdtemp(prefix="agent_home_s_")
        fd, count_path = tempfile.mkstemp(prefix="mindcount_")
        os.close(fd)
        try:
            envs = []
            for home in (home_b, home_s):
                env = dict(base_env)
                env["JESUN_CODE_HOME"] = home
                env["MIND_COUNT_FILE"] = count_path
                envs.append(env)
            with open(count_path, "w", encoding="utf-8") as handle:
                handle.write("0")
            boot = run(["jesun.py", fixture], env=envs[0])
            with open(count_path, "w", encoding="utf-8") as handle:
                handle.write("0")
            selfhost = run(["jesun.py", "jesun.jc", fixture], env=envs[1])
            self.assertEqual(
                boot, (0, "got it\n"),
                f"fixture {name}: bootstrap changed behavior:\n{boot!r}")
            self.assertEqual(
                selfhost, (1, "kaboom\n"),
                f"fixture {name}: self-host changed behavior:\n{selfhost!r}")
        finally:
            shutil.rmtree(home_b, ignore_errors=True)
            shutil.rmtree(home_s, ignore_errors=True)
            os.unlink(count_path)

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

    def check_fleet(self, name, mind="mind_fixed.py", fresh_count=True,
                    corrupt_mem=None):
        """Differential fleet run (spec 8.4) with a fixture mind via
        JESUNCODE_AI_COMMAND. Each side gets its own fresh
        JESUN_CODE_HOME AND its own scratch working folder: fleet
        memory files and tool side effects are cwd-relative on both
        sides, so without the sandbox they would leak between the two
        sides and between runs (a stale crew.json in the repo once
        poisoned this very test). Counting minds get a fresh
        MIND_COUNT_FILE per side."""
        jesun_py = os.path.join(REPO, "jesun.py")
        jesun_jc = os.path.join(REPO, "jesun.jc")
        base_env = dict(os.environ)
        base_env.pop("JESUNCODE_AI_COMMAND", None)
        if mind is not None:
            base_env["JESUNCODE_AI_COMMAND"] = (
                sys.executable + " " + os.path.join(REPO, "tests", "fixtures", mind))
        home_b = tempfile.mkdtemp(prefix="fleet_home_b_")
        home_s = tempfile.mkdtemp(prefix="fleet_home_s_")
        cwd_b = tempfile.mkdtemp(prefix="fleet_cwd_b_")
        cwd_s = tempfile.mkdtemp(prefix="fleet_cwd_s_")
        count_path = None
        if fresh_count:
            fd, count_path = tempfile.mkstemp(prefix="mindcount_")
            os.close(fd)
        try:
            envs = []
            for home, cwd in ((home_b, cwd_b), (home_s, cwd_s)):
                shutil.copy(os.path.join(FIXTURES, name), cwd)
                env = dict(base_env)
                env["JESUN_CODE_HOME"] = home
                if corrupt_mem is not None:
                    with open(os.path.join(cwd, corrupt_mem),
                              "w", encoding="utf-8") as handle:
                        handle.write("{garbage")
                envs.append((cwd, env))
            if count_path is not None:
                with open(count_path, "w", encoding="utf-8") as handle:
                    handle.write("0")
                envs[0][1]["MIND_COUNT_FILE"] = count_path
                envs[1][1]["MIND_COUNT_FILE"] = count_path
            boot = run([jesun_py, name], cwd=envs[0][0], env=envs[0][1])
            if count_path is not None:
                with open(count_path, "w", encoding="utf-8") as handle:
                    handle.write("0")
            selfhost = run([jesun_py, jesun_jc, name], cwd=envs[1][0],
                           env=envs[1][1])
            self.assertEqual(
                selfhost, boot,
                f"fixture {name} differs:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
            )
        finally:
            for path in (home_b, home_s, cwd_b, cwd_s):
                shutil.rmtree(path, ignore_errors=True)
            if count_path is not None:
                os.unlink(count_path)

    def check_fleet_gap(self, name, mind, boot_expected, selfhost_expected,
                        gap_note):
        """Spec 8.4.1 (known gap): the bootstrap and the walker diverge by
        design. Both sides are pinned exactly, so this fails if either
        side changes behavior."""
        fixture = os.path.join("tests", "fixtures", "selfhost", name)
        base_env = dict(os.environ)
        base_env.pop("JESUNCODE_AI_COMMAND", None)
        base_env["JESUNCODE_AI_COMMAND"] = (
            sys.executable + " " + os.path.join(REPO, "tests", "fixtures", mind))
        home_b = tempfile.mkdtemp(prefix="fleet_home_b_")
        home_s = tempfile.mkdtemp(prefix="fleet_home_s_")
        fd, count_path = tempfile.mkstemp(prefix="mindcount_")
        os.close(fd)
        try:
            envs = []
            for home in (home_b, home_s):
                env = dict(base_env)
                env["JESUN_CODE_HOME"] = home
                env["MIND_COUNT_FILE"] = count_path
                envs.append(env)
            with open(count_path, "w", encoding="utf-8") as handle:
                handle.write("0")
            boot = run(["jesun.py", fixture], env=envs[0])
            with open(count_path, "w", encoding="utf-8") as handle:
                handle.write("0")
            selfhost = run(["jesun.py", "jesun.jc", fixture], env=envs[1])
            self.assertEqual(
                boot, boot_expected,
                f"fixture {name}: bootstrap changed behavior ({gap_note}):\n{boot!r}")
            self.assertEqual(
                selfhost, selfhost_expected,
                f"fixture {name}: self-host changed behavior ({gap_note}):\n{selfhost!r}")
        finally:
            shutil.rmtree(home_b, ignore_errors=True)
            shutil.rmtree(home_s, ignore_errors=True)
            os.unlink(count_path)

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


def _seed_jpm_tree(home, deep_n=0):
    """Seed a local packages/github.com/u/ tree under a temp JESUN_CODE_HOME
    (spec 8.5.6). No network: every fixture's packages are files on disk."""
    from pathlib import Path
    pkgs = Path(home) / "packages" / "github.com" / "u"

    def put(pkg, files):
        for rel, content in files.items():
            path = pkgs / pkg / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")

    put("greeter", {"greeter.jc":
                    'to greet with name\n    give back "hello, " + name\n'})
    put("oops", {"oops.jc": 'fail with "kablam"\n'})
    put("badmod", {"badmod.jc":
                   'to bad with x\n    fail with "kaboom"\n'})
    put("alpha", {"alpha.jc":
                  'to afail with x\n    bfail with x\n'})
    put("beta", {"beta.jc":
                 'to bfail with x\n    fail with "deep trouble"\n'})
    put("circa", {"circa.jc": 'bring in "circb"\n'})
    put("circb", {"circb.jc": 'bring in "circa"\n'})
    put("badjson", {"badjson.jc": 'show "never"\n',
                    "jpm.json": "{oops"})
    put("esc", {"esc.jc": 'show "never"\n',
                "jpm.json": '{"main": "../evil.jc"}'})
    (pkgs / "empty").mkdir(parents=True, exist_ok=True)
    put("multi", {"lib.jc": 'to libfn with x\n    give back x + 1\n',
                  "jpm.json": '{"main": "lib.jc"}'})
    put("banglapkg", {"banglapkg.jc":
                      "বাংলা\n"
                      "জন্যে সালাম সহ নাম\n"
                      '    দাও ফেরত "স্বাগতম, " + নাম\n'})
    put("cleanpkg", {"cleanpkg.jc": 'show "installed"\n'})
    if deep_n:
        deep = "show " + "((((((((((" * deep_n + "1" + "))))))))))" * deep_n
        put("deep", {"deep.jc": deep + "\n"})


def _seed_jpm_dirty(home):
    """A package dir that is a git checkout with uncommitted changes, so
    `use` takes the dirty path on both sides (spec 8.5.6)."""
    from pathlib import Path
    dest = Path(home) / "packages" / "github.com" / "u" / "dirty"
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "dirty.jc").write_text('show "dirty"\n', encoding="utf-8")
    git_env = dict(os.environ)
    git_env["GIT_CONFIG_NOSYSTEM"] = "1"

    def git(*args):
        subprocess.run(
            ["git", "-c", "user.email=t@t", "-c", "user.name=t",
             "-c", "init.defaultBranch=main", *args],
            cwd=str(dest), check=True, capture_output=True, env=git_env)

    git("init", "-q")
    git("add", "-A")
    git("commit", "-qm", "seed")
    (dest / "dirty.jc").write_text('show "dirty modified"\n',
                                   encoding="utf-8")


class TestSelfHostJpm(unittest.TestCase):
    def check_jpm(self, name, git_dirty=False, no_git=False):
        """Differential jpm run (spec 8.5). Each side gets its own fresh
        JESUN_CODE_HOME seeded with the identical local package tree and
        its own scratch working folder; the fixture never touches the
        network. no_git scrubs git from PATH so `use` takes the
        no-git path on both sides."""
        jesun_py = os.path.join(REPO, "jesun.py")
        jesun_jc = os.path.join(REPO, "jesun.jc")
        home_b = tempfile.mkdtemp(prefix="jpm_home_b_")
        home_s = tempfile.mkdtemp(prefix="jpm_home_s_")
        cwd_b = tempfile.mkdtemp(prefix="jpm_cwd_b_")
        cwd_s = tempfile.mkdtemp(prefix="jpm_cwd_s_")
        empty_bin = None
        try:
            _seed_jpm_tree(home_b)
            _seed_jpm_tree(home_s)
            if git_dirty:
                _seed_jpm_dirty(home_b)
                _seed_jpm_dirty(home_s)
            envs = []
            for home, cwd in ((home_b, cwd_b), (home_s, cwd_s)):
                shutil.copy(os.path.join(FIXTURES, name), cwd)
                env = dict(os.environ)
                env["JESUN_CODE_HOME"] = home
                if no_git:
                    empty_bin = tempfile.mkdtemp(prefix="jpm_nogit_")
                    env["PATH"] = empty_bin
                envs.append((cwd, env))
            boot = run([jesun_py, name], cwd=envs[0][0], env=envs[0][1])
            selfhost = run([jesun_py, jesun_jc, name], cwd=envs[1][0],
                           env=envs[1][1])
            self.assertEqual(
                selfhost, boot,
                f"fixture {name} differs:\nbootstrap={boot!r}\n"
                f"selfhost={selfhost!r}",
            )
        finally:
            for path in (home_b, home_s, cwd_b, cwd_s):
                shutil.rmtree(path, ignore_errors=True)
            if empty_bin is not None:
                shutil.rmtree(empty_bin, ignore_errors=True)

    def check_jpm_gap(self, name):
        """Spec 8.5.5 (known gap): a package whose source nests deeper
        than the parsers can recurse. The bootstrap's package loader
        catches its own RecursionError and reports TOO_DEEP at the
        bring-in line with the package tag; the self-hosted side trips
        the call-depth guard while the bootstrap interprets the walker's
        parser, so the line is a jesun.jc line and the walker's package
        tag never applies. Both sides are pinned exactly (line numbers
        normalized), so a real change on either side fails loudly."""
        jesun_py = os.path.join(REPO, "jesun.py")
        jesun_jc = os.path.join(REPO, "jesun.jc")
        home_b = tempfile.mkdtemp(prefix="jpm_gap_home_b_")
        home_s = tempfile.mkdtemp(prefix="jpm_gap_home_s_")
        cwd_b = tempfile.mkdtemp(prefix="jpm_gap_cwd_b_")
        cwd_s = tempfile.mkdtemp(prefix="jpm_gap_cwd_s_")
        try:
            _seed_jpm_tree(home_b, deep_n=30)
            _seed_jpm_tree(home_s, deep_n=30)
            envs = []
            for home, cwd in ((home_b, cwd_b), (home_s, cwd_s)):
                shutil.copy(os.path.join(FIXTURES, name), cwd)
                env = dict(os.environ)
                env["JESUN_CODE_HOME"] = home
                envs.append((cwd, env))
            boot = run([jesun_py, name], cwd=envs[0][0], env=envs[0][1])
            selfhost = run([jesun_py, jesun_jc, name], cwd=envs[1][0],
                           env=envs[1][1])
            self.assertEqual(
                boot,
                (1, "Line 1: in the \"deep\" package: I got in too deep "
                    "and stopped before falling over.\n"),
                f"fixture {name}: bootstrap changed behavior:\n{boot!r}")
            self.assertEqual(selfhost[0], 1,
                             f"fixture {name}: self-host exit changed:\n"
                             f"{selfhost!r}")
            self.assertEqual(
                LINE_RE.sub("Line N", selfhost[1]),
                "Line N: the functions are calling each other too deep; "
                "I stopped before falling over.\n",
                f"fixture {name}: self-host changed behavior:\n"
                f"{selfhost!r}")
        finally:
            for path in (home_b, home_s, cwd_b, cwd_s):
                shutil.rmtree(path, ignore_errors=True)

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
