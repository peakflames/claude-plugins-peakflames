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
| **UX Baseline** | Project type Web app, Desktop app, or Hybrid with a UI only. Declares the design system (default shadcn/ui on Tailwind, themed only through CSS-variable tokens) and the interaction conventions every screen must meet: screen states, keyboard & focus, forms, destructive actions, progress feedback, layout floor, contrast, reduced motion, navigation, and (desktop) application-menu conventions. Each TOR line becomes a baseline UX TOR via `/peak-workflow:capture-requirements` (Step 3A.2.2); the walking skeleton in `/peak-workflow:plan-project` installs the design system; `/peak-workflow:wrapup-epic` runs the UX Baseline check on every UI epic. For CLI / Service / Library projects report `[N/A] UX Baseline — no user interface`. |
| **Security Baseline** | Lists the load-bearing coding-standard reminders that are NOT testable as positive observable shall-statements: no `shell=True` / `eval` on user input, no logging of secrets or PII, no secrets committed to the repo. Reviewed by `/peak-workflow:start-epic` and `/peak-workflow:wrapup-epic`, not derived as TORs. |
| **Peak Workflow** | References the peak commands (`/peak-workflow:discover`, `/peak-workflow:capture-requirements`, `/peak-workflow:plan-project`, `/peak-workflow:add`, `/peak-workflow:triage`, `/peak-workflow:start-epic`, `/peak-workflow:wrapup-epic`, `/peak-workflow:pause`, `/peak-workflow:quick-fix`, `/peak-workflow:refresh-docs`, `/peak-workflow:status`, `/peak-workflow:setup`) and points to the requirements directory (`docs/requirements/`) and implementation plan |
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
— carry the answer forward so it is not asked twice) and offer that type's default stack. The
user accepts the whole row with one answer or overrides any cell:

| Project type | Default stack (accept as-is or override any cell) |
|---|---|
| **Web app** | TypeScript end to end. Bun runtime with Hono (or Elysia) for the server; React + Vite + shadcn/ui + Tailwind v4 for the UI; `bun:sqlite` for the database. Bun for install / run / test / `bunx`. |
| **Desktop app** | TypeScript end to end. Electron Forge `vite-typescript` template scaffolded with `bunx create-electron-app@latest <name> --template=vite-typescript`, React added afterwards (`bun add react react-dom`, `bun add -d @vitejs/plugin-react`); shadcn/ui + Tailwind v4 in the renderer; better-sqlite3 in the main process only (Forge rebuilds it for Electron automatically; DB file under `app.getPath('userData')`, WAL mode); electron-log; electron-window-state. Bun for install / run / test / `bunx` — the app itself runs on Electron's bundled Node, not the Bun runtime, so `bun:sqlite` and other Bun APIs are not available inside the app. |
| **Service or API** | TypeScript. Bun runtime with Hono (or Elysia); `bun:sqlite`; Bun for install / run / test / `bunx`. |
| **CLI tool / Library** | No stack default — use the language and toolchain the user names. |

Every project type: start with SQLite unless the user names another database. Desktop note:
if `package.json` gains a `trustedDependencies` list, it replaces Bun's default trusted list,
so `electron` and `better-sqlite3` must then be listed explicitly.

**Local Environment** (if missing):

First, determine the project type from the Tech Stack answers already captured. If the tech stack includes Electron, Tauri, or a native windowing toolkit, treat it as a **desktop project**. Otherwise, if it includes a web framework, HTTP server, REST API library, or mentions "frontend" / "backend", treat it as a **web/server project**. Otherwise (CLI tool, library, script), treat it as a **CLI/tool project**.

*For CLI/tool projects:*
- How do you invoke the tool locally? (e.g., `python -m fibcalc 10`, `./mytool --help`, `go run . 5`)
- How do you run the test suite? (e.g., `pytest tests/`, `go test ./...`, `cargo test`)
- Skip the frontend/backend/live-data questions — they don't apply.

*For web/server projects:*
- How do you run the backend locally? (e.g., `dotnet run`, `npm start`, etc.)
- How do you run the frontend locally? (e.g., `bun run dev`, `npm run dev`, etc.)
- Is the backend API live and functional in local dev? (i.e., can it connect to real data sources like databases?)
- Should verification always use live data instead of mocking API responses?

