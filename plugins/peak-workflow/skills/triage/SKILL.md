---
name: triage
description: |
  Advisory routing for an incoming GitHub issue or ad-hoc request — sizes the request against
  the TOR requirements baseline, product vision, and ConOps, then recommends one of
  HEAVY / AMEND / EPIC / TRIVIAL. On user confirm, dispatches `/add`, `/quick-fix`, or (for a
  change to one existing requirement) `/capture-requirements <TOR-ID>` in-session via the Skill
  tool; for HEAVY outcomes, prints the commands to run in a fresh session.
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

## Format Guard

**Before any other action:** run `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" format`.
On exit 0 (`verdict: current`, or `new` for a project with no peak-workflow files yet), continue.
On `verdict: behind`, print its message as a banner above everything else and continue in
degraded mode: size and route the request as usual, but skip the Step 3.1 health check and
re-litigation search (they read only the current format) and say so under the banner, and do
not dispatch any skill (every writing skill stops on a project that is behind) — print the
commands to run after `/peak-workflow:upgrade` instead. On any other exit, print its output and stop — it
names the fix (a plugin update or a Python install).

---

Follow these steps exactly:

## Step 1: Load Context

Read the following to build a picture of the project's current direction:

1. `CLAUDE.md` at the repo root — for project context and tech stack.
2. `docs/product-vision-planning/product-vision.md` — the vision statement and in-scope/out-of-scope boundaries.
3. `docs/product-vision-planning/concept-of-operations.md` — operational scenarios the product supports.
4. The phase indexes under `docs/implementation-plan/phase-*/index.md` — read them to see what phases and epics exist in the plan. Supplement with spot-checks of `docs/implementation-plan/status/epic-*.md` sidecars if you need status counts.
5. **TOR requirements baseline.** Glob `docs/requirements/*.feature.md` and read the Scenarios
   (IDs, titles, steps). Also check which TOR IDs are already in epic sidecars'
   `requirements:` fields to identify "already planned" vs. "unplanned" TOR IDs. A requirement
   under a `# Safety` banner is a **Safety requirement**. Whenever this skill prints a title, it
   comes from `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" titles <ids>` — never retyped or
   paraphrased.

If any of these are missing or placeholders, note it and continue — the triage rubric below can still be applied on whatever context you have.

## Step 2: Load the Request

Interpret `$ARGUMENTS`:

- If `$ARGUMENTS` parses as an integer (e.g., `42`) or starts with `#` (e.g., `#42`), treat it as a GitHub issue number. Run `gh issue view <N> --json title,body,labels,author,state` and use the result as the request content. If `gh` is not available or the issue cannot be fetched, fall back to treating the argument as free text and inform the user.
- Otherwise, treat `$ARGUMENTS` as a free-text description of the request.

Capture the request's title (for issues) and a short summary that you can use throughout the triage output.

## Step 3: Size the Request

### 3.1: Health and history

Skip this sub-step in degraded mode (Format Guard). Otherwise run, with
`sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle"` as `tor-lifecycle`:

1. `tor-lifecycle check --json` — warnings only; triage never blocks. Keep the findings that name
   a requirement the request touches: **A** (edited without a change record, with the commit),
   **D** (changed since verified, with its owning epic), **F `disputed`** (known to be wrong,
   with its record and age), and **E** (a retired or superseded ID still cited).
2. `tor-lifecycle search -- <2–4 key nouns or quoted phrases of the request>` — the re-litigation
   check. Exit 1 lists Change Records that retired, superseded, or recorded the idea as pending.

Both feed the verdict (3.3) and the `**Requirement health:**` line (Step 4).

### 3.2: A change to an existing requirement

When the request changes what an existing requirement says (not just the code behind it), name
the requirement and decide what kind of change it is:

- **Meaning change** — there is a plausible implementation that passes a faithful test of the
  current Given/When/Then and fails the changed one, or the reverse: any added, removed, or
  changed actor, precondition, input, action, outcome, number, limit, literal string, or scope
  word ("all", "only", "never", "at most", "exactly"). When unsure, it is a meaning change.
- **Reword** — the same behavior in other words; no citing test would change.

Both are amendments, not new requirements. Route them in 3.3.

### 3.3: Verdict

Apply this rubric — pick exactly one verdict:

| Verdict | Criteria |
|---------|----------|
| **HEAVY** | The request requires **new TOR requirements**, or changes the product vision or ConOps — new feature files, new capabilities, or changes that invalidate several existing requirements at once. Examples: new user group, new top-level capability class, scope expansion, withdrawing a capability, strategy pivot, new functional area with no existing TOR IDs. HEAVY work goes through `discover → capture-requirements → plan-project` on a `docs/` branch. |
| **AMEND** | The request changes **one existing requirement** (3.2) — a meaning change or a reword — with **no impact on the vision or ConOps**: no goal, scenario, role, or scope boundary changes (a vision or ConOps line that merely states the detail being changed — a number, a sort key — is rewritten by capture-requirements and is not an impact). Not when the owner wants it shipped with a small code fix to a built requirement (TRIVIAL's amendment path). Goes through `/peak-workflow:capture-requirements <TOR-ID> <description>`, which writes the Change Record on its own `docs/` branch and offers `/add` for a successor. |
| **EPIC** | The request can be fully expressed using **existing TOR IDs** — either: (a) there are unplanned TOR IDs that cover this capability and they need to be grouped into an epic for implementation, or (b) the request implements a well-defined set of already-approved TOR requirements. No new requirements are needed. Needs an epic spec via `/peak-workflow:add`. |
| **TRIVIAL** | A bug fix, copy change, or small correction to an **already-implemented TOR** where the TOR requirement itself is correct and the implementation just needs to be fixed. The requirement doesn't change — only the code does. Roughly two hours or less; does not warrant a full epic spec. Goes through `/peak-workflow:quick-fix`. |

**TOR-awareness check (applies before finalizing any verdict):**
- If the request adds new user behavior not covered by any existing TOR ID → **HEAVY** (needs requirements capture).
- If the request implements existing but unplanned TOR IDs → **EPIC**.
- If the request fixes broken implementation of a correctly-specified TOR → **TRIVIAL**.
- If the request changes one existing TOR's Given/When/Then (3.2) and the vision and ConOps
  still hold → **AMEND**. If it changes the vision or ConOps, or several requirements across
  capabilities → **HEAVY**.
- **Amendment with a small code fix** — the requirement's owning epic is Complete (or it has
  none but the code exists), the owner approves changing it, and the code change is about two
  hours or less → **TRIVIAL**, routed to quick-fix's **amendment path** (the requirement change
  and the code ship together on the `hotfix/` branch). When the owning epic is Implemented, the
  change belongs to its wrapup: recommend `/peak-workflow:wrapup-epic <epic-id>` (fresh session),
  whose Step 1.4b can amend the requirement. When it is Not Started, In Progress, or Paused →
  **AMEND**: that epic builds the successor. Never for a Safety requirement: a Safety requirement
  changes only on a `docs/` branch → **AMEND**.
- **Request on a requirement edited after verification** (finding D or A) — this rule takes
  precedence over the AMEND row's exclusion and the amendment path. Compare the request
  with both texts (`tor-lifecycle text <TOR-ID> --verified`, and the current block):
  - It asks for what the **verified** text said → the unrecorded edit is what is wrong →
    **AMEND** (`/peak-workflow:capture-requirements <TOR-ID> <description>` offers to restore the
    verified text). If the code also follows the edit, say so: a quick-fix follows once the
    restore merges.
  - It asks for what the **current** text says (the edit was intended) → **AMEND**
    (`/peak-workflow:capture-requirements <TOR-ID> <description>` records it as a supersede, or a
    reword with evidence).
  - It disagrees with both → a bug against the current text, but the text itself is unproven:
    recommend the reverify first (`/peak-workflow:wrapup-epic <epic-id> reverify <TOR-ID>`, fresh
    session), then quick-fix if the requirement holds and the code fails it.
- **Request touching a Disputed requirement** (finding F `disputed`) — the requirement is
  already known to be wrong. Recommend resolving it first:
  `/peak-workflow:capture-requirements <TOR-ID> <description>` (**AMEND**) — which can also
  uphold it when the request shows the requirement is right and the code is what fails.
- **Re-litigation hit** (3.1 step 2) — the idea was decided against before. Name the record,
  its date, and its reason in the Rationale; the verdict stands, and the user decides whether to
  reopen it.

**Cross-layer override (applies to TRIVIAL candidates only):** If accepting the request requires updating more than one independently-owned layer (e.g., frontend + domain logic + integration + tests), apply EPIC regardless of how small any single layer's change appears. A sparse issue body can hide a cascade. When in doubt, pick EPIC.

Cite the TOR ID(s) the request lines up against (or diverges from) to justify the verdict. One to two sentences is enough.

## Step 4: Present the Verdict

Output this block:

```
## Triage Verdict: <HEAVY | AMEND | EPIC | TRIVIAL>

**Request:** <title or short summary>

**Rationale:** <1–2 sentences citing relevant TOR IDs and/or vision/ConOps — explain specifically why this verdict applies: does the request require new TOR IDs (HEAVY), change one existing requirement (AMEND), implement existing TOR IDs (EPIC), or fix the implementation of an existing TOR (TRIVIAL)?>

**Relevant requirements:** <one line per TOR ID: `TOR-… — <title from tor-lifecycle titles>`, or "None found — new requirements needed" for HEAVY>

**Requirement health:** <omit when 3.1 found nothing relevant; otherwise one line each: `TOR-… edited without a change record (commit <sha of the edit: git log -1 --format=%h -- <feature file>>)`, `TOR-… changed since epic <id> verified it`, `TOR-… is disputed (<CR-ID>, <N> days)`, `<idea> was <retired / superseded / recorded as pending> in <CR-ID> (<date>): <reason>`>

**Recommended next command:** <the exact slash command to run — for the reverify-first case, the reverify command, then "then" and the quick-fix command>
```

Do **not** recommend or hint at a ship mode (solo vs team). That choice belongs to the user at ship time and will be asked explicitly by `/peak-workflow:quick-fix` or `/peak-workflow:wrapup-epic`.

## Step 5: Ask and Dispatch

Use `AskUserQuestion` to offer the appropriate next step, then — if the user confirms — dispatch the next skill via the `Skill` tool.

### If verdict is TRIVIAL

For a bug on a requirement edited after verification (the reverify-first case), do not ask —
print the reverify command for a fresh session, then the quick-fix command, and stop.

Otherwise ask:
- Question: `"Run /peak-workflow:quick-fix now?"`
- Options: `["Run /peak-workflow:quick-fix now", "I'll run it manually"]`

On confirm, invoke:
```
Skill({ skill: "peak-workflow:quick-fix", args: "<args>" })
```

Constructing `<args>`:

- **If triage loaded a GitHub issue in Step 2** (i.e. `$ARGUMENTS` resolved to an issue number `<N>`), pass the **bare integer** as the args — e.g. `"137"`, not `"#137"`, not `"[issue #137] ..."`, not the title. `/quick-fix` Step 1 re-runs `gh issue view <N>` to fetch the canonical title and body; the integer is all it needs.
- **Otherwise** (free-text triage), pass the description verbatim with no prefix.
- **Amendment path** (TOR-awareness check — an owner-approved requirement change with a small
  code fix): append ` — amends <TOR-ID> (owner-approved)` to the args, so `/quick-fix` takes its
  amendment path and writes the Change Record with the code.

### If verdict is AMEND

Ask:
- Question: `"Run /peak-workflow:capture-requirements <TOR-ID> now? It creates a docs/ branch and writes the Change Record."`
- Options: `["Run /peak-workflow:capture-requirements now", "I'll run it manually"]`

On confirm, invoke:
```
Skill({ skill: "peak-workflow:capture-requirements", args: "<TOR-ID> <description>" })
```

`<description>` is the requested change in one or two sentences (for a GitHub issue, prefix
`[issue #<N>] `). It needs a clean working tree on the base branch or a `docs/` branch; if
`git status --porcelain` is not empty, say so and print the command instead of dispatching.

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

After `/add` completes, remind the user: the epic spec is written, but `/peak-workflow:start-epic <id>` should be run in a **fresh session** for clean context.

### If verdict is HEAVY

Do **not** offer auto-dispatch. HEAVY skills run multi-step interviews and operate on a
`docs/` branch; they benefit from a clean context window. Instead, print:

```
Run the following in a fresh session from your base branch (develop / main / master).
/peak-workflow:discover creates the docs/ branch automatically — do not create it manually first.

1. /peak-workflow:discover "<request summary>"  — update vision and ConOps; creates docs/ branch
2. /peak-workflow:mockup                        — (UI projects — skip for CLI / Service / Library / Embedded) screen inventory, flows, wireframes; concretizes ConOps steps
3. /peak-workflow:capture-requirements          — derive new TOR IDs from updated vision/ConOps
4. /peak-workflow:plan-project                  — derive new epics from the new TOR requirements

The branch merge (solo or team PR) is the approval gate for the new requirements and plan
baseline. A fresh session keeps their context clean.
```

Substitute `<request summary>` with a 1-sentence description of the triaged request (derived
from `$ARGUMENTS` or the GitHub issue title). Passing it as an argument to `/peak-workflow:discover`
lets the brownfield interview pre-seed its delta analysis rather than starting from a blank slate.

## Step 6: Do Nothing Else

- Do **not** create any files.
- Do **not** run any git command that changes anything (the read-only `tor-lifecycle` commands
  above are fine).
- Do **not** update `docs/implementation-plan/index.md`.
- Do **not** create a branch.

Triage is advisory only. If the user chose a manual path, simply end the session with the verdict printed.
