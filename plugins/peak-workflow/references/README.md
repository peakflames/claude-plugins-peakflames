# Reference Stacks

Reference sheets for the two application shapes peak-workflow builds most often. For a **new**
project they are the recommended stack `/setup` offers and the blueprint `/plan-project` builds
from. For an **existing** project they are reference material only — never a migration mandate.

| Sheet | Shape | Runtime |
|---|---|---|
| [`bun-static-spa-stack.md`](bun-static-spa-stack.md) | Browser-only web app — React SPA, data in IndexedDB on the person's device, deployed to GitHub Pages. No server, no accounts, no uploads | Bun is the **toolchain**; the app runs in the browser |
| [`bun-web-app-stack.md`](bun-web-app-stack.md) | Web app / Service or API — React SPA + Hono, single Docker container, SQLite on a volume, S3-compatible object storage | Bun **is** the runtime |
| [`bun-electron-desktop-stack.md`](bun-electron-desktop-stack.md) | Desktop app — Electron shell, React + shadcn/ui renderer, SQLite on disk | Bun is the **toolchain**; the app runs on Electron's Node |

**Web app is two sheets, not one.** `/peak-workflow:setup` asks five plain-language product-shape
questions before reading any sheet — does the data follow the person to another device, does
anyone sign in, are there file uploads, does anything update on its own, does the product hold a
secret of its own. All five "no" routes to the static sheet; any "yes" routes to the web-app
sheet. The answers are recorded in `CLAUDE.md` as a `**Product shape:**` block, and each Stack
Summary row they drop is written as `N/A — <reason> (shape Q<N>)` rather than omitted, so
`plan-project` reads it as a decision instead of a gap. `/peak-workflow:discover` re-checks those
answers against the ConOps scenarios once the product is described (its Step 4.5).

## What these are for

1. **The recommended stack for a new project.** These sheets *are* the recommendation — no
   condensed default list exists anywhere else in the plugin. When `/peak-workflow:setup` gets
   a thin Tech Stack answer ("whatever you recommend"), it reads the matching sheet's
   **Section 2 Stack Summary** and offers those picks; the user accepts the sheet wholesale or
   overrides individual layers, and what they accept is recorded in `CLAUDE.md`. When
   `/peak-workflow:plan-project` builds the greenfield walking skeleton, it creates the tree in
   **Section 3 Repository Layout** and writes the files in **Section 4 Configuration Files**,
   then wires up the later sections. No scaffolder is involved — the sheet is the scaffold.

2. **A layer checklist for any project, greenfield or existing.** Each sheet's *Stack Summary*
   table names the layers an application of that shape has to handle — runtime, build, UI, styling,
   client state, routing, data access, migrations, unit/component/E2E tests, lint, type checking,
   dead code, and whatever else that shape implies (packaging on the desktop sheet; hosting, config
   and secrets on the static sheet). Use it to notice a layer a project has not decided on yet. The
   gap is the finding, not the library — and where a sheet has no row for a layer the project does
   need, that absence is itself the finding.

## What these are NOT for

**Never propose re-platforming or rewriting an existing project to match a sheet.** Many
projects already run on peak-workflow with different picks, and those picks are correct for
them. Specifically:

- Differing from a sheet is **not** a `/peak-workflow:wrapup-epic` gate failure, **not** a TOR,
  **not** a `/peak-workflow:triage` finding, and **not** epic scope.
- A project's own `CLAUDE.md` **Tech Stack** section is the single source of truth and wins
  over these sheets every time — including a layer the user overrode when `/setup` offered the
  sheet.
- `/peak-workflow:plan-project` uses the sheets in Greenfield mode only. Brownfield planning
  (Step 3B) ignores them entirely.
- Swap a library only when the user asks for it in their own words, as its own scoped work.

## Editing these sheets

The sheets are the single source of truth for the picks, the repository layout, and the script
names (`dev`, `build`, `typecheck`, `lint`, `deadcode`, `test`, `test:e2e`, `check`; plus
`package` on the desktop sheet and `preview` / `lint:fix` on the static sheet).
`setup` and `plan-project` quote those script names in their quality-gate and verification
defaults, so a change to a sheet's `package.json` section means updating the matching lines in
`skills/setup/SKILL.md` and `skills/plan-project/SKILL.md` in the same commit.

A sheet must also be able to satisfy the baseline TORs `setup` derives from it. Every sheet's
Section 4 `package.json` carries a `version` field, and the sheet shows where that version is
exposed to the user and stamped on the first log line — otherwise `capture-requirements` writes
tool-hygiene TORs the skeleton cannot pass.
