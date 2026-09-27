#!/usr/bin/env python3
"""Build the standalone Jesun.Code binary with PyInstaller.

Cross-platform: run with any Python that has PyInstaller installed
(`pip install pyinstaller`). Produces a one-file executable at dist/jesun
(dist/jesun.exe on Windows) that needs no Python to run.

The full standard library is bundled as hidden imports so the Python
bridge (`import x` in Jesun.Code) works inside the frozen binary.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print("PyInstaller is not installed. Run: pip install pyinstaller")
        return 1

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", "jesun",
        "--distpath", str(ROOT / "dist"),
        "--workpath", str(Path("/tmp") / "jc-build"),
        "--specpath", str(Path("/tmp") / "jc-build"),
        "--add-data", str(ROOT / "packages") + ":packages",
    ]
    for module in sorted(sys.stdlib_module_names):
        cmd.append("--hidden-import=" + module)
    cmd.append(str(ROOT / "jesun.py"))

    print("building the jesun binary ...")
    rc = subprocess.run(cmd, cwd=ROOT).returncode
    if rc != 0:
        return rc

    binary = ROOT / "dist" / ("jesun.exe" if sys.platform == "win32" else "jesun")
    print("built:", binary)
    rc = subprocess.run([str(binary), "--version"]).returncode
    return rc


if __name__ == "__main__":
    sys.exit(main())
