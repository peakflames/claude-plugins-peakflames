---
name: discover
description: |
  Adaptive discovery interview that produces product-vision.md and concept-of-operations.md.
  Use when starting a new project (greenfield) or evolving an existing project's direction (brownfield).
  Triggers on: "discover", "new project", "product vision", "concept of operations", "what should we build",
  "let's figure out what to build", "I have an idea for an app", "brainstorm features",
  "requirements gathering", "what are we building", "help me scope this out".
argument-hint: "<description of what to build or what's changing>"
---

You are conducting an adaptive discovery interview to produce (or refine) the project's product vision and concept of operations documents.

The user's request: $ARGUMENTS

## Layout Guard

**Before any other action:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/epic-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

Follow these steps exactly:

## Step 1: Detect Greenfield vs Brownfield

1. Read `docs/product-vision-planning/product-vision.md`. Check whether it exists and has substantive content (a `## 2. Problem Statement` section with at least one paragraph of real content — not a placeholder).
2. Read `docs/product-vision-planning/concept-of-operations.md`. Check whether it exists and has substantive content.
3. Glob `docs/implementation-plan/status/epic-*.md`. A project with no `status/` directory or no sidecar files has no completed epics. To check completion counts, run: `grep -rl 'status: Complete\|status: Implemented' docs/implementation-plan/status/ 2>/dev/null | wc -l`

**Greenfield** = product-vision.md does not exist, has no Problem Statement content, or is a skeleton/placeholder. Proceed to Step 2A.

**Brownfield** = product-vision.md has substantive content AND at least one epic is complete. Proceed to Step 2B.

Report the detection result to the user before continuing:
```
Mode: [Greenfield / Brownfield]
Reason: [1-2 sentences explaining what was found]
```

## Step 2A: Greenfield — Full Discovery Interview

Conduct an adaptive interview in 4 phases. Each phase follows this protocol:

### Interview Protocol

For each phase:
1. **Draft first.** Propose draft content (statements, tables, lists) for the user to react to — do NOT ask open-ended questions. Base drafts on the user's `$ARGUMENTS`, any prior conversation context, and common patterns for the project type.
2. **Present for reaction.** Show the draft and ask: "Confirm, refine, or reject each item."
3. **Iterate.** Incorporate feedback. Maximum 3 refinement rounds per phase before moving on.
4. **Gate.** At the end of each phase, show a summary of what was captured and ask: "Ready to move to the next phase, or do you want to adjust anything here?"

### Phase 1: Identity & Problem

Produce draft content for Product Vision sections 1–4:

- **Section 1 — Product Name:** Propose a name and tagline based on the user's description.
- **Section 2 — Problem Statement:** Draft 2–4 paragraphs describing the problem. Include current pain points as bullet points. Draw from the user's description and reasonable inferences about the domain.
- **Section 3 — Target Users:** Draft a table of user groups and their primary needs.
- **Section 4 — Vision Statement:** Draft a single-paragraph vision statement.

### Phase 2: Goals, Scope & Boundaries

Produce draft content for Product Vision sections 5–7:

- **Section 5 — Goals & Success Criteria (MVP):** Draft a table with 4–8 goals and measurable success criteria.
- **Section 6 — MVP Scope Summary:** Draft the scope organized by view/feature area. Each area gets a bulleted feature list. Include a "Cross-cutting Concerns" subsection.
- **Section 7 — Out of Scope for MVP:** Draft a bulleted list of 5–10 items explicitly excluded.

### Phase 3: Scenarios

This is the heart of the discovery. Produce draft content for Product Vision section 8 and ConOps sections 2–6:

- **Product Vision Section 8 — Key Business Scenarios:** Draft 3–6 scenario summaries (actor, trigger, goal, outcome — 1 paragraph each).
- **ConOps Section 2 — Current State ("As-Is"):** Draft a table of current methods and their limitations, plus a numbered list of core pain points.
- **ConOps Section 3 — Proposed System ("To-Be"):** Draft a 2–3 paragraph system description.
- **ConOps Section 4 — User Roles & Profiles:** Draft a table of roles and the questions they bring to the app.
- **ConOps Section 5 — Operational Scenarios:** For each scenario from PV Section 8, expand into the full ConOps format:
  ```
  ### Scenario N: [Title]
  **Actor:** [Role]
  **Trigger:** [What initiates the scenario]
  **Goal:** [What the actor wants to achieve]

  **Steps:**
  1. [Concrete step with specific UI elements named]
  2. [...]

  **Outcome:** [What the actor walks away with]
  ```
  Each scenario should have 4–12 steps that are specific enough to derive acceptance criteria from. Name UI elements, data fields, and user actions explicitly.
- **ConOps Section 6 — System Interfaces & Data Flows:** Draft data source tables and a data flow diagram (ASCII or description).

### Phase 4: Constraints, Data & Future

Produce draft content for Product Vision sections 9–11 and ConOps sections 7–9:

- **Product Vision Section 9 — Design Direction:** Draft 3–6 bullet points on visual and UX direction.
- **Product Vision Section 10 — Data Strategy:** Draft the data architecture description (sources, freshness, any background processes).
- **Product Vision Section 11 — Backlog / Future Vision:** Draft a bulleted list of 5–10 deferred items representing the product's growth trajectory.
- **ConOps Section 7 — Functional Summary:** Draft tables summarizing features by view/area.
- **ConOps Section 8 — Operational Constraints & Assumptions:** Draft a table of constraints (deployment, users, auth, data freshness, etc.).
- **ConOps Section 9 — Glossary:** Draft a table of domain terms and definitions.

