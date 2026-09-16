# Bun + Electron Desktop App Reference Sheet

A reference stack for building a Claude Desktop–style application with Bun as the toolchain,
Electron as the shell, React + shadcn/ui for the UI, and Drizzle over SQLite for local data.

Every choice below is compatible with the others and has been selected for high implementation
confidence over novelty.

> **How to use this sheet — read before acting on it.**
>
> This is **reference material, not a migration mandate.** It exists for two purposes:
>
> 1. **The recommended stack for a brand-new project of this shape.** When
>    `/peak-workflow:setup` is told "whatever you recommend", it reads Section 2 of this sheet
>    and offers exactly these picks — there is no separate default list. `/peak-workflow:plan-project`
>    then builds the walking skeleton from Sections 3 and 4.
> 2. **A layer checklist for any project** — the Stack Summary table names every layer an
>    application of this shape has to handle (runtime, build, UI, state, routing, data,
>    migrations, tests, lint, packaging, auto-update, config, secrets, storage). Use it to notice a layer
>    the project has not decided yet.
>
> **Never** propose re-platforming, rewriting, or swapping a library in an existing project
> because it differs from this sheet. A project that ships on a different framework, test
> runner, ORM, or bundler is not out of compliance — differing from this sheet is not a
> finding, not a TOR, and not epic scope. The project's own `CLAUDE.md` Tech Stack is the
> single source of truth and wins over this sheet every time. Adopt a change from here only
> when the user asks for it in their own words.

---

## 1. Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────┐
│ Electron app (electron-builder package)                      │
│                                                              │
│  ┌──────────────┐   IPC (typed, Zod)   ┌───────────────────┐ │
│  │ Renderer      │ ◄──────────────────► │ Main (Node)        │ │
│  │ React 19      │                      │ ipcMain handlers   │ │
│  │ shadcn/ui     │                      │ window mgmt        │ │
│  │ TanStack      │                      │ auto-update (opt.) │ │
│  └──────────────┘                      └─────────┬─────────┘ │
│        ▲ preload (contextBridge)                  │           │
│                                        ┌─────────▼─────────┐ │
│                                        │ core package       │ │
│                                        │ Drizzle ORM        │ │
│                                        │ DbDriver interface │ │
│                                        └─────────┬─────────┘ │
│                                                  │           │
│                        better-sqlite3 (default)  │  bun:sqlite│
│                        in main process           │  in Bun    │
│                                                  │  sidecar   │
│                                                  ▼  (optional)│
│                                            app.db (SQLite)   │
└──────────────────────────────────────────────────────────────┘
```

**Key constraint:** Electron's main process is Node. `bun:sqlite` only exists inside the Bun
runtime. Bun is therefore the *toolchain* (install, scripts, tests, bundling), not the runtime,
unless you add a Bun sidecar process (Section 9).

---

## 2. Stack Summary

| Layer           | Pick                                                                | Why                                                                                              |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Shell           | Electron (current stable)                                           | Uniform Chromium on every OS, mature signing and auto-update. Same choice as Claude Desktop.     |
| Toolchain       | Bun 1.2+                                                            | Package manager, script runner, unit test runner. One fast binary.                               |
| Build           | electron-vite                                                       | One config bundles main, preload and renderer. HMR in the renderer.                              |
| UI              | React 19 + TypeScript 5 (strict)                                    | Boring and correct.                                                                              |
| Styling         | Tailwind CSS v4 + shadcn/ui                                         | shadcn supports Tailwind v4 and React 19. Components are copied into your repo, no version lock. |
| Icons           | lucide-react                                                        | The icon set shadcn assumes.                                                                     |
| Client state    | Zustand (UI state) + TanStack Query (anything crossing IPC)         | Query gives caching, retries and invalidation over async IPC for free.                           |
| Routing         | TanStack Router (memory history)                                    | Type-safe routes, works in a `file://` renderer.                                                 |
| IPC             | electron-trpc, or hand-rolled channels validated with Zod           | End-to-end types from main to renderer. Boundary validation is mandatory.                        |
| Database        | Drizzle ORM + drizzle-kit, driver `better-sqlite3`                  | Synchronous and fast. Drizzle's `bun-sqlite` driver is API-identical if you move to a sidecar.   |
| Migrations      | drizzle-kit `generate`, applied with Drizzle `migrate()` at startup | SQL folder shipped as an extra resource. Never `push` in production.                             |
| Unit tests      | `bun test`                                                          | Native, Jest-compatible API.                                                                     |
| Component tests | `bun test` + happy-dom + Testing Library                            | Officially documented by Bun. One runner for everything.                                         |
| E2E             | Playwright with the Electron launcher                               | Builds, then tests the production build (`out/`) in a real Electron window.                      |
| Lint + format   | Biome 2                                                             | One tool, one config. Covers React hooks rules and Tailwind class sorting.                       |
| Type-level lint | `tsc --noEmit` with `noUnusedLocals` and `noUnusedParameters`       | Catches what linters miss.                                                                       |
| Dead code       | Knip                                                                | Unused files, exports, types and dependencies. Has Vite and Electron plugins.                    |
| Packaging       | electron-builder                                                    | Installers for the OSes in `CLAUDE.md`'s `Target OS` row (NSIS, dmg, AppImage/deb). Per-OS signing. |
| Auto-update     | electron-updater                                                    | Delta updates from a publish target (GitHub Releases). Needs network and a publish target.       |
| Validation      | Zod                                                                 | Shared schemas for IPC, config and settings.                                                     |

### 2.1 Dropping a layer

When `CLAUDE.md` marks a row `N/A`, or its Tech Stack `Target OS:` row omits an OS, leave out
exactly these pieces instead of copying Sections 3-4 verbatim. Everything else stays.

| Dropped                                           | Section 3 tree        | Section 4                                                                    | Other source / sections                                                         | Section 10 rows to omit                |
| ------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| Auto-update — `N/A — computers have no internet (shape Q6)` | `src/main/updater.ts` | 4.1 `electron-updater` dependency; 4.8 `publish: provider: github` becomes `publish: null` (else electron-builder infers GitHub from the git remote and writes `app-update.yml`); `zip` in `mac.target` | `startUpdater` import and call in `src/main/index.ts` (6.4)                     | Auto-update on macOS                   |
| `Target OS` omits macOS                           | —                     | 4.8 `mac` block                                                              | 9.3 `bun-darwin-*` build lines (sidecar only)                                   | macOS signing; Auto-update on macOS    |
| `Target OS` omits Windows                         | —                     | 4.8 `win` and `nsis` blocks                                                  | 9.3 `bun-windows-x64` build line (sidecar only)                                 | Windows code signing and SmartScreen   |
| `Target OS` omits Linux                           | —                     | 4.8 `linux` block                                                            | 9.3 `bun-linux-x64` build line (sidecar only)                                   | —                                      |

