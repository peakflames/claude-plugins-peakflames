#!/usr/bin/env bash
set -euo pipefail

RAW_URL="https://raw.githubusercontent.com/peakflames/claude-plugins-peakflames/main/scripts/claude-code-setup/setupHelper.js"
MARKER="CLAUDE_CODE_SETUP_HELPER_V1"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required but was not found on PATH." >&2
  echo "Install Node.js (https://nodejs.org) and re-run this script." >&2
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
