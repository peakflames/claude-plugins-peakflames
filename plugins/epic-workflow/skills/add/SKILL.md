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

Interpret the user's description. It may be:
- A full description of what the epic should accomplish
- A reference to something discussed earlier in the conversation (e.g., "the outstanding items", "what we just talked about") — scan conversation history to expand these into concrete requirements
- A request for multiple epics — detect plural intent ("split into 6.6 and 6.7", "add both as separate epics")
- Minimal or ambiguous — ask one round of clarifying questions before proceeding

If the user specified an epic number (e.g., "as Epic 6.6"), use it. Otherwise, determine the next available number from the index. Use decimal numbering (6.5, 6.6) when inserting within an existing phase, or whole numbers when adding to a new phase.

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

`docs/implementation-plan/{phase-directory}/epic-{number}-{kebab-case-name}.md`

The phase directory must match an existing `phase-N-name/` directory in the implementation plan. If the epic belongs to a new phase, ask the user to confirm before creating it.

### Required File Structure

```markdown
# Epic {number}: {Name}

**Phase:** {N} — {Phase Name}
**Status:** Not Started
**Dependencies:** Epic {N} ({short description}), Epic {M} ({short description})

> **Brand:** Use the project's brand guidelines skill for {relevant UI elements} if one is configured.

(Include the Brand note only if the epic involves UI work.)

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

### Quality Checks Before Writing

Before writing each spec, verify:
- [ ] Every acceptance criterion is specific enough that a different engineer could verify it without ambiguity
- [ ] Verification items describe observable outcomes, not implementation steps
- [ ] Key Components reference real directories and follow the project's naming conventions
- [ ] The Description explains *why*, not just *what*
- [ ] Dependencies are accurate — the epic's prereqs are correct and nothing circular is introduced

## Step 7: Update the Implementation Plan Index

Update `docs/implementation-plan/index.md`:

1. **Status table** — add a row for each new epic in the correct position (sorted by epic number within its phase). Use the format:
   ```
   | {Phase} | {Number} | [{Name}]({phase-dir}/epic-{number}-{name}.md) | Not Started | — |
   ```

2. **Dependency graph** — add the new epic(s) to the ASCII dependency tree in the correct position, showing what they depend on. Follow the existing indentation and formatting style exactly.

## Step 8: Present Summary

Show the user what was created:

```
## Added Epic(s)

### Epic {N}: {Name}
- **File:** `docs/implementation-plan/{path}`
- **Phase:** {N} — {Name}
- **Dependencies:** {list}
- **Sections:** {count} acceptance criteria, {count} verification items

{Repeat for each epic if multiple were created}

### Index Updated
- {count} row(s) added to status table
- Dependency graph updated

### Ready to implement
Run `/epic-workflow:start {N}` when ready to begin.
```

Do NOT commit — leave that for the user to decide.
