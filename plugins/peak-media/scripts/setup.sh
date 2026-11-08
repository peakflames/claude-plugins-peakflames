#!/usr/bin/env bash
# setup.sh — install peak-media's pinned runtime deps (HyperFrames, Playwright, GSAP, ajv)
# into the plugin data dir and make sure a render browser is present. Safe to re-run.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="setup.sh"
CHECK_ONLY=0
SKIP_BROWSER=0
QUIET=0

usage() {
  cat <<USAGE
$NAME — install peak-media's pinned runtime dependencies (idempotent)

Usage: $NAME [options]

Installs the versions in lib/pins.json into \${CLAUDE_PLUGIN_DATA:-~/.cache/peak-media}/deps/<lockhash>/
and runs 'hyperframes browser ensure'. Needs network only when something is missing.
Prerequisites it checks: Node 22+, npm, ffmpeg and ffprobe.

Options:
      --check          Only report what is missing (exit 0 ready, 3 not ready); install nothing
      --skip-browser   Don't fetch the render browser (e.g. HYPERFRAMES_BROWSER_PATH is set)
      --data-dir <dir> Use <dir> instead of \$CLAUDE_PLUGIN_DATA / ~/.cache/peak-media
  -q, --quiet          Print only errors and the final line
  -h, --help           Show this help and exit
      --version        Print the plugin version and exit
USAGE
}

die() { echo "$NAME: $1" >&2; exit "${2:-1}"; }
say() { [ "$QUIET" = 1 ] || echo "$@"; }

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --version) node -e "process.stdout.write(require('$ROOT/.claude-plugin/plugin.json').version+'\n')" 2>/dev/null \
                 || sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/.claude-plugin/plugin.json"; exit 0 ;;
    --check) CHECK_ONLY=1 ;;
    --skip-browser) SKIP_BROWSER=1 ;;
    --data-dir) [ $# -ge 2 ] && [ -n "$2" ] || die "--data-dir needs a folder argument. Run '$NAME --help' for usage." 2
                export CLAUDE_PLUGIN_DATA="$2"; shift ;;
    -q|--quiet) QUIET=1 ;;
    *) die "unknown option '$1'. Run '$NAME --help' for usage." 2 ;;
  esac
  shift
done

# --- prerequisites -----------------------------------------------------------
command -v node >/dev/null 2>&1 || die "Node 22+ not found — install it from https://nodejs.org" 3
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || die "Node 22+ required (found $(node -v)) — install it from https://nodejs.org" 3
command -v npm >/dev/null 2>&1 || die "npm not found — it ships with Node; reinstall Node 22+" 3
FFMPEG="${PEAK_MEDIA_FFMPEG:-ffmpeg}"; FFPROBE="${PEAK_MEDIA_FFPROBE:-ffprobe}"
HINT="install it (macOS: brew install ffmpeg · Debian/Ubuntu: sudo apt-get install ffmpeg)"
"$FFMPEG" -version >/dev/null 2>&1 || die "ffmpeg not found — $HINT" 3
"$FFPROBE" -version >/dev/null 2>&1 || die "ffprobe not found — $HINT" 3

DEPS=$(node --input-type=module -e "const m = await import('$ROOT/lib/deps.mjs'); process.stdout.write(m.depsDir())") \
  || die "could not resolve the deps folder (is $ROOT intact?)" 1
LOCK=$(basename "$DEPS")
MARK="$DEPS/.installed"

export HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_NO_AUTO_INSTALL=1 HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_SKIP_SKILLS=1 DO_NOT_TRACK=1
HF="$DEPS/node_modules/hyperframes/bin/hyperframes.mjs"

deps_ok() { [ -f "$MARK" ] && [ "$(cat "$MARK")" = "$LOCK" ] && [ -f "$HF" ]; }
browser_ok() {
  [ -n "${HYPERFRAMES_BROWSER_PATH:-}" ] && [ -x "$HYPERFRAMES_BROWSER_PATH" ] && return 0
  [ -f "$HF" ] && node "$HF" browser path >/dev/null 2>&1
}

if [ "$CHECK_ONLY" = 1 ]; then
  deps_ok || die "runtime deps not installed in $DEPS — run $ROOT/scripts/setup.sh" 3
  [ "$SKIP_BROWSER" = 1 ] || browser_ok || die "render browser missing — run $ROOT/scripts/setup.sh (or set HYPERFRAMES_BROWSER_PATH)" 3
  echo "peak-media ready: deps $DEPS"
  exit 0
fi

# --- deps ----------------------------------------------------------------------
if deps_ok; then
  say "deps: up to date ($DEPS)"
else
  say "deps: installing pinned versions into $DEPS"
  mkdir -p "$DEPS" || die "cannot create $DEPS — pass --data-dir <writable folder>" 1
  cp "$ROOT/package.json" "$ROOT/package-lock.json" "$DEPS/" || die "cannot copy the lockfile into $DEPS" 1
  LOG="$DEPS/npm-install.log"
  if ! (cd "$DEPS" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund >"$LOG" 2>&1); then
    die "npm install failed (network or registry access?) — see $LOG" 1
  fi
  echo "$LOCK" > "$MARK"
fi

# --- browser -------------------------------------------------------------------
if [ "$SKIP_BROWSER" = 1 ]; then
  say "browser: skipped"
elif browser_ok; then
  say "browser: present"
else
  # Cloud sessions ship a Playwright headless shell; 'browser ensure' can hang there.
  SHELL_BIN=$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | sort -V | tail -1)
  if [ -n "$SHELL_BIN" ]; then
    say "browser: using $SHELL_BIN (export HYPERFRAMES_BROWSER_PATH to make it permanent)"
  else
    say "browser: downloading the render browser"
    node "$HF" browser ensure >"$DEPS/browser.log" 2>&1 || die "browser download failed — see $DEPS/browser.log (or set HYPERFRAMES_BROWSER_PATH)" 1
  fi
fi

echo "peak-media ready: deps $DEPS · $("$FFMPEG" -version | head -1 | cut -d' ' -f1-3)"
