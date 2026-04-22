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

Follow these steps exactly:

## Step 1: Load Context

1. Read `CLAUDE.md` at the repo root for project context
2. Read the implementation plan index: `docs/implementation-plan/index.md`
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

From the user's description and the existing dependency graph in the index, determine:
- Which existing epics this new epic depends on
- Whether any existing epics should be noted as depending on this one (update the graph if so)

If dependencies are ambiguous, ask the user.

## Step 4: Read Existing Epics for Context

1. Read 1-2 completed or well-defined epic specs from the same phase to match the level of detail, tone, and specificity. These are the quality bar — the new epic must be at least as detailed.
2. Identify which phase directory the new epic belongs in based on the dependency and the existing phase structure in the index.

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

### Quality Checks Before Writing

Before writing each spec, verify:
- [ ] Every acceptance criterion is specific enough that a different engineer could verify it without ambiguity
- [ ] Verification items describe observable outcomes, not implementation steps
- [ ] Key Components reference real directories and follow the project's naming conventions
- [ ] The Description explains *why*, not just *what*
- [ ] Dependencies are accurate — the epic's prereqs are correct and nothing circular is introduced

## Step 7: Update the Implementation Plan Index

Update `docs/implementation-plan/index.md`:

1. **Status table** — add a row for each new epic at the **bottom of its phase block** (random IDs have no meaningful sort order — use insertion order within each phase). Use the format:
   ```
   | {Phase} | {id} | [{Name}]({phase-dir}/epic-{id}-{name}.md) | Not Started | — |
   ```

2. **Dependency graph** — add the new epic(s) to the ASCII dependency tree in the correct position, showing what they depend on. Follow the existing indentation and formatting style exactly.

## Step 8: Present Summary

Show the user what was created:

```
## Added Epic(s)

### Epic {id}: {Name}
- **File:** `docs/implementation-plan/{path}`
- **Phase:** {N} — {Name}
- **Dependencies:** {list}
- **Sections:** {count} acceptance criteria, {count} verification items

{Repeat for each epic if multiple were created}

### Index Updated
- {count} row(s) added to status table
- Dependency graph updated

### Ready to implement
Run `/epic-workflow:start {id}` when ready to begin (in a fresh session for clean context).
```

Do NOT commit — leave that for the user to decide.
