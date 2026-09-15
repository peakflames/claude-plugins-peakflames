---
name: discover
description: |
  Adaptive discovery interview that produces product-vision.md and concept-of-operations.md.
  Use when starting a new project (greenfield) or evolving an existing project's direction (brownfield).
  Creates a docs/{task-short-name} branch if on develop/main/master so all planning artifacts
  travel through a reviewable branch before merging to develop.
  Triggers on: "discover", "new project", "product vision", "concept of operations", "what should we build",
  "let's figure out what to build", "I have an idea for an app", "brainstorm features",
  "requirements gathering", "what are we building", "help me scope this out".
argument-hint: "<description of what to build or what's changing>"
---

You are conducting an adaptive discovery interview to produce (or refine) the project's product vision and concept of operations documents.

The user's request: $ARGUMENTS

## Step 0: Branch Guard

**Before the Layout Guard or any other action:**

1. Run `git branch --show-current`. Capture the result as `<current-branch>`.
2. If `<current-branch>` is `develop`, `main`, or `master`:
   - **Uncommitted changes:** note whether `git status --porcelain` lists files. They carry over
     onto the new branch; handle them right after it is created (below).
   - Derive a short name from `$ARGUMENTS` or the `CLAUDE.md` Project Overview (e.g. `kiln-mvp`)
     and ask via `AskUserQuestion`:
     - Question: `"I'll keep this planning work on its own branch, docs/{derived}. OK?"`
     - Options: `["Use docs/{derived}", "Let me type a different name"]` — only the second asks for
       free text
   - **Validate and slugify the user's answer:**
     - Lowercase the answer, replace spaces and underscores with hyphens, strip any character that is not `[a-z0-9-]`, collapse consecutive hyphens into one, strip leading/trailing hyphens, truncate to 40 chars.
     - If the slugified result differs from the user's raw answer, confirm before proceeding:
       > Branch name will be: `docs/{slug}` (slugified from "{raw}"). Proceed?
       Use `AskUserQuestion` with options `["Yes — create docs/{slug}", "No — let me type a different name"]`. If No, repeat the prompt.
   - Run:
     ```bash
     git checkout -b docs/{slug}
     ```
   - If uncommitted files carried over, ask once via `AskUserQuestion`: `"There are uncommitted
     files from before this session ({list}). Commit them on docs/{slug} as 'chore: peak-workflow
     setup'?"` — options `["Commit them here", "Leave them uncommitted"]`. Never commit on the base
     branch from this step.
   - Confirm to the user:
     > Created and switched to branch `docs/{slug}`. All vision, requirements, and planning changes will live here until you merge.
3. If `<current-branch>` already starts with `docs/`:
   - Continue on the current branch without creating a new one. Confirm:
     > Continuing on existing docs branch: `<current-branch>`
4. If `<current-branch>` is neither develop/main/master nor a `docs/` branch:
   - Warn the user via `AskUserQuestion`:
     - Question: `"Current branch ('{current-branch}') is not a docs/ branch. Continue here, or stop to create one?"`
     - Options: `["Continue on this branch", "Stop — I'll create a docs/ branch first"]`
   - If Stop, end here.

## Layout Guard

**Before any other action after the branch guard:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/peak-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

## Setup Advisory Check

Before the discovery interview, verify that `/peak-workflow:setup` has been run:

1. Check whether `CLAUDE.md` has a **Verification & Quality Gates** section:
   ```bash
   grep -qiE "Verification.*Quality|Quality.*Gates" CLAUDE.md && echo "found" || echo "missing"
   ```
2. If **missing**, print a non-blocking advisory and continue — discovery can proceed now, but
   setup must be run before the first `/peak-workflow:start-epic`:
   > **Setup Advisory:** `CLAUDE.md` does not have a "Verification & Quality Gates" section.
   > `/peak-workflow:start-epic` and `/peak-workflow:wrapup-epic` both require this section. Consider
   > running `/peak-workflow:setup` before or immediately after this discovery session — it
   > audits `CLAUDE.md` and stubs `docs/architecture.md` and `docs/design-notes.md` as well.
3. If **found**, continue without comment.

---

Follow these steps exactly:

## Step 1: Detect Greenfield vs Brownfield

1. Read `docs/product-vision-planning/product-vision.md`. Check whether it exists and has substantive content (a `## 2. Problem Statement` section with at least one paragraph of real content — not a placeholder).
2. Read `docs/product-vision-planning/concept-of-operations.md`. Check whether it exists and has substantive content.
3. Glob `docs/implementation-plan/status/epic-*.md`. A project with no `status/` directory or no sidecar files has no completed epics. To check completion counts, run: `grep -rl 'status: Complete\|status: Implemented' docs/implementation-plan/status/ 2>/dev/null | wc -l`