No row removes a script: every 4.1 script name stays, and `bun run package` builds installers only
for the OS it runs on.

**Offline.** When Auto-update is `N/A`, nothing in the app may need network at runtime: no CDN
scripts or stylesheets, no web fonts fetched at launch (system font stack or a bundled
`@fontsource/*` package), icons from the bundled `lucide-react` only, no telemetry upload. Only
`bun install` and `bun run package` on the build machine touch the network.

---

## 3. Repository Layout

```
my-app/
├── package.json                 # workspaces, scripts, trustedDependencies
├── bunfig.toml                  # test preload for happy-dom
├── biome.json
├── knip.json
├── tsconfig.base.json           # compiler options shared with packages/core
├── tsconfig.json                # root: typecheck, path aliases incl. `@/*` (4.3)
├── components.json              # shadcn/ui config, shipped, not generated (4.10)
├── electron.vite.config.mts
├── electron-builder.yml         # only the Target OS blocks (2.1)
├── playwright.config.ts
├── drizzle.config.ts
├── drizzle/                     # generated SQL migrations (committed)
│   └── 0000_init.sql
├── packages/
│   └── core/                    # pure TS, no Electron imports
│       ├── src/
│       │   ├── db/
│       │   │   ├── schema.ts    # Drizzle schema
│       │   │   ├── driver.ts    # DbDriver interface
│       │   │   └── migrate.ts
│       │   ├── services/        # business logic
│       │   └── ipc-contract.ts  # Zod schemas shared by main + renderer
│       └── tsconfig.json
├── src/
│   ├── main/
│   │   ├── index.ts             # startup order, single instance, first log line at startup, menu, window (6.4)
│   │   ├── menu.ts              # native application menu (6.8)
│   │   ├── window-state.ts      # size/position restore, clamped to a display (6.5)
│   │   ├── db.ts                # better-sqlite3 driver wiring
│   │   ├── ipc.ts               # ipcMain handlers + main → renderer events (validated)
│   │   ├── test-env.ts          # test-only fault switch + data dir (7)
│   │   └── updater.ts           # omit when Auto-update is N/A (2.1)
│   ├── preload/
│   │   └── index.ts             # contextBridge.exposeInMainWorld
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx         # imports ./index.css
│           ├── index.css        # Tailwind + shadcn design tokens (4.10)
│           ├── router.tsx
│           ├── env.d.ts         # window.api type (6.3)
│           ├── lib/
│           │   └── utils.ts     # `cn`, imported as "@/lib/utils" (4.10)
│           ├── components/
│           │   ├── ui/          # shadcn components (`bunx shadcn@latest add`)
│           │   └── about-dialog.tsx # Help > About dialog (6.7)
│           ├── stores/          # Zustand
│           └── queries/         # TanStack Query hooks
├── tests/
│   ├── setup/happy-dom.ts       # bun test preload (4.2)
│   ├── unit/                    # bun test
│   ├── components/              # bun test + happy-dom
│   └── e2e/                     # Playwright (testDir in playwright.config.ts)
│       ├── app.spec.ts          # (7)
│       └── doubles.ts           # test doubles for native dialogs (7)
└── sidecar/                     # optional, Section 9
```

---

## 4. Configuration Files

### 4.1 `package.json`

```json
{
  "name": "my-app",
  "productName": "MyApp",
  "private": true,
  "version": "0.1.0",
  "main": "./out/main/index.js",
  "workspaces": ["packages/*"],
  "trustedDependencies": ["electron"],
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "bun run build && electron-builder",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "deadcode": "knip",
    "test": "bun test tests/unit tests/components",
    "test:e2e": "bun run build && playwright test",
    "db:generate": "drizzle-kit generate",
    "check": "bun run typecheck && bun run lint && bun run deadcode && bun run test"
  },
  "dependencies": {
    "better-sqlite3": "^13",
    "drizzle-orm": "^0.44",
    "electron-log": "^5",
    "electron-updater": "^6",
    "zod": "^3",
    "@tanstack/react-query": "^5",
    "@tanstack/react-router": "^1",
    "zustand": "^5",
    "react": "^19",
    "react-dom": "^19",
    "lucide-react": "latest",
    "class-variance-authority": "latest",
    "cn": "latest",
    "radix-ui": "latest"
  },
  "devDependencies": {
    "electron": "^44",
    "electron-vite": "^5",
    "electron-builder": "^26",
    "vite": "^7",
    "@vitejs/plugin-react": "^5",
    "typescript": "^5",
    "@types/better-sqlite3": "^9",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/bun": "latest",
    "tailwindcss": "^4",
    "@tailwindcss/vite": "^4",
    "shadcn": "latest",
    "tw-animate-css": "latest",
    "drizzle-kit": "^0.31",
    "@biomejs/biome": "^2.2",
    "knip": "^5",
    "@happy-dom/global-registrator": "latest",
    "@testing-library/react": "^16",
    "@testing-library/dom": "^10",
    "@playwright/test": "^1"
  }
}
```

> Version ranges are indicative. Pin from the lockfile (`bun install`), and check the Electron
> release notes for the current stable major before starting. `vite` stays `^7`: electron-vite 5
> does not accept Vite 8.

**No native rebuild.** better-sqlite3 13 is N-API and ships prebuilt `.node` files for
Windows, macOS and Linux (x64, arm64) inside the npm package, which load under any Electron; so no
`postinstall`, no `@electron/rebuild`, and only `electron` (binary download) is trusted.

`productName` is the name `app.getName()`, the About dialog, the first log line and the installer
show. No `"type": "module"`: with it electron-vite emits an ESM `preload/index.mjs`, which a
sandboxed window (6.4) cannot load. `cn`, `radix-ui`, `shadcn` and `tw-animate-css` are what
shadcn's style index installs; `index.css` (4.10) imports the last two.

### 4.2 `bunfig.toml`

```toml
[test]
preload = ["./tests/setup/happy-dom.ts"]
```

`tests/setup/happy-dom.ts`:

```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
```

### 4.3 `tsconfig.base.json` and `tsconfig.json`

`tsconfig.base.json` (shared compiler options; `packages/core/tsconfig.json` extends it):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "types": ["bun"]
  }
}
```

`tsconfig.json` (root — `typecheck`, `bun test` and the shadcn CLI all read this file):

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/renderer/src/*"],
      "@core/*": ["./packages/core/src/*"],
      "@renderer/*": ["./src/renderer/src/*"]
    }
  },
  "include": ["src/main", "src/preload", "src/renderer/src", "packages/*/src", "tests"]
}
```

`@/*` stays first: shadcn takes the first alias as the import prefix. Renderer code imports
`@/…` (`import { cn } from "@/lib/utils"`); the Vite aliases (4.4) mirror these paths.

### 4.4 `electron.vite.config.mts`

```ts
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    resolve: { alias: { "@core": resolve("packages/core/src") } },
  },
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
        "@core": resolve("packages/core/src"),
        "@renderer": resolve("src/renderer/src"),
      },
    },
  },
});
```

`.mts` is ESM whatever `package.json` says, so the ESM-only `@tailwindcss/vite` always imports.
electron-vite finds `electron.vite.config.{js,ts,mjs,cjs,mts,cts}` without a `--config` flag.
electron-vite 5 externalizes `dependencies` for main and preload by default (`build.externalizeDeps`);
`externalizeDepsPlugin` is deprecated.

### 4.5 `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/2.2.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": [
      "**",
      "!!**/out",
      "!!**/dist",
      "!**/drizzle",
      "!src/renderer/src/components/ui",
      "!src/renderer/src/index.css"
    ]
  },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": { "useExhaustiveDependencies": "error" },
      "nursery": { "useSortedClasses": "warn" },
      "suspicious": { "noExplicitAny": "error" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "double", "semicolons": "always" } }
}
```

Biome 2 has no `files.ignore`; `!` excludes from lint and format, `!!` also skips indexing (build
output). shadcn components are excluded from linting so upstream updates stay diff-clean;
`index.css` because shadcn rewrites it and Biome's CSS parser rejects Tailwind's `@theme` and
`@apply` unless told otherwise.

### 4.6 `knip.json`

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "src/main/index.ts",
    "src/preload/index.ts",
    "src/renderer/src/main.tsx",
    "tests/**/*.test.ts?(x)",
    "tests/e2e/**/*.spec.ts"
  ],
  "project": ["src/**/*.{ts,tsx}", "packages/**/*.ts"],
  "ignore": ["src/renderer/src/components/ui/**", "src/renderer/src/lib/utils.ts"],
  "ignoreDependencies": ["shadcn", "tw-animate-css"]
}
```

