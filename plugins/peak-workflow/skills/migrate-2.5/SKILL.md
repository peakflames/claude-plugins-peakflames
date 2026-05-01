---
name: migrate-2.5
description: |
  One-shot migration from the pre-v2.5.0 implementation-plan layout (single index.md with
  status table) to the v2.5.0 layout (per-phase index files + per-epic status sidecars).
  Run once per project after upgrading from the legacy single-index layout.
  Triggers on: "migrate to 2.5", "upgrade implementation plan", "split index",
  explicit /peak-workflow:migrate-2.5.
---

You are migrating a project's implementation plan from the legacy pre-v2.5.0 layout (a single `docs/implementation-plan/index.md` with a combined status table) to the v2.5.0 layout (per-phase index files + per-epic status sidecars). This is a one-shot upgrade; running it again on an already-migrated project is safe (Step 1 detects the no-op and exits cleanly).

Follow these steps exactly:

## Step 1: Detect State

Read `docs/implementation-plan/index.md`.

1. **No implementation plan:** If `docs/implementation-plan/index.md` does not exist, report:
   > No implementation plan found at `docs/implementation-plan/index.md`. Nothing to migrate.

   Stop here.

2. **Already migrated:** If the file exists but does not contain a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column — report:
   > Already on the v2.5.0 layout (or never had a legacy status table). Nothing to migrate.

   Stop here.

3. **Partially migrated:** Check whether any `docs/implementation-plan/phase-*/index.md` file already contains the new schema header (`| Epic | Name | Dependencies |`). If yes, ask the user:
   > Migration appears partially complete — some phase indexes already contain the v2.5.0 schema. How would you like to proceed?

   Use `AskUserQuestion`:
   - Question: `"Migration appears partially complete. How would you like to proceed?"`
   - Options: `["Skip (recommended) — treat migration as already done", "Re-run from scratch — overwrite phase indexes and sidecars"]`

   **Skip:** exit cleanly with "Skipped — migration treated as complete." Do not overwrite any files.

   **Re-run:** confirm that the legacy `docs/implementation-plan/index.md` still contains the status table header (it will not be present after a successful first run). If it does not, report "Legacy index.md no longer contains the status table — cannot re-run. Use `git revert <migration-hash>` to restore the legacy layout, then re-run." and stop.

4. If the legacy status table header is found and no partial-migration state exists, proceed to Step 2.

## Step 2: Parse Legacy Table

Read `docs/implementation-plan/index.md` in full.

1. **Extract the status table rows.** Find the table with a header containing `| Phase |`, `| Epic |`, `| Name |`, and `| Status |` columns (order may vary). Parse every data row (skip the header and separator rows). For each row, capture all seven fields:
   - Phase number
   - Epic ID (verbatim — may be a legacy integer like `7`, a decimal like `6.5`, or a 7-char alphanumeric like `a3f2K7p`)
   - Name (may be a markdown link `[Epic Name](phase-dir/epic-id-name.md)`)
   - Status
   - Handoff (may be `—` or a markdown link)
   - Implemented date (may be `—` or YYYY-MM-DD)
   - Completed date (may be `—` or YYYY-MM-DD)

2. **Validate spec links.** For each epic row with a spec link, verify the linked file exists under `docs/implementation-plan/phase-N-*/`. Report orphans without stopping:
   > Warning: No spec file found for Epic <id> (link: <path>). This row will still be migrated — fix the spec path manually after migration if needed.

3. **Validate status values.** Confirm each Status value is one of: `Not Started`, `In Progress`, `Implemented`, `Complete`, `Paused`. For any malformed value, report:
   > Row for Epic <id> has unexpected status: '<value>'. Please fix this row in `docs/implementation-plan/index.md` and re-run migration. Migration is idempotent — safe to re-run after fixes.

   If any malformed status is found, stop here and let the user fix the legacy file before re-running.

## Step 3: Preview

Before writing any files, present a summary of planned writes to the user:

```
## Migration Preview

Will create:
- <N> phase index files (across <M> phase directories):
  - docs/implementation-plan/<phase-dir>/index.md  (<X> epics)
  [one line per phase]
- <K> status sidecars under docs/implementation-plan/status/:
  - docs/implementation-plan/status/epic-<id>.md  (status: <Status>)
  [one line per epic]
- docs/implementation-plan/README.md  (prose extracted from old index.md preamble)
- docs/implementation-plan/index.md  (replaced with thin stub)

Will discard:
- Hand-maintained dependency graph (regenerated on demand by /peak-workflow:status)
- Legacy status table (replaced by per-epic sidecars)

Total: <N> phases, <K> epics
```

Ask the user to confirm before any writes. If the user declines, stop with no changes made.

## Step 4: Write Phase Indexes

For each phase directory found under `docs/implementation-plan/phase-*/`:

1. **Derive phase title.** Extract from the directory name:
   - `phase-1-foundation/` → Phase 1: Foundation
   - `phase-2-data-layer/` → Phase 2: Data Layer
   (Capitalize the first letter of each hyphen-separated word segment after the phase number.)

2. **Collect rows.** Gather all epic rows from the legacy table that belong to this phase (matched by Phase column value).

