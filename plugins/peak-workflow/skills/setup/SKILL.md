---
name: setup
description: |
  Audits CLAUDE.md for required sections and stubs architecture.md and design-notes.md.
  Use for first-time project setup before starting epics.
  Triggers on: "setup project", "audit CLAUDE.md", "project setup",
  "prepare project for epics", "initialize project", "first time setup",
  "configure CLAUDE.md", "get the project ready".
---

You are auditing the project's `CLAUDE.md` file to ensure it contains the sections that the epic workflow depends on, and ensuring the documentation stubs exist for the architecture and design documents that the workflow reads and maintains.

Follow these steps exactly:

## Step 1: Read CLAUDE.md

Read `CLAUDE.md` at the repo root. If it doesn't exist, inform the user and offer to create one from scratch.

## Step 2: Check Required Sections

Check for the presence and completeness of each section below. Report a status for each:

| Section | What to check |
|---------|---------------|
| **Tech Stack** | Lists the languages, frameworks, package manager, and key libraries used |
| **Local Environment** | Documents how to run the backend and frontend locally, whether the API is live and functional, and the preference for live data over mocking during verification |
| **Peak Workflow** | References the peak commands (`/peak-workflow:discover`, `/peak-workflow:capture-requirements`, `/peak-workflow:plan-project`, `/peak-workflow:add`, `/peak-workflow:triage`, `/peak-workflow:start`, `/peak-workflow:wrapup`, `/peak-workflow:pause`, `/peak-workflow:quick-fix`, `/peak-workflow:refresh-docs`, `/peak-workflow:status`, `/peak-workflow:setup`) and points to the requirements directory (`docs/requirements/`) and implementation plan |
| **Verification & Quality Gates** | Lists concrete checks to run before marking an epic complete (e.g., build, tests, linting, visual checks, brand audits) |
| **Important Reminders** | Project-specific constraints that prevent common mistakes |
| **Reference Materials** | Pointers to docs, patterns, or external resources that inform implementation |
| **Git Workflow** | Documents branch strategy (including epic branch naming convention `feature/epic-<id>-<short-name>` where `<id>` is a legacy integer or 7-character alphanumeric, and quick-fix convention `hotfix/issue-<N>-<slug>` or `hotfix/<slug>`), merge preferences (`--no-ff`), push approval rules, and files that must never be committed (e.g., `.env`, `appsettings*.json`) |
| **Verification Before Commit Rule** | Prescribes the implement → lint → build → verify → commit sequence; explains why compiled code ≠ correct behavior |
| **Release Protocol** | Documents the full release flow: changelog finalization, merge to main, tagging convention, post-release version bump, and where the version lives in the codebase |

Report the result as a checklist:
```
[PASS] Tech Stack — found
[PASS] Peak Workflow — found with capture-requirements and TOR references
[MISS] Verification & Quality Gates — section missing
[WEAK] Important Reminders — section exists but has no content
```

## Step 3: Fix Missing/Weak Sections

For each section that is MISS or WEAK, ask the user targeted questions to populate it. Ask one section at a time — do not dump all questions at once.

**Tech Stack** (if missing):
- What language and framework does this project use?
- What package manager? (npm, bun, yarn, pip, dotnet, etc.)
- Any key libraries or tools? (CSS framework, ORM, test runner, etc.)

**Local Environment** (if missing):
- How do you run the backend locally? (e.g., `dotnet run`, `npm start`, etc.)
- How do you run the frontend locally? (e.g., `bun run dev`, `npm run dev`, etc.)
- Is the backend API live and functional in local dev? (i.e., can it connect to real data sources like databases?)
- Should verification always use live data instead of mocking API responses?