`shadcn` and `tw-animate-css` are imported from CSS only; `lib/utils.ts` is shadcn's `utils` alias
target even before app code imports it.

### 4.7 `drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./packages/core/src/db/schema.ts",
  out: "./drizzle",
});
```

### 4.8 `electron-builder.yml`

```yaml
appId: com.example.myapp       # productName comes from package.json (4.1)
directories:
  output: dist
files:
  - out/**
extraResources:
  - from: drizzle
    to: drizzle
asarUnpack:
  - "**/node_modules/better-sqlite3/**"   # a .node file cannot be loaded from inside app.asar
npmRebuild: false                         # N-API prebuilds (4.1); a rebuild would need a C++ toolchain

# ── Windows target only ──
win:
  target: [nsis]
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  # perMachine: true    # install for every user of a shared PC (needs admin)

# ── macOS target only ──
mac:
  category: public.app-category.productivity
  hardenedRuntime: true
  notarize: true        # APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID in env
  target: [dmg, zip]    # zip is what electron-updater consumes

# ── Linux target only ──
linux:
  target: [AppImage, deb]

# ── Auto-update kept; when Auto-update is N/A write `publish: null` instead ──
publish:
  provider: github
```

Keep only the blocks for the OSes in `CLAUDE.md`'s `Target OS` row. When Auto-update is `N/A`,
write `publish: null`: an omitted `publish` lets electron-builder infer GitHub from the git remote
and write `app-update.yml` (2.1). Build each OS's installer on that OS (or a CI runner for it);
cross-building needs extra tooling. Set `npmRebuild: true` and add `@electron/rebuild` only when a
native dependency without N-API prebuilds is added.

### 4.9 `playwright.config.ts`

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
});
```

`testDir` keeps Playwright from collecting the `bun test` files. `test:e2e` runs `bun run build`
first, so a cold session never launches a missing or stale `out/`.

### 4.10 shadcn/ui files — instead of `shadcn init`

**Do not run `bunx shadcn@latest init` on this layout.** `init` recognizes Vite only by a
`vite.config.*` file, finds none, reports no supported framework and exits. These three files are
what it would write (Radix base, `neutral` tokens). After `bun install`, only
`bunx shadcn@latest add <component>` is needed; `add` reads `components.json` and `tsconfig.json`.

`components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/renderer/src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

`"config": ""` marks Tailwind v4; with `new-york` the CLI then pulls the v4 Radix registry.

`src/renderer/src/lib/utils.ts`:

```ts
export { cn } from "cn";
```

`src/renderer/src/index.css` (imported once by `main.tsx`; tokens change here, never in `components/ui/`):

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}

/* Reduced motion: OS preference disables non-essential animation. Spinners are progress feedback. */
@media (prefers-reduced-motion: reduce) {
  *:not(.animate-spin),
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Chromium reads the OS setting, so this block makes shadcn components comply without editing
`components/ui/`. `0.01ms`, not `none`, keeps `animationend` firing, which Radix waits for before
unmounting a closing dialog. JS-driven animation must check
`matchMedia("(prefers-reduced-motion: reduce)")` itself.

---

## 5. Core Package: Database Abstraction

### 5.1 `packages/core/src/db/driver.ts`

```ts
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema";

/** Any Drizzle SQLite database, regardless of underlying driver. */
export type AppDb = BaseSQLiteDatabase<"sync", unknown, typeof schema>;

export interface DbDriver {
  db: AppDb;
  close(): void;
}
```

### 5.2 `packages/core/src/db/schema.ts`

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
```

### 5.3 `src/main/db.ts` (Electron main, `better-sqlite3`)

```ts
import { app } from "electron";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@core/db/schema";
import type { DbDriver } from "@core/db/driver";

export function openDb(): DbDriver {
  const file = join(app.getPath("userData"), "app.db");
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Dev: repo folder. Prod: extraResources.
  const migrationsFolder = app.isPackaged
    ? join(process.resourcesPath, "drizzle")
    : join(app.getAppPath(), "drizzle");
  migrate(db, { migrationsFolder });

  return { db, close: () => sqlite.close() };
}
```

---

## 6. Secure, Typed IPC

### 6.1 Contract (`packages/core/src/ipc-contract.ts`)

```ts
import { z } from "zod";

export const ipc = {
  "app:getVersion": {
    input: z.void(),
    output: z.object({ name: z.string(), version: z.string() }),
  },
  "conversations:list": {
    input: z.void(),
    output: z.array(z.object({ id: z.string(), title: z.string(), createdAt: z.number() })),
  },
  "conversations:create": {
    input: z.object({ title: z.string().min(1).max(200) }),
    output: z.object({ id: z.string() }),
  },
  "file:saveCsv": {
    input: z.object({
      defaultName: z.string().min(1).max(200).regex(/^[^\\/]+\.csv$/), // file name only, no path
      csv: z.string().max(50_000_000),
    }),
    output: z.object({ saved: z.boolean() }),
  },
} as const;

export type IpcChannel = keyof typeof ipc;
export type IpcInput<C extends IpcChannel> = z.infer<(typeof ipc)[C]["input"]>;
export type IpcOutput<C extends IpcChannel> = z.infer<(typeof ipc)[C]["output"]>;

/** Main → renderer events: payload schemas (sent by `send`, 6.2; received by `on`, 6.3). */
export const ipcEvents = {
  "app:showAbout": z.void(),
} as const;

export type IpcEvent = keyof typeof ipcEvents;
export type IpcEventPayload<E extends IpcEvent> = z.infer<(typeof ipcEvents)[E]>;
```

### 6.2 Main (`src/main/ipc.ts`)

```ts
import { ipcMain, type WebContents } from "electron";
import {
  ipc,
  ipcEvents,
  type IpcChannel,
  type IpcEvent,
  type IpcEventPayload,
  type IpcInput,
  type IpcOutput,
} from "@core/ipc-contract";
import { faultDelay, faultThrow } from "./test-env";

/** Main → renderer. The sandboxed preload cannot load zod, so the payload is validated here. */
export function send<E extends IpcEvent>(to: WebContents, event: E, payload: IpcEventPayload<E>) {
  to.send(event, ipcEvents[event].parse(payload));
}

export function handle<C extends IpcChannel>(
  channel: C,
  fn: (input: IpcInput<C>) => Promise<IpcOutput<C>> | IpcOutput<C>,
) {
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    if (!channel.startsWith("app:")) {
      await faultDelay(); // test-only switches on data-source channels, no-ops when packaged (7)
      faultThrow();
    }
    const input = ipc[channel].input.parse(raw);
    const result = await fn(input as IpcInput<C>);
    return ipc[channel].output.parse(result);
  });
}
```

### 6.3 Preload (`src/preload/index.ts`)

```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  IpcChannel,
  IpcEvent,
  IpcEventPayload,
  IpcInput,
  IpcOutput,
} from "@core/ipc-contract";

