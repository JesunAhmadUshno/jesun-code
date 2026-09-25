"""Differential fuzzer: the bootstrap and the self-hosted interpreter must agree.

Generates small phase-A-only programs (no stdin, no files, no network, no
minds: nothing with side effects beyond stdout), runs each through
`python jesun.py prog` and `python jesun.py jesun.jc prog`, and requires
identical (returncode, stdout). Also enforces the zero-leakage rule on
both outputs: no tracebacks, no Python exception names, no "0x".

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
    "push", "characters", "text", "kind", "fail",
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


def main() -> int:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 150
    rng = random.Random(20260925)
    problems: list[str] = []
    skipped = 0
    for i in range(count):
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
