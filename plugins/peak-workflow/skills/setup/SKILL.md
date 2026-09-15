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
| **Tool Hygiene & Operability** | Declares project type (CLI / Web app / Desktop app / Service / Library / Hybrid) and the project's chosen mechanisms for: version exposure to the user, version stamped at log startup, version single source of truth, logging convention (levels and format), exit code convention, stdout/stderr discipline, and error-message standard. These mechanisms become baseline TOR requirements via `/peak-workflow:capture-requirements`. |
| **UX Baseline** | Project type Web app, Desktop app, or Hybrid with a UI only. Declares the design system (default shadcn/ui on Tailwind, themed only through CSS-variable tokens) and the interaction conventions every screen must meet: screen states, keyboard & focus, forms, destructive actions, progress feedback, layout floor, contrast, reduced motion, navigation, and (desktop) application-menu conventions. Each TOR line becomes a baseline UX TOR via `/peak-workflow:capture-requirements` (Step 3A.2.2); the walking skeleton in `/peak-workflow:plan-project` installs the design system; `/peak-workflow:wrapup-epic` runs the UX Baseline check on every UI epic. For CLI / Service / Library projects report `[N/A] UX Baseline — no user interface`. If Tool Hygiene & Operability is also missing, the Project type is not yet known — report `[MISS] UX Baseline — resolved after Project type is captured in Step 3` and let Step 3 turn it into `[N/A]` or a populated section. |
| **Security Baseline** | Lists the load-bearing coding-standard reminders that are NOT testable as positive observable shall-statements: no `shell=True` / `eval` on user input, no logging of secrets or PII, no secrets committed to the repo. Reviewed by `/peak-workflow:start-epic` and `/peak-workflow:wrapup-epic`, not derived as TORs. |
| **Peak Workflow** | References the peak commands (`/peak-workflow:discover`, `/peak-workflow:mockup`, `/peak-workflow:capture-requirements`, `/peak-workflow:plan-project`, `/peak-workflow:add`, `/peak-workflow:triage`, `/peak-workflow:start-epic`, `/peak-workflow:wrapup-epic`, `/peak-workflow:pause`, `/peak-workflow:quick-fix`, `/peak-workflow:refresh-docs`, `/peak-workflow:status`, `/peak-workflow:setup`) and points to the requirements directory (`docs/requirements/`) and implementation plan |
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
[N/A]  UX Baseline — no user interface
```

## Step 3: Fix Missing/Weak Sections

For each section that is MISS or WEAK, ask the user targeted questions to populate it. Ask one section at a time — do not dump all questions at once.

**Tech Stack** (if missing):
- What language and framework does this project use?
- What package manager? (npm, bun, yarn, pip, dotnet, etc.)
- Any key libraries or tools? (CSS framework, ORM, test runner, etc.)

If the answers are thin (e.g., "whatever you recommend", "I don't know", or only a language
is named), ask which project type the product is (the same list as Tool Hygiene item 1 below
— carry the answer forward so it is not asked twice).

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
| 4 | "Does anything on screen need to update by itself while they are watching — like a message arriving from someone else?" | Streaming endpoints, long-lived connections |
| 5 | "Does the product need to keep any password or key of its own secret from the people using it?" | Server — a browser-only app cannot hold a secret |

If the user is unsure on any question, treat it as **no** and say so plainly: *"I'll assume no
for now — every one of these is easier to add later than to carry unused."* Adding a server to
a browser-only app is a contained change (the static sheet's Growth Path covers it); carrying an
unused auth and storage layer through every epic is not.

**If question 2 is "yes", ask two follow-ups.** Sign-in is the answer most likely to stall a
project: an organization's identity provider is usually someone else's decision, behind an IT
approval the user cannot give during a planning session.

- *Provider:* "Do you already know how people will sign in — a provider your organization has
  approved, such as Microsoft, Google, or Okta — or is that still to be worked out?"
- *Roles:* "Will different people be able to do different things — some can only look, others
  can change things?"

A "yes" to question 2 routes to the web-app sheet either way. Once anyone other than the owner
can see the data, the rule about who sees what has to be enforced somewhere the person cannot
edit, which means a server. Deferring the provider does not restore the static sheet — say this
plainly rather than letting the user infer that deferral keeps the project small.

| Provider answer | What goes in the stack |
|---|---|
| Named and approved | The sheet's auth layer, configured for that provider. Record the provider in the Tech Stack table. |
| Still to be worked out, or "I don't know" | **Deferred-provider mode** below. |

**Deferred-provider mode.** Defer *who issues the identity*. Never defer *who owns the data* —
that is the half that is ruinous to retrofit, because it means migrating every table and
rewriting every query later. Record all five of these:

1. **Ownership is built now.** Every record carries an owner, and every read and write filters by
   the current user, starting with the walking-skeleton epic. This is not deferred, not stubbed,
   and not a later epic.
2. **Roles are modelled now if question 2b was yes** — a role field and one permission-check seam,
   even when only one role exists today. The provider supplies the real role claim later.
3. **Sign-in is a development-only stub** behind a single module that answers "who is the current
   user?". Swapping that module for the real provider is the whole of the later integration.
4. **The stub fails closed.** A production build with no provider configured refuses to start. It
   never falls back to a signed-in user, an anonymous user, or a default account.
5. **The provider is an open decision**, recorded in the Tech Stack table as
   `Auth: deferred provider — ownership enforced, sign-in stubbed (shape Q2a)` and written into
   `docs/design-notes.md` as a numbered decision with its rationale (blocked on IT approval /
   provider not yet chosen). `/peak-workflow:plan-project` turns it into its own epic.

Tell the user, in plain language, what deferral does and does not buy: *"You can build and use the
whole product this way. Connecting it to your organization's real sign-in is its own piece of work
later — usually a week or more with your IT people involved. Deferring it means you are not
blocked on them now; it does not make that work smaller."*

**Route on the answers, not on the project type alone:**

| Answers | Reference sheet — read it before answering |
|---|---|
| Web app, **all five "no"** | `${CLAUDE_PLUGIN_ROOT}/references/bun-static-spa-stack.md` — browser-only SPA, data in IndexedDB, deployed to GitHub Pages |
| Web app, **any "yes"** | `${CLAUDE_PLUGIN_ROOT}/references/bun-web-app-stack.md` |
| **Service or API** | `${CLAUDE_PLUGIN_ROOT}/references/bun-web-app-stack.md` (same sheet; skip Section 7 Frontend Wiring and the SPA half of Section 8) |
| **Desktop app** | `${CLAUDE_PLUGIN_ROOT}/references/bun-electron-desktop-stack.md` — ask questions 1–3 anyway; a "yes" to any means the desktop app also needs the web sheet's service layers, which makes it a Hybrid |
| **Hybrid** | The sheet matching the primary interface, plus the other sheet's layers for the secondary one |

Paths are relative to the installed plugin, not the user's repository. If `${CLAUDE_PLUGIN_ROOT}`
does not resolve in this session, locate the sheet under the plugin's own `references/` directory
— do not proceed from memory.

**Record the answers, not just their consequences.** Write a short `**Product shape:**` block
above the Tech Stack table listing each question and its answer in the user's terms (e.g.
*"Same device only — no cross-device sync"*). When question 2 was yes, the block also carries the
provider answer — either the named provider or *"Sign-in: deferred provider — ownership enforced,
stub fails closed"* — and whether roles are in play. Any Stack Summary row the answers drop is written
into the table as `N/A — <reason> (shape Q<N>)` rather than omitted. `/peak-workflow:plan-project`
reads the Stack Summary as a completeness checklist for the walking skeleton, so a row that is
simply absent reads as an oversight, while `N/A — no file uploads (shape Q3)` reads as a
decision.

Read the matching sheet's **Section 2 Stack Summary** and offer that table as the proposed
stack, condensed to one line per layer, with any shape-dropped rows already marked `N/A`. Do not
invent, substitute, or "modernize" a pick, and do not paraphrase from memory — the sheet is the
single source of truth for what gets offered.
The user accepts the whole sheet with one answer or overrides any layer; record the accepted
picks in `CLAUDE.md`'s Tech Stack table, and note in the section which sheet it came from so
`plan-project` can read the same one. Sections 3 (Repository Layout), 4 (Configuration Files),
and the later sections are for `plan-project` to apply when it builds the walking skeleton —
not to be dumped into the conversation here.

**CLI tool / Library** has no sheet: if no language is named, default to TypeScript on Bun
(`bun init`, `bun test`, single-file executable via `bun build --compile`), `bun:sqlite` if it
needs a database. If a language is named, use that language's standard toolchain (e.g., Python:
`uv`, `pytest`, `ruff`, a `pyproject.toml` console-script entry point).

Every project type: start with SQLite unless the user names another database or the product
has no persistence.

**Existing projects: reference only.** If `CLAUDE.md` already has a populated Tech Stack, that
section is the single source of truth and this step is `[PASS]` — do not compare it against the
sheets, do not report divergence, and never propose re-platforming, rewriting, or swapping a
library to match. The sheets apply to an existing project for one thing only: noticing a
**layer the project has not decided yet** (e.g., no migration tool, no E2E runner, no secrets
convention). Raise such a gap as a question, never as a rewrite.

**Local Environment** (if missing):

First, determine the project type from the Tech Stack answers already captured. If the tech stack includes Electron, Tauri, or a native windowing toolkit, treat it as a **desktop project**. Otherwise, if it includes a web framework, HTTP server, REST API library, or mentions "frontend" / "backend", treat it as a **web/server project**. Otherwise (CLI tool, library, script), treat it as a **CLI/tool project**.

*For CLI/tool projects:*
- How do you invoke the tool locally? (e.g., `python -m fibcalc 10`, `./mytool --help`, `go run . 5`)
- How do you run the test suite? (e.g., `pytest tests/`, `go test ./...`, `cargo test`)
- Skip the frontend/backend/live-data questions — they don't apply.

*For web/server projects (a server is part of the stack):*
- How do you run the backend locally? (e.g., `dotnet run`, `npm start`, etc.)
- How do you run the frontend locally? (e.g., `bun run dev`, `npm run dev`, etc.)
- How do you run the test suite? (reference-sheet stack: `bun test` for unit, API and component
  tests, `bun run test:e2e` for the Playwright suite) — capture it here so the Verification &
  Quality Gates step can reuse it instead of asking again.
- Is the backend API live and functional in local dev? (i.e., can it connect to real data sources like databases?)
- Should verification always use live data instead of mocking API responses?

*For browser-only web projects (static SPA — the shape questions all answered "no"):*
- How do you start the dev server? (reference-sheet stack: `bun run dev`, Vite on `:5173`)
- How do you run the test suite? (reference-sheet stack: `bun test` for unit and component
  tests, `bun run test:e2e`, which builds and previews the production bundle first)
- Skip the backend / live-API / live-data questions — there is no server. Verification runs
  against the real app and its real IndexedDB, so there is nothing to mock either.

*For desktop projects:*
- How do you start the dev build? (reference-sheet stack: `bun run dev`, which runs electron-vite with a live main process and renderer HMR)
- How do you run the test suite? (reference-sheet stack: `bun test` for unit and component tests, `bun run test:e2e` for the Playwright Electron suite)
- Skip the live-API / live-data questions unless the app also talks to a backend service of its own — if it does, ask the web/server questions for that backend.

**Tool Hygiene & Operability** (if missing):

This section captures the project's chosen mechanisms for the load-bearing tool-hygiene
practices that `/peak-workflow:capture-requirements` will turn into baseline TOR
requirements. Ask in order:

1. *Project type* — pick exactly one of:
   - **CLI tool** — primary interface is a command-line invocation
   - **Web app** — server-rendered or SPA, primary interface is a browser UI
   - **Desktop app** — Electron / Tauri / native, primary interface is a windowed application
   - **Service or API** — headless service exposing HTTP / gRPC / message endpoints
   - **Library** — consumed by other code, no end-user runtime
   - **Hybrid** — combines two or more of the above (e.g., CLI that also runs as a service)

2. *Version exposure* — how does an end user observe the running tool's version? The
   mechanism varies by project type; the requirement that *some mechanism exists* is
   universal. Suggest defaults:
   - CLI: `--version` flag printing `<name> v<semver>` to stdout, exit 0
   - Web app (with a server): GET `/version` endpoint returning JSON, plus version visible in
     app footer or About page
   - Web app (browser-only / static SPA): no endpoint is possible — the version comes from
     `package.json#version`, injected at build time as `__APP_VERSION__` and rendered in the app
     footer, plus the version-stamped first console line
   - Desktop app: Help > About menu item (App menu > About on macOS) opens an in-app About
     dialog rendered in the renderer showing `<name> v<semver>` obtained from
     `app.getVersion()` over IPC, plus the startup log line. Native About panels sit outside
     the DOM and cannot be asserted by Playwright — do not use `role: 'about'` alone.
   - Service/API: GET `/version` or `/health` endpoint with version field
   - Library: `__version__` (or language-equivalent) constant exported from package root
   - Hybrid: list each applicable mechanism

