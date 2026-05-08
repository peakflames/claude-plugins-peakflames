---
name: new-project
description: |
  Front-door router for newcomers. Detects project state (greenfield, brownfield
  epic-workflow project, or existing peak-workflow project) and dispatches to the
  correct entry point. Writes no state files.
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

Run each check in order and record what you observe. Do not stop on the first match — collect
all signals before reaching a verdict.

### 1.1 — Vision and ConOps

```bash
ls docs/product-vision-planning/product-vision.md 2>/dev/null
ls docs/product-vision-planning/concept-of-operations.md 2>/dev/null
wc -w docs/product-vision-planning/product-vision.md 2>/dev/null
wc -w docs/product-vision-planning/concept-of-operations.md 2>/dev/null
```

Set `has_vision_conops = true` only if both files exist **and** each exceeds 100 words of body
content. Otherwise `has_vision_conops = false` (missing or short stub). Pattern reused from
`/peak-workflow:migrate-from-epic-workflow` Step 0.5.

### 1.2 — TOR feature files

```bash
ls docs/requirements/*.feature.md 2>/dev/null | head -3
```

Set `has_feature_files = true` if any `.feature.md` files are present. Pattern reused from
`/peak-workflow:migrate-from-epic-workflow` Step 0.3 (idempotency check).

### 1.3 — Implementation plan layout

```bash
ls docs/implementation-plan/ 2>/dev/null
ls docs/implementation-plan/status/ 2>/dev/null | head -3
ls docs/implementation-plan/phase-*/index.md 2>/dev/null | head -3
```

Record:
- `has_plan_dir` — `docs/implementation-plan/` exists
- `has_status_dir` — `docs/implementation-plan/status/` exists (v2.5.0+ layout signal)
- `has_phase_indexes` — at least one `phase-*/index.md` exists

If `has_plan_dir` is true but `has_status_dir` is false, the project is on the **pre-v2.5.0
epic-workflow layout** — surface this and recommend `/peak-workflow:migrate-2.5` first
(see Step 3).

### 1.4 — Sidecar requirements field (peak-workflow signal)

If any `epic-*.md` sidecars exist under `docs/implementation-plan/status/`, read up to three of
them and check whether they contain a `requirements:` line in the YAML frontmatter:

```bash
grep -l '^requirements:' docs/implementation-plan/status/epic-*.md 2>/dev/null | head -3
```

Set `has_requirements_field = true` if at least one sidecar has the field. Pattern reused from
`/peak-workflow:migrate-from-epic-workflow` Step 0.3.

### 1.5 — Epic-workflow acceptance criteria signal (brownfield epic-workflow)

If `has_phase_indexes` is true and `has_feature_files` is false, spot-check one or two epic
spec files for an `## Acceptance Criteria` section:

```bash
grep -l '^## Acceptance Criteria' docs/implementation-plan/phase-*/epic-*.md 2>/dev/null | head -2
```

This is the epic-workflow format (peak-workflow specs use `## Requirements Anchors` instead).

---

## Step 2: Reach a Verdict

Apply these rules in order — first match wins:

1. **Pre-v2.5.0 epic-workflow layout** — `has_plan_dir = true` AND `has_status_dir = false`.
   Verdict: **MIGRATE-2.5 FIRST**.

2. **Existing peak-workflow project** — `has_feature_files = true` OR `has_requirements_field = true`.
   Verdict: **EXISTING PEAK-WORKFLOW**.

3. **Brownfield epic-workflow** — `has_status_dir = true` AND `has_feature_files = false` AND
   epic specs contain `## Acceptance Criteria`. Verdict: **MIGRATE FROM EPIC-WORKFLOW**.

4. **Greenfield** — `has_vision_conops = false` AND `has_feature_files = false` AND
   (`has_plan_dir = false` OR no epics in plan). Verdict: **GREENFIELD**.

5. **Ambiguous** — anything else (e.g., partial vision but no ConOps; some plan artifacts but
   no clear lineage). Verdict: **ASK USER**.

Print the verdict along with the signals observed:

```
## Project State Detection

Verdict: <GREENFIELD | MIGRATE FROM EPIC-WORKFLOW | EXISTING PEAK-WORKFLOW | MIGRATE-2.5 FIRST | ASK USER>

Signals observed:
- vision/ConOps present + substantive: <yes | no | partial>
- docs/requirements/*.feature.md present: <yes | no>
- docs/implementation-plan/ present: <yes | no>
- docs/implementation-plan/status/ present: <yes | no>
- Sidecars contain `requirements:` field: <yes | no | n/a>
- Epic specs use `## Acceptance Criteria` (epic-workflow format): <yes | no | n/a>
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
3. /peak-workflow:capture-requirements  — derive TOR feature files from vision/ConOps
4. /peak-workflow:plan-project          — derive epics + phases from the TOR baseline

After the docs/ branch from steps 2-4 is merged, you'll iterate with:
   /peak-workflow:start-epic <id>   →   /peak-workflow:wrapup-epic <id>

I'd start with `/peak-workflow:setup`. Each later step benefits from a fresh session for
clean context.
```

Ask:
- Question: `"Run /peak-workflow:setup now?"`
- Options: `["Run /peak-workflow:setup now", "I'll run it manually"]`

On confirm, invoke:
```
Skill({ skill: "peak-workflow:setup", args: "" })
```

### Verdict: MIGRATE FROM EPIC-WORKFLOW

Recommendation:

```
This project uses the epic-workflow format (epic specs with `## Acceptance Criteria`,
no `docs/requirements/*.feature.md` files). Run the one-shot migration to derive a formal
TOR requirements baseline and convert Not-Started epics to peak-workflow format:

   /peak-workflow:migrate-from-epic-workflow

The migration is non-destructive and idempotent — running it again on a migrated project
exits cleanly.
```

Ask:
- Question: `"Run /peak-workflow:migrate-from-epic-workflow now?"`
- Options: `["Run /peak-workflow:migrate-from-epic-workflow now", "I'll run it manually"]`

On confirm, invoke:
```
Skill({ skill: "peak-workflow:migrate-from-epic-workflow", args: "" })
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

### Verdict: MIGRATE-2.5 FIRST

Recommendation:

```
This project uses the pre-v2.5.0 implementation-plan layout (single `index.md` with status
table, no `status/` directory). Upgrade the layout first, then re-run /peak-workflow:new-project:

   /peak-workflow:migrate-2.5

After the migration completes, re-run /peak-workflow:new-project to detect the post-migration
state (likely brownfield epic-workflow) and continue.
```

Ask:
- Question: `"Run /peak-workflow:migrate-2.5 now?"`
- Options: `["Run /peak-workflow:migrate-2.5 now", "I'll run it manually"]`

On confirm, invoke:
```
Skill({ skill: "peak-workflow:migrate-2.5", args: "" })
```

After the migrate-2.5 dispatch, do **not** auto-rerun `/new-project` — the user will run it
themselves in a fresh session for clean context.

### Verdict: ASK USER

State the ambiguity and ask the user which path applies. Do **not** guess.

```
The project state isn't unambiguous. I observed:
<one-line summary of the conflicting signals>

Which best describes this project?
```

- Question: `"Which path describes this project?"`
- Options:
  - `"Fresh greenfield — start with /peak-workflow:setup"`
  - `"Existing epic-workflow project — migrate via /peak-workflow:migrate-from-epic-workflow"`
  - `"Already on peak-workflow — open /peak-workflow:status"`
  - `"None of the above — I'll pick a command myself"`

Dispatch the corresponding skill from the verdict above (GREENFIELD / MIGRATE FROM
EPIC-WORKFLOW / EXISTING PEAK-WORKFLOW), or print the inventory and exit on the last option.

---

## Step 4: Do Nothing Else

- Do **not** create any files.
- Do **not** run any git commands.
- Do **not** modify CLAUDE.md, the implementation plan, or any documentation.
- Do **not** create a branch.

`/new-project` is detection + dispatch only. If the user chose a manual path, end the session
with the verdict and recommended commands printed.
