"""Jesun.Code v0.5 tests: the Bangla flavor and the VS Code extension."""
import importlib.util
import json
import os
import re
import unittest
from pathlib import Path

import jesun

ROOT = Path(__file__).resolve().parent.parent
VSCODE = ROOT / "editors" / "vscode"


def bn(body):
    """Run a Bangla program (header added automatically)."""
    return jesun.execute("বাংলা\n" + body)


class BanglaHeaders(unittest.TestCase):
    def test_use_bangla_header(self):
        out = jesun.execute('use bangla\nদেখাও "হ্যালো"\n')
        self.assertEqual(out, "হ্যালো\n")

    def test_lone_bangla_word_header(self):
        out = jesun.execute('বাংলা\nদেখাও "হ্যালো"\n')
        self.assertEqual(out, "হ্যালো\n")

    def test_header_with_trailing_note(self):
        out = jesun.execute('use bangla note the header is English\nদেখাও ১\n')
        self.assertEqual(out, "1\n")

    def test_blank_lines_before_header(self):
        out = jesun.execute('\n\n  \nবাংলা\nদেখাও ২\n')
        self.assertEqual(out, "2\n")

    def test_header_must_be_first(self):
        out = jesun.execute('show 1\nuse bangla\n')
        self.assertIn("bangla", out)
        self.assertTrue(out.startswith("1\nLine 2: "))

    def test_english_keywords_are_names_in_bangla_mode(self):
        out = bn('note হয় ৫\nদেখাও note\n')
        self.assertEqual(out, "5\n")

    def test_bangla_words_are_names_in_english_mode(self):
        out = jesun.execute('দেখাও is 5\nshow দেখাও\n')
        self.assertEqual(out, "5\n")

    def test_no_header_is_english(self):
        out = jesun.execute('x is 5\nshow x\n')
        self.assertEqual(out, "5\n")


class BanglaCore(unittest.TestCase):
    def test_show_and_assign(self):
        self.assertEqual(bn('নাম হয় "জেসুন"\nদেখাও নাম\n'), "জেসুন\n")

    def test_bengali_digits(self):
        self.assertEqual(bn('x হয় ৫\nদেখাও x + ১\n'), "6\n")
        self.assertEqual(bn('দেখাও ৩.৫\n'), "3.5\n")

    def test_interpolation_with_bangla_names(self):
        out = bn('নাম হয় "জেসুন"\nদেখাও "স্বাগতম, {নাম}!"\n')
        self.assertEqual(out, "স্বাগতম, জেসুন!\n")

    def test_if_otherwise(self):
        src = ('বয়স হয় ২০\nযদি বয়স হয় নম্বরে কমপক্ষে ১৮ তাহলে\n'
               '    দেখাও "প্রাপ্তবয়স্ক"\nনইলে\n    দেখাও "ছোট"\n')
        self.assertEqual(bn(src), "প্রাপ্তবয়স্ক\n")

    def test_otherwise_if(self):
        src = ('n হয় ১\nযদি n হয় ২ তাহলে\n    দেখাও "দুই"\n'
               'নইলে যদি n হয় ১ তাহলে\n    দেখাও "এক"\nনইলে\n    দেখাও "অন্য"\n')
        self.assertEqual(bn(src), "এক\n")

    def test_repeat_times(self):
        self.assertEqual(bn('আবার ৩ বার\n    দেখাও "ঘোর"\n'), "ঘোর\n" * 3)

    def test_repeat_while(self):
        src = 'n হয় ১\nআবার যতক্ষণ n হয় ছোট চেয়ে ৪\n    দেখাও n\n    n হয় n + ১\n'
        self.assertEqual(bn(src), "1\n2\n3\n")

    def test_stop_and_skip(self):
        src = ('জন্য প্রতিটি n ভেতরে [১, ২, ৩, ৪, ৫]\n'
               '    যদি n হয় ২ তাহলে\n        এড়িয়ে\n'
               '    যদি n হয় ৪ তাহলে\n        থামো\n'
               '    দেখাও n\n')
        self.assertEqual(bn(src), "1\n3\n")

    def test_for_each(self):
        src = 'যোগফল হয় ০\nজন্য প্রতিটি ন ভেতরে [১, ২, ৩]\n    যোগফল হয় যোগফল + ন\nদেখাও যোগফল\n'
        self.assertEqual(bn(src), "6\n")

    def test_function_and_give_back(self):
        src = 'জন্যে যোগ সহ ক এবং খ\n    দাও ফেরত ক + খ\nদেখাও যোগ সহ ২ এবং ৩\n'
        self.assertEqual(bn(src), "5\n")

    def test_zero_input_auto_call(self):
        src = 'জন্যে আজ\n    দাও ফেরত "রবিবার"\nদেখাও আজ\n'
        self.assertEqual(bn(src), "রবিবার\n")

    def test_nested_blocks(self):
        src = ('জন্য প্রতিটি i ভেতরে [১, ২]\n'
               '    জন্য প্রতিটি j ভেতরে [৩, ৪]\n'
               '        দেখাও i * j\n')
        self.assertEqual(bn(src), "3\n4\n6\n8\n")

    def test_montobbo_comment(self):
        src = 'মন্তব্য এটা একটা মন্তব্য\nদেখাও ১ মন্তব্য পাশে মন্তব্য\n'
        self.assertEqual(bn(src), "1\n")

    def test_comment_word_needs_boundaries(self):
        # মন্তব্যকারী is one word, not a comment.
        out = bn('মন্তব্যকারী হয় ৭\nদেখাও মন্তব্যকারী\n')
        self.assertEqual(out, "7\n")

    def test_ask_giving(self):
        out = jesun.execute('বাংলা\nজিজ্ঞেস "নাম?" রেখে নাম\nদেখাও নাম\n', "জেসুন\n")
        self.assertEqual(out, "নাম?জেসুন\n")


