---
name: triage
description: |
  Advisory routing for an incoming GitHub issue or ad-hoc request — sizes the request against
  the TOR requirements baseline, product vision, and ConOps, then recommends one of
  HEAVY / EPIC / TRIVIAL. On user confirm, dispatches `/add` or `/quick-fix` in-session via
  the Skill tool; for HEAVY outcomes, prints the commands to run in a fresh session.
  Writes no state files.
  Use when a new request arrives (GitHub issue or free text) and you need to decide which
  path it belongs on before committing to full epic ceremony.
  Triggers on: "triage", "triage issue", "review this issue", "size this",
  "how should I approach", "is this an epic or a fix", "evaluate this request".
argument-hint: "<issue-number | free-text description>"
---

You are triaging a request to decide which workflow path it belongs on. This is an **advisory**
skill — you do not write state files, you do not make git changes, you do not modify the
implementation plan. Your output is a verdict plus an optional ask-and-dispatch.

The user's request: $ARGUMENTS

## Layout Guard

**Before any other action:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/peak-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

Follow these steps exactly:

## Step 1: Load Context

Read the following to build a picture of the project's current direction:

1. `CLAUDE.md` at the repo root — for project context and tech stack.
2. `docs/product-vision-planning/product-vision.md` — the vision statement and in-scope/out-of-scope boundaries.
3. `docs/product-vision-planning/concept-of-operations.md` — operational scenarios the product supports.
4. The phase indexes under `docs/implementation-plan/phase-*/index.md` — read them to see what phases and epics exist in the plan. Supplement with spot-checks of `docs/implementation-plan/status/epic-*.md` sidecars if you need status counts.
5. **TOR requirements baseline.** Glob `docs/requirements/*.feature.md`. For each, parse the TOR IDs and scenario titles. Also check which TOR IDs are already in epic sidecars' `requirements:` fields to identify "already planned" vs. "unplanned" TOR IDs.

If any of these are missing or placeholders, note it and continue — the triage rubric below can still be applied on whatever context you have.

## Step 2: Load the Request

Interpret `$ARGUMENTS`:

- If `$ARGUMENTS` parses as an integer (e.g., `42`) or starts with `#` (e.g., `#42`), treat it as a GitHub issue number. Run `gh issue view <N> --json title,body,labels,author,state` and use the result as the request content. If `gh` is not available or the issue cannot be fetched, fall back to treating the argument as free text and inform the user.
- Otherwise, treat `$ARGUMENTS` as a free-text description of the request.

Capture the request's title (for issues) and a short summary that you can use throughout the triage output.

## Step 3: Size the Request

Apply this rubric — pick exactly one verdict:

| Verdict | Criteria |
|---------|----------|
| **HEAVY** | The request requires **new or modified TOR requirements** — it changes the requirements baseline (new feature files, new TOR IDs, or modification of existing TOR Given/When/Then). Also applies when it changes the product vision or ConOps in ways that would invalidate existing TOR requirements. Examples: new user group, new top-level capability class, scope expansion, strategy pivot, new functional area with no existing TOR IDs. HEAVY work goes through `discover → capture-requirements → plan-project` on a `docs/` branch. |
| **EPIC** | The request can be fully expressed using **existing TOR IDs** — either: (a) there are unplanned TOR IDs that cover this capability and they need to be grouped into an epic for implementation, or (b) the request implements a well-defined set of already-approved TOR requirements. No new requirements are needed. Roughly one session of work; needs an epic spec via `/peak-workflow:add`. |
| **TRIVIAL** | A bug fix, copy change, or small correction to an **already-implemented TOR** where the TOR requirement itself is correct and the implementation just needs to be fixed. The requirement doesn't change — only the code does. Roughly two hours or less; does not warrant a full epic spec. Goes through `/peak-workflow:quick-fix`. |

**TOR-awareness check (applies before finalizing any verdict):**
- If the request adds new user behavior not covered by any existing TOR ID → **HEAVY** (needs requirements capture).
- If the request implements existing but unplanned TOR IDs → **EPIC**.
- If the request fixes broken implementation of a correctly-specified TOR → **TRIVIAL**.
- If the request would require modifying an existing TOR's Given/When/Then → **HEAVY** (requirements change-control event, not an implementation task).

