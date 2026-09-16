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

The user's description of the product (may be empty — `/peak-workflow:new-project` passes it
through): $ARGUMENTS

Follow these steps exactly:

## Step 1: Read CLAUDE.md and Detect Existing Code

Read `CLAUDE.md` at the repo root. If it doesn't exist, say so in one line and treat every
section in Step 2 as `[MISS]` — Step 4 creates the file. Do not ask permission to create it;
running this skill is the request.

Then check whether the repository already holds code: a build manifest at the root or one level
down (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `*.csproj`, `*.sln`,
`CMakeLists.txt`, `platformio.ini`, `Makefile`) or a populated `src/`. Record
`code_present = true / false`. Step 3 reads defaults from the code when it is present, and from
a reference sheet or the toolchain table when it is not.

## Step 2: Check Required Sections

Check for the presence and completeness of each section below. Report a status for each:

| Section | What to check |
|---------|---------------|
| **Project Overview** | Two to four plain sentences: what the product is, who uses it, and what it replaces or improves. `docs/architecture.md` §1 and the README stub (Step 7.1) are derived from it |
| **Tech Stack** | Lists the languages, frameworks, package manager, and key libraries used |
| **Local Environment** | Documents how to start the project locally (every process it has) and run its tests, and that verification uses the real running project rather than mocked responses |
| **Tool Hygiene & Operability** | Declares project type (CLI / Web app / Desktop app / Service / Library / Embedded / Hybrid) and the project's chosen mechanisms for: version exposure to the user, version stamped at log startup, version single source of truth, logging convention (levels and format), exit code convention, stdout/stderr discipline, and error-message standard. These mechanisms become baseline TOR requirements via `/peak-workflow:capture-requirements`. |
| **UX Baseline** | Project type Web app, Desktop app, or Hybrid with a UI only. Declares the design system (default shadcn/ui on Tailwind, themed only through CSS-variable tokens) and the interaction conventions every screen must meet: screen states, keyboard & focus, forms, destructive actions, progress feedback, layout floor, contrast, reduced motion, navigation, and (desktop) application-menu conventions. Each TOR line becomes a baseline UX TOR via `/peak-workflow:capture-requirements` (Step 3A.2.2); the walking skeleton in `/peak-workflow:plan-project` installs the design system; `/peak-workflow:wrapup-epic` runs the UX Baseline check on every UI epic. For CLI / Service / Library / Embedded projects report `[N/A] UX Baseline — no user interface`. If Tool Hygiene & Operability is also missing, the Project type is not yet known — report `[MISS] UX Baseline — resolved after Project type is captured in Step 3` and let Step 3 turn it into `[N/A]` or a populated section. |
| **Security Baseline** | Lists the load-bearing coding-standard reminders that are NOT testable as positive observable shall-statements: no `shell=True` / `eval` on user input, no logging of secrets or PII, no secrets committed to the repo. Reviewed by `/peak-workflow:wrapup-epic`, not derived as TORs. |
| **Peak Workflow** | References the peak commands (`/peak-workflow:discover`, `/peak-workflow:mockup`, `/peak-workflow:capture-requirements`, `/peak-workflow:plan-project`, `/peak-workflow:add`, `/peak-workflow:triage`, `/peak-workflow:start-epic`, `/peak-workflow:wrapup-epic`, `/peak-workflow:pause`, `/peak-workflow:quick-fix`, `/peak-workflow:refresh-docs`, `/peak-workflow:status`, `/peak-workflow:setup`) and points to the requirements directory (`docs/requirements/`) and implementation plan |
| **Verification & Quality Gates** | Lists concrete checks to run before marking an epic complete (e.g., build, tests, linting, visual checks, brand audits) |
| **Important Reminders** | Project-specific constraints that prevent common mistakes |
| **Reference Materials** | Pointers to docs, patterns, or external resources that inform implementation |
| **Git Workflow** | Documents branch strategy (including epic branch naming convention `feature/epic-<id>-<short-name>` where `<id>` is a legacy integer or 7-character alphanumeric, and quick-fix convention `hotfix/issue-<N>-<slug>` or `hotfix/<slug>`), merge preferences (`--no-ff`), push approval rules, and files that must never be committed (e.g., `.env`, credential files, `appsettings.*.local.json` — not a template `appsettings.json` with no secrets, which is normally committed) |
| **Verification Before Commit Rule** | Prescribes the implement → lint → build → verify → commit sequence; explains why compiled code ≠ correct behavior |
| **Release Protocol** | Documents the full release flow: changelog finalization, merge to main, tagging convention, post-release version bump, and where the version lives in the codebase |

Report the result as a checklist:
```
[PASS] Tech Stack — found
[PASS] Peak Workflow — found with capture-requirements and TOR references
[MISS] Verification & Quality Gates — section missing
[WEAK] Important Reminders — section exists but has no content
[N/A]  UX Baseline — no user interface
```

## Step 3: Fix Missing/Weak Sections — Ask Little, Default the Rest

Assume the person running this has never built or deployed software. Ask only what they alone
can know. Everything else has a default, and a default is **applied, not asked**.

Every value in every section below is one of three kinds:

| Kind | What it is | How to handle it |
|---|---|---|
| **Ask** | Only the user knows it: what the product is, what kind of thing it is, the product-shape answers, how people sign in and who may do what, a language or platform they are required to use, the device it runs on | Ask in plain language, in the order below, one short block at a time |
| **Default** | Something already decides it: the existing code (`code_present`), the chosen reference sheet, the toolchain table below, or a plugin convention (branch names, `--no-ff`, tag `vX.Y.Z`, Keep a Changelog, the Security Baseline) | Fill it in silently. Never turn it into a question |
| **Later** | Nothing decides it yet and the user cannot know — e.g. the build command for firmware whose vendor tools are not chosen | Write `TBD — set by the walking-skeleton epic` and move on. `/peak-workflow:plan-project` makes the skeleton resolve every such line |

**Precedence for defaults:** existing code, then a stack the user named, then the reference
sheet, then the toolchain table, then a plugin convention. When `code_present = true`, read the
values from the repository before anything else — scripts in the manifest, the CI workflow,
test directories that exist, `git tag --list`, an existing `CHANGELOG.md` — and never let a sheet
or table value override what the code already does.

**The only questions, in this order** — skip any already answered by `CLAUDE.md`, by the code,
or *explicitly* by `$ARGUMENTS` (a description that says "firmware" settles the project type; one
that says "I think it's an ESP32 but I'm not sure" does not settle the device — confirm it):

1. *Project Overview* — below.
2. *Project type* — below.
3. *Required language or platform* — under Tech Stack below. For Embedded, also the device; for
   Desktop app, also which computers it runs on and whether they have internet.
4. *Shape questions*, with the sign-in follow-ups — Web app, Hybrid with a web UI, Service or API
   (questions 2–4, phrased for the software that calls it), and Desktop app (questions 1–3).
5. *One confirmation* of everything defaulted — below.

The only follow-ups allowed are the ones these five items define: the phone-or-app-store check
under Project type, the separate-accounts clarifier and the provider / audience / roles follow-ups
under question 2, and the internet / target-OS question for Desktop apps.

Nothing else is a question. Do not ask how to run, build, test, or lint the project; where tests
live; the logging format or file; where the version lives; the branch strategy, merge style, or
push rule; files never to commit; the release branch, tag format, or CI behaviour; whether to
create a CHANGELOG; whether to append missing `.gitignore` entries; whether to install a companion
skill; or whether to make the first commit. Each has a default in its section below and appears
in the confirmation. A user who already knows these and wants something else says so there.

**Project Overview** (if missing):

