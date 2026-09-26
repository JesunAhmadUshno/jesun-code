"""Differential fuzzer: the bootstrap and the self-hosted interpreter must agree.

Generates small phase-A-only programs (no stdin, no files, no network, no
minds: nothing with side effects beyond stdout), runs each through
`python jesun.py prog` and `python jesun.jc prog`, and requires
identical (returncode, stdout). Every third case is a phase-B program
(ask with piped stdin, file I/O, the import bridge): those run with a
fresh temp cwd per case on both sides. Every seventh case is an ask-ai
program (spec 8.2) driven by a deterministic fixture mind
(`tests/fixtures/mind_*.py`) with a fresh MIND_COUNT_FILE per side;
`None` means no JESUNCODE_AI_COMMAND at all. Also enforces the zero-leakage
rule on both outputs: no tracebacks, no Python exception names, no "0x".

The known spec-7.3 gap (call-time foreign failures report at the
walker's bridge line, not the target line) is classified, not failed:
when both outputs carry "the python call failed", line numbers are
normalized before comparing.

Timeouts are reported as skips, not failures: the self-hosted run is an
interpreter running inside an interpreter, so it is slower by design.

Every eleventh case is an agent program (spec 8.3): agent defs
(persona/tools/remember/steps/memory file), ask/forget shapes, parse
errors, the Bangla flavor, and the nested/depth templates, all driven
by deterministic fixture minds with a fresh JESUN_CODE_HOME and a
fresh MIND_COUNT_FILE per side. Failing tools are never generated:
spec 8.3.1 documents that shape as a known divergence, so the fuzzer
stays byte-identical. Every thirteenth case is a fleet program (spec
8.4): valid blocks, memory files, parse-error shapes, the Bangla
flavor, all driven by deterministic fixture minds; failing fleet asks
are never generated (spec 8.4.1 is a pinned divergence, kept out of
the fuzzer by design). Every seventeenth case is a jpm program (spec
8.5): bring-in of seeded packages, package error shapes, circles,
manifest/escape failures, `use` validation and already-installed
shapes, dirty-`use` (seeded git checkout) and no-git `use` (git
scrubbed from PATH); `use` of a missing address with git present is
never generated (it would attempt a real network clone), and neither
are deep-nesting shapes (spec 8.5.5 is a pinned divergence).

Run: python3 tests/fuzz_selfhost.py [count]
Exit 0 when clean, 1 on the first mismatch batch (up to 10 shown).
"""
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile  # noqa: F401
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TMPDIR = ROOT / "tests" / "fixtures" / "selfhost" / ".tmp"
TIMEOUT = 30

EXC_NAMES = re.compile(
    r"\b(TypeError|ValueError|KeyError|IndexError|AttributeError|RecursionError|"
    r"NameError|SyntaxError|RuntimeError|MemoryError|OSError|IOError|"
    r"ZeroDivisionError|StopIteration|AssertionError|Exception)\b"
)

# Phase A only: the v0.1 core plus push/characters/text/kind/fail.
# Deliberately excluded: ask/giving (stdin), read/write/append/file (disk),
# import/use/bring (bridge, network, disk), ai/agent/tools/fleet/tmux
# (subprocesses, real minds), arguments (differs by construction:
# ["prog"] under jesun.jc vs [] under the bootstrap), while (a soup
# condition that never changes would spin the self-hosted guard; while
# gets targeted seeds instead).
WORDS = [
    "show", "is", "not", "true", "false", "nothing",
    "if", "then", "otherwise", "repeat", "times", "for", "each",
    "in", "to", "with", "and", "or", "give", "back", "stop", "skip",
    "of", "first", "last", "length", "uppercase", "lowercase",
    "greater", "less", "than", "least", "most", "at", "contains",
    "split", "join", "trim", "by", "note",
    "push", "characters", "text", "kind", "fail", "keys",
    "x", "y", "z", "name", "total", "count", "item", "f",
    '"hello"', '"hi"', '""', '"a b c"', '"1,2,3"', '"  padded  "',
    '"unterminated', "'q'",
    "0", "1", "2", "3", "5", "10",
    "3.14", "-1", "-2.5",
    "+", "-", "*", "/", "%", "(", ")", "[", "]", ",", ".", "=",
    "@", "#", "$", ":", ";", "{", "}", "!", "?", "\\",
    "    ", "        ", "\t",
]

SEEDS = [
    'show "hi"\n',
    'x is 5\nshow x\n',
    'if x is 1 then\n    show "a"\notherwise\n    show "b"\n',
    'repeat 3 times\n    show "hi"\n',
    'for each item in [1, 2]\n    show item\n',
    'to add with a and b\n    give back a + b\nshow add with 2 and 3\n',
    'show length of "hello"\nshow first of [1]\n',
    'note just a comment\n',
    'x is 1\nrepeat while x is less than 3\n    show x\n    x is x + 1\n',
    'show text of 42\nshow kind of "s"\n',
    'xs is [1]\npush 2 to xs\nshow xs\n',
    'show characters of "ab"\n',
    'fail with "boom"\n',
    'show "n: {name}"\n',
    'name is "jesun"\nshow "hi {name}, {1 + 2}, {{kept}}"\n',
    'to fact with n\n    if n is at most 1 then\n        give back 1\n    give back n * fact with n - 1\nshow fact with 5\n',
    'show 0.1 + 0.2\nshow 7 / 2\nshow -5 + 2\n',
    'show [1, [2, [3]]]\nshow "a" + "b"\n',
    't is "x,y,z"\nshow split of t by ","\nshow join of ["a", "b"] with "-"\n',
]