3. *Version stamped at log startup* — confirm the project will emit the tool name and
   semantic version on the first log line at process / app / request-handler startup
   (e.g., `[INFO] myapp v1.2.0 starting`). Desktop app: the main process logs
   `<name> v<semver> starting` as its first line once the app is ready. Static SPA: `main.tsx`
   writes `<name> v<semver> starting` to the browser console before mounting the router — the
   console is the only log this shape has.

4. *Version single source of truth* — what is the authoritative file for the version
   number? The version is defined in exactly one place and read everywhere else. Examples:
   `pyproject.toml [project.version]`, `package.json#version`, `Cargo.toml [package.version]`,
   `*.csproj <Version>`, `go.mod` (with build-time injection), etc.

5. *Logging convention*:
   - Levels — what set? (default: `DEBUG / INFO / WARN / ERROR`)
   - Format — `structured JSON` / `key=value` / `human-readable plain text`?
   - Where is the logger configured? (file path)
   - Web app / Service default (reference sheet): Pino via `hono-pino`, structured JSON to
     stdout, level from a `LOG_LEVEL` env var, configured in `apps/api/src/app.ts`.
   - Static SPA default: the browser `console` — there is nowhere to ship logs to. Declare the
     levels in use and keep `console.debug` out of the production path.
   - Desktop app default: electron-log in the main process (`electron-log/main`,
     `log.initialize()`), file under `app.getPath('logs')`, human-readable plain text;
     renderer logs route through `electron-log/renderer`.

