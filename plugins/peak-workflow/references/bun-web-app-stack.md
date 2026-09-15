# Bun Web Application Reference Sheet

A reference stack for building a claude.ai–style web application on the Bun runtime, deployed as a
single Docker container, with S3-compatible object storage for attachments and a fully local
development and test loop.

Unlike the desktop sheet, Bun **is** the runtime here. That unlocks `bun:sqlite`, `Bun.serve`,
`Bun.S3Client` and single-binary tooling with no Node compatibility layer.

> **How to use this sheet — read before acting on it.**
>
> This is **reference material, not a migration mandate.** It exists for two purposes:
>
> 1. **The recommended stack for a brand-new project of this shape.** When
>    `/peak-workflow:setup` is told "whatever you recommend", it reads Section 2 of this sheet
>    and offers exactly these picks — there is no separate default list. `/peak-workflow:plan-project`
>    then builds the walking skeleton from Sections 3 and 4, minus any layer 2.1 drops.
> 2. **A layer checklist for any project** — the Stack Summary table names every layer an
>    application of this shape has to handle (runtime, HTTP, API style, live updates, per-request
>    streaming, auth, email delivery, build,
>    UI, styling, icons, client state, routing, database, migrations, object storage, validation,
>    config, secrets, versioning, tests, lint, dead code, container, hosting, backups, logging).
>    Use it to notice a layer the project has not decided yet.
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
                          ┌──────────────────────────────────────────────┐
  Browser                 │ Single Docker container (oven/bun)           │