def token_soup(rng: random.Random) -> str:
    lines = []
    for _ in range(rng.randint(1, 8)):
        indent = rng.choice(["", "", "", "    ", "        "])
        body = " ".join(rng.choice(WORDS) for _ in range(rng.randint(0, 8)))
        lines.append(indent + body)
    return "\n".join(lines) + "\n"


def mutate(rng: random.Random, src: str) -> str:
    lines = src.split("\n")
    for _ in range(rng.randint(1, 4)):
        op = rng.random()
        if op < 0.25 and lines:
            lines.pop(rng.randrange(len(lines)))
        elif op < 0.5 and lines:
            i = rng.randrange(len(lines))
            lines.insert(i, lines[i])
        elif op < 0.7 and lines:
            i = rng.randrange(len(lines))
            toks = lines[i].split(" ")
            if toks:
                toks[rng.randrange(len(toks))] = rng.choice(WORDS)
            lines[i] = " ".join(toks)
        elif op < 0.85 and lines:
            i = rng.randrange(len(lines))
            lines[i] = rng.choice(["", "    ", "        "]) + lines[i].lstrip(" ")
        else:
            lines.insert(rng.randrange(len(lines) + 1), token_soup(rng).split("\n")[0])
    text = "\n".join(lines)
    if rng.random() < 0.2:
        text = text.replace("\n", "\r\n")
    if rng.random() < 0.1:
        text = "\ufeff" + text
    return text


PB_MODULES = ["math", "json", "builtins", "os.path", "string"]


def phaseb_program(rng: random.Random) -> tuple[str, str]:
    """Returns (source, stdin_text). Sandboxed side effects only: a fresh
    temp cwd per case, piped stdin, stdlib imports (no network, no minds,
    no subprocess)."""
    lines: list[str] = []
    stdin_lines = [f"word{rng.randrange(1000)}" for _ in range(3)]
    n = rng.randint(1, 6)
    for k in range(n):
        pick = rng.random()
        if pick < 0.18:
            lines.append(f'ask "say a word" giving w{k}')
            lines.append(f"show w{k}")
        elif pick < 0.36:
            lines.append(f'write "v{k}" to file "pb{k}.txt"')
            lines.append(f'read file "pb{k}.txt" giving r{k}')
            lines.append(f"show r{k}")
            if rng.random() < 0.5:
                lines.append(f'append "!" to file "pb{k}.txt"')
                lines.append(f'read file "pb{k}.txt" giving s{k}')
                lines.append(f"show s{k}")
        elif pick < 0.48:
            lines.append(rng.choice([
                f'read file "nope{k}.txt" giving x{k}',
                f'write "x" to file "../evil{k}.txt"',
                f'write "x" to file "nodir{k}/f.txt"',
                f'read file "." giving x{k}',
            ]))
        elif pick < 0.72:
            mod = rng.choice(PB_MODULES)
            alias = f"m{k}"
            lines.append(f"import {mod} as {alias}")
            lines.append(rng.choice([
                f"show kind of {alias}",
                f"show {alias}",
                f"show {alias}.pi" if mod in ("math",) else f"show {alias}",
                f"show {alias}.sqrt({rng.choice([4, 9, 16])})" if mod == "math" else f"show kind of {alias}",
            ]))
            if rng.random() < 0.3:
                lines.append(f"show {alias}.zzz_nope_{k}")
        elif pick < 0.84:
            lines.append(f"import zzz_nope_mod_{k}")
        else:
            lines.append("import builtins")
            lines.append(f"d{k} is builtins.dict(a={k})")
            lines.append(rng.choice([
                f'show d{k}["a"]',
                f'show d{k}["missing_{k}"]',
                "import json",
                f"s{k} is json.dumps(d{k}, sort_keys=true)",
                f"show s{k}",
            ]))
            if rng.random() < 0.25:
                lines.append("import json")
                lines.append(f"x{k} is json.loads()")
    if rng.random() < 0.2:
        lines.insert(0, "ask 42 giving badask")
    return "\n".join(lines) + "\n", "\n".join(stdin_lines) + "\n"


def run_side_pb(args: list[str], cwd: Path, stdin_text: str) -> tuple:
    """Returns (returncode, stdout) or ("timeout", "")."""
    try:
        proc = subprocess.run(
            [sys.executable] + args,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
            input=stdin_text,
        )
        return proc.returncode, proc.stdout
    except subprocess.TimeoutExpired:
        return "timeout", ""


LINE_RE = re.compile(r"Line \d+")


def norm_gap(text: str) -> str:
    return LINE_RE.sub("Line N", text)


