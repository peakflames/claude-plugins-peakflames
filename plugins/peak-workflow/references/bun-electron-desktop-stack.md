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
| Packaging       | electron-builder                                                    | Installers for the target OSes recorded in `CLAUDE.md` (NSIS, dmg, AppImage/deb). Per-OS signing. |
| Auto-update     | electron-updater                                                    | Delta updates from a publish target (GitHub Releases). Needs network and a publish target.       |
| Validation      | Zod                                                                 | Shared schemas for IPC, config and settings.                                                     |

### 2.1 Dropping a layer

When `CLAUDE.md` marks a row `N/A`, or the Packaging row omits an OS, leave out exactly these
pieces instead of copying Sections 3-4 verbatim. Everything else stays.

| Dropped                                           | Section 3 tree        | Section 4                                                                    | Other source / sections                                                         | Section 10 rows to omit                |
| ------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| Auto-update — `N/A — computers have no internet (shape Q6)` | `src/main/updater.ts` | 4.1 `electron-updater` dependency; 4.8 `publish` block and `zip` in `mac.target` | `updater.ts` import and call in `src/main/index.ts`                             | Auto-update on macOS                   |
| Packaging: macOS not a target                     | —                     | 4.8 `mac` block                                                              | 9.3 `bun-darwin-*` build lines (sidecar only)                                   | macOS signing; Auto-update on macOS    |
| Packaging: Windows not a target                   | —                     | 4.8 `win` and `nsis` blocks                                                  | 9.3 `bun-windows-x64` build line (sidecar only)                                 | Windows code signing and SmartScreen   |
| Packaging: Linux not a target                     | —                     | 4.8 `linux` block                                                            | 9.3 `bun-linux-x64` build line (sidecar only)                                   | —                                      |

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
├── tsconfig.base.json
├── electron.vite.config.ts
├── electron-builder.yml         # only the target OSes' blocks (2.1)
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
│   │   ├── index.ts             # app lifecycle, BrowserWindow
│   │   ├── db.ts                # better-sqlite3 driver wiring
│   │   ├── ipc.ts               # ipcMain handlers (validated)
│   │   ├── test-env.ts          # test-only fault switch + data dir (7)
│   │   └── updater.ts           # omit when Auto-update is N/A (2.1)
│   ├── preload/
│   │   └── index.ts             # contextBridge.exposeInMainWorld
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── router.tsx
│           ├── components/ui/   # shadcn components
│           ├── stores/          # Zustand
│           └── queries/         # TanStack Query hooks
├── tests/
│   ├── unit/                    # bun test
│   ├── components/              # bun test + happy-dom
│   └── e2e/                     # Playwright (testDir in playwright.config.ts)
└── sidecar/                     # optional, Section 9
```

---

## 4. Configuration Files

### 4.1 `package.json`

```json
{
  "name": "my-app",
  "private": true,
  "version": "0.1.0",
  "main": "./out/main/index.js",
  "type": "module",
  "workspaces": ["packages/*"],
  "trustedDependencies": ["electron", "better-sqlite3", "@electron/rebuild"],
  "scripts": {
    "postinstall": "electron-rebuild -f -w better-sqlite3",
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
    "better-sqlite3": "^11",
    "drizzle-orm": "^0.44",
    "electron-updater": "^6",
    "zod": "^3",
    "@tanstack/react-query": "^5",
    "@tanstack/react-router": "^1",
    "zustand": "^5",
    "react": "^19",
    "react-dom": "^19",
    "lucide-react": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest"
  },
  "devDependencies": {
    "electron": "^3x",
    "electron-vite": "^3",
    "electron-builder": "^25",
    "@electron/rebuild": "^3",
    "vite": "^6",
    "@vitejs/plugin-react": "^4",
    "typescript": "^5",
    "@types/better-sqlite3": "^7",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/bun": "latest",
    "tailwindcss": "^4",
    "@tailwindcss/vite": "^4",
    "drizzle-kit": "^0.31",
    "@biomejs/biome": "^2",
    "knip": "^5",
    "@happy-dom/global-registrator": "latest",
    "@testing-library/react": "^16",
    "@testing-library/dom": "^10",
    "@playwright/test": "^1"
  }
}
```

> Pin exact versions with `bun install` (lockfile) and check the Electron release notes for the
> current stable major before starting. Version ranges above are indicative.

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

### 4.3 `tsconfig.base.json`

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
    "types": ["bun-types"],
    "paths": {
      "@core/*": ["./packages/core/src/*"],
      "@renderer/*": ["./src/renderer/src/*"]
    }
  }
}
```

