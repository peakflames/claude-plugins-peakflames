# Bun Static SPA Reference Sheet

A reference stack for a browser-only application: no server, no database of your own, no
container. All data lives on the person's device, and the built output is a folder of static
files served by GitHub Pages (or any static host).

Bun is the **toolchain** here — package manager, script runner, test runner. The app itself runs
in the browser and has no runtime of its own.

> **How to use this sheet — read before acting on it.**
>
> This is **reference material, not a migration mandate.** It exists for two purposes:
>
> 1. **The recommended stack for a brand-new project of this shape.** When
>    `/peak-workflow:setup` establishes that the product needs no server (see *When this sheet
>    applies* below) and is told "whatever you recommend", it reads Section 2 of this sheet and
>    offers exactly these picks — there is no separate default list. `/peak-workflow:plan-project`
>    then builds the walking skeleton from Sections 3 and 4.
> 2. **A layer checklist for any project** — the Stack Summary table names every layer an
>    application of this shape has to handle (build, UI, state, routing, persistence, schema
>    versioning, dates, offline, backup, tests, lint, hosting, config). Use it to notice a layer
>    the project has not decided yet.
>
> **Never** propose re-platforming, rewriting, or swapping a library in an existing project
> because it differs from this sheet. The project's own `CLAUDE.md` Tech Stack is the single
> source of truth and wins over this sheet every time. Adopt a change from here only when the
> user asks for it in their own words.

---

## When This Sheet Applies

This sheet is the right one when **all** of the following are true. Any single "no" points at
[`bun-web-app-stack.md`](bun-web-app-stack.md) instead.

| Question | This sheet needs |
|---|---|
| Does the same person's data have to appear on a second device? | **No** — data lives in this browser |
| Does anyone sign in, or see anyone else's data? | **No** — single person, single device |
| Do people upload files, photos, or documents? | **No** — no object storage |
| Does anything on screen update by itself from elsewhere? | **No** — no server to push from |
| Does anything have to stay secret from the person using it? | **No** — the whole bundle is public |

The last row is the one that is easy to miss: a static app has **no server-side secrets**.
Anything the code can read, the person can read. An API key for a third-party service cannot be
hidden here — if the product needs one, it needs the web-app sheet.

**Growth is cheap, so start here when it fits.** Section 11 is the migration path to a server
when one of these answers changes later; the UI, the domain services, and the Zod contracts all
survive that move.

---

## 1. Architecture at a Glance

```
                  ┌────────────────────────────────────────────┐
   GitHub Pages   │ Browser                                    │
┌──────────────┐  │                                            │
│ index.html   │  │  React 19 SPA                              │
│ assets/*.js  │──┼─►  ├─ TanStack Router (hash history)       │
│ assets/*.css │  │    ├─ shadcn/ui on Tailwind v4             │
│ manifest     │  │    ├─ Zustand          (ephemeral UI state)│
└──────▲───────┘  │    └─ useLiveQuery     (reactive reads)    │
       │          │                │                           │
       │ static   │                ▼                           │
       │ upload   │      Dexie ──► IndexedDB (this device only) │
       │          │                │                           │
┌──────┴───────┐  │                ▼                           │
│ GitHub       │  │      JSON export / import = the backup     │
│ Actions      │  │                                            │
└──────────────┘  └────────────────────────────────────────────┘
```

**Design rules**

- The browser is the whole runtime. There is no origin to call, so there is nothing to mock.
- IndexedDB is the database. It is **per-browser and per-device**, and the person can clear it —
  so an export/import path is not a nice-to-have, it is the only backup that exists.
- Every environment difference is a build-time constant. There is no runtime configuration.
- The bundle is public. Treat every value in it as published.

---

## 2. Stack Summary