// Runtime allowlist; the Record type makes tsc demand exactly the contract's events.
const events: Record<IpcEvent, true> = { "app:showAbout": true };

const api = {
  invoke<C extends IpcChannel>(channel: C, input: IpcInput<C>): Promise<IpcOutput<C>> {
    return ipcRenderer.invoke(channel, input);
  },
  /** Subscribe to a main → renderer event. Returns the unsubscribe function. */
  on<E extends IpcEvent>(event: E, listener: (payload: IpcEventPayload<E>) => void): () => void {
    if (events[event] !== true) throw new Error(`Unknown IPC event: ${String(event)}`);
    // Never hand the IpcRendererEvent (and its sender) to the renderer.
    const wrapped = (_e: IpcRendererEvent, payload: IpcEventPayload<E>) => listener(payload);
    ipcRenderer.on(event, wrapped);
    return () => {
      ipcRenderer.removeListener(event, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("api", api);
export type Api = typeof api;
```

`src/renderer/src/env.d.ts`:

```ts
import type { Api } from "../../preload";

declare global {
  interface Window {
    api: Api;
  }
}
```

### 6.4 Main entry (`src/main/index.ts`)

Order is load-bearing. `userData` keys the single-instance lock, `app.db` and (Windows, Linux) the
log folder, so `applyTestDataDir()` is the first statement: after the lock, a parallel Playwright
worker or an E2E run beside `bun run dev` finds the lock taken and quits. No imported module may
read `userData` or log at load time.

```ts
import { app, BrowserWindow, dialog } from "electron";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import log from "electron-log/main";
import { conversations } from "@core/db/schema";
import { openDb } from "./db";
import { handle } from "./ipc";
import { setAppMenu } from "./menu";
import { applyTestDataDir } from "./test-env";
import { startUpdater } from "./updater"; // Auto-update only (2.1)
import { restoreWindowState, trackWindowState } from "./window-state";

applyTestDataDir(); // 1. first: test data dir (7)

if (!app.requestSingleInstanceLock()) {
  app.quit(); // 2. second launch: the first instance gets `second-instance`
} else {
  let win: BrowserWindow | null = null;
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  log.initialize(); // 3. main.log under app.getPath("logs")
  log.info(`${app.getName()} v${app.getVersion()} starting`); // first log line, at startup

  void app.whenReady().then(() => {
    const driver = openDb();
    app.on("will-quit", () => driver.close());

    handle("app:getVersion", () => ({ name: app.getName(), version: app.getVersion() }));
    handle("conversations:list", () =>
      driver.db
        .select()
        .from(conversations)
        .all()
        .map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt.getTime() })),
    );
    // Native Save dialog with a file-type filter (Export). Called as `dialog.showSaveDialog`,
    // never destructured, so the E2E double (7) replaces it.
    handle("file:saveCsv", async ({ defaultName, csv }) => {
      const options = {
        defaultPath: join(app.getPath("documents"), defaultName),
        filters: [{ name: "CSV", extensions: ["csv"] }],
      };
      const { canceled, filePath } = win
        ? await dialog.showSaveDialog(win, options) // modal to the main window
        : await dialog.showSaveDialog(options);
      if (canceled || !filePath) return { saved: false };
      await writeFile(filePath, csv, "utf8");
      return { saved: true };
    });

    setAppMenu(() => win); // 4. native menu before the window (6.8)

    const { bounds, maximized } = restoreWindowState(); // 5. window, minimum size, restored state
    const w = new BrowserWindow({
      ...bounds,
      minWidth: 800,
      minHeight: 600,
      show: false, // shown on first paint: no white flash, no jump to maximized
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win = w;
    w.once("ready-to-show", () => {
      if (maximized) w.maximize();
      w.show();
    });
    trackWindowState(w);

    const devUrl = process.env.ELECTRON_RENDERER_URL; // set by `electron-vite dev` only
    if (!app.isPackaged && devUrl) void w.loadURL(devUrl);
    else void w.loadFile(join(__dirname, "../renderer/index.html"));

    startUpdater(); // Auto-update only (2.1)
  });

  app.on("window-all-closed", () => app.quit());
}
```

`src/main/updater.ts` (Auto-update only):

```ts
import { app } from "electron";
import { autoUpdater } from "electron-updater";

export function startUpdater() {
  if (app.isPackaged) void autoUpdater.checkForUpdatesAndNotify();
}
```

### 6.5 Window state (`src/main/window-state.ts`)

Saved in `userData/window-state.json`; the restored bounds are clamped into the nearest display's
work area, so a window last seen on an unplugged monitor comes back visible.

```ts
import { app, screen, type BrowserWindow, type Rectangle } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const Saved = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  maximized: z.boolean(),
});
const file = () => join(app.getPath("userData"), "window-state.json");

/** Call after app ready (screen is unavailable before). */
export function restoreWindowState(): { bounds: Partial<Rectangle>; maximized: boolean } {
  let saved: z.infer<typeof Saved>;
  try {
    saved = Saved.parse(JSON.parse(readFileSync(file(), "utf8")));
  } catch {
    return { bounds: { width: 1200, height: 800 }, maximized: false }; // first run or bad file
  }
  const { x, y, width, height, maximized } = saved;
  const area = screen.getDisplayMatching({ x, y, width, height }).workArea;
  const w = Math.min(width, area.width);
  const h = Math.min(height, area.height);
  const bounds = {
    x: Math.min(Math.max(x, area.x), area.x + area.width - w),
    y: Math.min(Math.max(y, area.y), area.y + area.height - h),
    width: w,
    height: h,
  };
  return { bounds, maximized };
}

export function trackWindowState(win: BrowserWindow) {
  win.on("close", () => {
    const state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
    writeFileSync(file(), JSON.stringify(state));
  });
}
```

`minWidth`/`minHeight` (6.4) stop the window shrinking below 800×600, whatever the saved size.

### 6.6 Renderer usage with TanStack Query

```ts
import { useQuery } from "@tanstack/react-query";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => window.api.invoke("conversations:list", undefined),
  });
}
```

### 6.7 Help > About (`src/renderer/src/components/about-dialog.tsx`)

The version shown in the app. The native menu (6.8) is the only opener: its About item sends
`app:showAbout`, so no in-app Help menu is needed and Playwright triggers it through the menu (7).
Needs `bunx shadcn@latest add button dialog`.

```tsx
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AboutDialog() {
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null); // the control focused before opening
  const { data } = useQuery({
    queryKey: ["app", "version"],
    queryFn: () => window.api.invoke("app:getVersion", undefined),
  });

  // `on` returns the unsubscribe, which is this effect's cleanup.
  useEffect(
    () =>
      window.api.on("app:showAbout", () => {
        if (!returnFocus.current && document.activeElement instanceof HTMLElement) {
          returnFocus.current = document.activeElement;
        }
        setOpen(true);
      }),
    [],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault(); // Radix would focus the absent trigger, leaving focus on <body>
          returnFocus.current?.focus();
          returnFocus.current = null;
        }}
      >
        <DialogHeader>
          <DialogTitle>About</DialogTitle>
          <DialogDescription>{data ? `${data.name} v${data.version}` : "Loading…"}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