def check_pb(i: int, src: str, stdin_text: str) -> tuple[list[str], int]:
    case_dir = TMPDIR / f"pb{i}"
    case_dir.mkdir(parents=True, exist_ok=True)
    prog = case_dir / "case.jc"
    prog.write_text(src, encoding="utf-8")
    jesun_py = str(ROOT / "jesun.py")
    jesun_jc = str(ROOT / "jesun.jc")
    try:
        boot = run_side_pb([jesun_py, "case.jc"], case_dir, stdin_text)
        selfhost = run_side_pb([jesun_py, jesun_jc, "case.jc"], case_dir, stdin_text)
    finally:
        shutil.rmtree(case_dir, ignore_errors=True)
    if boot[0] == "timeout" or selfhost[0] == "timeout":
        return [], 1
    problems: list[str] = []
    b_out, s_out = boot[1], selfhost[1]
    if "the python call failed" in b_out and "the python call failed" in s_out:
        b_out, s_out = norm_gap(b_out), norm_gap(s_out)
    if (boot[0], b_out) != (selfhost[0], s_out):
        problems.append(
            f"case {i}: phase-B MISMATCH\n--- src ---\n{src}\n"
            f"--- bootstrap {boot[0]} ---\n{boot[1]}\n"
            f"--- selfhost {selfhost[0]} ---\n{selfhost[1]}\n"
        )
    for label, out in (("bootstrap", boot[1]), ("selfhost", selfhost[1])):
        for marker in ("Traceback", 'File "', "0x"):
            if marker in out:
                problems.append(
                    f"case {i}: {label} leaked {marker!r}\n---\n{src}\n---\n{out}"
                )
        if EXC_NAMES.search(out):
            problems.append(
                f"case {i}: {label} leaked exception name\n---\n{src}\n---\n{out}"
            )
    return problems, 0


# -- ask ai (spec 8.2): deterministic fixture minds, so both sides agree --
AI_MINDS = ["mind_fixed.py", "mind_tools.py", "mind_unknown_tool.py",
            "mind_fails.py", None]  # None: no JESUNCODE_AI_COMMAND at all
AI_COUNTING = {"mind_tools.py", "mind_unknown_tool.py"}
AI_TOOLNAMES = ["read_logs", "helper", "nope"]


def ai_program(rng: random.Random) -> tuple[str, str | None]:
    """Returns (source, mind_name). Grammar shapes: bare ask ai, with
    tools, within N steps (valid and invalid), streaming, and the
    Bangla flavor. Counting minds get a fresh MIND_COUNT_FILE per
    side in check_ai, so both sides see the same call sequence."""
    bangla = rng.random() < 0.2
    mind = rng.choice(AI_MINDS)
    lines: list[str] = []
    tools: list[str] = []
    if rng.random() < 0.6:
        for _ in range(rng.randint(1, 2)):
            t = rng.choice(AI_TOOLNAMES)
            if t in tools:
                continue
            tools.append(t)
            if bangla:
                lines.append(f"জন্যে {t} সহ x")
                lines.append('    দাও ফেরত "r"')
            else:
                params = rng.choice([[], ["x"], ["x", "y"]])
                if params:
                    lines.append(f"to {t} with {' and '.join(params)}")
                else:
                    lines.append(f"to {t}")
                lines.append('    give back "r"')
    prompt = '"fuzz prompt"'
    if bangla:
        stmt = f'জিজ্ঞেস এআই {prompt}'
        if tools:
            stmt += " সহ হাতিয়ার [" + ", ".join(tools) + "]"
            if rng.random() < 0.4:
                stmt += " মধ্যে " + rng.choice(["১", "২", "০", "two"]) + " ধাপ"
        stmt += " রেখে উত্তর"
        if rng.random() < 0.25:
            stmt += " সরাসরি"
        lines = ["বাংলা"] + lines + [stmt, "দেখাও উত্তর"]
    else:
        stmt = f"ask ai {prompt}"
        if tools:
            stmt += " with tools [" + ", ".join(tools) + "]"
            if rng.random() < 0.4:
                stmt += " within " + rng.choice(["1", "2", "3", "0", "two"]) + " steps"
        stmt += " giving ans"
        if rng.random() < 0.25:
            stmt += " streaming"
        lines = lines + [stmt, "show ans"]
    return "\n".join(lines) + "\n", mind