| Layer | Pick | Why |
|---|---|---|
| Toolchain | Bun 1.2+ | Package manager, script runner and test runner. One fast binary. |
| Build | Vite 6 | Fast HMR, Tailwind v4 plugin, static output ready for any host. |
| UI | React 19 + TypeScript 5 (strict) | Boring and correct. |
| Styling | Tailwind CSS v4 + shadcn/ui | Components copied into the repo, no version lock. |
| Icons | lucide-react | The icon set shadcn assumes. |
| UI state | Zustand | Ephemeral state only — filters, dialogs, theme. Never the source of truth. |
| Data reads | `dexie-react-hooks` `useLiveQuery` | Components re-render when IndexedDB changes. Replaces a server-cache layer. |
| Routing | TanStack Router (**hash history**) | Type-safe routes that survive a static host with no rewrite rules. |
| Persistence | Dexie 4 (IndexedDB) | Structured, async, no size cliff. `localStorage` only for one-off preferences. |
| Schema versioning | Dexie `version().stores().upgrade()` | Migrations run in the browser on open. Never renumber a released version. |
| Validation | Zod | Schemas for stored records, imported backups and form input. |
| Dates | `date-fns` + local civil-day keys | Day-bucketed data is keyed `YYYY-MM-DD` in local time, never by timestamp. |
| Offline | `vite-plugin-pwa` (`autoUpdate`) | Installable, works with no network. The expected shape for a personal app. |
| Backup / portability | JSON export + import | The only backup a browser-only app has. Ships in the first epic, not later. |
| Unit tests | `bun test` | Native, Jest-compatible API. |
| Component tests | `bun test` + happy-dom + Testing Library | One test runner for everything. |
| E2E | Playwright against `vite preview` | Tests the real production bundle. No Docker. |
| Lint + format | Biome 2 | One tool, one config. |
| Type-level lint | `tsc --noEmit` with unused checks | Catches what linters miss. |
| Dead code | Knip | Unused files, exports, types and dependencies. |
| Hosting | GitHub Pages via GitHub Actions | Free, no account to manage, deploy on push to the default branch. |
| Config | Build-time `import.meta.env` + `__APP_VERSION__` | No runtime config; the build is the configuration. |
| Secrets | `N/A — the bundle is public, so there is no secret to hold (shape Q5)` | A product that needs to keep a key secret needs a server. |
| Logging | `console` with a version-stamped first line | No log shipping. The browser console is the log. |

---

## 3. Repository Layout

```
my-app/
├── package.json
├── bunfig.toml
├── biome.json
├── knip.json
├── tsconfig.json
├── vite.config.ts
├── playwright.config.ts
├── components.json                 # shadcn/ui config, written by `shadcn init`
├── index.html
├── public/
│   └── favicon.svg
├── .github/
│   └── workflows/
│       ├── test.yml                # gates + E2E on every pull request
│       └── deploy.yml              # build + publish to GitHub Pages
├── src/
│   ├── main.tsx                    # boot, version log line, router mount
│   ├── index.css                   # Tailwind v4 + design tokens (:root / .dark)
│   ├── vite-env.d.ts               # __APP_VERSION__ declaration
│   ├── routeTree.gen.ts            # generated by the router plugin — never hand-edited
│   ├── app.ts                      # APP_NAME — the one place the app's name is written
│   ├── routes/
│   │   ├── __root.tsx              # app shell: nav, theme provider, <Outlet/>
│   │   └── index.tsx
│   ├── components/
│   │   ├── ui/                     # shadcn/ui — generated, never hand-edited
│   │   └── app-footer.tsx          # renders __APP_VERSION__
│   ├── db/
│   │   ├── client.ts               # the Dexie instance + versioned stores
│   │   ├── schema.ts               # Zod record schemas + inferred types
│   │   └── backup.ts               # JSON export / import
│   ├── services/                   # domain logic — plain functions, no React
│   ├── stores/                     # Zustand UI state
│   └── lib/
│       ├── utils.ts                # cn()
│       └── day.ts                  # local civil-day helpers
└── tests/
    ├── setup/
    │   └── happy-dom.ts
    ├── unit/
    ├── components/
    └── e2e/
```

---

## 4. Configuration Files

### 4.1 `package.json`

```json
{
  "name": "my-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 4173",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "deadcode": "knip",
    "test": "bun test tests/unit tests/components",
    "test:e2e": "playwright test",
    "check": "bun run typecheck && bun run lint && bun run deadcode && bun run test"
  },
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "@tanstack/react-router": "^1",
    "dexie": "^4",
    "dexie-react-hooks": "^1",
    "zustand": "^5",
    "zod": "^3",
    "date-fns": "^4",
    "lucide-react": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5",
    "vite": "^6",
    "@vitejs/plugin-react": "^4",
    "@tanstack/router-plugin": "^1",
    "tailwindcss": "^4",
    "@tailwindcss/vite": "^4",
    "vite-plugin-pwa": "^0.21",
    "@biomejs/biome": "^2",
    "knip": "^5",
    "@happy-dom/global-registrator": "latest",
    "@testing-library/react": "^16",
    "@testing-library/dom": "^10",
    "@playwright/test": "^1",
    "fake-indexeddb": "^6"
  }
}
```