┌──────────────┐  HTTPS   │                                              │
│ React 19 SPA │ ◄──────► │  Hono on Bun.serve                           │
│ shadcn/ui    │          │   ├─ /api/*      typed RPC + SSE streaming   │
│ TanStack     │          │   ├─ /auth/*     Better Auth                 │
└──────┬───────┘          │   └─ /*          static SPA (dist/)          │
       │                  │            │                                 │
       │ presigned        │            ▼                                 │
       │ PUT / GET        │  core package (Drizzle, services, Zod)       │
       │                  │            │                                 │
       │                  │            ▼                                 │
       │                  │  bun:sqlite  ──►  /data/app.db (volume, WAL) │
       │                  └──────────────────────┬───────────────────────┘
       │                                         │ Bun.S3Client
       ▼                                         ▼
┌─────────────────────────────────────────────────────────────┐
│ S3-compatible object storage                                │
│   prod:  AWS S3 (or R2 / B2 / Tigris)                        │
│   local: MinIO via docker compose                            │
└─────────────────────────────────────────────────────────────┘
```

**Design rules**

- One process, one container, one SQLite file on a persistent volume. Scale vertically first.
- Attachments never pass through the app server in bulk. Browser uploads and downloads with
  presigned URLs; the server only records metadata.
- Every environment difference is an environment variable. Code is identical in local and prod.

---

## 2. Stack Summary

| Layer | Pick | Why |
|---|---|---|
| Runtime | Bun 1.2+ | Single runtime for server, tests, scripts and bundling. Native SQLite and S3 clients. |
| HTTP framework | Hono | Runs natively on `Bun.serve`, tiny, typed routes, built-in SSE helper, `hc` typed RPC client. |
| API style | Hono RPC (`hono/client`) + Zod validators | End-to-end types with zero codegen. |
| Live updates | Broadcast SSE via Hono `streamSSE` on `GET /api/events`, consumed with `EventSource` | Someone else's change appears without a reload (5.6, 6.7, 7.5). 15 s heartbeat under the idle timeout (6.2). |
| Per-request streaming | SSE via Hono `streamSSE` on a `POST`, consumed with `fetch` | A long generated response (e.g. an AI reply) renders as it arrives (6.5, 7.4). Kept only when the product streams one (2.1). |
| Auth | Better Auth | Bun-native, Drizzle adapter, sessions in SQLite. Email/password always; a named provider only when recorded (6.3). One owner-or-permitted-role rule (5.5). |
| Email delivery | Transactional email provider's HTTP API via `fetch` in `apps/api/src/mail.ts` (Resend shown); key in `EMAIL_API_KEY`. `EMAIL_DELIVERY=log` prints links to the log and keeps them in an in-memory outbox for dev and tests | Open password sign-up needs verified addresses and password reset (6.3). The provider is confirmed with the user before the first deploy. Kept only while password sign-up is public (2.1). |
| Frontend build | Vite 6 | Fast HMR, Tailwind v4 plugin, output served by Hono in prod. |
| UI | React 19 + TypeScript 5 (strict) | Boring and correct. |
| Styling | Tailwind CSS v4 + shadcn/ui | Components copied into the repo, no version lock. |
| Icons | lucide-react | The icon set shadcn assumes. |
| Client state | Zustand (UI) + TanStack Query (server data) | Query caches, dedupes and invalidates API calls. |
| Routing | TanStack Router (browser history) | Type-safe, code-split routes. Hono falls back to `index.html`. |
| Database | Drizzle ORM + drizzle-kit, driver `bun:sqlite` | Synchronous, zero dependencies, ideal for a single container. |
| Migrations | drizzle-kit `generate`, Drizzle `migrate()` at boot | SQL committed to the repo and copied into the image. |
| Object storage | `Bun.S3Client` | Built into Bun. Works with AWS S3 and MinIO via `endpoint`. Presigned URLs included. |
| Local S3 | MinIO in docker compose | Same API, same code path, no mocks. |
| Validation | Zod | Shared schemas for API input, env vars and config. |
| Config | Environment variables parsed by Zod in `env.ts`, documented in `.env.example` | Every environment difference is a variable; a bad one crashes at boot, not an hour later. |
| Secrets | Runtime environment variables; `.env` gitignored, never baked into the image | The server holds keys the browser must never see — auth secret, provider client secrets, email API key, storage credentials, a product API key. |
| Versioning | `package.json#name` and `#version`, read once in `packages/core/src/app.ts` | Served at `GET /version`, rendered in the footer, stamped on the first log line. |
| Unit tests | `bun test` | Native, Jest-compatible API. |
| API tests | `bun test` + `app.request()` | Hono apps are testable in-process without a port. |
| Component tests | `bun test` + happy-dom + Testing Library | One test runner for everything. |
| E2E | Playwright | Runs against `docker compose up` for full-fidelity tests. |
| Lint + format | Biome 2 | One tool, one config. |
| Type-level lint | `tsc --noEmit` with unused checks | Catches what linters miss. |
| Dead code | Knip | Unused files, exports, types and dependencies. |
| Container | Multi-stage `oven/bun` image | Build frontend + server, ship a slim runtime image. |
| Hosting | Any container host with a persistent volume and HTTPS | The concrete host costs money, so it is chosen with the user before the first deploy — never picked silently. |
| Backups | Litestream to the object-storage bucket, or a scheduled `sqlite3 .backup` to a mounted backup volume | Litestream when Object storage is in the stack; the backup volume when it is N/A (2.1). The copy never lives on the data volume. |
| Logging | Pino via `hono-pino`, JSON to stdout, sensitive keys redacted | Container-native; let the platform collect logs. |

### 2.1 Dropping a layer

The sample domain (`conversations`, `messages`, the `conversation` resource) is illustrative:
`plan-project` replaces it with the project's reference-screen entity everywhere it appears.

`setup` writes a dropped row as `N/A — <reason> (shape Q<N>)`. *Per-request streaming* has no
shape question: it is written `N/A — no streamed responses` unless the product streams a long
generated response (e.g. an AI reply). `plan-project` still writes Sections 3–4 verbatim
**minus** what this table lists for each `N/A` row, and skips the listed wiring. Anything not
listed stays.

| Dropped row (shape) | Tree (3) | Config and env (4, 5.1) | Code (5–7) | Compose, tests, commands (8.2, 9, 10) | Section 11 rows | Instead |
|---|---|---|---|---|---|---|
| **Auth** (Q2) | `apps/api/src/auth.ts`, `apps/api/src/routes/users.ts`, `packages/core/src/access.ts`, `apps/web/src/auth-client.ts`, `tests/setup/auth.ts` | 4.1 `better-auth`; 4.2 `BETTER_AUTH_SECRET` and `GOOGLE_WORKSPACE_DOMAIN`; 4.4 `"/auth"` proxy entry; 4.8 `# Auth` block, including the `GOOGLE_*`/`MICROSOFT_*` lines; 5.1 `BETTER_AUTH_SECRET`, the `GOOGLE_*`/`MICROSOFT_*` lines and `superRefine` | 5.2 Better Auth tables and `userId` columns; `userId` segment of `attachmentKey` (5.4); 6.1 `./auth` and `ROLES` imports, `users` import and `.route("/users", …)`, `/auth/*` handler, `/api` session middleware, `userId`/`role` in `Variables`; 6.3; 6.8; 7.6; `can()` calls, actors and `userId` filters (6.4, 6.5, 6.6) | 9 Access rule, Role change, Unverified sign-up and Organization address squatting rows; `signInForTest`, `json` helper, access-rule, create-refused, role-change, unverified sign-up and squatting tests; E2E sign-in steps | Access rule bypass; Create skips the access rule; Derived data leaks other people's rows; No role change path; Role names scattered; Account takeover through provider linking; Organization address squatting; Org role from user input; Org-only admits any Google account; Provider-written fields editable; Post-login blank page in dev; Provider secrets required everywhere; Auth tables drift; Session cookie cross-origin in dev | Routes are public; keep `/healthz`, `/version` as-is. Email delivery is also `N/A` |
| **Email delivery** (Q2 — no public password sign-up: Auth `N/A`, Google `org-only`, or every account comes from the named provider) | `apps/api/src/mail.ts` | 4.2 `EMAIL_DELIVERY` line; 4.8 `# Email` block; 5.1 the `EMAIL_*` lines and their `superRefine` check | 6.3 `./mail` import, `requireEmailVerification`, `revokeSessionsOnPasswordReset`, `sendResetPassword`, the `emailVerification` block, the `EMAIL_NOT_VERIFIED` entry and the "or use Forgot password" clause; 7.6 sign-up `callbackURL` note and the forgot/reset-password lines | 9 Unverified sign-up row and test (keep its `releaseUnverifiedEmail` half when Google is on); `outbox` import, `lastLinkTo` and the verification lines in `signInForTest`; "verification link" in the E2E row | Email never delivered; the verification clause of Account takeover through provider linking | Production sets `emailAndPassword.disableSignUp: process.env.NODE_ENV === "production"` (org-only already does, 6.3), so no stranger registers a password account to verify |
| **Object storage** + **Local S3** (Q3) | `packages/core/src/storage/`, `apps/api/src/routes/attachments.ts`; "+ minio" in the `docker-compose.yml` comment | 4.2 the four `S3_*` lines; 4.8 `# S3` block, including its host-dev `S3_ENDPOINT` comment; 5.1 every `S3_*` | 5.2 `attachments` table; 5.4; 5.5 `"attachment"` in `Resource` and every `attachment` grant; 6.1 `attachments` import and `.route("/attachments", …)`; 6.4; 7.3 | 8.2 `minio`, `minio-init`, the app's `S3_*` environment lines and `depends_on`, `miniodata` volume, both notes under 8.2; 9 S3 wrapper row, `slot` and the upload-slot test, "upload" in the E2E row; 10 `docker compose up -d minio minio-init` — the create-refused test moves to the project's first create route | Bulk uploads through the app; Trusting client-reported size; Orphaned S3 objects; Presigned URL host mismatch locally; Missing CORS on bucket; Unsafe object keys; Content type allowlist | **Backups:** the host scheduler runs `sqlite3 <data-volume>/app.db ".backup <backup-volume>/app-<date>.db"` into a mounted backup volume (not S3) |
| **Live updates** (Q4) | `packages/core/src/events.ts`, `apps/api/src/routes/events.ts`, `apps/web/src/queries/live-updates.ts` | 4.2 `FakeEventSource` and its assignment in `tests/setup/happy-dom.ts` | 6.1 `events` import and `.route("/events", …)`; 6.7; `publish` import and calls (6.6); 7.5 | 9 Live updates row; "live updates" in the E2E row | Live updates on one process; SSE dropped by idle timeout (only when Per-request streaming is also `N/A`) | TanStack Query refetch on window focus; `idleTimeout` may stay |
| **Per-request streaming** (no shape question — `N/A — no streamed responses`) | `apps/api/src/routes/messages.ts`, `packages/core/src/services/assistant.ts` | — | 5.2 `messages` table and the `attachments.messageId` column that references it; 6.1 `messages` import and `.route("/messages", …)`; 6.5; 7.4 | "streaming" in the 9 E2E row | Abandoned streams waste model calls; SSE dropped by idle timeout (only when Live updates is also `N/A`) | The response is returned whole by a normal route |
| **Secrets** (Q5 — reachable only when Auth and Object storage are also N/A) | — | Nothing further: those rows already removed every secret | — | — | — | `.env` stays gitignored (it still holds config); the deploy needs no secret store |

---

## 3. Repository Layout

```
my-app/
├── package.json
├── bunfig.toml
├── biome.json
├── knip.json
├── tsconfig.base.json             # compiler options
├── tsconfig.json                  # extends base; paths + include — read by tsc and by Bun at runtime
├── drizzle.config.ts
├── playwright.config.ts
├── drizzle/                       # generated SQL migrations (committed)
├── Dockerfile
├── docker-compose.yml             # app + minio for local
├── .env.example
├── packages/
│   └── core/
│       ├── package.json
│       └── src/
│           ├── app.ts             # APP_NAME + APP_VERSION (from package.json)
│           ├── env.ts             # Zod-validated process.env
│           ├── access.ts          # the one owner-or-permitted-role rule
│           ├── events.ts          # in-process pub/sub for live updates
│           ├── db/
│           │   ├── schema.ts
│           │   ├── client.ts      # bun:sqlite + drizzle + migrate
│           │   └── index.ts
│           ├── storage/
│           │   └── s3.ts          # Bun.S3Client wrapper
│           ├── services/          # business logic, no HTTP
│           │   └── assistant.ts   # generateReply stub for per-request streaming (6.5)
│           └── contracts/         # Zod schemas shared by API + web
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts           # Bun.serve entry
│   │       ├── app.ts             # Hono app (exported for tests)
│   │       ├── logger.ts          # the one Pino instance; emits the startup line
│   │       ├── db.ts              # the one database handle
│   │       ├── auth.ts            # Better Auth instance
│   │       ├── mail.ts            # the one email sender (log mode in dev and tests)
│   │       ├── routes/
│   │       │   ├── conversations.ts # access rule in use
│   │       │   ├── messages.ts    # per-request SSE (token streaming)
│   │       │   ├── events.ts      # broadcast SSE (live updates)
│   │       │   ├── users.ts       # role change (org role only)
│   │       │   └── attachments.ts # presigned URLs
│   │       └── middleware/
│   └── web/
│       ├── package.json
│       ├── index.html
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx
│           ├── router.tsx
│           ├── api.ts             # hc<AppType> client
│           ├── auth-client.ts     # Better Auth client on /auth
│           ├── components/
│           │   ├── app-footer.tsx # renders APP_NAME v<version>
│           │   └── ui/            # shadcn
│           ├── stores/
│           └── queries/
│               └── live-updates.ts # EventSource → invalidate queries
└── tests/
    ├── setup/                     # happy-dom.ts, env.ts, auth.ts (signInForTest)
    ├── unit/
    ├── api/
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
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev": "bun run --filter './apps/*' dev",
    "dev:api": "bun --hot apps/api/src/index.ts",
    "dev:api:pretty": "bun --hot apps/api/src/index.ts | pino-pretty",
    "dev:web": "bun run --cwd apps/web vite",
    "build": "bun run --cwd apps/web vite build",
    "start": "bun apps/api/src/index.ts",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "deadcode": "knip",
    "test": "bun test tests/unit tests/api tests/components",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:studio": "drizzle-kit studio",
    "check": "bun run typecheck && bun run lint && bun run deadcode && bun run test",
    "compose:up": "docker compose up --build",
    "compose:down": "docker compose down -v"
  },
  "dependencies": {
    "hono": "^4",
    "@hono/zod-validator": "^0.4",
    "hono-pino": "latest",
    "pino": "^9",
    "better-auth": "^1",
    "drizzle-orm": "^0.44",
    "zod": "^3",
    "react": "^19",
    "react-dom": "^19",
    "@tanstack/react-query": "^5",
    "@tanstack/react-router": "^1",
    "zustand": "^5",
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
    "drizzle-kit": "^0.31",
    "@biomejs/biome": "^2.3",
    "knip": "^5",
    "@happy-dom/global-registrator": "latest",
    "@testing-library/react": "^16",
    "@testing-library/dom": "^10",
    "@playwright/test": "^1",
    "pino-pretty": "^13"
  }
}
```

> Version ranges are indicative. Pin from the lockfile.
>
> `name` and `version` are the single source of truth for the app's identity. `packages/core/src/app.ts`
> (5.0) reads both; the API serves them at `GET /version` (6.1), the footer renders them (7.2), and
> `logger.ts` stamps them on the first log line (6.2). `check` calls `bun run test`, never bare
> `bun test` — a bare run also collects the Playwright specs under `tests/e2e/` and fails.
> `dev:api:pretty` is the only consumer of `pino-pretty`, which keeps Knip from flagging it.

Workspace manifests — all dependencies stay in the root `package.json`.

`packages/core/package.json`:

```json
{ "name": "@my-app/core", "private": true, "type": "module" }
```

`apps/api/package.json` — `dev` runs from the root so `.env` and relative paths resolve:

```json
{ "name": "@my-app/api", "private": true, "type": "module", "scripts": { "dev": "bun run --cwd ../.. dev:api" } }
```

`apps/web/package.json`:

```json
{ "name": "@my-app/web", "private": true, "type": "module", "scripts": { "dev": "vite" } }
```

### 4.2 `bunfig.toml`

```toml
[test]
preload = ["./tests/setup/happy-dom.ts", "./tests/setup/env.ts"]
```

`tests/setup/happy-dom.ts`:

```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// A real origin: the default about:blank makes window.location.origin "null", so hc() and $url() throw
GlobalRegistrator.register({ url: "http://localhost:3000" });

// happy-dom has no EventSource; components under test get one that never connects (7.5)
export class FakeEventSource extends EventTarget {
  static readonly instances: FakeEventSource[] = [];
  onopen: ((event: Event) => void) | null = null;
  readyState = 0;
  constructor(readonly url: string | URL) {
    super();
    FakeEventSource.instances.push(this);
  }
  close() {
    this.readyState = 2;
  }
  emit(type: string, data: string) { // a test delivers a server event
    this.dispatchEvent(new MessageEvent(type, { data }));
  }
}
globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
```

`tests/setup/env.ts`:

```ts
process.env.DATABASE_PATH ??= ":memory:";
process.env.S3_BUCKET ??= "test-bucket";
process.env.S3_ENDPOINT ??= "http://localhost:9000";
process.env.S3_ACCESS_KEY_ID ??= "minioadmin";
process.env.S3_SECRET_ACCESS_KEY ??= "minioadmin";
process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-characters-long";
process.env.EMAIL_DELIVERY ??= "log"; // no mail provider: signInForTest reads the link from the outbox (9)
process.env.APP_URL ??= "http://localhost:3000";
```

Google provider only (6.3), `env.ts` adds the domain the squatting test (9) signs up against:

```ts
process.env.GOOGLE_WORKSPACE_DOMAIN ??= "workspace.test";
```

`tests/setup/auth.ts` is defined in Section 9.

### 4.3 `tsconfig.base.json` and `tsconfig.json`

`tsconfig.base.json`:

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
    "types": ["bun"]
  }
}
```

`tsconfig.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "paths": {
      "@core/*": ["./packages/core/src/*"],
      "@api/*": ["./apps/api/src/*"],
      "@web/*": ["./apps/web/src/*"]
    }
  },
  "include": ["apps", "packages", "tests", "*.ts"]
}
```

`paths` lives in `tsconfig.json` itself because Bun resolves the `@core/*` aliases from it at
runtime — so the runtime image copies both files (8.1). `"types": ["bun"]` resolves `@types/bun`
(4.1), the one declared package; `bun-types` is only its transitive dependency and is not
reachable from the root under Bun's isolated installs.

### 4.4 `apps/web/vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@core": resolve(__dirname, "../../packages/core/src"),
      "@web": resolve(__dirname, "src"),
    },
  },
  build: { outDir: "dist", sourcemap: true },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000", "/auth": "http://localhost:3000" },
  },
});
```

### 4.5 `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/2.3.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": ["**", "!!**/dist", "!drizzle", "!apps/web/src/components/ui", "!apps/web/src/routeTree.gen.ts"]
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