6. *Exit code convention* (CLI / Hybrid only — otherwise mark `N/A — not a CLI`; Desktop
   app: `N/A` unless the app also has a CLI entry point):
   - 0 — success
   - 1 — operational failure (file not found, permission denied, downstream failure, etc.)
   - 2 — invalid invocation (bad flags, missing required args)
   - Any additional codes the project defines.

7. *stdout / stderr discipline* (CLI / Hybrid only — otherwise mark `N/A`; Desktop app:
   `N/A` unless the app also has a CLI entry point):
   - stdout — data, parseable output, primary results
   - stderr — diagnostics, progress, errors, log output

8. *Error message standard* — confirm user-facing errors will name the problem AND the
   next user action (on screen for Web / Desktop apps, on stderr for CLI tools). Format examples:
   CLI — `Error: configuration file not found at <path>. Try --config to specify an alternate path.`
   Desktop — `Could not save order #123: the database file is locked. Close other copies of the app and try again.`

Generate the section using this template, filling in the project-specific answers:

```markdown
## Tool Hygiene & Operability

This section declares the project's conventions for the load-bearing tool-hygiene practices.
Each line is a baseline TOR requirement source — `/peak-workflow:capture-requirements` will
ensure at least one TOR exists per active line, written in the form appropriate to the
declared mechanism. Lines marked `N/A` are skipped. Project type and Version single source
of truth are declarations, not TOR sources.

**Project type:** [CLI tool / Web app / Desktop app / Service or API / Library / Hybrid]

**Version exposure:** [Mechanism declaration. Example for a CLI: `--version` flag printing
`myapp v<semver>` to stdout with exit code 0. Example for a Web app: GET `/version` endpoint
returning JSON `{name, version}` AND version visible in app footer. Example for a Desktop app:
Help > About opens an in-app About dialog (rendered in the renderer) showing `myapp v<semver>`
from `app.getVersion()` over IPC.]

**Version stamped at log startup:** The first log line emitted on process / app startup
includes the tool name and semantic version (e.g., `[INFO] myapp v1.2.0 starting`).

**Version single source of truth:** [Authoritative file path, e.g., `pyproject.toml [project.version]`]

**Logging convention:**
- Levels: [DEBUG / INFO / WARN / ERROR — adjust to project's chosen set]
- Format: [structured JSON / key=value / human-readable plain text]
- Configured at: [file path]

**Exit code convention:** [CLI / Hybrid — list codes; otherwise: `N/A — not a CLI`]

**stdout / stderr discipline:** [CLI / Hybrid — restate; otherwise: `N/A`]

**Error message standard:** User-facing errors name the problem AND the next user action.
[CLI example: `Error: configuration file not found at <path>. Try --config to specify an
alternate path.` / Web or Desktop example: `Could not save order #123: the database file is
locked. Close other copies of the app and try again.` — keep the one that applies]
```

