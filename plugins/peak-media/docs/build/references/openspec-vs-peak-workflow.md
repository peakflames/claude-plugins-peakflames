# OpenSpec vs. peak-workflow

*How two spec-driven approaches to AI coding compare. Research current as of November 8, 2026 (OpenSpec v1.16.1).*

---

## TL;DR

**OpenSpec** and **peak-workflow** both stop "vibe coding" by making the human and the AI agree on a spec before code gets written. They aim at different kinds of work.

- **OpenSpec is a lightweight change-management layer.** Every change is a small folder (proposal, design, tasks, spec deltas). When the change is done, the deltas are folded into a living spec library. It is tool-agnostic (30+ assistants) and works especially well on existing codebases. Verification is advisory, and there is no traceability from requirement to test.
- **peak-workflow is a full lifecycle with verification built in.** It covers discovery, requirements, planning, epics, implementation and independent verification. Requirements are Gherkin scenarios with stable TOR IDs, epics are planned against those IDs, and each epic is verified Given/When/Then by a separate session on a stronger model. It is Claude Code-specific and heavier, and every artifact is traceable.

**In one line:** OpenSpec makes the agent *spec-aware*. peak-workflow makes the agent *spec-accountable*.

---

## 1. The shared problem

AI coding agents produce what you *asked* for, not what you *meant*. Without a written agreement:

- prompts are vague and results are unpredictable
- intent lives in chat history that disappears between sessions
- nobody can say afterward whether the code actually meets the requirement

Both tools answer this by putting the spec in the repo, next to the code, as the shared source of truth.

---

## 2. OpenSpec in brief

**Who:** Fission AI, a startup in Y Combinator's W26 batch. Open source (MIT), with about 73k GitHub stars and roughly weekly releases. Thoughtworks moved it from "Assess" to "Trial" on its Technology Radar in November 2026.

**Install:** `npm install -g @fission-ai/openspec`, or the standalone binary available since v1.15. Then run `openspec init`, which generates skills and slash commands for the assistant you pick. The CLI itself calls no LLM and needs no API key.

### How it is structured

```
openspec/
  specs/<capability>/spec.md        ← living source of truth
  changes/<change-id>/
    .openspec.yaml
    proposal.md                     ← why / what changes / impact
    design.md                       ← technical approach
    tasks.md                        ← implementation checklist
    specs/<capability>/spec.md      ← DELTA: ADDED / MODIFIED / REMOVED / RENAMED
  changes/archive/YYYY-MM-DD-<id>/  ← completed changes
```

**Spec format:** Markdown that reads like Gherkin but is not Gherkin syntax.

```markdown
### Requirement: Session timeout
The system SHALL expire idle sessions after 30 minutes.

#### Scenario: Idle user is logged out
- **WHEN** a user is idle for 30 minutes
- **THEN** the session is invalidated
```

Requirements and scenarios have **no IDs**.

### The loop

| Command | What happens |
|---|---|
| `/opsx:explore` | Think through the problem before committing to anything |
| `/opsx:propose` | The AI creates the change folder: proposal, design, tasks and delta specs |
| *(human review)* | The only hard gate: you edit and approve the plan |
| `/opsx:apply` | The AI implements the tasks |
| `/opsx:sync` | The AI merges the deltas into the main specs |
| `/opsx:archive` | The change folder moves to the archive and the specs are updated |

An expanded profile adds `new`, `continue`, `ff` (fast-forward), `verify`, `bulk-archive` and `onboard`.

### What the CLI checks and what the AI does

| Done by the deterministic CLI | Left to the LLM |
|---|---|
| `validate --strict` (structure, scenario presence, WHEN/THEN steps) | Writing every artifact |
| `list`, `show`, `view` dashboard | `/opsx:verify` (an advisory review that never blocks archive) |
| `archive` (merges deltas, moves the folder) | Spec merges inside the generated archive and sync skills |

