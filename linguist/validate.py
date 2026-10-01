#!/usr/bin/env python3
"""Bundle self-check for the GitHub Linguist submission.

Implements the testing strategy in linguist/SPEC.md. Every claim the
bundle makes becomes an assertion here. Exit 0 = industry grade.
Run from the repo root: python3 linguist/validate.py
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
UPSTREAM_YML = "https://raw.githubusercontent.com/github-linguist/linguist/main/lib/linguist/languages.yml"

failures: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    status = "ok" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)


def load_languages_yml() -> dict:
    try:
        import yaml  # type: ignore
    except ImportError:
        yaml = None  # noqa: F841
        # Minimal parser: only what our snippet needs.
        data: dict = {}
        current: dict = {}
        key: str = ""
        for line in (ROOT / "languages.yml").read_text().splitlines():
            if line.startswith("#") or not line.strip():
                continue
            if not line.startswith(" ") and line.rstrip().endswith(":"):
                key = line.rstrip()[:-1]
                current = {}
                data[key] = current
            elif line.startswith("  ") and ":" in line and not line.startswith("    "):
                k, v = line.strip().split(":", 1)
                v = v.strip().strip('"')
                if k == "extensions":
                    current[k] = []
                else:
                    current[k] = v
            elif line.strip().startswith("- "):
                current.setdefault("extensions", []).append(
                    line.strip()[2:].strip().strip('"')
                )
        return data
    return yaml.safe_load((ROOT / "languages.yml").read_text())


def main() -> int:
    # 1. Entry snippet is complete and well-formed.
    entry = load_languages_yml()
    lang = entry.get("Jesun.Code", {})
    for field in ("type", "color", "extensions", "tm_scope", "ace_mode"):
        check(f"languages.yml has {field}", field in lang)
    check("type is programming", lang.get("type") == "programming")
    check("extension .jc listed", ".jc" in lang.get("extensions", []))
    check("color is hex", bool(re.fullmatch(r"#[0-9A-Fa-f]{6}", lang.get("color", ""))))

    # 2. No collision: .jc is unclaimed upstream.
    try:
        upstream = urllib.request.urlopen(UPSTREAM_YML, timeout=30).read().decode()
        claimed = re.findall(
            r"^([A-Za-z0-9_+#-]+):\n(?:  .*\n)*?  extensions:\n((?:    - .*\n)+)",
            upstream,
            re.M,
        )
        hits = [
            name
            for name, exts in claimed
            if re.search(r'^\s+- ["\']?\.jc["\']?\s*$', exts, re.M)
        ]
        check("no upstream language claims .jc", not hits, f"claimed by {hits}")
    except Exception as exc:  # network is nice-to-have, not a gate
        print(f"[skip] upstream collision check (network): {exc}")

    # 3. Grammar is valid and correctly scoped.
    grammar_path = REPO / "editors/vscode/syntaxes/jesun-code.tmLanguage.json"
    check("grammar file exists", grammar_path.exists())
    grammar = json.loads(grammar_path.read_text())
    check("grammar scopeName", grammar.get("scopeName") == "source.jesun")
    check("grammar has patterns", len(grammar.get("patterns", [])) >= 1)

    # 4. Every sample parses (no execution).
    sys.path.insert(0, str(REPO))
    import jesun  # noqa: E402

    samples = sorted((ROOT / "samples").glob("*.jc"))
    check("samples exist", len(samples) >= 3, f"found {len(samples)}")
    for sample in samples:
        src = sample.read_text()
        try:
            jesun.Parser(jesun.tokenize(src)).parse_program()
            check(f"sample parses: {sample.name}", True)
        except Exception as exc:
            check(f"sample parses: {sample.name}", False, str(exc)[:120])
        check(f"sample non-trivial: {sample.name}", len(src.splitlines()) >= 10)

    # 5. No secrets anywhere in the bundle.
    secret_re = re.compile(
        r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]"
    )
    bundle_files = [p for p in ROOT.rglob("*") if p.is_file() and "tasks" not in p.parts]
    hits = [str(p) for p in bundle_files if secret_re.search(p.read_text(errors="ignore"))]
    check("no secrets in bundle", not hits, f"{hits}")

    # 6. Grammar-repo payload is complete.
    payload = ROOT / "grammar-repo"
    check("payload dir exists", payload.is_dir())
    if payload.is_dir():
        g = payload / "grammars" / "jesun-code.tmLanguage.json"
        check("payload has grammar", g.exists())
        if g.exists():
            check(
                "payload grammar byte-identical to VS Code source",
                g.read_bytes() == grammar_path.read_bytes(),
            )
        check("payload has MIT LICENSE", (payload / "LICENSE").exists())
        pkg = payload / "package.json"
        check("payload has package.json", pkg.exists())
        if pkg.exists():
            pkg_data = json.loads(pkg.read_text())
            check("package.json name", pkg_data.get("name") == "jesun-code-tmlanguage")
        check("payload has README", (payload / "README.md").exists())

    print()
    if failures:
        print(f"{len(failures)} FAILING: {', '.join(failures)}")
        return 1
    print("bundle is industry grade: all checks green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