def run_side_ai(args: list[str], prog: Path, env: dict) -> tuple:
    """Returns (returncode, stdout) or ("timeout", "")."""
    try:
        proc = subprocess.run(
            [sys.executable] + args + [str(prog)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
            stdin=subprocess.DEVNULL,
            env=env,
        )
        return proc.returncode, proc.stdout
    except subprocess.TimeoutExpired:
        return "timeout", ""


def check_ai(i: int, src: str, mind: str | None) -> tuple[list[str], int]:
    skips = 0
    TMPDIR.mkdir(parents=True, exist_ok=True)
    prog = TMPDIR / f"case{i}.jc"
    prog.write_text(src, encoding="utf-8")
    count_file = TMPDIR / f"mindcount{i}.txt"
    try:
        env = dict(os.environ)
        env.pop("JESUNCODE_AI_COMMAND", None)
        if mind is not None:
            env["JESUNCODE_AI_COMMAND"] = (
                sys.executable + " " + str(ROOT / "tests" / "fixtures" / mind))
        count_file.write_text("0", encoding="utf-8")
        env["MIND_COUNT_FILE"] = str(count_file)
        boot = run_side_ai(["jesun.py"], prog.relative_to(ROOT), env)
        count_file.write_text("0", encoding="utf-8")
        selfhost = run_side_ai(["jesun.py", "jesun.jc"],
                               prog.relative_to(ROOT), env)
    finally:
        prog.unlink(missing_ok=True)
        count_file.unlink(missing_ok=True)
    if boot[0] == "timeout" or selfhost[0] == "timeout":
        return [], 1
    problems: list[str] = []
    if boot != selfhost:
        problems.append(
            f"case {i}: ask-ai MISMATCH (mind={mind})\n--- src ---\n{src}\n"
            f"--- bootstrap {boot[0]} ---\n{boot[1]}\n"
            f"--- selfhost {selfhost[0]} ---\n{selfhost[1]}\n"
        )
    for label, out in (("bootstrap", boot[1]), ("selfhost", selfhost[1])):
        for marker in ("Traceback", 'File "', "0x"):
            if marker in out:
                problems.append(
                    f"case {i}: {label} leaked {marker!r}\n---\n{src}\n---\n{out}"
                )
        if EXC_NAMES.search(out):
            problems.append(
                f"case {i}: {label} leaked exception name\n---\n{src}\n---\n{out}"
            )
    return problems, skips


def run_side(args: list[str], prog: Path) -> tuple:
    """Returns (returncode, stdout) or ("timeout", "")."""
    try:
        proc = subprocess.run(
            [sys.executable] + args + [str(prog)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
            stdin=subprocess.DEVNULL,
        )
        return proc.returncode, proc.stdout
    except subprocess.TimeoutExpired:
        return "timeout", ""


# -- agents (spec 8.3): valid defs, ask/forget, parse errors, Bangla,
#    nested and depth templates. Failing tools are never generated. --
AG_DEPTH_SRC = """agent a4
    tools are [a3]
    steps are 3

agent a3
    tools are [a4]
    steps are 3

agent a2
    tools are [a3]
    steps are 3

agent a1
    tools are [a2]
    steps are 3

ask a1 "go deep" giving r
show r
"""

AG_NESTED_SRC = """agent inner
    steps are 3

agent outer
    tools are [inner]
    steps are 5

ask outer "what says inner" giving a
show a
"""


def agent_program(rng: random.Random) -> tuple[str, str | None]:
    """Returns (source, mind_name). Grammar shapes for spec 8.3 agents.
    Counting minds (mind_tools, mind_agent_inner, mind_agent_deep) get a
    fresh MIND_COUNT_FILE per side in check_agent_case."""
    k = rng.randrange(100000)
    shape = rng.random()
    if shape < 0.06:
        return AG_DEPTH_SRC, "mind_agent_deep.py"
    if shape < 0.12:
        return AG_NESTED_SRC, "mind_agent_inner.py"
    bangla = rng.random() < 0.2
    if bangla:
        src = (
            "বাংলা\n"
            "এজেন্ট ag\n"
            '    পারসোনা হয় "a helper."\n'
            "    মনেকরো হয় সত্য\n"
            "\n"
            'জিজ্ঞেস ag "fuzz hi" রেখে ans\n'
            "দেখাও ans\n"
        )
        if rng.random() < 0.5:
            src += "ভুলেযাও ag\n"
        return src, "mind_fixed.py"
    lines: list[str] = []
    tools: list[str] = []
    if shape < 0.35:
        for t in (f"t{k}a", f"t{k}b"):
            lines.append(f"to {t}")
            lines.append(f'    give back "r-{t}"')
            tools.append(t)
    elif shape < 0.45:
        lines.append("to read_logs")
        lines.append('    give back "3 errors"')
        tools.append("read_logs")
    lines.append("agent ag")
    settings = []
    if rng.random() < 0.7:
        settings.append(('    persona is "a fuzz helper."', None))
    if tools:
        settings.append(("    tools are [" + ", ".join(tools) + "]", None))
    if rng.random() < 0.5:
        settings.append((f"    remember is {rng.choice(['true', 'false', 'always'])}", None))
    if rng.random() < 0.7:
        settings.append((f"    steps are {rng.choice([1, 2, 3, 5])}", None))
    if rng.random() < 0.25:
        settings.append((f'    memory file is "agmem{k}.json"', None))
    # parse-error shapes: at most one bad setting, so the error is sharp
    bad = None
    if shape >= 0.75:
        bad = rng.choice([
            '    frobnicate is true',
            '    steps are 0',
            '    remember is maybe',
            '    steps are 5\n    steps are 5',
            '    tools are [ag]',
            '    persona is 42',
        ])
    if bad is not None:
        settings.append((bad, "bad"))
    for text, _ in settings:
        lines.append(text)
    lines.append("")
    has_bad = any(tag == "bad" for _, tag in settings)
    if has_bad:
        return "\n".join(lines) + "\n", None
    mind = "mind_tools.py" if tools == ["read_logs"] else "mind_fixed.py"
    ask_line = 'ask ag "fuzz question" giving ans'
    if rng.random() < 0.2:
        ask_line += " streaming"
    lines.append(ask_line)
    lines.append("show ans")
    if rng.random() < 0.3:
        lines.append('ask ag "second question" giving ans2')
        lines.append("show ans2")
    if rng.random() < 0.3:
        lines.append("forget ag")
    if rng.random() < 0.15:
        lines.append('ask nosuchagent "hi" giving zzz')
    return "\n".join(lines) + "\n", mind


def run_side_ag(args: list[str], prog: Path, cwd: Path, env: dict) -> tuple:
    """Returns (returncode, stdout) or ("timeout", "")."""
    try:
        proc = subprocess.run(
            [sys.executable] + args + [str(prog)],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
            stdin=subprocess.DEVNULL,
            env=env,
        )
        return proc.returncode, proc.stdout
    except subprocess.TimeoutExpired:
        return "timeout", ""


def check_agent_case(i: int, src: str, mind: str | None) -> tuple[list[str], int]:
    skips = 0
    TMPDIR.mkdir(parents=True, exist_ok=True)
    dir_b = TMPDIR / f"ag{i}b"
    dir_s = TMPDIR / f"ag{i}s"
    dir_b.mkdir(parents=True, exist_ok=True)
    dir_s.mkdir(parents=True, exist_ok=True)
    home_b = Path(tempfile.mkdtemp(prefix="aghome_b_"))
    home_s = Path(tempfile.mkdtemp(prefix="aghome_s_"))
    count_file = TMPDIR / f"agcount{i}.txt"
    try:
        (dir_b / "case.jc").write_text(src, encoding="utf-8")
        (dir_s / "case.jc").write_text(src, encoding="utf-8")
        envs = []
        for home in (home_b, home_s):
            env = dict(os.environ)
            env.pop("JESUNCODE_AI_COMMAND", None)
            if mind is not None:
                env["JESUNCODE_AI_COMMAND"] = (
                    sys.executable + " " + str(ROOT / "tests" / "fixtures" / mind))
            env["JESUN_CODE_HOME"] = str(home)
            count_file.write_text("0", encoding="utf-8")
            env["MIND_COUNT_FILE"] = str(count_file)
            envs.append(env)
        jesun_py = str(ROOT / "jesun.py")
        jesun_jc = str(ROOT / "jesun.jc")
        boot = run_side_ag([jesun_py, "case.jc"], Path("case.jc"), dir_b, envs[0])
        count_file.write_text("0", encoding="utf-8")
        selfhost = run_side_ag([jesun_py, jesun_jc, "case.jc"],
                               Path("case.jc"), dir_s, envs[1])
    finally:
        for d in (dir_b, dir_s):
            shutil.rmtree(d, ignore_errors=True)
        shutil.rmtree(home_b, ignore_errors=True)
        shutil.rmtree(home_s, ignore_errors=True)
        count_file.unlink(missing_ok=True)
    if boot[0] == "timeout" or selfhost[0] == "timeout":
        return [], 1
    problems: list[str] = []
    if boot != selfhost:
        problems.append(
            f"case {i}: agent MISMATCH (mind={mind})\n--- src ---\n{src}\n"
            f"--- bootstrap {boot[0]} ---\n{boot[1]}\n"
            f"--- selfhost {selfhost[0]} ---\n{selfhost[1]}\n"
        )
    for label, out in (("bootstrap", boot[1]), ("selfhost", selfhost[1])):
        for marker in ("Traceback", 'File "', "0x"):
            if marker in out:
                problems.append(
                    f"case {i}: {label} leaked {marker!r}\n---\n{src}\n---\n{out}"
                )
        if EXC_NAMES.search(out):
            problems.append(
                f"case {i}: {label} leaked exception name\n---\n{src}\n---\n{out}"
            )
    return problems, skips


# -- fleets (spec 8.4): valid blocks, memory files, parse errors, Bangla.
# Never generates failing fleet asks: spec 8.4.1 pins that shape as a
# known divergence, so the fuzzer stays byte-identical.


def fleet_program(rng: random.Random) -> tuple[str, str | None]:
    """Returns (source, mind_name). Grammar shapes for spec 8.4 fleets.
    mind is None for parse-error shapes (no ask ever runs). Valid
    shapes reuse check_agent_case's harness: per-side scratch folders
    isolate the cwd-relative fleet memory files."""
    k = rng.randrange(100000)
    shape = rng.random()
    if rng.random() < 0.2:
        src = (
            "বাংলা\n"
            "এজেন্ট স্কাউট\n"
            '    পারসোনা হয় "তুমি স্কাউট।"\n'
            "    ধাপ হয় ৫\n"
            "\n"
            "দল ক্রু সহ স্কাউট\n"
            f'    স্মৃতি ফাইল হয় "flmem{k}.json"\n'
            '    জিজ্ঞেস স্কাউট "ফাজ প্রশ্ন" রেখে উত্তর\n'
            "\n"
            "দেখাও উত্তর\n"
            "দেখাও ক্রু\n"
        )
        return src, "mind_fixed.py"
    head = (
        "agent a1\n"
        '    persona is "a fuzz helper."\n'
        "    steps are 3\n"
        "\n"
        "agent a2\n"
        '    persona is "another fuzz helper."\n'
        "    steps are 3\n"
        "\n"
    )
    if shape < 0.6:
        lines = ["fleet fl with a1 and a2"]
        if rng.random() < 0.5:
            lines.append(f'    memory file is "flmem{k}.json"')
        members = ["a1", "a2"]
        for q in range(rng.choice([1, 2, 3])):
            lines.append(
                f'    ask {rng.choice(members)} "fuzz question {q}" giving r{q}')
        lines += ["", "show fl", "show r0"]
        return head + "\n".join(lines) + "\n", "mind_fixed.py"
    # parse-error shapes: the fleet never runs, so no mind is needed
    bad = rng.choice([
        '    ask a9 "hi" giving r',
        '    ask a1 "hi" giving r streaming',
        (f'    memory file is "a{k}.json"\n'
         f'    memory file is "b{k}.json"\n'
         '    ask a1 "hi" giving r'),
        '    dance a1 "hi"',
        '    ask a1 42 giving r',
    ])
    src = head + "fleet fl with a1 and a2\n" + bad + "\n"
    return src, None


# -- jpm (spec 8.5): bring-in/use shapes against a seeded local tree.
# Never generates `use` of a missing address with git present (that
# would attempt a real network clone), deep-nesting shapes (spec 8.5.5
# pins that as a known divergence), or failing-then-continuing
# programs (any jpm failure ends the run on both sides, so shapes are
# single-shot).


def seed_jpm_fuzz_tree(home: Path, dirty: bool = False) -> None:
    """Seed packages/github.com/u/ with a fixed small tree (no network).
    dirty=True also builds a git checkout with uncommitted changes for
    the dirty-`use` shape."""
    pkgs = home / "packages" / "github.com" / "u"

    def put(pkg: str, files: dict) -> None:
        for rel, content in files.items():
            path = pkgs / pkg / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")

    put("greeter", {"greeter.jc":
                    'to greet with name\n    give back "hello, " + name\n'})
    put("oops", {"oops.jc": 'fail with "kablam"\n'})
    put("circa", {"circa.jc": 'bring in "circb"\n'})
    put("circb", {"circb.jc": 'bring in "circa"\n'})
    put("badjson", {"badjson.jc": 'show "never"\n', "jpm.json": "{oops"})
    put("esc", {"esc.jc": 'show "never"\n',
                "jpm.json": '{"main": "../evil.jc"}'})
    (pkgs / "empty").mkdir(parents=True, exist_ok=True)
    put("multi", {"lib.jc": 'to libfn with x\n    give back x + 1\n',
                  "jpm.json": '{"main": "lib.jc"}'})
    put("cleanpkg", {"cleanpkg.jc": 'show "installed"\n'})
    if dirty:
        dest = pkgs / "dirty"
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "dirty.jc").write_text('show "dirty"\n', encoding="utf-8")
        git_env = dict(os.environ)
        git_env["GIT_CONFIG_NOSYSTEM"] = "1"

        def git(*args: str) -> None:
            subprocess.run(
                ["git", "-c", "user.email=t@t", "-c", "user.name=t",
                 "-c", "init.defaultBranch=main", *args],
                cwd=str(dest), check=True, capture_output=True,
                env=git_env)

        git("init", "-q")
        git("add", "-A")
        git("commit", "-qm", "seed")
        (dest / "dirty.jc").write_text('show "dirty modified"\n',
                                       encoding="utf-8")


def jpm_program(rng: random.Random) -> tuple[str, bool, bool]:
    """Returns (source, no_git, dirty). Grammar shapes for spec 8.5 jpm:
    bring-in of seeded packages, package error shapes, circle, manifest
    and escape failures, `use` validation shapes, already-installed and
    dirty `use`, and the Bangla `use` spelling. no_git scrubs git from
    PATH; dirty seeds the dirty checkout."""
    k = rng.randrange(100000)
    shape = rng.random()
    no_git = False
    dirty = False
    if shape < 0.35:
        pkg = rng.choice(["greeter", "multi", "cleanpkg"])
        lines = [f'bring in "{pkg}"']
        if pkg == "greeter":
            lines.append(f'show greet with "fuzz{k}"')
        elif pkg == "multi":
            lines.append(f"show libfn with {k % 100}")
        else:
            lines.append("show 1 + 1")
        return "\n".join(lines) + "\n", no_git, dirty
    if shape < 0.55:
        bad = rng.choice([
            'bring in "oops"',
            'bring in "circa"',
            'bring in "badjson"',
            'bring in "esc"',
            'bring in "empty"',
            'bring in "neverfetched"',
            'bring in "a b"',
            "bring in 42",
            'bring in ".."',
            'bring in ""',
        ])
        return bad + "\n", no_git, dirty
    if shape < 0.75:
        use = rng.choice([
            'use "not-an-address"',
            'use "a/b"',
            'use "a/b/c/d"',
            'use "example.com/u/pkg"',
            'use "github.com/u/cleanpkg"',
        ])
        tail = "\nshow \"after use\"\n" if "cleanpkg" in use else "\n"
        return use + tail, no_git, dirty
    if shape < 0.85:
        dirty = True
        return 'use "github.com/u/dirty"\n', no_git, dirty
    if shape < 0.95:
        no_git = True
        return 'use "github.com/u/ghost"\n', no_git, dirty
    src = ("বাংলা\n"
           'ব্যবহার "github.com/u/cleanpkg"\n'
           "দেখাও ৪২\n")
    return src, no_git, dirty


def check_jpm_case(i: int, src: str, no_git: bool,
                   dirty: bool) -> tuple[list[str], int]:
    skips = 0
    TMPDIR.mkdir(parents=True, exist_ok=True)
    dir_b = TMPDIR / f"jpm{i}b"
    dir_s = TMPDIR / f"jpm{i}s"
    dir_b.mkdir(parents=True, exist_ok=True)
    dir_s.mkdir(parents=True, exist_ok=True)
    home_b = Path(tempfile.mkdtemp(prefix="jpmhome_b_"))
    home_s = Path(tempfile.mkdtemp(prefix="jpmhome_s_"))
    empty_bin = None
    try:
        (dir_b / "case.jc").write_text(src, encoding="utf-8")
        (dir_s / "case.jc").write_text(src, encoding="utf-8")
        seed_jpm_fuzz_tree(home_b, dirty=dirty)
        seed_jpm_fuzz_tree(home_s, dirty=dirty)
        envs = []
        for home in (home_b, home_s):
            env = dict(os.environ)
            env.pop("JESUNCODE_AI_COMMAND", None)
            env["JESUN_CODE_HOME"] = str(home)
            if no_git:
                if empty_bin is None:
                    empty_bin = tempfile.mkdtemp(prefix="jpmnogit_")
                env["PATH"] = empty_bin
            envs.append(env)
        jesun_py = str(ROOT / "jesun.py")
        jesun_jc = str(ROOT / "jesun.jc")
        boot = run_side_ag([jesun_py, "case.jc"], Path("case.jc"), dir_b,
                           envs[0])
        selfhost = run_side_ag([jesun_py, jesun_jc, "case.jc"],
                               Path("case.jc"), dir_s, envs[1])
    finally:
        for d in (dir_b, dir_s):
            shutil.rmtree(d, ignore_errors=True)
        shutil.rmtree(home_b, ignore_errors=True)
        shutil.rmtree(home_s, ignore_errors=True)
        if empty_bin is not None:
            shutil.rmtree(empty_bin, ignore_errors=True)
    if boot[0] == "timeout" or selfhost[0] == "timeout":
        return [], 1
    problems: list[str] = []
    if boot != selfhost:
        problems.append(
            f"case {i}: jpm MISMATCH\n--- src ---\n{src}\n"
            f"--- bootstrap {boot[0]} ---\n{boot[1]}\n"
            f"--- selfhost {selfhost[0]} ---\n{selfhost[1]}\n"
        )
    for label, out in (("bootstrap", boot[1]), ("selfhost", selfhost[1])):
        for marker in ("Traceback", 'File "', "0x"):
            if marker in out:
                problems.append(
                    f"case {i}: {label} leaked {marker!r}\n---\n{src}\n---\n{out}"
                )
        if EXC_NAMES.search(out):
            problems.append(
                f"case {i}: {label} leaked exception name\n---\n{src}\n---\n{out}"
            )
    return problems, skips


def check(i: int, src: str) -> tuple[list[str], int]:
    skips = 0
    TMPDIR.mkdir(parents=True, exist_ok=True)
    prog = TMPDIR / f"case{i}.jc"
    prog.write_text(src, encoding="utf-8")
    try:
        boot = run_side(["jesun.py"], prog.relative_to(ROOT))
        selfhost = run_side(["jesun.py", "jesun.jc"], prog.relative_to(ROOT))
    finally:
        prog.unlink(missing_ok=True)
    if boot[0] == "timeout" or selfhost[0] == "timeout":
        return [], 1
    problems: list[str] = []
    if boot != selfhost:
        problems.append(
            f"case {i}: MISMATCH\n--- src ---\n{src}\n"
            f"--- bootstrap {boot[0]} ---\n{boot[1]}\n"
            f"--- selfhost {selfhost[0]} ---\n{selfhost[1]}\n"
        )
    for label, out in (("bootstrap", boot[1]), ("selfhost", selfhost[1])):
        for marker in ("Traceback", 'File "', "0x"):
            if marker in out:
                problems.append(
                    f"case {i}: {label} leaked {marker!r}\n---\n{src}\n---\n{out}"
                )
        if EXC_NAMES.search(out):
            problems.append(
                f"case {i}: {label} leaked exception name\n---\n{src}\n---\n{out}"
            )
    return problems, skips


BN_WORDS = [
    "দেখাও", "হয়", "না", "সত্য", "মিথ্যা", "ফাঁকা", "জিজ্ঞেস", "রেখে",
    "যদি", "তাহলে", "নইলে", "আবার", "বার", "যতক্ষণ", "জন্য", "প্রতিটি",
    "ভেতরে", "জন্যে", "সহ", "এবং", "অথবা", "দাও", "ফেরত", "থামো", "এড়িয়ে",
    "এর", "প্রথম", "শেষ", "দৈর্ঘ্য", "বড়হাতা", "ছোটহাতা", "বড়", "ছোট",
    "চেয়ে", "কমপক্ষে", "সবচেয়ে", "নম্বরে", "আছে", "ভাগ", "জোড়া", "ছাঁটো",
    "দিয়ে", "চাবি", "আনো", "হিসেবে", "পড়ো", "লেখো", "যোগকরো", "ফাইল",
    "মন্তব্য",
    "show", "is", "note",
    "ক", "খ", "গ",
    '"নমস্কার"', '"hello"',
    "০", "১", "২", "৩", "৪", "৫", "৪২", "৩.৫", "১০",
    "0", "1", "2",
    "+", "-", "*", "/", "%", "(", ")", "[", "]", ",", ".", "=",
    "    ", "        ",
]


def bangla_program(rng: random.Random) -> str:
    """A Bangla-mode program: a valid header, then word soup. Both sides
    must agree on header detection, the comment word, and keyword kinds."""
    lines = []
    if rng.random() < 0.3:
        lines.append(rng.choice(["", "note leading comment", ""]))
    lines.append(rng.choice(["use bangla", "বাংলা"]))
    for _ in range(rng.randint(1, 6)):
        indent = rng.choice(["", "", "", "    "])
        body = " ".join(rng.choice(BN_WORDS) for _ in range(rng.randint(0, 7)))
        lines.append(indent + body)
    return "\n".join(lines) + "\n"


SUGGEST_NAMES = ["name", "total", "count", "alpha", "alpine", "username", "value"]


def near_miss(rng: random.Random, name: str) -> str:
    """A near-miss spelling of a defined name: transposition, dropped
    char, prefix, case flip, or suffix. Exercises the unknown-word
    suggestion rule (prefix, then difflib) on both sides."""
    op = rng.random()
    if op < 0.3 and len(name) > 2:
        i = rng.randrange(len(name) - 1)
        return name[:i] + name[i + 1] + name[i] + name[i + 2:]
    if op < 0.5 and len(name) > 1:
        i = rng.randrange(len(name))
        return name[:i] + name[i + 1:]
    if op < 0.7 and len(name) > 1:
        return name[: rng.randint(1, len(name) - 1)]
    if op < 0.85:
        i = rng.randrange(len(name))
        c = name[i]
        flipped = c.upper() if c.islower() else c.lower()
        return name[:i] + flipped + name[i + 1:]
    return name + "z"


def suggest_program(rng: random.Random) -> str:
    """Unknown-name suggestion shapes (spec 9.2a, sprint 4): define some
    names, then use near-miss spellings. Both sides must suggest the
    same name (or none) with the same innermost-first, prefix-then-
    difflib rule; shadowing (the same stem defined in a function)
    checks candidate order."""
    defs = rng.sample(SUGGEST_NAMES, rng.randint(1, 4))
    lines = [f"{n} is {rng.randint(0, 9)}" for n in defs]
    if rng.random() < 0.4:
        shadow = rng.choice(defs) + rng.choice(["s", "x", "2"])
        lines.append("to f with q")
        lines.append(f"    {shadow} is 1")
        lines.append(f"    show {near_miss(rng, shadow)}")
        lines.append("f with 0")
    lines.append(f"show {near_miss(rng, rng.choice(defs))}")
    return "\n".join(lines) + "\n"


def main() -> int:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 150
    rng = random.Random(20260925)
    problems: list[str] = []
    skipped = 0
    for i in range(count):
        if i % 3 == 2:
            src, stdin_text = phaseb_program(rng)
            case_problems, case_skips = check_pb(i, src, stdin_text)
        elif i % 5 == 4:
            src = bangla_program(rng)
            case_problems, case_skips = check(i, src)
        elif i % 7 == 6:
            src, mind = ai_program(rng)
            case_problems, case_skips = check_ai(i, src, mind)
        elif i % 11 == 10:
            src, mind = agent_program(rng)
            case_problems, case_skips = check_agent_case(i, src, mind)
        elif i % 13 == 12:
            src, mind = fleet_program(rng)
            case_problems, case_skips = check_agent_case(i, src, mind)
        elif i % 17 == 16:
            src, no_git, dirty = jpm_program(rng)
            case_problems, case_skips = check_jpm_case(i, src, no_git, dirty)
        elif i % 19 == 18:
            src = suggest_program(rng)
            case_problems, case_skips = check(i, src)
        else:
            src = token_soup(rng) if i % 2 == 0 else mutate(rng, rng.choice(SEEDS))
            case_problems, case_skips = check(i, src)
        problems.extend(case_problems)
        skipped += case_skips
        if len(problems) >= 10:
            break
    for problem in problems[:10]:
        print(problem)
        print("=" * 60)
    print(f"ran {count}, mismatches {len(problems)}, timeouts skipped {skipped}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
