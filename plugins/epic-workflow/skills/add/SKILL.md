---
name: add
description: |
  Adds new epic(s) to the implementation plan from natural language description.
  Use when the user wants to add a single epic or small batch without re-running full planning.
  Triggers on: "add epic", "new epic", "create epic", "I need to add more work",
  "there's a new feature we need", "can we squeeze in", "add a feature",
  "another thing we need to build".
argument-hint: "<description of what the epic should accomplish>"
---

You are adding one or more new epics to the implementation plan based on the user's description.

The user's request: $ARGUMENTS

## Layout Guard

**Before any other action:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/epic-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

Follow these steps exactly:

## Step 1: Load Context

1. Read `CLAUDE.md` at the repo root for project context
2. Read the phase indexes: glob `docs/implementation-plan/phase-*/index.md` and read each file to understand the existing epic structure, phase names, and existing epic IDs.
3. Read `docs/architecture.md` for system context

## Step 2: Resolve the Request

### 2.0: Check for an issue-number prefix

If `$ARGUMENTS` starts with the pattern `[issue #<N>]` (e.g. `[issue #42] Add CSV export — …`), extract the integer `<N>` and strip the prefix from the remaining description:

1. Capture the number: this is the **source issue number** and must be remembered for Step 6 (spec `Source:` line).
2. Run `gh issue view <N> --json title,body,labels` to fetch the canonical title and body, and use them to augment the stripped description — the prefix-bearing description from `/triage` is a summary, not the full issue.
3. If `gh` is unavailable or the issue cannot be fetched, fall back to the stripped description alone and still record the number for the `Source:` line.

If no `[issue #<N>]` prefix is present, the source issue number is unknown — skip the fetch and leave the `Source:` line out of the spec in Step 6.

### 2.1: Interpret the description

Interpret the (now prefix-free) description. It may be:
- A full description of what the epic should accomplish
- A reference to something discussed earlier in the conversation (e.g., "the outstanding items", "what we just talked about") — scan conversation history to expand these into concrete requirements
- A request for multiple epics — detect plural intent ("add both as separate epics", "split this into two")
- Minimal or ambiguous — ask one round of clarifying questions before proceeding

**Assign the epic ID:** generate a fresh **7-character random alphanumeric ID** for each new epic via:

```bash
LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7
```

The `LC_ALL=C` prefix is required for portability — without it, BSD `tr` (macOS) can emit "Illegal byte sequence" on non-UTF8 bytes from `/dev/urandom`.

Validate each ID: if the 7-char string contains only digits, regenerate (this prevents ambiguity with the legacy integer format). If adding multiple epics in a single invocation, ensure uniqueness across the batch.

If the user tried to specify an ID or number up front (e.g., "as Epic 6.6"), politely override:

> Epic IDs are now auto-generated random 7-character strings; this new epic will be `<generated-id>`. The phase you chose will be honored.

Do not attempt to slot new epics into the old decimal scheme (e.g., `6.7`, `6.8`). With random IDs, there's no "insert between X and Y" concept — epics are appended at the bottom of their phase block in the index.

## Step 3: Determine Dependencies

From the user's description and the existing phase indexes, determine:
- Which existing epics this new epic depends on
- Whether any existing epics should be noted as depending on this one (update the graph if so)

If dependencies are ambiguous, ask the user.

## Step 4: Read Existing Epics for Context

1. Read 1-2 completed or well-defined epic specs from the same phase to match the level of detail, tone, and specificity. These are the quality bar — the new epic must be at least as detailed.
2. Identify which phase directory the new epic belongs in based on the dependency and the existing phase structure in the phase indexes.

## Step 5: Explore Relevant Codebase

If the epic modifies or extends existing features (not greenfield), explore the relevant source files to understand:
- Current component structure, props, and state management
- Existing patterns that the epic should follow or extend
- File paths to reference in the Key Components section

Use this understanding to write acceptance criteria that reference real files, real components, and real state — not vague placeholders. This is what separates a useful spec from a generic one.

Skip this step only if the epic is entirely greenfield with no connection to existing code.

## Step 6: Write the Epic Spec(s)

Create the epic spec file(s) following the **required structure** below. The other epic commands (`/epic-workflow:start`, `/epic-workflow:wrapup`) depend on this exact format.

### File Location

`docs/implementation-plan/{phase-directory}/epic-{id}-{kebab-case-name}.md` (where `{id}` is the 7-char alphanumeric ID generated in Step 2)

