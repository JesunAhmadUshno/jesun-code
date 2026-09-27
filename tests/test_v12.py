"""Jesun.Code v1.2 tests: native tables and JSON (spec v1.2 sections 1-2).

Sprint 2. Every behavior test is differential: each program runs through
the bootstrap (jesun.py) and through the self-hosted walker (jesun.jc);
the walker leg must equal the bootstrap leg, and the exact-output
assertion stays on the bootstrap leg. Error-message tests pin the
plain-English wording on both legs.
"""
import sys
import unittest
from pathlib import Path

import jesun

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))

from selfhost_harness import SelfHostDiffCase  # noqa: E402


class Tables(SelfHostDiffCase):
    def test_new_table_set_get(self):
        self.check_program(
            'user is a new table\n'
            'user["name"] is "Jesun"\n'
            'user["age"] is 29\n'
            'show user["name"]\n'
            'show user["age"]\n',
            "Jesun\n29\n",
        )

    def test_new_table_without_article(self):
        self.check_program(
            't is new table\nshow t\n',
            "{}\n",
        )

    def test_table_literal(self):
        self.check_program(
            'point is {"x": 10, "y": 20}\n'
            'show point["x"]\n'
            'show point\n',
            "10\n{\"x\": 10, \"y\": 20}\n",
        )

    def test_table_display_nested(self):
        self.check_program(
            't is {"a": {"b": [1, {"c": true}]}, "d": nothing}\nshow t\n',
            '{"a": {"b": [1, {"c": true}]}, "d": nothing}\n',
        )

    def test_missing_key_is_nothing(self):
        self.check_program(
            't is {"a": 1}\nshow t["missing"]\n',
            "nothing\n",
        )

    def test_keys_of_insertion_order(self):
        self.check_program(
            't is new table\n'
            't["b"] is 2\n'
            't["a"] is 1\n'
            'show keys of t\n',
            "[b, a]\n",
        )

    def test_keys_of_literal(self):
        self.check_program(
            'show keys of {"z": 1, "m": 2}\n',
            "[z, m]\n",
        )

    def test_contains_key(self):
        self.check_program(
            't is {"a": 1}\n'
            'show t contains "a"\n'
            'show t contains "zzz"\n'
            'show t contains 1\n',
            "true\nfalse\nfalse\n",
        )

    def test_deep_equality(self):
        self.check_program(
            'a is {"x": [1, {"y": 2}]}\n'
            'b is {"x": [1, {"y": 2}]}\n'
            'c is {"x": [1, {"y": 3}]}\n'
            'show a is b\n'
            'show a is c\n',
            "true\nfalse\n",
        )

    def test_equality_ignores_key_order(self):
        self.check_program(
            'show {"a": 1, "b": 2} is {"b": 2, "a": 1}\n',
            "true\n",
        )

    def test_kind_of_table(self):
        self.check_program(
            'show kind of {"a": 1}\nshow kind of new table\n',
            "table\ntable\n",
        )

    def test_text_of_table(self):
        self.check_program(
            'show text of {"k": "v"}\n',
            '{"k": "v"}\n',
        )

    def test_duplicate_key_last_wins(self):
        self.check_program(
            't is {"a": 1, "a": 2}\nshow t["a"]\n',
            "2\n",
        )

    def test_chained_subscript_assign(self):
        self.check_program(
            'deep is {"x": [1, {"y": 2}]}\n'
            'deep["x"][1]["y"] is 99\n'
            'show deep["x"][1]["y"]\n',
            "99\n",
        )

    def test_list_subscript_assign(self):
        self.check_program(
            'xs is [1, 2, 3]\nxs[0] is 9\nshow xs\n',
            "[9, 2, 3]\n",
        )

    def test_truthiness(self):
        self.check_program(
            'if {"a": 1} then\n show "nonempty"\n'
            'if {} then\n show "empty"\n'
            'otherwise\n'
            '    show "empty is false"\n',
            "nonempty\nempty is false\n",
        )

    def test_bangla_new_table(self):
        self.check_program(
            'use bangla\n'
            't হয় একটি নতুন সারণি\n'
            't["নাম"] হয় "Jesun"\n'
            'দেখাও t["নাম"]\n',
            "Jesun\n",
        )

    def test_table_errors(self):
        cases = [
            ('t is new table\nt[0] is 1\n',
             'Line 2: a table key has to be text, but this one is a number.\n'),
            ('t is {"a": 1}\nshow t[0]\n',
             'Line 2: I can only look up text keys in a table, but this key is a number.\n'),
            ('t is {1: "x"}\n',
             'Line 1: a table key has to be text, but this one is a number.\n'),
            ('t is new table\nt["k"] is 1\nshow keys of "nope"\n',
             'Line 3: "keys of" needs a python dictionary.\n'),
            ('show 5 contains "x"\n',
             'Line 1: "contains" needs text with text, a table, or a list.\n'),
        ]
        for src, expected in cases:
            with self.subTest(src=src):
                boot, selfhost = self.check_mismatch(src)
                self.assertEqual(boot[1], expected)

    def check_mismatch(self, src):
        """Differential run where only the bootstrap leg's output is pinned."""
        from selfhost_harness import run_inline
        boot, selfhost = run_inline(src)
        self.assert_differential(boot, selfhost, f"program {src!r}")
        return boot, selfhost


