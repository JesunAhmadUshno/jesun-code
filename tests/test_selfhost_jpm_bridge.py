"""Direct unit tests of the walker's jpm bridge template (spec 8.5.6).

`_JPM_HELPERS_SRC` lives in jesun.jc as a joined list of Jesun.Code
string literals. Jesun.Code string escapes resolve identically to
Python's for every sequence the template uses (`\\\\` -> `\\`,
`\\"` -> `"`, verified against `_read_string` in jesun.py), so the
list literal is extracted from jesun.jc with `ast.literal_eval` and
joined exactly the way the walker joins it. The tests then exercise
the template's outcome codes directly, including the `use`
clone-success path that no fixture can reach (no network in tests:
`subprocess.run` is mocked).

The template contract under test: it never contains program text,
nothing in it raises, every outcome is a ["code", ...] list.
"""
import ast
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parent.parent


def load_jpm_template():
    src = (REPO / "jesun.jc").read_text(encoding="utf-8")
    start = src.index("_JPM_HELPERS_SRC is join of [")
    i = src.index("[", start)
    depth = 0
    for j in range(i, len(src)):
        if src[j] == "[":
            depth += 1
        elif src[j] == "]":
            depth -= 1
            if depth == 0:
                end = j + 1
                break
    items = ast.literal_eval(src[i:end])
    template = "\n".join(items)
    namespace = {}
    exec(template, namespace)  # noqa: S102 - the audited template
    return namespace, template


NS, TEMPLATE = load_jpm_template()


class TemplateContract(unittest.TestCase):
    def test_template_exports_the_four_helpers(self):
        self.assertEqual(
            sorted(k for k in NS if k.startswith("_jc_jpm")),
            ["_jc_jpm_find", "_jc_jpm_main", "_jc_jpm_read", "_jc_jpm_use"])

    def test_template_has_no_leak_markers(self):
        for marker in ("Traceback", 'File "', "0x", "Traceback (most"):
            self.assertNotIn(marker, TEMPLATE)

    def test_template_never_shells_out(self):
        self.assertNotIn("shell=True", TEMPLATE)
        self.assertNotIn("os.system", TEMPLATE)


