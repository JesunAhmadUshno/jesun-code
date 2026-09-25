"""Jesun.Code v0.4 tests: file I/O and string interpolation."""
import os
import tempfile
import unittest

import jesun


class FileSandbox(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = os.getcwd()
        os.chdir(self.tmp.name)

    def tearDown(self):
        os.chdir(self.old)
        self.tmp.cleanup()

    def jc(self, src):
        return jesun.execute(src)


class FileIO(FileSandbox):
    def test_write_and_read(self):
        out = self.jc('write "hello" to file "notes.txt"\nread file "notes.txt" giving t\nshow t\n')
        self.assertEqual(out, "hello\n")

    def test_write_overwrites(self):
        out = self.jc('write "one" to file "f.txt"\nwrite "two" to file "f.txt"\nread file "f.txt" giving t\nshow t\n')
        self.assertEqual(out, "two\n")

    def test_append(self):
        out = self.jc('write "a" to file "f.txt"\nappend "b" to file "f.txt"\nappend "c" to file "f.txt"\nread file "f.txt" giving t\nshow t\n')
        self.assertEqual(out, "abc\n")

    def test_append_creates(self):
        out = self.jc('append "new" to file "fresh.txt"\nread file "fresh.txt" giving t\nshow t\n')
        self.assertEqual(out, "new\n")

    def test_write_converts_values(self):
        out = self.jc('write 42 to file "n.txt"\nread file "n.txt" giving t\nshow t\n')
        self.assertEqual(out, "42\n")
        out = self.jc('write [1, 2] to file "l.txt"\nread file "l.txt" giving t\nshow t\n')
        self.assertEqual(out, "[1, 2]\n")

    def test_path_from_variable(self):
        out = self.jc('p is "data.txt"\nwrite "x" to file p\nread file p giving t\nshow t\n')
        self.assertEqual(out, "x\n")

    def test_missing_file(self):
        out = self.jc('read file "nope.txt" giving t\n')
        self.assertEqual(out, 'Line 1: I could not find the file "nope.txt".\n')

    def test_traversal_blocked(self):
        out = self.jc('read file "../evil.txt" giving t\n')
        self.assertEqual(out, 'Line 1: I cannot read "../evil.txt": it leaves the current folder.\n')

    def test_absolute_escape_blocked(self):
        out = self.jc('write "x" to file "/etc/jesun-test.txt"\n')
        self.assertTrue(out.startswith('Line 1: I cannot write to "/etc/jesun-test.txt"'))

    def test_folder_is_not_a_file(self):
        os.mkdir("sub")
        out = self.jc('read file "sub" giving t\n')
        self.assertEqual(out, 'Line 1: "sub" is a folder, not a file.\n')

    def test_missing_parent_on_write(self):
        out = self.jc('write "x" to file "nodir/f.txt"\n')
        self.assertEqual(out, 'Line 1: I could not write "nodir/f.txt": its folder does not exist.\n')

    def test_multiline_round_trip(self):
        out = self.jc('write "line1\\nline2" to file "m.txt"\nread file "m.txt" giving t\nshow t\n')
        self.assertEqual(out, "line1\nline2\n")


class Interpolation(unittest.TestCase):
    def jc(self, src):
        return jesun.execute(src)

    def test_simple(self):
        self.assertEqual(self.jc('name is "Jesun"\nshow "Hello, {name}!"\n'), "Hello, Jesun!\n")

    def test_expression(self):
        self.assertEqual(self.jc('show "two plus two is {2 + 2}"\n'), "two plus two is 4\n")

    def test_show_forms(self):
        self.assertEqual(self.jc('show "list: {[1, 2]}"\n'), "list: [1, 2]\n")
        self.assertEqual(self.jc('show "nothing: {nothing}"\n'), "nothing: nothing\n")
        self.assertEqual(self.jc('show "flag: {true}"\n'), "flag: true\n")

    def test_in_assignment(self):
        self.assertEqual(self.jc('n is 3\nmsg is "count: {n}"\nshow msg\n'), "count: 3\n")

    def test_escaped_braces(self):
        self.assertEqual(self.jc('show "{{not a value}}"\n'), "{not a value}\n")

    def test_lone_close_brace_literal(self):
        self.assertEqual(self.jc('show "a}b"\n'), "a}b\n")

    def test_multiple(self):
        self.assertEqual(self.jc('a is 1\nb is 2\nshow "{a} and {b} make {a + b}"\n'), "1 and 2 make 3\n")

    def test_builtin_inside(self):
        self.assertEqual(self.jc('show "len: {length of [1, 2, 3]}"\n'), "len: 3\n")

    def test_empty_braces_error(self):
        self.assertEqual(self.jc('show "x{}y"\n'),
                         "Line 1: these braces are empty; put a value inside.\n")

    def test_unclosed_brace_error(self):
        self.assertEqual(self.jc('show "x{name"\n'),
                         'Line 1: this "{" never closes; add a "}" to finish it.\n')

    def test_unknown_name_inside(self):
        self.assertEqual(self.jc('show "hi {nope}"\n'),
                         'Line 1: I do not know the word "nope".\n')

    def test_write_with_interpolation(self):
        import tempfile, os
        with tempfile.TemporaryDirectory() as tmp:
            old = os.getcwd()
            os.chdir(tmp)
            try:
                out = self.jc('name is "Jesun"\nwrite "Hello, {name}!" to file "g.txt"\nread file "g.txt" giving t\nshow t\n')
            finally:
                os.chdir(old)
        self.assertEqual(out, "Hello, Jesun!\n")


class Keywords(unittest.TestCase):
    def test_write_append_are_keywords(self):
        self.assertEqual(jesun.execute('write is 5\n'), 'Line 1: I expected a value here.\n')


if __name__ == "__main__":
    unittest.main()