### 4.4 `electron.vite.config.ts`

```ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { "@core": resolve("packages/core/src") } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@core": resolve("packages/core/src"),
        "@renderer": resolve("src/renderer/src"),
      },
    },
  },
});
```

### 4.5 `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignore": ["out", "dist", "drizzle", "src/renderer/src/components/ui"] },
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

shadcn components are excluded from linting so upstream updates stay diff-clean.

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
  "ignore": ["src/renderer/src/components/ui/**"],
  "ignoreDependencies": ["@electron/rebuild"]
}
```

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
appId: com.example.myapp
productName: MyApp
directories:
  output: dist
files:
  - out/**
extraResources:
  - from: drizzle
    to: drizzle
asarUnpack:
  - "**/node_modules/better-sqlite3/**"
npmRebuild: true

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

# ── Auto-update only ──
publish:
  provider: github
```

Keep only the blocks for the target OSes recorded in `CLAUDE.md`, and `publish` only when
Auto-update is kept (2.1). Build each OS's installer on that OS (or a CI runner for it);
cross-building needs extra tooling.

### 4.9 `playwright.config.ts`

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
});
```

`testDir` keeps Playwright from collecting the `bun test` files. `test:e2e` runs `bun run build`
first, so a cold session never launches a missing or stale `out/main/index.js`.

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
  "conversations:list": {
    input: z.void(),
    output: z.array(z.object({ id: z.string(), title: z.string(), createdAt: z.number() })),
  },
  "conversations:create": {
    input: z.object({ title: z.string().min(1).max(200) }),
    output: z.object({ id: z.string() }),
  },
} as const;

export type IpcChannel = keyof typeof ipc;
export type IpcInput<C extends IpcChannel> = z.infer<(typeof ipc)[C]["input"]>;
export type IpcOutput<C extends IpcChannel> = z.infer<(typeof ipc)[C]["output"]>;
```

### 6.2 Main (`src/main/ipc.ts`)

```ts
import { ipcMain } from "electron";
import { ipc, type IpcChannel, type IpcInput, type IpcOutput } from "@core/ipc-contract";
import { faultDelay, faultThrow } from "./test-env";

export function handle<C extends IpcChannel>(
  channel: C,
  fn: (input: IpcInput<C>) => Promise<IpcOutput<C>> | IpcOutput<C>,
) {
  ipcMain.handle(channel, async (_event, raw: unknown) => {
    await faultDelay(); // test-only switches, no-ops in a packaged app (7)
    faultThrow();
    const input = ipc[channel].input.parse(raw);
    const result = await fn(input as IpcInput<C>);
    return ipc[channel].output.parse(result);
  });
}
```

### 6.3 Preload (`src/preload/index.ts`)

```ts
import { contextBridge, ipcRenderer } from "electron";
import type { IpcChannel, IpcInput, IpcOutput } from "@core/ipc-contract";

const api = {
  invoke<C extends IpcChannel>(channel: C, input: IpcInput<C>): Promise<IpcOutput<C>> {
    return ipcRenderer.invoke(channel, input);
  },
};

contextBridge.exposeInMainWorld("api", api);
export type Api = typeof api;
```

### 6.4 Window creation (`src/main/index.ts`)

```ts
const win = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    preload: join(__dirname, "../preload/index.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
});
```

### 6.5 Renderer usage with TanStack Query

```ts
import { useQuery } from "@tanstack/react-query";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => window.api.invoke("conversations:list", undefined),
  });
}
```

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
import { Button } from "@renderer/components/ui/button";

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

const honored = !app.isPackaged; // dev and E2E (out/main/index.js) only
const mode = honored ? (process.env.APP_FAULT_MODE ?? "") : "";

export const faultDelay = () =>
  mode === "slow" ? new Promise<void>((r) => setTimeout(r, 3000)) : Promise.resolve();

export const faultThrow = () => {
  if (mode === "fail") throw new Error("Injected failure (APP_FAULT_MODE=fail)");
};

