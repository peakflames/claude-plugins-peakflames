---
name: upgrade
description: |
  Brings a project's peak-workflow files forward to the format this plugin version reads, one
  numbered step at a time. Reads the format stamp (docs/.peak-workflow.toml; missing = format 0),
  runs each pending step's detect check, previews and applies it on a docs/upgrade-format-N
  branch with one commit per step (or per phase, when the step says so), and stamps the new format. Warns about feature branches in
  flight that touch files a step rewrites. Never edits CLAUDE.md.
  Use when any peak-workflow command says the project is behind this plugin's format.
  Triggers on: "upgrade", "upgrade project", "project is behind", "format stamp", "run the upgrade",
  "bring the project up to date", "/peak-workflow:upgrade".
---

You are upgrading this project's peak-workflow files to the format this plugin reads. The steps
live in `${CLAUDE_PLUGIN_ROOT}/skills/upgrade/steps/NNNN-<name>.md`. Each one is forward-only:
it has a **Detect** check, a **Preview** to show the user, an **Apply**, and optionally a
**Report** for the final message. Applying step `NNNN` moves the project to format `NNNN`. You run the steps; you do not improvise changes they do not
describe, and no step ever edits the user's `CLAUDE.md`.

`tor-lifecycle` below means `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle"`. Exit codes: 0 ok,
1 findings, 2 data error (relay stderr and stop), 3 no suitable Python (relay the install hint and
stop).

## Step 1: Read the Format

Run `tor-lifecycle format` (exit 3: print the install hint and stop; exit 2: print the error and
stop) and act on its first line, `verdict: <word>`:

| Verdict | Action |
|---|---|
| `new` | Print *"No peak-workflow files here yet. Run /peak-workflow:setup — it stamps the current format."* and stop |
| `ahead` or `not-peak-workflow` | Print the command's message and stop |
| `current` or `behind` | Continue. `N` is the `project:` number (0 when there is no stamp) |

## Step 2: Clean Tree

Run `git status --porcelain`. If it lists anything, stop: *"Commit or stash your changes first —
each upgrade step is its own commit, and yours must not ride along."*

Then pick the base branch: `git branch --list develop main master` — prefer `develop`, then
`main`, then `master`. Every `<base>` below is this branch.

## Step 3: List the Work

List `${CLAUDE_PLUGIN_ROOT}/skills/upgrade/steps/*.md`. Two kinds of work:

- **Pending steps** — numbered above `N`, in ascending order. The target is the last one's
  number.
- **Catch-up** — steps numbered `N` or below whose **Skip** line says skipping is supported. An
  earlier run may have skipped epics that were in flight; once those merge, the step's Detect
  finds them. Run each such Detect now, without skips; pending output is catch-up work. (Step 6
  runs it again with any Step 5 skips.)

Then:

- **Nothing pending and no catch-up:** print *"This project is on format N — nothing to upgrade."*
  and stop.

Read each step file involved. Show the plan:

```
Upgrade: format N → <target>     (or: catch-up on format N)

| Step | What it does |
|---|---|
| 0001 epic-provenance | <the step's Summary line> |    ← mark catch-up rows "(catch-up)"
```

## Step 4: Branch

1. The upgrade branch is `docs/upgrade-format-<target>`, or `docs/upgrade-catch-up-<N>` when
   there is only catch-up work.
2. If the current branch is already that branch (a resumed run), stay on it and go to Step 5.
3. Otherwise `git checkout <base>`. If `git rev-parse --abbrev-ref @{upstream} 2>/dev/null` succeeds, run
   `git pull --ff-only`; on failure, stop and say the base has diverged from origin.
4. `git checkout -b <branch>`. If that branch already exists and has merged —
   `git merge-base --is-ancestor <branch> <base>` succeeds, or `git cherry <base> <branch>` prints
   no `+` line (a squash or rebase merge) — it is an earlier run's branch: `git branch -D <branch>`
   and create it again. If it exists and has not merged, ask via
   `AskUserQuestion` — `["Continue on the existing branch", "Stop"]`; on Continue check it out and
   re-run `tor-lifecycle format` (an earlier run may have applied some steps; recompute the pending
   list).

## Step 5: Warn About Work in Flight