**Peak Workflow** (if missing):
- Where does the requirements baseline live? (default: `docs/requirements/`)
- Where does the implementation plan live? (default: `docs/implementation-plan/` — run `/peak-workflow:status` for the dashboard)
- Confirm the peak commands should be listed: `/peak-workflow:discover`, `/peak-workflow:capture-requirements`, `/peak-workflow:plan-project`, `/peak-workflow:add`, `/peak-workflow:triage <issue|description>`, `/peak-workflow:start <id>`, `/peak-workflow:wrapup <id>`, `/peak-workflow:pause`, `/peak-workflow:quick-fix <issue|description>`, `/peak-workflow:refresh-docs`, `/peak-workflow:status`, `/peak-workflow:setup`

**Verification & Quality Gates** (if missing):
- What checks should run before an epic is marked complete? Ask about each:
  - Build/compile check? If so, what command?
  - Tests? If so, what command?
  - Linting or formatting? If so, what command?
  - Visual/screenshot verification? (suggest `playwright-cli` skill if frontend)
  - Brand or design compliance? (suggest brand guidelines skill if applicable)
  - Any other project-specific checks?

After gathering answers, **validate each command answer**: if the user provides a non-empty
answer that looks like a description rather than a runnable shell command (e.g., it contains no
executable token — no path separators, no dot-separated binary name, no recognizable CLI verb
like `pytest`, `npm`, `dotnet`, `make`, `cargo`, `go test`, etc.), prompt once:
> That looks like a description rather than a shell command. What's the exact command to run?
> For example: `pytest tests/`, `npm test`, `dotnet test`, `make check`
If the second answer is still ambiguous, accept it and add a note in the written section:
> *(Command may need refinement — update CLAUDE.md before the first `/peak-workflow:start`)*

**Important Reminders** (if missing):
- Any project-specific constraints or gotchas that Claude should always know about?
- Libraries or patterns to avoid?
- Naming conventions or code organization rules?

**Reference Materials** (if missing):
- Are there architecture docs, design docs, or reference projects Claude should read?
- Any external resources (Confluence, Linear, Figma) worth pointing to?

**Git Workflow** (if missing):
- What is the branch strategy? (e.g., `develop` for active work, `main` for releases)
- Epic feature branches use the naming convention `feature/epic-<id>-<short-name>` where `<id>` is either a legacy integer (pre-v2.0.0 epics, e.g., `7` or `6.5`) or a 7-character alphanumeric ID (v2.0.0+ epics, e.g., `a3f2K7p`), and `<short-name>` is derived from the epic spec filename (e.g., `epic-a3f2K7p-user-auth.md` → `feature/epic-a3f2K7p-user-auth`). Include this convention in the Git Workflow section.
- Quick-fix branches use the naming convention `hotfix/issue-<N>-<slug>` when tied to a GitHub issue, or `hotfix/<slug>` otherwise. Include this convention too.
- Should merges use `--no-ff` to preserve commit history?
- Should Claude ask before pushing to origin?
- Are there files that must NEVER be committed? (e.g., `.env`, `appsettings*.json`, credentials)

**Verification Before Commit Rule** (if missing):
- What command builds the project? (e.g., `python build.py up -d`, `dotnet build`, `npm run build`)
- What command runs linting/formatting checks? (e.g., `python build.py lint`, `dotnet format --verify-no-changes`)
- What command auto-fixes formatting? (e.g., `python build.py format`, `dotnet format`)
- What URLs or commands verify the app is working after build? (e.g., `curl http://localhost:8080/api/health`)
- Generate the section using this template, filling in the project-specific commands:

```markdown
## CRITICAL: Verification Before Commit Rule

**NEVER commit code changes before verification!**

A successful build (compile) does NOT equal working code. The workflow MUST be:

1. **Implement** — Make the code changes
2. **Lint** — Run `[lint command]` to verify formatting and static analysis
3. **Build** — Run `[build command]` to build and start the full stack
4. **Verify** — Use curl, playwright, or manual testing to confirm functionality
5. **Commit** — ONLY after verification passed

**Why this matters:**
- Compiled code ≠ correct behavior
- API changes need endpoint verification
- Business logic needs functional testing
- Committing untested code pollutes git history with potential bugs

**Verification Workflow Example:**
```​bash
[lint command]                                    # Check formatting + static analysis
[build command]                                   # Build & start
[verify commands]                                 # Verify endpoints
[stop command]                                    # Stop when done
git add <files> && git commit -m "feat: ..."      # Commit after verification
```​
```

