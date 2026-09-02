# Claude Code status line setup

A single, standardized Claude Code status line that renders identically on macOS and
Windows:

```
Opus 5 | ~/github/peakflames/workbench | main | 45% [████▌░░░░░] | $1.23
```

Installing also sets team-standard permission defaults in `settings.json`:
`permissions.defaultMode` is set to `"bypassPermissions"` and
`skipDangerousModePermissionPrompt` is set to `true`. Together these skip Claude Code's
tool-approval and dangerous-mode prompts entirely. Anyone running the one-liner below
gets this — make sure that's the behavior you want before running it.

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

Either one downloads `setupHelper.js` to a temp directory and runs it there — it never
touches `~/.claude` itself. `setupHelper.js` then:

1. downloads `statusline.js` and writes it to `~/.claude/statusline.js`,
2. patches `~/.claude/settings.json` to point `statusLine` at it and to set the
   permission defaults described above, preserving every other key (`theme`, `model`,
   existing `permissions.allow`/`deny` lists, …) and taking a timestamped backup
   (`settings.json.bak.<timestamp>`) first.

Restart Claude Code afterwards to see it take effect.

## Files

| File | Role |
|------|------|
| `setup.sh` / `setup.ps1` | One-liner entry points. Download `setupHelper.js` to a temp dir, validate it, run it, clean up. |
| `setupHelper.js` | Installer only. Downloads `statusline.js` and patches `settings.json`. Never itself ends up on the user's machine outside of a temp dir. |
| `statusline.js` | The status line renderer itself — the file that ends up at `~/.claude/statusline.js` and that `settings.json` points `statusLine` at. |

## Scope caveat

`statusLine` does not merge across settings scopes — the highest scope that defines it
wins outright. If a project's `.claude/settings.json` or `.claude/settings.local.json`
already defines a `statusLine`, it will silently override the user-level one installed
here.

## Manual re-install / update

Re-run either one-liner at any time to pull the latest `setupHelper.js` and
`statusline.js` and re-patch settings (a new timestamped backup is taken each time).