> Version ranges are indicative. Pin from the lockfile.
>
> `version` is the single source of truth for the app's version — Vite injects it as
> `__APP_VERSION__` (4.4), the footer renders it, and `main.tsx` stamps it on the first console
> line. A static app has no `/version` endpoint, so this is the mechanism to declare under
> **Version exposure** in `CLAUDE.md`'s Tool Hygiene & Operability section.

### 4.2 `bunfig.toml`

```toml
[test]
preload = ["./tests/setup/happy-dom.ts"]
```

`tests/setup/happy-dom.ts`:

```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import "fake-indexeddb/auto";

GlobalRegistrator.register();
```

`fake-indexeddb/auto` gives every test file a real IndexedDB implementation in memory, so Dexie
code is tested against the actual API rather than a mock.

### 4.3 `tsconfig.json`

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
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "types": ["bun", "vite/client", "vite-plugin-pwa/client"],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

### 4.4 `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";
import pkg from "./package.json";

export default defineConfig({
  // GitHub project pages serve from /<repo>/. The deploy workflow sets BASE_PATH.
  // A user/org page or a custom domain leaves it unset.
  base: process.env.BASE_PATH ?? "/",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: pkg.name,
        short_name: pkg.name,
        display: "standalone",
        theme_color: "#000000",
        icons: [{ src: "favicon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    }),
  ],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  build: { outDir: "dist", sourcemap: true },
  server: { port: 5173 },
});
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
declare const __APP_VERSION__: string;
```

### 4.5 `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": ["**", "!dist", "!dev-dist", "!src/components/ui", "!src/routeTree.gen.ts"]
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

### 4.6 `knip.json`

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "src/main.tsx",
    "src/routes/**/*.tsx",
    "tests/setup/*.ts",
    "tests/**/*.test.ts?(x)",
    "tests/e2e/**/*.spec.ts"
  ],
  "project": ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
  "ignore": ["src/components/ui/**", "src/routeTree.gen.ts"]
}
```

### 4.7 `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <title>My App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 4.8 `src/index.css`

The design tokens live here and nowhere else. `bunx shadcn@latest init` writes the full token set
for the chosen base color; this is the shape it produces, trimmed to the tokens every app uses.

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --ring: oklch(0.556 0 0);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
}
```

Add a new semantic color by defining `--x` and `--x-foreground` in both `:root` and `.dark` and
mapping them in `@theme inline`. Never edit a generated file under `src/components/ui/`.

### 4.9 `src/app.ts` — the app's name, in one place

```ts
export const APP_NAME = "my-app";
```

The name is used by the Dexie database, the backup envelope, the startup log line and the E2E
reset. Import it in all four rather than repeating the literal — a missed copy silently breaks
either backup import or test isolation.

### 4.10 `playwright.config.ts`

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "bun run build && bun run preview",
    url: "http://localhost:4173",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: "http://localhost:4173" },
});
```

The E2E suite builds the production bundle itself, so `bun run test:e2e` works cold in a fresh
session with nothing already running.

---

## 5. Persistence

### 5.1 `src/db/schema.ts`

Zod is the contract for anything crossing the IndexedDB boundary — stored records were written
by an older version of your own code, and imported backups come from a file the person chose.

```ts
import { z } from "zod";

export const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

// Example domain — inert on purpose. Substitute your own; do not ship these tables.
export const Note = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const DayMark = z.object({
  id: z.string().uuid(),
  noteId: z.string().uuid(),
  day: DayKey,                       // local civil day, not a timestamp
});

export type Note = z.infer<typeof Note>;
export type DayMark = z.infer<typeof DayMark>;
```

### 5.2 `src/db/client.ts`

```ts
import Dexie, { type EntityTable } from "dexie";
import { APP_NAME } from "@/app";
import type { Note, DayMark } from "./schema";

export const db = new Dexie(APP_NAME) as Dexie & {
  notes: EntityTable<Note, "id">;
  dayMarks: EntityTable<DayMark, "id">;
};

// Each version() block is permanent once released. Add a new one; never edit an old one.
db.version(1).stores({
  notes: "id, archivedAt, createdAt",
  dayMarks: "id, noteId, day, [noteId+day]",
});
```