Biome 2 has no `files.ignore`: `includes` starts with `"**"` and excludes with `!` (a negated pattern
cannot stand alone); `!!` force-ignores output folders and needs Biome 2.3+ (hence `^2.3`, 4.1). `useSortedClasses` is still a nursery rule.

### 4.6 `knip.json`

With `workspaces` in `package.json`, Knip ignores root-level `entry`/`project`; each workspace is
configured under `workspaces`, the root as `"."`.

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "workspaces": {
    ".": {
      "entry": ["tests/**/*.test.ts?(x)", "tests/e2e/**/*.spec.ts", "tests/setup/*.ts"],
      "project": ["tests/**/*.{ts,tsx}", "*.ts"]
    },
    "apps/api": {
      "entry": ["src/index.ts"],
      "project": ["src/**/*.ts"],
      "paths": { "@core/*": ["../../packages/core/src/*"] }
    },
    "apps/web": {
      "entry": ["src/main.tsx", "src/routes/**/*.tsx"],
      "project": ["src/**/*.{ts,tsx}"],
      "paths": {
        "@core/*": ["../../packages/core/src/*"],
        "@api/*": ["../api/src/*"],
        "@web/*": ["./src/*"]
      },
      "ignore": ["src/components/ui/**", "src/routeTree.gen.ts"]
    },
    "packages/core": {
      "project": ["src/**/*.ts"]
    }
  }
}
```

### 4.7 `drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./packages/core/src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_PATH ?? "./data/app.db" },
});
```

### 4.8 `.env.example`

```bash
# Server
PORT=3000
APP_URL=http://localhost:3000
LOG_LEVEL=info

# Database (file path inside the container volume).
# Host dev (`bun run dev`, outside compose): use DATABASE_PATH=./data/app.db — `/data` exists only inside compose.
DATABASE_PATH=/data/app.db

# Auth
BETTER_AUTH_SECRET=change-me-to-a-random-32-plus-character-string
# Named identity provider only (6.3) — uncomment the recorded provider's lines.
# A provider stays off until both its client ID and secret are set.
# Google callback: <APP_URL>/auth/callback/google
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GOOGLE_AUDIENCE=mixed            # org-only | mixed — the recorded mode (6.3)
# GOOGLE_WORKSPACE_DOMAIN=example.com   # required whenever GOOGLE_AUDIENCE is set
# Microsoft callback: <APP_URL>/auth/callback/microsoft
# MICROSOFT_CLIENT_ID=
# MICROSOFT_CLIENT_SECRET=
# MICROSOFT_TENANT_ID=

# Email (verification and password-reset links, 6.3)
# log: links are printed to the app log, never sent — local dev and compose only.
# Production: EMAIL_DELIVERY=api plus the provider's key; api without a key crashes at boot.
EMAIL_DELIVERY=log
# EMAIL_API_KEY=
# EMAIL_FROM="My App <no-reply@example.com>"

# S3 (local: MinIO; prod: leave S3_ENDPOINT empty for AWS)
# Host dev (`bun run dev`, outside compose): use S3_ENDPOINT=http://localhost:9000 — `minio` resolves only inside compose.
S3_BUCKET=attachments
S3_REGION=us-east-1
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

---

## 5. Core Package

### 5.0 `packages/core/src/app.ts` — name and version, in one place

```ts
import { name, version } from "../../../package.json";

export const APP_NAME: string = name;
export const APP_VERSION: string = version;
```

Imported by the API (6.1, 6.2) and the web app (7.2) alike. It imports nothing but
`package.json`, so it is safe in the browser bundle, and renaming the project in 4.1 flows through.

### 5.1 `packages/core/src/env.ts`

```ts
import { z } from "zod";

const schema = z
  .object({
    PORT: z.coerce.number().default(3000),
    APP_URL: z.string().url(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    DATABASE_PATH: z.string().default("/data/app.db"),
    BETTER_AUTH_SECRET: z.string().min(32),
    // api: send through the provider; log: print links and keep them in memory (dev, tests)
    EMAIL_DELIVERY: z.enum(["api", "log"]).default("api"),
    EMAIL_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("My App <no-reply@example.com>"),
    S3_BUCKET: z.string(),
    S3_REGION: z.string().default("us-east-1"),
    S3_ENDPOINT: z.string().url().optional(),
    S3_ACCESS_KEY_ID: z.string(),
    S3_SECRET_ACCESS_KEY: z.string(),
    S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  })
  .superRefine((e, ctx) => {
    // Without a key, verification and reset emails would vanish in production
    if (e.EMAIL_DELIVERY === "api" && !e.EMAIL_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["EMAIL_API_KEY"], message: "required when EMAIL_DELIVERY=api" });
    }
  });

export const env = schema.parse(process.env);
export type Env = typeof env;
```

Fail fast at boot. A bad env var should crash the container, not surface as a 500 an hour later.

**Named identity provider only.** Absent unless the project records an approved provider. The
lines are optional, so `bun test` (4.2) and compose run without provider secrets; 6.3 turns a
provider on only when its client ID and secret are both set. Add the lines inside `z.object({ … })`
and the checks inside the same `superRefine`:

```ts
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_AUDIENCE: z.enum(["org-only", "mixed"]).optional(), // the recorded Google mode (6.3)
  GOOGLE_WORKSPACE_DOMAIN: z.string().optional(), // org-only: the `hd` restriction; both modes: grants the org role, blocks squatting (6.3)
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),     // the organization's tenant ID, not "common"
```

```ts
    // Google on without a mode, or org-only without a domain, would admit any Google account;
    // mixed without a domain grants nobody the org role and turns the squatting check off
    if (e.GOOGLE_CLIENT_ID && !e.GOOGLE_AUDIENCE) {
      ctx.addIssue({ code: "custom", path: ["GOOGLE_AUDIENCE"], message: "required when GOOGLE_CLIENT_ID is set" });
    }
    if (e.GOOGLE_AUDIENCE && !e.GOOGLE_WORKSPACE_DOMAIN) {
      ctx.addIssue({ code: "custom", path: ["GOOGLE_WORKSPACE_DOMAIN"], message: "required when GOOGLE_AUDIENCE is set" });
    }
```

A deployment that relies on the provider sets the pair; confirm its sign-in once after deploy,
since a missing pair hides the provider instead of crashing.

### 5.2 `packages/core/src/db/schema.ts`

```ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("conversations_user_idx").on(t.userId)]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("messages_conversation_idx").on(t.conversationId)]);

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  messageId: text("message_id").references(() => messages.id, { onDelete: "set null" }),
  key: text("key").notNull().unique(),       // S3 object key
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  status: text("status", { enum: ["pending", "uploaded"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
```

`userId` is the owner column on every user-data table. Better Auth generates its own `user`,
`session`, `account` and `verification` tables, including the `role` field from 6.3. Run
`bunx @better-auth/cli generate` to emit them into the same schema file.

### 5.3 `packages/core/src/db/client.ts`

```ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";
import { env } from "../env";

export function createDb(path = env.DATABASE_PATH) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolve(import.meta.dir, "../../../../drizzle") });

  return { db, sqlite, close: () => sqlite.close() };
}

export type AppDb = ReturnType<typeof createDb>["db"];
```

### 5.4 `packages/core/src/storage/s3.ts`

```ts
import { S3Client } from "bun";
import { env } from "../env";

export const s3 = new S3Client({
  bucket: env.S3_BUCKET,
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,               // undefined => AWS
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  virtualHostedStyle: !env.S3_FORCE_PATH_STYLE,
});

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function attachmentKey(userId: string, id: string, filename: string) {
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  return `users/${userId}/attachments/${id}/${safe}`;
}

export function presignUpload(key: string, contentType: string) {
  return s3.presign(key, {
    method: "PUT",
    expiresIn: 600,
    type: contentType,
    acl: "private",
  });
}

export function presignDownload(key: string) {
  return s3.presign(key, { method: "GET", expiresIn: 3600 });
}

export async function objectExists(key: string) {
  return s3.exists(key);
}

export async function objectSize(key: string) {
  const stat = await s3.stat(key);
  if (stat.size > MAX_UPLOAD_BYTES) throw new Error("attachment exceeds size limit");
  return stat.size;
}

export function deleteObject(key: string) {
  return s3.delete(key);
}
```

One code path for AWS and MinIO. The only difference is `S3_ENDPOINT` and path style.

### 5.5 `packages/core/src/access.ts` — the one access rule

`plan-project` substitutes the roles recorded in `CLAUDE.md` here, in `ROLES` and `GRANTS`
(e.g. `org: "coordinator", default: "volunteer"`) — nowhere else; every other snippet imports `ROLES`.

