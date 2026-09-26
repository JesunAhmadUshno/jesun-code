"""Jesun.Code differential fuzzer: interpreter vs `jesun build` native binary.

Generates random programs from the v1.1 supported subset, runs each
through the interpreter and through a compiled native binary, and
requires byte-identical stdout and return code.

Violations:
  - outputs or return codes differ between the two legs
  - any non-JesunError exception escapes either leg
  - output contains "Traceback", 'File "', "0x", or a Python exception name
  - the native binary crashes (segfault etc.) instead of failing in
    plain English

Run: python3 tests/fuzz_build.py [count]
Exit 0 when clean, 1 when a violation is found (first 10 shown).
"""
import io
import random
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import jesun  # noqa: E402
import jesun_build  # noqa: E402

jesun.MAX_LOOP_RUNS = 2000

EXC_NAMES = re.compile(
    r"\b(TypeError|ValueError|KeyError|IndexError|AttributeError|RecursionError|"
    r"NameError|SyntaxError|RuntimeError|MemoryError|OSError|IOError|"
    r"ZeroDivisionError|StopIteration|AssertionError|Exception)\b"
)

NAMES = ["a", "b", "c", "total", "x", "item", "n", "s", "val", "tmp"]
WORDS = ["alpha", "beta", "gamma", "hello", "world", "jesun", "code", "native"]


def rtext(rng):
    return rng.choice(WORDS)


def rexpr(rng, depth=0):
    if depth > 3:
        return rng.choice(["1", "2", '"x"', "true", "nothing"])
    kind = rng.randrange(12)
    if kind == 0:
        return str(rng.randrange(-50, 200))
    if kind == 1:
        return f"{rng.randrange(-99, 99) / 10:.1f}"
    if kind == 2:
        return f'"{rtext(rng)}"'
    if kind == 3:
        return rng.choice(["true", "false", "nothing"])
    if kind == 4:
        return rng.choice(NAMES)
    if kind == 5:
        return f"{rexpr(rng, depth+1)} {rng.choice(['+', '-', '*', '%'])} {rexpr(rng, depth+1)}"
    if kind == 6:
        return f'"{rtext(rng)} {{{rexpr(rng, depth+1)}}}"'
    if kind == 7:
        items = ", ".join(rexpr(rng, depth + 1) for _ in range(rng.randrange(0, 4)))
        return f"[{items}]"
    if kind == 8:
        return f"length of {rexpr(rng, depth+1)}"
    if kind == 9:
        return f"{rexpr(rng, depth+1)}[{rng.randrange(-2, 3)}]"
    if kind == 10:
        return f"({rexpr(rng, depth+1)})"
    return f'"{rtext(rng)}" + "{rtext(rng)}"'


def rcond(rng):
    left = rexpr(rng)
    op = rng.choice(
        ["is", "is not", "is greater than", "is less than", "is at least",
         "is at most", "contains"]
    )
    right = rexpr(rng)
    cond = f"{left} {op} {right}"
    if rng.random() < 0.25:
        cond = f"not {cond}"
    return cond


def rblock(rng, indent, budget):
    lines = []
    n = rng.randrange(1, 4)
    for _ in range(n):
        lines.extend(rstmt(rng, indent, budget))
    return lines


def rstmt(rng, indent, budget):
    pad = "    " * indent
    kind = rng.randrange(14)
    if kind == 0:
        return [f"{pad}show {rexpr(rng)}"]
    if kind == 1:
        return [f"{pad}{rng.choice(NAMES)} is {rexpr(rng)}"]
    if kind == 2:
        lines = [f"{pad}if {rcond(rng)} then"]
        lines.extend(rblock(rng, indent + 1, budget))
        if rng.random() < 0.4:
            lines.append(f"{pad}otherwise")
            lines.extend(rblock(rng, indent + 1, budget))
        return lines
    if kind == 3:
        lines = [f"{pad}repeat {rng.randrange(0, 5)} times"]
        lines.extend(rblock(rng, indent + 1, budget))
        return lines
    if kind == 4:
        var = rng.choice(NAMES)
        lines = [f"{pad}for each {var} in [{', '.join(str(rng.randrange(5)) for _ in range(rng.randrange(1, 4)))}]"]
        lines.extend(rblock(rng, indent + 1, budget))
        return lines
    if kind == 5:
        return [f"{pad}push {rexpr(rng)} to {rng.choice(NAMES)}"]
    if kind == 6:
        return [f"{pad}{rng.choice(['stop', 'skip'])}"]
    if kind == 7:
        name = rng.choice(NAMES)
        return [f"{pad}to helper_{name} with q", f"{pad}    give back q + 1"]
    if kind == 8:
        return [f"{pad}show {rng.choice(['uppercase', 'lowercase', 'trim'])} of \"{rtext(rng)}\""]
    if kind == 9:
        return [f"{pad}show text of {rexpr(rng)}"]
    if kind == 10:
        return [f"{pad}show kind of {rexpr(rng)}"]
    if kind == 11:
        a, b = rng.randrange(1, 20), rng.randrange(0, 20)
        return [f"{pad}show {a} / {b}", f"{pad}show {a} % {b}"]
    if kind == 12:
        return [f"{pad}show {rexpr(rng)} contains {rexpr(rng)}"]
    return [f"{pad}note fuzz"]


