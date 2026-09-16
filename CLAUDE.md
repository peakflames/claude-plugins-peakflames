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

## Git Workflow

This repo follows the same branching strategy `peak-workflow`'s own `/setup` skill writes into a
project's `CLAUDE.md` — accumulate work on `develop`, release from `main`.

| Branch | Role |
|---|---|
| `develop` | **Default branch.** Integration line; everything merges here first. Anything on `develop` is approved |
| `main` | Release line only. Every commit on it is a tagged release merge |
| `feature/<plugin>-<short-name>` | Plugin or skill work, branched from `develop` |
| `docs/<short-name>` | Documentation-only work, branched from `develop` |
| `hotfix/<slug>` | Urgent fix, branched from `main`, merged into **both** `main` and `develop` |

- Merges use `--no-ff` so each piece of work stays visible as a merge commit.
- Claude asks before every push to a remote.
- Never commit: real credentials, `.env`, or anything under `tmp/`.

## Release Protocol

**Prerequisites:** on `develop` with a clean working tree, and every plugin's `plugin.json`
version and `CHANGELOG.md` entry already in sync (see Versioning Protocol above).

1. **Finalize the changelogs** — in each plugin or script changed this cycle, change
   `## [X.Y.Z] — UNDER DEVELOPMENT` to `## [X.Y.Z] — YYYY-MM-DD`. Bump
   `.claude-plugin/marketplace.json`'s `metadata.version` and add the matching root `CHANGELOG.md`
   entry naming the bundled plugin and script versions.
   - Commit: `chore: release marketplace vX.Y.Z`
2. **Merge to `main`**
   ```bash
   git checkout main && git pull origin main
   git merge develop --no-ff -m "Merge branch 'develop' into main for release vX.Y.Z"
   ```
3. **Tag the release** (on `main`)
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z — <brief description>"
   ```
4. **Merge back to `develop`**
   ```bash
   git checkout develop && git merge main --no-ff
   ```
5. **Open the next cycle** (on `develop`) — add `## [X.Y+1.0] — UNDER DEVELOPMENT` to each
   changelog that will accumulate work.
   - Commit: `chore: open the next development cycle`
6. **Push** (ASK USER FIRST)
   ```bash
   git push origin main && git push origin develop && git push origin vX.Y.Z
   ```

**Note:** the marketplace has no CI; a tag on `main` is the release record, and users pick up
changes when they update the marketplace.
