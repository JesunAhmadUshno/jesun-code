"""v3.0 serve fuzzer: hostile form bodies, table/field names, island ids.

Cases are batched (10 per program) so the walker leg stays affordable;
every batch runs through the bootstrap and the self-hosted walker.
Violations:
  - the two legs disagree (output or return code)
  - serve_form fails on any body (it must never fail, only decode)
  - a hostile table/field name or island id is accepted (validation
    must reject it; DDL is built from validated names only)
  - a valid name is rejected, or its DDL is not exactly the expected
    string (nothing smuggled in)
  - any non-JesunError exception escapes (traceback text in output)

Run: python3 tests/fuzz_serve.py [count]
Exit 0 when clean, 1 when violations are found (first 10 shown).
"""

import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from selfhost_harness import InlineSandbox  # noqa: E402

EXC_NAMES = re.compile(
    r"\b(TypeError|ValueError|KeyError|IndexError|AttributeError|RecursionError|"
    r"NameError|SyntaxError|RuntimeError|MemoryError|OSError|IOError|"
    r"ZeroDivisionError|StopIteration|AssertionError|Exception)\b"
)

BATCH = 10

# Hostile alphabet for form bodies: escape games, separators, quotes,
# backslashes, newlines, and some unicode. serve_form must never fail.
# Note: { and } are excluded; in Jesun.Code { starts interpolation in
# a string literal, so they cannot appear in a .jc string. Real bodies
# with braces arrive via HTTP request tables, not literals.
BODY_BITS = [
    "%", "%%", "%zz", "%2", "%20", "%41", "+", "++", "&", "&&", "=", "==",
    '"', "'", "\\", "\n", "\r", ";", "#", "?", "/", "<", ">",
    "a", " ", "task", "x" * 60, "café", "a+b", "%2B", "\x00",
]

# Hostile names: SQL injection, quotes, spaces, leading digits, empty,
# unicode, dashes (bad for tables, ok for islands), very long.
HOSTILE_NAMES = [
    "todos; DROP TABLE todos; --",
    '" OR "1"="1',
    "a b",
    "9lives",
    "",
    "a-b",
    "tådös",
    "a'b",
    'a"b',
    "a\nb",
    "TABLE",
    "select",
    "__proto__",
    "a" * 300,
    "-x",
    "_x",
    "x_",
]

TRICKY_VALID_TABLE = ["a", "A9_b", "x" * 100, "TABLE", "select", "x_ok"]
TRICKY_VALID_ISLAND = ["a", "A9_b", "x-y_z", "a" * 100]


def jstr(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + '"'


def valid_table(name):
    return bool(re.match(r"^[A-Za-z][A-Za-z0-9_]*$", name))


def valid_island(name):
    return bool(re.match(r"^[A-Za-z][A-Za-z0-9_-]*$", name))


def gen_form(rng, tag):
    body = "".join(rng.choice(BODY_BITS) for _ in range(rng.randint(1, 8)))
    src = (
        f"{tag}_f is serve_form with {{\"body\": {jstr(body)}}}\n"
        f"show kind of {tag}_f\n"
    )
    return src, "table\n"


def gen_table(rng, tag):
    name = rng.choice(HOSTILE_NAMES if rng.random() < 0.5 else TRICKY_VALID_TABLE)
    src = (
        f"{tag}_r is attempt serve_table with {jstr(name)} and []\n"
        f'if {tag}_r["ok"] then\n'
        f'    show {tag}_r["value"]["history"][0]["sql"]\n'
        "otherwise\n"
        '    show "rejected"\n'
    )
    if valid_table(name):
        expected = f"CREATE TABLE {name} (id INTEGER PRIMARY KEY)\n"
    else:
        expected = "rejected\n"
    return src, expected


def gen_field(rng, tag):
    if rng.random() < 0.5:
        name = rng.choice(HOSTILE_NAMES)
        kind = rng.choice(["text", "number", "true/false"])
    else:
        name = rng.choice(TRICKY_VALID_TABLE)
        kind = rng.choice(["text", "email", "number", "oops", "true/false"])
    src = (
        f"{tag}_r is attempt serve_table with \"t\" and [[{jstr(name)}, {jstr(kind)}]]\n"
        f'if {tag}_r["ok"] then\n'
        '    show "ACCEPTED"\n'
        "otherwise\n"
        '    show "rejected"\n'
    )
    ok = valid_table(name) and kind in ("text", "number", "true/false")
    return src, "ACCEPTED\n" if ok else "rejected\n"


def gen_island(rng, tag):
    ident = rng.choice(HOSTILE_NAMES if rng.random() < 0.5 else TRICKY_VALID_ISLAND)
    src = (
        f"{tag}_r is attempt serve_island with {jstr(ident)} and \"<b></b>\" and \"x();\"\n"
        f'if {tag}_r["ok"] then\n'
        '    show "ACCEPTED"\n'
        "otherwise\n"
        '    show "rejected"\n'
    )
    return src, "ACCEPTED\n" if valid_island(ident) else "rejected\n"


GENS = [gen_form, gen_table, gen_field, gen_island]

BRING = (
    'bring in "jweb"\nbring in "js"\nbring in "sitegen"\n'
    'bring in "html"\nbring in "sqlite"\nbring in "time"\nbring in "serve"\n'
)


def check_output(text):
    if "Traceback" in text or 'File "' in text or "0x" in text:
        return "traceback text escaped"
    m = EXC_NAMES.search(text)
    if m:
        return f"python exception name escaped: {m.group(0)}"
    return ""


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 120
    rng = random.Random(20260930)
    bad = 0
    batch_no = 0
    done = 0
    while done < count:
        batch_no += 1
        frags = []
        expected = ""
        for i in range(min(BATCH, count - done)):
            tag = f"c{i}"
            gen = rng.choice(GENS)
            frag, line = gen(rng, tag)
            frags.append(frag)
            expected += line
        src = BRING + "".join(frags)
        want = (0, expected)
        box = InlineSandbox()
        try:
            boot, selfhost = box.run(src)
        finally:
            box.close()
        for label, result in (("bootstrap", boot), ("selfhost", selfhost)):
            problem = check_output(result[1])
            if problem:
                print(f"[batch {batch_no}] {label}: {problem}\n{src}\n---\n{result[1][:500]}")
                bad += 1
                break
            if (result[0], result[1]) != want:
                print(
                    f"[batch {batch_no}] {label}: wrong result\n{src}\n"
                    f"--- got:  {result!r}\n--- want: {want!r}"
                )
                bad += 1
                break
        else:
            if boot != selfhost:
                print(
                    f"[batch {batch_no}] legs disagree\n{src}\n"
                    f"--- boot: {boot[1][:300]!r}\n--- self: {selfhost[1][:300]!r}"
                )
                bad += 1
        done += min(BATCH, count - done)
        if bad >= 10:
            break
    print(f"{done} cases in {batch_no} batches, {bad} violations")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
