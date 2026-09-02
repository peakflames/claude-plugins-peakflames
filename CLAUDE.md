# CLAUDE.md — claude-plugins-peakflames

## Repo Structure

```
.claude-plugin/marketplace.json   # Marketplace-level metadata (owner, plugin list, version)
CHANGELOG.md                      # Marketplace-level release history — links to child changelogs, does not duplicate them
plugins/
  <plugin-name>/
    .claude-plugin/plugin.json    # Plugin metadata — name, description, VERSION
    CHANGELOG.md                  # Human-readable version history
    README.md                     # User-facing documentation
    skills/                       # One subdirectory per skill
      <skill-name>/
        SKILL.md                  # Skill prompt (the source of truth for behavior)
scripts/
  CHANGELOG.md                    # Version history for standalone (non-plugin) scripts
  <script-name>/                  # e.g. claude-code-setup/
```

## Versioning Protocol

Every plugin version lives in **two files that must always stay in sync**. When bumping a version, both are required — updating only one is a bug:

| File | What to update |
|------|---------------|
| `plugins/<name>/.claude-plugin/plugin.json` | `"version"` field |
| `plugins/<name>/CHANGELOG.md` | New `## [x.y.z] — YYYY-MM-DD` entry |

**Never commit a version bump that touches only one of these files.**

### Scripts versioning

`scripts/` holds standalone tooling that isn't a plugin (no `plugin.json`). It is
versioned independently via `scripts/CHANGELOG.md` only — add a new
`## [x.y.z] — YYYY-MM-DD` entry there whenever a script's behavior changes. Same
changelog entry style and SemVer rules apply as for plugins.

### Marketplace-level changelog

The root `CHANGELOG.md` tracks marketplace-level releases only — it links to
`plugins/<name>/CHANGELOG.md` and `scripts/CHANGELOG.md` rather than duplicating their
entries. It lives in the same two-files-in-sync relationship as a plugin version bump:

| File | What to update |
|------|---------------|
| `.claude-plugin/marketplace.json` | `metadata.version` field |
| `CHANGELOG.md` (repo root) | New `## [x.y.z] — YYYY-MM-DD` entry noting which plugin/script versions are bundled |

**Never commit a marketplace version bump that touches only one of these files.**

### Changelog entry style

Changelog entries are a scannable record, not a design doc. Keep them tight:

- **One bullet per change; each bullet ≤ 50 words.** State what changed and its
  user-visible effect. If a bullet needs more, it's two changes — split it.
- Lead with a bolded noun phrase (the what), then a short clause (the effect).
- No rationale essays, no step-by-step internals, no "previously… now…" narration.
  That detail belongs in the commit body and PR description.
- Group bullets under Keep-a-Changelog headings (Added / Changed / Fixed /
  Documentation).

### Version semantics

Follows [Semantic Versioning](https://semver.org/):
- **Patch** (x.y.**Z**) — bug fixes, wording corrections, no behavioral change
- **Minor** (x.**Y**.0) — new behavior, new plan steps, skill restructuring
- **Major** (**X**.0.0) — breaking changes to skill contracts or plugin API

## Commit Convention

```
<type>(<plugin>): <short description> (vX.Y.Z)
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`

Examples:
- `feat(epic-workflow): plan-as-execution-script (v1.5.0)`
- `fix(epic-workflow): wrapup merges to develop when present (v1.4.1)`
- `chore(epic-workflow): bump plugin.json version to 1.5.0`