class JpmFind(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp(prefix="jpm_bridge_")
        self.env = mock.patch.dict(os.environ,
                                   {"JESUN_CODE_HOME": self.home})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        shutil.rmtree(self.home, ignore_errors=True)

    def test_missing_packages_dir(self):
        self.assertEqual(NS["_jc_jpm_find"]("demo"), ["missing"])

    def test_finds_package(self):
        dest = Path(self.home) / "packages" / "github.com" / "u" / "demo"
        dest.mkdir(parents=True)
        self.assertEqual(NS["_jc_jpm_find"]("demo"), ["ok", str(dest)])

    def test_skips_files(self):
        pkgs = Path(self.home) / "packages" / "github.com" / "u"
        pkgs.mkdir(parents=True)
        (pkgs / "demo").write_text("not a dir", encoding="utf-8")
        self.assertEqual(NS["_jc_jpm_find"]("demo"), ["missing"])


class JpmUse(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp(prefix="jpm_bridge_")
        self.env = mock.patch.dict(os.environ,
                                   {"JESUN_CODE_HOME": self.home})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        shutil.rmtree(self.home, ignore_errors=True)

    def dest(self, pkg="demo"):
        return Path(self.home) / "packages" / "github.com" / "u" / pkg

    def test_no_git_missing_dest(self):
        with mock.patch("shutil.which", return_value=None):
            self.assertEqual(NS["_jc_jpm_use"]("github.com", "u", "demo"),
                             ["no_git"])

    def test_no_git_existing_dest_is_already(self):
        self.dest().mkdir(parents=True)
        with mock.patch("shutil.which", return_value=None):
            self.assertEqual(NS["_jc_jpm_use"]("github.com", "u", "demo"),
                             ["already"])

    def test_clean_checkout_is_already(self):
        self.dest().mkdir(parents=True)
        done = mock.Mock(returncode=0, stdout="")
        with mock.patch("shutil.which", return_value="/usr/bin/git"), \
                mock.patch("subprocess.run", return_value=done):
            self.assertEqual(NS["_jc_jpm_use"]("github.com", "u", "demo"),
                             ["already"])

    def test_dirty_checkout(self):
        self.dest().mkdir(parents=True)
        done = mock.Mock(returncode=0, stdout=" M dirty.jc\n")
        with mock.patch("shutil.which", return_value="/usr/bin/git"), \
                mock.patch("subprocess.run", return_value=done):
            self.assertEqual(NS["_jc_jpm_use"]("github.com", "u", "demo"),
                             ["dirty"])

    def test_git_status_crash_is_already(self):
        self.dest().mkdir(parents=True)
        with mock.patch("shutil.which", return_value="/usr/bin/git"), \
                mock.patch("subprocess.run",
                           side_effect=OSError("git exploded")):
            self.assertEqual(NS["_jc_jpm_use"]("github.com", "u", "demo"),
                             ["already"])

    def test_clone_success(self):
        def fake_run(cmd, **kwargs):
            Path(cmd[-1]).mkdir(parents=True, exist_ok=True)
            return mock.Mock(returncode=0)

        with mock.patch("shutil.which", return_value="/usr/bin/git"), \
                mock.patch("subprocess.run", side_effect=fake_run) as run:
            result = NS["_jc_jpm_use"]("github.com", "u", "demo")
        self.assertEqual(result, ["cloned"])
        self.assertTrue(self.dest().is_dir())
        clone_cmd = run.call_args[0][0]
        self.assertEqual(clone_cmd[:4],
                         ["/usr/bin/git", "clone", "--depth", "1"])
        self.assertEqual(clone_cmd[4], "https://github.com/u/demo")
        self.assertNotIn("shell", run.call_args[1])

    def test_clone_failure_removes_dest(self):
        with mock.patch("shutil.which", return_value="/usr/bin/git"), \
                mock.patch("subprocess.run",
                           side_effect=subprocess.CalledProcessError(
                               128, "git")):
            result = NS["_jc_jpm_use"]("github.com", "u", "demo")
        self.assertEqual(result, ["fetch_failed"])
        self.assertFalse(self.dest().exists())

    def test_never_raises_on_validated_segments(self):
        # The walker validates every segment before calling (non-empty,
        # _JPM_SEGMENT, no ".."); on that domain the template answers
        # in codes and never raises.
        with mock.patch("shutil.which", return_value=None):
            self.assertEqual(
                NS["_jc_jpm_use"]("github.com", "u", "demo"), ["no_git"])
            self.assertEqual(
                NS["_jc_jpm_use"]("github.com", "", ""), ["no_git"])


class JpmMain(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp(prefix="jpm_bridge_")
        self.dest = Path(self.home) / "packages" / "github.com" / "u" / "demo"
        self.dest.mkdir(parents=True)

    def tearDown(self):
        shutil.rmtree(self.home, ignore_errors=True)

    def test_default_main(self):
        (self.dest / "demo.jc").write_text("show 1\n", encoding="utf-8")
        code, fname, resolved = NS["_jc_jpm_main"](str(self.dest), "demo")
        self.assertEqual((code, fname), ("ok", "demo.jc"))
        self.assertTrue(os.path.isabs(resolved))

    def test_manifest_picks_main(self):
        (self.dest / "jpm.json").write_text('{"main": "lib.jc"}',
                                            encoding="utf-8")
        (self.dest / "lib.jc").write_text("show 1\n", encoding="utf-8")
        code, fname, _ = NS["_jc_jpm_main"](str(self.dest), "demo")
        self.assertEqual((code, fname), ("ok", "lib.jc"))

    def test_manifest_garbage(self):
        (self.dest / "jpm.json").write_text("{oops", encoding="utf-8")
        self.assertEqual(NS["_jc_jpm_main"](str(self.dest), "demo"),
                         ["manifest_bad"])

    def test_manifest_escape(self):
        (self.dest / "jpm.json").write_text('{"main": "../evil.jc"}',
                                            encoding="utf-8")
        self.assertEqual(NS["_jc_jpm_main"](str(self.dest), "demo"),
                         ["escape"])

    def test_missing_file(self):
        self.assertEqual(NS["_jc_jpm_main"](str(self.dest), "demo"),
                         ["no_file", "demo.jc"])

    def test_missing_dest_never_raises(self):
        self.assertEqual(
            NS["_jc_jpm_main"]("/nonexistent-dir-xyz", "demo"),
            ["no_file", "demo.jc"])


class JpmRead(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp(prefix="jpm_bridge_")

    def tearDown(self):
        shutil.rmtree(self.home, ignore_errors=True)

    def test_read_ok(self):
        path = Path(self.home) / "demo.jc"
        path.write_text("show 1\n", encoding="utf-8")
        self.assertEqual(NS["_jc_jpm_read"](str(path)), ["ok", "show 1\n"])

    def test_read_missing(self):
        self.assertEqual(NS["_jc_jpm_read"](
            os.path.join(self.home, "nope.jc")), ["failed"])


if __name__ == "__main__":
    unittest.main()