```

Render `<AboutDialog />` once in the app shell. An in-app opener added later dispatches the same
way (focus is captured from `document.activeElement` when the dialog opens), so focus returns to
it too.

### 6.8 Application menu (`src/main/menu.ts`)

The native menu is the source of truth for menus and accelerators. Without
`Menu.setApplicationMenu`, Electron ships its default menu (Reload, DevTools, links to
electronjs.org). Top level: App (app name) / File / Edit / View / Window / Help on macOS;
File / Edit / View / Help elsewhere.

```ts
import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { send } from "./ipc";

/** Call after app ready, before the first window. */
export function setAppMenu(getWindow: () => BrowserWindow | null) {
  const isMac = process.platform === "darwin";
  const sep: MenuItemConstructorOptions = { type: "separator" };
  const showAbout = () => {
    const win = getWindow();
    if (win) send(win.webContents, "app:showAbout", undefined);
  };
  const about: MenuItemConstructorOptions = {
    id: "about", // E2E clicks it by id (7)
    label: `About ${app.getName()}`,
    click: showAbout,
  };
  const devItems: MenuItemConstructorOptions[] = app.isPackaged
    ? []
    : [sep, { role: "reload" }, { role: "toggleDevTools" }]; // dev and E2E builds only

  const appMenu: MenuItemConstructorOptions = {
    label: app.getName(),
    submenu: [
      { label: `About ${app.getName()}`, click: showAbout },
      sep,
      { role: "services" },
      sep,
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      sep,
      { role: "quit" },
    ],
  };
  // App commands go at the top of File, each with a CmdOrCtrl accelerator, e.g.
  // { label: "New Conversation", accelerator: "CmdOrCtrl+N", click: () => { … } }, sep,
  const fileMenu: MenuItemConstructorOptions = {
    label: "File",
    submenu: isMac
      ? [{ role: "close" }]
      : [{ role: "minimize" }, { role: "close" }, sep, { role: "quit" }],
  };
  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      sep,
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  };
  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      sep,
      { role: "togglefullscreen" },
      ...devItems,
    ],
  };
  const windowMenu: MenuItemConstructorOptions = { label: "Window", role: "windowMenu" };
  const helpMenu: MenuItemConstructorOptions = { label: "Help", role: "help", submenu: [about] };

  const template = isMac
    ? [appMenu, fileMenu, editMenu, viewMenu, windowMenu, helpMenu]
    : [fileMenu, editMenu, viewMenu, helpMenu];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
```

Roles bring the platform's labels and accelerators (Undo, Redo, Cut, Copy, Paste, Select All,
Close, Minimize, Quit); macOS gets Minimize from `windowMenu`. A role ignores `click`, so About is a
plain item that asks the renderer to open 6.7 — a native About panel sits outside the DOM, where
Playwright cannot assert it.

---

## 7. Testing

| Scope                                                        | Runner                                   | Notes                                                       |
| ------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------- |
| `packages/core`, pure main logic                             | `bun test`                               | No Electron imports allowed in `core`, so it runs anywhere. |
| React components                                             | `bun test` + happy-dom + Testing Library | Preloaded via `bunfig.toml`.                                |
| Anything touching `ipcMain`, `BrowserWindow`, native modules | Playwright Electron                      | `bun test` does not run inside Electron. Runs the built `out/`. |

### Component test example

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

test("renders label", () => {
  render(<Button>Save</Button>);
  expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
});
```

### Test-only fault switch and data directory (`src/main/test-env.ts`)

Error-state and progress-feedback requirements need a failure or a slow call on demand, and each E2E
test needs its own empty database. The harness runs the unpackaged build, so the gate is
`app.isPackaged`: an installed app ignores both variables.

