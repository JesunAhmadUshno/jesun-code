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

Run: python3 tests/fuzz_selfhost.py [count]
Exit 0 when clean, 1 on the first mismatch batch (up to 10 shown).
"""
import os
import random
import re
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
        for child in case_dir.iterdir():
            if child.is_file():
                child.unlink(missing_ok=True)
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