## Step 2B: Brownfield — Delta Discovery Interview

1. Read the existing `docs/product-vision-planning/product-vision.md` and `docs/product-vision-planning/concept-of-operations.md` in full.
2. Read the phase indexes (`docs/implementation-plan/phase-*/index.md`) and spot-check sidecars in `docs/implementation-plan/status/` to understand what phases and epics have been planned and built.
3. Read `docs/architecture.md` and `docs/design-notes.md` for current system context.

Present a summary to the user:
```
## Current State
- Product Vision: [version, date, key scope items]
- ConOps: [number of scenarios, key features covered]
- Implementation: [N of M epics complete]

## What's New?
Based on your description, here's what I think has changed or needs to be added:
- [List of deltas inferred from the user's $ARGUMENTS]
```

Then conduct a focused interview covering ONLY what is new or changed. Use the same adaptive protocol (draft → react → iterate → gate) but skip sections that don't need updates.

For each existing section that needs changes, show the current content alongside the proposed update so the user can see exactly what's changing.

## Step 3: Write Documents

After all phases are complete, write the documents.

### Greenfield Output

1. Create the directory if needed: `docs/product-vision-planning/`
2. Write `docs/product-vision-planning/product-vision.md` following this exact structure:

```markdown
# [Product Name] — Product Vision & Brief

**Document Version:** 1.0
**Date:** [today's date]
**Status:** Draft

---

## 1. Product Name
## 2. Problem Statement
## 3. Target Users
## 4. Vision Statement
## 5. Goals & Success Criteria (MVP)
## 6. MVP Scope Summary
## 7. Out of Scope for MVP
## 8. Key Business Scenarios
## 9. Design Direction
## 10. Data Strategy
## 11. Backlog / Future Vision
```

3. Write `docs/product-vision-planning/concept-of-operations.md` following this exact structure:

```markdown
# [Product Name] — Concept of Operations (ConOps)

**Document Version:** 1.0
**Date:** [today's date]
**Status:** Draft

---

## 1. Purpose & Scope
## 2. Current State ("As-Is")
## 3. Proposed System ("To-Be")
## 4. User Roles & Profiles
## 5. Operational Scenarios
## 6. System Interfaces & Data Flows
## 7. Functional Summary
## 8. Operational Constraints & Assumptions
## 9. Glossary
```

### Brownfield Output

1. Update `docs/product-vision-planning/product-vision.md` in place — increment the document version, update the date, and modify only the sections that changed.
2. Update `docs/product-vision-planning/concept-of-operations.md` in place — same approach.
3. Write `docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md` with content. `{TIMESTAMP}` is a second-granularity UTC timestamp — second granularity is required because parallel discovery sessions on different machines may produce changelogs within the same minute, and day-granularity would collide. Generate it with:

   ```bash
   date -u +%Y-%m-%d-%H%M%S
   ```

   Example filename: `discovery-changelog-2026-04-23-174205.md`. Do not substitute local time — UTC keeps filenames sortable and unambiguous across timezones.

```markdown
# Discovery Changelog

**Date:** [today's date]
**Mode:** Brownfield (post-MVP ideation)
**Previous Version:** [version from existing docs]

## What Changed

| Document | Section | Change Type | Summary |
|----------|---------|-------------|---------|
| product-vision.md | [section] | [Added / Modified / Removed] | [1-line summary] |
| concept-of-operations.md | [section] | [Added / Modified / Removed] | [1-line summary] |

## New Capabilities Identified

[Bulleted list of new capabilities that emerged from this discovery, each with a brief description. These are the inputs for `/epic-workflow:plan-project`.]

## Priority Signal

[Capture the user's stated priorities — what's most important, what's nice-to-have, what's deferred. This guides epic ordering in `/epic-workflow:plan-project`.]

## Deferred Items

[Items discussed but explicitly pushed to a future cycle.]
```

## Step 4: Quality Check

Before presenting the final documents to the user, verify:
- [ ] Every Product Vision section (1–11) has substantive content (not placeholders)
- [ ] Every ConOps section (1–9) has substantive content
- [ ] ConOps scenarios have specific, numbered steps (not vague descriptions)
- [ ] ConOps scenarios name specific UI elements, data fields, and user actions
- [ ] The "As-Is" section describes real current-state pain points (not generic ones)
- [ ] The Glossary defines all domain-specific terms used in both documents
- [ ] Cross-references between documents are correct (ConOps references Product Vision as companion)
- [ ] Brownfield only: the discovery changelog accurately captures all changes

## Step 5: Present Summary & Next Steps

Show the user what was created:

```
## Discovery Complete

### Documents Written
- `docs/product-vision-planning/product-vision.md` — [Created / Updated to v{N}]
- `docs/product-vision-planning/concept-of-operations.md` — [Created / Updated to v{N}]
[Brownfield only:] - `docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md` — Delta summary for implementation planning

### By the Numbers
- [N] target user groups identified
- [N] MVP goals with success criteria
- [N] operational scenarios with [total] detailed steps
- [N] out-of-scope items explicitly deferred
- [N] glossary terms defined

### Next Step
Run `/epic-workflow:plan-project` to derive the implementation plan from these documents.
```

Do NOT commit — leave that for the user to decide.