```ts
import { app } from "electron";

const honored = !app.isPackaged; // dev and E2E (unpackaged) only
const mode = honored ? (process.env.APP_FAULT_MODE ?? "") : "";

export const faultDelay = () =>
  mode === "slow" ? new Promise<void>((r) => setTimeout(r, 3000)) : Promise.resolve();

export const faultThrow = () => {
  if (mode === "fail") throw new Error("Injected failure (APP_FAULT_MODE=fail)");
};

/** First statement of src/main/index.ts (6.4): before requestSingleInstanceLock() and log.initialize(). */
export function applyTestDataDir() {
  const dir = honored ? process.env.APP_DATA_DIR : undefined;
  if (dir) app.setPath("userData", dir);
}
```

`handle()` (6.2) calls `faultDelay` and `faultThrow` on data-source channels only; `app:*` channels
(version) stay live, so About still works in an error-state test. `userData` keys `app.db`
(5.3), `window-state.json` (6.5), the single-instance lock and the Windows/Linux log folder, so a
fresh `APP_DATA_DIR` isolates all four and parallel workers never collide.

### E2E example (`tests/e2e/app.spec.ts`)

Launch with `args: ["."]`: Electron then reads `package.json`, whose `main` is `out/main/index.js`.
Launched on the file itself, Electron skips `package.json`: `app.getVersion()` returns Electron's
version, `app.getName()` is `Electron`, and `app.getAppPath()` is `out/main`, so migrations (5.3)
are not found. The About test asserts the `package.json` version.

`withApp` gives each launch a fresh data dir. Pass `dataDir` to share one across launches
(window-state relaunch, second instance); the caller then removes it.

```ts
import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lastSaveDialogOptions, stubSaveDialog } from "./doubles";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  productName: string;
  version: string;
};

const tempDir = () => mkdtempSync(join(tmpdir(), "my-app-e2e-"));

function removeDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (err) {
    console.warn(`E2E cleanup: could not remove ${dir}`, err); // never masks the test's failure
  }
}

// `env` replaces process.env, so spread it.
async function withApp(
  extra: Record<string, string>,
  body: (page: Page, app: ElectronApplication) => Promise<void>,
  dataDir?: string,
) {
  const dir = dataDir ?? tempDir();
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      args: ["."],
      env: { ...process.env, APP_DATA_DIR: dir, ...extra } as Record<string, string>,
    });
    await body(await app.firstWindow(), app);
  } finally {
    await app?.close(); // Windows keeps app.db locked until the app exits
    if (!dataDir) removeDir(dir);
  }
}

/** Renderer loaded and app shell painted. */
async function shellReady(page: Page) {
  await page.waitForLoadState();
  await expect(page.getByRole("navigation")).toBeVisible();
}

/**
 * The About listener (6.7) subscribes in an effect after first paint, and a main → renderer
 * event sent earlier is dropped: wait for the shell, then retry the menu click until it opens.
 */
async function openAboutFromMenu(page: Page, app: ElectronApplication) {
  await shellReady(page);
  await expect(async () => {
    await app.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById("about")?.click();
    });
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 500 });
  }).toPass();
}

test("app boots and shows sidebar", () =>
  withApp({}, async (page) => {
    await shellReady(page);
  }));

test("native menu: platform menus and standard roles; Help > About shows name and version", () =>
  withApp({}, async (page, app) => {
    // Top-level label → roles of its submenu items. Electron lowercases roles ("selectall").
    const menus = await app.evaluate(({ Menu }) =>
      (Menu.getApplicationMenu()?.items ?? []).map((m) => ({
        label: m.label,
        roles: m.submenu?.items.flatMap((i) => (i.role ? [String(i.role)] : [])) ?? [],
      })),
    );
    const roles = Object.fromEntries(menus.map((m) => [m.label, m.roles]));
    const isMac = process.platform === "darwin";
    expect(menus.map((m) => m.label)).toEqual(
      isMac
        ? [pkg.productName, "File", "Edit", "View", "Window", "Help"]
        : ["File", "Edit", "View", "Help"],
    );
    expect(roles.Edit).toEqual(
      expect.arrayContaining(["undo", "redo", "cut", "copy", "paste", "selectall"]),
    );
    if (isMac) {
      expect(roles.File).toContain("close");
      expect(roles.Window).toContain("minimize");
      expect(roles[pkg.productName]).toContain("quit");
    } else {
      expect(roles.File).toEqual(expect.arrayContaining(["minimize", "close", "quit"]));
    }

    await openAboutFromMenu(page, app);
    await expect(page.getByRole("dialog")).toContainText(`${pkg.productName} v${pkg.version}`);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  }));

test("a second launch exits within 2 seconds and leaves exactly one main window", async () => {
  const dir = tempDir();
  try {
    await withApp(
      {},
      async (_page, app) => {
        await expect
          .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()))
          .toBe(true); // shown on ready-to-show (6.4)
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.minimize());
        const exe = await app.evaluate(() => process.execPath); // the Electron binary
        const second = spawn(exe, ["."], { env: { ...process.env, APP_DATA_DIR: dir } });
        const code = await new Promise<number | null>((done, fail) => {
          const timer = setTimeout(() => {
            second.kill();
            fail(new Error("second launch still running after 2 s"));
          }, 2000);
          second.on("exit", (exitCode) => {
            clearTimeout(timer);
            done(exitCode);
          });
        });
        expect(code).toBe(0); // lock held by the first instance: the second quits
        expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
        await expect
          .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isMinimized()))
          .toBe(false); // restored by the second-instance handler (6.4)
      },
      dir,
    );
  } finally {
    removeDir(dir);
  }
});

test("shows an error state when the data source fails", () =>
  withApp({ APP_FAULT_MODE: "fail" }, async (page) => {
    await expect(page.getByRole("alert")).toBeVisible();
  }));

test("Export CSV opens the native Save dialog with a CSV filter and writes the file", async () => {
  const outDir = tempDir();
  try {
    await withApp({}, async (page, app) => {
      await shellReady(page);
      const target = join(outDir, "export.csv");
      await stubSaveDialog(app, target);
      const csv = "id,title\n1,Lab A\n";
      // A TOR test clicks the screen's Export control; this example invokes the channel directly.
      const result = await page.evaluate(
        (body) => window.api.invoke("file:saveCsv", { defaultName: "export.csv", csv: body }),
        csv,
      );
      expect(result).toEqual({ saved: true });
      expect((await lastSaveDialogOptions(app))?.filters).toEqual([
        { name: "CSV", extensions: ["csv"] },
      ]);
      expect(readFileSync(target, "utf8")).toBe(csv);
    });
  } finally {
    removeDir(outDir);
  }
});

test("reduced motion: with the OS preference set, dialog animation is disabled", () =>
  withApp({}, async (page, app) => {
    await page.emulateMedia({ reducedMotion: "reduce" }); // stands in for the OS setting
    await openAboutFromMenu(page, app);
    const seconds = await page
      .getByRole("dialog")
      .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    expect(seconds).toBeLessThan(0.001); // 0.01ms from index.css (4.10)
  }));
```

