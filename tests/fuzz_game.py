"""v2.0 game fuzzer: random game API calls and \\u escape strings, both legs.

Every generated program runs through the bootstrap and the self-hosted
walker. Violations:
  - the two legs disagree (output or return code)
  - any non-JesunError exception escapes (traceback text in output)

Run: python3 tests/fuzz_game.py [count]
Exit 0 when clean, 1 on the first violation.
"""

import os
import random
import re
import sys

ADDR = re.compile(r"0x[0-9a-fA-F]{3,}")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from selfhost_harness import InlineSandbox  # noqa: E402

EXC_NAMES = re.compile(
    r"\b(TypeError|ValueError|KeyError|IndexError|AttributeError|RecursionError|"
    r"NameError|SyntaxError|RuntimeError|MemoryError|OSError|IOError|"
    r"ZeroDivisionError|StopIteration|AssertionError|Exception)\b"
)

COLORS = ["FF0000", "00FF00", "0000FF", "FFFFFF", "000000", "red", "FFF", "GGGGGG", ""]


def jstr(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\t", "\\t") + '"'


def gen_estring(rng):
    """A string literal exercising \\u escapes, braces, and interpolation."""
    bits = []
    for _ in range(rng.randint(1, 4)):
        kind = rng.randrange(8)
        if kind == 0:
            bits.append("\\u" + "".join(rng.choice("0123456789abcdefABCDEF") for _ in range(4)))
        elif kind == 1:
            bits.append("\\u" + rng.choice(["00zz", "12", "abcd5", "zzzz", ""]))
        elif kind == 2:
            bits.append(rng.choice(["{", "}", "{{", "}}", "{n}", "{missing}"]))
        elif kind == 3:
            bits.append("\\u00" + rng.choice(["7b", "7d"]))
        elif kind == 4:
            bits.append(rng.choice(["\\n", "\\t", "\\\\", '\\"']))
        else:
            bits.append(rng.choice(["A", "xy", " ", "0", "!"]))
    return '"' + "".join(bits) + '"'


def gen_draw(rng):
    w = rng.randint(1, 4)
    h = rng.randint(1, 4)
    color = jstr(rng.choice(COLORS))
    fn = rng.choice(["pixel", "rect", "line", "circle", "digit"])
    setup = f"f is game_frame with {w} and {h}\n"
    if fn == "pixel":
        x = rng.randint(-1, w + 1)
        y = rng.randint(-1, h + 1)
        return setup + f"game_pixel with f and {x} and {y} and {color}\nshow game_ppm with f\n"
    if fn == "rect":
        return setup + f"game_rect with f and 0 and 0 and {w} and {h} and {color}\nshow game_ppm with f\n"
    if fn == "line":
        return setup + f"game_line with f and 0 and 0 and {w - 1} and {h - 1} and {color}\nshow game_ppm with f\n"
    if fn == "circle":
        r = rng.randint(0, 3)
        return setup + f"game_circle with f and 1 and 1 and {r} and {color}\nshow game_ppm with f\n"
    d = rng.randint(0, 12)
    return setup + f"game_digit with f and 0 and 0 and {d} and 1 and {color}\nshow game_ppm with f\n"


def gen_sound(rng):
    fn = rng.choice(["tone", "seq", "mix"])
    wave = rng.choice(["square", "sine", "noise", "triangle", ""])
    if fn == "tone":
        f = rng.choice([440, 0, -5, 20000, 20001])
        ms = rng.choice([5, 10, 0, -3])
        return f'show length of (snd_tone with {f} and {ms} and "{wave}")\n'
    if fn == "seq":
        n = rng.randint(1, 3)
        notes = ", ".join(
            f"[{rng.choice([440, 660, 0])}, {rng.choice([5, 10])}]" for _ in range(n)
        )
        return f'show length of (snd_seq with [{notes}] and "{wave}")\n'
    return (
        'a is snd_tone with 440 and 5 and "square"\n'
        'b is snd_tone with 660 and 5 and "square"\n'
        "show length of (snd_mix with a and b)\n"
    )


def gen_pad(rng):
    key = rng.choice(["up", "down", "left", "right", "space", "a", "f1", ""])
    return (
        "p is game_pad_new\n"
        f"game_press with p and {jstr(key)}\n"
        "show game_poll with p\n"
    )


def gen_program(rng):
    kind = rng.randrange(4)
    if kind == 0:
        return 'bring in "game"\nn is 42\nshow ' + gen_estring(rng) + "\n"
    if kind == 1:
        return 'bring in "game"\n' + gen_draw(rng)
    if kind == 2:
        return 'bring in "game"\n' + gen_sound(rng)
    return 'bring in "game"\n' + gen_pad(rng)


def check_output(text):
    if "Traceback" in text or 'File "' in text or ADDR.search(text):
        return "traceback text in output"
    if EXC_NAMES.search(text):
        return "python exception name in output"
    return None


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    rng = random.Random(20260930)
    bad = 0
    for n in range(count):
        src = gen_program(rng)
        box = InlineSandbox()
        try:
            boot, selfhost = box.run(src)
        finally:
            box.close()
        if boot != selfhost:
            print(f"MISMATCH case {n}:\n{src}\nbootstrap={boot!r}\nwalker={selfhost!r}")
            bad += 1
            break
        for leg, out in (("bootstrap", boot), ("walker", selfhost)):
            problem = check_output(out[1])
            if problem:
                print(f"LEAK case {n} ({leg}): {problem}\n{src}\n{out!r}")
                bad += 1
                break
        if bad:
            break
    print(f"fuzz_game: {count - bad}/{count} clean" if not bad else f"fuzz_game: FAILED at case {n}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