**Release Protocol** (if missing):
- What branch do releases merge from? (e.g., `develop` → `main`)
- Where does the version number live? (e.g., `.csproj`, `package.json`, `setup.py`)
- Is there a CHANGELOG? If not, should one be created?
- What tag format is used? (e.g., `vX.Y.Z`)
- How does CI/CD respond to tags vs branch pushes?
- Generate the section using this template, filling in the project-specific details:

```markdown
## Release Protocol

**Prerequisites:** Must be on `[dev branch]` branch with a clean working tree.

**Steps:**

1. **Finalize CHANGELOG** — Change `[X.Y.Z] - UNDER DEVELOPMENT` → `[X.Y.Z] - DD-MMM-YYYY` in `CHANGELOG.md`
   - Commit: `chore: release vX.Y.Z`

2. **Merge to [main branch]**
   ```​bash
   git checkout [main branch] && git pull origin [main branch]
   git merge [dev branch] --no-ff -m "Merge branch '[dev branch]' into [main branch] for release vX.Y.Z"
   ```​

3. **Tag the release** (on [main branch])
   ```​bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z - Brief description"
   git push origin vX.Y.Z
   ```​

4. **Merge back to [dev branch]**
   ```​bash
   git checkout [dev branch] && git merge [main branch] --no-ff
   ```​

5. **Post-release version bump** (on [dev branch])
   - Bump `[version file path]`: `<Version>X.Y.Z</Version>` → next version
   - Add `## [X.Y+1.0] - UNDER DEVELOPMENT` to `CHANGELOG.md`
   - Commit: `chore: bump version for next development cycle`

6. **Push** (ASK USER FIRST)
   ```​bash
   git push origin [main branch] && git push origin [dev branch]
   ```​

**Note:** [Describe CI/CD behavior for branch pushes vs tags]
```

## Step 4: Apply Updates

After gathering answers, add or update the missing sections in `CLAUDE.md`. Preserve all existing content — only add or strengthen sections.

## Step 5: Summary

Show the final checklist with all sections now passing.

## Step 6: Check Requirements Directory and Documentation Stubs

**Requirements directory check:** Check whether `docs/requirements/` exists and contains any `.feature.md` files.

- If **`docs/requirements/` exists with at least one `.feature.md` file**: Report `[PASS] Requirements baseline — {N} feature files found` and proceed to the architecture/design-notes check below.
- If **`docs/requirements/` is missing or empty**: Create the directory and write `docs/requirements/README.md`:

```markdown
# Requirements Baseline

This directory holds the formal Gherkin-style requirements (`.feature.md` files) and their
traceability sidecars (`.feature.tracing.json`), written by `/peak-workflow:capture-requirements`.

## Conventions

- Feature files are **append-only** — feature numbers are stable once assigned.
- TOR IDs (`TOR-NN-XXXXXXX`) are **immutable** once merged to develop — they are foreign keys
  referenced by epic specs, tests, and handoffs.
- Requirements changes go through a `docs/{task-short-name}` branch via
  `/peak-workflow:capture-requirements` (brownfield mode), reviewed and merged like any
  change to the requirements baseline.

## Lifecycle

1. Run `/peak-workflow:discover` to establish or update the product vision and ConOps.
2. Run `/peak-workflow:capture-requirements` to derive TOR requirements from the vision/ConOps.
3. Run `/peak-workflow:plan-project` to derive epics that implement the TOR requirements.
4. Run `/peak-workflow:start <id>` to implement each epic — tests are derived from
   TOR Given/When/Then.