The phase directory must match an existing `phase-N-name/` directory in the implementation plan. If the epic belongs to a new phase, ask the user to confirm before creating it.

### Required File Structure

```markdown
# Epic {id}: {Name}

**Phase:** {N} — {Phase Name}
**Status:** Not Started
**Dependencies:** Epic {id1} ({short description}), Epic {id2} ({short description})
**Source:** Issue #{N}

> **Brand:** Use the project's brand guidelines skill for {relevant UI elements} if one is configured.

---

## Description

{2-4 sentences. What is being built and why. Reference the motivation if it came from a verification finding, user request, or architectural need.}

## Vision & Scenario Anchors

> Readers of this epic (`/epic-workflow:start`, `/epic-workflow:wrapup`, and the independent reviewer) will read the paraphrases below first, then spot-check them against the cited source sections. If a paraphrase conflicts with its source, neither text is automatically authoritative — stop and ask the user which reflects current intent.

### Vision anchors
- `docs/product-vision-planning/product-vision.md` § {section number/title} — {1–2 sentence paraphrase of why this epic serves the vision}
- {repeat for each cited vision section}

### Scenario anchors
- `docs/product-vision-planning/concept-of-operations.md` § {scenario id or section, e.g. "S1 step 3"} — {1–2 sentence paraphrase of the user intent this epic serves}
- {repeat for each cited scenario step}

## At Completion, a User Can

{3-6 bullet points written from the end-user's perspective. Each starts with a verb. These describe observable behaviors, not implementation details.}

## Acceptance Criteria

{Checkboxes (`- [ ]`) for every discrete requirement. Group under subheadings (### Backend, ### Frontend) if the epic spans layers. Each criterion must be independently verifiable.

Write criteria that are specific and testable — include expected values, column names, component behaviors, thresholds, and error cases. Vague criteria like "works correctly" are not acceptable.}

## Verification

{Checkboxes for concrete test scenarios. Each describes a user action and expected observable result. These are what `/epic-workflow:wrapup` will check.

Always include:
- Build check (read CLAUDE.md for the project's build command)
- Zero console errors (if frontend)
- Brand audit (if UI work)
- Relevant behavioral scenarios with specific test data}

## Key Components

{List of file paths that will be created or modified, with a brief description of each. Use the project's actual directory structure. Separate into ### Backend and ### Frontend subheadings if both are involved.}
```

**Conditional lines in the header template above** — do not carry this guidance into the written spec:

- Include the **Brand** note only if the epic involves UI work. Omit it entirely otherwise.
- Include the `**Source:** Issue #{N}` line only when a source issue number is known — i.e., `$ARGUMENTS` arrived with an `[issue #<N>]` prefix in Step 2.0. Omit the line entirely otherwise; existing specs without it continue to work.

**Populating the Vision & Scenario Anchors section:**

- Open `docs/product-vision-planning/product-vision.md` and `docs/product-vision-planning/concept-of-operations.md` (if they exist — greenfield projects may not have them yet). For each anchor you add:
  - Cite the **specific** section or scenario step, not the whole document. Use the section heading text or scenario step number so a reader can jump directly there.
  - Write the paraphrase in your own words — do not copy-paste the source. The paraphrase should express *why this epic serves that part of the vision/scenario* in plain language. Two sentences max per bullet.
- If the project has no vision or ConOps docs (greenfield without `/discover`), write a single note in each subsection: `_No vision document exists yet — anchors will be populated when_ `/epic-workflow:discover` _is run._` Do not omit the section; a future reader should still see it.
- The note at the top of the section is part of the template and must be written into every spec verbatim — it is what drives `/start` and `/wrapup`'s conflict-surfacing behavior when the paraphrase and source drift.

### Quality Checks Before Writing

Before writing each spec, verify:
- [ ] Every acceptance criterion is specific enough that a different engineer could verify it without ambiguity
- [ ] Verification items describe observable outcomes, not implementation steps
- [ ] Key Components reference real directories and follow the project's naming conventions
- [ ] The Description explains *why*, not just *what*
- [ ] Dependencies are accurate — the epic's prereqs are correct and nothing circular is introduced

## Step 7: Update Phase Index and Create Status Sidecar

1. **Phase index** — append a row for the new epic at the **bottom** of `docs/implementation-plan/{phase-dir}/index.md`. Use the format:
   ```
   | {id} | [{Name}](epic-{id}-{kebab-name}.md) | {dep-id-1}, {dep-id-2} |
   ```
   Use `—` in the Dependencies column if the epic has no dependencies. Use the epic ID verbatim (7-char alphanumeric or legacy integer).

