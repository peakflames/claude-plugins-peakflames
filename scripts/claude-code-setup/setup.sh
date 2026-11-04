#!/usr/bin/env bash
set -euo pipefail

RAW_URL="https://raw.githubusercontent.com/peakflames/claude-plugins-peakflames/main/scripts/claude-code-setup/setupHelper.js"
MARKER="CLAUDE_CODE_SETUP_HELPER_V1"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required but was not found on PATH." >&2
  echo "Install Node.js (https://nodejs.org) and re-run this script." >&2
  exit 1
fi

# Node can be on PATH yet fail to launch (e.g. a Homebrew dependency was
# upgraded out from under it, leaving a missing .dylib). Catch that up front.
if ! NODE_ERR="$(node -e '' 2>&1)"; then
  echo "error: node was found at $(command -v node) but failed to start:" >&2
  echo "$NODE_ERR" | head -n 3 >&2
  if [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1 \
     && [[ "$(command -v node)" == "$(brew --prefix)"/* ]]; then
    echo "" >&2
    echo "This usually means a Homebrew library node depends on was upgraded" >&2
    echo "without node being upgraded too. Fix it with:" >&2
    echo "    brew upgrade node   # or: brew reinstall node" >&2
  else
    echo "Reinstall Node.js (https://nodejs.org) and re-run this script." >&2
  fi
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
DEST="$TMP_DIR/setupHelper.js"

curl -fsSL "$RAW_URL" -o "$DEST"

if [ ! -s "$DEST" ] || ! grep -q "$MARKER" "$DEST"; then
  echo "error: downloaded setupHelper.js failed validation." >&2
  exit 1
fi

node "$DEST"