**UX Baseline** (if missing — Project type Web app, Desktop app, or Hybrid with a UI only):

If the Project type is CLI tool, Service or API, or Library, write nothing and report
`[N/A] UX Baseline — no user interface`.

This section is the UI counterpart of Tool Hygiene & Operability: the interaction conventions
every screen must meet, each turned into a baseline TOR by
`/peak-workflow:capture-requirements` (Step 3A.2.2) and checked on every UI epic by
`/peak-workflow:wrapup-epic`. It covers UX, not visual style — palette, typography, and brand
belong in a design doc or the `frontend-design` skill, never here. Every line has a default a
non-technical user can accept as-is. Present the defaults as one block and ask for a single
accept / override answer; override line by line only where the user asks.

1. *Design system* — a declaration consumed by the walking skeleton in
   `/peak-workflow:plan-project`, not a TOR. Default: **shadcn/ui on Tailwind v4**, themed
   only through CSS-variable tokens:
   - Tokens live in `:root` / `.dark` CSS variables in the global stylesheet, exposed to
     Tailwind through an `@theme inline` block. The path follows the stack's layout: `src/index.css`
     for a static SPA or a single-app Vite tree, `apps/web/src/index.css` for the web sheet's
     workspace layout, `src/renderer/src/index.css` for the desktop sheet. Name the path the
     project will actually have — the walking skeleton creates it.
   - `--radius` is the single radius knob — the whole radius scale derives from it.
   - Base color is chosen at `bunx shadcn@latest init` (current set: `neutral`, `stone`,
     `zinc`, `mauve`, `olive`, `mist`, `taupe`; default `neutral`) and is not changed casually
     afterwards.
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
   controls, and the window refuses to shrink below it. Default shown in the block: 800 x 600
   — changed only if the user names this line at the single accept / override question.

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
    200 ms). Default shown in the block: `N/A` — changed only if the user names this line at
    the single accept / override question.

