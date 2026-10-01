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
    'bring in "threejs"\n'
    'jweb_sse_use with jweb_sse_pair\n'
)


def jstr_braces(s):
    # jstr plus {{ }} so { and } survive Jesun string interpolation.
    return jstr(s.replace("{", "{{").replace("}", "}}"))


# Hand-verified (body, expected) pairs for the minimal JSON event parser.
# serve_parse_event must give back the name or nothing; it never fails.
EVENT_KNOWN = [
    ('{"event": "bump"}', "bump"),
    ('{"event":"x"}', "x"),
    ('  { "event" : "y" }  ', "y"),
    ('{"event": "a\\nb"}', "a\nb"),
    ('{"event": "say \\"hi\\""}', 'say "hi"'),
    ('{"event": ""}', ""),
    ("garbage", None),
    ("", None),
    ("{}", None),
    ("[]", None),
    ('{"nope": 1}', None),
    ('{"event": 42}', None),
    ('{"event": "unterminated}', None),
    ('{"event": "tab\\there"}', "tab\there"),
]


def gen_event_known(rng, tag):
    body, want = rng.choice(EVENT_KNOWN)
    src = (
        f"{tag}_r is serve_parse_event with {jstr_braces(body)}\n"
        f'if {tag}_r is nothing then\n'
        f'    show "nothing"\n'
        "otherwise\n"
        f'    show {tag}_r\n'
    )
    return src, ("nothing\n" if want is None else want + "\n")


def gen_event_hostile(rng, tag):
    # Hostile soup: the parser must survive it (nothing or a name),
    # and both legs must agree. The oracle is survival itself.
    body = "".join(rng.choice(BODY_BITS) for _ in range(rng.randint(1, 12)))
    src = (
        f"{tag}_r is serve_parse_event with {jstr_braces(body)}\n"
        f'show "survived"\n'
    )
    return src, "survived\n"


def valid_three_name(name):
    return bool(re.match(r"^[A-Za-z_][A-Za-z0-9_$]*$", name))


def gen_three_name(rng, tag):
    name = rng.choice(HOSTILE_NAMES if rng.random() < 0.5 else TRICKY_VALID_TABLE)
    src = f"show three_valid_name with {jstr(name)}\n"
    return src, ("true\n" if valid_three_name(name) else "false\n")


def valid_three_color(color):
    return bool(color) and bool(re.match(r"^[A-Za-z0-9#]+$", color))


def gen_three_color(rng, tag):
    color = rng.choice(HOSTILE_NAMES + ["red", "#ff0000", "LightBlue", "#abc"])
    src = f"show three_safe_color with {jstr(color)}\n"
    return src, ("true\n" if valid_three_color(color) else "false\n")


def gen_sender(rng, tag):
    # Hostile sender args: validation must fail in plain English (never a
    # traceback), valid ones queue. Oracle mirrors jweb_sse_sender's rules.
    name = rng.choice(HOSTILE_NAMES + ["render", "tick", "a\nb", "x\"y"])
    data = rng.choice(HOSTILE_NAMES + ["<p>hi</p>", "a\nb", ""])
    if rng.random() < 0.25:
        data_expr, data_ok = jstr(data), True
    elif rng.random() < 0.5:
        data_expr, data_ok = '{"k": 1}', False
    else:
        data_expr, data_ok = "42", False
    name_ok = isinstance(name, str) and "\n" not in name
    # HOSTILE_NAMES entries are all text; the \n one is caught above.
    ok = name_ok and data_ok
    src = (
        f"{tag}_r is attempt jweb_sse_sender with {jstr(name)} and {data_expr}\n"
        f'if {tag}_r["ok"] then\n'
        '    show "ok"\n'
        "otherwise\n"
        '    show "failed"\n'
    )
    return src, ("ok\n" if ok else "failed\n")


GENS = [gen_form, gen_table, gen_field, gen_island,
        gen_event_known, gen_event_hostile,
        gen_three_name, gen_three_color, gen_sender]


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
