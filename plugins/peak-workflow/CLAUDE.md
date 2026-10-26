# CLAUDE.md — peak-workflow plugin

## What This Plugin Is

Requirements-driven development lifecycle in the spirit of DO-330 TQL-5. Formal
Gherkin-style TOR requirements (`TOR-NN-XXXXXXX`) are the single source of truth —
epics implement them, tests derive from Given/When/Then, wrapup verifies against them.

Forked from `epic-workflow` v2.5.1. There is no migration path from epic-workflow projects.

## Skill Inventory

| Skill | Purpose |
|-------|---------|
| `new-project` | Front-door router — routes on the format stamp and dispatches to the right entry point |
| `setup` | Audit CLAUDE.md — ask only what the user alone knows, default the rest behind one confirmation; stub architecture/design-notes docs (run once before discover) |
| `discover` | Adaptive interview → product-vision.md + concept-of-operations.md |
| `mockup` | UI projects only — screen inventory (`S-NN`), per-scenario flows, grayscale wireframes; concretizes ConOps steps |
| `capture-requirements` | Derive TOR requirements → .feature.md + .feature.tracing.json; amend, retire, or record pending changes with Change Records; `<TOR-ID>` mode amends one requirement |
| `plan-project` | Derive epics from TOR IDs → phase indexes + epic specs + sidecars |
| `add` | Add new epic(s) referencing existing TOR IDs |
| `triage` | Route incoming request → HEAVY / AMEND / EPIC / TRIVIAL |
| `start-epic` | Implement an epic — TOR-driven plan + tasks + verification |
| `wrapup-epic` | Independent TOR verification, complete, ship |
| `pause` | Save progress mid-epic |
| `status` | Read-only dashboard — phase progress + Requirements Coverage |
| `quick-fix` | Trivial bug fix on a hotfix/ branch, no TOR changes |
| `refresh-docs` | Refresh architecture.md + design-notes.md from as-built code |
| `upgrade` | Bring a project's files to this plugin's format — numbered steps, one commit each |

## Key Design Invariants

**TOR ID format:** `TOR-{NN}-{XXXXXXX}`
- `{NN}` = 2-digit zero-padded feature file number (stable, never renumbered)
- `{XXXXXXX}` = 7-char random alphanumeric (`LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7`)
- Immutable once merged to develop — they are foreign keys
- Never reused. A retired or superseded ID stays out of every feature file for good, and a
  feature number named in any Change Record is reserved forever
- A change in meaning gets a **new ID** (a `supersede` record names the successor); only a
  same-meaning `reword` with passing test evidence keeps the ID

**Feature file:** `docs/requirements/{NN}-{name}.feature.md`
**Tracing sidecar:** `docs/requirements/{NN}-{name}.feature.tracing.json` (written by Haiku sub-agent)
**Epic sidecar:** `docs/implementation-plan/status/epic-<id>.md` — has a `requirements:` field listing TOR IDs (each owned by exactly one epic), an `owner:` line (`—` until `start-epic` sets it to `git config user.name`), and an optional `waived: TOR-… → <succ>` line written by wrapup

