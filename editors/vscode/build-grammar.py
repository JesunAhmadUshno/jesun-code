"""Regenerate syntaxes/jesun-code.tmLanguage.json from the interpreter.

The keyword lists are the single source of truth: jesun.KEYWORDS and
jesun.BANGLA_KEYWORDS. Run from this directory: python3 build-grammar.py
A test asserts the checked-in grammar equals a fresh build, so editing the
JSON by hand is pointless: change the builder instead.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT))

import jesun  # noqa: E402

# NB: \b is wrong after Bangla vowel signs (regex engines see them as
# non-word chars), so the grammar uses explicit Unicode boundaries.
BEG = r"(?<![\p{L}\p{N}_\p{M}])"
END = r"(?![\p{L}\p{N}_\p{M}])"


def _alts(words) -> str:
    """Alternation, longest first so the longest keyword wins."""
    return "|".join(sorted(words, key=len, reverse=True))


def build() -> dict:
    en = _alts(jesun.KEYWORDS)
    bn = _alts(jesun.BANGLA_KEYWORDS)
    return {
        "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
        "name": "Jesun.Code",
        "scopeName": "source.jesun",
        "fileTypes": ["jc"],
        "patterns": [
            {
                "name": "comment.line.jesun",
                "match": BEG + r"(মন্তব্য|note)" + END + r".*$",
            },
            {
                "name": "string.quoted.double.jesun",
                "begin": '"',
                "end": '"',
                "patterns": [
                    {"name": "constant.character.escape.jesun", "match": r"\\."},
                    {
                        "name": "variable.interpolation.jesun",
                        "match": r"\{[^{}]+\}",
                    },
                ],
            },
            {
                "name": "string.quoted.single.jesun",
                "begin": "'",
                "end": "'",
                "patterns": [
                    {"name": "constant.character.escape.jesun", "match": r"\\."},
                    {
                        "name": "variable.interpolation.jesun",
                        "match": r"\{[^{}]+\}",
                    },
                ],
            },
            {
                "name": "meta.function.jesun",
                "match": r"^(\s*)(to|জন্যে)(\s+)([\p{L}_][\p{L}\p{N}_\p{M}]*)",
                "captures": {
                    "2": {"name": "keyword.control.jesun"},
                    "4": {"name": "entity.name.function.jesun"},
                },
            },
            {
                "name": "keyword.control.bangla.jesun",
                "match": BEG + "(?:" + bn + ")" + END,
            },
            {
                "name": "keyword.control.jesun",
                "match": BEG + "(?:" + en + ")" + END,
            },
            {
                "name": "constant.numeric.jesun",
                "match": r"(?<![\p{L}\p{N}_])[\p{N}]+(?:\.[\p{N}]+)?(?![\p{L}\p{N}_])",
            },
        ],
    }


def main() -> None:
    out = HERE / "syntaxes" / "jesun-code.tmLanguage.json"
    out.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
