# CLAUDE.md — claude-plugins-peakflames

## Repo Structure

```
.claude-plugin/marketplace.json   # Marketplace-level metadata (owner, plugin list)
plugins/
  <plugin-name>/
    .claude-plugin/plugin.json    # Plugin metadata — name, description, VERSION
    CHANGELOG.md                  # Human-readable version history
    README.md                     # User-facing documentation
    skills/                       # One subdirectory per skill
      <skill-name>/
        SKILL.md                  # Skill prompt (the source of truth for behavior)
```

## Versioning Protocol

Every plugin version lives in **two files that must always stay in sync**. When bumping a version, both are required — updating only one is a bug:

| File | What to update |
|------|---------------|
| `plugins/<name>/.claude-plugin/plugin.json` | `"version"` field |
| `plugins/<name>/CHANGELOG.md` | New `## [x.y.z] — YYYY-MM-DD` entry |

**Never commit a version bump that touches only one of these files.**

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