*For desktop projects:*
- How do you start the dev build? (e.g., `bun run start` for Electron Forge, which launches the app with a live main process and renderer hot reload)
- How do you run the test suite? (e.g., `bun test`, `npm test`)
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
   - Web app: GET `/version` endpoint returning JSON, plus version visible in app footer
     or About page
   - Desktop app: Help > About dialog (App menu > About on macOS) showing the app name and
     semantic version (Electron: `app.getVersion()` with `app.setAboutPanelOptions` and a
     `role: 'about'` menu item, or a `dialog.showMessageBox`), plus the startup log line
   - Service/API: GET `/version` or `/health` endpoint with version field
   - Library: `__version__` (or language-equivalent) constant exported from package root
   - Hybrid: list each applicable mechanism

3. *Version stamped at log startup* — confirm the project will emit the tool name and
   semantic version on the first log line at process / app / request-handler startup
   (e.g., `[INFO] myapp v1.2.0 starting`). Desktop app: the main process logs
   `<name> v<semver> starting` as its first line once the app is ready.

4. *Version single source of truth* — what is the authoritative file for the version
   number? The version is defined in exactly one place and read everywhere else. Examples:
   `pyproject.toml [project.version]`, `package.json#version`, `Cargo.toml [package.version]`,
   `*.csproj <Version>`, `go.mod` (with build-time injection), etc.

5. *Logging convention*:
   - Levels — what set? (default: `DEBUG / INFO / WARN / ERROR`)
   - Format — `structured JSON` / `key=value` / `human-readable plain text`?
   - Where is the logger configured? (file path)
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
   next user action (on screen for Web / Desktop apps, on stderr for CLI tools). Format example:
   `Error: configuration file not found at <path>. Try --config to specify an alternate path.`

Generate the section using this template, filling in the project-specific answers:

```markdown
## Tool Hygiene & Operability

This section declares the project's conventions for the load-bearing tool-hygiene practices.
Each line is a baseline TOR requirement source — `/peak-workflow:capture-requirements` will
ensure at least one TOR exists per active line, written in the form appropriate to the
declared mechanism. Lines marked `N/A` are skipped.

**Project type:** [CLI tool / Web app / Desktop app / Service or API / Library / Hybrid]

**Version exposure:** [Mechanism declaration. Example for a CLI: `--version` flag printing
`myapp v<semver>` to stdout with exit code 0. Example for a Web app: GET `/version` endpoint
returning JSON `{name, version}` AND version visible in app footer. Example for a Desktop app:
Help > About dialog showing `myapp v<semver>` via `app.getVersion()`.]

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
Example: `Error: configuration file not found at <path>. Try --config to specify an
alternate path.`
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
   - Tokens live in `:root` / `.dark` CSS variables in the global stylesheet
     (`src/index.css` for Vite), exposed to Tailwind through an `@theme inline` block.
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
   Desktop app: every window is usable at the declared minimum window size (default
   800 x 600) with no clipped controls, and the window refuses to shrink below it. Ask the
   user for the minimum window size.

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
    200 ms). Ask whether the user wants it; otherwise write `N/A`.

12. *Undo* (optional TOR, default `N/A`) — reversible actions offer Undo (Ctrl/Cmd+Z or an
    "Undo" control), and unsaved form input survives an accidental reload of the same screen
    (WCAG 2.2 SC 3.3.7). Ask whether the user wants it; otherwise write `N/A`.

13. *Desktop conventions* (Desktop app only — each bullet is a TOR; omit the whole line for
    Web apps):
    - Application menu with the platform's standard menus (App / File / Edit / View / Window /
      Help on macOS; File / Edit / View / Help elsewhere) using standard roles for Undo, Redo,
      Cut, Copy, Paste, Select All, Close, Minimize, Quit, About.
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
- Tokens: `:root` / `.dark` CSS variables in [`src/index.css`], mapped through `@theme inline`.
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
  Copy, Paste, Select All, Close, Minimize, Quit, About.
- Primary commands have `CmdOrCtrl` accelerators matching platform shortcuts; every menu item
  with a shortcut displays it.
- Window size, position, and maximized state are restored on relaunch, clamped to a visible display.
- A second launch focuses and restores the running window instead of starting a new instance.
- Open / Save / Export use native file dialogs with file-type filters.
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

**Peak Workflow** (if missing):
- Where does the requirements baseline live? (default: `docs/requirements/`)
- Where does the implementation plan live? (default: `docs/implementation-plan/` — run `/peak-workflow:status` for the dashboard)
- Confirm the peak commands should be listed: `/peak-workflow:discover`, `/peak-workflow:capture-requirements`, `/peak-workflow:plan-project`, `/peak-workflow:add`, `/peak-workflow:triage <issue|description>`, `/peak-workflow:start-epic <id>`, `/peak-workflow:wrapup-epic <id>`, `/peak-workflow:pause`, `/peak-workflow:quick-fix <issue|description>`, `/peak-workflow:refresh-docs`, `/peak-workflow:status`, `/peak-workflow:setup`
- Leave room for a `**Recommended skills:**` line — Step 8 writes it.

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
> *(Command may need refinement — update CLAUDE.md before the first `/peak-workflow:start-epic`)*

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
- What command builds the project? (e.g., `dotnet build`, `npm run build`, `python -m build` — or skip if no explicit build step)
- What command runs linting/formatting checks? (e.g., `ruff check .`, `dotnet format --verify-no-changes`, `eslint src/`)
- What command auto-fixes formatting? (e.g., `ruff format .`, `dotnet format`, `prettier --write .`)
- How do you verify the tool/app works after build?
  - *CLI/tool projects:* run the tool with a known input and check stdout (e.g., `python -m fibcalc 10` → expect `55`)
  - *Web/server projects:* curl a health endpoint (e.g., `curl http://localhost:8080/api/health`) or use `playwright-cli`

