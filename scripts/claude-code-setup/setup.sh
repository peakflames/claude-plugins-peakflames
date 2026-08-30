#!/usr/bin/env bash
set -euo pipefail

RAW_URL="https://raw.githubusercontent.com/peakflames/claude-plugins-peakflames/main/scripts/claude-code-setup/statusline.js"
DEST="$HOME/.claude/statusline.js"
MARKER="CLAUDE_CODE_STATUSLINE_V1"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required but was not found on PATH." >&2
  echo "Install Node.js (https://nodejs.org) and re-run this script." >&2
  exit 1
fi

mkdir -p "$HOME/.claude"

curl -fsSL "$RAW_URL" -o "$DEST"

if [ ! -s "$DEST" ] || ! grep -q "$MARKER" "$DEST"; then
  echo "error: downloaded statusline.js failed validation." >&2
  rm -f "$DEST"
  exit 1
fi

node "$DEST" --install
