"""Phase 2 tests: the Python bridge, minds and machines, zero leakage."""
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import contextmanager, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import jesun  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
AI_VAR = "JESUNCODE_AI_COMMAND"
COUNT_VAR = "MIND_COUNT_FILE"


@contextmanager
def mind(script: str):
    """Point JESUNCODE_AI_COMMAND at a fixture script, with a counter file."""
    count = tempfile.NamedTemporaryFile(delete=False)
    count.close()
    old_ai = os.environ.get(AI_VAR)
    old_count = os.environ.get(COUNT_VAR)
    os.environ[AI_VAR] = str(FIXTURES / script)
    os.environ[COUNT_VAR] = count.name
    try:
        yield count.name
    finally:
        if old_ai is None:
            os.environ.pop(AI_VAR, None)
        else:
            os.environ[AI_VAR] = old_ai
        if old_count is None:
            os.environ.pop(COUNT_VAR, None)
        else:
            os.environ[COUNT_VAR] = old_count
        os.unlink(count.name)


@contextmanager
def no_mind():
    old = os.environ.pop(AI_VAR, None)
    try:
        yield
    finally:
        if old is not None:
            os.environ[AI_VAR] = old


def calls_made(count_file: str) -> int:
    try:
        return int(Path(count_file).read_text().strip())
    except (OSError, ValueError):
        return 0


class Bridge(unittest.TestCase):
    def test_import_and_call(self):
        out = jesun.execute("import math\nshow math.sqrt(16)\nshow math.pi\n")
        self.assertEqual(out, "4\n3.141592653589793\n")

    def test_import_alias(self):
        out = jesun.execute("import random as chance\nshow chance.randint(1, 1)\n")
        self.assertEqual(out, "1\n")

    def test_dotted_module(self):
        out = jesun.execute("import os.path\nshow os.path.sep\n")
        self.assertEqual(out, "/\n")

    def test_kwargs(self):
        out = jesun.execute(
            'names is ["b", "a"]\nimport builtins\n'
            "show builtins.sorted(names, reverse=true)\n"
        )
        self.assertEqual(out, "[b, a]\n")

    def test_list_conversion(self):
        out = jesun.execute(
            'import json\nx is json.loads("[1, 2, 3]")\nshow x[1]\n'
        )
        self.assertEqual(out, "2\n")

    def test_dict_stays_foreign_but_usable(self):
        out = jesun.execute(
            "import json\nd is json.loads('{\"a\": 7}')\nshow d[\"a\"]\n"
        )
        self.assertEqual(out, "7\n")

    def test_missing_module_with_suggestion(self):
        out = jesun.execute("import numpyp\n")
        self.assertEqual(
            out,
            'Line 1: I could not find the Python package "numpyp".'
            ' Did you mean "numpy"?'
            " If it is a pip package, install it first: pip install numpyp\n",
        )

    def test_missing_module_plain(self):
        out = jesun.execute("import zzzqqqk\n")
        self.assertEqual(
            out,
            'Line 1: I could not find the Python package "zzzqqqk".'
            " If it is a pip package, install it first: pip install zzzqqqk\n",
        )

    def test_native_subscript(self):
        out = jesun.execute("x is [10, 20, 30]\nshow x[0]\nshow x[2]\nshow x[-1]\n")
        self.assertEqual(out, "10\n30\n30\n")

    def test_subscript_out_of_range(self):
        out = jesun.execute("x is [1]\nshow x[5]\n")
        self.assertEqual(out, "Line 2: position 5 is outside this a list of 1.\n")

    def test_foreign_object_shows_cleanly(self):
        out = jesun.execute("import math\nshow math\n")
        self.assertEqual(out, 'the python module "math"\n')

    def test_foreign_call_error_is_plain_english(self):
        out = jesun.execute('import math\nshow math.sqrt("nope")\n')
        self.assertTrue(out.startswith("Line 2: the python call failed: "))
        self.assertNotIn("TypeError", out)

    def test_dot_on_native_value(self):
        out = jesun.execute('x is "hi"\nshow x.upper\n')
        self.assertTrue(out.startswith("Line 2: only python values use dots;"))

    def test_cannot_hand_function_to_python(self):
        out = jesun.execute(
            "to f\n    show 1\nimport builtins\nshow builtins.len(f)\n"
        )
        self.assertTrue("I cannot hand" in out)