12. *Undo* (optional TOR, default `N/A`) — reversible actions offer Undo (Ctrl/Cmd+Z or an
    "Undo" control), and unsaved form input survives an accidental reload of the same screen
    (WCAG 2.2 SC 3.3.7). Default shown in the block: `N/A` — changed only if the user names
    this line at the single accept / override question.

13. *Desktop conventions* (Desktop app only — each bullet is a TOR; omit the whole line for
    Web apps). Any bullet may be marked `N/A`. Default the file-dialog bullet to `N/A` unless
    the vision / ConOps or the user names Open, Save, Import, or Export:
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
reviewed by `/peak-workflow:start-epic` (during implementation) and `/peak-workflow:wrapup-epic`
(during independent review).

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
In Node.js, prefer `child_process.execFile` over `exec`. In any language, never use `eval`
or `Function()` constructors on user input.

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

**Deferred-provider projects only** — when the Tech Stack records `Auth: deferred provider`,
append this fourth reminder to the section verbatim. It is the guardrail for the stub the
Tech Stack step just authorized:

```markdown
**A stubbed sign-in must never reach production.**
Until the provider epic lands, the development sign-in stub is the only identity mechanism in
the codebase. It must be unreachable in a production build: a production build with no identity
provider configured refuses to start rather than falling back to a signed-in, anonymous, or
default user. Never widen the stub to "just for this demo" — a temporary auth bypass that ships
is a breach, not a shortcut. Per-user ownership checks are NOT part of the stub and are enforced
for real from the first epic; `/peak-workflow:wrapup-epic` reviews both on every epic that
touches user data.
```

**Peak Workflow** (if missing):
- Where does the requirements baseline live? (default: `docs/requirements/`)
- Where does the implementation plan live? (default: `docs/implementation-plan/` — run `/peak-workflow:status` for the dashboard)
- Confirm the peak commands should be listed: `/peak-workflow:discover`, `/peak-workflow:mockup`, `/peak-workflow:capture-requirements`, `/peak-workflow:plan-project`, `/peak-workflow:add`, `/peak-workflow:triage <issue|description>`, `/peak-workflow:start-epic <id>`, `/peak-workflow:wrapup-epic <id>`, `/peak-workflow:pause`, `/peak-workflow:quick-fix <issue|description>`, `/peak-workflow:refresh-docs`, `/peak-workflow:status`, `/peak-workflow:setup`
- Leave room for a `**Recommended skills:**` line — Step 8 writes it for Web app / Desktop app / Hybrid-with-UI projects only; for CLI / Service / Library projects write nothing.

**Verification & Quality Gates** (if missing):
- What checks should run before an epic is marked complete? Ask about each:
  - Build/compile check? If so, what command?
  - Tests? If so, what command? (Reuse the test command already captured under Local Environment — ask only where the tests live.)
  - Linting or formatting? If so, what command?
  - Visual/screenshot verification? (suggest `playwright-cli` for web UIs; the Playwright
    Electron harness in `e2e/` for desktop)
  - Brand or design compliance? (suggest brand guidelines skill if applicable)
  - Any other project-specific checks?
  - Where do tests live? List every directory wrapup must grep — unit and E2E (Desktop
    default: `tests/` and `e2e/`). List the E2E directory last on the Test directories line.

  *For CLI/tool projects skip the visual/screenshot and brand questions — ask only about build, tests, lint, "run the tool with a known input" (reuse the Local Environment invocation), and where tests live (usually one directory; no E2E).*

  The written section must open with this template (substitute the answers; keep the bold
  labels verbatim — `/peak-workflow:start-epic` and `/peak-workflow:wrapup-epic` grep every
  directory on the `Test directories` line, which is **space-separated**, no commas, E2E
  directory last). Omit the `(UI only)` rows for CLI / Service / Library projects; include the
  `Run the tool` row for CLI projects only; drop the second half of the `Tests` row when there
  is no E2E suite.

  `tests/ e2e/` in the template below is a placeholder, not a default — write the directories the
  project actually has. For a stack taken from a reference sheet, copy the sheet's Section 3
  layout: web app `tests/unit tests/api tests/components tests/e2e`; static SPA
  `tests/unit tests/components tests/e2e`; desktop app `tests/ e2e/`. A directory named here that
  does not exist makes every `start-epic` and `wrapup-epic` grep silently return nothing:

```markdown
## Verification & Quality Gates

**Test directories:** tests/ e2e/

Run every applicable check before marking an epic Implemented or Complete:

- **Build:** `[build command]`
- **Tests:** `[unit command]` (tests/); `[e2e command]` (e2e/)
- **Lint / format:** `[lint command]`
- **Run the tool:** `[invocation with known input]` → `[expected output]` *(the walking-skeleton epic uses the `--version` invocation here — domain inputs apply once the owning epic ships)*
- **Visual / console (UI only):** [`playwright-cli` against the running app / the Playwright Electron harness in `e2e/`]
- **Brand (UI only, if a brand skill is configured):** [skill name]
- [Any other project-specific check]
```

After gathering answers, **validate each command answer**: if the user provides a non-empty
answer that looks like a description rather than a runnable shell command (e.g., it contains no
executable token — no path separators, no dot-separated binary name, no recognizable CLI verb
like `pytest`, `npm`, `dotnet`, `make`, `cargo`, `go test`, etc.), prompt once:
> That looks like a description rather than a shell command. What's the exact command to run?
> For example: `pytest tests/`, `npm test`, `dotnet test`, `make check`
If the second answer is still ambiguous, accept it and add a note in the written section:
> *(Command may need refinement — update CLAUDE.md before the first `/peak-workflow:start-epic`)*

**Important Reminders** (if missing):
- Any project-specific constraints or gotchas that Claude should always know about?
- Libraries or patterns to avoid?
- Naming conventions or code organization rules?

**Reference Materials** (if missing):
- Are there architecture docs, design docs, or reference projects Claude should read?
- Any external resources (Confluence, Linear, Figma) worth pointing to?
- For a Web app, Service or API, or Desktop app project, offer to add a line pointing at the
  reference stack sheet the Tech Stack step actually used — `bun-web-app-stack.md`,
  `bun-static-spa-stack.md`, or `bun-electron-desktop-stack.md` under the installed plugin's
  `references/` directory (`${CLAUDE_PLUGIN_ROOT}/references/`, not a path inside this
  repository) — labelled as reference and layer checklist only, never a target to migrate the
  project toward.

**Git Workflow** (if missing):
- What is the branch strategy? (e.g., `develop` for active work, `main` for releases)
- Epic feature branches use the naming convention `feature/epic-<id>-<short-name>` where `<id>` is either a legacy integer (pre-v2.0.0 epics, e.g., `7` or `6.5`) or a 7-character alphanumeric ID (v2.0.0+ epics, e.g., `a3f2K7p`), and `<short-name>` is derived from the epic spec filename (e.g., `epic-a3f2K7p-user-auth.md` → `feature/epic-a3f2K7p-user-auth`). Include this convention in the Git Workflow section.
- Quick-fix branches use the naming convention `hotfix/issue-<N>-<slug>` when tied to a GitHub issue, or `hotfix/<slug>` otherwise. Include this convention too.
- Should merges use `--no-ff` to preserve commit history?
- Should Claude ask before pushing to origin?
- Are there files that must NEVER be committed? (e.g., `.env`, `appsettings*.json`, credentials)

**Verification Before Commit Rule** (if missing):
- What command builds the project? (e.g., `dotnet build`, `npm run build`, `python -m build` — or skip if no explicit build step)
- What command runs linting/formatting checks? (e.g., `ruff check .`, `dotnet format --verify-no-changes`, `eslint src/`)

  A thin answer ("whatever you recommend") takes the reference-sheet default exactly as the Tech Stack step does — do not route it through the description-vs-command validator below. All three sheets define the same script names, so the gates are identical for Web app, Service or API, static SPA, and Desktop app: Build `bun run build` (Desktop also has `bun run package` for the electron-builder output); Lint `bun run lint` (Biome); Typecheck `bun run typecheck`; Dead code `bun run deadcode`; Tests `bun test` plus `bun run test:e2e`. `bun run check` runs typecheck + lint + deadcode + tests in one command — record it as the single pre-commit gate when the project took the sheet's `package.json` unchanged.