def rprogram(rng):
    names_init = [f"{n} is {rng.randrange(10)}" for n in rng.sample(NAMES, 3)]
    lines = names_init + rblock(rng, 0, 0)
    return "\n".join(lines) + "\n"


def run_interpreted(source):
    out = io.StringIO()
    interp = jesun.Interpreter(stdout=out)
    interp.global_env.set("arguments", [])
    try:
        jesun.run_source(source, interp)
        return out.getvalue(), 0, None
    except jesun.JesunError as err:
        out.write(str(err) + "\n")
        return out.getvalue(), 1, None
    except Exception as err:  # noqa: BLE001
        return out.getvalue(), -99, f"interpreter raised {type(err).__name__}: {err}"


def run_native(source, tmp):
    src = tmp / "fuzz.jc"
    src.write_text(source, encoding="utf-8")
    binary = tmp / "fuzzbin"
    # build_file prints build errors (parse errors, unsupported
    # features) instead of raising; capture that output so a rejected
    # program compares message-for-message with the interpreter leg.
    buf = io.StringIO()
    old_stdout = sys.stdout
    sys.stdout = buf
    try:
        rc = jesun_build.build_file(str(src), str(binary))
    except jesun.JesunError as err:
        return f"{err}\n", 1, None
    except Exception as err:  # noqa: BLE001
        return "", -99, f"build raised {type(err).__name__}: {err}"
    finally:
        sys.stdout = old_stdout
    if rc != 0:
        return buf.getvalue(), 1, None
    try:
        proc = subprocess.run(
            [str(binary)], capture_output=True, text=True, timeout=30,
            cwd=str(tmp),
        )
        return proc.stdout, proc.returncode, None
    except subprocess.TimeoutExpired:
        return "", -99, "native binary timed out"
    except Exception as err:  # noqa: BLE001
        return "", -99, f"native run raised {type(err).__name__}: {err}"


def check_output(text, where):
    if "Traceback" in text or 'File "' in text or "0x" in text:
        return f"{where}: leaked internals"
    if EXC_NAMES.search(text):
        return f"{where}: python exception name leaked"
    return None


def main():
    if shutil.which("cc") is None:
        print("SKIP: no C compiler")
        return 0
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    rng = random.Random(20260926)
    bad = 0
    tmp = Path(tempfile.mkdtemp(prefix="jcfuzz"))
    try:
        for i in range(count):
            src = rprogram(rng)
            i_out, i_rc, i_err = run_interpreted(src)
            n_out, n_rc, n_err = run_native(src, tmp)
            problems = []
            if i_err:
                problems.append(i_err)
            if n_err:
                problems.append(n_err)
            if not problems:
                if i_rc != n_rc:
                    problems.append(f"return code differs: interp={i_rc} native={n_rc}")
                if i_out != n_out:
                    problems.append(
                        f"output differs:\n--- interp ---\n{i_out}\n--- native ---\n{n_out}"
                    )
                p = check_output(i_out, "interp")
                if p:
                    problems.append(p)
                p = check_output(n_out, "native")
                if p:
                    problems.append(p)
                if n_rc not in (0, 1):
                    problems.append(f"native crashed with rc={n_rc}")
            if problems:
                bad += 1
                print(f"[{i}] VIOLATION")
                print(src)
                for p in problems:
                    print("   " + p)
                print("---")
                if bad >= 10:
                    break
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"{count} programs, {bad} violations")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