Collect every pattern in the **Rewrites** lines of the steps you will run and run
`tor-lifecycle inflight --base <base> '<pattern>' …`, each pattern single-quoted so git (not the
shell) matches it on every branch. It prints `branch<TAB>path` for each unmerged
local or remote branch that touches them (exit 0 = none; skip the rest of this step).

When there are rows, show them grouped by branch and explain in one sentence: those branches will
conflict with this upgrade where they edit the same lines. Then ask via `AskUserQuestion`
(offer the Skip option only when at least one step you will run says skipping is supported —
otherwise the first option is `"Rewrite everything anyway (Recommended)"`):

- Question: `"Some branches in flight touch files this upgrade rewrites. How should I proceed?"`
- Options:
  - `"Skip the epics those branches work on (Recommended)"` — collect the epic IDs from the listed
    paths (`status/epic-<id>.md`, `phase-*/epic-<id>-*.md`) and pass them to every step whose
    **Skip** line says it supports skipping. Tell the user to re-run `/peak-workflow:upgrade` after
    those epics merge — the detect check picks up exactly what was skipped.
  - `"Rewrite everything anyway"`
  - `"Stop — I'll merge or finish those branches first"`

A skipped epic does not hold the stamp back: the step's change is optional history for in-flight
epics, and its detect check stays honest on the next run.

## Step 6: Apply Each Step

First the catch-up steps, then the pending steps, in ascending order. A catch-up step is applied
exactly like a pending one except: skip item 4 (the stamp already covers it), and its commit
message ends in ` (catch-up)`.

For each step:

1. **Detect.** Run the step's Detect command.
   - Satisfied: for a pending step, say *"Step NNNN <name>: already satisfied — stamping only."*
     and go to 4; for a catch-up step (its remaining epics are in flight), there is nothing to
     commit — go to the next step.
   - Pending: continue.
2. **Preview.** Show what the step's **Preview** section asks for. Ask via `AskUserQuestion`:
   `"Apply step NNNN <name>?"` — `["Apply", "Stop here"]`. On Stop, end the session: the branch
   keeps the steps already committed, and a later run resumes from the stamp.
3. **Apply.** Run the step's Apply exactly as written. A step whose **Commits** line says it
   commits per phase makes those commits itself, on this branch, as its Apply describes.
4. **Stamp.** `tor-lifecycle format --set NNNN`.
5. **Commit** on the upgrade branch (check `git branch --show-current` first). Stage the
   files the step changed since its last commit and `docs/.peak-workflow.toml` by path, never
   `git add -A`: `git commit -m "chore(upgrade): step NNNN <name>"`. Then `git status --porcelain`
   must be empty; if anything is left over, stop and show it.
6. **Re-detect.** Run the Detect command again (with the same skips). It must report satisfied. If
   it does not, stop: *"Step NNNN did not fully apply"* plus its output. Do not run later steps.

## Step 7: Finish

Run `tor-lifecycle format` and print its message (it says `current`). Then summarize (a
catch-up-only run: heading `Caught up format N on <branch>`), one row per commit this run made, oldest
first (`git log --reverse --format='%h %s' <base>..HEAD`):

```
Upgraded format N → <target> on <branch>

| Commit | Step | Files |
|---|---|---|
| <sha7> | 0001 epic-provenance | <count> |
| <sha7> | 0002 requirements-lifecycle — change records | <count> |
```

`<count>` is the number of files in the commit, the stamp included (`git show --name-only --format= <sha>`).

Then, for each step applied in this run that has a **Report** section, do what it says — in this
message, never in a file.

List any skipped epics with *"re-run /peak-workflow:upgrade after these merge"*. If the run made
no commit at all, delete the empty branch (`git checkout <base> && git branch -d <branch>`), say
there was nothing to apply, and stop.

Merge is approval, as for every `docs/` branch. Ask via `AskUserQuestion`:

- Question: `"How should <branch> reach <base>?"`
- Options: `["Team — push and open a PR", "Solo — merge into <base> locally", "Leave the branch for now"]`

- **Team:** `git push -u origin <branch>`, then
  `gh pr create --base <base> --title "chore(upgrade): format N → <target>"` (catch-up only:
  `"chore(upgrade): catch-up on format N"`) with the summary table as the body.
- **Solo:** `git checkout <base> && git merge --no-ff <branch> && git branch -d <branch>`.
- **Leave:** print the two commands above for later.

After a merge, remind the user that branches in flight should merge `<base>` in before they
continue.