```ts
// The organization's role and the role every new account gets — the only place role names are written
export const ROLES = { org: "admin", default: "member" } as const;
export const ROLE_NAMES = [ROLES.org, ROLES.default] as const; // every assignable role, for z.enum (6.8)

type Action = "read" | "create" | "update" | "delete";
type Resource = "conversation" | "attachment" | "role";
type Actor = { id: string; role: string };
// `any`: every record of the resource. `own`: only records whose userId is the actor's.
type Grant = { any?: readonly Action[]; own?: readonly Action[] };

// Per role, per resource. Use the roles and resources the ConOps names, e.g. volunteers
// `shift: { any: ["read"] }, claim: { own: ["read", "create", "delete"] }`. No entry = no access.
const GRANTS: Record<string, Partial<Record<Resource, Grant>>> = {
  [ROLES.org]: {
    conversation: { any: ["read", "create", "update", "delete"] },
    attachment: { any: ["read", "delete"], own: ["create", "update"] },
    role: { any: ["update"] }, // change any other account's role (6.8)
  },
  [ROLES.default]: {
    conversation: { own: ["read", "create", "update", "delete"] },
    attachment: { own: ["read", "create", "update", "delete"] },
  },
};

export function can(actor: Actor, action: Action, resource: Resource, record?: { userId: string }) {
  const grant = GRANTS[actor.role]?.[resource];
  if (grant?.any?.includes(action)) return true;                  // permitted role
  if (!record || record.userId !== actor.id) return false;
  return grant?.own?.includes(action) ?? false;                   // owner
}
```

Every route that reads, creates or changes a record calls `can()` with its resource (6.4–6.6, 6.8).
A create passes the row it is about to insert — `can(actor, "create", resource, { userId: actor.id })`
— before the insert, and a refusal is 403 (no record exists to hide). Without a record, `can()`
answers "every record?", which a list query uses to choose between all rows and the actor's own
before passing each row through the same rule (6.6 `GET /`). Pure TS, so the web app may import it
to hide controls — the server check is still the one that counts.

**Derived data from rows the actor cannot read.** When a screen needs a number built from other
people's records — `claimedCount` or `openSpots` on a shift whose claims are `own` only — the server
computes it as a field on the parent record the actor may read. It never returns the other rows or
anyone's identity, and the list query carries it:

```ts
// Example, not a skeleton file — volunteers: shift { any: ["read"] }, claim { own: [...] }
import { count, eq } from "drizzle-orm";

if (!can(actor, "read", "shift")) return c.json({ error: "forbidden" }, 403);
const rows = await db
  .select({ id: shifts.id, title: shifts.title, capacity: shifts.capacity, claimedCount: count(claims.id) })
  .from(shifts)
  .leftJoin(claims, eq(claims.shiftId, shifts.id))
  .groupBy(shifts.id);
return c.json(rows.map((row) => ({ ...row, openSpots: row.capacity - row.claimedCount })));
```

The actor's own claims come from the claims list, filtered by `can()` as usual. A claim change
publishes `{ key: ["shifts"] }` and `{ key: ["claims"] }` (5.6) — keys only, so another volunteer's
open count updates live without learning who claimed.

### 5.6 `packages/core/src/events.ts` — in-process pub/sub

```ts
// A TanStack Query key to invalidate. Never record data or identities: the client refetches through can().
type ChangeEvent = { key: string[] };
type Listener = (event: ChangeEvent) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publish(event: ChangeEvent) {
  for (const listener of listeners) listener(event);
}
```

Fan-out is in memory, so it reaches only connections on this process. More than one container
needs a shared bus (12).

---

## 6. API (Hono on Bun)

### 6.1 `apps/api/src/app.ts`

```ts
import "./logger"; // keep first: the startup line (6.2) precedes auth and the database opening
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import { pinoLogger } from "hono-pino";
import { auth } from "./auth";
import { logger } from "./logger";
import { conversations } from "./routes/conversations";
import { messages } from "./routes/messages";
import { events } from "./routes/events";
import { attachments } from "./routes/attachments";
import { users } from "./routes/users";
import { ROLES } from "@core/access";
import { APP_NAME, APP_VERSION } from "@core/app";
import { env } from "@core/env";

export type Variables = { userId: string; role: string };

export function createApp() {
  const app = new Hono<{ Variables: Variables }>();

  app.use(pinoLogger({ pino: logger }));
  app.use(secureHeaders());
  app.use("/api/*", cors({ origin: env.APP_URL, credentials: true }));

  // Better Auth, mounted at its basePath "/auth" (6.3). Outside /api, so the session gate never sees it.
  app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/version", (c) => c.json({ name: APP_NAME, version: APP_VERSION }));

  const api = app
    .basePath("/api")
    .use(async (c, next) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) return c.json({ error: "unauthorized" }, 401);
      c.set("userId", session.user.id);
      c.set("role", session.user.role ?? ROLES.default);
      await next();
    })
    .route("/conversations", conversations)
    .route("/messages", messages)
    .route("/events", events)
    .route("/attachments", attachments)
    .route("/users", users);

  // Static SPA with history fallback (prod only; Vite serves in dev)
  app.use("/*", serveStatic({ root: "./apps/web/dist" }));
  app.get("/*", serveStatic({ root: "./apps/web/dist", path: "index.html" }));

  return { app, api };
}

export type AppType = ReturnType<typeof createApp>["api"];
```

`/healthz` and `/version` sit outside `/api`, so neither needs a session — the container
healthcheck and the Version-exposure TOR both call them signed out. The session middleware is
registered on the `/api` base path only, so `/auth/*` (sign-in, sign-up, provider callbacks) is
never gated.

### 6.2 `apps/api/src/logger.ts` and `apps/api/src/index.ts`

```ts
// logger.ts — the one logger; hono-pino (6.1) reuses it for request logs
import pino from "pino";
import { APP_NAME, APP_VERSION } from "@core/app";
import { env } from "@core/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "password", "token", "secret", "authorization", "cookie", "apiKey", "api_key",
      "*.password", "*.token", "*.secret", "*.authorization", "*.cookie", "*.apiKey", "*.api_key",
      "req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]',
    ],
    censor: "[redacted]",
  },
});

// Emitted at module init. index.ts and app.ts import this module first, so nothing logs before it.
logger.info(`${APP_NAME} v${APP_VERSION} starting`);
```

```ts
// index.ts
import "./logger"; // must stay the first import — see logger.ts
import { env } from "@core/env";
import { createApp } from "./app";
import { logger } from "./logger";

const { app } = createApp();

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
  idleTimeout: 120,          // seconds (max 255); SSE streams send a heartbeat every 15 s (6.7)
});

logger.info(`listening on http://localhost:${server.port}`);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { server.stop(); process.exit(0); });
}
```

The bare `import "./logger"` is a side-effect import, which import sorting leaves in place.
Pino writes one JSON object per line, so the first stdout line is:

```json
{"level":30,"time":1757923200000,"pid":1,"hostname":"…","msg":"my-app v0.1.0 starting"}
```

A test parses the first line and asserts `level === 30` and `msg === \`${name} v${version} starting\``.
It is emitted at `info`, so `LOG_LEVEL=warn` or `error` suppresses it.

### 6.3 `apps/api/src/db.ts` and `apps/api/src/auth.ts`

```ts
// db.ts — the one database handle, shared by auth, routes and tests
import { createDb } from "@core/db/client";

export const { db } = createDb();
```

```ts
// auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { ROLES } from "@core/access";
import * as schema from "@core/db/schema";
import { env } from "@core/env";
import { db } from "./db";
import { sendMail } from "./mail";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  basePath: "/auth",         // default is /api/auth; must match the mount (6.1) and the Vite proxy (4.4)
  secret: env.BETTER_AUTH_SECRET,
  // Vite dev server sends Origin :5173 while APP_URL is :3000; trust it outside production only
  trustedOrigins: process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173"],
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: {
    enabled: true,
    // Anyone may sign up, so no session until the address is proven — otherwise a stranger
    // registers someone else's address and acts as them
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) =>
      sendMail({
        to: user.email,
        subject: "Reset your password",
        text: `Reset your password: ${url}\n\nIf you did not ask for this, ignore this email.`,
      }),
  },
  emailVerification: {
    // Sent on sign-up (follows requireEmailVerification); the link expires after 1 hour
    sendVerificationEmail: ({ user, url }) =>
      sendMail({
        to: user.email,
        subject: "Verify your email",
        text: `Verify your email: ${url}\n\nIf you did not sign up, ignore this email.`,
      }),
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: ROLES.default, input: false },
    },
  },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
});
```

`input: false` stops a client from choosing its own role at sign-up or through
`authClient.updateUser`. Roles change only through 6.8; with the cookie cache, a change reaches
existing sessions within 5 minutes. An unverified account's sign-in is refused with
`EMAIL_NOT_VERIFIED` (403), so it never reaches `/api`. Sign-up answers the same for a new and an
existing address, so it does not reveal who has an account.

```ts
// apps/api/src/mail.ts — the one email sender
import { env } from "@core/env";
import { logger } from "./logger";

type Mail = { to: string; subject: string; text: string };

// Log mode only: recent messages, so tests follow a link without a mail provider (9)
export const outbox: Mail[] = [];

export async function sendMail(mail: Mail) {
  if (env.EMAIL_DELIVERY === "log") {
    outbox.push(mail);
    if (outbox.length > 100) outbox.shift();
    logger.info({ mailTo: mail.to, subject: mail.subject, body: mail.text }, "email not sent (EMAIL_DELIVERY=log)");
    return;
  }
  // Resend's HTTP API; another provider replaces this one request
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) throw new Error(`email send failed: ${res.status}`);
}
```

The web client uses the same path:

```ts
// apps/web/src/auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ baseURL: `${window.location.origin}/auth` });

// Plain words for Better Auth error codes. A sign-in form reads `error.code` from
// authClient.signIn.email(…); a provider callback reloads the page with `?error=<code>`.
const SIGN_IN_ERRORS: Record<string, string> = {
  EMAIL_NOT_VERIFIED: "Confirm your email first — open the link we sent when you signed up.",
};

export function signInErrorMessage(code: string | null | undefined) {
  if (!code) return null;
  return SIGN_IN_ERRORS[code] ?? "Sign-in failed. Please try again.";
}
```

**Named identity provider — only when the project records a named, approved provider.** Add the
recorded provider's entries to `betterAuth({ … })` — the `user` block below replaces the one above,
adding `hostedDomain`; rerun the Better Auth CLI (5.2) — and its lines to 5.1 and 4.8:

```ts
// auth.ts — added imports and helper
import { and, eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import type { GoogleProfile } from "better-auth/social-providers";

// A Google-verified address outranks an unverified password sign-up for it. Better Auth refuses to
// link Google into an unverified row (account_not_linked), so that row would lock the real person
// out; deleting it (credential and sessions cascade) lets their Google sign-in create a fresh account.
export async function releaseUnverifiedEmail(email: string) {
  await db
    .delete(schema.user)
    .where(and(eq(schema.user.email, email.toLowerCase()), eq(schema.user.emailVerified, false)));
}
```

```ts
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: ROLES.default, input: false },
      // Must accept input or mapProfileToUser's value is dropped; the update hook makes it read-only
      hostedDomain: { type: "string", required: false },
    },
  },
  socialProviders: {
    // A provider is on only when its credentials are set, so tests and compose run without them (5.1)
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            // Org-only: Better Auth rejects any token whose verified hd claim differs (5.1 requires the domain)
            ...(env.GOOGLE_AUDIENCE === "org-only" && env.GOOGLE_WORKSPACE_DOMAIN
              ? { hd: env.GOOGLE_WORKSPACE_DOMAIN }
              : {}),
            // Runs after the token exchange and hd check, before Better Auth looks the email up
            mapProfileToUser: async (profile: GoogleProfile) => {
              if (profile.email_verified) await releaseUnverifiedEmail(profile.email);
              return { hostedDomain: profile.email_verified ? profile.hd : undefined };
            },
          },
        }
      : {}),
    ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_TENANT_ID
      ? {
          microsoft: {
            clientId: env.MICROSOFT_CLIENT_ID,
            clientSecret: env.MICROSOFT_CLIENT_SECRET,
            tenantId: env.MICROSOFT_TENANT_ID,
          },
        }
      : {}),
  },
  // Same-email provider sign-in never attaches to an existing account (pre-account takeover);
  // a signed-in user adds a provider with authClient.linkSocial() (7.6), proving control of both.
  account: { accountLinking: { enabled: true, disableImplicitLinking: true } },
  databaseHooks: {
    user: {
      create: {
        // The org role comes only from Google's hd claim on the Google callback, never from request input
        before: async (user, ctx) => {
          const fromGoogle = ctx?.path?.startsWith("/callback/") && ctx.params?.id === "google";
          const domain = env.GOOGLE_WORKSPACE_DOMAIN?.toLowerCase();
          // An organization address (or a subdomain of it) registers only through Google.
          // Workspace secondary domains are not covered: add each one the organization uses.
          const email = user.email.toLowerCase();
          if (domain && !fromGoogle && (email.endsWith(`@${domain}`) || email.endsWith(`.${domain}`))) {
            throw new APIError("BAD_REQUEST", {
              code: "USE_GOOGLE_SIGN_IN",
              message: `${domain} addresses sign in with Google.`,
            });
          }
          const inOrg = Boolean(fromGoogle && domain && user.hostedDomain === domain);
          return {
            data: {
              ...user,
              role: inOrg ? ROLES.org : ROLES.default,
              hostedDomain: fromGoogle ? user.hostedDomain : undefined,
            },
          };
        },
      },
      update: {
        // role and hostedDomain are never written after creation through Better Auth (e.g.
        // authClient.updateUser); the adapter skips undefined keys. Role changes go through 6.8.
        before: async (user) => ({ data: { ...user, role: undefined, hostedDomain: undefined } }),
      },
    },
  },
```

The web client turns a refusal into plain words — the email form reads `error.code` from
`authClient.signUp.email(…)`; a provider callback reloads the page it started from with
`?error=<code>` (the client's default `errorCallbackURL`). Add to `SIGN_IN_ERRORS`:

```ts
// apps/web/src/auth-client.ts — added entries
  // Reached only by a verified account (an unverified one was released above), so its owner
  // proved this mailbox: they sign in the way they did before, or reset the password
  account_not_linked:
    "This email already has an account. Sign in with its password (or use Forgot password), then choose Link Google in Settings.",
  USE_GOOGLE_SIGN_IN: "Your organization address signs in with Google — use Continue with Google.",
```

```ts
// Sign-in screen: signInErrorMessage(new URLSearchParams(window.location.search).get("error"))
// Sign-up form:   signInErrorMessage((await authClient.signUp.email(input)).error?.code)
```

- **Only the recorded provider.** Microsoft alone: omit the Google entry, the added imports,
  `releaseUnverifiedEmail`, `hostedDomain`, `databaseHooks`, the two added `SIGN_IN_ERRORS` entries,
  the 7.6 Link Google line and the `GOOGLE_*` checks. Google alone: omit the Microsoft entry.
- **Two Google modes — recorded as `GOOGLE_AUDIENCE`** (5.1 crashes at boot if Google is on without
  it, or either mode lacks the domain). *Org-only*: `hd` is set, so Better Auth rejects any token whose
  verified `hd` claim differs; production also sets `emailAndPassword.disableSignUp:
  env.GOOGLE_AUDIENCE === "org-only" && process.env.NODE_ENV === "production"` so outsiders cannot
  register by password (Email delivery is then `N/A`, 2.1). *Mixed* (members of the organization plus outsiders on personal Google or
  email/password): no `hd`; everyone signs in, the hook grants the org role only to a verified `hd`
  equal to `GOOGLE_WORKSPACE_DOMAIN`, and refuses a non-Google sign-up at that domain or a subdomain.
  Outsiders' password accounts must verify their email first. Mixed needs
  the OAuth consent screen's user type set to **External**.
- **Unverified password account, then Google for the same address.** The unverified account never
  had a session. Google's verified sign-in deletes it (`releaseUnverifiedEmail`) and creates a new
  account; Better Auth's own gate would refuse to link Google into the unverified row anyway.
- **Org role is set at account creation.** An existing account that links Google later keeps its
  role until the org role changes it (6.8). `hostedDomain` is informational — no authorization
  decision reads it except the create hook; authorize on `role` only.
- **Callback URLs** to register with the provider: `<APP_URL>/auth/callback/google`,
  `<APP_URL>/auth/callback/microsoft`. Sign-in starts with
  `authClient.signIn.social({ provider: "google", callbackURL: window.location.origin })` — an
  absolute `callbackURL` returns to the page's own origin (:5173 in dev, trusted above); a relative
  one resolves against APP_URL, which serves no `dist` in dev.
- **Microsoft:** Entra omits the `email` claim for managed users unless the app registration adds
  it, and never verifies it — authorize on `role`, not the email.
- **Tests never drive the real provider.** API and E2E tests sign in with email/password
  (`signInForTest`, 9) and never set provider variables; the provider round-trip is verified
  manually against the real tenant.

### 6.4 `apps/api/src/routes/attachments.ts`

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { can } from "@core/access";
import { db } from "../db";
import { attachments as table } from "@core/db/schema";
import { attachmentKey, presignUpload, presignDownload, objectExists, objectSize } from "@core/storage/s3";
import type { Variables } from "../app";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"];

export const attachments = new Hono<{ Variables: Variables }>()
  // 1. Client asks for an upload slot
  .post("/", zValidator("json", z.object({
    filename: z.string().min(1).max(255),
    contentType: z.enum(ALLOWED as [string, ...string[]]),
    size: z.number().int().positive().max(50 * 1024 * 1024),
  })), async (c) => {
    const actor = { id: c.get("userId"), role: c.get("role") };
    // The new row is the actor's own; 403, not 404: no record exists to hide
    if (!can(actor, "create", "attachment", { userId: actor.id })) return c.json({ error: "forbidden" }, 403);
    const body = c.req.valid("json");
    const id = crypto.randomUUID();
    const key = attachmentKey(actor.id, id, body.filename);

    await db.insert(table).values({
      id, userId: actor.id, key,
      filename: body.filename,
      contentType: body.contentType,
      size: body.size,
      status: "pending",
      createdAt: new Date(),
    });

    return c.json({ id, uploadUrl: presignUpload(key, body.contentType) });
  })

  // 2. Client confirms the PUT succeeded; server verifies against S3
  .post("/:id/complete", async (c) => {
    const actor = { id: c.get("userId"), role: c.get("role") };
    const id = c.req.param("id");
    const row = await db.query.attachments.findFirst({ where: eq(table.id, id) });
    if (!row || !can(actor, "update", "attachment", row)) return c.json({ error: "not found" }, 404);
    if (!(await objectExists(row.key))) return c.json({ error: "object missing" }, 400);

    const size = await objectSize(row.key);
    await db.update(table).set({ status: "uploaded", size }).where(eq(table.id, id));
    return c.json({ ok: true });
  })

  // 3. Download via short-lived presigned GET
  .get("/:id/url", async (c) => {
    const actor = { id: c.get("userId"), role: c.get("role") };
    const row = await db.query.attachments.findFirst({
      where: and(eq(table.id, c.req.param("id")), eq(table.status, "uploaded")),
    });
    if (!row || !can(actor, "read", "attachment", row)) return c.json({ error: "not found" }, 404);
    return c.json({ url: presignDownload(row.key) });
  });
```

### 6.5 `apps/api/src/routes/messages.ts` (per-request SSE streaming)

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { can } from "@core/access";
import { conversations } from "@core/db/schema";
import { generateReply } from "@core/services/assistant";
import { db } from "../db";
import type { Variables } from "../app";

export const messages = new Hono<{ Variables: Variables }>()
  .post("/stream", zValidator("json", z.object({
    conversationId: z.string(),
    content: z.string().min(1).max(32_000),
    attachmentIds: z.array(z.string()).max(10).default([]),
  })), async (c) => {
    const actor = { id: c.get("userId"), role: c.get("role") };
    const input = c.req.valid("json");
    const row = await db.query.conversations.findFirst({ where: eq(conversations.id, input.conversationId) });
    if (!row || !can(actor, "update", "conversation", row)) return c.json({ error: "not found" }, 404);

    return streamSSE(c, async (stream) => {
      for await (const chunk of generateReply(input, c.req.raw.signal)) {
        await stream.writeSSE({ event: "delta", data: JSON.stringify(chunk) });
      }
      await stream.writeSSE({ event: "done", data: "{}" });
    });
  });
```

`packages/core/src/services/assistant.ts` is the product's own service. The skeleton ships this
stub so the route compiles and streams; the model call replaces its body:

```ts
type ReplyInput = { conversationId: string; content: string; attachmentIds: string[] };

export async function* generateReply(input: ReplyInput, signal: AbortSignal) {
  for (const word of input.content.split(" ")) {
    signal.throwIfAborted(); // the real call passes `signal` to the model client instead
    yield { text: `${word} ` };
  }
}
```

One request, one streamed response — for long output such as model tokens. Pass
`c.req.raw.signal` into the model call so a closed tab cancels the upstream request. Only present
when the Per-request streaming row is kept (2.1); live updates use 6.7.

### 6.6 `apps/api/src/routes/conversations.ts` (access rule in use)

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { can } from "@core/access";
import { conversations as table } from "@core/db/schema";
import { publish } from "@core/events";
import { db } from "../db";
import type { Variables } from "../app";

export const conversations = new Hono<{ Variables: Variables }>()
  // List: SQL narrows to what the role may see, then every row passes the same rule
  .get("/", async (c) => {
    const actor = { id: c.get("userId"), role: c.get("role") };
    const rows = can(actor, "read", "conversation")
      ? await db.select().from(table)
      : await db.select().from(table).where(eq(table.userId, actor.id));
    return c.json(rows.filter((row) => can(actor, "read", "conversation", row)));
  })

  .patch("/:id", zValidator("json", z.object({ title: z.string().min(1).max(200) })), async (c) => {
    const actor = { id: c.get("userId"), role: c.get("role") };
    const row = await db.query.conversations.findFirst({ where: eq(table.id, c.req.param("id")) });
    if (!row || !can(actor, "update", "conversation", row)) return c.json({ error: "not found" }, 404); // 404: don't confirm it exists

    await db.update(table).set({ title: c.req.valid("json").title }).where(eq(table.id, row.id));
    publish({ key: ["conversations"] });   // live update for every open tab (6.7)
    return c.json({ ok: true });
  });
```

### 6.7 `apps/api/src/routes/events.ts` (broadcast SSE)

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { subscribe } from "@core/events";
import type { Variables } from "../app";

export const events = new Hono<{ Variables: Variables }>()
  .get("/", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = subscribe((event) => {
        void stream.writeSSE({ event: "change", data: JSON.stringify(event) });
      });
      stream.onAbort(unsubscribe);

      while (!stream.aborted) {
        await stream.writeSSE({ event: "ping", data: "" });   // heartbeat under the 120 s idleTimeout
        await stream.sleep(15_000);
      }
      unsubscribe();
    }),
  );
```

Signed-in only (it sits under `/api`). Events carry query keys, never record data, so a
subscriber learns only that something changed; the refetch goes through `can()`.

### 6.8 `apps/api/src/routes/users.ts` (role change)

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { can, ROLE_NAMES } from "@core/access";
import { user } from "@core/db/schema";
import { db } from "../db";
import type { Variables } from "../app";

export const users = new Hono<{ Variables: Variables }>()
  .patch("/:id/role", zValidator("json", z.object({ role: z.enum(ROLE_NAMES) })), async (c) => {
    const actor = { id: c.get("userId"), role: c.get("role") };
    if (!can(actor, "update", "role")) return c.json({ error: "forbidden" }, 403);
    const id = c.req.param("id");
    if (id === actor.id) return c.json({ error: "cannot change your own role" }, 400); // no self-lockout

    const [row] = await db
      .update(user)
      .set({ role: c.req.valid("json").role })
      .where(eq(user.id, id))
      .returning({ id: user.id });
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true });
  });