2. **Status sidecar** — create `docs/implementation-plan/status/epic-{id}.md` with exactly these four lines:
   ```
   status: Not Started
   implemented: —
   completed: —
   handoff: —
   ```
   Create the `docs/implementation-plan/status/` directory if it does not already exist.

## Step 8: Self-Check — Trace Inputs to Outputs

Before presenting the summary, run an explicit post-write self-check. The pre-write "Quality Checks" in Step 6 ask "does the spec look reasonable on its own." This self-check asks the different and more important question: **did every input requirement actually land in the output, explicitly and unambiguously?**

### 8.1: Enumerate Inputs

List every discrete requirement or intent signal that drove this invocation. Sources and examples:

- **User description** (`$ARGUMENTS` after Step 2.0 prefix stripping) — each distinct behavior, constraint, or deliverable the user named. Include follow-up clarifications from Step 2.1's clarifying round if any were asked.
- **GitHub issue body** (if Step 2.0 fetched one) — each acceptance hint, reproduction step, constraint, or explicit user story in the issue body and its top-level comments. Do not skip items merely because they weren't phrased as requirements; an issue reporter's "and also the header is wrong" is an input.
- **Vision/ConOps touchpoints** — the specific vision section(s) and ConOps scenario step(s) this epic serves (these feed the Anchors section from Step 6 and must be consistent with it).
- **Dependency signals** — prerequisite epics identified in Step 3.

One input per row. Be granular: if the user said "CSV export with filter awareness, and a spinner while it runs," that's two inputs, not one.

### 8.2: Build the Trace Table

Print the table to the user verbatim — it is part of the Step 9 summary, not internal scratch:

```
## Self-Check: Input → Output Trace

| # | Input (source:reference) | Captured in Output (spec section:line) | Explicit? (Y/N) | Ambiguous? (Y/N) |
|---|--------------------------|----------------------------------------|-----------------|-------------------|
| 1 | User description: "CSV export respects current filters" | Acceptance Criteria § Frontend, item 2 | Y | N |
| 2 | Issue #42 body: "show a spinner during export" | Acceptance Criteria § Frontend, item 4 | Y | N |
| 3 | ConOps S3.4: "procurement receives the list within 10 seconds" | Verification, item 3 | Y | N |
| 4 | User description: "works for big lists" | (not captured) | N | Y |
```

Rules for the last two columns:

- **Explicit? N** — the input is not captured in any output section. Gap.
- **Ambiguous? Y** — the input is captured but in language so vague a different engineer could reasonably interpret it multiple ways ("works for big lists," "handles errors gracefully," "is fast"). Gap.

Both columns must be `Y` / `N` respectively for the row to pass. Anything else is a gap.

### 8.3: Remediate and Re-Run

For every gap (row with `Explicit? N` or `Ambiguous? Y`):

1. Edit the epic spec in place — add a new acceptance criterion, tighten vague wording with specific thresholds/values/behaviors, or (if the input is genuinely out of scope) strike the row from the table and note "Out of scope for this epic — tracked separately" in the `Captured in Output` column with a one-line rationale.
2. Re-run the table. Iterate until every row shows `Explicit? Y` and `Ambiguous? N`, or has an explicit out-of-scope justification.

Do not present the summary with unresolved gaps.

### 8.4: Keep the Final Table

The final passing table is printed as part of Step 9 summary — both so the user can audit, and so future sessions (and reviewers) can see what this epic was intended to cover.

## Step 9: Present Summary

Show the user what was created:

```
## Added Epic(s)

### Epic {id}: {Name}
- **File:** `docs/implementation-plan/{path}`
- **Phase:** {N} — {Name}
- **Dependencies:** {list}
- **Sections:** {count} acceptance criteria, {count} verification items

{Repeat for each epic if multiple were created}

### Plan Updated
- 1 row appended to `docs/implementation-plan/{phase-dir}/index.md`
- `docs/implementation-plan/status/epic-{id}.md` created (status: Not Started)

### Self-Check
- {count} inputs traced to outputs, all Explicit=Y and Ambiguous=N (see Step 8 trace table above)
- Out-of-scope items explicitly struck: {list, or "none"}

### Ready to implement
Run `/epic-workflow:start {id}` when ready to begin (in a fresh session for clean context).
```

Do NOT commit — leave that for the user to decide.