`app.evaluate` runs in the main process with the `electron` module as its argument; it cannot
close over test-file variables (pass them as the second argument). The second instance is spawned,
not launched through Playwright, because it exits before a window exists. OS focus-stealing rules
make "focused" unassertable, so the single-instance test asserts restore from minimized. On Windows
the `quit` role renders "Exit"; the test asserts roles, not labels. `electron.launch` has no
`reducedMotion` option; `page.emulateMedia` sets the media feature through the Chromium DevTools
protocol, as in a browser page.

`tests/e2e/doubles.ts` (test doubles; product code never branches on tests):

```ts
import type { ElectronApplication } from "@playwright/test";

type SaveOptions = { defaultPath?: string; filters?: { name: string; extensions: string[] }[] };

/** Every later Save dialog returns `filePath` without opening, and records the options it got. */
export async function stubSaveDialog(app: ElectronApplication, filePath: string) {
  await app.evaluate(({ dialog }, target) => {
    const store = globalThis as { lastSaveDialogOptions?: SaveOptions };
    dialog.showSaveDialog = async (...args: unknown[]) => {
      store.lastSaveDialogOptions = args.at(-1) as SaveOptions; // (options) or (window, options)
      return { canceled: false, filePath: target };
    };
  }, filePath);
}

/** Options the app passed to the last Save dialog. */
export function lastSaveDialogOptions(app: ElectronApplication) {
  return app.evaluate(
    () => (globalThis as { lastSaveDialogOptions?: SaveOptions }).lastSaveDialogOptions,
  );
}
```

Stub `showOpenDialog` the same way (`{ canceled: false, filePaths: [target] }`) for Open and Import.

---

## 8. Daily Commands

Prerequisites on the build computer: Bun, and Node.js 22.12 or later (LTS) — Playwright's runner and
electron-vite both run on Node, and without it `bun run test:e2e` can hang.

```bash
bun install                  # runs only trustedDependencies scripts (Electron binary download)
bun run dev                  # electron-vite with HMR
bun run db:generate          # after editing schema.ts; commit the SQL
bun run check                # typecheck + lint + deadcode + unit/component tests
bun run test:e2e             # builds, then Playwright against out/
bun run package              # installers for this OS in dist/
bunx shadcn@latest add button dialog   # add UI components (never `init` here, 4.10)
```

---

## 9. Optional: Bun Sidecar for `bun:sqlite`

Use this when you want the Bun runtime on the backend (crash isolation, reuse as a CLI, native
`bun:sqlite`). The `core` package and `DbDriver` interface stay identical.

### 9.1 `sidecar/src/db.ts`

```ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "@core/db/schema";
import type { DbDriver } from "@core/db/driver";

export function openDb(file: string, migrationsFolder: string): DbDriver {
  const sqlite = new Database(file);
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return { db, close: () => sqlite.close() };
}
```

### 9.2 Transport

Serve JSON-RPC over stdio (simplest, no ports, no auth) or `Bun.serve` on `127.0.0.1` with a
random token passed via environment variable. Validate every request with the same Zod contract
from Section 6.

### 9.3 Build and ship

```bash
bun build sidecar/src/index.ts --compile --target=bun-darwin-arm64 --outfile build/sidecar-darwin-arm64
bun build sidecar/src/index.ts --compile --target=bun-darwin-x64   --outfile build/sidecar-darwin-x64
bun build sidecar/src/index.ts --compile --target=bun-windows-x64  --outfile build/sidecar-win-x64.exe
bun build sidecar/src/index.ts --compile --target=bun-linux-x64    --outfile build/sidecar-linux-x64
```

`electron-builder.yml` addition:

```yaml
extraResources:
  - from: build/sidecar-${os}-${arch}${ext}
    to: sidecar${ext}
```

Main process spawn:

```ts
import { spawn } from "node:child_process";
const bin = join(process.resourcesPath, process.platform === "win32" ? "sidecar.exe" : "sidecar");
const child = spawn(bin, [], { stdio: ["pipe", "pipe", "inherit"] });
```

Supervise it: restart on unexpected exit with backoff, and kill it on `app.on("before-quit")`.

**Cost:** a second runtime in the bundle (roughly 50–90 MB per platform) and one more process to
manage. Sign and notarize the sidecar binary alongside the app on macOS.

---

## 10. Additional Considerations

These are known friction points. The configuration in this sheet applies each fix unless the row
says it is not configured here.

