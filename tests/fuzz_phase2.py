"""Targeted fuzz for the Python bridge, minds, and tmux paths.

Controlled environment: no network, fixtures for the mind, real tmux with
cleanup. Every case must fail in plain English or succeed; violations:
  - any non-JesunError exception escapes
  - output contains "Traceback", 'File "', "0x", or a Python exception name
  - a tmux session outside the jc_ slug namespace gets created

Run: python3 tests/fuzz_phase2.py
"""
import os
import random
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import jesun  # noqa: E402

jesun.MAX_LOOP_RUNS = 2000
jesun.AI_TIMEOUT = 3  # fuzz-local: timeout path still exercised

EXC_NAMES = re.compile(
    r"\b(TypeError|ValueError|KeyError|IndexError|AttributeError|RecursionError|"
    r"NameError|SyntaxError|RuntimeError|MemoryError|OSError|IOError|"
    r"ZeroDivisionError|StopIteration|AssertionError|Exception)\b"
)

TMP = Path(tempfile.mkdtemp(prefix="jc-fuzz2-"))
os.environ["JESUNCODE_AI_COMMAND"] = ""


def mind_script(name: str, body: str) -> str:
    p = TMP / name
    p.write_text("#!/bin/sh\n" + body + "\n")
    p.chmod(p.stat().st_mode | stat.S_IEXEC)
    return str(p)


MIND_OK = mind_script("ok.sh", 'printf "all good\\n"')
MIND_GARBAGE = mind_script(
    "garbage.sh",
    'head -c 200000 /dev/urandom | base64 | head -c 50000; printf "\\n"',
)
MIND_CALLS = mind_script(
    "calls.sh",
    'printf "CALL: nope(\\nCALL: f(((\\nCALL: \\n"; head -c 100 /dev/zero | tr "\\0" "("; printf "\\n"',
)
MIND_TRACEBACK = mind_script(
    "tb.sh", 'printf "Traceback (most recent call last):\\n  File \\"x\\", line 1\\nValueError: boom\\n" >&2; exit 1',
)
MIND_SLOW = mind_script("slow.sh", "sleep 30")

MODULES = [
    "math", "os", "os.path", "sys", "json", "re", "random",
    "no_such_mod_xyz", "os.nope", "a.b.c.d.e", "math.",
    "sys.modules", "os.path.join",
]
NAMES = ["w", "weird name!", "../../x", "", "a" * 100, "$(rm -rf /)", "x;y",
         "semi;colon", "back`tick", "quo'te", "uni\u00e9\u4e2d", "  spaces  "]


def check(label: str, src: str, env_extra: dict | None = None) -> list[str]:
    problems: list[str] = []
    old = dict(os.environ)
    try:
        if env_extra:
            os.environ.update(env_extra)
        out = jesun.execute(src, "")
    except Exception as err:  # noqa: BLE001
        return [f"{label}: {type(err).__name__} escaped: {err!r}\n---\n{src}"]
    finally:
        os.environ.clear()
        os.environ.update(old)
    for marker in ("Traceback", 'File "'):
        if marker in out:
            problems.append(f"{label}: leaked {marker!r}\n---\n{src}\n---\n{out[:800]}")
    # 0x is only a leak in interpreter-generated error lines; a mind's own
    # answer (or user data) may legitimately contain it.
    for ln in out.split("\n"):
        if ln.startswith("Line ") and "0x" in ln:
            problems.append(f"{label}: leaked '0x' in error\n---\n{src}\n---\n{out[:800]}")
            break
    if EXC_NAMES.search(out):
        problems.append(f"{label}: leaked exception name\n---\n{src}\n---\n{out[:800]}")
    return problems


def sessions() -> set[str]:
    try:
        out = subprocess.run(["tmux", "list-sessions", "-F", "#{session_name}"],
                             capture_output=True, text=True, timeout=10).stdout
        return set(out.split())
    except Exception:
        return set()


