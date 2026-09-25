"""Jesun.Code v0.3 tests: deeper agents.

Covers spec 19: persistent agent memory (remember is always, forget,
corrupt-memory warning, custom memory files), agent-to-agent tool calls
with the 3-level depth cap, and streaming ask answers.
"""

import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

import jesun

FIXTURES = Path(__file__).parent / "fixtures"


def mind_command(script: str) -> str:
    """Build JESUNCODE_AI_COMMAND for a fixture mind, portable to Windows."""
    return '"{}" "{}"'.format(sys.executable, (FIXTURES / script).as_posix())


class ChunkRecorder:
    """A stdout stand-in that records every write, proving chunks arrive."""

    def __init__(self):
        self.chunks: list[str] = []
        self.writes = 0

    def write(self, text: str) -> None:
        self.chunks.append(text)
        self.writes += 1

    def flush(self) -> None:
        pass

    def text(self) -> str:
        return "".join(self.chunks)


@contextmanager
def mind_and_home(script: str, home: str):
    """Point JESUNCODE_AI_COMMAND at a fixture and JESUN_CODE_HOME at home."""
    tmp = tempfile.mkdtemp()
    old = dict(os.environ)
    try:
        os.environ["JESUNCODE_AI_COMMAND"] = mind_command(script)
        os.environ["JESUN_CODE_HOME"] = home
        os.environ["MIND_COUNT_FILE"] = str(Path(tmp) / "count")
        os.environ["MIND_PROMPT_FILE"] = str(Path(tmp) / "prompt.txt")
        yield Path(tmp) / "prompt.txt"
    finally:
        os.environ.clear()
        os.environ.update(old)
        shutil.rmtree(tmp, ignore_errors=True)


class PersistentMemory(unittest.TestCase):
    def run_two(self, first_src, second_src, first_script="mind_fixed.py",
                second_script="mind_save_prompt.py"):
        home = tempfile.mkdtemp()
        try:
            with mind_and_home(first_script, home):
                out1 = jesun.execute(first_src)
            mem = Path(home) / "memory" / "m.json"
            saved = mem.exists()
            data = json.loads(mem.read_text(encoding="utf-8")) if saved else None
            with mind_and_home(second_script, home) as prompt_file:
                out2 = jesun.execute(second_src)
                sent = Path(prompt_file).read_text(encoding="utf-8")
            return out1, out2, sent, saved, data
        finally:
            shutil.rmtree(home, ignore_errors=True)

    def test_memory_survives_across_runs(self):
        out1, _, sent, saved, data = self.run_two(
            'agent m\n    remember is always\nask m "hello" giving r\nshow r\n',
            'agent m\n    remember is always\nask m "hi again" giving r\n',
        )
        self.assertEqual(out1, "the sky is blue\n")
        self.assertTrue(saved, "memory file was not saved")
        self.assertEqual(data, [["hello", "the sky is blue"]])
        self.assertIn("Human: hello\nMind: the sky is blue", sent)

    def test_remember_true_stays_in_this_run_only(self):
        home = tempfile.mkdtemp()
        try:
            with mind_and_home("mind_fixed.py", home):
                jesun.execute('agent m\n    remember is true\nask m "hi" giving r\n')
            self.assertFalse((Path(home) / "memory" / "m.json").exists())
        finally:
            shutil.rmtree(home, ignore_errors=True)

    def test_forget_clears_saved_memory(self):
        home = tempfile.mkdtemp()
        try:
            with mind_and_home("mind_fixed.py", home):
                out = jesun.execute(
                    'agent m\n    remember is always\nask m "hi" giving r\nforget m\n'
                )
            self.assertIn("Memory of m cleared.\n", out)
            self.assertFalse((Path(home) / "memory" / "m.json").exists())
        finally:
            shutil.rmtree(home, ignore_errors=True)

    def test_forget_clears_run_memory_too(self):
        home = tempfile.mkdtemp()
        try:
            with mind_and_home("mind_append_prompt.py", home) as prompt_file:
                jesun.execute(
                    'agent m\n    remember is always\nask m "one" giving r\n'
                    'forget m\nask m "two" giving r2\n'
                )
                sent = Path(prompt_file).read_text(encoding="utf-8")
            parts = sent.split("--- prompt boundary ---")
            self.assertEqual(len(parts), 3, f"expected 2 prompts, got: {sent!r}")
            self.assertNotIn("Human: one", parts[1])
        finally:
            shutil.rmtree(home, ignore_errors=True)

    def test_forget_nothing_saved(self):
        home = tempfile.mkdtemp()
        try:
            with mind_and_home("mind_fixed.py", home):
                out = jesun.execute("forget ghost\n")
            self.assertEqual(out, "ghost has nothing to forget.\n")
        finally:
            shutil.rmtree(home, ignore_errors=True)

    def test_corrupt_memory_warns_and_continues(self):
        home = tempfile.mkdtemp()
        try:
            memdir = Path(home) / "memory"
            memdir.mkdir(parents=True)
            (memdir / "m.json").write_text("not json{{{", encoding="utf-8")
            with mind_and_home("mind_fixed.py", home):
                out = jesun.execute(
                    'agent m\n    remember is always\nask m "hi" giving r\nshow r\n'
                )
            self.assertIn(
                "Line 1: saved memory for m was unreadable, starting fresh.\n", out
            )
            self.assertIn("the sky is blue\n", out)
        finally:
            shutil.rmtree(home, ignore_errors=True)

    def test_custom_memory_file(self):
        home = tempfile.mkdtemp()
        custom = Path(home) / "custom-mem.json"
        try:
            src = (
                "agent m\n"
                "    remember is always\n"
                f'    memory file is "{custom.as_posix()}"\n'
                'ask m "hi" giving r\n'
            )
            with mind_and_home("mind_fixed.py", home):
                jesun.execute(src)
            self.assertTrue(custom.exists())
            data = json.loads(custom.read_text(encoding="utf-8"))
            self.assertEqual(data, [["hi", "the sky is blue"]])
        finally:
            shutil.rmtree(home, ignore_errors=True)

    def test_custom_memory_file_must_be_text(self):
        out = jesun.execute("agent m\n    memory file is 5\n")
        self.assertIn("the agent's memory file must be text.", out)

    def test_duplicate_memory_file_setting(self):
        out = jesun.execute(
            'agent m\n    memory file is "a.json"\n    memory file is "b.json"\n'
        )
        self.assertEqual(
            out, 'Line 3: "memory file" is already set for this agent.\n'
        )


