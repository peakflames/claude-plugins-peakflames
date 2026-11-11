# ledger — Implementation Plan

## Quick Start for New Session

1. Run `/peak-workflow:status` for the live cross-phase dashboard (includes Requirements Coverage)
2. Run `/peak-workflow:start-epic <id>` to begin an epic (use the 7-character alphanumeric ID from the phase index)
3. Claude Code reads the epic spec, loads TOR requirements from feature files, enters plan mode, and creates tasks (one task per TOR ID or TOR group — these are user stories)
4. When implementation is done, open a new session: `/peak-workflow:wrapup-epic <id>`
5. If stopping early: `/peak-workflow:pause`

## Epic Lifecycle

```
Not Started → In Progress → Implemented → Complete
                  ^              ^             ^
    /peak-workflow:start-epic  /peak-workflow:start-epic  /peak-workflow:wrapup-epic
          (begins)           (finishes)      (independent review)
```

Each epic's status sidecar includes a `requirements:` field listing the TOR IDs the epic covers.
`/peak-workflow:status` uses these fields to compute the Requirements Coverage dashboard.
