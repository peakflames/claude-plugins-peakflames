---
name: refresh-docs
description: |
  Refreshes architecture.md and design-notes.md to match the as-built codebase by reading source files and session handoffs.
  Use after completing a phase or before a release.
  Triggers on: "refresh docs", "update architecture", "sync documentation", "docs are stale",
  "docs are out of date", "architecture doesn't match code", "before the release",
  "documentation is stale".
argument-hint: "[arch|design|blank for both]"
---

You are refreshing the project's architecture and design documentation to reflect the as-built codebase.

`docs/architecture.md` and `docs/design-notes.md` (or equivalent paths specified in CLAUDE.md) are written as planning artifacts before implementation begins. As epics complete, they drift from reality — versions change, endpoints multiply, patterns emerge that weren't anticipated. This command reads the actual source code and the accumulated session handoffs to bring both documents back into alignment with what was built.

**When to run this:**
- After completing all epics in a phase
- Before a release (the release protocol should include a docs refresh)
- Any time someone notices the docs describe intended rather than actual behavior

**Target:** `$ARGUMENTS`
- Empty → refresh both `docs/architecture.md` and `docs/design-notes.md`
- `arch` or `architecture` → `docs/architecture.md` only
- `design` or `notes` → `docs/design-notes.md` only

---

## Step 1: Load Epic Workflow Context

1. Read `CLAUDE.md` — extract the Tech Stack table, Key Architecture Decisions, Important Reminders, and note any custom paths to architecture or design docs (if different from `docs/architecture.md` / `docs/design-notes.md`)
2. Read `docs/implementation-plan/index.md` — identify which epics are "Complete" or "Implemented"

---

## Step 2: Read Target Documents and Extract Claims

Read each target document in full. As you read, extract and note every **verifiable claim** the document makes:

- **Version strings** — any "X 18+", "v7.0", ".NET 8+", "v3.x" etc.
- **Counts** — any "11 endpoints", "3-stage build", "4 filters", "12 columns" etc.
- **File and directory paths** — any source paths the doc references or implies
- **Technology names and stated roles** — libraries, services, patterns described
- **Status line** — note the current `Status:` field (Draft vs. As-Built)

These become the **claims to verify** in Step 4.

---

## Step 3: Aggregate Session Handoffs

Read all files in `docs/implementation-plan/session-handoffs/` that correspond to Complete or Implemented epics. Skip Paused handoffs — their decisions may not be final.

For each handoff, collect:
- **Key Files** — every file path listed in the Key Files table
- **Key Decisions** — every design choice recorded in the Key Decisions section
- **Spec Deviations** — any divergences from the original plan (these signal where "as designed" ≠ "as built")
- **Known Issues / Follow-ups** — deferred work or open items

After reading all handoffs, produce two lists:
1. **Implementation file set** — deduplicated union of all Key Files paths. These are the ground-truth source files to read in Step 4.
2. **Decision inventory** — all Key Decisions across all handoffs, annotated with the epic they came from. This is what design-notes.md must cover.

---

## Step 4: Read Source of Truth Files

Read every file in the implementation file set (from Step 3).

Additionally, look for and read these **framework-configuration artifacts** — they carry authoritative version and structure data that docs commonly get wrong:

| Artifact | What it tells you |
|---|---|
| `Dockerfile` (any) | Actual build stage count, base image names and versions, injected `ARG` names |
| `package.json` (frontend root) | Actual framework versions — React, router, table, query, virtual, etc. |
| `.csproj`, `pom.xml`, `pyproject.toml`, `go.mod`, `Cargo.toml` | Actual backend runtime version and dependency versions |
| Application entrypoint (`Program.cs`, `main.py`, `App.tsx`, `main.ts`, etc.) | Actual service registrations, route definitions, lazy-load configuration |

As you read, note where actual state matches or diverges from the claims extracted in Step 2.

---

## Step 5: Gap Analysis

Produce a gap table for each target document.

**architecture.md — example format:**

| Section / Topic | Current Claim | Actual State | Action |
|---|---|---|---|
| .NET version | .NET 8+ | .NET 10 | Correct throughout |
| Endpoint count | 7 endpoints | 11 endpoints | Expand table |
| Docker stages | 2-stage | 3-stage (Bun → SDK → runtime) | Rewrite section |
| Admin Geocoding page | Not mentioned | `/admin/geocoding` route in App.tsx | Add to pages table |

**design-notes.md — example format:**

| Decision | Status | Evidence |
|---|---|---|
| Custom MarkerClusterGroup wrapper | Missing | Epic 5 handoff — Key Decisions |
| Manual query param binding (.NET 10 bug) | Missing | Epic 3 handoff — Key Decisions |
| CartoDB Light tile choice | Missing | Source code (tile URL + attribution comment) |
| Client-side filtering rationale | Missing | Epic 4 handoff — Key Decisions |

**Present both tables to the user. Explain the impact of each gap. Ask for explicit confirmation before proceeding to Step 6.**

If both tables are empty, report that the documentation is current and stop — no rewrite needed.

---

## Step 6: Rewrite Target Documents

Rewrite only the documents where gaps were found.

### Rewriting `docs/architecture.md`

- Correct **all** version mismatches — versions appear in the Tech Stack table, Mermaid diagrams, code snippets, and prose; update them everywhere, not just in one place
- Derive the complete endpoint/route table by reading all endpoint handler files identified in handoffs — count them, list their methods and paths
- Derive the frontend pages table from the router/App entrypoint file — every route should appear
- Derive Docker stage details from the actual `Dockerfile` — stage names, base images, `ARG` names
- Add any missing components, services, patterns, or infrastructure details found in handoffs
- Update `Document Version` (increment minor version), change `Status: Draft` → `Status: As-Built`, set date to today

### Rewriting `docs/design-notes.md`

- Keep all existing decision sections that are still accurate — do not discard them
- Correct any sections that describe intended behavior that diverged from what was built — use Spec Deviations from handoffs as the source of corrections
- For each entry in the design-notes gap table: add a new numbered section. Lead with the decision, follow with **Rationale:**, draw from the handoff's Key Decisions entry and any supporting evidence in source code
- Add or update a **"Known Issues and Deferred Work"** section at the end — pull from handoff "Known Issues / Follow-ups" entries and any `CANNOT VERIFY` items from wrapup handoffs
- Update `Document Version`, `Status`, and date

---

## Step 7: Spot-Check

After rewriting, verify the highest-stakes claims before committing:

- [ ] Count endpoint/route handler files enumerated in handoffs — does that count appear correctly in `architecture.md`?
- [ ] Open the router/App entrypoint and list every route — does every route appear in the pages table in `architecture.md`?
- [ ] Open `package.json` and `.csproj` (or equivalent) — do the framework versions match what the docs now say?
- [ ] Does every entry in the **decision inventory** (Step 3, list 2) have a corresponding section in `design-notes.md`?

Report any remaining discrepancies. Fix them before proceeding to Step 8.

---

## Step 8: Commit

**Ask the user if they'd like to commit** the refreshed documents. If the user confirms:

1. Stage only the target document files (`docs/architecture.md` and/or `docs/design-notes.md`)
2. Commit message: `docs: refresh architecture and design notes to as-built state`
3. Commit body (1-2 lines): summarize the most significant changes — e.g., *"Corrects .NET version, adds 4 missing endpoints, adds 6 new design decisions from epics 7–10 handoffs."*

Do NOT push — leave that for the user.