The compound index `[noteId+day]` is what makes "was this marked today?" and consecutive-day
scans cheap.

### 5.3 Local civil days — `src/lib/day.ts`

Day-bucketed data is the common failure in a personal tracker: a UTC timestamp puts an 11pm
action on tomorrow for anyone east of Greenwich, and a naive `new Date()` diff breaks across a
DST boundary. Store the **local calendar day the person experienced**, as a string.

```ts
import { format, subDays, parseISO } from "date-fns";

/** The local calendar day, as YYYY-MM-DD. */
export const dayKey = (d: Date = new Date()): string => format(d, "yyyy-MM-dd");

/** The day before a key, on the calendar — DST-safe because it is date arithmetic. */
export const previousDay = (key: string): string => dayKey(subDays(parseISO(key), 1));
```

Rules that follow from this:

- Anything the person thinks of as "a day" is a `DayKey`, never a `Date` or an epoch number.
- Anything that is a real instant (`createdAt`, `archivedAt`) stays an ISO datetime string.
- Tests inject the day rather than reading the clock: domain functions take `today: string` as a
  parameter. A streak function that calls `new Date()` internally cannot be tested.

### 5.4 Backup — `src/db/backup.ts`

IndexedDB is wiped by "clear site data", by a browser reinstall, and by some privacy modes. The
export/import pair is the product's only durable backup and belongs in the walking-skeleton
epic, not a later one.

```ts
import { z } from "zod";
import { db } from "./client";
import { Note, DayMark } from "./schema";

const Backup = z.object({
  app: z.literal("my-app"),
  version: z.number().int(),
  exportedAt: z.string().datetime(),
  notes: z.array(Note),
  dayMarks: z.array(DayMark),
});

export async function exportBackup(): Promise<Blob> {
  const payload = {
    app: "my-app" as const,
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: await db.notes.toArray(),
    dayMarks: await db.dayMarks.toArray(),
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
}

const BACKUP_VERSION = 1;

export async function importBackup(file: File): Promise<void> {
  const parsed = Backup.parse(JSON.parse(await file.text()));
  if (parsed.version > BACKUP_VERSION) {
    throw new Error(
      "This backup was made by a newer version of the app. Update the app, then import again.",
    );
  }
  await db.transaction("rw", db.notes, db.dayMarks, async () => {
    await Promise.all([db.notes.clear(), db.dayMarks.clear()]);
    await db.notes.bulkAdd(parsed.notes);
    await db.dayMarks.bulkAdd(parsed.dayMarks);
  });
}
```

Import replaces everything inside one transaction, so a malformed file cannot leave a half-loaded
database. It is a destructive action — the UX Baseline confirmation rule applies.

---

## 6. Application Wiring

### 6.1 `src/main.tsx`

```tsx
import { StrictMode } from "react";
import { APP_NAME } from "./app";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./index.css";

console.info(`[INFO] ${APP_NAME} v${__APP_VERSION__} starting`);

const router = createRouter({ routeTree, history: createHashHistory() });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

The version line is the first thing in the console on every load — the static-app equivalent of a
server's startup log line.

### 6.2 `src/components/app-footer.tsx`

Half of the Version-exposure mechanism is the console line in 6.1; this is the other half, and it
is what a Playwright test asserts against.

```tsx
import { APP_NAME } from "@/app";

export function AppFooter() {
  return (
    <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
      <span data-testid="app-version">{`${APP_NAME} v${__APP_VERSION__}`}</span>
    </footer>
  );
}
```

Mount it once in the shell so every screen carries it — `src/routes/__root.tsx`:

```tsx
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { AppFooter } from "@/components/app-footer";

export const Route = createRootRoute({
  component: () => (
    <div className="flex min-h-svh flex-col">
      <main className="flex-1"><Outlet /></main>
      <AppFooter />
    </div>
  ),
});
```

### 6.3 Reading data

```tsx
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/client";

