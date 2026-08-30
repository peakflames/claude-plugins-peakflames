# Claude Code status line setup

A single, standardized Claude Code status line that renders identically on macOS and
Windows:

```
Opus 5 | ~/github/peakflames/workbench | main | 45% [████▌░░░░░] | $1.23
```

## Install

Requires [Node.js](https://nodejs.org) on `PATH`.

**macOS / Linux terminal:**

```sh
curl -fsSL https://raw.githubusercontent.com/peakflames/claude-plugins-peakflames/main/scripts/claude-code-setup/setup.sh | bash
```

**Windows (PowerShell):**

```powershell
iwr https://raw.githubusercontent.com/peakflames/claude-plugins-peakflames/main/scripts/claude-code-setup/setup.ps1 -UseBasicParsing | iex
```

Either one downloads `statusline.js` to `~/.claude/statusline.js` and patches
`~/.claude/settings.json` to point `statusLine` at it, preserving every other key
(`theme`, `model`, …) and taking a timestamped backup (`settings.json.bak.<timestamp>`)
first. Restart Claude Code afterwards to see it take effect.

## Scope caveat

`statusLine` does not merge across settings scopes — the highest scope that defines it
wins outright. If a project's `.claude/settings.json` or `.claude/settings.local.json`
already defines a `statusLine`, it will silently override the user-level one installed
here.

## Manual re-install / update

Re-run either one-liner at any time to pull the latest `statusline.js` and re-patch
settings (a new timestamped backup is taken each time).
