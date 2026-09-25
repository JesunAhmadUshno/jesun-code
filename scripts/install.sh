#!/bin/sh
# Jesun.Code installer for macOS and Linux.
#
# What this script does, nothing more:
#   1. Detects your OS and CPU architecture.
#   2. Downloads the matching jesun binary from the latest GitHub release
#      of JesunAhmadUshno/jesun-code.
#   3. Installs it to ~/.local/bin/jesun (or $JESUNCODE_INSTALL_DIR if set).
#   4. Downloads the AI provider scripts for `ask ai` to
#      ~/.jesun-code/providers/ (optional, harmless if it fails).
#   5. Runs `jesun --version` to prove the install works.
#
# It installs nothing else, changes nothing else, and sends nothing anywhere.
# To uninstall: delete ~/.local/bin/jesun.
set -e

REPO="JesunAhmadUshno/jesun-code"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux) PLATFORM="linux" ;;
  Darwin) PLATFORM="macos" ;;
  *)
    echo "Sorry: Jesun.Code does not ship a binary for $OS yet." >&2
    echo "Build from source instead: clone the repo and run scripts/build-binary.sh" >&2
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64) BITS="x64" ;;
  arm64|aarch64) BITS="arm64" ;;
  *)
    echo "Sorry: Jesun.Code does not ship a binary for $ARCH yet." >&2
    exit 1
    ;;
esac

if [ "$PLATFORM" = "macos" ] && [ "$BITS" = "x64" ]; then
  echo "Note: installing the arm64 macOS binary; it runs under Rosetta on Intel Macs." >&2
  BITS="arm64"
fi

ASSET="jesun-${PLATFORM}-${BITS}"
URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

DEST="${JESUNCODE_INSTALL_DIR:-$HOME/.local/bin}"
mkdir -p "$DEST"

echo "Downloading $ASSET ..."
if command -v curl >/dev/null 2>&1; then
  curl -fsSL -o "$DEST/jesun" "$URL"
elif command -v wget >/dev/null 2>&1; then
  wget -q -O "$DEST/jesun" "$URL"
else
  echo "I need curl or wget to download the binary." >&2
  exit 1
fi
chmod +x "$DEST/jesun"

PROVIDER_DIR="$HOME/.jesun-code/providers"
mkdir -p "$PROVIDER_DIR"
echo "Downloading the AI providers for \`ask ai\` (optional) ..."
for PROVIDER in openai-provider gemini-provider; do
  if curl -fsSL -o "$PROVIDER_DIR/$PROVIDER" \
      "https://raw.githubusercontent.com/${REPO}/main/scripts/ai-providers/$PROVIDER"; then
    chmod +x "$PROVIDER_DIR/$PROVIDER"
    echo "AI provider installed to $PROVIDER_DIR/$PROVIDER"
  else
    echo "Could not download $PROVIDER; Jesun.Code itself installed fine." >&2
  fi
done
echo "Get providers later from https://github.com/${REPO}/tree/main/scripts/ai-providers" >&2

"$DEST/jesun" --version
echo "Installed to $DEST/jesun"
case ":$PATH:" in
  *":$DEST:"*) ;;
  *) echo "Add $DEST to your PATH to run jesun from anywhere, then open a new terminal." ;;
esac
