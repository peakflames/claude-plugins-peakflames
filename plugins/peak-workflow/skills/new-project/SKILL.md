---
name: new-project
description: |
  Front-door router for newcomers. Reads the project's format stamp to tell a fresh
  project, an existing peak-workflow project, and one that needs /peak-workflow:upgrade
  apart, and dispatches to the correct entry point. Writes no state files.
  Use when starting work on a project for the first time and you're not sure which
  command to run.
  Triggers on: "new project", "where do I start", "first time here",
  "help me get started", "I'm new to peak-workflow", "what should I run first",
  "set up a new project", "start a new project".
argument-hint: "[optional: short description of the project]"
---

You are routing the user to the correct peak-workflow entry point. This is a **detection +
dispatch** skill — you do not write state files, you do not make git changes, you do not
modify any documentation. Your output is a verdict plus an ask-and-dispatch.

The user's optional description: $ARGUMENTS

---

Follow these steps exactly:

## Step 1: Detect Project State

### 1.1 — Format stamp

```bash
sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" format
```

Record the first line, `verdict: <word>`, and the exit code. Exit 3 means no suitable Python:
print its output and stop. Exit 2 means the stamp is unreadable: print its output and stop.
Exit 1 is not an error here — it is how `format` reports `behind`, `ahead`, and
`not-peak-workflow`; Step 2 routes on the verdict.

### 1.2 — Existing code

```bash
find . -maxdepth 2 -not -path './node_modules/*' -not -path './.git/*' \( -name package.json -o -name pyproject.toml -o -name Cargo.toml -o -name go.mod -o -name CMakeLists.txt -o -name platformio.ini -o -name Makefile -o -name '*.sln' -o -name '*.csproj' \) 2>/dev/null | head -5
test -d src && echo "src/"
```

(`find`, not a glob list — zsh aborts a whole `ls` command when one pattern matches nothing.)

Set `has_code = true` if any match. It does not change the verdict — a repository with code and
no peak-workflow artifacts still starts with `/peak-workflow:setup` — but it changes the wording,
and `setup` and `plan-project` both detect it and extend the code rather than scaffold.

---

## Step 2: Reach a Verdict

The stamp decides — no file heuristics:

| `format` verdict | Verdict |
|---|---|
| `new` | **GREENFIELD** |
| `current` | **EXISTING PEAK-WORKFLOW** |
| `behind` | **UPGRADE FIRST** |
| `ahead` | **UPDATE THE PLUGIN** |
| `not-peak-workflow` | **NOT A PEAK-WORKFLOW LAYOUT** |

Print the verdict with what was observed:

```
## Project State Detection

Verdict: <GREENFIELD | EXISTING PEAK-WORKFLOW | UPGRADE FIRST | UPDATE THE PLUGIN | NOT A PEAK-WORKFLOW LAYOUT>

Signals observed:
- Format: <project format, or "no stamp"> (this plugin: <plugin format>)
- Existing code (build manifest or src/): <yes | no>
```

---

## Step 3: Recommend and Dispatch

Use the verdict to choose the recommendation. In every branch, **print the recommended
command(s) for the user to confirm before invoking via the Skill tool**. If the user declines
auto-dispatch, print the commands as text and end.

### Verdict: GREENFIELD

Recommendation:

```
This looks like a fresh project. The greenfield path is:

1. /peak-workflow:setup                 — audit CLAUDE.md, stub architecture/design-notes
2. /peak-workflow:discover              — adaptive interview → product-vision + ConOps
3. /peak-workflow:mockup                — (UI projects only — screen inventory, flows, wireframes)
4. /peak-workflow:capture-requirements  — derive TOR feature files from vision/ConOps
5. /peak-workflow:plan-project          — derive epics + phases from the TOR baseline

After the docs/ branch from steps 2-5 is merged, you'll iterate with:
   /peak-workflow:start-epic <id>   →   /peak-workflow:wrapup-epic <id>

I'd start with `/peak-workflow:setup`. Each later step benefits from a fresh session for
clean context.
```

When `has_code = true`, replace the first line with: *"There's code here already, but no
peak-workflow planning yet. Setup reads your existing stack from the code — nothing gets
re-scaffolded. The path is:"*

Ask:
- Question: `"Run /peak-workflow:setup now?"`
- Options: `["Run /peak-workflow:setup now", "I'll run it manually"]`

On confirm, invoke — passing the user's description through, so `setup` drafts the Project
Overview from it instead of asking again:
```
Skill({ skill: "peak-workflow:setup", args: "$ARGUMENTS" })
```

### Verdict: EXISTING PEAK-WORKFLOW

This project is already on peak-workflow. Ask the user what they actually want to do:

- Question: `"This is an existing peak-workflow project. What would you like to do?"`
- Options:
  - `"Triage an incoming request (issue or ad-hoc)"`
  - `"Read the project status dashboard"`
  - `"I'll pick a command myself"`

On `"Triage an incoming request..."`, invoke:
```
Skill({ skill: "peak-workflow:triage", args: "$ARGUMENTS" })
```
(Pass `$ARGUMENTS` if the user gave a description; otherwise pass empty string and `/triage`
will prompt.)

On `"Read the project status dashboard"`, invoke:
```
Skill({ skill: "peak-workflow:status", args: "" })
```

On `"I'll pick a command myself"`, print the inventory and exit:

```
Common commands on an existing peak-workflow project:
- /peak-workflow:triage <issue|description>   — size an incoming request (HEAVY/EPIC/TRIVIAL)
- /peak-workflow:status                       — read-only progress dashboard
- /peak-workflow:add                          — add an epic referencing existing TOR IDs
- /peak-workflow:start-epic <id>              — implement a planned epic
- /peak-workflow:wrapup-epic <id>             — independent verification of a completed epic
- /peak-workflow:quick-fix <description>      — trivial bug fix on a hotfix branch
```

### Verdict: UPGRADE FIRST

Print the `format` command's message, then:

```
This project's peak-workflow files are older than this plugin reads. The upgrade shows each step
before applying it, works on its own docs/upgrade-format-… branch, and makes one commit per step.
Commands that change files wait until it is merged; status and triage still run, with a warning.
```

Ask:
- Question: `"Run /peak-workflow:upgrade now?"`
- Options: `["Run /peak-workflow:upgrade now", "I'll run it manually"]`

On confirm, invoke:
```
Skill({ skill: "peak-workflow:upgrade", args: "" })
```

### Verdict: UPDATE THE PLUGIN or NOT A PEAK-WORKFLOW LAYOUT

Print the `format` command's message and end. Dispatch nothing.

---

## Step 4: Do Nothing Else

- Do **not** create any files.
- Do **not** run any git command that changes the repository.
- Do **not** modify CLAUDE.md, the implementation plan, or any documentation.
- Do **not** create a branch.

`/new-project` is detection + dispatch only. If the user chose a manual path, end the session
with the verdict and recommended commands printed.