```

The only role writer after creation. Better Auth refuses role writes (`input: false`, plus the
provider's update hook, 6.3); this route writes through Drizzle, so neither applies. `z.enum(ROLE_NAMES)` refuses any name outside `ROLES` (5.5). The change
reaches the target's open sessions within the 5-minute cookie cache (6.3).

---

## 7. Frontend Wiring

### 7.1 `apps/web/src/api.ts`

```ts
import { hc } from "hono/client";
import type { AppType } from "@api/app";

export const api = hc<AppType>(window.location.origin, { init: { credentials: "include" } });
```

Type imports only, so the server code never lands in the browser bundle. `AppType` already carries
the `/api` base path (6.1), so the client takes the bare origin and calls read
`api.api.conversations.$get()`; passing `"/api"` would double the prefix. The origin is absolute so
`$url()` works.

### 7.2 `apps/web/src/components/app-footer.tsx`

The on-screen half of Version exposure — what a Playwright test asserts against. Mount it once in
the root route so every screen carries it.

```tsx
import { APP_NAME, APP_VERSION } from "@core/app";

export function AppFooter() {
  return (
    <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
      <span data-testid="app-version">{`${APP_NAME} v${APP_VERSION}`}</span>
    </footer>
  );
}
```

### 7.3 Upload hook

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@web/api";

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    async mutationFn(file: File) {
      const slot = await api.api.attachments.$post({
        json: { filename: file.name, contentType: file.type, size: file.size },
      }).then((r) => r.json());

      const put = await fetch(slot.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`upload failed: ${put.status}`);

      await api.api.attachments[":id"].complete.$post({ param: { id: slot.id } });
      return slot.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attachments"] }),
  });
}
```

### 7.4 Per-request SSE consumption

```ts
export async function* streamReply(body: unknown, signal: AbortSignal) {
  const res = await fetch("/api/messages/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
    signal,
  });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
      const data = frame.split("\n").find((l) => l.startsWith("data: "))?.slice(6);
      if (data) yield JSON.parse(data);
    }
  }
}
```

Use `fetch` rather than `EventSource` because the request is a POST with a body.

### 7.5 `apps/web/src/queries/live-updates.ts` (broadcast consumption)

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@web/api";

