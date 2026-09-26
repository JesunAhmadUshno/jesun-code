"""Jesun.Code jpm tests: the package manager.

Sprint 4 migration (spec 9.2a): program-behavior tests are
differential-green. Each program runs through the bootstrap and through
jesun.jc as subprocesses; each leg gets its own hermetic JESUN_CODE_HOME
(package trees seeded per leg, so git checkouts and package reads never
leak across legs) and its own working folder. The exact-output assertion
stays on the bootstrap leg; the walker leg must be byte-identical.

Pinned exclusions (spec 9.2c): the mocked-clone tests patch
subprocess.run in Python (a fake clone, a failing clone, a dirty-path
no-clone guard); the walker twin would need a real git server, so a
differential twin cannot share the premise. They stay as
bootstrap-only tests in JpmMockedClone below. The clone path stays
covered by tests/test_selfhost_jpm_bridge.py (the audited template
contract) plus the no-git differential fixture in this file.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

from selfhost_harness import JESUN_JC, JESUN_PY  # noqa: E402
from selfhost_harness import SelfHostDiffCase, run  # noqa: E402


def seed(home: Path, host: str, user: str, pkg: str, main_src: str,
         manifest_main: str | None = None) -> Path:
    """Seed one package tree under a leg's JESUN_CODE_HOME (spec 8.5.6).
    No network: every fixture's packages are files on disk."""
    dest = home / "packages" / host / user / pkg
    dest.mkdir(parents=True, exist_ok=True)
    manifest = {"main": manifest_main} if manifest_main else {}
    if manifest:
        (dest / "jpm.json").write_text(json.dumps(manifest),
                                       encoding="utf-8")
    target = dest / (manifest_main or f"{pkg}.jc")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(main_src, encoding="utf-8")
    return dest


def seed_starter(home: Path) -> None:
    """Copy the three starter packages into a leg's home under
    example.com, mirroring the old JpmHome seeding."""
    repo = Path(__file__).resolve().parent.parent / "packages"
    for pkg in ("time", "files", "http"):
        dest = home / "packages" / "example.com" / "jesun" / pkg
        dest.mkdir(parents=True)
        for fname in (f"{pkg}.jc", "jpm.json"):
            shutil.copy(repo / pkg / fname, dest / fname)


class JpmDiff(SelfHostDiffCase):
    """One hermetic leg per interpreter: own JESUN_CODE_HOME, own cwd,
    own seeded package tree."""

    def make_leg(self, scrub_path=False):
        d = tempfile.mkdtemp(prefix="jpm_leg_")
        self.addCleanup(shutil.rmtree, d, True)
        home = os.path.join(d, "home")
        cwd = os.path.join(d, "cwd")
        os.makedirs(cwd)
        env = dict(os.environ)
        env["JESUN_CODE_HOME"] = home
        if scrub_path:
            empty_bin = tempfile.mkdtemp(prefix="jpm_nogit_")
            self.addCleanup(shutil.rmtree, empty_bin, True)
            env["PATH"] = empty_bin
        return env, home, cwd

    def run_both(self, src, seed_fn=None, scrub_path=False):
        boot, selfhost, _ = self.run_legs(src, seed_fn, scrub_path)
        return boot, selfhost

    def run_legs(self, src, seed_fn=None, scrub_path=False):
        outs = []
        homes = []
        for args in ([JESUN_PY], [JESUN_PY, JESUN_JC]):
            env, home, cwd = self.make_leg(scrub_path)
            if seed_fn is not None:
                seed_fn(Path(home))
            prog = os.path.join(cwd, "prog.jc")
            with open(prog, "w", encoding="utf-8") as handle:
                handle.write(src)
            outs.append(run(args + [prog], cwd=cwd, env=env))
            homes.append(home)
        return outs[0], outs[1], homes