class Json(SelfHostDiffCase):
    def test_parse_object(self):
        self.check_program(
            'data is parse json "{{\\"a\\": 1, \\"b\\": true}}"\n'
            'show data["a"]\n'
            'show data["b"]\n'
            'show kind of data\n',
            "1\ntrue\ntable\n",
        )

    def test_parse_nested(self):
        self.check_program(
            'data is parse json "{{\\"a\\": [1, 2, {{\\"b\\": null}}]}}"\n'
            'show data["a"][2]["b"]\n'
            'show data["a"][0]\n',
            "nothing\n1\n",
        )

    def test_parse_scalars(self):
        self.check_program(
            'show parse json "1"\n'
            'show parse json "1.5"\n'
            'show parse json "-2e3"\n'            'show parse json "true"\n'
            'show parse json "false"\n'
            'show parse json "null"\n'
            'show parse json "\\"hi\\""\n',
            "1\n1.5\n-2000\ntrue\nfalse\nnothing\nhi\n",
        )

    def test_parse_escapes(self):
        self.check_program(
            'show parse json "\\"a\\\\nb\\\\u0041\\""\n',
            "a\nbA\n",
        )

    def test_json_of_canonical(self):
        self.check_program(
            'show json of {"b": 2, "a": [1, "x"]}\n',
            '{"b":2,"a":[1,"x"]}\n',
        )

    def test_json_of_scalars(self):
        self.check_program(
            'show json of 1.5\n'
            'show json of 1.0\n'
            'show json of 7\n'
            'show json of nothing\n'
            'show json of true\n',
            "1.5\n1.0\n7\nnull\ntrue\n",
        )

    def test_json_of_unicode_escaped(self):
        self.check_program(
            'show json of {"emoji": "héllo"}\n',
            '{"emoji":"h\\u00e9llo"}\n',
        )

    def test_roundtrip(self):
        self.check_program(
            't is {"a": {"b": [1, {"c": true}]}, "d": nothing}\n'
            'show parse json json of t is t\n',
            "true\n",
        )

    def test_bangla_json(self):
        self.check_program(
            'use bangla\n'
            't হয় বিশ্লেষণ জেসন "{{\\"a\\": 1}}"\n'
            'দেখাও t["a"]\n'
            'দেখাও জেসন এর t\n',
            "1\n{\"a\":1}\n",
        )

    def test_parse_errors(self):
        cases = [
            ('show parse json "{{bad"\n',
             "Line 1: that text is not valid JSON (it breaks at character 1).\n"),
            ('show parse json "[1,]"\n',
             "Line 1: that text is not valid JSON (it breaks at character 3).\n"),
            ('show parse json ""\n',
             "Line 1: that text is not valid JSON (it breaks at character 0).\n"),
            ('show parse json "1 2"\n',
             "Line 1: that text is not valid JSON (it breaks at character 2).\n"),
            ('show parse json "{{\\"a\\": 01}}"\n',
             "Line 1: that text is not valid JSON (it breaks at character 7).\n"),
            ('show parse json 5\n',
             'Line 1: "parse json" needs text.\n'),
        ]
        for src, expected in cases:
            with self.subTest(src=src):
                boot, _ = self.check_mismatch(src)
                self.assertEqual(boot[1], expected)

    def test_json_of_function_error(self):
        src = 'to greet with name\n    show name\nshow json of greet\n'
        expected = "Line 3: I cannot turn a function into JSON.\n"
        boot, _ = self.check_mismatch(src)
        self.assertEqual(boot[1], expected)

    def check_mismatch(self, src):
        from selfhost_harness import run_inline
        boot, selfhost = run_inline(src)
        self.assert_differential(boot, selfhost, f"program {src!r}")
        return boot, selfhost


class Attempt(SelfHostDiffCase):
    """`attempt <expr>` (spec v1.2 section 7): failure as a value."""

    def test_attempt_ok_shape(self):
        self.check_program(
            'r is attempt 1 + 2\n'
            'show r["ok"]\n'
            'show r["value"]\n',
            "true\n3\n",
        )

    def test_attempt_failure_shape(self):
        self.check_program(
            'r is attempt nosuchname\n'
            'show r["ok"]\n'
            'show r["error"]\n',
            "false\n"
            "Line 1: I do not know the word \"nosuchname\".\n",
        )

    def test_attempt_fail_with_bare_message(self):
        self.check_program(
            'to boom\n'
            '    fail with "kaput"\n'
            'r is attempt boom\n'
            'show r["ok"]\n'
            'show r["error"]\n',
            "false\nkaput\n",
        )

    def test_attempt_give_back_passes_through(self):
        self.check_program(
            'to early\n'
            '    give back 42\n'
            'r is attempt early\n'
            'show r["ok"]\n'
            'show r["value"]\n',
            "true\n42\n",
        )

    def test_attempt_nested(self):
        self.check_program(
            'to boom\n'
            '    fail with "kaput"\n'
            'r is attempt attempt boom\n'
            'show r["ok"]\n'
            'show r["value"]["ok"]\n'
            'show r["value"]["error"]\n',
            "true\nfalse\nkaput\n",
        )

    def test_attempt_type_error(self):
        self.check_program(
            'r is attempt 1 + "x"\n'
            'show r["ok"]\n'
            'show r["error"]\n',
            "false\n"
            "Line 1: I can only add numbers to numbers and text to text.\n",
        )

    def test_attempt_bangla(self):
        self.check_program(
            'use bangla\n'
            'r হয় চেষ্টা 1 + 2\n'
            'দেখাও r["value"]\n',
            "3\n",
        )


if __name__ == "__main__":
    unittest.main()