export function useLiveUpdates() {
  const qc = useQueryClient();
  useEffect(() => {
    const source = new EventSource(api.api.events.$url()); // same origin, so the session cookie is sent
    source.addEventListener("change", (e) => {
      const { key } = JSON.parse(e.data) as { key: string[] };
      void qc.invalidateQueries({ queryKey: key });
    });
    source.onopen = () => {
      void qc.invalidateQueries(); // first connect and every reconnect: catch up on missed events
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void qc.invalidateQueries();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      source.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [qc]);
}
```

Call it once in the signed-in layout. `EventSource` reconnects on its own after a network drop;
a 401 closes it for good, so it must not run while signed out.

### 7.6 Account screens — verification, password reset, linking Google

The calls the account screens make. Absolute URLs return to the page's own origin (:5173 in dev),
as in 6.3.

```ts
import { authClient } from "@web/auth-client";

// Sign-up form — the emailed verification link returns here; no session until it is opened
await authClient.signUp.email({ name, email, password, callbackURL: window.location.origin });

// Forgot-password screen — emails a link that lands on /reset-password?token=…
await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` });

// Reset-password screen — `?error=INVALID_TOKEN` instead of a token means the link expired
const token = new URLSearchParams(window.location.search).get("token");
if (token) await authClient.resetPassword({ token, newPassword });

// Settings screen, Google provider only — "Link Google" for the signed-in person. Google's
// verified email must equal the account's; a refusal returns with ?error=<code> (signInErrorMessage).
await authClient.linkSocial({ provider: "google", callbackURL: window.location.href });
```

---

## 8. Docker

### 8.1 `Dockerfile`

```dockerfile
# ---------- build ----------
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ---------- runtime ----------
FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/bun.lock ./
# Bun reads `paths` from tsconfig.json at runtime; without these, @core/* imports fail
COPY --from=build /app/tsconfig.json /app/tsconfig.base.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/drizzle ./drizzle

RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/healthz').then(r=>{if(!r.ok)process.exit(1)})"

CMD ["bun", "apps/api/src/index.ts"]
```

### 8.2 `docker-compose.yml` (local development and E2E)

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    environment:
      DATABASE_PATH: /data/app.db
      S3_ENDPOINT: http://minio:9000
      S3_FORCE_PATH_STYLE: "true"
    volumes:
      - appdata:/data
    depends_on:
      minio-init:
        condition: service_completed_successfully

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - miniodata:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      retries: 10

  minio-init:
    image: minio/mc
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 minioadmin minioadmin &&
      mc mb --ignore-existing local/attachments &&
      mc anonymous set none local/attachments &&
      mc admin config set local api cors_allow_origin='http://localhost:3000,http://localhost:5173' || true
      "

volumes:
  appdata:
  miniodata:
```

Browser uploads go straight to MinIO on `localhost:9000`, so the bucket needs CORS for the
app origins. On AWS, set the equivalent CORS rule on the bucket once.

**Presigned URL host mismatch:** the server signs with `http://minio:9000` (the compose hostname),
but the browser cannot resolve `minio`. Either add `127.0.0.1 minio` to `/etc/hosts` locally, or
set a separate `S3_PUBLIC_ENDPOINT=http://localhost:9000` and use a second `S3Client` for
presigning. The second option is cleaner and is what `presignUpload` should use.

---

## 9. Testing

| Scope | Runner | Notes |
|---|---|---|
| `core` services | `bun test`, `DATABASE_PATH=:memory:` | One in-memory DB for the whole run: `bun test` runs every file in one process and `@api/db` (6.3) opens once. Tests insert rows with random IDs and never assume an empty table. |
| API routes | `bun test` + `app.request()` | No port, no network. Sign in with `signInForTest` (`tests/setup/auth.ts`). |
| Access rule | `bun test` + `app.request()` | Per resource: owner allowed, non-owner 404, permitted role allowed, and list routes return only readable rows — for every record route. Every create route refuses a role without a create grant (403). |
| Role change | `bun test` + `app.request()` | `PATCH /api/users/:id/role`: every role but the org role gets 403; a name outside `ROLES` gets 400; the org role succeeds. |
| Unverified sign-up | `bun test` + `app.request()` | A password sign-up gets no session: sign-in is 403 `EMAIL_NOT_VERIFIED`, `/api` is 401. Google provider only: `releaseUnverifiedEmail` removes the row and its credential, so a Google sign-in for that address starts a fresh account. |
| Organization address squatting | `bun test` + `app.request()` (Google provider only) | Password sign-up at `GOOGLE_WORKSPACE_DOMAIN` or a subdomain is refused with `USE_GOOGLE_SIGN_IN`. |
| Live updates | `bun test` on `events.ts`; E2E with two browser contexts | A change in one context appears in the other without a reload. |
| S3 wrapper | `bun test` against MinIO from compose | Real client, real bucket. Skip with `test.skipIf(!process.env.MINIO_UP)` in CI without Docker. |
| React components | `bun test` + happy-dom + Testing Library | Preloaded via `bunfig.toml` on origin `http://localhost:3000`; `EventSource` is `FakeEventSource` — import it from `tests/setup/happy-dom.ts` and drive it with `FakeEventSource.instances[0]?.emit("change", …)` (4.2). |
| E2E | Playwright against `docker compose up` | Needs Docker running and a `.env` copied from `.env.example`. Exercises email/password auth (the verification link read from `docker compose logs app`, log mode), upload, streaming, live updates and the served SPA. |

### `tests/setup/auth.ts` — email/password sign-in for tests

```ts
import { eq } from "drizzle-orm";
import type { createApp } from "@api/app";
import { db } from "@api/db";
import { outbox } from "@api/mail";
import { ROLES } from "@core/access";
import { user } from "@core/db/schema";

type App = ReturnType<typeof createApp>["app"];

export async function post(app: App, path: string, body: object) {
  return app.request(path, {
    method: "POST",
    // Origin must match APP_URL (tests/setup/env.ts) or Better Auth rejects the request
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

async function postOk(app: App, path: string, body: object) {
  const res = await post(app, path, body);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res;
}

// Log-mode email (EMAIL_DELIVERY=log): the newest link sent to this address
export function lastLinkTo(email: string) {
  return outbox.filter((m) => m.to === email).at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
}

export async function signInForTest(app: App, role: string = ROLES.default) {
  const email = `test-${crypto.randomUUID()}@example.com`;
  const password = "test-password-123";
  await postOk(app, "/auth/sign-up/email", { email, password, name: "Test User" });
  const link = lastLinkTo(email);
  if (!link) throw new Error("verification email missing");
  await app.request(link); // opens /auth/verify-email?token=…, as the person would
  await db.update(user).set({ role }).where(eq(user.email, email)); // before sign-in: cookie cache holds the role
  const res = await postOk(app, "/auth/sign-in/email", { email, password });

  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!row) throw new Error("test user missing");
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { cookie, userId: row.id };
}
```

E2E signs in the same way — sign up, open the verification link from `docker compose logs app`,
then the sign-in screen or `request.post("/auth/sign-in/email")` — never through a real identity
provider.

### API test example

```ts
import { test, expect, beforeAll } from "bun:test";
import { createApp } from "@api/app";
import { db } from "@api/db";
import { ROLES } from "@core/access";
import { conversations } from "@core/db/schema";
import { signInForTest } from "../setup/auth";

let app: ReturnType<typeof createApp>["app"];

beforeAll(() => {
  ({ app } = createApp());
});

const json = (cookie: string, method: string, body: object) => ({
  method,
  headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify(body),
});

test("the default role lists and renames only its own conversations; the org role any", async () => {
  const owner = await signInForTest(app);
  const other = await signInForTest(app);
  const admin = await signInForTest(app, ROLES.org);
  const id = crypto.randomUUID(); // the DB is shared across test files
  await db.insert(conversations).values({ id, userId: owner.userId, title: "mine", createdAt: new Date() });

  const listIds = async (cookie: string) => {
    const res = await app.request("/api/conversations", { headers: { cookie } });
    return ((await res.json()) as { id: string }[]).map((row) => row.id);
  };
  expect(await listIds(owner.cookie)).toContain(id);
  expect(await listIds(other.cookie)).not.toContain(id);
  expect(await listIds(admin.cookie)).toContain(id);

  const rename = (cookie: string) =>
    app.request(`/api/conversations/${id}`, json(cookie, "PATCH", { title: "renamed" }));
  expect((await rename(other.cookie)).status).toBe(404);
  expect((await rename(owner.cookie)).status).toBe(200);
  expect((await rename(admin.cookie)).status).toBe(200);
});

const slot = { filename: "a.png", contentType: "image/png", size: 1234 };

test("requests an upload slot", async () => {
  const { cookie } = await signInForTest(app);
  const res = await app.request("/api/attachments", json(cookie, "POST", slot));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { uploadUrl: string };
  expect(body.uploadUrl).toContain("X-Amz-Signature");
});

test("a role without a create grant cannot create", async () => {
  const { cookie } = await signInForTest(app, "no-grants"); // not a key in GRANTS (5.5)
  expect((await app.request("/api/attachments", json(cookie, "POST", slot))).status).toBe(403);
});

test("only the org role changes another account's role", async () => {
  const target = await signInForTest(app);
  const member = await signInForTest(app);
  const admin = await signInForTest(app, ROLES.org);
  const setRole = (cookie: string, role: string) =>
    app.request(`/api/users/${target.userId}/role`, json(cookie, "PATCH", { role }));
  expect((await setRole(member.cookie, ROLES.org)).status).toBe(403);
  expect((await setRole(admin.cookie, "not-a-role")).status).toBe(400);
  expect((await setRole(admin.cookie, ROLES.org)).status).toBe(200);
});

test("an unverified password account gets no session", async () => {
  // Someone registers an address they cannot open mail for
  const body = { email: `squatter-${crypto.randomUUID()}@example.com`, password: "test-password-123", name: "Squatter" };
  const signUp = await post(app, "/auth/sign-up/email", body);
  expect(((await signUp.json()) as { token: string | null }).token).toBeNull();

  const signIn = await post(app, "/auth/sign-in/email", body);
  expect(signIn.status).toBe(403);
  expect(((await signIn.json()) as { code?: string }).code).toBe("EMAIL_NOT_VERIFIED");
  const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  expect((await app.request("/api/conversations", { headers: { cookie } })).status).toBe(401);
});
```

The test file imports `post` alongside `signInForTest`. Google provider only — needs the
`GOOGLE_WORKSPACE_DOMAIN` test line (4.2); imports `releaseUnverifiedEmail` from `@api/auth`,
`eq` from `drizzle-orm`, and `account`, `user` from `@core/db/schema`:

```ts
test("Google for the same address does not inherit an unverified password account", async () => {
  const body = { email: `squatter-${crypto.randomUUID()}@example.com`, password: "test-password-123", name: "Squatter" };
  await post(app, "/auth/sign-up/email", body);
  const [squatter] = await db.select().from(user).where(eq(user.email, body.email));
  if (!squatter) throw new Error("squatter row missing");

  await releaseUnverifiedEmail(body.email); // what Google's verified callback runs (6.3)
  expect(await db.select().from(user).where(eq(user.id, squatter.id))).toEqual([]);
  expect(await db.select().from(account).where(eq(account.userId, squatter.id))).toEqual([]);
  expect((await post(app, "/auth/sign-in/email", body)).status).toBe(401); // the password is gone too
});

test("an organization address cannot register by password", async () => {
  for (const host of ["workspace.test", "mail.workspace.test"]) {
    const res = await post(app, "/auth/sign-up/email", {
      email: `squatter-${crypto.randomUUID()}@${host}`,
      password: "test-password-123",
      name: "Squatter",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code?: string }).code).toBe("USE_GOOGLE_SIGN_IN");
  }
});
```

### `playwright.config.ts`

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",      // otherwise Playwright also collects the bun:test files
  webServer: { command: "docker compose up --build", url: "http://localhost:3000/healthz", timeout: 180_000, reuseExistingServer: true },
  use: { baseURL: "http://localhost:3000" },
});
```

`webServer` starts the compose stack, so Docker must be running and `.env` must exist
(`cp .env.example .env`) — compose reads it through `env_file`.

---

## 10. Daily Commands

```bash
cp .env.example .env
bun install
docker compose up -d minio minio-init   # local S3 only
bun run dev                              # api on :3000 (--hot), web on :5173 with proxy
bun run dev:api:pretty                   # api alone, human-readable logs
bun run db:generate                      # after schema changes; commit drizzle/*.sql
bun run check                            # typecheck + lint + deadcode + tests
bun run compose:up                       # full stack as it runs in prod
bun run test:e2e                         # needs Docker running and .env
bunx shadcn@latest add button dialog
```

---

## 11. Additional Considerations

Each of these is already handled by the configuration above.

| Consideration | What happens | Applied fix |
|---|---|---|
| Env misconfiguration | Missing secret or bucket surfaces as a runtime 500. | Zod-validated `env.ts` crashes at boot (5.1). |
| Version not observable | Nobody can tell which build is deployed. | `package.json#name`/`#version` read once (5.0), served at `/version` (6.1), in the footer (7.2), on the first log line (6.2). |
| Startup line not first | Auth or database init logs before the version line. | `logger.ts` emits it at module init and is the first import of `index.ts` and `app.ts` (6.1, 6.2). |
| Secrets in logs | Passwords, tokens or cookies written to stdout. | Pino `redact` on known-sensitive keys and headers (6.2). |
| Test runners collecting each other's files | `bun test` loads Playwright specs; Playwright loads `bun:test` files. | `check` calls `bun run test` (4.1); Playwright `testDir: "tests/e2e"` (9). |
| Path aliases fail in the container | `@core/*` imports cannot resolve at runtime. | Both tsconfig files copied into the runtime image (4.3, 8.1). |
| SQLite on an ephemeral filesystem | Data lost on redeploy. | `/data` declared as a volume; mount persistent storage in prod (8.1). |
| SQLite write contention | `SQLITE_BUSY` under concurrent writes. | WAL + `busy_timeout = 5000` (5.3). Single process keeps this rare. |
| Foreign keys off | Cascades silently no-op. | `foreign_keys = ON` on every connection (5.3). |
| No backup story | Volume corruption or host loss destroys everything. | Litestream or scheduled `.backup` to the bucket; `sqlite3 .backup` to a backup volume when Object storage is N/A (2, 2.1). |
| Bulk uploads through the app | Server memory and bandwidth become the bottleneck. | Presigned PUT/GET, server handles metadata only (5.4, 6.4). |
| Trusting client-reported size | Client lies about `size`, quota bypass. | `complete` step verifies with `s3.stat` (6.4). |
| Orphaned S3 objects | Client gets a slot but never PUTs. | `status: pending` rows; a cron deletes pending rows and objects older than 24 h. |
| Presigned URL host mismatch locally | Browser cannot reach `minio:9000`. | `S3_PUBLIC_ENDPOINT` with a separate presigning client (8.2). |
| Missing CORS on bucket | Browser PUT to S3 blocked. | `mc admin config set ... cors_allow_origin` locally; bucket CORS rule in AWS (8.2). |
| Unsafe object keys | Path traversal or collisions from user filenames. | Sanitized key under `users/<id>/attachments/<uuid>/` (5.4). |
| Content type allowlist | Executable or HTML uploads served from your origin. | Zod enum of allowed MIME types; bucket is private (6.4). |
| Provider secrets required everywhere | Tests and compose crash without Google or Microsoft credentials. | Provider variables optional (5.1); each provider on only when its credentials are set (6.3). |
| SSE dropped by idle timeout | Streams cut off after 120 s of silence. | `idleTimeout: 120` on `Bun.serve` (6.2); `ping` event every 15 s on the Live updates stream (6.7); Per-request streams with long gaps send the same. |
| Abandoned streams waste model calls | Closed tab keeps upstream generation running. | Propagate `c.req.raw.signal` (6.5). |
| Live updates on one process | Fan-out is in memory; a second container's clients miss events. | Single container by design (1); shared bus in the Growth Path (12). |
| SPA deep links 404 | Refresh on `/c/123` hits Hono, not React. | `serveStatic` fallback to `index.html` after API routes (6.1). |
| Server code leaking to browser | Importing `AppType` pulls in Hono routes. | `import type` only in `api.ts`; Vite tree-shakes types (7.1). |
| Doubled `/api` prefix | `hc<AppType>("/api")` calls `/api/api/…`. | Client built on the origin; calls go through `api.api.*` (7.1). |
| Auth path mismatch | Better Auth defaults to `/api/auth`; the mount and proxy use `/auth`. | `basePath: "/auth"` (6.3) matches the mount (6.1), proxy (4.4) and client. |
| Access rule bypass | A route returns or changes a record for anyone signed in. | Every record route calls `can()` with its resource; list rows pass the same rule; non-owners get 404 (5.5, 6.4–6.6, 9). |
| Create skips the access rule | A role with no create grant creates records. | `can(actor, "create", resource, { userId: actor.id })` before every insert, 403 on refusal; tested (5.5, 6.4, 9). |
| Derived data leaks other people's rows | A live availability count is built by sending every claim to the client, or `can()` is skipped. | Counts computed server-side as fields on the readable parent record; events carry keys only (5.5, 5.6). |
| No role change path | A linked or mis-assigned account keeps the wrong role forever, or anyone can change roles. | `PATCH /api/users/:id/role`: `can(actor, "update", "role")`, Zod enum of `ROLE_NAMES`, no self-change; tested (5.5, 6.8, 9). |
| Role names scattered | Renaming a role misses a copy and silently drops a grant. | One `ROLES` constant in `access.ts`, imported everywhere (5.5). |
| Account takeover through provider linking | An attacker registers the victim's address by password first: the victim's Google sign-in either merges into it or is locked out (`account_not_linked`), and the attacker acts as them. | `requireEmailVerification`: an unverified account gets no session. A Google-verified sign-in deletes the unverified row (`releaseUnverifiedEmail`) and starts a fresh account; `disableImplicitLinking`, no `trustedProviders`; linking only via signed-in `linkSocial()`; tested (6.3, 7.6, 9). |
| Email never delivered | Verification and reset links vanish, so nobody can finish signing up. | `EMAIL_DELIVERY` defaults to `api` and `superRefine` requires `EMAIL_API_KEY` at boot; `log` only where set explicitly (4.8, 5.1, 6.3). |
| Organization address squatting | Someone registers a Workspace address by password first, locking the real person out (`account_not_linked`) and posing as them. | Create hook refuses non-Google sign-ups at `GOOGLE_WORKSPACE_DOMAIN` or a subdomain with `USE_GOOGLE_SIGN_IN`; the client shows plain words; tested (6.3, 9). |
| Org role from user input | A sign-up body or outside Google account claims the organization's role. | Role set in `databaseHooks.user.create.before` from Google's `hd` claim on the Google callback only; `role` is `input: false` (6.3). |
| Org-only admits any Google account | Google on without a mode, or org-only without a domain, sets no `hd`; mixed without a domain grants nobody the org role and skips the squatting check. | `GOOGLE_AUDIENCE` plus `superRefine` (domain required whenever a mode is set) crash at boot; `hd` read from it (5.1, 6.3). |
| Provider-written fields editable | `authClient.updateUser` rewrites `hostedDomain` or `role`. | `databaseHooks.user.update.before` strips both; no authorization reads `hostedDomain` except the create hook (6.3). |
| Component tests without an origin | happy-dom's `about:blank` origin is `"null"`, so `hc()`/`$url()` throw; `EventSource` is missing. | Registered with `url: "http://localhost:3000"`; `FakeEventSource` stub (4.2). |
| Post-login blank page in dev | OAuth returns to APP_URL :3000, which serves no `dist` in dev. | `signIn.social({ callbackURL: window.location.origin })`, :5173 trusted outside production (6.3). |
| Auth tables drift | Better Auth schema out of sync with Drizzle. | Regenerate with the Better Auth CLI, then `drizzle-kit generate` (5.2). |
| Session cookie cross-origin in dev | Vite on 5173, API on 3000. | Vite proxy for `/api` and `/auth` so cookies are same-origin (4.4). |
| Container runs as root | Larger blast radius on compromise. | `USER bun`, `/data` chowned (8.1). |
| Docker build cache misses | Every code change reinstalls deps. | Lockfile and workspace manifests copied before source (8.1). |
| Logs unreadable locally | JSON logs in a terminal. | `bun run dev:api:pretty` (4.1). |
| Lint noise from generated files | shadcn and route tree churn. | Excluded in Biome and Knip (4.5, 4.6). |