If `$ARGUMENTS` describes the product, draft the overview from it and fold it into the
confirmation rather than asking. Otherwise ask one question: *"In a sentence or two, what are
you building, and who is it for?"* Write two to four plain sentences under `## Project
Overview` at the top of `CLAUDE.md`. Do not interview for more — `/peak-workflow:discover` does
that.

**Project type** (if `Tool Hygiene & Operability` is missing — ask it here, early, because it
routes everything after it). Pick exactly one. Lead with the plain gloss and keep the technical
label as the parenthetical, never the other way round. A "whatever you recommend" is answered from
the description's constraints, stated back in one sentence — e.g. *"It has to work on a PC with no
internet, so I'd make it a desktop app"* — not by guessing:

- **CLI tool** — people run it by typing a command in a terminal
- **Web app** — people open it in a web browser, on a laptop, tablet, or phone (server-rendered
  or SPA). *A tablet or phone app people reach at a web address is this, not a desktop app.*
- **Desktop app** — people install and launch it as a window on their computer (Electron /
  Tauri / native)
- **Service or API** — no screen at all; other software calls it (headless HTTP / gRPC /
  message endpoints)
- **Library** — other developers add it to their own code; it has no end-user runtime
- **Embedded** — it runs on a device or circuit board rather than on a computer or phone
  (firmware, microcontroller, single-board computer)
- **Hybrid** — two or more of the above (e.g., a command-line tool that also runs as a service)

If the user describes something for a phone or tablet, ask whether people would open it in a
browser or install it from an app store before recording the answer — the two route to
different stacks, and "app" alone does not distinguish them. If the description could be a
program on a computer *or* software on the device itself ("it reads the sensor"), ask which
one runs where; a desktop app that talks to a device is a Hybrid.

**Tech Stack** (if missing):

Ask one question: *"Is there a programming language or platform you have to use — because your
team already knows it, your organization requires it, or the device needs it? If not, I'll
pick."* A "no", "I don't know", or "whatever you recommend" is an answer, not a gap: take the
sheet the shape questions route to (Web app, Service or API, Desktop app) or the toolchain table
below (CLI tool, Library, Embedded). A named language or platform that no sheet uses (e.g. .NET
for a web app) skips the sheet: record it, take its row in the toolchain table, and still record
the shape answers — they decide which layers the project needs. A user who names a full stack
gets it recorded as named, with only the gaps filled from the table.

For **Embedded**, also ask: *"Do you know which circuit board or chip it will run on? A guess is
fine."* Record the answer the way an unconfirmed sign-in provider is recorded — a Tech Stack row
`Board: candidate <name> — unconfirmed` (or `Board: not chosen`) — never discard the hint and
never treat it as decided. Every Embedded toolchain value that depends on the board stays
`TBD — set by the walking-skeleton epic`; the skeleton confirms the board with the user before
resolving them, because choosing it means buying hardware.

For **Desktop app**, also ask: *"Which computers will people run it on — Windows, Mac, or both?
And will those computers have internet?"* Record `Target OS: …` in the Tech Stack table (the
skeleton packages only for those) and the internet answer as shape **Q6** below. Installers are
built on the operating system they target: when the computer the user builds on is not a target
(e.g. a Mac building for Windows), record `Build: CI runner for <target OS>` — the CI runner has
internet even when the target computers do not — and the Release Protocol CI note names it.

**Shape questions — ask before offering any stack.**

A project type does not determine a stack on its own: a Web app that stores everything in the
browser and a Web app with accounts and file uploads share almost no layers. Ask these five
questions **before** reading any sheet, for project type **Web app** or **Hybrid with a web UI**.

Ask them in plain language and assume the user has never deployed software. Do not use the words
client-side, backend, database, authentication, or object storage in the questions — those are
the answers, not the questions. Ask all five as one block and accept one combined answer.

| # | Ask it like this | What a "yes" pulls in |
|---|---|---|
| 1 | "If someone uses this on their laptop and later opens it on their phone, should they see the same information — or is it fine for it to live only on the device they used?" | Server, database, migrations, container |
| 2 | "Will people need to sign in? Does anyone other than them ever see their information?" | Auth, sessions, per-user access rules |
| 3 | "Will people attach photos, PDFs, or other files?" | Object storage, presigned uploads, local S3 |
| 4 | "Does anything on screen need to update by itself while they are watching — like a message arriving from someone else?" | Live updates — a broadcast stream, long-lived connections |
| 5 | "Does the product need to keep any password or key of its own secret from the people using it?" — **skip this one and record "yes — implied by sign-in / file uploads" if question 2 or 3 was yes**; it is a consequence of those answers, not an independent choice, and a lay "no" here is simply wrong | Server — a browser-only app cannot hold a secret |

If the user is unsure on questions 1, 3 or 4, treat it as **no** and say so plainly: *"I'll assume
no for now — every one of these is easier to add later than to carry unused."* Adding a server to
a browser-only app is a bounded migration the static sheet's Growth Path describes (it rates the
move Medium, not free); carrying an unused storage and streaming layer through every epic is not.

**Question 2 is the exception: unsure means yes.** "No" there selects a stack with no access
control at all, so guessing wrong is only cheap in one direction. If the user hesitates, re-ask
with a concrete example — *"Will a manager, a colleague, or an administrator ever need to open
something another person entered?"* — and take a maybe as a yes.

**If question 2 is "yes", ask two follow-ups.** Sign-in is the answer most likely to stall a
project: an organization's identity provider is usually someone else's decision, behind an IT
approval the user cannot give during a planning session.

- *Provider:* "Do you already know how people will sign in — a provider your organization has
  approved, such as Microsoft, Google, or Okta — or is that still to be worked out?"
- *Roles:* "Will different people be able to do different things — for example, some only look,
  some enter the work, and others review or approve it?"

**Separate accounts, or just a name on each record?** Before treating question 2 as "yes", ask one
clarifier: *"Does each person need their own private sign-in, or is it enough to note who entered
something — for example by typing their initials?"* Noting who entered something is an
**attribution field**, not sign-in. People who share one computer and one login, or who only
receive an exported file, do not "see the data" in the sense question 2 means. Record
`no — attribution only (entered-by field)` and route as a "no" (Important Reminders records the
field so discovery turns it into a requirement). Only separate accounts is a "yes" here —
*seeing the same data from another device* is question 1's to answer, never re-asked under
question 2. **"Unsure" means yes only about separate accounts.** A "maybe later" about another
computer or device follows question 1's rule (unsure means no) and is recorded as a growth note in
the shape block, not as sign-in.

A "yes" to question 2 routes to the web-app sheet either way, and a Desktop app with a "yes"
becomes a Hybrid with the web sheet's service layers. When `code_present = true` or a required
platform skipped the sheets, it adds the sign-in layers to that stack instead. Once anyone other than the owner can see the data from another
device, the rule about who sees what has to be enforced somewhere the person cannot edit, which
means a server. Deferring the provider does not restore the static sheet — say this plainly rather
than letting the user infer that deferral keeps the project small.

| Provider answer | What goes in the stack |
|---|---|
| Named and approved | The sheet's auth layer with that provider enabled (the web sheet's 6.3 shows Google and Microsoft). Record the provider in the Tech Stack table. Tests still sign in through the email-and-password test helper; the provider round-trip is verified by hand against the real tenant. **Ask who signs in:** only people inside the organization (*org-only* — restrict to the organization's domain), or outsiders too — volunteers, customers (*mixed audience* — no domain restriction; the organization's role, e.g. coordinator, is granted only to accounts the provider verifies as inside the organization's domain; outsiders may use the same provider with a personal account or email and password). Record the mode next to the provider. |
| A vendor is likely but unconfirmed — *"I think we use Microsoft, I'd have to ask IT"* | **Deferred mode** below, and record the candidate and who confirms it. Hand the user the one question to ask: *"Are we on Microsoft Entra ID, and can we register an application?"* A named vendor usually turns the later work into a configuration change, not a rebuild — do not discard the hint. |
| Still to be worked out, or "I don't know" | **Deferred mode** below. |

**Deferred mode — local accounts now, the organization's sign-in later.** Defer *who vouches for
the identity*. Never defer authentication itself, and never defer *who owns the data*. Ownership is
the half that is ruinous to retrofit — it means migrating every table and rewriting every query
later — and a hand-built sign-in placeholder is never the answer, because the sheet already ships
a real one.

**Do not build a sign-in stub.** The web sheet's auth layer (Better Auth) supports email and
password out of the box, with real password hashing, real session cookies, and a real test helper.
Email-and-password accounts need no IT approval, no tenant, and no provider decision — so the
project gets *real authentication from the first epic*, and the organization's provider is added
later as an additional method against the same user and session tables. A fake identity module
would be more work, less safe, and would make every later access-control test meaningless.

**Every sign-in "yes" — named provider or deferred — records items 1–3 below** and writes the
greppable line `**Access rule:** owner-or-permitted-role` in the `**Product shape:**` block. Other
skills key their access-control TORs, skeleton work, and wrapup gate on that line, so keep it
verbatim. **Deferred mode adds items 4 and 5.**

1. **Authentication is real from the first epic** — the sheet's auth layer, with email and password
   enabled at least for tests. No placeholder, no bypass, no "anonymous in development" default.
2. **Ownership is built now.** Every record carries an owner, and every read and write goes through
   one access rule. The rule is *owner, or a role the product grants access to* — not owner-only.
   A product that answered question 2 "yes" because someone else reviews the work needs that
   someone else to be able to read it; an owner-only filter makes the product's reason for
   existing impossible.
3. **Roles are modelled now if the roles follow-up was yes** — name the actual roles the user gave
   (e.g. *inspector*, *supervisor*), a role field on the account, and one permission helper every
   route calls. Write down what each role may read and may change; that sentence is what the
   access rule in item 2 implements.
4. **The organization's provider is added, not swapped in.** It becomes an extra sign-in method on
   the same accounts. Plan for what it actually brings: a callback route, the provider's own
   session configuration, mapping directory groups onto the roles from item 3, and updating the
   end-to-end sign-in helper. It is not a one-module change.
5. **The deferral is an open decision**, recorded in the Tech Stack table as a row whose text
   begins with the exact greppable string `Auth: local accounts now, org SSO deferred` — other
   skills match on that string, so keep it verbatim — followed by the candidate provider and who
   confirms it, when the user named one. Write the same decision into `docs/design-notes.md`.
   `/peak-workflow:plan-project` turns it into its own epic.

Tell the user, in plain language, what this does and does not buy: *"You can build and use the
whole product this way — people will sign in with an email address and a password, which is real
security, not a placeholder. Connecting it to your organization's own sign-in is a separate piece
of work later, usually a week or more with your IT people involved. Doing it this way means you
are not blocked on them now; it does not make that work smaller."*

**Route on the answers, not on the project type alone.** Two things skip every sheet, whatever
the answers: `code_present = true` (the code is the stack — see *Existing projects* below), and a
required language or platform no sheet uses (take its toolchain-table row). The shape answers are
still recorded in both cases; they decide which layers the project needs.

| Answers | Reference sheet — read it before answering |
|---|---|
| Web app, **all five "no"** | `${CLAUDE_PLUGIN_ROOT}/references/bun-static-spa-stack.md` — browser-only SPA, data in IndexedDB, deployed to GitHub Pages |
| Web app, **any "yes"** | `${CLAUDE_PLUGIN_ROOT}/references/bun-web-app-stack.md` |
| **Service or API** | `${CLAUDE_PLUGIN_ROOT}/references/bun-web-app-stack.md` (same sheet; skip Section 7 Frontend Wiring and the SPA half of Section 8). Ask questions 2–4 phrased for callers — *"Must callers identify themselves?"*, *"Will callers upload files?"*, *"Must callers be told about changes as they happen?"* |
| **Desktop app** | `${CLAUDE_PLUGIN_ROOT}/references/bun-electron-desktop-stack.md` — ask questions 1–3 (question 1 as *"…on another computer?"*) and record Q6; a "yes" to any of 1–3 means the desktop app also needs the web sheet's service layers, which makes it a Hybrid |
| **Hybrid** | The sheet matching the primary interface, plus the other sheet's layers for the secondary one |
| **CLI tool / Library / Embedded** | No sheet, and no shape questions — the toolchain table below |

Paths are relative to the installed plugin, not the user's repository. If `${CLAUDE_PLUGIN_ROOT}`
does not resolve in this session, locate the sheet under the plugin's own `references/` directory
— do not proceed from memory.

**Record the answers, not just their consequences.** Write the block verbatim in this shape above
the Tech Stack table — `/peak-workflow:discover` Step 4.5 reads it back by these fixed labels, so
keep `Q1:`–`Q5:` even when an answer is short. A question not asked for this project type is
written `not asked (<type>)`, never left out. `Q6` appears for Desktop apps only. CLI tool,
Library, and Embedded projects get no shape questions and **no `**Product shape:**` block at all**.

```markdown
**Product shape:** (questions asked by `/peak-workflow:setup` before the stack was chosen)