**Known issue:** the generated archive skill has the AI merge specs by hand instead of calling the deterministic `openspec archive` command (issue #863). It was moved to Discussions and has not been fixed.

### Strengths
- Very light ceremony: four files per change
- Delta specs suit **brownfield** codebases
- Works with any assistant
- PRs are easy to review (proposal → delta → code)
- Each change has its own folder, so changes rarely conflict

### Weaknesses
- **Spec drift**: specs are not updated during implementation, so you resync by hand
- `verify` is the AI's judgment and does not run tests
- **No requirement → test traceability**: no IDs, no links to tests, no test generation
- Shared files become merge hotspots on teams of 4–6 or more
- Agents generate a lot of spec Markdown, and keeping it current takes discipline
- Too much process for a one-line fix

---

## 3. peak-workflow in brief

**What it is:** a Claude Code plugin (github.com/peakflames/claude-plugins-peakflames). It drives a project from idea to verified epics, with git branches serving as approval gates. A reference example repo is at github.com/peakflames/summit.

### The lifecycle

| Stage | Skill | Output |
|---|---|---|
| Setup | `/setup` | Audits CLAUDE.md for its baseline sections (Tool Hygiene & Operability, UX Baseline, Security Baseline) |
| Discover | `/discover` | `product-vision.md` and `concept-of-operations.md` on a `docs/` branch |
| Mockup *(UI projects)* | `/mockup` | Screen inventory, screen flows, grayscale HTML wireframes |
| Requirements | `/capture-requirements` | Gherkin `.feature.md` files with **TOR IDs**, plus `.feature.tracing.json` sidecars checked by a Haiku sub-agent |
| Plan | `/plan-project` | Phases, then epics with dependencies, each anchored to TOR IDs |
| Build | `/start-epic` | Tasks driven by the epic's TORs, implementation, and a check of each Given/When/Then |
| Verify | `/wrapup-epic` | An **independent** review in a fresh session, on Opus by default |
| Upkeep | `/add`, `/triage`, `/quick-fix`, `/pause`, `/status`, `/refresh-docs` | Size new work, fast-path small fixes, report status, keep docs in sync with the built code |

### What makes it different
- **Stable requirement IDs.** Every scenario is `Scenario: [TOR-NN-XXXXXXX]`. Epics list the TORs they satisfy in a *Requirements Anchors* table, and verification checks against those exact IDs.
- **Each requirement has a status, traced to its tests.** Wrapup finds the tests that cite each TOR ID (or, for `# Verification: operator-observed` scenarios, the manual checklist in `tests/manual/`), checks the Given/When/Then, and records PASS/FAIL per TOR. A non-PASS TOR can close only with an explicit human waiver. `/status` reports coverage per TOR across epics.
- **The human's own checks are recorded.** Before the handoff, wrapup asks the operator whether they did any manual verification beyond the automated gates. If they did, it asks them to describe it and records their words verbatim in the epic handoff and the PR body, so the record shows what was checked by a person, not just by tests.
- **Independent verification is enforced.** Wrapup refuses to run in the same session that implemented the epic, so the verifier does not inherit the implementer's rationalizations. It defaults to a stronger model than the one that typically implements.
- **Git as the approval system.** Planning artifacts live on `docs/` branches, and merging is the sign-off. Work happens on `feature/epic-*` and `hotfix/` branches.
- **Baseline requirements derived automatically.** Tool hygiene requirements (versioning, logging, exit codes, errors) and UX requirements (screen states, focus, contrast, reduced motion) are derived from CLAUDE.md, so they aren't forgotten.
- **A right-sized path for small work.** `/triage` routes each request to HEAVY, EPIC or TRIVIAL, and `/quick-fix` handles fixes under about 2 hours without epic ceremony.

### Strengths
- Traceable end to end: vision → TOR → epic → test → PASS/FAIL, plus the human's recorded manual checks
- Verification is structural (fresh session, stronger model, Given/When/Then for each TOR), not just advisory
- Covers the whole product lifecycle, including discovery, UX and planning
- Fits formal or client-facing work where you must show the requirement was met

### Weaknesses
- Claude Code only
- Heavier upfront: discovery and requirements before the first line of code
- More tokens and more sessions per unit of work
- Assumes gitflow-style branch discipline
- Less natural for a quick change to a codebase that doesn't use it yet; `/migrate-from-epic-workflow` covers only epic-workflow projects

---

## 4. Head-to-head

| Dimension | OpenSpec | peak-workflow |
|---|---|---|
| **Unit of work** | A *change* (feature, fix, refactor) | An *epic* inside a phased plan, or a quick-fix |
| **Scope** | Spec, then implement, then archive | Vision, ConOps, mockup, requirements, plan, implement, verify |
| **Spec format** | Markdown requirements (SHALL/MUST) with WHEN/THEN bullets | Gherkin `.feature.md` with Given/When/Then |
| **Requirement IDs** | None | `TOR-NN-XXXXXXX` on every scenario |
| **Traceability** | Implicit (folder and capability names) | Explicit: tracing sidecars, Requirements Anchors tables, and each TOR traced to the tests that cite it |
| **Living spec** | Yes: deltas merge into `openspec/specs/` | Yes: the feature files *are* the baseline, revised through `docs/` branches |
| **Brownfield support** | Strong (designed around deltas) | Supported (brownfield discovery, `/triage`, `/add`) |
| **Human gates** | Proposal review (by convention) | `docs/` branch merges, epic wrapup, PRs |
| **Verification** | `/opsx:verify`: same-model AI review, advisory, never blocks | `/wrapup-epic`: fresh session, stronger model, PASS/FAIL per TOR traced to its tests; non-PASS needs a human waiver; the operator's manual checks recorded verbatim |
| **Deterministic tooling** | CLI: validate, archive, list, view | Skills use git and the filesystem; integrity rests on the branch and sidecar structure |
| **Planning and dependencies** | None (each change stands alone) | Phases, epic dependency graph, status sidecars |
| **Small fixes** | Same loop (some find it overkill) | `/triage` → `/quick-fix` fast path |
| **Assistant support** | 30+ tools | Claude Code |
| **Ceremony and cost** | Low | Medium–high |
| **Best fit** | Fast iteration, existing codebases, mixed toolchains, solo devs | Client or regulated work, auditable delivery, multi-epic products |

---

## 5. When to pick which

**Pick OpenSpec when:**
- you're adding features to an existing codebase and want guardrails without a big upfront plan
- your team uses a mix of assistants (Cursor, Copilot, Codex, Claude Code)
- "agree before you build" is enough and you don't need proof of verification

**Pick peak-workflow when:**
- you need to *show* that each requirement was met (client sign-off, regulated work, aerospace/defense-style rigor)
- the product is large enough to need phases, epics and a dependency graph
- you want verification that the implementing agent can't talk its way past

**They aren't strictly exclusive.** OpenSpec's community-schema system (for example *anvil*, which adds TDD and an adversarial review; or *epic-driven*) shows people are pushing OpenSpec toward peak-workflow-style rigor. In the other direction, OpenSpec's delta model is a good reference for how peak-workflow handles brownfield changes to an existing requirements baseline.

---

## 6. Ideas peak-workflow could borrow

1. **Delta-style requirement changes.** Mark changes as ADDED / MODIFIED / REMOVED (with reason and migration notes) when a `docs/` branch revises feature files. That gives reviewers a crisp diff of *intent*, not just text.
2. **A deterministic validator CLI.** Script checks for TOR ID uniqueness, Given/When/Then presence and sidecar consistency, so they don't depend on the model. OpenSpec's own pain point (issue #863) shows why LLM-only integrity is fragile.
3. **An "explore" mode.** Allow a no-commitment thinking session before `/discover` or `/add`.
4. **Multi-tool reach.** Generate equivalent commands for other assistants, if the audience grows beyond Claude Code.

---

## 7. Video talking points

- **Hook:** "Two tools, same promise: no code until we agree on the spec. They disagree about *who checks the work*."
- **OpenSpec demo beat:** `/opsx:propose` → show the four files → `/opsx:apply` → `/opsx:archive`, and the delta merging into the living spec.
- **peak-workflow demo beat:** a TOR ID in a feature file → the epic's Requirements Anchors table → `/wrapup-epic` refusing to run in the implementer's session → the per-TOR PASS/FAIL table traced to tests → the operator asked "did you check anything by hand?" and their answer recorded in the PR.
- **Key contrast line:** spec-aware vs. spec-accountable.
- **Honest close:** OpenSpec wins on speed and reach; peak-workflow wins on a record you can audit: every requirement traced to its test and status, plus what a human checked. Pick based on whether you need to *show your work*.

---

## Sources

- OpenSpec repository and docs: https://github.com/Fission-AI/OpenSpec
- OpenSpec workflow docs: https://openspec.dev/docs/the-workflow
- Issue #863 (LLM-driven archive merges): https://github.com/Fission-AI/OpenSpec/issues/863
- Thoughtworks Technology Radar, OpenSpec: https://www.thoughtworks.com/en-gb/radar/tools/openspec
- Spec Kit vs BMAD vs OpenSpec (dev.to): https://dev.to/willtorber/spec-kit-vs-bmad-vs-openspec-choosing-an-sdd-framework-in-2026-d3j
- Spec-driven frameworks compared: https://developertoolkit.ai/en/ecosystem/frameworks/spec-driven-frameworks/
- Spec-driven development with Claude Code (CodeMySpec): https://codemyspec.com/blog/spec-driven-development-with-claude-code
- OpenSpec team workflow write-up: https://austinxyz.github.io/blogs/blog/openspec-harness-team-workflow
- npm registry, @fission-ai/openspec: https://registry.npmjs.org/@fission-ai/openspec
- peak-workflow plugin: https://github.com/peakflames/claude-plugins-peakflames
