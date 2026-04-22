---
name: triage
description: |
  Advisory routing for an incoming GitHub issue or ad-hoc request — sizes the request against
  product vision and ConOps, then recommends one of HEAVY / EPIC / TRIVIAL. On user confirm,
  dispatches `/add` or `/quick-fix` in-session via the Skill tool; for HEAVY outcomes, prints
  the commands to run in a fresh session. Writes no state files.
  Use when a new request arrives (GitHub issue or free text) and you need to decide which
  path it belongs on before committing to full epic ceremony.
  Triggers on: "triage", "triage issue", "review this issue", "size this",
  "how should I approach", "is this an epic or a fix", "evaluate this request".
argument-hint: "<issue-number | free-text description>"
---

You are triaging a request to decide which workflow path it belongs on. This is an **advisory** skill — you do not write state files, you do not make git changes, you do not modify the implementation plan. Your output is a verdict plus an optional ask-and-dispatch.

The user's request: $ARGUMENTS

Follow these steps exactly:

## Step 1: Load Context

Read the following to build a picture of the project's current direction:

1. `CLAUDE.md` at the repo root — for project context and tech stack
2. `docs/product-vision-planning/product-vision.md` — the vision statement and in-scope/out-of-scope boundaries
3. `docs/product-vision-planning/concept-of-operations.md` — operational scenarios the product supports
4. `docs/implementation-plan/index.md` — to see what's already been planned or built

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
| **HEAVY** | The request changes what the product does (product vision) or how users operate it (ConOps). Examples: new user group, new top-level capability class, scope expansion, strategy pivot. |
| **EPIC** | A new user-facing capability that fits inside the existing vision/ConOps — separately testable, roughly one session of work, needs a spec with acceptance criteria and verification. |
| **TRIVIAL** | Bug fix, copy change, small enhancement, or one-liner — roughly two hours or less, does not warrant a full spec. |

**Cross-layer override (applies to TRIVIAL candidates only):** If accepting the request requires updating more than one independently-owned layer (e.g., frontend + domain logic + integration + tests), apply EPIC regardless of how small any single layer's change appears. A sparse issue body can hide a cascade — before committing to TRIVIAL, briefly consider whether the change ripples through domain models, integration layers, or cross-cutting test fixtures. When in doubt, pick EPIC; a too-small spec is cheap, a missing spec is not.

Cite the vision section or ConOps scenario step the request lines up against (or diverges from) to justify the verdict. One to two sentences is enough.

## Step 4: Present the Verdict

Output this block:

```
## Triage Verdict: <HEAVY | EPIC | TRIVIAL>

**Request:** <title or short summary>

**Rationale:** <1–2 sentences citing vision/ConOps>

**Recommended next command:** <the exact slash command to run>
```

Do **not** recommend or hint at a ship mode (solo vs team). That choice belongs to the user at ship time and will be asked explicitly by `/quick-fix` or `/wrapup`.

## Step 5: Ask and Dispatch

Use `AskUserQuestion` to offer the appropriate next step, then — if the user confirms — dispatch the next skill via the `Skill` tool.

### If verdict is TRIVIAL

Ask:
- Question: `"Run /epic-workflow:quick-fix now?"`
- Options: `["Run /epic-workflow:quick-fix now", "I'll run it manually"]`

On confirm, invoke:
```
Skill({ skill: "epic-workflow:quick-fix", args: "<args>" })
```

Constructing `<args>`:

- **If triage loaded a GitHub issue in Step 2** (i.e. `$ARGUMENTS` resolved to an issue number `<N>`), pass the **bare integer** as the args — e.g. `"137"`, not `"#137"`, not `"[issue #137] ..."`, not the title. `/quick-fix` Step 1 re-runs `gh issue view <N>` to fetch the canonical title and body; the integer is all it needs.
- **Otherwise** (free-text triage), pass the description verbatim with no prefix.

### If verdict is EPIC

Ask:
- Question: `"Run /epic-workflow:add now?"`
- Options: `["Run /epic-workflow:add now", "I'll run it manually"]`

On confirm, invoke:
```
Skill({ skill: "epic-workflow:add", args: "<args>" })
```

Constructing `<args>`:

- **If triage loaded a GitHub issue in Step 2** (i.e. `$ARGUMENTS` resolved to an issue number `<N>`), prefix the args with the issue-number marker so `/add` can carry the linkage forward:
  ```
  [issue #<N>] <title> — <key body points in 1–2 sentences>
  ```
  Example: `[issue #42] Add CSV export to supplier list — users need to hand the list to procurement; must respect current filters`
- **Otherwise** (free-text triage), pass the description verbatim with no prefix.

After `/add` completes, remind the user: the epic spec is written, but `/epic-workflow:start <id>` should be run in a **fresh session** for clean context.

### If verdict is HEAVY

Do **not** offer auto-dispatch. Heavy skills (`/discover`, `/plan-project`) run multi-step interviews and benefit from a clean context window. Instead, print:

```
Run the following in a fresh session:

1. /epic-workflow:discover
2. /epic-workflow:plan-project

These skills conduct multi-step interviews and negotiation; a fresh session keeps
their context clean and avoids bleed-through from this triage session.
```

## Step 6: Do Nothing Else

- Do **not** create any files.
- Do **not** run any git commands.
- Do **not** update `docs/implementation-plan/index.md`.
- Do **not** create a branch.

Triage is advisory only. If the user chose a manual path, simply end the session with the verdict printed.
