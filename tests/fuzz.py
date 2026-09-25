"""Jesun.Code fuzzer: throw a few hundred weird programs at the interpreter.

Every program must either run or fail in plain English. Violations:
  - any non-JesunError exception escapes execute()
  - output contains "Traceback", 'File "', "0x", or a Python exception name

Run: python3 tests/fuzz.py [count]
Exit 0 when clean, 1 when a violation is found (first 10 shown).
"""
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import jesun  # noqa: E402

# Keep fuzz fast: a runaway loop still exercises the guard, just sooner.
jesun.MAX_LOOP_RUNS = 2000

EXC_NAMES = re.compile(
    r"\b(TypeError|ValueError|KeyError|IndexError|AttributeError|RecursionError|"
    r"NameError|SyntaxError|RuntimeError|MemoryError|OSError|IOError|"
    r"ZeroDivisionError|StopIteration|AssertionError|Exception)\b"
)

# Deliberately excludes: import (real imports), ai (subprocess), and the
# tmux words (real sessions exist on this machine). Those get targeted tests.
WORDS = [
    "show", "is", "not", "true", "false", "nothing", "ask", "giving",
    "if", "then", "otherwise", "repeat", "times", "while", "for", "each",
    "in", "to", "with", "and", "or", "give", "back", "stop", "skip",
    "of", "first", "last", "length", "uppercase", "lowercase", "greater",
    "less", "than", "least", "most", "at", "contains", "note",
    "split", "join", "trim", "by", "keys",
    "x", "y", "z", "name", "naem", "total", "count", "item", "friend",
    "greet", "add", "f", "dance", "cheer",
    '"hello"', '"hi"', '""', '"a b c"', '"1,2,3"', '"  padded  "',
    '"unterminated', "'q'",
    "0", "1", "2", "3", "5", "10", "100", "999999999999999999999",
    "3.14", "-1", "-2.5", "1e5",
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
    'ask "Q?" giving name\nshow name\n',
    'show length of "hello"\nshow first of [1]\n',
    'note just a comment\n',
    'x is 1\nrepeat while x is less than 3\n    show x\n    x is x + 1\n',
    # v0.4 jpm: all of these fail before any network or filesystem write.
    'use "not an address"\n',
    'use "a/b/c/d"\n',
    'use "github.com/../evil"\n',
    'use "gitlab.com/u/p"\n',
    'use 42\n',
    'bring in "ghost"\n',
    'bring in ".."\n',
    'bring in ""\n',
    'read file "../evil.txt" giving t\n',
    'show time_today\n',
]


def token_soup(rng: random.Random) -> str:
    lines = []
    for _ in range(rng.randint(1, 12)):
        indent = rng.choice(["", "", "", "    ", "        ", "            "])
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
    if rng.random() < 0.15:
        text += "(" * rng.randint(50, 300)
    return text


def check(i: int, src: str) -> list[str]:
    problems: list[str] = []
    try:
        out = jesun.execute(src, "")
    except Exception as err:  # noqa: BLE001 - any escape is the bug
        return [f"case {i}: {type(err).__name__} escaped: {err!r}\n---\n{src}\n---"]
    for marker in ("Traceback", 'File "', "0x"):
        if marker in out:
            problems.append(f"case {i}: leaked {marker!r}\n---\n{src}\n---\n{out}")
    if EXC_NAMES.search(out):
        problems.append(f"case {i}: leaked exception name\n---\n{src}\n---\n{out}")
    return problems


def main() -> int:
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    rng = random.Random(20260925)
    problems: list[str] = []
    for i in range(count):
        if i % 2 == 0:
            src = token_soup(rng)
        else:
            src = mutate(rng, rng.choice(SEEDS))
        problems.extend(check(i, src))
        if len(problems) >= 10:
            break
    print(f"fuzz: {count} cases, {len(problems)} violations")
    for p in problems[:10]:
        print(p)
        print("=====")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