5. Run `/peak-workflow:wrapup <id>` to independently verify each TOR requirement is satisfied.
```

  Report: `[PASS] Requirements directory — created docs/requirements/README.md stub`

**Architecture/design-notes check:** Check whether `docs/architecture.md` and `docs/design-notes.md` exist.

- If **both exist** and contain substantive content: Report `[PASS] Documentation stubs — both files exist` and skip to Step 7.
- If **either is missing or empty**: Generate stubs from the CLAUDE.md content you just audited, following the instructions below.

### Generating `docs/architecture.md` stub

Derive the content from CLAUDE.md's Tech Stack, data sources, and project description sections:

```markdown
# [Project Name] — Architecture Document

> **Note:** This is a planning artifact generated by `/peak-workflow:setup`. Sections marked with
> *(to be completed during implementation)* will be populated as epics are implemented.
> Run `/peak-workflow:refresh-docs` after completing epics to update this document to reflect the
> as-built system.

---

## 1. System Overview

[Derive from CLAUDE.md project description — 2-3 sentences about what the system does, who uses it, and the high-level deployment model (single container, microservices, serverless, etc.)]

---

## 2. Tech Stack

[Copy or adapt the Tech Stack table from CLAUDE.md. If CLAUDE.md has a simple list, convert it to a table with Layer / Technology / Purpose columns.]

---

## 3. Data Sources

[If CLAUDE.md mentions databases, APIs, or data sources, list them here with their purpose. Otherwise, add a placeholder:]

*(to be completed during implementation)*

---

## 4. API Design

*(to be completed during implementation — endpoint table will be derived from the codebase)*

---

## 5. Backend Architecture

*(to be completed during implementation — folder structure, key patterns, and service registrations)*

---

## 6. Frontend Architecture

*(to be completed during implementation — pages, component hierarchy, data fetching patterns)*

---

## 7. Background Services

*(to be completed during implementation — if the application has background jobs, scheduled tasks, or hosted services)*

---

## 8. Container / Infrastructure

*(to be completed during implementation — Dockerfile stages, build pipeline, deployment model)*

---

## 9. Security & Access

*(to be completed during implementation — authentication, authorization, network access, secrets management)*
```

### Generating `docs/design-notes.md` stub

Derive the content from CLAUDE.md's Key Architecture Decisions and Important Reminders:

```markdown
# [Project Name] — Design Decision Notes

> **Note:** This is a planning artifact generated by `/peak-workflow:setup`. Initial decisions
> are derived from CLAUDE.md. Additional decisions will be captured in session handoff
> files as epics are implemented. Run `/peak-workflow:refresh-docs` to consolidate all decisions
> into this document.

---

These notes capture design decisions and rationale that complement the Architecture Document.

---
```

Then, for each item in CLAUDE.md's **Key Architecture Decisions** section (or equivalent), generate a numbered section:

```markdown
## N. [Decision Title]

**Decision:** [The decision as stated in CLAUDE.md]

**Rationale:** [If CLAUDE.md provides a rationale, include it. Otherwise:]
*(Rationale to be documented during implementation.)*
```

After all decision sections, add:

```markdown
---

## [Next Number]. Known Issues and Deferred Work

*(to be populated as epics are implemented and design trade-offs are discovered)*
```

### After generating stubs

Inform the user:
> Created `docs/architecture.md` and `docs/design-notes.md` as planning stubs.
> These will be read by `/peak-workflow:start` for context and updated by `/peak-workflow:refresh-docs` after implementation.

## Step 7: Final Summary

Remind the user:
- `CLAUDE.md` is loaded automatically every session — the quality gates will apply to all future epic work
- `docs/architecture.md` and `docs/design-notes.md` are read by every `/peak-workflow:start` and `/peak-workflow:wrapup` for context
- After implementing epics, run `/peak-workflow:refresh-docs` to bring the docs in sync with the as-built codebase

**Legacy layout check:** After completing the above, check whether `docs/implementation-plan/index.md` exists and contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column. If found, add a one-line reminder at the end of your summary:

> Your implementation plan uses the pre-v2.5.0 layout. Run `/peak-workflow:migrate-2.5` to upgrade to per-phase indexes + status sidecars and eliminate implementation-plan merge conflicts.