export function NoteList({ showArchived }: { showArchived: boolean }) {
  const notes = useLiveQuery(
    () => (showArchived ? db.notes.toArray() : db.notes.filter((h) => !h.archivedAt).toArray()),
    [showArchived],
  );

  if (notes === undefined) return <Spinner />;   // loading
  if (notes.length === 0) return <EmptyState />; // empty
  return <ul>{notes.map((h) => <NoteRow key={h.id} note={h} />)}</ul>;
}
```

`useLiveQuery` returns `undefined` until the first read resolves, which maps directly onto the
UX Baseline's **Screen states** requirement: `undefined` is loading, `[]` is empty, a thrown
error is the error state, and rows are populated.

### 6.4 What goes where

| State | Home |
|---|---|
| Anything the person would expect to still be there tomorrow | Dexie |
| Filters, open dialogs, selected tab, in-progress form input | Zustand |
| Theme choice | `localStorage`, read once by the ThemeProvider |
| Derived values (streak counts, totals) | Computed in `services/`, never stored |

Storing a derived value is how a streak count goes wrong: it drifts from the day marks that
produced it. Compute it.

### 6.5 Test-only fault and latency injection

The error-state and progress-feedback requirements need a way to make something fail or be slow on
demand. A static SPA has no process environment, so the switch is a build-time flag the E2E harness
sets when it builds the preview bundle.

```ts
// src/lib/fault.ts
const mode = import.meta.env.VITE_FAULT_MODE ?? "";

export const faultDelay = () =>
  mode === "slow" ? new Promise((r) => setTimeout(r, 3000)) : Promise.resolve();

export const faultThrow = () => {
  if (mode === "fail") throw new Error("Injected failure (VITE_FAULT_MODE=fail)");
};
```

Call both at the top of each data access function in `services/`. The flag is unset in a normal
build, so the production bundle tree-shakes to nothing. Playwright sets it per project:

```ts
webServer: {
  command: "VITE_FAULT_MODE=fail bun run build && bun run preview",
  url: "http://localhost:4173",
}
```

---

## 7. Testing

| Scope | Runner | Notes |
|---|---|---|
| Domain services | `bun test` | Pure functions, clock injected as a `DayKey` parameter. |
| Dexie queries | `bun test` + `fake-indexeddb` | Real IndexedDB semantics in memory; fresh DB per test file. |
| React components | `bun test` + happy-dom + Testing Library | Preloaded via `bunfig.toml`. |
| E2E | Playwright against `vite preview` | Real production bundle, real IndexedDB, no Docker. |

```ts
import { test, expect, beforeEach } from "bun:test";
import { db } from "@/db/client";
import { currentStreak } from "@/services/streak";

beforeEach(async () => {
  await db.dayMarks.clear();
});

test("counts consecutive days ending today", async () => {
  await db.dayMarks.bulkAdd([
    { id: crypto.randomUUID(), noteId: "n1", day: "2026-03-08" },
    { id: crypto.randomUUID(), noteId: "n1", day: "2026-03-09" },
  ]);
  const marks = await db.dayMarks.where({ noteId: "n1" }).toArray();
  expect(currentStreak(marks, "2026-03-09")).toBe(2);
});
```

Note the injected `"2026-03-09"`. A streak test that depends on the real clock passes today and
fails at a month boundary.

E2E state is reset per test by clearing storage before navigation:

```ts
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate((name) => indexedDB.deleteDatabase(name), APP_NAME);
  await page.reload();
});
```

---

## 8. Deployment: GitHub Pages

`.github/workflows/deploy.yml`:

A second workflow runs the gates on pull requests — `deploy.yml` below only guards `main`, so
without it nothing checks a branch before merge. `.github/workflows/test.yml`:

```yaml
name: Test