**Greenfield** = product-vision.md does not exist, has no Problem Statement content, or is a skeleton/placeholder. Proceed to Step 2A.

**Brownfield** = product-vision.md has substantive content AND at least one epic is complete. Proceed to Step 2B.

**Resolving open blockers** = product-vision.md has substantive content, no epic is complete, and
the ConOps contains `**Open — blocks planning:**`. Do not re-interview and write no changelog.
Show each open line, ask what changed (e.g. *"Has an independent thermal fuse or over-temperature
limit been installed?"*), and edit ConOps §8 in place: flip the row to `— confirmed by the owner`
and delete the Open line once resolved, or leave it with a note if not. Then continue at Step 4.5
and Step 6.

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
- **ConOps Section 5 — Operational Scenarios:** When `CLAUDE.md`'s shape block records `Q2 … no — attribution only (entered-by field)`, the scenarios that create records name that field (e.g. *"types their initials in Entered by"*) so it becomes a requirement. For each scenario from PV Section 8, expand into the full ConOps format:
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
  Each scenario should have 4–12 steps that are specific enough to derive acceptance criteria from. Name UI elements, data fields, and user actions explicitly. *(For CLI projects, "UI elements" means flags, arguments, stdin/stdout, and exit codes — e.g., "user runs `fibcalc 10`, tool prints `55` to stdout and exits 0". For a Service or API, it means endpoints, query parameters, request and response fields, and status codes — e.g., "caller sends `GET /pokemon?type=fire&page=2`, receives `200` with 20 items and a `next` link". For Embedded, it means physical controls, indicators, displays, and the debug console — e.g., "potter holds START for 2 seconds, the display shows `FIRING 1/4`".)*
- **ConOps Section 6 — System Interfaces & Data Flows:** Draft data source tables and a data flow diagram (ASCII or description).

### Phase 4: Constraints, Data & Future

Produce draft content for Product Vision sections 9–11 and ConOps sections 7–9:

- **Product Vision Section 9 — Design Direction:** Draft 3–6 bullet points on visual and UX direction. If `CLAUDE.md` has a **UX Baseline** section, draft §9 within its **Design system** declaration — do not propose another component library, token scheme, or dark-mode mechanism. *(For CLI/terminal projects, "design direction" means output formatting conventions, flag naming style, error message tone, and exit code behavior — not visual/GUI design. For a Service or API, it means resource naming, pagination and filtering conventions, error body shape, and versioning. For Embedded, it means what the person sees and presses on the device and how it signals trouble.)*
- **Product Vision Section 10 — Data Strategy:** Draft the data architecture description (sources, freshness, any background processes).
- **Product Vision Section 11 — Backlog / Future Vision:** Draft a bulleted list of 5–10 deferred items representing the product's growth trajectory.
- **ConOps Section 7 — Functional Summary:** Draft tables summarizing features by view/area.
- **ConOps Section 8 — Operational Constraints & Assumptions:** Draft a table of constraints (deployment, users, auth, data freshness, etc.).
- **ConOps Section 8 — What Must Never Happen** *(Embedded, or any product that switches physical equipment on or off — a heater, motor, valve, relay)*: draft first, as for every other section — a `### What Must Never Happen` table under §8 with the hazards this kind of product typically has (hazard, what could cause it, the safe state, the limit), then ask the user to react in plain words: *"Here's what I think this must never do, even if a wire comes loose, the power blinks, or a reading goes wrong — what's missing or wrong?"* For anything that switches mains power or heat, include a row stating that a **hardware** cutoff independent of the software (a thermal fuse, an over-temperature limit switch) is assumed — software cannot protect against a relay that has welded shut — and mark it `Assumption — hardware, outside the software` for the user to confirm. Record the answer in the row (`— confirmed by the owner` / `— NOT present`). A `NOT present` answer is a stop: warn plainly that software alone cannot make the product safe, name the fix (*"install an independent thermal fuse or over-temperature limit switch, then run `/peak-workflow:discover` again"*), and add under ConOps §8 the line `**Open — blocks planning:** <hazard> has no hardware safeguard` — `/peak-workflow:plan-project` stops on it. `/peak-workflow:capture-requirements` turns each hazard row the software can act on into a `# Safety` TOR (assumption rows stay assumptions), and `/peak-workflow:plan-project` ships it with the first epic that drives that output. Do not skip this because the user is a hobbyist — they are the people least likely to raise it unprompted.
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

[Bulleted list of new capabilities that emerged from this discovery, each with a brief description. These are the inputs for `/peak-workflow:plan-project`.]

## Priority Signal

[Capture the user's stated priorities — what's most important, what's nice-to-have, what's deferred. This guides epic ordering in `/peak-workflow:plan-project`.]

## Deferred Items

[Items discussed but explicitly pushed to a future cycle.]
```

## Step 4: Quality Check

Before presenting the final documents to the user, verify:
- [ ] Every Product Vision section (1–11) has substantive content (not placeholders)
- [ ] Every ConOps section (1–9) has substantive content
- [ ] ConOps scenarios have specific, numbered steps (not vague descriptions)
- [ ] ConOps scenarios name specific UI elements, data fields, and user actions (or the CLI / API / device equivalents)
- [ ] Embedded or equipment-controlling products: ConOps §8 has a `What Must Never Happen` table with a safe state per hazard
- [ ] The "As-Is" section describes real current-state pain points (not generic ones)
- [ ] The Glossary defines all domain-specific terms used in both documents
- [ ] Cross-references between documents are correct (ConOps references Product Vision as companion)
- [ ] Brownfield only: the discovery changelog accurately captures all changes

## Step 4.5: Product-Shape Re-check

`/peak-workflow:setup` chose the stack from product-shape questions asked **before** the
product was described. Discovery is the first point where those answers can be checked against
what the product actually does, and it is the last cheap moment to change them — the walking
skeleton in `/peak-workflow:plan-project` materializes the stack.

Read the `**Product shape:**` block in `CLAUDE.md`'s Tech Stack section, then branch:

- **Block present** — run the re-check below.
- **No block, and the Project type is CLI tool, Library, or Embedded** — these never get shape
  questions. Skip in one line; offer nothing.
- **No block, and `CLAUDE.md` has a populated Tech Stack** (an existing project from before shape
  questions existed) — do not re-derive a stack. Say in one line that no recorded shape exists to
  check against, and offer to run the shape questions now only if the ConOps surfaced something
  the stack may not cover.
- **No block and no Tech Stack** — skip silently; `setup` has not run.

Re-read the ConOps scenarios and the Product Vision's §10 Data Strategy against each recorded
answer. A contradiction is a scenario step that needs something the recorded shape says the
product does not have. An answer recorded `not asked (<type>)` is never a contradiction:

| Recorded as "no" | Contradicted by a scenario that… |
|---|---|
| Cross-device / sync | uses the product from a second device expecting to find the same data already there |
| Sign-in / multiple people | names two roles with **different permissions enforced by separate sign-in** over the same data, or anything shared, assigned, reviewed, or approved **inside the product, from another device or account** |
| File attachments | attaches or uploads a photo, document, or spreadsheet **the product then has to store** |
| Live updates from elsewhere | expects something to appear without the person acting — a notification, another person's change |
| Product-held secret | calls a paid or authenticated third-party service |
| Internet on the computers it runs on (Q6, desktop) | syncs, emails, checks for updates, or calls any online service |

Three things are **not** contradictions, and firing on them would re-platform a correct stack:

- **A JSON backup export or import.** It is part of the static stack by design (that sheet makes it
  the walking skeleton's job and the cross-device transfer path), so it contradicts neither the
  file-attachment row nor the cross-device row.
- **Attribution and hand-offs outside the product.** A typed name or initials on a record
  (recorded `no — attribution only`), or a person who only receives an exported file, is not
  sign-in and not "others see the data".
- **A roles table with one real actor.** `/peak-workflow:discover` writes ConOps Section 4 for every
  project, so a single-person product still lists a role or two. Only differing permissions count.

One row tests a recorded **"yes"**: if sign-in is recorded as `Auth: local accounts now, org SSO
deferred` and a scenario turns on identity carrying weight — an approval, a signature, an audit
trail, a regulated record — raise it. Local accounts are real authentication, but who vouches for
the person is still deferred, and that is worth naming before the requirements baseline is written.

**If nothing contradicts,** say so in one line in the Step 5 summary and move on.

**If something contradicts,** do not rewrite `CLAUDE.md` silently and do not change the vision or
ConOps to fit the stack. Name the contradiction in the user's own words, say what it changes, and
ask:

- Question: `"Scenario {N} says {plain-language quote}. The stack we recorded assumes {recorded answer} — {plain consequence, e.g. 'the information only lives in one browser, so it will not be on their phone'}. Which is right?"`
- Options:
  - `"The scenario is right — update the stack"`
  - `"The stack is right — I'll simplify the scenario"`
  - `"Leave both for now — decide before planning"`

On *"update the stack"*: if only a row or two changes, re-run the Tech Stack step of
`/peak-workflow:setup` for the changed answers, rewrite the `**Product shape:**` block and the
affected Stack Summary rows. **If the sheet itself changes** (static ↔ web, or desktop ↔ Hybrid
with the web sheet's service layers), re-run
`/peak-workflow:setup` wholesale instead of patching — a sheet change invalidates more than the
stack table, and each of these is load-bearing:

| Section | Why it changes |
|---|---|
| Verification & Quality Gates → `Test directories` | The sheets have different test trees; a stale line makes every `start-epic` and `wrapup-epic` grep silently return nothing |
| Local Environment | The static branch skips the backend and live-data questions the web branch requires |
| Tool Hygiene → Version exposure | Footer plus console line on a static SPA; a `/version` endpoint on a served app |
| Security Baseline | Gains the sign-in reminders when sign-in enters the picture |
| Reference Materials | Its sheet pointer now names the wrong sheet |

Either way, note the change in the Step 5 summary. The edit lands on this `docs/` branch, so the
stack change is reviewed and approved by the same merge as the requirements baseline.

On *"simplify the scenario"*: edit the ConOps scenario and re-run Step 4's quality check on it.

On *"leave both"*: record the open question under ConOps §8 Operational Constraints &
Assumptions as `**Open — blocks planning:** <the question>` and surface it again in the Step 5
summary — `/peak-workflow:plan-project` stops on that line.

A shape change from `N/A` to active is never silent: it adds layers that every later epic pays
for. A change in the other direction (a recorded "yes" that no scenario needs) is worth raising
too — the same question, inverted.

## Step 5: Present Summary & Next Steps

Show the user what was created:

```
## Discovery Complete

### Documents Written
- `docs/product-vision-planning/product-vision.md` — [Created / Updated to v{N}]
- `docs/product-vision-planning/concept-of-operations.md` — [Created / Updated to v{N}]
[Brownfield only:] - `docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md` — Delta summary for implementation planning

### Product Shape Re-check
- [No contradictions — the recorded shape still matches the scenarios / {what contradicted, and what was decided} / No recorded shape to check]

### By the Numbers
- [N] target user groups identified
- [N] MVP goals with success criteria
- [N] operational scenarios with [total] detailed steps
- [N] out-of-scope items explicitly deferred
- [N] glossary terms defined

### Next Step
Run `/peak-workflow:capture-requirements` to derive the formal TOR requirements baseline from
these documents. The requirements capture will run on the same `docs/` branch as this discovery
session. After that, `/peak-workflow:plan-project` derives the implementation plan.
[UI projects only (Web app / Desktop app / Hybrid with a UI):] Run `/peak-workflow:mockup`
first — it derives the screen inventory, per-scenario flows, and grayscale wireframes and
concretizes the ConOps steps with screen and control names — and then
`/peak-workflow:capture-requirements`.
```

Do NOT commit on your own initiative while writing the documents (Steps 1–4). Committing only
ever happens via the explicit Commit Gate in Step 6 — or Step 0's one-time question about files
left uncommitted from before the session — and only with the user's confirmation.

## Step 6: Ship or Continue

After presenting the summary, ask the user how to proceed via `AskUserQuestion`:

- Question: `"How would you like to proceed with the docs/ branch?"`
- Options:
  - `"Continue planning — run /peak-workflow:capture-requirements next on this branch, or /peak-workflow:mockup first on a UI project (recommended for greenfield — do not merge yet)"`
  - `"Solo merge — merge this docs/ branch to base now (vision-only sessions only: use when no requirements derivation is needed this cycle)"`
  - `"Team PR — push and open a PR for vision-only review (same caveat — appropriate only when requirements capture is not part of this cycle)"`

### If "Continue"

Do nothing further. The user will invoke `/peak-workflow:capture-requirements` to continue on
the same `docs/` branch — preceded by `/peak-workflow:mockup` when the Project type is Web app,
Desktop app, or a Hybrid with a UI.

### Commit Gate (required before "Solo merge" or "Team PR")

Both merge paths below assume the `docs/` branch's working tree is clean — `git merge` and
`git push` only act on what is committed. Because `discover` (and any `capture-requirements` /
`plan-project` run already chained onto this same branch) explicitly avoids auto-committing,
uncommitted work can silently accumulate across the whole planning sequence and then be left
out of the merge entirely. Close that gap here, every time, before either branch below runs:

1. Run `git status --short`. If the working tree is clean, skip straight to the chosen branch's
   steps below.
2. If there are uncommitted changes, draft a commit message summarizing what was written this
   session (reuse the "Documents Written" / "By the Numbers" bullets from Step 5's summary).
3. Use `AskUserQuestion`:
   - Question: `"This docs/ branch has uncommitted changes — commit them now so the merge/push below is safe to run?"`
   - Options: `["Commit with this message", "Let me edit the message first", "I'll commit myself — skip this"]`
   - **Commit with this message:** stage the specific files this session wrote or modified
     (never `git add -A`) and commit.
   - **Let me edit the message first:** ask for the edited message, then commit with it.
   - **I'll commit myself — skip this:** do not commit.

Regardless of which option above was chosen — the working tree's cleanliness is re-checked
immediately before the merge/push actually runs, in the steps below. `"Commit with this
message"` and `"Let me edit the message first"` only stage the specific files this session
wrote (never `git add -A`), so pre-existing unrelated uncommitted changes can still be present
afterward — do not assume the tree is clean just because one of those options was picked.

Do NOT commit without this confirmation exchange — the gate exists to make committing an
explicit, visible user decision at the one point it is actually required (immediately before
merge or push), not to quietly commit on the skill's own initiative.

### If "Solo merge"

1. Note the current `docs/` branch name.
2. Detect the base branch: run `git branch --list develop main master` and prefer `develop` if
   it exists, then `main`, then `master`.
3. Run `git status --short` again, regardless of which Commit Gate option was chosen above. If
   it is still dirty, use `AskUserQuestion`:
   - Question: `"The docs/ branch still has uncommitted changes that will NOT be part of this
     merge commit — proceeding will run 'git checkout <base-branch>', which will either block on
     these changes or carry them onto <base-branch>'s working tree uncommitted. Proceed anyway,
     or stop so you can commit first?"`
   - Options: `["Proceed anyway", "Stop — let me commit first"]`
   - **Stop — let me commit first:** do not run any of steps 4–8 below (including the Report).
     End here — the user can commit and re-invoke the merge, or re-run this skill, when ready.
   - **Proceed anyway:** continue to step 4, and carry the warning into the Report in step 8.
4. `git checkout <base-branch>`
5. `git merge <docs-branch> --no-ff -m "docs(vision): merge <docs-branch> — vision and ConOps update"`
6. `git branch -d <docs-branch>`
7. Confirm: `git log --oneline -5`
8. Report:
   > Branch `<docs-branch>` merged into `<base-branch>` and deleted. Changes not pushed —
   > run `git push` when ready.

   If step 3 above ended in "Proceed anyway", prefix this report with:
   `⚠️ Uncommitted changes remained before this merge — they are not part of what just shipped.`

### If "Team PR"

1. Note the current `docs/` branch name.
2. Detect the base branch as above.
3. Run `git status --short` again, regardless of which Commit Gate option was chosen above. If
   it is still dirty, use `AskUserQuestion`:
   - Question: `"The docs/ branch still has uncommitted changes that will NOT be part of this
     push/PR — proceed anyway (they'll be left behind), or stop so you can commit first?"`
   - Options: `["Proceed anyway", "Stop — let me commit first"]`
   - **Stop — let me commit first:** do not run any of steps 4–8 below (including the Report).
     End here — the user can commit and re-invoke the push/PR, or re-run this skill, when ready.
   - **Proceed anyway:** continue to step 4, and carry the warning into the Report in step 8.
4. `git push -u origin <docs-branch>`
5. Build the PR body:
   - **Summary:** 2–3 sentences describing what vision and ConOps sections were updated.
   - **What Changed:** bullet list of document sections added or modified.
   - **Traceability:** note that requirements capture (`/peak-workflow:capture-requirements`)
     has not run yet — this PR covers discovery only.
   - Footer: `🤖 Generated via /peak-workflow:discover`
6. `gh pr create --base <base-branch> --title "docs: <one-line summary of discovery update>" --body "<body>"`
7. Stay on the `docs/` branch. Do NOT run `gh pr merge`.
8. Report:
   > PR opened: `<url>`. Branch `<docs-branch>` pushed. Await review; do not merge locally.

   If step 3 above ended in "Proceed anyway", prefix this report with:
   `⚠️ Uncommitted changes remained before this push — they are not part of what was just opened
   for review.`