class UseAddress(JpmDiff):
    def test_malformed_addresses(self):
        # Each bad address runs as its own program: the first failing
        # `use` ends the run, so a loop would exercise only the first.
        bads = ("justaWord", "a/b", "a/b/c/d", "github.com/../evil",
                "github.com//pkg", "/etc/passwd", "")
        for bad in bads:
            boot, selfhost = self.run_both(f'use "{bad}"\n')
            self.assert_differential(boot, selfhost,
                                     f"malformed-address {bad!r}")
            self.assertIn("is not a package address", boot[1], bad)

    def test_non_string_address(self):
        boot, selfhost = self.run_both("use 42\n")
        self.assert_differential(boot, selfhost, "non-string-address")
        self.assertIn("is not a package address", boot[1])

    def test_non_github_host(self):
        boot, selfhost = self.run_both('use "gitlab.com/jesun/pkg"\n')
        self.assert_differential(boot, selfhost, "non-github-host")
        self.assertIn("I can only fetch packages from github.com", boot[1])

    def test_no_git_is_plain(self):
        """Spec 9.2c sanction: the mock only removes git from PATH, so
        the twin runs with a scrubbed PATH instead."""
        boot, selfhost = self.run_both('use "github.com/jesun/demo"\n',
                                       scrub_path=True)
        self.assert_differential(boot, selfhost, "no-git")
        self.assertIn("I need git to fetch packages", boot[1])

    def test_dirty_checkout_refuses(self):
        if shutil.which("git") is None:
            self.skipTest("git not installed")

        def dirty_seed(home):
            dest = seed(home, "github.com", "jesun", "demo",
                        'to demo_hello\n    give back "hi"\n')
            subprocess.run(["git", "init", "-q"], cwd=dest, check=True,
                           capture_output=True)
            (dest / "local-edit.txt").write_text("mine", encoding="utf-8")

        boot, selfhost = self.run_both('use "github.com/jesun/demo"\n',
                                       seed_fn=dirty_seed)
        self.assert_differential(boot, selfhost, "dirty-checkout")
        self.assertIn("has local changes", boot[1])


class BringIn(JpmDiff):
    def test_unknown_package(self):
        boot, selfhost = self.run_both('bring in "ghost"\n')
        self.assert_differential(boot, selfhost, "unknown-package")
        self.assertIn('I have not fetched the package "ghost" yet', boot[1])

    def test_bad_name(self):
        # Each bad name runs as its own program: the first failing
        # `bring in` ends the run, so a loop would exercise only the
        # first.
        for bad in ("../x", "..", ""):
            boot, selfhost = self.run_both(f'bring in "{bad}"\n')
            self.assert_differential(boot, selfhost,
                                     f"bad-name {bad!r}")
            self.assertTrue("is not a package name" in boot[1]
                            or "have not fetched" in boot[1], bad)

    def test_load_and_call(self):
        def seeds(home):
            seed(home, "github.com", "jesun", "demo",
                 'to demo_hello\n    give back "hi from demo"\n')
        boot, selfhost = self.run_both(
            'bring in "demo"\nshow demo_hello\n', seed_fn=seeds)
        self.assert_differential(boot, selfhost, "load-and-call")
        self.assertEqual(boot[1], "hi from demo\n")

    def test_manifest_main(self):
        def seeds(home):
            seed(home, "github.com", "jesun", "demo",
                 'to demo_deep\n    give back 42\n',
                 manifest_main="src/main.jc")
        boot, selfhost = self.run_both(
            'bring in "demo"\nshow demo_deep\n', seed_fn=seeds)
        self.assert_differential(boot, selfhost, "manifest-main")
        self.assertEqual(boot[1], "42\n")

    def test_manifest_escape_refused(self):
        def seeds(home):
            seed(home, "github.com", "jesun", "demo",
                 'show "evil"\n', manifest_main="../evil.jc")
        boot, selfhost = self.run_both('bring in "demo"\n',
                                       seed_fn=seeds)
        self.assert_differential(boot, selfhost, "manifest-escape")
        self.assertIn("points outside its own folder", boot[1])

    def test_missing_code_file(self):
        def seeds(home):
            (home / "packages" / "github.com" / "jesun" / "demo"
             ).mkdir(parents=True)
        boot, selfhost = self.run_both('bring in "demo"\n',
                                       seed_fn=seeds)
        self.assert_differential(boot, selfhost, "missing-code-file")
        self.assertIn("cannot find its code file", boot[1])

    def test_package_error_names_package(self):
        def seeds(home):
            seed(home, "github.com", "jesun", "demo",
                 'to demo_bad\n    show nosuchvar\n')
        boot, selfhost = self.run_both(
            'bring in "demo"\nshow demo_bad\n', seed_fn=seeds)
        self.assert_differential(boot, selfhost, "package-error-tag")
        self.assertIn('in the "demo" package', boot[1])

    def test_circle(self):
        def seeds(home):
            seed(home, "github.com", "jesun", "alpha",
                 'bring in "beta"\n')
            seed(home, "github.com", "jesun", "beta",
                 'bring in "alpha"\n')
        boot, selfhost = self.run_both('bring in "alpha"\n',
                                       seed_fn=seeds)
        self.assert_differential(boot, selfhost, "package-circle")
        self.assertIn("bring each other in a circle", boot[1])