| Consideration                       | What happens                                                                                                        | Applied fix                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Bun blocks lifecycle scripts        | Electron's postinstall does not run, so its binary is missing and the app fails to launch.                          | `trustedDependencies: ["electron"]` in `package.json` (4.1).                                                  |
| Native module ABI mismatch          | A V8-ABI native module built for system Node crashes under Electron's Node.                                         | better-sqlite3 13 is N-API with bundled prebuilds: no `postinstall` rebuild, `npmRebuild: false`, so packaging needs no C++ toolchain (4.1, 4.8). |
| Native module inside asar           | Node cannot `dlopen` from inside an asar archive.                                                                   | `asarUnpack` for `better-sqlite3` (4.8).                                                                      |
| `bun test` cannot load Electron     | Tests importing `electron` fail outside the Electron binary.                                                        | `core` has no Electron imports; Electron-touching code is tested via Playwright (7).                          |
| Migrations path differs dev vs prod | `migrate()` cannot find the SQL folder in the packaged app.                                                         | Resolved from `process.resourcesPath` when packaged, shipped via `extraResources` (5.3, 4.8).                 |
| Renderer security defaults          | Exposing Node to the renderer turns any XSS into RCE.                                                               | `contextIsolation`, `sandbox`, `nodeIntegration: false`, preload exposes typed functions only (6.3, 6.4).     |
| Unvalidated IPC input               | Renderer can send arbitrary payloads to main.                                                                       | Every handler parses input and output with Zod (6.2).                                                         |
| Biome lacks a plugin you need       | Import-boundary or framework-specific rules unavailable.                                                            | Add ESLint 9 + typescript-eslint alongside Biome for those rules only. Both coexist; keep Biome as formatter. |
| shadcn components churn             | Linting or dead-code tools flag copied components.                                                                  | Excluded in `biome.json` and `knip.json` (4.5, 4.6).                                                          |
| `drizzle-kit push` in production    | Destructive schema changes applied without review.                                                                  | Only `generate` + committed SQL + `migrate()` at startup (4.7, 5.3).                                          |
| SQLite concurrency                  | Writes block reads under default journal mode.                                                                      | `journal_mode = WAL` set on open (5.3, 9.1).                                                                  |
| Foreign keys off by default         | Cascading deletes silently do nothing.                                                                              | `foreign_keys = ON` pragma on open (5.3, 9.1).                                                                |
| Routing in `file://` renderer       | Browser history APIs misbehave without a server.                                                                    | TanStack Router with memory history (2).                                                                      |
| Tailwind v4 + shadcn                | Older shadcn templates assume Tailwind v3 config files.                                                             | `@tailwindcss/vite` plugin, CSS-first config, `"config": ""` in `components.json` (4.4, 4.10).                |
| `shadcn init` on electron-vite      | `init` detects Vite only by `vite.config.*`, reports no supported framework and exits.                               | The sheet ships `components.json`, `index.css` and `lib/utils.ts`; run only `shadcn add` (4.10).              |
| shadcn import alias                 | Without a root `tsconfig.json` whose first path is `@/*`, the shadcn CLI and `bun test` cannot resolve `@/…`.       | Root `tsconfig.json` paths, mirrored in the renderer's Vite aliases (4.3, 4.4).                               |
| ESM-only Vite plugins               | A config bundled as CommonJS cannot load `@tailwindcss/vite`, which ships only ESM.                                 | `electron.vite.config.mts`: ESM regardless of `package.json` (4.4).                                           |
| Biome and Tailwind CSS              | Biome's CSS parser rejects `@theme`, `@custom-variant` and `@apply` by default.                                     | `index.css` excluded in `biome.json` (4.5).                                                                   |
| Default application menu            | Without `Menu.setApplicationMenu`, Electron ships Reload, DevTools and electronjs.org links — no standard-menu TORs. | `src/main/menu.ts`: platform template, standard roles, dev items only when unpackaged (6.8).                  |
| Menu event before the listener      | A menu click right after launch sends `app:showAbout` before the renderer subscribes; the event is dropped.         | E2E waits for the app shell, then retries the click until the dialog shows (7).                                |
| Native file dialogs in E2E          | A real Open/Save dialog blocks the test and sits outside the DOM.                                                   | `tests/e2e/doubles.ts` replaces `dialog.showSaveDialog` in main and records the filters it got (6.4, 7).       |
| Reduced motion                      | shadcn and `tw-animate-css` animate regardless of the OS reduce-motion setting.                                    | `prefers-reduced-motion` block in `index.css` (4.10); E2E emulates it with `page.emulateMedia` (7).            |
| Dialog focus without a trigger      | A dialog opened from the native menu has no trigger, so closing it drops focus on `<body>`.                        | `onCloseAutoFocus` restores the element focused before opening (6.7).                                         |
| Main → renderer events              | The sandboxed preload cannot load zod, and a leaked `IpcRendererEvent` exposes `sender`.                            | `send()` validates in main; preload `on()` allowlists events, forwards the payload only, returns unsubscribe (6.2, 6.3). |
| Launch flash                        | A window shown before first paint flashes blank, then jumps to its restored maximized state.                        | `show: false`; maximize and show on `ready-to-show` (6.4).                                                    |
| Sidecar lifecycle (if used)         | Orphaned Bun process after app quit or crash loop.                                                                  | Supervisor with backoff and kill on `before-quit` (9.3).                                                      |
| Stale E2E build                     | Playwright launches a missing or outdated `out/`, or collects `bun test` files.                                     | `test:e2e` builds first; `testDir: "./tests/e2e"` (4.1, 4.9).                                                 |
| E2E launched on a file              | `args: ["out/main/index.js"]` skips `package.json`: Electron's version and name, app path `out/main`, no migrations. | `args: ["."]`; the About test asserts the `package.json` version (7).                                         |
| Startup order                       | Lock and logs bind to the real `userData`, so parallel E2E workers or a run beside `bun run dev` quit on launch.     | `applyTestDataDir()` is the first statement in main (6.4, 7).                                                 |
| Sandboxed ESM preload               | With `"type": "module"`, electron-vite emits `preload/index.mjs`; a sandboxed window cannot load it.                | No `"type"` field in `package.json` (4.1).                                                                    |
| Test switches in production         | A fault or data-dir variable left in a user's environment breaks the installed app.                                 | Honored only when `!app.isPackaged` (7).                                                                      |
| Fault switch breaks the shell       | `APP_FAULT_MODE=fail` on every channel also fails the version call.                                                 | Switches skip `app:*` channels (6.2).                                                                         |
| E2E tests share data                | One test's rows leak into the next.                                                                                 | Each launch gets a fresh temp `APP_DATA_DIR` via `env`; relaunch and second-instance tests pass one `dataDir` (7). |
| Temp data dirs pile up              | A failed test skips cleanup; Windows keeps `app.db` locked while the app runs.                                      | `close()` then `rmSync` with retries in `finally`; a cleanup error is logged, never masks the failure (7).   |
| Publishing with Auto-update N/A     | An omitted `publish` lets electron-builder infer GitHub from the git remote and write `app-update.yml`.             | `publish: null` (2.1, 4.8).                                                                                   |
| macOS signing                       | Gatekeeper blocks an unsigned or unnotarized app.                                                                   | `hardenedRuntime`, `notarize: true`, Apple credentials in CI env (4.8).                                       |
| Auto-update on macOS                | electron-updater cannot update from a dmg, and macOS refuses updates to an unsigned app.                            | `zip` in `mac.target`, signed build, `publish` block (4.8).                                                   |
| Windows code signing and SmartScreen | An unsigned NSIS installer shows a SmartScreen / unknown-publisher warning.                                        | Not configured here; optional for an internal PC, where the unsigned installer runs offline once the user accepts the warning. To sign, add an Authenticode certificate in CI (`WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`). |

---

## 11. Alternatives Considered

| Option                     | Verdict                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tauri 2 + Bun sidecar      | Cleanest "Bun is the backend" design, but requires a Rust toolchain and per-OS webviews (WKWebView, WebView2). Not recommended for a Chromium-heavy UI. |
| Electrobun                 | Bun-native Electron alternative. Promising, but packaging, signing and Windows support are far less proven. Not recommended for shipping.               |
| Vitest for component tests | Works, but adds a second runner alongside `bun test`. Only adopt if a specific Vitest feature is required.                                              |
| ESLint as primary linter   | Fine, slower, more config. Biome covers the needed rules; add ESLint only for missing plugins.                                                          |
| Node `node:sqlite`         | Available in recent Electron Node versions but still maturing and Drizzle driver support is not as established as `better-sqlite3`. Revisit later.      |