def main() -> int:
    rng = random.Random(987654)
    problems: list[str] = []
    before = sessions()

    # 1. bridge: weird imports, attribute chains, foreign calls
    for i in range(60):
        mod = rng.choice(MODULES)
        src = f"import {mod}\n" if not mod.endswith(".") else f"import math\n"
        tail = rng.choice([
            "show math\n", "show math.pi\n", "show math.sqrt(4)\n",
            "show math.sqrt(-1)\n", "show math.nope\n", "show math.pi.pi\n",
            "x is math.sqrt\nshow x(9)\n", "show [1,2][5]\n",
            'show {"k": 1}["k"]\n',
        ])
        # note: dict literal is not Jesun.Code; use a real dict via json
        src = f"import {mod}\nimport json as j\nd is j.loads('{{\"a\": 1}}')\n" + tail.replace(
            '{"k": 1}["k"]', 'd["a"]').replace("math", mod.split(".")[0] if "." not in mod or mod in ("os.path",) else "math")
        problems.extend(check(f"bridge-{i}", src))

    # 2. minds: garbage / hostile / slow / tracebacking providers
    to = 'to tool1 with x\n    give back "r:" + x\n'
    for i, (label, script, extra) in enumerate([
        ("mind-ok", MIND_OK, {"JESUNCODE_AI_COMMAND": MIND_OK}),
        ("mind-garbage", MIND_GARBAGE, {"JESUNCODE_AI_COMMAND": MIND_GARBAGE}),
        ("mind-calls", MIND_CALLS, {"JESUNCODE_AI_COMMAND": MIND_CALLS}),
        ("mind-tb", MIND_TRACEBACK, {"JESUNCODE_AI_COMMAND": MIND_TRACEBACK}),
        ("mind-slow", MIND_SLOW, {"JESUNCODE_AI_COMMAND": MIND_SLOW}),
        ("mind-missing", "", {"JESUNCODE_AI_COMMAND": "/nonexistent/cmd_xyz"}),
        ("mind-unset", "", {}),
    ]):
        src = to + f'ask ai "hi" with tools [tool1] within 3 steps giving a\nshow a\n'
        if label == "mind-unset":
            env = {k: v for k, v in os.environ.items() if k != "JESUNCODE_AI_COMMAND"}
            old = dict(os.environ)
            try:
                os.environ.clear(); os.environ.update(env)
                out = jesun.execute(src, "")
            except Exception as err:
                problems.append(f"{label}: {type(err).__name__} escaped: {err!r}")
            else:
                if "Traceback" in out or EXC_NAMES.search(out):
                    problems.append(f"{label}: leak in {out[:400]}")
            finally:
                os.environ.clear(); os.environ.update(old)
        else:
            problems.extend(check(f"ai-{label}", src, extra))

    # 3. tmux: hostile terminal names; every op must stay in plain English
    for i in range(40):
        nm = rng.choice(NAMES)
        op = rng.choice(["open", "send", "read", "close"])
        if op == "open":
            src = f'open terminal named "{nm}"\n'
        elif op == "send":
            src = f'send "echo hi" to terminal "{nm}"\n'
        elif op == "read":
            src = f'read terminal "{nm}" giving o\nshow o\n'
        else:
            src = f'close terminal "{nm}"\n'
        problems.extend(check(f"tmux-{i}-{op}", src))
    # real open/send/read/close round trip, then cleanup
    out = jesun.execute('open terminal named "fuzzlive"\n'
                        'send "echo fuzz-ok" to terminal "fuzzlive"\n'
                        'read terminal "fuzzlive" giving o\nshow o\n'
                        'close terminal "fuzzlive"\n', "")
    if "fuzz-ok" not in out:
        problems.append(f"tmux round-trip failed: {out[:500]}")

    # 4. v0.2 agents: malformed blocks, hostile asks, memory fuzz
    agent_fields = [
        '    persona is "You are a pirate."\n',
        '    persona is 42\n',
        '    tools are [tool1]\n',
        '    tools are []\n',
        '    tools are [tool1, tool2, tool1]\n',
        '    tools are tool1\n',
        '    remember is true\n',
        '    remember is false\n',
        '    remember is maybe\n',
        '    steps are 3\n',
        '    steps are 0\n',
        '    steps are 2.5\n',
        '    steps are lots\n',
        '    colour is "red"\n',
        '    persona is "x"\n    persona is "y"\n',
        '    bogus line here\n',
    ]
    for i in range(100):
        n = rng.randint(1, 4)
        body = "".join(rng.choice(agent_fields) for _ in range(n))
        aname = rng.choice(["a1", "scout", "x", "agent"])
        src = f"to tool1\n    give back \"t\"\nagent {aname}\n{body}"
        tail = rng.choice([
            "",
            f'ask {aname} "hi" giving r\nshow r\n',
            f'ask {aname} "hi" giving r\nask {aname} "again" giving r2\nshow r2\n',
            'ask nope "hi" giving r\n',
            'ask tool1 "hi" giving r\n',
            f'ask {aname} 42 giving r\n',
            f'show {aname}\n',
        ])
        extra = {"JESUNCODE_AI_COMMAND": MIND_OK}
        problems.extend(check(f"agent-{i}", src + tail, extra))
    # agent with no mind configured at all
    problems.extend(check("agent-no-mind",
                          'agent a1\n    persona is "x"\nask a1 "hi" giving r\n',
                          {"JESUNCODE_AI_COMMAND": ""}))

    # 5. v0.3 deeper agents: memory fields, forget, streaming, agent-to-agent
    v3_fields = [
        '    remember is always\n',
        '    remember is true\n',
        '    remember is false\n',
        '    remember is maybe\n',
        '    remember is\n',
        '    memory file is "mem.json"\n',
        '    memory file is ""\n',
        '    memory file is 5\n',
        '    memory file is\n',
        '    memory is "x"\n',
        '    memory file is "a.json"\n    memory file is "b.json"\n',
        '    persona is "You help."\n',
        '    steps are 2\n',
        '    steps are 0\n',
        '    tools are []\n',
        '    tools are [v3a]\n',  # self-listing when the agent is v3a
    ]
    for i in range(40):
        n = rng.randint(1, 4)
        body = "".join(rng.choice(v3_fields) for _ in range(n))
        src = f"to tool1\n    give back \"t\"\nagent v3a\n{body}"
        tail = rng.choice([
            "",
            'ask v3a "hi" giving r\nshow r\n',
            'ask v3a "hi" giving r streaming\nshow r\n',
            'ask v3a "hi" giving r streaming streaming\n',
            'ask v3a 42 giving r\n',
            'forget v3a\n',
            'forget\n',
            'forget 42\n',
            'forget "v3a"\n',
            'forget tool1\n',
            'forget nope\n',
            'streaming\n',
            'always\n',
            'memory\n',
        ])
        home = str(TMP / f"v3home{i}")
        extra = {"JESUNCODE_AI_COMMAND": MIND_OK, "JESUN_CODE_HOME": home}
        problems.extend(check(f"v3-{i}", src + tail, extra))
    # relative `memory file` paths resolve from the working directory:
    # sweep up any the fuzz saved here.
    for stray in ("mem.json", "a.json", "b.json"):
        try:
            (Path.cwd() / stray).unlink()
        except OSError:
            pass

    # corrupt / hostile saved memory must warn in plain English, never crash
    corrupt_home = TMP / "corrupt-home"
    (corrupt_home / "memory").mkdir(parents=True, exist_ok=True)
    seeds = {
        "c1": "{{{not json",
        "c2": '{"a": 1}',
        "c3": '[["a", "b", "c"]]',
        "c4": "[1, 2, 3]",
        "c5": '"just a string"',
        "c6": "[[\"a\", 5]]",
        "c7": "",
        "c8": "[" * 5000,
    }
    for nm, blob in seeds.items():
        (corrupt_home / "memory" / f"{nm}.json").write_text(blob, encoding="utf-8")
    for i, nm in enumerate(seeds):
        src = (f"agent {nm}\n    remember is always\nask {nm} \"hi\" giving r\n"
               f"show r\nforget {nm}\n")
        problems.extend(check(
            f"v3-corrupt-{i}", src,
            {"JESUNCODE_AI_COMMAND": MIND_OK,
             "JESUN_CODE_HOME": str(corrupt_home)}))

    # agent-to-agent chains: depth 1..5, sometimes remembering, sometimes streaming
    def chain_script(tag: str, names: list[str]) -> str:
        cases = " ".join(
            f'{j + 1}) printf \'CALL: {nm}("go")\\\\n\' ;;'
            for j, nm in enumerate(names))
        body = ('n=$(cat "$MIND_COUNT_FILE" 2>/dev/null || echo 0); '
                'n=$((n + 1)); echo "$n" > "$MIND_COUNT_FILE"; '
                f'case "$n" in {cases} *) printf \'done\\\\n\' ;; esac')
        return mind_script(f"chain{tag}.sh", body)

    for i in range(20):
        depth = rng.randint(1, 5)
        names = [f"ca{i}_{j}" for j in range(depth + 1)]
        decls = ""
        for j, nm in enumerate(names):
            nxt = f"[{names[j + 1]}]" if j < depth else "[]"
            mem = "\n    remember is always" if rng.random() < 0.4 else ""
            decls += f"agent {nm}\n    tools are {nxt}{mem}\n"
        stream = " streaming" if rng.random() < 0.4 else ""
        src = decls + f'ask {names[0]} "go" giving r{stream}\nshow r\n'
        script = chain_script(f"{i}", names[1:])
        extra = {"JESUNCODE_AI_COMMAND": script,
                 "MIND_COUNT_FILE": str(TMP / f"ccount{i}"),
                 "JESUN_CODE_HOME": str(TMP / f"chainhome{i}")}
        problems.extend(check(f"v3-chain-{i}-d{depth}", src, extra))

    # streaming against hostile / slow / broken minds stays plain English
    for i, (label, script) in enumerate([
        ("ok", MIND_OK), ("garbage", MIND_GARBAGE), ("calls", MIND_CALLS),
        ("tb", MIND_TRACEBACK), ("slow", MIND_SLOW),
    ]):
        src = ('agent sa\n    tools are []\n'
               f'ask ai "hi" giving a streaming\nshow a\n'
               f'ask sa "hi" giving b streaming\nshow b\n')
        problems.extend(check(f"v3-stream-{label}", src,
                              {"JESUNCODE_AI_COMMAND": script}))

    after = sessions()
    stray = {s for s in after - before if not s.startswith("jc_")}
    if stray:
        problems.append(f"tmux: stray sessions created: {stray}")
    # cleanup anything we made
    for s in after - before:
        subprocess.run(["tmux", "kill-session", "-t", s],
                       capture_output=True, timeout=10)

    print(f"fuzz_phase2: {len(problems)} violations")
    for p in problems[:10]:
        print(p)
        print("=====")
    shutil.rmtree(TMP, ignore_errors=True)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
