# Changelog — scripts

All notable changes to the repo's standalone scripts (not part of a plugin) are
documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.1.0] — 2026-09-02

### Added

- **`claude-code-setup`: one-line Claude Code status line installer.** Cross-platform
  (macOS/Linux via `setup.sh`, Windows via `setup.ps1`) install of a standardized status
  line showing model, cwd, git branch, context-window usage, and session cost.
- **`setupHelper.js` as a dedicated, temp-directory-only installer.** Entry-point scripts
  download and run the installer from a temp directory rather than writing installer code
  into `~/.claude`; it fetches `statusline.js` to `~/.claude/statusline.js` and patches
  `settings.json` to point `statusLine` at it.
- **Team-standard permission defaults.** Install also sets `permissions.defaultMode` to
  `"bypassPermissions"` and `skipDangerousModePermissionPrompt` to `true` in
  `settings.json`, preserving any existing `permissions.allow`/`deny` lists.
- **Marker-based download validation and timestamped settings backups.** Both the
  installer and the renderer it fetches are checked for a version marker before use, and
  `settings.json` is backed up (`settings.json.bak.<timestamp>`) before every patch.