class StarterPackages(JpmDiff):
    """The shipped starter packages really run through both
    interpreters; the files package writes into each leg's own cwd."""

    def test_time_package(self):
        # The two legs read the clock separately, so the outputs can
        # tick apart by a second between legs. Normalize the date/time
        # shapes before the differential compare; the exact shape is
        # still asserted on the bootstrap leg.
        def normalized(pair):
            code, out = pair
            out = re.sub(r"\d{4}-\d{2}-\d{2}", "<DATE>", out)
            out = re.sub(r"\d{2}:\d{2}:\d{2}", "<TIME>", out)
            return (code, out)

        boot, selfhost = self.run_both(
            'bring in "time"\nshow time_today\n', seed_fn=seed_starter)
        self.assert_differential(normalized(boot), normalized(selfhost),
                                 "time-package")
        self.assertRegex(boot[1], r"^\d{4}-\d{2}-\d{2}\n$")
        boot2, selfhost2 = self.run_both(
            'bring in "time"\nshow time_now\n', seed_fn=seed_starter)
        self.assert_differential(normalized(boot2), normalized(selfhost2),
                                 "time-now")
        self.assertRegex(boot2[1], r"^\d{2}:\d{2}:\d{2}\n$")

    def test_files_package(self):
        boot, selfhost = self.run_both(
            'bring in "files"\n'
            'write "abc" to file "probe.txt"\n'
            'show files_exists with "probe.txt"\n'
            'show files_size with "probe.txt"\n'
            'files_delete with "probe.txt"\n'
            'show files_exists with "probe.txt"\n',
            seed_fn=seed_starter)
        self.assert_differential(boot, selfhost, "files-package")
        self.assertEqual(boot[1], "true\n3\nfalse\n")


def _fake_clone_ok(home: Path):
    """A subprocess.run replacement that pretends git cloned pkg 'demo'."""
    def run(cmd, **kwargs):
        dest = Path(cmd[-1])
        seed(home, "github.com", "jesun", "demo",
             'to demo_hello\n    give back "hi from demo"\n')
        m = mock.MagicMock()
        m.returncode = 0
        m.stdout = ""
        return m
    return run


class JpmMockedClone(unittest.TestCase):
    """Pinned exclusion (spec 9.2c): these tests patch subprocess.run
    in Python (a fake clone, a failing clone, a no-reclone guard); the
    walker twin would need a real git server, so a differential twin
    cannot share the premise. The clone path stays covered by
    tests/test_selfhost_jpm_bridge.py (the audited template contract)
    plus the no-git differential fixture above."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.old = os.environ.get("JESUN_CODE_HOME")
        os.environ["JESUN_CODE_HOME"] = str(self.home)

    def tearDown(self):
        if self.old is None:
            os.environ.pop("JESUN_CODE_HOME", None)
        else:
            os.environ["JESUN_CODE_HOME"] = self.old
        self.tmp.cleanup()

    def jc(self, src):
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        import jesun
        return jesun.execute(src)

    def test_clone_failure_is_plain(self):
        with mock.patch("subprocess.run",
                        side_effect=subprocess.CalledProcessError(128, "git")):
            out = self.jc('use "github.com/jesun/nope"\n')
        self.assertIn('I could not fetch "github.com/jesun/nope"', out)
        self.assertFalse(
            (self.home / "packages" / "github.com" / "jesun" / "nope").exists())

    def test_install_then_reuse(self):
        with mock.patch("subprocess.run",
                        side_effect=_fake_clone_ok(self.home)):
            out = self.jc('use "github.com/jesun/demo"\nshow "ok"\n')
            self.assertEqual(out, "ok\n")
        dest = self.home / "packages" / "github.com" / "jesun" / "demo"
        self.assertTrue((dest / "demo.jc").is_file())

        def no_clone(cmd, **kwargs):
            if "clone" in cmd:
                raise AssertionError("must not clone again")
            m = mock.MagicMock()
            m.returncode = 128
            m.stdout = ""
            return m
        with mock.patch("subprocess.run", side_effect=no_clone) as run:
            out = self.jc('use "github.com/jesun/demo"\nshow "ok"\n')
            self.assertEqual(out, "ok\n")
            for call in run.call_args_list:
                self.assertNotIn("clone", call.args[0])

    def test_address_expression(self):
        with mock.patch("subprocess.run",
                        side_effect=_fake_clone_ok(self.home)):
            out = self.jc('addr is "github.com/jesun/demo"\nuse addr\n'
                          'bring in "demo"\nshow demo_hello\n')
            self.assertEqual(out, "hi from demo\n")


if __name__ == "__main__":
    unittest.main()
