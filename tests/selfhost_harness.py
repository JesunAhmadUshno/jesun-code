"""Shared differential-test harness for the self-hosted interpreter.

Spec v1.0, section 9.3. This module consolidates the run helpers that
were inline in tests/test_selfhost.py. One protocol:

    boot, selfhost = run_both(src, stdin="", env=None, cwd=None, sandbox=False)

runs src (a fixture name under tests/fixtures/selfhost, or a path to a
.jc file) through `python jesun.py` (bootstrap) and through
`python jesun.py jesun.jc` (self-hosted) and returns the two
(returncode, stdout) pairs. The category helpers build on it: minds via
JESUNCODE_AI_COMMAND, fresh JESUN_CODE_HOME homes, fleet sandboxes, jpm
package seeding, and the pinned-gap normalizers.

This is a pure refactor of the helpers from tests/test_selfhost.py;
behavior is identical. Migrated suite files import this module instead
of duplicating the protocol.
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
JESUN_PY = os.path.join(REPO, "jesun.py")
JESUN_JC = os.path.join(REPO, "jesun.jc")


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


def resolve_src(src):
    """A fixture name becomes its path under tests/fixtures/selfhost;
    an existing path is used as-is."""
    if os.path.isfile(src):
        return src
    return os.path.join(FIXTURES, src)


def run_both(src, stdin="", env=None, cwd=None, sandbox=False):
    """Run src through the bootstrap and through jesun.jc.

    Returns ((boot_code, boot_stdout), (selfhost_code, selfhost_stdout)).
    stdin is the program's stdin text ("" means immediate EOF). With
    sandbox=True the fixture is copied into a fresh temporary working
    folder first, so both sides run in identical hermetic cwd; the
    folder is removed afterwards.
    """
    path = resolve_src(src)
    name = os.path.basename(path)
    workdir = REPO if cwd is None else cwd
    tmpdir = None
    try:
        if sandbox:
            tmpdir = tempfile.mkdtemp(prefix="selfhost_run_")
            shutil.copy(path, tmpdir)
            workdir = tmpdir
            boot = run([JESUN_PY, name], cwd=workdir, stdin_text=stdin,
                       env=env)
            selfhost = run([JESUN_PY, JESUN_JC, name], cwd=workdir,
                           stdin_text=stdin, env=env)
        else:
            boot = run([JESUN_PY, path], cwd=workdir, stdin_text=stdin,
                       env=env)
            selfhost = run([JESUN_PY, JESUN_JC, path], cwd=workdir,
                           stdin_text=stdin, env=env)
        return boot, selfhost
    finally:
        if tmpdir is not None:
            shutil.rmtree(tmpdir, ignore_errors=True)


class SelfHostTestCase(unittest.TestCase):
    """Base class carrying every differential run helper."""

    def check(self, name):
        boot, selfhost = run_both(name)
        self.assertEqual(
            selfhost, boot,
            f"fixture {name} differs:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )

    def check_stdin(self, name, stdin_text):
        boot, selfhost = run_both(name, stdin=stdin_text)
        self.assertEqual(
            selfhost, boot,
            f"fixture {name} differs:\nbootstrap={boot!r}\nselfhost={selfhost!r}",
        )

    def check_sandbox(self, name, stdin_text=None):
        fixture = os.path.join("tests", "fixtures", "selfhost", name)
        sandbox = tempfile.mkdtemp(prefix="selfhost_pb_")
        try:
            shutil.copy(os.path.join(FIXTURES, name), sandbox)
            boot = run([JESUN_PY, name], cwd=sandbox, stdin_text=stdin_text)
            selfhost = run([JESUN_PY, JESUN_JC, name], cwd=sandbox,
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
        boot = run([JESUN_PY, fixture])
        selfhost = run([JESUN_PY, JESUN_JC, fixture])
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
            boot = run([JESUN_PY, fixture], env=env)
            if count_path is not None:
                with open(count_path, "w", encoding="utf-8") as handle:
                    handle.write("0")
            selfhost = run([JESUN_PY, JESUN_JC, fixture], env=env)
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
            boot = run([JESUN_PY, fixture])
            selfhost = run([JESUN_PY, JESUN_JC, fixture])
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
            boot = run([JESUN_PY, fixture], env=envs[0])
            if count_path is not None:
                # the bootstrap side consumed the counter; the self-hosted
                # side must see the identical call sequence.
                with open(count_path, "w", encoding="utf-8") as handle:
                    handle.write("0")
            selfhost = run([JESUN_PY, JESUN_JC, fixture], env=envs[1])
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
            boot = run([JESUN_PY, fixture], env=envs[0])
            with open(count_path, "w", encoding="utf-8") as handle:
                handle.write("0")
            selfhost = run([JESUN_PY, JESUN_JC, fixture], env=envs[1])
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
            boot = run([JESUN_PY, name], cwd=envs[0][0], env=envs[0][1])
            if count_path is not None:
                with open(count_path, "w", encoding="utf-8") as handle:
                    handle.write("0")
            selfhost = run([JESUN_PY, JESUN_JC, name], cwd=envs[1][0],
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
            boot = run([JESUN_PY, fixture], env=envs[0])
            with open(count_path, "w", encoding="utf-8") as handle:
                handle.write("0")
            selfhost = run([JESUN_PY, JESUN_JC, fixture], env=envs[1])
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

    def check_jpm(self, name, git_dirty=False, no_git=False):
        """Differential jpm run (spec 8.5). Each side gets its own fresh
        JESUN_CODE_HOME seeded with the identical local package tree and
        its own scratch working folder; the fixture never touches the
        network. no_git scrubs git from PATH so `use` takes the
        no-git path on both sides."""
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
            boot = run([JESUN_PY, name], cwd=envs[0][0], env=envs[0][1])
            selfhost = run([JESUN_PY, JESUN_JC, name], cwd=envs[1][0],
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
            boot = run([JESUN_PY, name], cwd=envs[0][0], env=envs[0][1])
            selfhost = run([JESUN_PY, JESUN_JC, name], cwd=envs[1][0],
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