- What command auto-fixes formatting? (e.g., `ruff format .`, `dotnet format`, `prettier --write .`)
- How do you verify the tool/app works after build?
  - *CLI/tool projects:* run the tool with a known input and check stdout (e.g., `python -m fibcalc 10` → expect `55`). For the walking-skeleton epic, which has no domain logic, the known input is the `--version` invocation (`python -m fibcalc --version` → `fibcalc v0.1.0`, exit 0).
  - *Web/server projects:* curl a health endpoint (e.g., `curl http://localhost:8080/api/health`) or use `playwright-cli`
  - *Desktop projects:* start the dev build (e.g., `bun run dev`) and run the Playwright Electron smoke test (e.g., `bun run test:e2e`)

When generating the Verification Before Commit section for a CLI/tool project, omit the `curl` and `playwright` references — replace the "Verify" step with the tool invocation command from the Local Environment answers, drop the `[stop command]` line from the example, and reword its comments to "Build" and "Run the tool with a known input". For desktop projects replace curl / playwright with the dev-build start command plus the Playwright Electron smoke test.
- Generate the section using this template, filling in the project-specific commands:

```markdown
## CRITICAL: Verification Before Commit Rule

**NEVER commit code changes before verification!**

A successful build (compile) does NOT equal working code. The workflow MUST be:

1. **Implement** — Make the code changes
2. **Lint** — Run `[lint command]` to verify formatting and static analysis
3. **Build** — Run `[build command]` to build *(omit or replace with a no-op note for projects with no explicit build step)*
4. **Verify** — Use [curl / playwright / the tool invocation / the dev build + Playwright Electron smoke test] or manual testing to confirm functionality
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

Derive the content from CLAUDE.md's Tech Stack, data sources, and project description sections.
For Desktop app projects title §4 "IPC Contracts" and §8 "Packaging & Distribution".

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

If the Tech Stack records `Auth: deferred provider`, write that decision as a numbered section
here — it is a real architectural decision with a stated rationale, and Step 3 promised it would
land in this file:

```markdown
## N. Identity Provider Deferred

**Decision:** Per-record ownership and permission checks are enforced from the first epic. The
identity provider is not yet chosen; sign-in is a development-only stub behind a single
"who is the current user?" module, which fails closed in a production build.

