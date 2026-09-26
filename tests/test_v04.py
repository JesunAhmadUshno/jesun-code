"""Jesun.Code v0.4 tests: file I/O and string interpolation.

Sprint 4 migration (spec 9.2a): every test is differential-green. Each
program runs through the bootstrap and through jesun.jc; the walker leg
must equal the bootstrap leg, and the exact-output assertion stays on
the bootstrap leg. File I/O tests share one InlineSandbox per test so
files persist between the test's programs, exactly like the old
chdir-tempdir fixture.
"""
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from selfhost_harness import InlineSandbox, SelfHostDiffCase  # noqa: E402


class FileSandbox(SelfHostDiffCase):
    def setUp(self):
        self.sandbox = InlineSandbox()

    def tearDown(self):
        self.sandbox.close()

    def jc(self, src, expected):
        boot, selfhost = self.sandbox.run(src)
        self.assert_differential(boot, selfhost, f"program {src!r}")
        self.assertEqual(boot[1], expected)
        return boot


class FileIO(FileSandbox):
    def test_write_and_read(self):
        self.jc('write "hello" to file "notes.txt"\nread file "notes.txt" giving t\nshow t\n',
                "hello\n")

    def test_write_overwrites(self):
        self.jc('write "one" to file "f.txt"\nwrite "two" to file "f.txt"\nread file "f.txt" giving t\nshow t\n',
                "two\n")

    def test_append(self):
        self.jc('write "a" to file "f.txt"\nappend "b" to file "f.txt"\nappend "c" to file "f.txt"\nread file "f.txt" giving t\nshow t\n',
                "abc\n")

    def test_append_creates(self):
        self.jc('append "new" to file "fresh.txt"\nread file "fresh.txt" giving t\nshow t\n',
                "new\n")

    def test_write_converts_values(self):
        self.jc('write 42 to file "n.txt"\nread file "n.txt" giving t\nshow t\n',
                "42\n")
        self.jc('write [1, 2] to file "l.txt"\nread file "l.txt" giving t\nshow t\n',
                "[1, 2]\n")

    def test_path_from_variable(self):
        self.jc('p is "data.txt"\nwrite "x" to file p\nread file p giving t\nshow t\n',
                "x\n")

    def test_missing_file(self):
        self.jc('read file "nope.txt" giving t\n',
                'Line 1: I could not find the file "nope.txt".\n')

    def test_traversal_blocked(self):
        self.jc('read file "../evil.txt" giving t\n',
                'Line 1: I cannot read "../evil.txt": it leaves the current folder.\n')

    def test_absolute_escape_blocked(self):
        boot, selfhost = self.sandbox.run(
            'write "x" to file "/etc/jesun-test.txt"\n')
        self.assert_differential(boot, selfhost, "absolute escape")
        self.assertTrue(
            boot[1].startswith('Line 1: I cannot write to "/etc/jesun-test.txt"'),
            f"unexpected: {boot[1]!r}")

    def test_folder_is_not_a_file(self):
        self.sandbox.mkdir("sub")
        self.jc('read file "sub" giving t\n',
                'Line 1: "sub" is a folder, not a file.\n')

    def test_missing_parent_on_write(self):
        self.jc('write "x" to file "nodir/f.txt"\n',
                'Line 1: I could not write "nodir/f.txt": its folder does not exist.\n')

    def test_multiline_round_trip(self):
        self.jc('write "line1\\nline2" to file "m.txt"\nread file "m.txt" giving t\nshow t\n',
                "line1\nline2\n")


class Interpolation(SelfHostDiffCase):
    def test_simple(self):
        self.check_program('name is "Jesun"\nshow "Hello, {name}!"\n',
                           "Hello, Jesun!\n")

    def test_expression(self):
        self.check_program('show "two plus two is {2 + 2}"\n',
                           "two plus two is 4\n")

    def test_show_forms(self):
        self.check_program('show "list: {[1, 2]}"\n', "list: [1, 2]\n")
        self.check_program('show "nothing: {nothing}"\n', "nothing: nothing\n")
        self.check_program('show "flag: {true}"\n', "flag: true\n")

    def test_in_assignment(self):
        self.check_program('n is 3\nmsg is "count: {n}"\nshow msg\n',
                           "count: 3\n")

    def test_escaped_braces(self):
        self.check_program('show "{{not a value}}"\n', "{not a value}\n")

    def test_lone_close_brace_literal(self):
        self.check_program('show "a}b"\n', "a}b\n")

    def test_multiple(self):
        self.check_program('a is 1\nb is 2\nshow "{a} and {b} make {a + b}"\n',
                           "1 and 2 make 3\n")

    def test_builtin_inside(self):
        self.check_program('show "len: {length of [1, 2, 3]}"\n', "len: 3\n")

    def test_empty_braces_error(self):
        self.check_program('show "x{}y"\n',
                           "Line 1: these braces are empty; put a value inside.\n")

    def test_unclosed_brace_error(self):
        self.check_program('show "x{name"\n',
                           'Line 1: this "{" never closes; add a "}" to finish it.\n')

    def test_unknown_name_inside(self):
        self.check_program('show "hi {nope}"\n',
                           'Line 1: I do not know the word "nope".\n')

    def test_write_with_interpolation(self):
        sandbox = InlineSandbox()
        try:
            boot, selfhost = sandbox.run(
                'name is "Jesun"\nwrite "Hello, {name}!" to file "g.txt"\n'
                'read file "g.txt" giving t\nshow t\n')
            self.assert_differential(boot, selfhost, "write_with_interpolation")
            self.assertEqual(boot[1], "Hello, Jesun!\n")
        finally:
            sandbox.close()


class Keywords(SelfHostDiffCase):
    def test_write_append_are_keywords(self):
        self.check_program('write is 5\n',
                           'Line 1: I expected a value here.\n')


if __name__ == "__main__":
    unittest.main()