- **Q1 Same information on another device:** [yes / no / not asked (<type>)] — [in the user's own words]
- **Q2 Sign-in, or others see the data:** [yes / no / no — attribution only (entered-by field)] — [in the user's own words]
  - **Sign-in:** [named provider — org-only (domain X) / mixed audience (org domain X) / `Auth: local accounts now, org SSO deferred` — candidate: X, confirmed by: Y]
  - **Roles:** [no / the actual role names and what each may read and change]
  - **Access rule:** owner-or-permitted-role
- **Q3 File attachments:** [yes / no / not asked (<type>)] — [in the user's own words]
- **Q4 Updates on screen without the person acting:** [yes / no / not asked (<type>)] — [in the user's own words]
- **Q5 Product holds a secret of its own:** [yes / no — "yes, implied by Q2/Q3" when either was yes / not asked (<type>)]
- **Q6 Internet on the computers it runs on:** [yes / no] — Desktop app only
- **Growth notes:** [anything answered "maybe later", e.g. "maybe a second PC later" — not built now]
```

The three indented lines under Q2 are written only when Q2 is "yes". Any Stack Summary row the
answers drop is written into the table as `N/A — <reason> (shape Q<N>)` rather than omitted. `/peak-workflow:plan-project`
reads the Stack Summary as a completeness checklist for the walking skeleton, so a row that is
simply absent reads as an oversight, while `N/A — no file uploads (shape Q3)` reads as a
decision.

On the web sheet the rows each answer drops are: Q2 "no" → Auth; Q3 "no" → Object storage and
Local S3; Q4 "no" → Live updates; Q5 "no" → Secrets (only reachable when Q2 and Q3 are also "no").
Per-request streaming is marked `N/A — no streamed responses` unless the product streams a long
generated reply (an AI answer, a report being written). A Service or API marks the frontend rows
(Frontend build, UI, Styling, Icons, Client state, Routing, Component tests)
`N/A — no user interface (Service or API)`.
On the desktop sheet: Q6 "no" → Auto-update. Each sheet with a **Section 2.1 Dropping a
layer** lists what else leaves with the row — `plan-project` applies it. Not every "no" maps onto
a row — the static sheet has already excluded the server layers, and a Q1 "no" on the web sheet
removes nothing. Where there is no row to mark, the `**Product shape:**`
block **is** the record; do not invent a row to carry the `N/A`.

Read the matching sheet's **Section 2 Stack Summary** and take that table as the stack, with any
shape-dropped rows already marked `N/A`. Do not invent, substitute, or "modernize" a pick, and
do not paraphrase from memory — the sheet is the single source of truth. The stack is shown to
the user in the single confirmation at the end of this step as a few short plain lines (where it
runs, where data lives, how people sign in, how it is checked — technical names in parentheses),
not as its own question and not as one line per layer. Record the accepted picks in
`CLAUDE.md`'s Tech Stack table, and note in the section which sheet it came from so
`plan-project` can read the same one. Sections 3 (Repository Layout), 4 (Configuration Files),
and the later sections are for `plan-project` to apply when it builds the walking skeleton —
not to be dumped into the conversation here.

**Toolchain table — the defaults when no sheet applies** (CLI tool, Library, Embedded, or a
language no sheet uses). With no language named, CLI tool and Library take TypeScript on Bun.
A language not listed takes its community-standard toolchain, named as the source in the
confirmation; where no clear standard exists, write `TBD — set by the walking-skeleton epic`.

| Stack | Run / start | Tests (Test directories) | Lint / format fix | Build | Version single source of truth | Logging (configured at) |
|---|---|---|---|---|---|---|
| TypeScript on Bun | `bun run src/index.ts` | `bun test` (`tests/`) | `bunx biome check .` / `bunx biome check --write .` | CLI: `bun build --compile src/index.ts --outfile dist/<name>`; Library: `bunx tsc --noEmit` | `package.json#version` | plain text to stderr (`src/log.ts`) |
| Python | `uv run <name>` | `uv run pytest` (`tests/`) | `uv run ruff check .` / `uv run ruff format .` | `uv build` | `pyproject.toml [project.version]` | stdlib `logging`, plain text to stderr (`src/<pkg>/log.py`) |
| Rust | `cargo run --` | `cargo test` (`tests/`) | `cargo clippy -- -D warnings` / `cargo fmt` | `cargo build --release` | `Cargo.toml [package.version]` | `tracing` to stderr (`src/main.rs`) |
| Go | `go run .` | `go test ./...` (`.`) | `go vet ./...` / `gofmt -w .` | `go build ./...` | `const Version` in `version.go` | `log/slog` to stderr (`main.go`) |
| C# / .NET | `dotnet run --project src/<Name>` | `dotnet test` (`tests/`) | `dotnet format --verify-no-changes` / `dotnet format` | `dotnet build` | `<Version>` in the app's `.csproj` (or `Directory.Build.props`) | `Microsoft.Extensions.Logging` JSON console (`Program.cs`) |
| Embedded C / C++ | `TBD — set by the walking-skeleton epic` | `TBD — set by the walking-skeleton epic` (host-side unit tests in `tests/unit`, hardware-in-the-loop in `tests/hil`) (`tests/unit tests/hil`) | `TBD — set by the walking-skeleton epic` | `TBD — set by the walking-skeleton epic` (the board's own tools usually decide it — ESP-IDF, PlatformIO, Zephyr, vendor IDE) | `TBD — set by the walking-skeleton epic` | debug / serial console, plain text (`TBD — set by the walking-skeleton epic`) |

The toolchain table is the *language* default and exists only for projects no sheet covers; it
never overrides a sheet or existing code. Embedded values that depend on the board are all `TBD`
until the skeleton confirms the board — a bare CMake guess would be wrong for most boards.
`tests/hil` holds the hardware-in-the-loop checks that need the board connected.

Every project type that stores data: start with SQLite unless the user names another database,
the product has no persistence, or it is Embedded (record storage as `TBD — set by the
walking-skeleton epic` until the device is known).

**Existing projects: reference only.** If `CLAUDE.md` already has a populated Tech Stack, **or
`code_present = true`**, the code is the stack: read the Tech Stack from the manifests and record
it; this step asks no stack question. Do not compare it against the sheets, do not report
divergence, and never propose re-platforming, rewriting, or swapping a library to match. The
sheets apply to an existing project for one thing only: noticing a **layer the project has not
decided yet** (e.g., no database, no migration tool, no E2E runner, no CI, no secrets convention).
Write them into the Tech Stack section as one line — `**Not decided yet:** database (default
SQLite), CI` — which `plan-project`'s skeleton reads, and show the same list in the confirmation.
List only layers the Project Overview actually needs: container, hosting, and backups only when
deploying is in scope; secrets only when the product holds one. For existing code, a missing
database always goes on this line with its default, rather than being recorded as decided. Never
ask about them separately, never propose a rewrite.

When a value the defaults need is missing from existing code — typically the version element
(`<Version>` absent from a `.csproj`, no `version` in `package.json`) — write
`TBD — set by the walking-skeleton epic (add <what> to <which file>)` naming the exact file, rather
than a default that points at something that does not exist.

**Local Environment** (if missing) — **default, no questions.** On a new project nothing exists
to run yet, so there is nothing the user could answer. Take the commands from the first source
that has them:

| Stack | Start | Tests | Notes to write |
|---|---|---|---|
| Existing code | The manifest's scripts / the README; where they are silent, the toolchain-table row for the detected language | The manifest's test script, else the toolchain row | Whatever the code already does |
| Toolchain table row (named language, or CLI tool / Library / Embedded) | Its *Run / start* column | Its *Tests* column | Embedded: host-side tests run on the computer; `tests/hil` and on-device runs need the board connected and are `TBD — set by the walking-skeleton epic` until it is chosen |
| Web sheet | `bun run dev` (API on `:3000`, web on `:5173` with proxy); `docker compose up -d minio minio-init` first when object storage is in the stack | `bun run test`; `bun run test:e2e` (needs Docker running and `.env` copied from `.env.example`) | The sheet's Section 10 Daily Commands. Name Docker as a prerequisite |
| Static SPA sheet | `bun run dev` (Vite on `:5173`) | `bun run test`; `bun run test:e2e` (builds and previews the production bundle first) | No server — nothing to mock; verification uses the real app and its real IndexedDB |
| Desktop sheet | `bun run dev` (electron-vite, live main process, renderer HMR) | `bun run test`; `bun run test:e2e` (builds, then Playwright Electron against the build) | Needs Bun and Node.js 22.12+ (LTS) installed — Playwright and electron-vite run on Node. Add the web sheet's rows only if the app also runs a service of its own |

Always write this line, for every project type — it is a plugin convention, not a question:
*"Verification runs against the real, running project with its real local data. Never mock the
project's own API or database to make a check pass."* Embedded adds: *"Host-side unit tests may
fake the hardware (sensors, relays); any requirement about the device itself is verified on the
connected board."*

**Tool Hygiene & Operability** (if missing):

This section captures the project's chosen mechanisms for the load-bearing tool-hygiene
practices that `/peak-workflow:capture-requirements` will turn into baseline TOR
requirements. **Only item 1 was asked** (earlier in this step). Items 2–8 are **defaults**: fill
each from the existing code, the sheet, or the per-type default below, and show them in the
single confirmation — they are engineering conventions a non-technical user cannot weigh, and
every one has a correct answer for the project type.

1. *Project type* — the answer to the project-type question asked earlier in this step.

2. *Version exposure* — how does an end user observe the running tool's version? The
   mechanism varies by project type; the requirement that *some mechanism exists* is
   universal. Defaults:
   - CLI: `--version` flag printing `<name> v<semver>` to stdout, exit 0
   - Web app (with a server): GET `/version` endpoint returning JSON `{name, version}`, plus the
     version in the app footer (web sheet: `apps/api/src/app.ts` and
     `apps/web/src/components/app-footer.tsx`, both reading `packages/core/src/app.ts`)
   - Web app (browser-only / static SPA): no endpoint is possible — the version comes from
     `package.json#version`, injected at build time as `__APP_VERSION__` and rendered in the app
     footer, plus the version-stamped first console line
   - Desktop app: Help > About menu item (App menu > About on macOS) opens an in-app About
     dialog rendered in the renderer showing `<name> v<semver>` obtained from
     `app.getVersion()` over IPC, plus the startup log line. Native About panels sit outside
     the DOM and cannot be asserted by Playwright — do not use `role: 'about'` alone.
   - Service/API: GET `/version` returning JSON `{name, version}`, reachable without signing in
   - Library: `__version__` (or language-equivalent) constant exported from package root
   - Embedded: a `version` command on the device's debug or serial console printing
     `<name> v<semver>`; a device with no console exposes the version through whatever channel
     it has (a readable register, a status message, a BLE characteristic) — `TBD — set by the
     walking-skeleton epic` until the board is known
   - Hybrid: list each applicable mechanism

3. *Version stamped at log startup* — confirm the project will emit the tool name and
   semantic version on the first log line at process / app / request-handler startup
   in the Logging format (`[INFO] myapp v1.2.0 starting` for plain text; a JSON record whose
   message is `myapp v1.2.0 starting` for a JSON logger). Desktop app: the main process logs
   `<name> v<semver> starting` (the `productName`) as its first line at startup. Static SPA: `main.tsx`
   writes `<name> v<semver> starting` to the browser console before mounting the router — the
   console is the only log this shape has. Embedded: the boot banner `<name> v<semver> starting`
   is the first line on the debug or serial console.

4. *Version single source of truth* — the one file the version number is defined in, read
   everywhere else. Default: the sheet's `package.json#version`, or the toolchain table's
   *Version single source of truth* column.

5. *Logging convention*:
   - Levels — default `DEBUG / INFO / WARN / ERROR`, written in the logger's own level names
     (e.g. `Debug / Information / Warning / Error` for `Microsoft.Extensions.Logging`, `debug /
     info / warn / error` for Pino and electron-log)
   - Format — `structured JSON` / `key=value` / `human-readable plain text`
   - Configured at — a file path
   - Web app / Service on the web sheet: Pino, structured JSON to stdout, level from a
     `LOG_LEVEL` env var, configured in `apps/api/src/logger.ts` and reused by `hono-pino`. The
     startup record is JSON — `{"level":30,"msg":"my-app v0.1.0 starting",…}` — not a `[INFO]`
     text line; write the example in that form.
   - Any stack **not** on a sheet (e.g. a .NET service): the toolchain table's *Logging* column.
     Never write a sheet's logger path for a project that did not take the sheet.
   - CLI tool / Library default: human-readable plain text to stderr, level from a `--verbose`
     flag or a `LOG_LEVEL` env var, configured in the entry-point module.
   - Embedded default: human-readable plain text on the debug or serial console, configured at
     `TBD — set by the walking-skeleton epic`.
   - Static SPA default: the browser `console` — there is nowhere to ship logs to. Declare the
     levels in use and keep `console.debug` out of the production path.
   - Desktop app default: electron-log in the main process (`electron-log/main`,
     `log.initialize()`), file under `app.getPath('logs')`, human-readable plain text;
     renderer logs route through `electron-log/renderer`.

6. *Exit code convention* (CLI / Hybrid only — otherwise mark `N/A — not a CLI`; Desktop
   app: `N/A` unless the app also has a CLI entry point; Embedded: `N/A — firmware does not
   exit`):
   - 0 — success
   - 1 — operational failure (file not found, permission denied, downstream failure, etc.)
   - 2 — invalid invocation (bad flags, missing required args)
   - Any additional codes the project defines.

7. *stdout / stderr discipline* (CLI / Hybrid only — otherwise mark `N/A`; Desktop app:
   `N/A` unless the app also has a CLI entry point):
   - stdout — data, parseable output, primary results
   - stderr — diagnostics, progress, errors, log output

8. *Error message standard* — user-facing errors name the problem AND the next user action
   (on screen for Web / Desktop apps, on stderr for CLI tools, in the HTTP error body for a
   Service or API — RFC 9457 problem details with a `detail` naming the next action — and on the
   debug console, plus any indicator the device has, for Embedded). Format examples:
   CLI — `Error: configuration file not found at <path>. Try --config to specify an alternate path.`
   Desktop — `Could not save order #123: the database file is locked. Close other copies of the app and try again.`
   Embedded — `ERROR E012: temperature sensor not responding on I2C bus 1. Check the sensor cable, then power-cycle.`

Generate the section using this template, filling in the project-specific answers:

```markdown
## Tool Hygiene & Operability

This section declares the project's conventions for the load-bearing tool-hygiene practices.
Each line is a baseline TOR requirement source — `/peak-workflow:capture-requirements` will
ensure at least one TOR exists per active line, written in the form appropriate to the
declared mechanism. Lines marked `N/A` are skipped. Project type and Version single source
of truth are declarations, not TOR sources.

**Project type:** [CLI tool / Web app / Desktop app / Service or API / Library / Embedded / Hybrid]

**Version exposure:** [Mechanism declaration. Example for a CLI: `--version` flag printing
`myapp v<semver>` to stdout with exit code 0. Example for a Web app: GET `/version` endpoint
returning JSON `{name, version}` AND version visible in app footer. Example for a Service or API:
GET `/version` returning JSON `{name, version}`, reachable without signing in. Example for a Desktop app:
Help > About opens an in-app About dialog (rendered in the renderer) showing `myapp v<semver>`
from `app.getVersion()` over IPC.]

**Version stamped at log startup:** The first log line emitted on process / app startup
includes the tool name and semantic version, in the Logging format below [plain text:
`[INFO] myapp v1.2.0 starting` / JSON: a record whose message is `myapp v1.2.0 starting`].

**Version single source of truth:** [Authoritative file path, e.g., `pyproject.toml [project.version]`]

**Logging convention:**
- Levels: [DEBUG / INFO / WARN / ERROR — adjust to project's chosen set]
- Format: [structured JSON / key=value / human-readable plain text]
- Configured at: [file path]

**Exit code convention:** [CLI / Hybrid — list codes; Embedded: `N/A — firmware does not exit`; otherwise: `N/A — not a CLI`]

**stdout / stderr discipline:** [CLI / Hybrid — restate; otherwise: `N/A`]

**Error message standard:** User-facing errors name the problem AND the next user action.
[CLI example: `Error: configuration file not found at <path>. Try --config to specify an
alternate path.` / Web or Desktop example: `Could not save order #123: the database file is
locked. Close other copies of the app and try again.` / Service or API example: an RFC 9457
problem-details body, `{"title": "Item not found", "status": 404, "detail": "No item with id
'4711'. Check the id, or list items with GET /items."}` / Embedded example:
`ERROR E012: temperature sensor not responding. Check the sensor cable, then power-cycle.` — keep
the one that applies]
```

**UX Baseline** (if missing — Project type Web app, Desktop app, or Hybrid with a UI only):

If the Project type is CLI tool, Service or API, Library, or Embedded, write nothing and report
`[N/A] UX Baseline — no user interface`.

This section is the UI counterpart of Tool Hygiene & Operability: the interaction conventions
every screen must meet, each turned into a baseline TOR by
`/peak-workflow:capture-requirements` (Step 3A.2.2) and checked on every UI epic by
`/peak-workflow:wrapup-epic`. It covers UX, not visual style — palette, typography, and brand
belong in a design doc or the `frontend-design` skill, never here. Every line has a default a
non-technical user can accept as-is. Do not ask about it separately: it appears in the single
confirmation as one plain summary line ("screens follow standard accessibility rules — keyboard
use, readable contrast, clear error messages, confirmation before deleting"), and is overridden
line by line only where the user asks.

1. *Design system* — a declaration consumed by the walking skeleton in
   `/peak-workflow:plan-project`, not a TOR. Default: **shadcn/ui on Tailwind v4**, themed
   only through CSS-variable tokens:
   - Tokens live in `:root` / `.dark` CSS variables in the global stylesheet, exposed to
     Tailwind through an `@theme inline` block. The path follows the stack's layout: `src/index.css`
     for a static SPA or a single-app Vite tree, `apps/web/src/index.css` for the web sheet's
     workspace layout, `src/renderer/src/index.css` for the desktop sheet. Name the path the
     project will actually have — the walking skeleton creates it.
   - `--radius` is the single radius knob — the whole radius scale derives from it.
   - Base color is chosen once, in the `components.json` and token stylesheet every sheet now
     ships (current set: `neutral`, `stone`, `zinc`, `mauve`, `olive`, `mist`, `taupe`; default
     `neutral`), and is not changed casually afterwards. `bunx shadcn@latest init` is never run —
     see the sheet's shadcn section.
   - Dark mode uses the `dark` class on the root element, switched by a ThemeProvider
     (light / dark / system).
   - New semantic colors are added by defining `--x` / `--x-foreground` in `:root` and `.dark`
     and mapping them in `@theme inline` — never by editing generated files under
     `components/ui/`. Regenerate components with `bunx shadcn@latest add <name> --overwrite`.
   - Components are composed through `className` and variants; app code imports `cn` from
     `@/lib/utils`.
   If the user names another design system, record it in the same shape (where tokens live,
   how themes change, what is never hand-edited). The TOR lines below apply regardless.

2. *Screen states* (TOR) — every data-bearing screen renders explicit loading, empty, error,
   and populated states, each distinguishable by visible text (WCAG 2.2 SC 4.1.3).

3. *Keyboard & focus* (TOR) — every interactive control is reachable and operable by keyboard
   alone with no keyboard trap, the focused control always shows a visible focus indicator that
   is not hidden behind sticky headers or overlays, and every modal dialog moves focus inside on
   open, keeps Tab within it, and returns focus to the invoking control on close
   (WCAG 2.2 SC 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11; APG modal dialog pattern).

4. *Forms* (TOR) — every form field has a programmatically associated label, every validation
   error is shown in text next to the field naming the problem and the fix, and focus moves to
   the first invalid field on a failed submission (WCAG 2.2 SC 1.3.1, 3.3.1, 3.3.2, 3.3.3).

5. *Destructive actions* (TOR) — every irreversible action (delete, overwrite, send, pay)
   requires an explicit confirmation whose safe option is the default and is triggered by
   Escape (WCAG 2.2 SC 3.3.4; APG modal dialog pattern).

6. *Progress feedback* (TOR) — any operation longer than 1 second shows a visible progress
   indicator within 1 second, and any operation longer than 10 seconds can be cancelled
   (WCAG 2.2 SC 4.1.3).

7. *Layout floor* (TOR) — Web app: every screen is usable at 320 CSS px width and at 200% zoom
   with no horizontal scrolling, overlap, or clipped controls (WCAG 2.2 SC 1.4.10, 1.4.4).
   Desktop app: every window is usable at the declared minimum window size with no clipped
   controls, and the window refuses to shrink below it. Default: 800 x 600
   — changed only if the user names this line at the single confirmation.

8. *Contrast* (TOR) — body text has a contrast ratio of at least 4.5:1 (3:1 for large text),
   and control boundaries and focus indicators at least 3:1 against adjacent colors
   (WCAG 2.2 SC 1.4.3, 1.4.11).

9. *Reduced motion* (TOR) — when the OS reduce-motion preference is set, non-essential
   animation is disabled or replaced by an instant transition (WCAG 2.2 SC 2.3.3, 2.2.2).

10. *Navigation* (TOR) — every screen has a unique page or window title, a single visible H1
    matching it, and a primary navigation whose current item is marked (WCAG 2.2 SC 2.4.2,
    2.4.6, 3.2.3).

    Error-message wording is already governed by the Tool Hygiene `Error message standard`
    line — the section cross-references it and does not repeat it.

11. *Responsiveness budget* (optional TOR, default `N/A`) — Web app: at the 75th percentile the
    primary screens meet Core Web Vitals "good": LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
    Desktop app: a declared local-interaction latency (e.g., every click acknowledged within
    200 ms). Default: `N/A` — changed only if the user names this line at
    the single confirmation.

12. *Undo* (optional TOR, default `N/A`) — reversible actions offer Undo (Ctrl/Cmd+Z or an
    "Undo" control), and unsaved form input survives an accidental reload of the same screen
    (WCAG 2.2 SC 3.3.7). Default: `N/A` — changed only if the user names
    this line at the single confirmation.

13. *Desktop conventions* (Desktop app only — each bullet is a TOR; omit the whole line for
    Web apps). Any bullet may be marked `N/A`. Default the file-dialog bullet to `N/A` unless
    the vision / ConOps, `$ARGUMENTS`, or the user names Open, Save, Import, or Export:
    - Application menu with the platform's standard menus (App / File / Edit / View / Window /
      Help on macOS; File / Edit / View / Help elsewhere) using standard roles for Undo, Redo,
      Cut, Copy, Paste, Select All, Close, Minimize, Quit. Help > About is the in-app item
      declared under Version exposure, not a standard role.
    - Keyboard accelerators: primary commands use `CmdOrCtrl` accelerators matching the
      platform's standard shortcuts, and every menu item with a shortcut displays it.
    - Window size, position, and maximized state are restored on relaunch, clamped to a
      visible display.
    - Single instance: launching the app while it is running focuses and restores the existing
      window (and opens any passed file in it) instead of starting a second instance.
    - Open / Save / Export use the platform's native file dialogs with file-type filters.

Generate the section using this template. Keep the bold labels exactly as written — downstream
skills cite them. Bracketed `[Web app: … / Desktop app: …]` choices are resolved to the one
that applies; the `[Desktop app only:]` tag is a conditional, not rendered text.

```markdown
## UX Baseline

This section declares the interaction conventions every screen must meet. It covers UX, not
visual style. Each line marked TOR is a baseline TOR requirement source —
`/peak-workflow:capture-requirements` ensures at least one TOR exists per active line, and
`/peak-workflow:wrapup-epic` checks every line on each UI epic. Lines marked `N/A` are skipped.
Error-message wording is governed by the `Error message standard` line in Tool Hygiene &
Operability and is not repeated here.

**Design system:** [shadcn/ui on Tailwind v4, or the user's choice] (declaration — installed by
the walking skeleton, not a TOR)
- Tokens: `:root` / `.dark` CSS variables in [path from the stack's layout, e.g. `src/index.css`], mapped through `@theme inline`.
- `--radius` is the single radius knob. Base color: [neutral].
- Dark mode: `dark` class on the root element, switched by a ThemeProvider (light / dark / system).
- New semantic colors: define `--x` / `--x-foreground` in `:root` and `.dark`, map in `@theme inline`.
- Never edit generated files under `components/ui/`; regenerate with `bunx shadcn@latest add <name> --overwrite`.
- Compose through `className` and variants; import `cn` from `@/lib/utils`.

**Screen states:** (TOR) Every data-bearing screen renders explicit loading, empty, error, and
populated states, each distinguishable by visible text. (WCAG 2.2 SC 4.1.3)

**Keyboard & focus:** (TOR) Every interactive control is reachable and operable by keyboard
alone with no keyboard trap; the focused control always shows a visible focus indicator that is
not hidden behind sticky UI; modal dialogs move focus inside on open, keep Tab within, and
return focus to the invoking control on close. (WCAG 2.2 SC 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11)

**Forms:** (TOR) Every form field has a programmatically associated label; every validation
error is shown in text next to the field naming the problem and the fix; focus moves to the
first invalid field on a failed submission. (WCAG 2.2 SC 1.3.1, 3.3.1, 3.3.2, 3.3.3)

**Destructive actions:** (TOR) Every irreversible action requires an explicit confirmation whose
safe option is the default and is triggered by Escape. (WCAG 2.2 SC 3.3.4)

**Progress feedback:** (TOR) Any operation longer than 1 second shows a visible progress
indicator within 1 second; any operation longer than 10 seconds can be cancelled.
(WCAG 2.2 SC 4.1.3)

**Layout floor:** (TOR) [Web app: Every screen is usable at 320 CSS px width and at 200% zoom
with no horizontal scrolling, overlap, or clipped controls. (WCAG 2.2 SC 1.4.10, 1.4.4) /
Desktop app: Every window is usable at the minimum window size of [800 x 600] with no clipped
controls, and refuses to shrink below it.]

**Contrast:** (TOR) Body text has a contrast ratio of at least 4.5:1 (3:1 for large text);
control boundaries and focus indicators at least 3:1 against adjacent colors.
(WCAG 2.2 SC 1.4.3, 1.4.11)

**Reduced motion:** (TOR) When the OS reduce-motion preference is set, non-essential animation
is disabled or replaced by an instant transition. (WCAG 2.2 SC 2.3.3, 2.2.2)

**Navigation:** (TOR) Every screen has a unique page or window title, a single visible H1
matching it, and a primary navigation whose current item is marked. (WCAG 2.2 SC 2.4.2, 2.4.6, 3.2.3)

**Responsiveness budget:** [N/A / Web app: At the 75th percentile the primary screens meet
LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. / Desktop app: Every interaction is acknowledged on
screen within [200 ms].]

**Undo:** [N/A / Reversible actions offer Undo (Ctrl/Cmd+Z or an "Undo" control), and unsaved
form input survives an accidental reload of the same screen. (WCAG 2.2 SC 3.3.7)]

[Desktop app only:]
**Desktop conventions:** (each bullet is a TOR)
- Application menu with the platform's standard menus and standard roles for Undo, Redo, Cut,
  Copy, Paste, Select All, Close, Minimize, Quit; Help > About is the in-app item declared
  under Version exposure.
- Primary commands have `CmdOrCtrl` accelerators matching platform shortcuts; every menu item
  with a shortcut displays it.
- Window size, position, and maximized state are restored on relaunch, clamped to a visible display.
- A second launch focuses and restores the running window instead of starting a new instance.
- [N/A unless a file operation exists: Open / Save / Import / Export use native file dialogs
  with file-type filters.]
```

**Security Baseline** (if missing):

This section is a static set of coding-standard reminders. They are NOT customized per
project — write the section verbatim. The reminders are not derived as TORs because they
are negative invariants ("do not X") that are hard to verify by Given/When/Then. They are
reviewed by `/peak-workflow:wrapup-epic` during independent review. (`/peak-workflow:start-epic`
does not currently check them — do not tell the user it does.)

Generate the section verbatim:

```markdown
## Security Baseline

These are coding-standard reminders that apply to every epic. They are NOT requirements —
TORs verify positive observable behavior, and "do not X" invariants are hard to express as
Given/When/Then. They MUST be respected during implementation and reviewed during
`/peak-workflow:wrapup-epic`.

**No `shell=True` / `eval` with user input.**
Never pass user-supplied data to a shell interpreter without escaping. In Python, prefer
`subprocess.run([...])` with a list; never `subprocess.run(cmd, shell=True)` on user input.
In Node.js, prefer `child_process.execFile` over `exec`. In .NET, set `ProcessStartInfo`
arguments through `ArgumentList`, never a concatenated command string. In any language, never use
`eval` or `Function()` constructors on user input, and never build SQL by string concatenation.

**Do not log secrets or PII.**
Tokens, passwords, API keys, session IDs, and personally identifiable information must
never appear in logs. The structured logger should redact known-sensitive keys
(`password`, `token`, `secret`, `api_key`, `authorization`, `cookie`, etc.). Review log
output during `/peak-workflow:wrapup-epic` for accidental leakage.

**No secrets committed to the repo.**
`.env`, credential files, private keys, and any configuration containing real secrets must
be in `.gitignore`. Use environment variables, secret managers, or encrypted files (e.g.,
`sops`, `age`) for sensitive configuration.

`/peak-workflow:wrapup-epic` includes these as default review items unless the project type
makes them inapplicable.
```

**Sign-in projects only** — when the `**Product shape:**` block records
`**Access rule:** owner-or-permitted-role` (every sign-in "yes", named provider or deferred), append
these reminders verbatim. Add them whenever the project enters that state, including when a later
shape change introduces it through `/peak-workflow:discover` Step 4.5 — not only on this first
run:

```markdown
**No sign-in bypass, ever — not even in development.**
Accounts are real from the first epic, through the project's auth layer — email and password,
the organization's named provider, or both. There is no development-only login, no
anonymous fallback, no "current user" that a request header or a query parameter can assert. A
temporary auth bypass that ships is a breach, not a shortcut, and one added "just for this demo"
is how it ships. Tests sign in through the real auth layer's test helper like any other client.

**Every read and write goes through the access rule.**
Access is owner-or-permitted-role, decided in one place that every route calls — never re-derived
per handler and never left to a front-end check. Adding a table means adding its owner column and
its access rule in the same change. `/peak-workflow:wrapup-epic` reviews both on every epic that
touches user data.
```

**Peak Workflow** (if missing) — **default, no questions**:
- Requirements baseline: `docs/requirements/`
- Implementation plan: `docs/implementation-plan/` — run `/peak-workflow:status` for the dashboard
- List the peak commands: `/peak-workflow:discover`, `/peak-workflow:mockup`, `/peak-workflow:capture-requirements`, `/peak-workflow:plan-project`, `/peak-workflow:add`, `/peak-workflow:triage <issue|description>`, `/peak-workflow:start-epic <id>`, `/peak-workflow:wrapup-epic <id>`, `/peak-workflow:pause`, `/peak-workflow:quick-fix <issue|description>`, `/peak-workflow:refresh-docs`, `/peak-workflow:status`, `/peak-workflow:setup`
- Leave room for a `**Recommended skills:**` line — Step 8 writes it for Web app / Desktop app / Hybrid-with-UI projects only; for CLI / Service / Library / Embedded projects write nothing.

**Verification & Quality Gates** (if missing) — **default, no questions.** Fill every row from
the same source as Local Environment (existing code → sheet → toolchain table):

- *Build, Tests, Lint* — reference-sheet stacks: Build `bun run build`, Tests `bun run test` plus
  `bun run test:e2e`, Lint `bun run lint`; `bun run check` (typecheck + lint + deadcode + tests)
  is the single pre-commit gate when the project took the sheet's `package.json` unchanged.
  Otherwise the toolchain table's columns.
- *Visual / console* (UI only) — `playwright-cli` against the running app for a web UI; the
  Playwright Electron harness in `tests/e2e/` for a desktop app.
- *Brand* — omit unless the user mentioned brand guidelines or a brand skill is installed.
- *Run the tool* — CLI: the Local Environment invocation. Embedded: the boot banner on the
  debug console after flashing, or `TBD — set by the walking-skeleton epic` until the board is
  known.
- *Test directories* — the directories the project will actually have, space-separated, E2E
  last: web sheet `tests/unit tests/api tests/components tests/e2e`; static SPA
  `tests/unit tests/components tests/e2e`; desktop sheet `tests/unit tests/components tests/e2e`;
  otherwise the toolchain table's *Tests* column.

  The written section must open with this template (keep the bold labels verbatim —
  `/peak-workflow:start-epic` and `/peak-workflow:wrapup-epic` grep every directory on the
  `Test directories` line, which is **space-separated**, no commas, E2E directory last). Omit
  the `(UI only)` rows for CLI / Service / Library / Embedded projects; include the `Run the
  tool` row for CLI and Embedded projects only; drop the second half of the `Tests` row when
  there is no E2E suite.

  `tests/ e2e/` in the template below is a placeholder, not a default — write the directories
  listed above. A directory named here that does not exist makes every `start-epic` and
  `wrapup-epic` grep silently return nothing:

```markdown
## Verification & Quality Gates

**Test directories:** tests/ e2e/

Run every applicable check before marking an epic Implemented or Complete:

- **Build:** `[build command]`
- **Tests:** `[unit command]` (tests/); `[e2e command]` (e2e/)
- **Lint / format:** `[lint command]`
- **Run the tool:** `[invocation with known input]` → `[expected output]` *(CLI: the walking-skeleton epic uses the `--version` invocation here; Embedded: the boot banner read from the connected board — domain inputs apply once the owning epic ships)*
- **Visual / console (UI only):** [`playwright-cli` against the running app / the Playwright Electron harness in `tests/e2e/`]
- **Brand (UI only, if a brand skill is configured):** [skill name]
- [Any other project-specific check]
```

When the user overrides a command at the confirmation, **validate it**: if the answer looks like
a description rather than a runnable shell command (e.g., it contains no
executable token — no path separators, no dot-separated binary name, no recognizable CLI verb
like `pytest`, `npm`, `dotnet`, `make`, `cargo`, `go test`, etc.), prompt once:
> That looks like a description rather than a shell command. What's the exact command to run?
> For example: `pytest tests/`, `npm test`, `dotnet test`, `make check`
If the second answer is still ambiguous, accept it and add a note in the written section:
> *(Command may need refinement — update CLAUDE.md before the first `/peak-workflow:start-epic`)*

**Important Reminders** (if missing) — **default, no questions.** Write one line for each
decision this run recorded that a later session could undo by accident — for example *"Browser-only
app: there is no server; anything needing one is a Product shape change (see above)"*, the
deferred-sign-in rule, or an attribution field — *"Every record carries an Entered by field (typed
initials); there is no sign-in"*. For an Embedded product that switches mains power or heat, always
write the **Bench only** rule here: *"Bench only: before flashing or running the board or anything
under tests/hil/, the user confirms the equipment is unplugged and the output drives a test lamp;
`HIL_BENCH=1` goes only on that confirmed command line."* With nothing to record, write *"None yet — add project-specific gotchas here
as they are discovered."*; on a new project that line counts as populated, not `[WEAK]`.

**Reference Materials** (if missing) — **default, plus one optional prompt folded into the
confirmation**:
- Only when the Tech Stack step actually took a sheet, add a line pointing at the reference
  stack sheet the Tech Stack step actually used — `bun-web-app-stack.md`,
  `bun-static-spa-stack.md`, or `bun-electron-desktop-stack.md` under the installed plugin's
  `references/` directory (`${CLAUDE_PLUGIN_ROOT}/references/`, not a path inside this
  repository) — labelled as reference and layer checklist only, never a target to migrate the
  project toward. For Embedded, add the board's datasheet or vendor SDK once named.
- The confirmation invites, in one clause, any existing documents, designs, or links the user
  already has. Record what they give; ask nothing further.

**Git Workflow** (if missing) — **default, no questions.** Write these plugin conventions:
- *Base branch:* `develop` if it already exists, otherwise `main`. Epic, docs, and quick-fix
  branches merge into the base branch. Do not create `develop` for a solo project — every skill
  detects which base exists.
- Epic feature branches use the naming convention `feature/epic-<id>-<short-name>` where `<id>` is either a legacy integer (pre-v2.0.0 epics, e.g., `7` or `6.5`) or a 7-character alphanumeric ID (v2.0.0+ epics, e.g., `a3f2K7p`), and `<short-name>` is derived from the epic spec filename (e.g., `epic-a3f2K7p-user-auth.md` → `feature/epic-a3f2K7p-user-auth`). Include this convention in the Git Workflow section.
- Quick-fix branches use the naming convention `hotfix/issue-<N>-<slug>` when tied to a GitHub issue, or `hotfix/<slug>` otherwise. Include this convention too.
- Merges use `--no-ff` to preserve history.
- Claude asks before every push to a remote.
- Never commit: `.env` and `.env.*` (except `.env.example`), credential and key files, and the
  stack's build output — plus whatever the existing `.gitignore` already excludes.

**Verification Before Commit Rule** (if missing) — **default, no questions.** Reuse the Build,
Lint, and Tests commands already filled in for Verification & Quality Gates; do not re-derive
them. Format fix: the sheet's `bun run lint:fix`, or the toolchain table's *format fix*. The
*Verify* step by project type:
  - *CLI tool:* run the tool with a known input and check stdout (e.g., `python -m fibcalc 10` → expect `55`). For the walking-skeleton epic, which has no domain logic, the known input is the `--version` invocation (`python -m fibcalc --version` → `fibcalc v0.1.0`, exit 0).
  - *Web app / Service:* `curl` the version endpoint on the port the project actually uses (web sheet: `curl http://localhost:3000/version`; .NET: the port in `Properties/launchSettings.json`) or use `playwright-cli`. Static SPA: `bun run test:e2e`, which builds and previews the bundle.
  - *Desktop app:* `bun run test:e2e` alone — it builds and launches the app itself; do not also run `bun run dev`.
  - *Embedded:* host-side tests, then flash and read the boot banner on the debug console, on the bench setup when the product switches mains power or heat — or `TBD — set by the walking-skeleton epic`.

When generating the Verification Before Commit section for a CLI tool or Embedded project, omit the `curl` and `playwright` references — replace the "Verify" step with the tool invocation (or flash + boot banner) command, drop the `[stop command]` line from the example, and reword its comments to "Build" and "Run the tool with a known input". For desktop projects replace curl / playwright with `bun run test:e2e`, which builds and launches the app itself.
- Generate the section using this template, filling in the project-specific commands:

```markdown
## CRITICAL: Verification Before Commit Rule

**NEVER commit code changes before verification!**

A successful build (compile) does NOT equal working code. The workflow MUST be:

1. **Implement** — Make the code changes
2. **Lint** — Run `[lint command]` to verify formatting and static analysis
3. **Build** — Run `[build command]` to build *(omit or replace with a no-op note for projects with no explicit build step)*
4. **Verify** — Use [curl / playwright / the tool invocation / `bun run test:e2e` (desktop)] or manual testing to confirm functionality
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

**Release Protocol** (if missing) — **default, no questions**:
- *Branches:* from the Git Workflow base branch. With no `develop`, drop steps 2 and 4 of the
  template and tag on `main` directly.
- *Version file:* the Tool Hygiene **Version single source of truth** — never asked twice.
- *CHANGELOG:* `CHANGELOG.md` in Keep a Changelog format; Step 7.2 creates it without asking.
- *Tag format:* `vX.Y.Z`.
- *CI note:* the existing workflows' behaviour when `code_present = true` and workflows exist;
  otherwise what the sheet ships (static SPA: tests on pull requests, deploy to GitHub Pages on
  push to `main`; web sheet: none yet — the walking-skeleton epic adds CI; desktop sheet with no
  internet: none — installers are built and copied locally), or `TBD — set by the walking-skeleton
  epic`.
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

**The one confirmation.** After the asked questions, and before Step 4 writes anything, show
everything defaulted as a single plain-language summary — short, grouped by section, most
technical detail in parentheses, each group naming its source (*found in your code* / *the
recommended stack* / *standard for this language* / *peak-workflow convention* / *decided later
by the first epic*). Example shape:

```
Here's how I'll set the project up. Nothing below needs a decision from you unless you want
something different.

What it is: A habit tracker for one person, used in the browser on their own devices.
How it's built (the recommended stack): runs entirely in the browser (React + Vite), saves to
  the browser's own storage (IndexedDB), published free on GitHub Pages.
How it's checked before each commit (standard for this stack): type check, lint, tests
  (`bun run check`), plus browser tests (`bun run test:e2e`).
Version: shown in the app footer and the first console line (from package.json).
Screens: follow standard accessibility rules — keyboard use, readable contrast, clear error
  messages, confirmation before deleting.
Git (peak-workflow convention): work happens on branches merged into main; I ask before pushing.
Releases: tagged vX.Y.Z with a CHANGELOG.
Decided later by the first epic: none.

Does this look right? Say "ok", or tell me anything to change — and mention any existing
documents or designs I should point to.
```

The summary also carries the housekeeping that used to be separate questions: repo files that
will be created (README, CHANGELOG), `.gitignore` entries that will be appended (existing
repositories), recommended add-on skills not yet installed (Step 8), layers an existing project
has not decided yet, and that setup will commit the files it writes (as the first commit when the repository has none).

Adapt the example to the project type. A few lines that matter by type:

- **Desktop app:** *"Runs on: Windows only, no internet needed (no automatic updates). Window:
  never smaller than 800 × 600; standard menus, remembers its size and position; Export uses the
  normal Save dialog; only one copy runs at a time. Needs: Bun and Node.js installed on the computer
  you build on. No undo and no speed target unless you want
  them. Version: Help › About. Logs: a file in the app's data folder."*
- **Web app with sign-in:** *"Sign-in: Google for everyone — coordinators through your Workspace,
  volunteers with a personal Google account or an email and password; only Workspace accounts get
  the coordinator role. Coordinators see everything, volunteers see open shifts and their own claims.
  People who sign up with a password confirm their email address first, so the app needs an email
  service — chosen with you before the first deploy, like hosting. Needs: Docker installed to run the
  full app and its browser tests. Where it's hosted: chosen with you before the first deploy."*
- **Service or API (existing code):** *"Found in your code: .NET 8 Web API, xUnit tests in
  tests/, `dotnet build` / `dotnet test`. Version: GET /version (the project has no version number
  yet — the first epic adds one). Not decided yet: database, CI."*
- **Embedded:** *"Board: probably an ESP32 — not confirmed; the first epic will confirm it with you
  before anything is bought or installed. You'll need the board plugged into this computer by USB
  for the device checks. Most build and flash commands are decided by that first epic."*

Ask it once, with `AskUserQuestion` (options: `"Looks right — write it"`, `"I want to change
something"`), and apply every change the user names in one pass. Do not walk the sections one at
a time, and do not re-confirm after applying changes unless a change alters the project type or
a shape answer.

## Step 4: Apply Updates

Add or update the missing sections in `CLAUDE.md` with the confirmed values. Preserve all existing
content — only add or strengthen sections. Write `## Project Overview` first, directly under the
title.

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
2. On UI projects run `/peak-workflow:mockup` to inventory screens and draw wireframes.
3. Run `/peak-workflow:capture-requirements` to derive TOR requirements from the vision/ConOps.
4. Run `/peak-workflow:plan-project` to derive epics that implement the TOR requirements.
5. Run `/peak-workflow:start-epic <id>` to implement each epic — tests are derived from
   TOR Given/When/Then.
6. Run `/peak-workflow:wrapup-epic <id>` to independently verify each TOR requirement is satisfied.
```

  Report: `[PASS] Requirements directory — created docs/requirements/README.md stub`

**Architecture/design-notes check:** Check whether `docs/architecture.md` and `docs/design-notes.md` exist.

- If **both exist** and contain substantive content: Report `[PASS] Documentation stubs — both files exist` and skip to Step 7.
- If **either is missing or empty**: Generate stubs from the CLAUDE.md content you just audited, following the instructions below.

### Generating `docs/architecture.md` stub

Derive the content from CLAUDE.md's Project Overview, Tech Stack, and `**Product shape:**` block.
For Desktop app projects title §4 "IPC Contracts" and §8 "Packaging & Distribution". For CLI
tool, Service or API, and Library projects write §6 as `N/A — no user interface`. For a
static SPA (the browser-only sheet) write §4, §5, and §7 as `N/A — browser-only app, no server
(Product shape)` and title §8 "Hosting" (GitHub Pages). For Embedded, title §4 "Hardware
Interfaces", §6 "Device Software Architecture", and §8 "Build, Flash & Update", and write §5 and
§7 as `N/A` unless the product also runs a service.

```markdown
# [Project Name] — Architecture Document

> **Note:** This is a planning artifact generated by `/peak-workflow:setup`. Sections marked with
> *(to be completed during implementation)* will be populated as epics are implemented.
> Run `/peak-workflow:refresh-docs` after completing epics to update this document to reflect the
> as-built system.

---

## 1. System Overview

[Derive from CLAUDE.md's Project Overview — 2-3 sentences about what the system does, who uses it, and the high-level deployment model (single container, microservices, serverless, etc.)]

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

Derive the content from the decisions this run recorded — the reference sheet chosen and why
(the Product shape answers), any deferred sign-in — plus CLAUDE.md's Important Reminders and,
in an existing project, any Key Architecture Decisions section it already has:

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

Then, for each of those decisions, generate a numbered section:

```markdown
## N. [Decision Title]

**Decision:** [The decision as stated in CLAUDE.md]

**Rationale:** [If CLAUDE.md provides a rationale, include it. Otherwise:]
*(Rationale to be documented during implementation.)*
```

If the Tech Stack records `Auth: local accounts now, org SSO deferred`, write that decision as a
numbered section here — it is a real architectural decision with a stated rationale, and Step 3
promised it would land in this file:

```markdown
## N. Organization Sign-In Deferred

**Decision:** Accounts are real from the first epic — email and password through the project's auth
layer. Every record carries an owner and every read and write goes through one owner-or-permitted-
role access rule. The organization's identity provider is not yet chosen and will be added later as
an additional sign-in method on the same accounts.

**Rationale:** [The user's reason — provider not yet chosen / pending IT approval.] Email and
password needs no approval from anyone outside the team, so the product gets real authentication
now instead of a placeholder, and the provider decision stops blocking the project.

**Candidate provider:** [vendor the user named, or "none named"] — **confirmed by:** [who will ask].

**Resolves when:** the provider is confirmed. `/peak-workflow:plan-project` carries this as its own
epic. Scope it honestly: the provider brings a callback route, its own session configuration,
mapping directory groups onto this project's roles, and an update to the end-to-end sign-in helper.
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
> These will be read by `/peak-workflow:start-epic` for context and updated by `/peak-workflow:refresh-docs` after implementation.

## Step 7: Audit Repo Hygiene Files

These are the load-bearing repo-root files and CI / build artifacts that mature projects
maintain. Some are safe to stub (prose); others are detect-and-warn only (legal artifacts,
build-system files that must come from the toolchain).

For each item, check the repo root and report `[PASS]` / `[MISS]` / `[WEAK]`.

### 7.1: README.md

Check whether `README.md` exists at the repo root.

- If **present with more than a title** (about two lines of real content): `[PASS] README.md — exists`.
  A title-only README is `[WEAK]`: add the Project Overview line and the Documentation links
  below it, preserving what is there.
- If **missing or empty**: create the stub without asking — it is a default, and the user saw it
  listed in the Step 3 confirmation. Use this template (substitute project name and tech stack
  from CLAUDE.md):

```markdown
# {Project Name}

> {One-line description derived from CLAUDE.md's Project Overview.}

## Install

{Project-type-specific install command. Examples:
 - Python:    `pip install {pkg}` or `uv pip install {pkg}`
 - Node:      `npm install {pkg}` or `bun add {pkg}`
 - Rust:      `cargo install {pkg}`
 - Go:        `go install {module}@latest`
 - .NET:      `dotnet tool install --global {tool}`}

## Quick Start

{One copy-pasteable example exercising the primary use case. For a CLI tool, show a
common invocation and its expected output. For a web app, show how to start it locally
and what URL to open. For a library, show a minimal `import` and call.}

## Documentation

- [Architecture](docs/architecture.md)
- [Design Notes](docs/design-notes.md)
- [Requirements](docs/requirements/) — TOR requirements baseline
- [Implementation Plan](docs/implementation-plan/) — epic registry; run `/peak-workflow:status` for the dashboard

## Development

See [CLAUDE.md](CLAUDE.md) for the project's development workflow conventions and
[CONTRIBUTING.md](CONTRIBUTING.md) (if present) for contributor guidelines.

## License

See [LICENSE](LICENSE).
```

### 7.2: CHANGELOG.md

Check whether `CHANGELOG.md` exists at the repo root.

- If **present**: `[PASS] CHANGELOG.md — exists`.
- If **missing**: create a [Keep a Changelog](https://keepachangelog.com/) stub without asking —
  the Release Protocol default already committed the project to one. Generate:

```markdown
# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
### Changed
### Fixed

---

## [0.1.0] — UNDER DEVELOPMENT

Initial development.
```

### 7.3: LICENSE

Check whether `LICENSE` (or `LICENSE.md`, `LICENSE.txt`) exists at the repo root.

- If **present**: `[PASS] LICENSE — exists`.
- If **missing**: do NOT auto-generate. Auto-creating legal documents is unsafe — the
  project's license choice carries legal weight and may depend on org policy, dependency
  licenses, or commercial intent. Print a `[MISS]` warning with this guidance:

  > LICENSE is missing. Without one, others legally cannot use, copy, or modify the code.
  > Common open-source choices: MIT (permissive, short), Apache-2.0 (permissive with
  > patent grant), BSD-3-Clause (permissive). For internal/proprietary projects, add a
  > `Copyright {year} {holder}. All rights reserved.` notice. Add a LICENSE file at the
  > repo root before publishing.

### 7.4: .gitignore

Run this check **before the Step 3 confirmation** (like Step 8) so any entries to append are listed
there. Editor-preference entries (`.vscode/`, `.idea/`) are never listed or appended.

Check whether `.gitignore` exists at the repo root.

- If **missing entirely** and `code_present = false`: report `[N/A] .gitignore — no code yet;
  the walking-skeleton epic creates it for the stack`. Nothing to do now.
- If **missing entirely** and `code_present = true`: print `[MISS] .gitignore — file missing`. Recommend creating
  one from a tech-stack-appropriate template (e.g., GitHub's gitignore templates at
  `https://github.com/github/gitignore`). Do NOT auto-generate — the right template
  depends on the full toolchain.
- If **present**: do a lightweight content audit. Verify the following high-signal entries
  are present (or equivalent patterns):
  - `.env` (and variants like `.env.local`, `.env.*.local`)
  - Build / dependency artifact directories appropriate to the tech stack:
    - Node: `node_modules/`, `dist/`, `build/`
    - Python: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `dist/`, `build/`, `*.egg-info/`
    - Rust: `target/`
    - Go: build outputs (project-specific)
    - .NET: `bin/`, `obj/`
  - OS files: `.DS_Store`, `Thumbs.db`

  For each missing high-signal entry, report `[WEAK] .gitignore — missing entries: {list}`
  and append them only if the Step 3 confirmation listed them and the user did not strike
  them — projects often intentionally exclude or include patterns, so never append an entry the
  user was not shown.

### 7.5: CI Configuration

Check whether any of these exist:
- `.github/workflows/*.yml` (GitHub Actions)
- `.gitlab-ci.yml` (GitLab CI)
- `.circleci/config.yml` (CircleCI)
- `azure-pipelines.yml` (Azure Pipelines)
- `bitbucket-pipelines.yml` (Bitbucket Pipelines)
- `Jenkinsfile` (Jenkins)

If **at least one is present**: `[PASS] CI configuration — detected ({which})`.

If **none present** and `code_present = false`: report `[N/A] CI configuration — no code yet;
the walking-skeleton epic sets up CI` and skip the guidance below.

If **none present**, `code_present = true`, and the `**Not decided yet:**` line lists CI: report
`[N/A] CI configuration — the walking-skeleton epic adds it (provider confirmed with you first)`
and skip the guidance below.

If **none present** and `code_present = true` otherwise: print `[MISS] CI configuration — no pipeline detected`. Do NOT
auto-create — CI configuration is platform-specific and depends on the team's CI provider,
secrets, and policies. Print this guidance:

> No CI pipeline detected. CI that runs tests on every PR is the highest-leverage quality
> investment a project can make — it catches regressions before they reach `develop` /
> `main`. Recommended baseline:
> - Run the test suite on every pull request to `develop` and `main`
> - Run linting / formatting checks on every pull request
> - Cache dependencies between runs
>
> Add a CI pipeline using your team's CI provider before merging significant work.

### 7.6: Lockfile

Check for a lockfile appropriate to the tech stack declared in CLAUDE.md:
- Node.js: `package-lock.json` | `yarn.lock` | `pnpm-lock.yaml` | `bun.lock` | `bun.lockb`
- Python: `poetry.lock` | `uv.lock` | `Pipfile.lock` | `requirements.txt` with pinned `==` versions
- Rust: `Cargo.lock`
- Go: `go.sum`
- .NET: `packages.lock.json` (NuGet locking enabled)
- Ruby: `Gemfile.lock`
- PHP: `composer.lock`

If **lockfile present**: `[PASS] Lockfile — {filename} present`.

If **lockfile missing** and `code_present = false`: report `[N/A] Lockfile — no code yet; the
walking-skeleton epic's first install creates it` and skip the guidance below.

If **lockfile missing** and `code_present = true`: print `[MISS] Lockfile — none found for
{stack}`. Do NOT auto-create — lockfiles must be generated by the package manager
(`npm install`, `poetry lock`, `cargo build`, etc.). Print this guidance:

> No lockfile found. Without one, `dev`/`prod` parity is at risk — different developers and
> CI runs may resolve different transitive dependency versions, producing flaky behavior.
> Generate the lockfile by running the package manager's install command, then commit it.
> For example:
> - Bun: `bun install` (creates `bun.lock`) — commit it
> - Node.js: `npm install` (creates `package-lock.json`) — commit it
> - Python (Poetry): `poetry lock` — commit `poetry.lock`
> - Python (uv): `uv lock` — commit `uv.lock`
> - Rust: `cargo build` (creates `Cargo.lock`) — commit it for binaries (libraries omit)
> - .NET: set `<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>` (e.g. in
>   `Directory.Build.props`), run `dotnet restore`, commit every `packages.lock.json`

### 7.7: Repo Hygiene Summary

Print a final checklist:
```
[PASS / MISS / WEAK] README.md
[PASS / MISS / WEAK] CHANGELOG.md
[PASS / MISS]        LICENSE
[PASS / MISS / WEAK / N/A] .gitignore
[PASS / MISS / N/A]  CI configuration
[PASS / MISS / N/A]  Lockfile ({stack-specific filename})
```

For each `MISS` / `WEAK` not yet resolved, repeat the recommendation with the file path
and the next action. The user is responsible for the legal / build-system items
(LICENSE, CI config, lockfile); `/peak-workflow:setup` does not auto-create them.

## Step 8: Recommended Claude Code Skills

Some project types work better with companion skills installed. Decide by the Project type
declared in Tool Hygiene & Operability:

| Project type | Recommended skills |
|---|---|
| Web app / Hybrid with a web UI | `frontend-design` (default source: `frontend-design@claude-plugins-official`) for visual execution; `playwright-cli` for UI verification in `/peak-workflow:wrapup-epic` |
| Desktop app | `frontend-design` (same source) for visual execution. UI verification uses the project's Playwright Electron harness (`@playwright/test`, a project dependency — not a skill); report `[N/A] playwright-cli — desktop apps verify through the Playwright Electron harness` |
| CLI tool / Service or API / Library / Embedded / Hybrid without a UI | None required — report `[N/A] Recommended skills — none required for {type}` and skip to Step 9 |

For each recommended skill, check whether it appears in this session's available-skills list
and report `[PASS] {skill} — installed` or `[MISS] {skill} — not installed`. Plugin skills are
listed namespaced (e.g., `frontend-design:frontend-design`) — match on the skill name after the
last `:`.

Run this check before the Step 3 confirmation and list any `[MISS]` skill there (*"Recommended
add-on not installed: frontend-design — I'll show you how to add it"*). Ask no separate question.
For each `[MISS]`, print the commands for the user to run at the end (this skill cannot run
`/plugin` itself):

> Run these in Claude Code, then restart Claude Code so the new skill loads:
> ```
> /plugin marketplace add anthropics/claude-plugins-official   # only if this marketplace is not already registered
> /plugin install frontend-design@claude-plugins-official
> ```

For `playwright-cli`, print `/plugin install playwright-cli@<marketplace>` and tell the user to
pick the marketplace that lists it (`/plugin` → Discover) — do not guess a marketplace name.

Record the outcome as a `**Recommended skills:**` line inside the **Peak Workflow** section of
`CLAUDE.md`, one entry per skill with its status, followed by the precedence rule:

```markdown
**Recommended skills:** `frontend-design@claude-plugins-official` (installed), `playwright-cli`
(not installed — install before the first UI epic). `frontend-design` shapes visual execution;
the UX Baseline and the design-system tokens take precedence over its aesthetic choices.
```

Desktop app variant of the first sentence:

```markdown
**Recommended skills:** `frontend-design@claude-plugins-official` (installed); `playwright-cli`
N/A — desktop apps verify through the Playwright Electron harness in `tests/e2e/`.
```

Also print the precedence rule to the user verbatim: `frontend-design` shapes visual
execution; the UX Baseline and the design-system tokens take precedence over its aesthetic
choices.

## Step 9: Final Summary

**Unborn-HEAD check:** first run `git rev-parse --is-inside-work-tree`; if it fails, this is
not a git repository — suggest `git init` and skip the rest of this check. Otherwise, if
`git rev-parse --verify HEAD` fails (no commits yet), commit the setup files as
`chore: initial project setup` on the current branch (`main` by default) so
`/peak-workflow:discover` can branch from a real base — the Step 3 confirmation already said so
(*"When I'm done I'll save these files as the project's first commit"*), and accepting it is the
consent. Stage the files this session wrote or modified by path (never `git add -A`). If the user
declined that line at the confirmation, print: "Commit before running `/peak-workflow:discover` —
otherwise `main` will not exist to merge the docs/ branch back to."

When the repository already has commits, commit the files setup wrote or modified, by path, as
`chore: peak-workflow setup` on the current branch — the confirmation said so (*"When I'm done I'll
commit these setup files"*), and accepting it is the consent. Root files such as `CHANGELOG.md` and
`README.md` are included; later planning commits do not stage them. If the user struck that line,
tell them the files are uncommitted; `/peak-workflow:discover` asks once whether to commit them on
its new docs/ branch.

Remind the user:
- `CLAUDE.md` is loaded automatically every session — the quality gates will apply to all future epic work
- The **Tool Hygiene & Operability** section in `CLAUDE.md` will be consumed by
  `/peak-workflow:capture-requirements` to produce baseline TOR requirements covering
  version exposure, log startup stamping, logging convention, exit codes (CLI),
  stdout/stderr discipline (CLI), and error-message standards. Lines marked `N/A` are
  skipped.
- *(UI project types only — omit for CLI / Service / Library / Embedded:)* the **UX Baseline** section in `CLAUDE.md` follows the same chain:
  `/peak-workflow:capture-requirements` turns each active line into a baseline UX TOR, the
  walking skeleton epic in `/peak-workflow:plan-project` installs the declared design system and
  proves those TORs on one reference screen, and `/peak-workflow:wrapup-epic` runs the UX
  Baseline check as a quality gate on every UI epic. Lines marked `N/A` are skipped.
- *(UI project types only — omit for CLI / Service / Library / Embedded:)* any `[MISS]` recommended skill from Step 8 should be installed before the first UI epic;
  `frontend-design` shapes visual execution, and the UX Baseline and design-system tokens take
  precedence over its aesthetic choices.
- The **Security Baseline** section in `CLAUDE.md` is reviewed by `/peak-workflow:wrapup-epic`
  during independent review. These reminders are not derived as TORs.
- `docs/architecture.md` and `docs/design-notes.md` are read by every `/peak-workflow:start-epic` and `/peak-workflow:wrapup-epic` for context
- For any `[MISS]` items in the Repo Hygiene audit (Step 7) that you did not resolve in
  this session — particularly LICENSE, CI configuration, and the lockfile — address them
  before publishing the project externally or merging significant work
- After implementing epics, run `/peak-workflow:refresh-docs` to bring the docs in sync with the as-built codebase

**Legacy layout check:** After completing the above, check whether `docs/implementation-plan/index.md` exists and contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column. If found, add a one-line reminder at the end of your summary:

> Your implementation plan uses the pre-v2.5.0 layout. Run `/peak-workflow:migrate-2.5` to upgrade to per-phase indexes + status sidecars and eliminate implementation-plan merge conflicts.