class BanglaWords(unittest.TestCase):
    def test_booleans_and_nothing(self):
        self.assertEqual(bn('দেখাও সত্য\n'), "true\n")
        self.assertEqual(bn('দেখাও মিথ্যা\n'), "false\n")
        self.assertEqual(bn('দেখাও ফাঁকা\n'), "nothing\n")

    def test_logic(self):
        self.assertEqual(bn('দেখাও সত্য এবং মিথ্যা\n'), "false\n")
        self.assertEqual(bn('দেখাও সত্য অথবা মিথ্যা\n'), "true\n")
        self.assertEqual(bn('দেখাও না সত্য\n'), "false\n")

    def test_comparisons(self):
        self.assertEqual(bn('দেখাও ৫ হয় বড় চেয়ে ৩\n'), "true\n")
        self.assertEqual(bn('দেখাও ২ হয় ছোট চেয়ে ৩\n'), "true\n")
        self.assertEqual(bn('দেখাও ৫ হয় নম্বরে কমপক্ষে ৫\n'), "true\n")
        self.assertEqual(bn('দেখাও ৫ হয় নম্বরে সবচেয়ে ৬\n'), "true\n")

    def test_contains(self):
        self.assertEqual(bn('দেখাও "hello" আছে "ell"\n'), "true\n")
        self.assertEqual(bn('দেখাও [১, ২] আছে ২\n'), "true\n")

    def test_string_words(self):
        self.assertEqual(bn('দেখাও দৈর্ঘ্য এর "hello"\n'), "5\n")
        self.assertEqual(bn('দেখাও প্রথম এর [১, ২]\n'), "1\n")
        self.assertEqual(bn('দেখাও শেষ এর [১, ২]\n'), "2\n")
        self.assertEqual(bn('দেখাও বড়হাতা এর "hi"\n'), "HI\n")
        self.assertEqual(bn('দেখাও ছোটহাতা এর "HI"\n'), "hi\n")
        self.assertEqual(bn('দেখাও ভাগ এর "a,b" দিয়ে ","\n'), "[a, b]\n")
        self.assertEqual(bn('দেখাও জোড়া এর ["a", "b"] সহ "-"\n'), "a-b\n")
        self.assertEqual(bn('দেখাও ছাঁটো এর "  x  "\n'), "x\n")

    def test_at_least_most_need_at(self):
        # `at` only ever appears inside `at least` / `at most`.
        out = bn('দেখাও ৫ হয় নম্বরে কমপক্ষে ৩\n')
        self.assertEqual(out, "true\n")
        out = bn('দেখাও ৫ হয় নম্বরে সবচেয়ে ৯\n')
        self.assertEqual(out, "true\n")

    def test_import_as(self):
        out = bn('আনো math হিসেবে গণিত\nদেখাও গণিত.sqrt(১৬)\n')
        self.assertEqual(out, "4\n")


