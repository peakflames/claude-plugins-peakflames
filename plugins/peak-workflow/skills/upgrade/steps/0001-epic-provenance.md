# Step 0001 — epic-provenance

**Summary:** Backfill each epic spec's `**Planned by:**` / `**Planned:**` / `**Plan branch:**`
lines and each status sidecar's `owner: —` line from git history.
**Rewrites:** `docs/implementation-plan/phase-*/epic-*.md` `docs/implementation-plan/status/epic-*.md`
**Skip:** supported — `--skip <epic IDs>`

Forward-only and append-only: this file is never edited after release. A correction is a new step.

`tor-lifecycle` means `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle"`. Add
`--skip <id>,<id>` to both commands when the runner is skipping epics.

## Detect

`tor-lifecycle provenance --base <base>`

- Exit 0, no output — satisfied.
- Exit 1 — pending. Each line is `<path><TAB><what it gains>`.

## Preview

Show the counts — *"<S> specs gain provenance lines; <C> sidecars gain `owner: —`"* — and a
table of the specs (the first 20, then *"… and N more"*):

| Epic | Planned by | Planned | Plan branch |
|---|---|---|---|

Name each epic `<id> (<slug>)` from its spec filename. Then say, in plain words:

- Values come from the commit that first added each spec (a rename of the same epic is followed;
  a look-alike spec of another epic is not), and the branch from the merge that brought it into
  `<base>`. A spec committed straight onto `<base>` names `<base>`. `—` means git cannot tell.
- A line that already has a value is never changed; a `—` value is filled when git knows better.
- `owner: —` marks an epic as unclaimed; `start-epic` sets it when someone starts the epic. On a
  Complete epic, `—` means history does not record who built it; on an In Progress or Paused
  epic, who started it — `start-epic` fills it on resume.

## Apply

`tor-lifecycle provenance --base <base> --write`

The changed files are exactly the paths the Detect output listed.
