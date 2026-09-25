#!/bin/sh
# Build the standalone Jesun.Code binary on a dev machine.
# Needs: python3 with the venv module, and network access for the one-time
# PyInstaller install. Everything happens inside build-venv/ (untouched system).
# For CI, run `python scripts/build_binary.py` directly with PyInstaller installed.
set -e
cd "$(dirname "$0")/.."

if [ ! -x build-venv/bin/pyinstaller ]; then
  echo "creating build-venv and installing pyinstaller (one time)..."
  python3 -m venv build-venv
  build-venv/bin/pip install pyinstaller
fi

build-venv/bin/python scripts/build_binary.py