class BanglaFiles(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.TemporaryDirectory()
        self.old = os.getcwd()
        os.chdir(self.tmp.name)

    def tearDown(self):
        os.chdir(self.old)
        self.tmp.cleanup()

    def test_write_read_append(self):
        src = ('লেখো "ক" জন্যে ফাইল "f.txt"\n'
               'যোগকরো "খ" জন্যে ফাইল "f.txt"\n'
               'পড়ো ফাইল "f.txt" রেখে ভেতর\nদেখাও ভেতর\n')
        self.assertEqual(bn(src), "কখ\n")

    def test_missing_file_error(self):
        out = bn('পড়ো ফাইল "নাই.txt" রেখে x\n')
        self.assertTrue(out.startswith("Line 2: "))


class BanglaErrors(unittest.TestCase):
    def test_error_line_numbers(self):
        out = bn('দেখাও\n')
        self.assertEqual(out, "Line 2: I expected a value here.\n")

    def test_unterminated_string(self):
        out = bn('দেখাও "শেষ হয়নি\n')
        self.assertTrue(out.startswith("Line 2: "))

    def test_unknown_character(self):
        out = bn('দেখাও @\n')
        self.assertTrue(out.startswith("Line 2: "))

    def test_no_traceback_leaks(self):
        for src in ('বাংলা\nদেখাও\n', 'বাংলা\nঅজানা জিনিস হয় ১\nদেখাও অজানা + ফাঁকা\n'):
            out = jesun.execute(src)
            self.assertNotIn("Traceback", out)
            self.assertNotIn("File \"", out)


class BanglaRepl(unittest.TestCase):
    def test_block_detection(self):
        f = jesun._last_line_opens_block
        self.assertTrue(f("বাংলা\nযদি x তাহলে"))
        self.assertTrue(f("use bangla\nআবার ৩ বার"))
        self.assertTrue(f("বাংলা\nজন্য প্রতিটি x ভেতরে y"))
        self.assertTrue(f("বাংলা\nজন্যে f সহ a"))
        self.assertTrue(f("বাংলা\nনইলে"))
        self.assertFalse(f("বাংলা\nদেখাও ১"))
        # English still works.
        self.assertTrue(f("if x then"))
        self.assertFalse(f("show 1"))


class VSCodeExtension(unittest.TestCase):
    def test_all_json_parses(self):
        for rel in ("package.json", "language-configuration.json",
                    "snippets/jesun-code.json",
                    "syntaxes/jesun-code.tmLanguage.json"):
            with open(VSCODE / rel, encoding="utf-8") as fh:
                json.load(fh)

    def test_package_manifest(self):
        with open(VSCODE / "package.json", encoding="utf-8") as fh:
            pkg = json.load(fh)
        langs = pkg["contributes"]["languages"]
        self.assertEqual(langs[0]["id"], "jesun-code")
        self.assertIn(".jc", langs[0]["extensions"])
        cmds = [c["command"] for c in pkg["contributes"]["commands"]]
        self.assertIn("jesun-code.runFile", cmds)
        self.assertTrue((VSCODE / "extension.js").exists())

    def _grammar(self):
        with open(VSCODE / "syntaxes" / "jesun-code.tmLanguage.json",
                   encoding="utf-8") as fh:
            return json.load(fh)

    def test_grammar_patterns_sane(self):
        """Every regex is structurally valid (Oniguruma \\p{X} neutralized)."""
        grammar = self._grammar()

        def check(node):
            if isinstance(node, dict):
                for key in ("match", "begin", "end"):
                    if key in node:
                        pat = re.sub(r"\\p\{[A-Za-z]+\}", "[X]", node[key])
                        re.compile(pat)
                for value in node.values():
                    check(value)
            elif isinstance(node, list):
                for value in node:
                    check(value)

        check(grammar)

    def _keyword_alts(self, grammar, rule_name):
        for rule in grammar["patterns"]:
            if rule.get("name") == rule_name:
                m = rule["match"]
                start = m.index("(?:") + 3
                depth, i = 1, start
                while depth:
                    if m[i] == "(":
                        depth += 1
                    elif m[i] == ")":
                        depth -= 1
                    i += 1
                return set(m[start:i - 1].split("|"))
        self.fail(f"rule {rule_name} not found")

    def test_grammar_keywords_match_interpreter(self):
        """The grammar highlights exactly the interpreter's keywords."""
        grammar = self._grammar()
        self.assertEqual(self._keyword_alts(grammar, "keyword.control.jesun"),
                         set(jesun.KEYWORDS))
        self.assertEqual(
            self._keyword_alts(grammar, "keyword.control.bangla.jesun"),
            set(jesun.BANGLA_KEYWORDS))

    def test_grammar_is_fresh_build(self):
        """The checked-in grammar equals what the builder generates."""
        spec = importlib.util.spec_from_file_location(
            "build_grammar", VSCODE / "build-grammar.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        self.assertEqual(mod.build(), self._grammar())

    def test_snippets_shape(self):
        with open(VSCODE / "snippets" / "jesun-code.json",
                   encoding="utf-8") as fh:
            snips = json.load(fh)
        for name in ("show", "if-otherwise", "repeat", "for-each", "function",
                     "ask-ai", "bangla-header"):
            self.assertIn(name, snips)
            self.assertIn("prefix", snips[name])
            self.assertIn("body", snips[name])


if __name__ == "__main__":
    unittest.main()