---

## 12. Growth Path

When a single container stops being enough, change one layer at a time:

| Trigger | Change | Effort |
|---|---|---|
| Need horizontal scaling or zero-downtime deploys | Swap `bun:sqlite` for Postgres via `drizzle-orm/bun-sql` (Bun's native Postgres client). Schema stays; regenerate migrations. | Medium |
| Live updates across more than one container | Back `events.ts` with a shared bus (Postgres `LISTEN/NOTIFY` or Redis pub/sub); keep the `subscribe`/`publish` signatures. | Small |
| Attachment processing (thumbnails, PDF text) | Add a Bun worker process or a queue table polled by a second container. | Small |
| Multiple regions | Move to R2 or Tigris for storage; Postgres with a managed provider. | Medium |
| Realtime beyond SSE | `Bun.serve` WebSocket support with Hono's `upgradeWebSocket`. | Small |

---

## 13. Alternatives Considered

| Option | Verdict |
|---|---|
| Next.js / Remix / TanStack Start | Full-stack frameworks add a build and hosting model you do not need for a single container. Pick one only if you want SSR for SEO. |
| tRPC instead of Hono RPC | Equivalent type safety. Hono RPC has fewer moving parts and no separate router runtime. |
| Postgres from day one | Correct if you already know you need multiple containers. Otherwise SQLite in WAL mode on a volume is simpler and fast. |
| AWS SDK v3 instead of `Bun.S3Client` | Needed only for features Bun lacks, such as multipart lifecycle rules or bucket administration. Bun's client covers presign, put, get, stat, delete, and streaming. |
| LocalStack instead of MinIO | Heavier, slower start. MinIO is enough for S3 semantics. |
| Vitest | Fine, but a second test runner. `bun test` covers unit, API and component tests. |
| Lucia / Auth.js | Lucia is deprecated as a library; Auth.js is Next-centric. Better Auth is framework-agnostic with a Drizzle adapter. |
