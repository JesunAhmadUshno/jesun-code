"""Interpreter benchmark: bootstrap (python jesun.py) vs the self-hosted
walker (python jesun.py jesun.jc) vs an equivalent CPython program.

Run: python3 scripts/bench.py        (about 15 seconds; writes results/bench.json)

Each program runs RUNS times per leg as a fresh process, and the median
wall-clock time is recorded. Process start-up is included on purpose: it is
what a person running `jesun prog.jc` actually waits for. The empty program
row measures that start-up alone, so the per-program cost can be read off.

fib(12) is kept small because the self-hosted walker hits its recursion
guard near depth 15 (pinned gap, spec 9.1); the native C build is not timed
here because it needs a C compiler and is a separate path (jesun_build.py).
"""
import json
import os
import platform
import statistics
import subprocess
import sys
import tempfile
import time
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
RUNS = 5

PROGRAMS = {
    "empty": ("", ""),
    "loop_20000": (
        "total is 0\nrepeat 20000 times\n    total is total + 1\nshow total\n",
        "total = 0\nfor _ in range(20000):\n    total = total + 1\nprint(total)\n",
    ),
    "fib_12": (
        "to fib with n\n    if n is at most 1 then\n        give back n\n"
        "    give back (fib with (n - 1)) + (fib with (n - 2))\n\n"
        'show "fib(12) = {fib with 12}"\n',
        "def fib(n):\n    return n if n <= 1 else fib(n - 1) + fib(n - 2)\n"
        'print(f"fib(12) = {fib(12)}")\n',
    ),
}


def timed(cmd, cwd):
    t0 = time.perf_counter()
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                          timeout=120, stdin=subprocess.DEVNULL)
    return time.perf_counter() - t0, proc.returncode, proc.stdout


def main():
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for name, (jc, py) in PROGRAMS.items():
            Path(tmp, "prog.jc").write_text(jc, encoding="utf-8")
            Path(tmp, "prog.py").write_text(py, encoding="utf-8")
            legs = {
                "bootstrap": [sys.executable, str(REPO / "jesun.py"), "prog.jc"],
                "selfhosted": [sys.executable, str(REPO / "jesun.py"),
                               str(REPO / "jesun.jc"), "prog.jc"],
                "cpython": [sys.executable, "prog.py"],
            }
            row = {"program": name, "source_jc": jc}
            outputs = {}
            for leg, cmd in legs.items():
                times = []
                for _ in range(RUNS):
                    secs, code, out = timed(cmd, tmp)
                    assert code == 0, f"{name}/{leg} exited {code}: {out}"
                    times.append(secs)
                outputs[leg] = out
                row[f"{leg}_median_s"] = round(statistics.median(times), 4)
                row[f"{leg}_runs_s"] = [round(t, 4) for t in times]
            assert len(set(outputs.values())) == 1, f"{name}: outputs differ"
            row["output"] = outputs["bootstrap"]
            rows.append(row)
            print(f"{name:12s} boot {row['bootstrap_median_s']:.3f}s  "
                  f"self {row['selfhosted_median_s']:.3f}s  "
                  f"cpython {row['cpython_median_s']:.3f}s")
    out = REPO / "results" / "bench.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({
        "generated_by": "python3 scripts/bench.py",
        "date": date.today().isoformat(),
        "runs_per_leg": RUNS,
        "statistic": "median wall-clock seconds per fresh process",
        "machine": {"system": platform.system(), "machine": platform.machine(),
                    "python": platform.python_version(),
                    "cpus": os.cpu_count()},
        "programs": rows,
    }, indent=1) + "\n")
    print(f"wrote {out.relative_to(REPO)}")


if __name__ == "__main__":
    main()