on: [pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run check
      - run: bunx playwright install --with-deps chromium
      - run: bun run test:e2e
```

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run check
      - run: bun run build
        env:
          BASE_PATH: /${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

One-time setup: repository **Settings → Pages → Source → GitHub Actions**.

`bun run check` runs before the build, so a red gate blocks the deploy rather than publishing a
broken bundle.

**Base path.** Project pages serve from `https://<user>.github.io/<repo>/`, so the workflow sets
`BASE_PATH`. A user/org page (`<user>.github.io`) or a custom domain serves from the root — drop
the `env:` block in that case. Getting this wrong shows up as a white page with 404s on the
`assets/*.js` requests.

**Custom domain.** Add `public/CNAME` containing the domain; Vite copies `public/` verbatim into
`dist/`.

---

## 9. Daily Commands

```bash
bun install
bunx playwright install      # one time, before the first `test:e2e`
bun run dev                  # http://localhost:5173
bun run check                # typecheck + lint + deadcode + tests
bun run test:e2e             # builds, previews, runs Playwright
bun run preview              # serve the production bundle locally
bunx shadcn@latest add button dialog
git push                     # main → Actions → Pages
```

---

## 10. Additional Considerations

Each of these is already handled by the configuration above.

| Consideration | What happens | Applied fix |
|---|---|---|
| Deep link 404s on a static host | `/records` has no file behind it; Pages returns its 404 page. | Hash history (6.1) — the path after `#` never reaches the server. |
| Wrong base path | White page, 404s on `assets/*.js`. | `BASE_PATH` set by the deploy workflow (4.4, 8). |
| Data loss on "clear site data" | IndexedDB is gone with no warning and no copy. | Export/import ships in the first epic (5.4). |
| Data does not follow the person | A second device starts empty; users read this as a bug. | Say so in the UI once, and offer export/import as the transfer path. |
| Day boundaries and DST | An 11pm action lands on tomorrow; streaks break across DST. | `DayKey` strings in local time (5.3). |
| Untestable clock | Streak logic reads `new Date()` and fails at month ends. | Domain functions take `today: string` (5.3, 7). |
| Stored data from an older build | Shapes drift as the schema changes. | Zod parse at the boundary (5.1); Dexie `upgrade()` per version (5.2). |
| Editing a released Dexie version | Existing installs silently skip the migration. | Versions are append-only — add `version(2)`, never edit `version(1)`. |
| Stale PWA cache after deploy | The person keeps seeing the old app. | `registerType: "autoUpdate"` (4.4). |
| Private browsing blocks IndexedDB | `db.open()` throws; the app renders nothing. | Catch at boot and show the error state naming the cause. |
| Secrets in the bundle | Any key shipped to the browser is public. | No secrets layer exists; a product needing one needs the web-app sheet. |
| Derived values drifting | A stored streak count disagrees with the day marks. | Compute in `services/`, never persist (6.4). |
| Lint noise from generated files | shadcn and route tree churn. | Excluded in Biome and Knip (4.5, 4.6). |
| Jekyll mangling files | Legacy branch-based Pages ignores `_`-prefixed paths. | Not applicable to the Actions flow (8); add `.nojekyll` only for branch deploys. |

---

## 11. Growth Path

Each row is the first step of a move toward [`bun-web-app-stack.md`](bun-web-app-stack.md). The
UI, the `services/` functions and the Zod contracts survive all of them — only the data access
layer changes.

| Trigger | Change | Effort |
|---|---|---|
| Data must follow the person across devices | Add the web sheet's API and SQLite; replace `useLiveQuery` with TanStack Query against typed routes. | Medium |
| Two or more people, or anything private | Add Better Auth per the web sheet. This is the point where the static host is left behind. | Medium |
| File attachments | Object storage per the web sheet (`Bun.S3Client`). There is no static-host version of this. | Medium |
| A third-party API key is needed | A server has to hold it. Move to the web sheet. | Medium |
| The dataset outgrows a browser | Server-side database. Export/import becomes the migration tool you already have. | Medium |

---

## 12. Alternatives Considered

| Option | Verdict |
|---|---|
| `localStorage` as the database | Synchronous, ~5 MB, strings only, no indexes. Fine for a theme preference; not for records. |
| Raw IndexedDB | The API is verbose and easy to misuse. Dexie is a thin, well-typed wrapper over the same thing. |
| Browser history + a `404.html` copy of `index.html` | Works on Pages and gives cleaner URLs, but deep links return HTTP 404 and it breaks on hosts without that fallback. Hash history has no edge cases. |
| TanStack Query over Dexie | A cache in front of a local database that is already instant. `useLiveQuery` is fewer moving parts. |
| A sync service (Firebase, Supabase, PocketBase) | The moment sync matters, the answers in *When This Sheet Applies* have changed — use the web sheet and own the data. |
| Netlify / Cloudflare Pages / S3 + CloudFront | All work with this bundle unchanged; only Section 8 differs. Pages is the default because the repository already exists. |
| Vitest | Fine, but a second test runner. `bun test` covers unit and component tests. |
| Electron wrapper for a desktop feel | If it needs to be a desktop app, use `bun-electron-desktop-stack.md` — an installable PWA covers most of the want. |