3. **Derive spec filename.** The spec file is already at `docs/implementation-plan/{phase-dir}/epic-{id}-{name}.md`. In the phase index, use only the filename (no directory prefix) since the index lives in the same directory. Extract the filename from the legacy table's Name column spec link.

4. **Derive dependencies.** Use these sources in order of preference:
   - The legacy `index.md` ASCII dependency graph section — parse parent/child relationships.
   - Fallback: read each epic's spec file header `**Dependencies:**` line.
   - If no dependency information is found, use `—`.

5. **Write `docs/implementation-plan/{phase-dir}/index.md`:**

```markdown
# Phase {N}: {Phase Name}

| Epic | Name | Dependencies |
|------|------|--------------|
| {id} | [{Epic Name}](epic-{id}-{slug}.md) | {dep1}, {dep2} |
```

   - Dependencies: comma-separated epic IDs of direct dependencies. Use `—` when there are none.
   - Preserve the row order from the legacy table.
   - Epic IDs are verbatim (legacy integer, decimal, or 7-char alphanumeric).

## Step 5: Write Status Sidecars

1. Create the `docs/implementation-plan/status/` directory if it does not exist.

2. For each epic row from the legacy table, write `docs/implementation-plan/status/epic-<id>.md` with exactly these four lines:

```
status: <Status>
implemented: <Implemented date or —>
completed: <Completed date or —>
handoff: <Handoff link or —>
```

   - `status:` — verbatim from the legacy Status column (`Not Started`, `In Progress`, `Implemented`, `Complete`, `Paused`).
   - `implemented:` — verbatim date from the legacy Implemented column, or `—`.
   - `completed:` — verbatim date from the legacy Completed column, or `—`.
   - `handoff:` — the raw markdown link text from the legacy Handoff column (e.g., `[paused](session-handoffs/epic-7-paused.md)`), or `—` if the column was empty.

## Step 6: Extract Prose to README.md

1. Read `docs/implementation-plan/index.md`. Identify the **prose region** — everything before the legacy status table. This typically includes:
   - The `# [Project Name] — Implementation Plan` title
   - A "Quick Start for New Session" section
   - An "Epic Lifecycle" diagram
   - Any project-specific notes

2. Update the prose for the v2.5.0 workflow:
   - Replace "Check the status table below for the current epic" → "Run `/peak-workflow:status` for the live cross-phase dashboard."
   - Replace any instruction to check `index.md` directly → point to `/peak-workflow:status`.
   - Leave all other prose intact.

3. If `docs/implementation-plan/README.md` already exists, ask:
   > `docs/implementation-plan/README.md` already exists. Overwrite with the extracted preamble?

   Use `AskUserQuestion`:
   - Question: `"docs/implementation-plan/README.md already exists. Overwrite?"`
   - Options: `["Overwrite with extracted preamble", "Keep existing README — skip extraction"]`

   If the file does not exist, write it without asking.

4. Write `docs/implementation-plan/README.md` with the updated prose from item 2 (if not skipped).

## Step 7: Replace Top-Level `index.md`

Overwrite `docs/implementation-plan/index.md` with this exact stub:

```markdown
# Implementation Plan

This project uses the v2.5.0 layout. See:

- `README.md` — project overview and lifecycle
- `phase-*/index.md` — per-phase epic registries (epic ID, name, dependencies)
- `status/epic-<id>.md` — per-epic status sidecars
- Run `/peak-workflow:status` for the live cross-phase dashboard
```

Skills do not read or write this stub after migration — it is a human-readable pointer only.

## Step 8: Commit

Stage every new and changed file by exact path (not `git add -A`):
- All `docs/implementation-plan/phase-*/index.md` files written in Step 4
- All `docs/implementation-plan/status/epic-*.md` files written in Step 5
- `docs/implementation-plan/README.md` (if written in Step 6)
- `docs/implementation-plan/index.md` (the new stub from Step 7)

Commit with:
- **Subject:** `chore(epic-workflow): migrate implementation plan to v2.5.0 layout`
- **Body:**
  ```
  Migrated <N> phases, <K> epics from legacy single-index layout to v2.5.0
  per-phase indexes + status sidecars.

  - Phase indexes written: <N>
  - Status sidecars written: <K>
  - Prose extracted to README.md: [yes / no — skipped by user]
  - Dependency graph: discarded (regenerated by /peak-workflow:status)
  ```

Single commit so `git revert <hash>` rolls everything back atomically. Do **not** push.

After committing, report:

> Migration complete. This project now uses the v2.5.0 layout.
>
> To roll back: `git revert HEAD`
>
> Verify with `/peak-workflow:status` — it should show the same epic counts and statuses as before.

---

## Idempotency Notes

- **Running on an already-migrated project:** Step 1 finds no legacy header and exits with "nothing to migrate."
- **Recovering from a partial or botched migration:** Run `git revert <migration-commit-hash>` to restore the legacy layout, then re-run this skill.

## What This Migration Does NOT Do

- Does not delete or move epic spec files — they remain in their phase directories.
- Does not touch `docs/implementation-plan/session-handoffs/`.
- Does not edit `docs/architecture.md` or `docs/design-notes.md`.
- Does not update project-specific `CLAUDE.md` files — if a project's CLAUDE.md references the old `index.md` path, the user may want to update it to point to `/peak-workflow:status` or the phase indexes.