/** Call at the top of src/main/index.ts, before app.whenReady() and openDb(). */
export function applyTestDataDir() {
  const dir = honored ? process.env.APP_DATA_DIR : undefined;
  if (dir) app.setPath("userData", dir);
}
```

`handle()` (6.2) calls `faultDelay` and `faultThrow` on every channel. `openDb()` (5.3) reads
`userData`, so a fresh `APP_DATA_DIR` is a fresh `app.db`.

### E2E example (`tests/e2e/app.spec.ts`)

```ts
import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Fresh data dir per launch; `env` replaces process.env, so spread it.
function launch(extra: Record<string, string> = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "my-app-e2e-"));
  return electron.launch({
    args: ["out/main/index.js"],
    env: { ...process.env, APP_DATA_DIR: dataDir, ...extra } as Record<string, string>,
  });
}

test("app boots and shows sidebar", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await expect(page.getByRole("navigation")).toBeVisible();
  await app.close();
});

test("shows an error state when the data source fails", async () => {
  const app = await launch({ APP_FAULT_MODE: "fail" });
  const page = await app.firstWindow();
  await expect(page.getByRole("alert")).toBeVisible();
  await app.close();
});
```

---

## 8. Daily Commands

```bash
bun install                  # respects trustedDependencies, runs electron-rebuild
bun run dev                  # electron-vite with HMR
bun run db:generate          # after editing schema.ts; commit the SQL
bun run check                # typecheck + lint + deadcode + unit/component tests
bun run test:e2e             # builds, then Playwright against out/
bun run package              # installers for this OS in dist/
bunx shadcn@latest add button dialog   # add UI components
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

These are known friction points. The configuration in this sheet already applies each fix.

| Consideration                       | What happens                                                                                                        | Applied fix                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Bun blocks lifecycle scripts        | Electron and `better-sqlite3` postinstall scripts do not run, so the binary is missing and the app fails to launch. | `trustedDependencies` in `package.json` (4.1).                                                                |
| Native module ABI mismatch          | `better-sqlite3` compiled for system Node crashes under Electron's Node.                                            | `postinstall` runs `electron-rebuild`; `npmRebuild: true` in electron-builder (4.1, 4.8).                     |
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
| Tailwind v4 + shadcn                | Older shadcn templates assume Tailwind v3 config files.                                                             | Use `@tailwindcss/vite` plugin and CSS-first config; `bunx shadcn@latest init` detects v4 (4.4).              |
| Sidecar lifecycle (if used)         | Orphaned Bun process after app quit or crash loop.                                                                  | Supervisor with backoff and kill on `before-quit` (9.3).                                                      |
| Stale E2E build                     | Playwright launches a missing or outdated `out/main/index.js`, or collects `bun test` files.                        | `test:e2e` builds first; `testDir: "./tests/e2e"` (4.1, 4.9).                                                 |
| Test switches in production         | A fault or data-dir variable left in a user's environment breaks the installed app.                                 | Honored only when `!app.isPackaged` (7).                                                                      |
| E2E tests share data                | One test's rows leak into the next.                                                                                 | Each launch gets a fresh temp `APP_DATA_DIR` via `env` (7).                                                   |
| macOS signing                       | Gatekeeper blocks an unsigned or unnotarized app.                                                                   | `hardenedRuntime`, `notarize: true`, Apple credentials in CI env (4.8).                                       |
| Auto-update on macOS                | electron-updater cannot update from a dmg, and macOS refuses updates to an unsigned app.                            | `zip` in `mac.target`, signed build, `publish` block (4.8).                                                   |
| Windows code signing and SmartScreen | An unsigned NSIS installer shows a SmartScreen / unknown-publisher warning.                                        | Sign in CI with an Authenticode certificate (`WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`). An unsigned installer still installs and runs offline on an internal PC after the user accepts the warning. |

---

## 11. Alternatives Considered

| Option                     | Verdict                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tauri 2 + Bun sidecar      | Cleanest "Bun is the backend" design, but requires a Rust toolchain and per-OS webviews (WKWebView, WebView2). Not recommended for a Chromium-heavy UI. |
| Electrobun                 | Bun-native Electron alternative. Promising, but packaging, signing and Windows support are far less proven. Not recommended for shipping.               |
| Vitest for component tests | Works, but adds a second runner alongside `bun test`. Only adopt if a specific Vitest feature is required.                                              |
| ESLint as primary linter   | Fine, slower, more config. Biome covers the needed rules; add ESLint only for missing plugins.                                                          |
| Node `node:sqlite`         | Available in recent Electron Node versions but still maturing and Drizzle driver support is not as established as `better-sqlite3`. Revisit later.      |