class AgentToAgent(unittest.TestCase):
    def test_agent_calls_agent(self):
        src = (
            'agent researcher\n'
            '    persona is "You find facts."\n'
            '    tools are []\n'
            'agent writer\n'
            '    persona is "You write briefs."\n'
            '    tools are [researcher]\n'
            'ask writer "brief me" giving b\n'
            'show b\n'
        )
        home = tempfile.mkdtemp()
        try:
            with mind_and_home("mind_chain.py", home):
                out = jesun.execute(src)
            self.assertEqual(out, "Brief: Sep 30.\n")
        finally:
            shutil.rmtree(home, ignore_errors=True)

    def test_depth_cap(self):
        src = (
            "agent a\n"
            "    tools are [b]\n"
            "agent b\n"
            "    tools are [c]\n"
            "agent c\n"
            "    tools are [d]\n"
            "agent d\n"
            "    tools are [e]\n"
            "agent e\n"
            "    tools are []\n"
            'ask a "go" giving r\n'
        )
        home = tempfile.mkdtemp()
        try:
            with mind_and_home("mind_deep.py", home):
                out = jesun.execute(src)
            self.assertEqual(
                out, "Line 11: agents called agents too deep (3 levels max).\n"
            )
        finally:
            shutil.rmtree(home, ignore_errors=True)

    def test_self_listing_is_definition_error(self):
        out = jesun.execute("agent s\n    tools are [s]\n")
        self.assertEqual(out, "Line 1: s cannot list itself as a tool.\n")


class Streaming(unittest.TestCase):
    def run_streamed(self, source):
        home = tempfile.mkdtemp()
        rec = ChunkRecorder()
        try:
            with mind_and_home("mind_slow.py", home):
                interp = jesun.Interpreter(stdin=io.StringIO(""), stdout=rec)
                jesun.run_source(source, interp)
            return rec
        finally:
            shutil.rmtree(home, ignore_errors=True)

    def test_ask_ai_streaming_prints_chunks(self):
        rec = self.run_streamed('ask ai "go" giving r streaming\nshow r\n')
        self.assertEqual(rec.text(), "first chunk\nsecond chunk\nfirst chunk\nsecond chunk\n")
        self.assertGreater(rec.writes, 2, "chunks must arrive as separate writes")

    def test_ask_agent_streaming_prints_chunks(self):
        rec = self.run_streamed('agent s\n    tools are []\nask s "go" giving r streaming\nshow r\n')
        self.assertEqual(rec.text(), "first chunk\nsecond chunk\nfirst chunk\nsecond chunk\n")
        self.assertGreater(rec.writes, 2, "chunks must arrive as separate writes")

    def test_streaming_binds_complete_answer(self):
        home = tempfile.mkdtemp()
        rec = ChunkRecorder()
        try:
            with mind_and_home("mind_slow.py", home):
                interp = jesun.Interpreter(stdin=io.StringIO(""), stdout=rec)
                jesun.run_source(
                    'ask ai "go" giving r streaming\n'
                    'if r is "first chunk\\nsecond chunk" then\n'
                    '    show "complete"\n',
                    interp,
                )
            self.assertIn("complete\n", rec.text())
        finally:
            shutil.rmtree(home, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