**Rationale:** [The user's reason — provider not yet chosen / pending IT approval.] Deferring the
provider avoids blocking the project on a decision outside the team, while building ownership now
avoids a migration of every table and a rewrite of every query later.

**Resolves when:** the provider is named. `/peak-workflow:plan-project` carries this as its own
epic; the stub module is the only code that changes.
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

- If **present and non-empty**: `[PASS] README.md — exists`.
- If **missing or empty**: prompt to create a stub. If the user agrees, generate using
  this template (substitute project name and tech stack from CLAUDE.md):

```markdown
# {Project Name}

> {One-line description derived from CLAUDE.md project description.}

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
- If **missing**: prompt to create a [Keep a Changelog](https://keepachangelog.com/) stub.
  If the user agrees, generate:

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

Check whether `.gitignore` exists at the repo root.

- If **missing entirely**: print `[MISS] .gitignore — file missing`. Recommend creating
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
  - Editor / OS files: `.DS_Store`, `Thumbs.db`, `.vscode/` (project preference), `.idea/`
    (project preference)

  For each missing high-signal entry, report `[WEAK] .gitignore — missing entries: {list}`
  and prompt to append. Do not auto-edit `.gitignore` without asking — projects often
  intentionally exclude or include patterns.

### 7.5: CI Configuration

Check whether any of these exist:
- `.github/workflows/*.yml` (GitHub Actions)
- `.gitlab-ci.yml` (GitLab CI)
- `.circleci/config.yml` (CircleCI)
- `azure-pipelines.yml` (Azure Pipelines)
- `bitbucket-pipelines.yml` (Bitbucket Pipelines)
- `Jenkinsfile` (Jenkins)

If **at least one is present**: `[PASS] CI configuration — detected ({which})`.

If **none present**: print `[MISS] CI configuration — no pipeline detected`. Do NOT
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

If **lockfile missing** for the detected stack: print `[MISS] Lockfile — none found for
{stack}`. Do NOT auto-create — lockfiles must be generated by the package manager
(`npm install`, `poetry lock`, `cargo build`, etc.). Print this guidance:

> No lockfile found. Without one, `dev`/`prod` parity is at risk — different developers and
> CI runs may resolve different transitive dependency versions, producing flaky behavior.
> Generate the lockfile by running the package manager's install command, then commit it.
> For example:
> - Node.js: `npm install` (creates `package-lock.json`) — commit it
> - Python (Poetry): `poetry lock` — commit `poetry.lock`
> - Python (uv): `uv lock` — commit `uv.lock`
> - Rust: `cargo build` (creates `Cargo.lock`) — commit it for binaries (libraries omit)

### 7.7: Repo Hygiene Summary

Print a final checklist:
```
[PASS / MISS / WEAK] README.md
[PASS / MISS / WEAK] CHANGELOG.md
[PASS / MISS]        LICENSE
[PASS / MISS / WEAK] .gitignore
[PASS / MISS]        CI configuration
[PASS / MISS]        Lockfile ({stack-specific filename})
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
| CLI tool / Service or API / Library / Hybrid without a UI | None required — report `[N/A] Recommended skills — none required for {type}` and skip to Step 9 |

For each recommended skill, check whether it appears in this session's available-skills list
and report `[PASS] {skill} — installed` or `[MISS] {skill} — not installed`. Plugin skills are
listed namespaced (e.g., `frontend-design:frontend-design`) — match on the skill name after the
last `:`.

For each `[MISS]`, use `AskUserQuestion`:
- Question: `"The {skill} skill is not installed. Install it now?"`
- Options: `["Yes — show me the install commands", "No — skip for now"]`

On yes, print the commands for the user to run (this skill cannot run `/plugin` itself):

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
N/A — desktop apps verify through the Playwright Electron harness in `e2e/`.
```

Also print the precedence rule to the user verbatim: `frontend-design` shapes visual
execution; the UX Baseline and the design-system tokens take precedence over its aesthetic
choices.

## Step 9: Final Summary

**Unborn-HEAD check:** first run `git rev-parse --is-inside-work-tree`; if it fails, this is
not a git repository — suggest `git init` and skip the rest of this check. Otherwise, if
`git rev-parse --verify HEAD` fails (no commits yet), ask via `AskUserQuestion` whether to
commit the setup files now as `chore: initial project setup` on the current branch (`main` by
default) so `/peak-workflow:discover` can branch from a real base:
- Question: `"This repo has no commits yet. Commit the setup files now as 'chore: initial project setup' so /peak-workflow:discover can branch from a real base?"`
- Options: `["Commit now", "I'll commit myself"]`
On "Commit now", stage the files this session wrote or modified by path (never `git add -A`)
and commit. On "I'll commit myself", print: "Commit before running `/peak-workflow:discover` —
otherwise `main` will not exist to merge the docs/ branch back to."

Remind the user:
- `CLAUDE.md` is loaded automatically every session — the quality gates will apply to all future epic work
- The **Tool Hygiene & Operability** section in `CLAUDE.md` will be consumed by
  `/peak-workflow:capture-requirements` to produce baseline TOR requirements covering
  version exposure, log startup stamping, logging convention, exit codes (CLI),
  stdout/stderr discipline (CLI), and error-message standards. Lines marked `N/A` are
  skipped.
- *(UI project types only — omit for CLI / Service / Library:)* the **UX Baseline** section in `CLAUDE.md` follows the same chain:
  `/peak-workflow:capture-requirements` turns each active line into a baseline UX TOR, the
  walking skeleton epic in `/peak-workflow:plan-project` installs the declared design system and
  proves those TORs on one reference screen, and `/peak-workflow:wrapup-epic` runs the UX
  Baseline check as a quality gate on every UI epic. Lines marked `N/A` are skipped.
- *(UI project types only — omit for CLI / Service / Library:)* any `[MISS]` recommended skill from Step 8 should be installed before the first UI epic;
  `frontend-design` shapes visual execution, and the UX Baseline and design-system tokens take
  precedence over its aesthetic choices.
- The **Security Baseline** section in `CLAUDE.md` is reviewed by `/peak-workflow:start-epic`
  during implementation and by `/peak-workflow:wrapup-epic` during independent review. These
  reminders are not derived as TORs.
- `docs/architecture.md` and `docs/design-notes.md` are read by every `/peak-workflow:start-epic` and `/peak-workflow:wrapup-epic` for context
- For any `[MISS]` items in the Repo Hygiene audit (Step 7) that you did not resolve in
  this session — particularly LICENSE, CI configuration, and the lockfile — address them
  before publishing the project externally or merging significant work
- After implementing epics, run `/peak-workflow:refresh-docs` to bring the docs in sync with the as-built codebase

**Legacy layout check:** After completing the above, check whether `docs/implementation-plan/index.md` exists and contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column. If found, add a one-line reminder at the end of your summary:

> Your implementation plan uses the pre-v2.5.0 layout. Run `/peak-workflow:migrate-2.5` to upgrade to per-phase indexes + status sidecars and eliminate implementation-plan merge conflicts.
