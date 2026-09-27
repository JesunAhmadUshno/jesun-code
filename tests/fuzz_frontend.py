"""v1.3 frontend fuzzer: random html/template/js API calls, both legs.

Every generated program runs through the bootstrap and the self-hosted
walker. Violations:
  - the two legs disagree (output or return code)
  - any non-JesunError exception escapes (traceback text in output)

Run: python3 tests/fuzz_frontend.py [count]
Exit 0 when clean, 1 on the first violation.
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

STRINGS = [
    "", "hi", "a&b", "<tag>", '"q"', "it's", "\\", "\n", "\t",
    "<script>alert(1)</script>", "{{x}}", "{% for %}", "%}", "}}",
    "a" * 200, "0", "-3", "3.5", "true", "nothing",
    "café", "naïve", "<>&\"'",
]

TAGS = ["div", "p", "span", "a", "ul", "li", "h1", "9bad", "", "DIV", "x-y"]


def jstr(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\t", "\\t") + '"'


def gen_html(rng):
    fn = rng.choice([
        "escape_html", "element", "void_element", "heading", "paragraph",
        "link_to", "image", "unordered_list", "button", "input_field",
        "text_node", "page",
    ])
    s = jstr(rng.choice(STRINGS))
    if fn == "escape_html":
        return f"show escape_html with {s}\n"
    if fn == "element":
        tag = jstr(rng.choice(TAGS))
        return f"show element with {tag} and nothing and {s}\n"
    if fn == "void_element":
        tag = jstr(rng.choice(TAGS))
        return f"show void_element with {tag} and nothing\n"
    if fn == "heading":
        lvl = rng.choice(["1", "3", "6", "0", "7", "2.5", '"x"'])
        return f"show heading with {lvl} and {s}\n"
    if fn == "paragraph":
        return f"show paragraph with {s}\n"
    if fn == "link_to":
        return f"show link_to with {s} and {s}\n"
    if fn == "image":
        return f"show image with {s} and {s}\n"
    if fn == "unordered_list":
        return f"show unordered_list with [{s}, {s}]\n"
    if fn == "button":
        return f"show button with {s}\n"
    if fn == "input_field":
        return f"show input_field with {s} and {s}\n"
    if fn == "text_node":
        return f"show text_node with {s}\n"
    return f"show page with {s} and {s}\n"


def gen_template(rng):
    bits = []
    for _ in range(rng.randint(1, 4)):
        kind = rng.randrange(5)
        name = rng.choice(["a", "b", "t.x", "missing", "deep.deeper"])
        if kind == 0:
            bits.append("{{" + name + "}}")
        elif kind == 1:
            bits.append("{%% for i in %s %%}%s{%% endfor %%}" % (
                rng.choice(["xs", "missing", "notalist"]), "{{i}}"))
        elif kind == 2:
            bits.append("{%% if %s %%}yes{%% else %%}no{%% endif %%}" % name)
        elif kind == 3:
            bits.append(rng.choice(STRINGS))
        else:
            bits.append("{{" + rng.choice(["", "9bad", "a b"]) + "}}")
    tpl = "".join(bits)
    # Double every brace for the Jesun.Code string literal.
    lit = tpl.replace("{", "{{").replace("}", "}}")
    data = '{"a": "A<B", "b": 2, "t": {"x": "ex"}, "xs": ["p", "q"], "notalist": "zzz"}'
    return f"r is attempt render_template with {jstr(lit)} and {data}\nshow r[\"ok\"]\n"


def gen_js(rng):
    fn = rng.choice(["js_string", "js_value", "script_tag", "dom_ready", "on_event", "js_fetch"])
    s = jstr(rng.choice(STRINGS))
    if fn == "js_string":
        return f"show js_string with {s}\n"
    if fn == "js_value":
        v = rng.choice([s, "42", "true", "nothing", f"[{s}, 1]", '{"k": ' + s + "}"])
        return f"show js_value with {v}\n"
    if fn == "script_tag":
        return f"show script_tag with {s}\n"
    if fn == "dom_ready":
        return f"show dom_ready with {s}\n"
    if fn == "on_event":
        return f"show on_event with {s} and {s} and {s}\n"
    return f"show js_fetch with {s} and {s} and {s}\n"


def gen_program(rng):
    pkg = rng.choice(["html", "template", "js"])
    lines = [f'bring in "{pkg}"\n']
    gen = {"html": gen_html, "template": gen_template, "js": gen_js}[pkg]
    for _ in range(rng.randint(1, 3)):
        lines.append(gen(rng))
    return "".join(lines)


def check_output(text):
    if "Traceback" in text or 'File "' in text or "0x" in text:
        return "traceback text in output"
    if EXC_NAMES.search(text):
        return "python exception name in output"
    return None


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    rng = random.Random(20260926)
    bad = 0
    for n in range(count):
        src = gen_program(rng)
        box = InlineSandbox()
        try:
            boot, selfhost = box.run(src)
        finally:
            box.close()
        for label, result in (("bootstrap", boot), ("selfhost", selfhost)):
            problem = check_output(result[1])
            if problem:
                print(f"[{n}] {label}: {problem}\n{src}\n---\n{result[1][:500]}")
                bad += 1
                break
        else:
            if boot != selfhost:
                print(f"[{n}] legs disagree\n{src}\n--- boot: {boot[1][:300]!r}\n--- self: {selfhost[1][:300]!r}")
                bad += 1
        if bad >= 10:
            break
    print(f"{count} programs, {bad} violations")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