class Minds(unittest.TestCase):
    def test_ask_ai_fixed_answer(self):
        with mind("mind_fixed.sh"):
            out = jesun.execute('ask ai "summarize" giving r\nshow r\n')
        self.assertEqual(out, "the sky is blue\n")

    def test_ask_ai_with_tools(self):
        with mind("mind_tools.sh") as count_file:
            out = jesun.execute(
                'to read_logs\n    give back "ERROR: disk full"\n'
                'ask ai "what is wrong" with tools [read_logs] giving answer\n'
                "show answer\n"
            )
            made = calls_made(count_file)
        self.assertEqual(out, "the disk is full\n")
        self.assertEqual(made, 2)

    def test_ask_ai_unknown_tool_fed_back(self):
        with mind("mind_unknown_tool.sh") as count_file:
            out = jesun.execute(
                'to read_logs\n    give back "logs"\n'
                'ask ai "hi" with tools [read_logs] giving answer\n'
                "show answer\n"
            )
            made = calls_made(count_file)
        self.assertEqual(out, "done\n")
        self.assertEqual(made, 2)

    def test_ask_ai_steps_exhausted(self):
        with mind("mind_never.sh"):
            out = jesun.execute(
                'to read_logs\n    give back "logs"\n'
                'ask ai "hi" with tools [read_logs] within 3 steps giving answer\n'
            )
        self.assertEqual(
            out, "Line 3: the mind used all 3 steps without giving an answer.\n"
        )

    def test_ask_ai_no_mind(self):
        with no_mind():
            out = jesun.execute('ask ai "hi" giving r\n')
        self.assertEqual(
            out,
            "Line 1: no mind connected. Set JESUNCODE_AI_COMMAND to a command "
            "that reads a prompt and writes an answer, for example: "
            'export JESUNCODE_AI_COMMAND="ollama run llama3.1"\n',
        )

    def test_ask_ai_prompt_must_be_text(self):
        with mind("mind_fixed.sh"):
            out = jesun.execute("ask ai 42 giving r\n")
        self.assertEqual(out, "Line 1: the question I ask the mind must be text.\n")


@unittest.skipUnless(shutil.which("tmux"), "tmux not installed")
class MachinesLive(unittest.TestCase):
    def test_tmux_open_send_read_close(self):
        name = "jctestlive"
        jesun.execute(
            f'open terminal named "{name}"\n'
            f'send "echo hello-from-jc" to terminal "{name}"\n'
        )
        import time

        time.sleep(1.5)
        out = jesun.execute(
            f'read terminal "{name}" giving captured\n'
            f'close terminal "{name}"\n'
            "show captured contains \"hello-from-jc\"\n"
        )
        self.assertEqual(out, "true\n")

    def test_tmux_no_such_terminal(self):
        out = jesun.execute('read terminal "ghost-xyz-abc" giving o\n')
        self.assertEqual(out, 'Line 1: there is no terminal named "ghost-xyz-abc".\n')

    def test_tmux_double_open(self):
        name = "jctestdouble"
        try:
            out = jesun.execute(
                f'open terminal named "{name}"\nopen terminal named "{name}"\n'
            )
            self.assertEqual(
                out, f'Line 2: a terminal named "{name}" is already open.\n'
            )
        finally:
            jesun.execute(f'close terminal "{name}"\n')


class MachinesNoTmux(unittest.TestCase):
    def test_tmux_missing_is_plain_english(self):
        with mock.patch("shutil.which", return_value=None):
            out = jesun.execute('open terminal named "w"\n')
        self.assertEqual(
            out,
            "Line 1: tmux is not installed. Install it first: sudo apt install tmux\n",
        )


class ZeroLeakage(unittest.TestCase):
    BANNED = (
        "Traceback",
        'File "',
        "0x",
        "TypeError",
        "ValueError",
        "AttributeError",
        "KeyError",
        "IndexError",
        "ModuleNotFoundError",
        "ImportError",
        "Error:",
    )
    BAD_PROGRAMS = [
        "show 1 / 0\n",
        "x is [1]\nshow x[5]\n",
        "bogusname\n",
        "import zzzqqqk\n",
        "import math\nshow math.nope\n",
        'import math\nshow math.sqrt("x")\n',
        "if true then\nshow 1\n  show 2\n",
        "to f with a\n    give back a\nf with 1 and 2\n",
        "repeat 2.5 times\n    show 1\n",
        'x is "hi"\nshow x[10]\n',
        'open terminal named 42\n',
    ]

    def test_no_leaked_internals(self):
        for program in self.BAD_PROGRAMS:
            with self.subTest(program=program):
                out = jesun.execute(program)
                for banned in self.BANNED:
                    self.assertNotIn(
                        banned, out, f"leaked {banned!r} from {program!r}: {out!r}"
                    )

    def test_version_flag(self):
        buf = StringIO()
        with redirect_stdout(buf):
            code = jesun.main(["--version"])
        self.assertEqual(code, 0)
        self.assertEqual(buf.getvalue(), "Jesun.Code v0.1\n")


if __name__ == "__main__":
    unittest.main()