**Orientation (team awareness):** every skill names an epic as `<id> (<slug>) — <Name>`, never by
ID alone. Specs carry `**Planned by:**` / `**Planned:**` / `**Plan branch:**` (written by
`plan-project` and `add`; upgrade step 0001 backfills older specs from git, `—` where git cannot tell). `status` fetches and warns when the base is behind origin, shows what teammates
changed since the user's own last commit, lists ready epics as a table, and **never picks among
several ready epics**. `start-epic` pulls the base, then shows an epic card (with `⚑` lines for a
teammate's epic, phase, owner, or existing origin branch) and confirms before creating the branch,
and removes an empty branch left by a rejected plan.

**Format stamp and guard:** `docs/.peak-workflow.toml` holds `format = N` (written by `setup` on a
new project, moved forward only by `upgrade`; missing = format 0) and `[lifecycle]
disputed_threshold_days`. Every skill starts with one Format Guard, `tor-lifecycle format`:
writing skills stop unless the project is current (or new); `status` and `triage` run degraded
with a banner when it is behind; `new-project` routes to `upgrade`. After the guard, skills read
only the current format — no reader fallbacks for older ones. No skill or step edits the user's
`CLAUDE.md`.

**Branch families:**
- `docs/{task-short-name}` — full planning sequence (discover → mockup [UI] → capture-requirements → plan-project)
- `feature/epic-<id>-<short-name>` — implementation
- `hotfix/<slug>` — quick-fix

**Develop-branch invariant:** merge = approval. Anything on `develop` is approved.

**`develop` is the base, `main` is the release line.** `setup` creates `develop` on every project
(unless existing code declares another strategy) and leaves it checked out. Publishing is always
asked, never defaulted: on Yes, `setup` installs `gh` if needed, creates the repository in the
chosen organization or personal account, makes `develop` the default branch, and protects `main`
and `develop` (pull request + 1 approval, no force-push, no deletion) with `enforce_admins: false`
so administrators bypass — which is what solo-mode merges and the Release Protocol push rely on.
A free-plan private repository cannot be protected; that is a warning, not a failure. The outcome
is recorded as a `**Remote:**` line in the project's Git Workflow section.

**Verification independence:** wrapup runs in a fresh session on a stronger model, blind to
the implementer handoff until verdicts are recorded. `context: fork` is never used for
verification. A fix the verifier applies at wrapup is always recorded as `FIXED DURING WRAPUP`
in the Deferrals table so the human sees the one place self-review occurs.

**Deferral gate:** one contract in `start-epic` and `wrapup-epic` — Fix now / Defer / Stop with a
recommendation. Defer only when the Then clause depends on a later epic whose spec names the TOR.

**Product shape drives the stack:** `setup` asks plain-language shape questions before reading any
sheet — all five (cross-device, sign-in, file uploads, live updates, product-held secret) for a Web
app, 2–4 phrased for callers for a Service or API, 1–3 plus internet access (Q6) for a Desktop app,
none for CLI / Library / Embedded. All five "no" on a Web app routes to `bun-static-spa-stack.md`;
any "yes" routes to `bun-web-app-stack.md`. Sign-in means separate accounts only — data seen from
another device is question 1, and a typed name on a record is an attribution field, not sign-in. The answers are
recorded in `CLAUDE.md` as a `**Product shape:**` block (unasked questions written `not asked`) and
each dropped Stack Summary row is written `N/A — <reason> (shape Q<N>)`, which `plan-project` reads
as a decision and applies through the sheet's **Section 2.1 Dropping a layer** table. `discover` Step 4.5 re-checks the answers against the ConOps scenarios and asks
before changing anything; the revision rides the same `docs/` branch merge as the requirements
baseline.

**Setup asks little, defaults the rest.** `setup` asks only what the user alone knows: Project
Overview (drafted from `new-project`'s description when given), Project type (now including
Embedded), the shape and sign-in questions, a required language or device, and — after the setup
commit — whether to publish to GitHub. Every other value
comes from existing code, then a stack the user named, then the sheet, then the toolchain table,
then a plugin convention, and is shown in one plain-language confirmation — which also carries the
housekeeping (repo files, `.gitignore`, add-on skills, first commit) instead of separate questions.
Existing code is never re-scaffolded: `setup` reads the stack from it and `plan-project`'s skeleton
extends it. A value nothing can decide yet is written
`TBD — set by the walking-skeleton epic` (verbatim — `plan-project` greps it) and the skeleton
resolves it. Defaults must never assume a Bun stack: CLI tools, libraries, embedded software, and
other languages default through the toolchain table, not a sheet.

**Sign-in always means an access rule.** Every sign-in "yes" — named provider or deferred — writes
`**Access rule:** owner-or-permitted-role` (verbatim, greppable) into the shape block. That line
(or, for older projects, the deferral string) drives the access TORs in `capture-requirements`, the skeleton's owner
columns and role field in `plan-project`, the sign-in Security Baseline reminders, and
`wrapup-epic`'s access-control gate. A named provider's round-trip TOR is verified
operator-observed against the real tenant; automated tests sign in through the email-and-password
helper.

**Hardware and safety are first-class for Embedded.** Device-side TORs are verified through a
hardware-in-the-loop harness under `tests/hil/` that the skeleton builds; a missing board (or
provider credentials, or observer) ends the `start-epic` / `wrapup-epic` session with no verdict
until it is available, and an observation no harness can capture is recorded
`operator-observed: <words>` and surfaced in wrapup's Highlights. `discover` drafts what must never
happen for any product that switches equipment; `capture-requirements` writes each hazard the
software can act on as a `# Safety` TOR (hardware safeguards stay assumptions) with an automated
HIL check that is never deferrable; `plan-project` ships it with the first epic that drives that
output. Board and
hosting choices are confirmed with the user, never picked silently.

**Auth defers the organization's provider, never authentication itself.** A "yes" to sign-in with
no approved identity provider selects deferred mode, recorded by the greppable string
`Auth: local accounts now, org SSO deferred`: the walking skeleton ships the sheet's own auth layer
with real email-and-password accounts, an owner column on every table, and one
**owner-or-permitted-role** access rule (owner-only would break the very sharing that made the
answer "yes"). No sign-in stub is ever built — a hand-rolled placeholder is more work, less safe,
and makes every access-control test meaningless. The organization's provider is added later as an
extra method on the same accounts: its own epic, placed by `plan-project` 3A.4 from a numbered
decision in `design-notes.md`. `capture-requirements` routes provider-flow TORs to Coverage Gaps;
`wrapup-epic` runs an access-control gate that can fail an epic. Deferring never restores the
static sheet — shared data needs a server regardless.

**Baseline chains:** `CLAUDE.md` sections written by `setup` become baseline TORs in
`capture-requirements` — `Tool Hygiene & Operability` (all project types, Step 3A.2.1) and
`UX Baseline` (Web app / Desktop app / Hybrid with a UI, Step 3A.2.2). Both sets belong to the
walking-skeleton epic in `plan-project`; the skeleton installs the declared design system
(default shadcn/ui, themed only via CSS-variable tokens) and proves the UX TORs on one reference
screen. `wrapup-epic` re-checks every UX Baseline line on each UI epic as a quality gate. The
bold line labels in the UX Baseline template are cited verbatim by downstream skills — do not
rename them.

**Mockups are planning artifacts:** `mockup` writes `docs/product-vision-planning/ux/` (screens.md
with stable, append-only `S-NN` IDs; grayscale `wireframes/*.html`) and rewrites ConOps Section 5
steps to name screens and controls. Screen IDs are referenced by ConOps steps, TOR Given/When/Then,
and epic `## Screens` tables — never renumbered. Wireframes carry no colors or typefaces; visual
design lands in the walking-skeleton epic. `mockup` never invokes `frontend-design`.

**Companion skills:** `setup` recommends `frontend-design@claude-plugins-official` for UI
projects and `playwright-cli` for web UIs (desktop apps verify through a Playwright Electron
harness, a project dependency rather than a skill). On shadcn stacks `setup` installs the shadcn/ui
skill and `shadcn` MCP server at project scope (committed) and writes the greppable
`**shadcn tooling:**` line into the UX Baseline. Design skills are never read from `CLAUDE.md`:
`start-epic` 11b discovers them from its own session and the plan's **Design pass** step invokes
them before any screen work. Precedence: TOR Given/When/Then > wireframe layout > UX Baseline +
design tokens > design-skill choices. The handoff and wrapup report carry `Design skills used:`;
the verifier never invokes design skills. Playwright's Chromium is installed only once the pinned
`@playwright/test` exists (setup for existing code, the skeleton after `bun install` otherwise).

## Skill File Rules

- `SKILL.md` is the sole source of truth for skill behavior — no logic elsewhere, with two
  exceptions below (`scripts/` and upgrade steps)
- `scripts/` holds deterministic mechanics only — hashing, parsing, and history reads a prompt
  would get wrong at scale. `tor_lifecycle.py` (Python 3.11+, standard library only) is the
  **only** implementation of the fingerprint normalization; no skill restates or re-derives it.
  Skills call it through the POSIX wrapper, `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" <cmd>`,
  which finds a suitable Python or prints an install hint (exit 3). Exit codes: 0 ok, 1 findings,
  2 usage/data error, 3 interpreter. Decisions (what to ask, what to block) stay in `SKILL.md`
- `skills/upgrade/steps/NNNN-<name>.md` are upgrade steps executed by the `upgrade` runner, not
  templates. They are **forward-only and append-only**: a shipped step is never edited; a
  correction is a new step. Each step starts with a detect check (so re-running is harmless) and
  is applied as one commit, `chore(upgrade): step NNNN <name>`
- Template files (`PLAN_TEMPLATE.md`, `HANDOFF_TEMPLATE.md`, etc.) live alongside SKILL.md in the skill directory
- Sibling template files are referenced by path in SKILL.md; Claude Code makes them available at skill load time
- `references/` holds the three stack sheets (Bun static SPA, Bun web, Bun + Electron desktop).
  They are the single source of truth for the greenfield stack: `setup` offers a sheet's
  Section 2 and `plan-project` builds the skeleton from its Sections 3-4 (minus what Section 2.1
  drops for `N/A` rows), so no skill keeps its
  own copy of a sheet's picks or script names. `setup`'s toolchain table is the one default list
  outside the sheets, and it covers only stacks no sheet does (CLI tools, libraries, embedded, other
  languages) — it never overrides a sheet. Sheets are addressed as
  `${CLAUDE_PLUGIN_ROOT}/references/<sheet>.md` — never as a path inside the user's repository.
  For an **existing** project they are reference only — no skill may treat divergence from a
  sheet as a finding, a TOR, or a reason to re-platform
- `[Greenfield only:]` and `[Brownfield only:]` tags inside code-block templates are conditional — the LLM interprets them, not renders them. Tags that must not render go *outside* fenced template blocks as plain prose conditionals.

## Validating Changes

The standard validation method is a **dry-run simulation**: spawn a sub-agent and ask it to
trace through each skill prompt as if executing it on a fresh empty repo for a simple project
(e.g., a Python CLI tool), report any rough edges, then fix and re-run. Two clean passes =
ready to ship.

Prompt template for the simulation agent:
> Read each SKILL.md in greenfield order (new-project → setup → discover → capture-requirements →
> plan-project → start-epic → wrapup-epic) and simulate executing it on a fresh empty repo for
> [project description]. Report any step that would block, confuse, or produce wrong
> output. For each gap: Severity (Critical / UX / Minor), Skill, Step, Problem, Fix.

## Versioning

Follows the repo-level versioning protocol in the repo-root `CLAUDE.md`.
Both `plugin.json` and `CHANGELOG.md` must be updated in the same commit.

- **Patch** — wording, UX clarity, step renumbering, no behavioral change
- **Minor** — new steps, new skills, changed skill contracts
- **Major** — breaking changes to artifact formats or skill API. A major release that changes
  project artifacts ships a new upgrade step and bumps `PLUGIN_FORMAT` in `tor_lifecycle.py`
  (the `format` that `setup` writes to a project's `docs/.peak-workflow.toml`). It may then delete
  compatibility clauses for formats the `upgrade` runner can bring forward
- **Changelog entries:** one bullet per change, each ≤ 50 words, no rationale essays —
  see "Changelog entry style" in the repo-level CLAUDE.md.

Current version: see `.claude-plugin/plugin.json`.
