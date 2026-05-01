---
name: add
description: |
  Adds new epic(s) to the implementation plan from a natural language description.
  Epics reference TOR requirement IDs from docs/requirements/*.feature.md as their Requirements
  Anchors — the TOR ID is the acceptance criterion and the Given/When/Then is the verification.
  Use when the user wants to add a single epic or small batch without re-running full planning.
  Triggers on: "add epic", "new epic", "create epic", "I need to add more work",
  "there's a new feature we need", "can we squeeze in", "add a feature",
  "another thing we need to build".
argument-hint: "<description of what the epic should accomplish>"
---

You are adding one or more new epics to the implementation plan based on the user's description.
Each epic's acceptance criteria are expressed as TOR requirement IDs from the requirements
baseline — not prose checkboxes.

The user's request: $ARGUMENTS

## Layout Guard

**Before any other action:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/peak-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

Follow these steps exactly:

## Step 1: Load Context

1. Read `CLAUDE.md` at the repo root for project context.
2. Read the phase indexes: glob `docs/implementation-plan/phase-*/index.md` and read each file to understand the existing epic structure, phase names, and existing epic IDs.
3. Read `docs/architecture.md` for system context.
4. **Load TOR requirements baseline.** Glob `docs/requirements/*.feature.md`. For each file, parse every `Scenario: [TOR-NN-XXXXXXX]` block: capture the TOR ID, scenario title, feature file path, and Given/When/Then. Also note which TOR IDs are already in existing epic sidecars' `requirements:` fields (glob `docs/implementation-plan/status/epic-*.md`, read each `requirements:` line).
   If `docs/requirements/` is empty or missing, stop:
   > The requirements baseline is empty. Run `/peak-workflow:capture-requirements` first to
   > establish TOR requirements before adding epics. Epics reference TOR IDs as their acceptance
   > criteria — without a requirements baseline, there are no acceptance criteria to reference.

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

### 2.2: Identify Covering TOR IDs

Based on the description, identify which TOR IDs from the requirements baseline this epic will implement. Present the candidates to the user:

```
## TOR Requirements Relevant to This Epic

Based on your description, these TOR IDs appear relevant:

| TOR ID | Feature File | Scenario Title |
|--------|--------------|----------------|
| TOR-01-Afs657G | 01-cli.feature.md | The tool shall report its part number and version... |
| TOR-02-Xyz5678 | 02-auth.feature.md | The tool shall reject requests with invalid tokens... |
| ...    | ...          | ...            |

**Unplanned TOR IDs (not yet in any epic):** [N]
**Already-planned TOR IDs included above:** [N] — include if this epic extends existing coverage
```

Use `AskUserQuestion`:
- Question: `"Which TOR IDs should this epic cover? Confirm the list above, add others, or remove any that don't apply."`
- Options: `["Confirmed — use the list above", "I'll specify — list TOR IDs to add or remove"]`

If the user confirms the list, use it. If the user specifies additions or removals, update accordingly.

**If no existing TOR IDs match the description:** inform the user:
> No existing TOR requirements match this description. To add new requirements, run
> `/peak-workflow:capture-requirements` (brownfield mode) on a `docs/{task-short-name}` branch
> to derive and approve new TOR IDs, then re-run `/peak-workflow:add`.

Wait for the user's answer. The confirmed TOR ID set is the Requirements Anchors list for this epic.

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

Create the epic spec file(s) following the **required structure** below. `/peak-workflow:start` and `/peak-workflow:wrapup` depend on this exact format — particularly the Requirements Anchors table.

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

{2-4 sentences. What is being built and why. Reference the functional areas and TOR requirements
this epic addresses. Explain the motivation — user request, architectural need, or gap in
coverage.}

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file.
> `/peak-workflow:start` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup` independently verifies each TOR's Given/When/Then is satisfied.
> If a feature file has been updated since this spec was written and a scenario no longer matches
> its cited TOR ID, stop and surface the discrepancy to the user before proceeding — do not
> silently implement against stale requirements.

| TOR ID | Feature File | Scenario Title |
|--------|--------------|----------------|
| TOR-{NN}-{XXXXXXX} | `docs/requirements/{NN}-{name}.feature.md` | {Scenario title verbatim from the feature file} |
| TOR-{NN}-{XXXXXXX} | `docs/requirements/{NN}-{name}.feature.md` | {Scenario title verbatim from the feature file} |

## Key Components

{List of file paths that will be created or modified, with a brief description of each. Use the
project's actual directory structure. Separate into ### Backend and ### Frontend subheadings if
both are involved.}
```

**Conditional lines in the header template above** — do not carry this guidance into the written spec:

- Include the **Brand** note only if the epic involves UI work. Omit it entirely otherwise.
- Include the `**Source:** Issue #{N}` line only when a source issue number is known — i.e., `$ARGUMENTS` arrived with an `[issue #<N>]` prefix in Step 2.0. Omit the line entirely otherwise.

**Populating Requirements Anchors:**

Use the confirmed TOR ID set from Step 2.2:
- Copy each TOR ID verbatim.
- Set Feature File to the relative path from the repo root (e.g., `docs/requirements/01-cli.feature.md`).
- Copy the Scenario Title verbatim from the `Scenario: [TOR-NN-XXXXXXX] {title}` line in the feature file.

Do not paraphrase or summarize TOR IDs — verbatim accuracy is required for downstream skills
(`start` and `wrapup`) to locate the scenario in the feature file.

### Quality Checks Before Writing

Before writing each spec, verify:
- [ ] Every TOR ID in Requirements Anchors exists in the cited feature file with an exact ID match
- [ ] Scenario titles are copied verbatim from the feature file
- [ ] Feature file paths are correct relative paths from the repo root
- [ ] Key Components reference real directories and follow the project's naming conventions
- [ ] The Description explains *why*, not just *what*
- [ ] Dependencies are accurate — no circular references introduced

## Step 7: Update Phase Index and Create Status Sidecar

1. **Phase index** — append a row for the new epic at the **bottom** of `docs/implementation-plan/{phase-dir}/index.md`. Use the format:
   ```
   | {id} | [{Name}](epic-{id}-{kebab-name}.md) | {dep-id-1}, {dep-id-2} |
   ```
   Use `—` in the Dependencies column if the epic has no dependencies. Use the epic ID verbatim (7-char alphanumeric or legacy integer).

2. **Status sidecar** — create `docs/implementation-plan/status/epic-{id}.md` with exactly these five lines:
   ```
   status: Not Started
   implemented: —
   completed: —
   handoff: —
   requirements: TOR-{NN}-{XXXXXXX}, TOR-{NN}-{XXXXXXX}
   ```
   The `requirements:` field lists every TOR ID from the epic's Requirements Anchors table
   (comma-separated, verbatim). This field is how `/peak-workflow:status` computes requirements
   coverage. For epics with no TOR IDs (rare — utility epics with no direct user-facing
   requirement), use `requirements: —`.
   Create the `docs/implementation-plan/status/` directory if it does not already exist.

## Step 8: Self-Check — Trace Inputs to Outputs

Before presenting the summary, run an explicit post-write self-check. The pre-write "Quality
Checks" in Step 6 ask "does the spec look reasonable on its own." This self-check asks the more
important cross-cutting question: **did every input — including each selected TOR ID — land in
the output explicitly and unambiguously?**

### 8.1: Enumerate Inputs

List every discrete requirement or intent signal that drove this invocation. Sources:

- **Selected TOR IDs** (from Step 2.2) — every TOR ID the user confirmed for this epic.
- **User description** (`$ARGUMENTS` after Step 2.0 prefix stripping) — each distinct behavior,
  constraint, or deliverable named. Include follow-up clarifications.
- **GitHub issue body** (if Step 2.0 fetched one) — each acceptance hint, constraint, or user
  story. Do not skip items merely because they weren't phrased as requirements.
- **Dependency signals** — prerequisite epics identified in Step 3.

One input per row. A TOR ID is a single row. A user description with two distinct behaviors is
two rows.

### 8.2: Build the Trace Table

Print the table verbatim — it is part of the Step 9 summary.

```
## Self-Check: Input → Output Trace

| # | Input (source:reference) | Captured in Output (spec section) | Explicit? (Y/N) | Ambiguous? (Y/N) |
|---|--------------------------|-----------------------------------|-----------------|-------------------|
| 1 | TOR-01-Afs657G: "tool shall report version to stdout" | Requirements Anchors, row 1 | Y | N |
| 2 | TOR-01-Bcd2345: "tool shall accept --help flag" | Requirements Anchors, row 2 | Y | N |
| 3 | User description: "must work on Windows and Linux" | Key Components (note on portability) | Y | N |
| 4 | Issue #42 body: "also validate the exit code" | (not captured) | N | — |
```

Rules:
- **Explicit? N** — not captured in any output section. Gap.
- **Ambiguous? Y** — captured in language so vague that two engineers could implement it
  differently. Gap.
- Out-of-scope items: `N/A — deferred: {rationale}`. List explicitly.

### 8.3: Remediate and Re-Run

For every gap:
1. If a TOR ID is missing from Requirements Anchors, add it.
2. If a user description item is not captured, add a note to Key Components or Description
   (or, if it represents a new requirement, direct the user to `capture-requirements`).
3. Re-run the table. Iterate until all rows are `Explicit? Y` and `Ambiguous? N`, or explicit
   deferral.

Do not present the summary with unresolved gaps.

### 8.4: Keep the Final Table

The final passing table is printed as part of Step 9 summary — so the user and future reviewers
can see what this epic was intended to cover and which TOR IDs it owns.

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
Run `/peak-workflow:start {id}` when ready to begin (in a fresh session for clean context).
Note: `/peak-workflow:start` loads TOR requirements from the feature files listed in the
Requirements Anchors table — ensure those feature files are on develop (merged) before starting.
```

Do NOT commit — leave that for the user to decide.