When generating the Verification Before Commit section for a CLI/tool project, omit the `curl` and `playwright` references — replace the "Verify" step with the tool invocation command from the Local Environment answers.
- Generate the section using this template, filling in the project-specific commands:

```markdown
## CRITICAL: Verification Before Commit Rule

**NEVER commit code changes before verification!**

A successful build (compile) does NOT equal working code. The workflow MUST be:

1. **Implement** — Make the code changes
2. **Lint** — Run `[lint command]` to verify formatting and static analysis
3. **Build** — Run `[build command]` to build *(omit or replace with a no-op note for projects with no explicit build step)*
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
4. Run `/peak-workflow:start-epic <id>` to implement each epic — tests are derived from
   TOR Given/When/Then.
5. Run `/peak-workflow:wrapup-epic <id>` to independently verify each TOR requirement is satisfied.
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
- Node.js: `package-lock.json` | `yarn.lock` | `pnpm-lock.yaml` | `bun.lockb`
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
| Web app / Desktop app / Hybrid with a UI | `frontend-design` (default source: `frontend-design@claude-plugins-official`) for visual execution; `playwright-cli` for UI verification in `/peak-workflow:wrapup-epic` |
| CLI tool / Service or API / Library | None required — report `[N/A] Recommended skills — none required for {type}` and skip to Step 9 |

For each recommended skill, check whether it appears in this session's available-skills list
and report `[PASS] {skill} — installed` or `[MISS] {skill} — not installed`.

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

Also print the precedence rule to the user verbatim: `frontend-design` shapes visual
execution; the UX Baseline and the design-system tokens take precedence over its aesthetic
choices.

## Step 9: Final Summary

Remind the user:
- `CLAUDE.md` is loaded automatically every session — the quality gates will apply to all future epic work
- The **Tool Hygiene & Operability** section in `CLAUDE.md` will be consumed by
  `/peak-workflow:capture-requirements` to produce baseline TOR requirements covering
  version exposure, log startup stamping, logging convention, exit codes (CLI),
  stdout/stderr discipline (CLI), and error-message standards. Lines marked `N/A` are
  skipped.
- For UI projects, the **UX Baseline** section in `CLAUDE.md` follows the same chain:
  `/peak-workflow:capture-requirements` turns each active line into a baseline UX TOR, the
  walking skeleton epic in `/peak-workflow:plan-project` installs the declared design system and
  proves those TORs on one reference screen, and `/peak-workflow:wrapup-epic` runs the UX
  Baseline check as a quality gate on every UI epic. Lines marked `N/A` are skipped.
- Any `[MISS]` recommended skill from Step 8 should be installed before the first UI epic;
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