**Cross-layer override (applies to TRIVIAL candidates only):** If accepting the request requires updating more than one independently-owned layer (e.g., frontend + domain logic + integration + tests), apply EPIC regardless of how small any single layer's change appears. A sparse issue body can hide a cascade. When in doubt, pick EPIC.

Cite the TOR ID(s) the request lines up against (or diverges from) to justify the verdict. One to two sentences is enough.

## Step 4: Present the Verdict

Output this block:

```
## Triage Verdict: <HEAVY | EPIC | TRIVIAL>

**Request:** <title or short summary>

**Rationale:** <1–2 sentences citing relevant TOR IDs and/or vision/ConOps — explain specifically why this verdict applies: does the request require new TOR IDs (HEAVY), implement existing TOR IDs (EPIC), or fix the implementation of an existing TOR (TRIVIAL)?>

**Relevant TOR IDs:** <comma-separated list of TOR IDs from the baseline that are relevant, or "None found — new requirements needed" for HEAVY>

**Recommended next command:** <the exact slash command to run>
```

Do **not** recommend or hint at a ship mode (solo vs team). That choice belongs to the user at ship time and will be asked explicitly by `/peak-workflow:quick-fix` or `/peak-workflow:wrapup`.

## Step 5: Ask and Dispatch

Use `AskUserQuestion` to offer the appropriate next step, then — if the user confirms — dispatch the next skill via the `Skill` tool.

### If verdict is TRIVIAL

Ask:
- Question: `"Run /peak-workflow:quick-fix now?"`
- Options: `["Run /peak-workflow:quick-fix now", "I'll run it manually"]`

On confirm, invoke:
```
Skill({ skill: "peak-workflow:quick-fix", args: "<args>" })
```

Constructing `<args>`:

- **If triage loaded a GitHub issue in Step 2** (i.e. `$ARGUMENTS` resolved to an issue number `<N>`), pass the **bare integer** as the args — e.g. `"137"`, not `"#137"`, not `"[issue #137] ..."`, not the title. `/quick-fix` Step 1 re-runs `gh issue view <N>` to fetch the canonical title and body; the integer is all it needs.
- **Otherwise** (free-text triage), pass the description verbatim with no prefix.

### If verdict is EPIC

Ask:
- Question: `"Run /peak-workflow:add now?"`
- Options: `["Run /peak-workflow:add now", "I'll run it manually"]`

On confirm, invoke:
```
Skill({ skill: "peak-workflow:add", args: "<args>" })
```

Constructing `<args>`:

- **If triage loaded a GitHub issue in Step 2** (i.e. `$ARGUMENTS` resolved to an issue number `<N>`), prefix the args with the issue-number marker so `/add` can carry the linkage forward:
  ```
  [issue #<N>] <title> — <key body points in 1–2 sentences>
  ```
  Example: `[issue #42] Add CSV export to supplier list — users need to hand the list to procurement; must respect current filters`
- **Otherwise** (free-text triage), pass the description verbatim with no prefix.

After `/add` completes, remind the user: the epic spec is written, but `/peak-workflow:start <id>` should be run in a **fresh session** for clean context.

### If verdict is HEAVY

Do **not** offer auto-dispatch. HEAVY skills run multi-step interviews and operate on a
`docs/` branch; they benefit from a clean context window. Instead, print:

```
Run the following in a fresh session on a docs/{task-short-name} branch:

1. /peak-workflow:discover      — update vision and ConOps if scope has changed
2. /peak-workflow:capture-requirements  — derive new TOR IDs from the updated vision/ConOps
3. /peak-workflow:plan-project  — derive new epics from the new TOR requirements

These skills operate on a docs/ branch. The branch merge (solo or team PR) is the approval
gate for the new requirements and plan baseline. A fresh session keeps their context clean.
```

## Step 6: Do Nothing Else

- Do **not** create any files.
- Do **not** run any git commands.
- Do **not** update `docs/implementation-plan/index.md`.
- Do **not** create a branch.

Triage is advisory only. If the user chose a manual path, simply end the session with the verdict printed.
