# Reference Stacks

Reference sheets for the two application shapes peak-workflow builds most often. They are
**reference material, not a migration mandate.**

| Sheet | Shape | Runtime |
|---|---|---|
| [`bun-web-app-stack.md`](bun-web-app-stack.md) | Web app / Service or API — React SPA + Hono, single Docker container, SQLite on a volume, S3-compatible object storage | Bun **is** the runtime |
| [`bun-electron-desktop-stack.md`](bun-electron-desktop-stack.md) | Desktop app — Electron shell, React + shadcn/ui renderer, SQLite on disk | Bun is the **toolchain**; the app runs on Electron's Node |

## What these are for

1. **A starting stack for a brand-new project.** When `/peak-workflow:setup` gets a thin Tech
   Stack answer ("whatever you recommend"), the project-type default row it offers is the
   condensed form of these sheets. Read the matching sheet for the fuller picture — config
   files, repository layout, and the friction points each choice already accounts for.

2. **A layer checklist for any project, greenfield or existing.** Each sheet's *Stack Summary*
   table names every layer an application of that shape has to handle — runtime, build, UI,
   styling, client state, routing, data access, migrations, unit/component/E2E tests, lint,
   type checking, dead code, packaging, validation, config, secrets, storage. Use it to notice
   a layer a project has not decided on yet. The gap is the finding, not the library.

## What these are NOT for

**Never propose re-platforming or rewriting an existing project to match a sheet.** Many
projects already run on peak-workflow with different picks, and those picks are correct for
them. Specifically:

- Differing from a sheet is **not** a `/peak-workflow:wrapup-epic` gate failure, **not** a TOR,
  **not** a `/peak-workflow:triage` finding, and **not** epic scope.
- A project's own `CLAUDE.md` **Tech Stack** section is the single source of truth and wins
  over these sheets every time.
- Swap a library only when the user asks for it in their own words, as its own scoped work.

## Where the peak-workflow defaults deviate

The `/peak-workflow:setup` Desktop default and the desktop sheet are the same architecture with
three deliberate differences, each validated in a desktop dry run. Neither side is wrong — when
a project has already recorded one in `CLAUDE.md`, keep it and do not "correct" it toward the
other.

| Layer | Desktop sheet | `/setup` default | Why the default differs |
|---|---|---|---|
| Scaffold + build | electron-vite | Electron Forge `vite-typescript` template, scaffolded into a temp directory and moved into the repo root | The repo root already holds `CLAUDE.md`, `docs/`, and mockups by the time the walking skeleton runs; Forge ships the packaging scripts `/setup` records as quality gates |
| Packaging | electron-builder + electron-updater | Forge's `bun run package` | Follows the scaffolder above |
| Renderer / unit tests | `bun test` + happy-dom | Vitest (`bunx vitest`) | Keeps one runner across renderer and pure-TypeScript main code, where main code near the Electron-rebuilt `better-sqlite3` binary cannot run under Bun (the sheet's §10 names the same constraint) |

Everything else — React 19 + TypeScript strict, Tailwind v4 + shadcn/ui, lucide-react, Zustand +
TanStack Query, TanStack Router, Zod-validated IPC, `contextIsolation` + `sandbox`, SQLite with
WAL and foreign keys on, Playwright Electron for anything touching IPC or native modules —
matches on both sides.
