"""Jesun.Code v0.3 tests: deeper agents.

Covers spec 19: persistent agent memory (remember is always, forget,
corrupt-memory warning, custom memory files), agent-to-agent tool calls
with the 3-level depth cap, and streaming ask answers.

Sprint 4 migration (spec 9.2a): every test is differential-green. Each
program runs through the bootstrap and through jesun.jc as subprocesses;
the walker leg must equal the bootstrap leg, and the exact-output
assertion stays on the bootstrap leg. Each leg gets its own hermetic
JESUN_CODE_HOME (memory files and count files never cross between
legs); runs that span two programs share the leg's home, so cross-run
memory works within a leg exactly like the old shared-home fixture.
One pinned exclusion: the streaming write-granularity assertion
(`ChunkRecorder.writes > 2`) stays bootstrap-harness-only, because it
observes in-process write calls while the walker leg runs in a
subprocess whose pipe writes coalesce by design.
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

sys.path.insert(0, str(Path(__file__).parent))

from selfhost_harness import JESUN_JC, JESUN_PY, REPO  # noqa: E402
from selfhost_harness import SelfHostDiffCase, run  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


def mind_command(script: str) -> str:
    """Build JESUNCODE_AI_COMMAND for a fixture, portable to Windows."""
    return '"{}" "{}"'.format(sys.executable, (FIXTURES / script).as_posix())


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


class V03Legs:
    """Two hermetic agent legs (0 = bootstrap, 1 = self-hosted walker).

    Each leg gets its own JESUN_CODE_HOME, so memory files written by
    one leg never leak into the other's view; within a leg the home
    persists across runs, so cross-run memory behaves exactly like the
    old shared-home fixture. Each run gets a fresh tmp dir for the
    mind's count and prompt files.
    """

    def __init__(self):
        self.dirs = []
        self.homes = [self.mkdtemp("v03_home_boot_"),
                      self.mkdtemp("v03_home_self_")]

    def mkdtemp(self, prefix):
        d = tempfile.mkdtemp(prefix=prefix)
        self.dirs.append(d)
        return d

    def close(self):
        for d in self.dirs:
            shutil.rmtree(d, ignore_errors=True)

    def env(self, script, leg):
        tmp = self.mkdtemp("v03_tmp_")
        env = dict(os.environ)
        env["JESUNCODE_AI_COMMAND"] = mind_command(script)
        env["JESUN_CODE_HOME"] = self.homes[leg]
        env["MIND_COUNT_FILE"] = os.path.join(tmp, "count")
        env["MIND_PROMPT_FILE"] = os.path.join(tmp, "prompt.txt")
        return env, os.path.join(tmp, "prompt.txt")

    def run_one(self, src, script, leg):
        d = self.mkdtemp("v03_prog_")
        p = os.path.join(d, "prog.jc")
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(src)
        env, prompt_file = self.env(script, leg)
        args = [JESUN_PY] if leg == 0 else [JESUN_PY, JESUN_JC]
        return run(args + [p], cwd=d, stdin_text="", env=env), prompt_file

    def run_both(self, src, script):
        outs, prompts = [], []
        for leg in (0, 1):
            out, prompt_file = self.run_one(src, script, leg)
            outs.append(out)
            prompts.append(prompt_file)
        return outs[0], outs[1], prompts


class V03Diff(SelfHostDiffCase):
    """Differential base with a legs factory per test."""

    def legs(self):
        legs = V03Legs()
        self.addCleanup(legs.close)
        return legs

    def check_legs(self, legs, src, script, label):
        boot, selfhost, _ = legs.run_both(src, script)
        self.assert_differential(boot, selfhost, label)
        return boot


class PersistentMemory(V03Diff):
    def run_two(self, legs, first_src, second_src,
                first_script="mind_fixed.py",
                second_script="mind_save_prompt.py"):
        boot1, self1, _ = legs.run_both(first_src, first_script)
        self.assert_differential(boot1, self1, "first run")
        # Read the saved memory BEFORE the second run appends to it.
        datas = []
        for home in legs.homes:
            mem = Path(home) / "memory" / "m.json"
            datas.append(json.loads(mem.read_text(encoding="utf-8"))
                         if mem.exists() else None)
        boot2, self2, prompt_files = legs.run_both(second_src, second_script)
        self.assert_differential(boot2, self2, "second run")
        sents = [Path(p).read_text(encoding="utf-8") if Path(p).exists()
                 else "" for p in prompt_files]
        return boot1, boot2, datas, sents

    def test_memory_survives_across_runs(self):
        legs = self.legs()
        boot1, _, datas, sents = self.run_two(
            legs,
            'agent m\n    remember is always\nask m "hello" giving r\nshow r\n',
            'agent m\n    remember is always\nask m "hi again" giving r\n',
        )
        self.assertEqual(boot1[1], "the sky is blue\n")
        for data in datas:
            self.assertEqual(data, [["hello", "the sky is blue"]])
        self.assertEqual(sents[1], sents[0])
        self.assertIn("Human: hello\nMind: the sky is blue", sents[0])

    def test_remember_true_stays_in_this_run_only(self):
        legs = self.legs()
        boot = self.check_legs(
            legs, 'agent m\n    remember is true\nask m "hi" giving r\n',
            "mind_fixed.py", "remember-true")
        for home in legs.homes:
            self.assertFalse((Path(home) / "memory" / "m.json").exists())

    def test_forget_clears_saved_memory(self):
        legs = self.legs()
        boot = self.check_legs(
            legs,
            'agent m\n    remember is always\nask m "hi" giving r\nforget m\n',
            "mind_fixed.py", "forget")
        self.assertIn("Memory of m cleared.\n", boot[1])
        for home in legs.homes:
            self.assertFalse((Path(home) / "memory" / "m.json").exists())

    def test_forget_clears_run_memory_too(self):
        legs = self.legs()
        src = ('agent m\n    remember is always\nask m "one" giving r\n'
               'forget m\nask m "two" giving r2\n')
        boot, selfhost, prompt_files = legs.run_both(src, "mind_append_prompt.py")
        self.assert_differential(boot, selfhost, "forget-mid-run")
        for prompt_file in prompt_files:
            sent = Path(prompt_file).read_text(encoding="utf-8")
            parts = sent.split("--- prompt boundary ---")
            self.assertEqual(len(parts), 3, f"expected 2 prompts, got: {sent!r}")
            self.assertNotIn("Human: one", parts[1])

    def test_forget_nothing_saved(self):
        legs = self.legs()
        boot = self.check_legs(legs, "forget ghost\n", "mind_fixed.py",
                               "forget-nothing")
        self.assertEqual(boot[1], "ghost has nothing to forget.\n")

    def test_corrupt_memory_warns_and_continues(self):
        legs = self.legs()
        for home in legs.homes:
            memdir = Path(home) / "memory"
            memdir.mkdir(parents=True)
            (memdir / "m.json").write_text("not json{{{", encoding="utf-8")
        boot = self.check_legs(
            legs,
            'agent m\n    remember is always\nask m "hi" giving r\nshow r\n',
            "mind_fixed.py", "corrupt-memory")
        self.assertIn(
            "Line 1: saved memory for m was unreadable, starting fresh.\n",
            boot[1])
        self.assertIn("the sky is blue\n", boot[1])

    def test_custom_memory_file(self):
        legs = self.legs()
        outs = []
        customs = []
        for leg in (0, 1):
            custom = Path(legs.mkdtemp("v03_custom_")) / "custom-mem.json"
            customs.append(custom)
            src = ("agent m\n    remember is always\n"
                   f'    memory file is "{custom.as_posix()}"\n'
                   'ask m "hi" giving r\n')
            outs.append(legs.run_one(src, "mind_fixed.py", leg)[0])
        self.assert_differential(outs[0], outs[1], "custom-memory-file")
        for custom in customs:
            self.assertTrue(custom.exists())
            data = json.loads(custom.read_text(encoding="utf-8"))
            self.assertEqual(data, [["hi", "the sky is blue"]])

    def test_custom_memory_file_must_be_text(self):
        legs = self.legs()
        boot = self.check_legs(legs, "agent m\n    memory file is 5\n",
                               "mind_fixed.py", "memory-file-must-be-text")
        self.assertIn("the agent's memory file must be text.", boot[1])

    def test_duplicate_memory_file_setting(self):
        legs = self.legs()
        boot = self.check_legs(
            legs,
            'agent m\n    memory file is "a.json"\n    memory file is "b.json"\n',
            "mind_fixed.py", "duplicate-memory-file")
        self.assertEqual(
            boot[1], 'Line 3: "memory file" is already set for this agent.\n')


class AgentToAgent(V03Diff):
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
        legs = self.legs()
        boot = self.check_legs(legs, src, "mind_chain.py", "agent-calls-agent")
        self.assertEqual(boot[1], "Brief: Sep 30.\n")

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
        legs = self.legs()
        boot = self.check_legs(legs, src, "mind_deep.py", "depth-cap")
        self.assertEqual(
            boot[1], "Line 11: agents called agents too deep (3 levels max).\n")

    def test_self_listing_is_definition_error(self):
        legs = self.legs()
        boot, selfhost, _ = legs.run_both("agent s\n    tools are [s]\n",
                                          "mind_fixed.py")
        self.assert_differential(boot, selfhost, "self-listing")
        self.assertEqual(boot[1], "Line 1: s cannot list itself as a tool.\n")


class Streaming(V03Diff):
    """Streaming byte-streams stay differential; the write-granularity
    assertion (chunks arrive as separate writes) is pinned to the
    bootstrap harness, which observes in-process writes. The walker leg
    runs in a subprocess whose pipe writes coalesce by design."""

    def bootstrap_streamed(self, source):
        home = tempfile.mkdtemp()
        rec = ChunkRecorder()
        try:
            with mind_and_home("mind_slow.py", home):
                interp = jesun.Interpreter(stdin=io.StringIO(""), stdout=rec)
                jesun.run_source(source, interp)
            return rec
        finally:
            shutil.rmtree(home, ignore_errors=True)

    def check_streamed(self, source, expected, label):
        legs = self.legs()
        boot, selfhost, _ = legs.run_both(source, "mind_slow.py")
        self.assert_differential(boot, selfhost, label)
        self.assertEqual(boot[1], expected)

    def test_ask_ai_streaming_prints_chunks(self):
        src = 'ask ai "go" giving r streaming\nshow r\n'
        self.check_streamed(
            src,
            "first chunk\nsecond chunk\nfirst chunk\nsecond chunk\n",
            "ask-ai-streaming")
        rec = self.bootstrap_streamed(src)
        self.assertEqual(rec.text(),
                         "first chunk\nsecond chunk\nfirst chunk\nsecond chunk\n")
        self.assertGreater(rec.writes, 2, "chunks must arrive as separate writes")

    def test_ask_agent_streaming_prints_chunks(self):
        src = ('agent s\n    tools are []\n'
               'ask s "go" giving r streaming\nshow r\n')
        self.check_streamed(
            src,
            "first chunk\nsecond chunk\nfirst chunk\nsecond chunk\n",
            "ask-agent-streaming")
        rec = self.bootstrap_streamed(src)
        self.assertEqual(rec.text(),
                         "first chunk\nsecond chunk\nfirst chunk\nsecond chunk\n")
        self.assertGreater(rec.writes, 2, "chunks must arrive as separate writes")

    def test_streaming_binds_complete_answer(self):
        legs = self.legs()
        src = ('ask ai "go" giving r streaming\n'
               'if r is "first chunk\\nsecond chunk" then\n'
               '    show "complete"\n')
        boot, selfhost, _ = legs.run_both(src, "mind_slow.py")
        self.assert_differential(boot, selfhost, "streaming-binds")
        self.assertIn("complete\n", boot[1])


if __name__ == "__main__":
    unittest.main()
