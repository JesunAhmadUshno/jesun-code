"""Jesun.Code jpm tests: the package manager.

`use` clone paths are tested with a mocked subprocess.run (no network);
`bring in` runs against package dirs seeded under a temp JESUN_CODE_HOME.
"""
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import jesun


def _seed(home: Path, host: str, user: str, pkg: str, main_src: str,
          manifest_main: str | None = None) -> Path:
    dest = home / "packages" / host / user / pkg
    dest.mkdir(parents=True, exist_ok=True)
    manifest = {"main": manifest_main} if manifest_main else {}
    if manifest:
        (dest / "jpm.json").write_text(json.dumps(manifest), encoding="utf-8")
    target = dest / (manifest_main or f"{pkg}.jc")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(main_src, encoding="utf-8")
    return dest


def _fake_clone_ok(home: Path):
    """A subprocess.run replacement that pretends git cloned pkg 'demo'."""
    def run(cmd, **kwargs):
        dest = Path(cmd[-1])
        _seed(home, "github.com", "jesun", "demo",
              'to demo_hello\n    give back "hi from demo"\n')
        m = mock.MagicMock()
        m.returncode = 0
        m.stdout = ""
        return m
    return run


class JpmHome(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.env = mock.patch.dict(os.environ, {"JESUN_CODE_HOME": str(self.home)})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def jc(self, src):
        return jesun.execute(src)


class UseAddress(JpmHome):
    def test_malformed_addresses(self):
        for bad in ["justaWord", "a/b", "a/b/c/d", "github.com/../evil",
                    "github.com//pkg", "/etc/passwd", ""]:
            out = self.jc(f'use "{bad}"\n')
            self.assertIn("is not a package address", out, bad)

    def test_non_string_address(self):
        out = self.jc("use 42\n")
        self.assertIn("is not a package address", out)

    def test_non_github_host(self):
        out = self.jc('use "gitlab.com/jesun/pkg"\n')
        self.assertIn("I can only fetch packages from github.com", out)

    def test_clone_failure_is_plain(self):
        with mock.patch("subprocess.run",
                        side_effect=subprocess.CalledProcessError(128, "git")):
            out = self.jc('use "github.com/jesun/nope"\n')
        self.assertIn('I could not fetch "github.com/jesun/nope"', out)
        # the half-made folder is cleaned up
        self.assertFalse(
            (self.home / "packages" / "github.com" / "jesun" / "nope").exists())

    def test_install_then_reuse(self):
        with mock.patch("subprocess.run", side_effect=_fake_clone_ok(self.home)):
            out = self.jc('use "github.com/jesun/demo"\nshow "ok"\n')
            self.assertEqual(out, "ok\n")
        dest = self.home / "packages" / "github.com" / "jesun" / "demo"
        self.assertTrue((dest / "demo.jc").is_file())
        # second use must not clone again (the git status check may run)
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

    def test_dirty_checkout_refuses(self):
        if shutil.which("git") is None:
            self.skipTest("git not installed")
        dest = _seed(self.home, "github.com", "jesun", "demo",
                     'to demo_hello\n    give back "hi"\n')
        subprocess.run(["git", "init", "-q"], cwd=dest, check=True,
                       capture_output=True)
        (dest / "local-edit.txt").write_text("mine", encoding="utf-8")
        with mock.patch("subprocess.run",
                        wraps=subprocess.run) as run:
            out = self.jc('use "github.com/jesun/demo"\n')
            self.assertIn("has local changes", out)
            # only the status check ran, never a clone
            for call in run.call_args_list:
                self.assertNotIn("clone", call.args[0])

    def test_no_git_is_plain(self):
        with mock.patch("shutil.which", return_value=None):
            out = self.jc('use "github.com/jesun/demo"\n')
        self.assertIn("I need git to fetch packages", out)


class BringIn(JpmHome):
    def test_unknown_package(self):
        out = self.jc('bring in "ghost"\n')
        self.assertIn('I have not fetched the package "ghost" yet', out)

    def test_bad_name(self):
        for bad in ["../x", "..", ""]:
            out = self.jc(f'bring in "{bad}"\n')
            self.assertTrue("is not a package name" in out
                            or "have not fetched" in out, bad)

    def test_load_and_call(self):
        _seed(self.home, "github.com", "jesun", "demo",
              'to demo_hello\n    give back "hi from demo"\n')
        out = self.jc('bring in "demo"\nshow demo_hello\n')
        self.assertEqual(out, "hi from demo\n")

    def test_manifest_main(self):
        _seed(self.home, "github.com", "jesun", "demo",
              'to demo_deep\n    give back 42\n',
              manifest_main="src/main.jc")
        out = self.jc('bring in "demo"\nshow demo_deep\n')
        self.assertEqual(out, "42\n")

    def test_manifest_escape_refused(self):
        _seed(self.home, "github.com", "jesun", "demo",
              'show "evil"\n', manifest_main="../evil.jc")
        out = self.jc('bring in "demo"\n')
        self.assertIn("points outside its own folder", out)

    def test_missing_code_file(self):
        dest = self.home / "packages" / "github.com" / "jesun" / "demo"
        dest.mkdir(parents=True)
        out = self.jc('bring in "demo"\n')
        self.assertIn("cannot find its code file", out)

    def test_package_error_names_package(self):
        _seed(self.home, "github.com", "jesun", "demo",
              'to demo_bad\n    show nosuchvar\n')
        out = self.jc('bring in "demo"\nshow demo_bad\n')
        self.assertIn('in the "demo" package', out)

    def test_circle(self):
        _seed(self.home, "github.com", "jesun", "alpha",
              'bring in "beta"\n')
        _seed(self.home, "github.com", "jesun", "beta",
              'bring in "alpha"\n')
        out = self.jc('bring in "alpha"\n')
        self.assertIn("bring each other in a circle", out)

    def test_address_expression(self):
        with mock.patch("subprocess.run", side_effect=_fake_clone_ok(self.home)):
            out = self.jc('addr is "github.com/jesun/demo"\nuse addr\n'
                          'bring in "demo"\nshow demo_hello\n')
            self.assertEqual(out, "hi from demo\n")


class StarterPackages(unittest.TestCase):
    """The shipped starter packages really run through the interpreter."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        repo = Path(__file__).resolve().parent.parent / "packages"
        for pkg in ("time", "files", "http"):
            dest = self.home / "packages" / "example.com" / "jesun" / pkg
            dest.mkdir(parents=True)
            for fname in (f"{pkg}.jc", "jpm.json"):
                shutil.copy(repo / pkg / fname, dest / fname)
        self.env = mock.patch.dict(os.environ, {"JESUN_CODE_HOME": str(self.home)})
        self.env.start()
        self.work = tempfile.TemporaryDirectory()
        self.old = os.getcwd()
        os.chdir(self.work.name)

    def tearDown(self):
        os.chdir(self.old)
        self.work.cleanup()
        self.env.stop()
        self.tmp.cleanup()

    def test_time_package(self):
        out = jesun.execute('bring in "time"\nshow time_today\n')
        self.assertRegex(out, r"^\d{4}-\d{2}-\d{2}\n$")
        out = jesun.execute('bring in "time"\nshow time_now\n')
        self.assertRegex(out, r"^\d{2}:\d{2}:\d{2}\n$")

    def test_files_package(self):
        out = jesun.execute(
            'bring in "files"\n'
            'write "abc" to file "probe.txt"\n'
            'show files_exists with "probe.txt"\n'
            'show files_size with "probe.txt"\n'
            'files_delete with "probe.txt"\n'
            'show files_exists with "probe.txt"\n')
        self.assertEqual(out, "true\n3\nfalse\n")


if __name__ == "__main__":
    unittest.main()
