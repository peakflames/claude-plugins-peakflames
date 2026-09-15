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
>    then builds the walking skeleton from Sections 3 and 4.
> 2. **A layer checklist for any project** — the Stack Summary table names every layer an
>    application of this shape has to handle (runtime, build, UI, state, routing, data,
>    migrations, tests, lint, packaging, config, secrets, storage). Use it to notice a layer
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
| API style | Hono RPC (`hono/client`) + Zod validators | End-to-end types with zero codegen. SSE for token streaming. |
| Auth | Better Auth | Bun-native, Drizzle adapter, email/password + OAuth, sessions in SQLite. |
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
| Unit tests | `bun test` | Native, Jest-compatible API. |
| API tests | `bun test` + `app.request()` | Hono apps are testable in-process without a port. |
| Component tests | `bun test` + happy-dom + Testing Library | One test runner for everything. |
| E2E | Playwright | Runs against `docker compose up` for full-fidelity tests. |
| Lint + format | Biome 2 | One tool, one config. |
| Type-level lint | `tsc --noEmit` with unused checks | Catches what linters miss. |
| Dead code | Knip | Unused files, exports, types and dependencies. |
| Container | Multi-stage `oven/bun` image | Build frontend + server, ship a slim runtime image. |
| Backups | Litestream sidecar or cron `sqlite3 .backup` to S3 | Continuous SQLite replication to the same bucket provider. |
| Logging | Pino via `hono-pino`, JSON to stdout | Container-native; let the platform collect logs. |

---

## 3. Repository Layout

```
my-app/
├── package.json
├── bunfig.toml
├── biome.json
├── knip.json
├── tsconfig.base.json
├── drizzle.config.ts
├── drizzle/                       # generated SQL migrations (committed)
├── Dockerfile
├── docker-compose.yml             # app + minio for local
├── .env.example
├── packages/
│   └── core/
│       └── src/
│           ├── env.ts             # Zod-validated process.env
│           ├── db/
│           │   ├── schema.ts
│           │   ├── client.ts      # bun:sqlite + drizzle + migrate
│           │   └── index.ts
│           ├── storage/
│           │   └── s3.ts          # Bun.S3Client wrapper
│           ├── services/          # business logic, no HTTP
│           └── contracts/         # Zod schemas shared by API + web
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── index.ts           # Bun.serve entry
│   │       ├── app.ts             # Hono app (exported for tests)
│   │       ├── auth.ts            # Better Auth instance
│   │       ├── routes/
│   │       │   ├── conversations.ts
│   │       │   ├── messages.ts    # SSE streaming
│   │       │   └── attachments.ts # presigned URLs
│   │       └── middleware/
│   └── web/
│       ├── index.html
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx
│           ├── router.tsx
│           ├── api.ts             # hc<AppType> client
│           ├── components/ui/     # shadcn
│           ├── stores/
│           └── queries/
└── tests/
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
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev": "bun run --filter '*' dev",
    "dev:api": "bun --hot apps/api/src/index.ts",
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
    "check": "bun run typecheck && bun run lint && bun run deadcode && bun test",
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
    "@biomejs/biome": "^2",
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

### 4.2 `bunfig.toml`

```toml
[test]
preload = ["./tests/setup/happy-dom.ts", "./tests/setup/env.ts"]
```

`tests/setup/happy-dom.ts`:

```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
```

`tests/setup/env.ts`:

```ts
process.env.DATABASE_PATH ??= ":memory:";
process.env.S3_BUCKET ??= "test-bucket";
process.env.S3_ENDPOINT ??= "http://localhost:9000";
process.env.S3_ACCESS_KEY_ID ??= "minioadmin";
process.env.S3_SECRET_ACCESS_KEY ??= "minioadmin";
process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-characters-long";
process.env.APP_URL ??= "http://localhost:3000";
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
      "@api/*": ["./apps/api/src/*"],
      "@web/*": ["./apps/web/src/*"]
    }
  }
}
```

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
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignore": ["dist", "drizzle", "apps/web/src/components/ui", "apps/web/src/routeTree.gen.ts"] },
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
    "apps/api/src/index.ts",
    "apps/web/src/main.tsx",
    "apps/web/src/routes/**/*.tsx",
    "tests/**/*.test.ts?(x)",
    "tests/e2e/**/*.spec.ts"
  ],
  "project": ["apps/**/*.{ts,tsx}", "packages/**/*.ts"],
  "ignore": ["apps/web/src/components/ui/**", "apps/web/src/routeTree.gen.ts"]
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

# Database (file path inside the container volume)
DATABASE_PATH=/data/app.db

# Auth
BETTER_AUTH_SECRET=change-me-to-a-random-32-plus-character-string

# S3 (local: MinIO; prod: leave S3_ENDPOINT empty for AWS)
S3_BUCKET=attachments
S3_REGION=us-east-1
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

---

## 5. Core Package

### 5.1 `packages/core/src/env.ts`

```ts
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_PATH: z.string().default("/data/app.db"),
  BETTER_AUTH_SECRET: z.string().min(32),
  S3_BUCKET: z.string(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
```

Fail fast at boot. A bad env var should crash the container, not surface as a 500 an hour later.

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

Better Auth generates its own `user`, `session`, `account` and `verification` tables. Run
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

---

## 6. API (Hono on Bun)

### 6.1 `apps/api/src/app.ts`

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "hono/bun";
import { pinoLogger } from "hono-pino";
import { auth } from "./auth";
import { conversations } from "./routes/conversations";
import { messages } from "./routes/messages";
import { attachments } from "./routes/attachments";
import { env } from "@core/env";

export type Variables = { userId: string };

export function createApp() {
  const app = new Hono<{ Variables: Variables }>();

  app.use(pinoLogger());
  app.use(secureHeaders());
  app.use("/api/*", cors({ origin: env.APP_URL, credentials: true }));

  app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

  app.get("/healthz", (c) => c.json({ ok: true }));

  const api = app
    .basePath("/api")
    .use(async (c, next) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) return c.json({ error: "unauthorized" }, 401);
      c.set("userId", session.user.id);
      await next();
    })
    .route("/conversations", conversations)
    .route("/messages", messages)
    .route("/attachments", attachments);

  // Static SPA with history fallback (prod only; Vite serves in dev)
  app.use("/*", serveStatic({ root: "./apps/web/dist" }));
  app.get("/*", serveStatic({ root: "./apps/web/dist", path: "index.html" }));

  return { app, api };
}

export type AppType = ReturnType<typeof createApp>["api"];
```

### 6.2 `apps/api/src/index.ts`

```ts
import { createApp } from "./app";
import { env } from "@core/env";

const { app } = createApp();

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
  idleTimeout: 120,          // long enough for SSE streams
});

console.log(`listening on http://localhost:${server.port}`);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { server.stop(); process.exit(0); });
}
```

### 6.3 `apps/api/src/auth.ts`

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDb } from "@core/db/client";
import * as schema from "@core/db/schema";
import { env } from "@core/env";

export const { db } = createDb();

export const auth = betterAuth({
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: { enabled: true },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
});
```

### 6.4 `apps/api/src/routes/attachments.ts`

```ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../auth";
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
    const userId = c.get("userId");
    const body = c.req.valid("json");
    const id = crypto.randomUUID();
    const key = attachmentKey(userId, id, body.filename);

    await db.insert(table).values({
      id, userId, key,
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
    const userId = c.get("userId");
    const id = c.req.param("id");
    const row = await db.query.attachments.findFirst({
      where: and(eq(table.id, id), eq(table.userId, userId)),
    });
    if (!row) return c.json({ error: "not found" }, 404);
    if (!(await objectExists(row.key))) return c.json({ error: "object missing" }, 400);

    const size = await objectSize(row.key);
    await db.update(table).set({ status: "uploaded", size }).where(eq(table.id, id));
    return c.json({ ok: true });
  })

  // 3. Download via short-lived presigned GET
  .get("/:id/url", async (c) => {
    const userId = c.get("userId");
    const row = await db.query.attachments.findFirst({
      where: and(eq(table.id, c.req.param("id")), eq(table.userId, userId), eq(table.status, "uploaded")),
    });
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ url: presignDownload(row.key) });
  });
```

### 6.5 `apps/api/src/routes/messages.ts` (SSE streaming)

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Variables } from "../app";
import { generateReply } from "@core/services/assistant";

export const messages = new Hono<{ Variables: Variables }>()
  .post("/stream", zValidator("json", z.object({
    conversationId: z.string(),
    content: z.string().min(1).max(32_000),
    attachmentIds: z.array(z.string()).max(10).default([]),
  })), (c) => {
    const userId = c.get("userId");
    const input = c.req.valid("json");

    return streamSSE(c, async (stream) => {
      for await (const chunk of generateReply(userId, input, c.req.raw.signal)) {
        await stream.writeSSE({ event: "delta", data: JSON.stringify(chunk) });
      }
      await stream.writeSSE({ event: "done", data: "{}" });
    });
  });
```

Pass `c.req.raw.signal` into the model call so a closed tab cancels the upstream request.

---

## 7. Frontend Wiring

### 7.1 `apps/web/src/api.ts`

```ts
import { hc } from "hono/client";
import type { AppType } from "@api/app";

export const api = hc<AppType>("/api", { init: { credentials: "include" } });
```

Type imports only, so the server code never lands in the browser bundle.

### 7.2 Upload hook

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@web/api";

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    async mutationFn(file: File) {
      const slot = await api.attachments.$post({
        json: { filename: file.name, contentType: file.type, size: file.size },
      }).then((r) => r.json());

      const put = await fetch(slot.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`upload failed: ${put.status}`);

      await api.attachments[":id"].complete.$post({ param: { id: slot.id } });
      return slot.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attachments"] }),
  });
}
```

### 7.3 SSE consumption

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
| `core` services | `bun test`, `DATABASE_PATH=:memory:` | Fresh in-memory DB per test file. |
| API routes | `bun test` + `app.request()` | No port, no network. Inject a signed-in session cookie via a test helper. |
| S3 wrapper | `bun test` against MinIO from compose | Real client, real bucket. Skip with `test.skipIf(!process.env.MINIO_UP)` in CI without Docker. |
| React components | `bun test` + happy-dom + Testing Library | Preloaded via `bunfig.toml`. |
| E2E | Playwright against `docker compose up` | Exercises auth, upload, streaming and the served SPA. |

### API test example

```ts
import { test, expect, beforeAll } from "bun:test";
import { createApp } from "@api/app";
import { signInForTest } from "../setup/auth";

let app: ReturnType<typeof createApp>["app"];
let cookie: string;

beforeAll(async () => {
  ({ app } = createApp());
  cookie = await signInForTest(app);
});

test("requests an upload slot", async () => {
  const res = await app.request("/api/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ filename: "a.png", contentType: "image/png", size: 1234 }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.uploadUrl).toContain("X-Amz-Signature");
});
```

### Playwright config note

```ts
// playwright.config.ts
export default defineConfig({
  webServer: { command: "docker compose up --build", url: "http://localhost:3000/healthz", timeout: 180_000, reuseExistingServer: true },
  use: { baseURL: "http://localhost:3000" },
});
```

---

## 10. Daily Commands

```bash
cp .env.example .env
bun install
docker compose up -d minio minio-init   # local S3 only
bun run dev                              # api on :3000 (--hot), web on :5173 with proxy
bun run db:generate                      # after schema changes; commit drizzle/*.sql
bun run check                            # typecheck + lint + deadcode + tests
bun run compose:up                       # full stack as it runs in prod
bun run test:e2e
bunx shadcn@latest add button dialog
```

---

## 11. Additional Considerations

Each of these is already handled by the configuration above.

| Consideration | What happens | Applied fix |
|---|---|---|
| Env misconfiguration | Missing secret or bucket surfaces as a runtime 500. | Zod-validated `env.ts` crashes at boot (5.1). |
| SQLite on an ephemeral filesystem | Data lost on redeploy. | `/data` declared as a volume; mount persistent storage in prod (8.1). |
| SQLite write contention | `SQLITE_BUSY` under concurrent writes. | WAL + `busy_timeout = 5000` (5.3). Single process keeps this rare. |
| Foreign keys off | Cascades silently no-op. | `foreign_keys = ON` on every connection (5.3). |
| No backup story | Volume corruption or host loss destroys everything. | Litestream sidecar or scheduled `.backup` to the S3 bucket (2). |
| Bulk uploads through the app | Server memory and bandwidth become the bottleneck. | Presigned PUT/GET, server handles metadata only (5.4, 6.4). |
| Trusting client-reported size | Client lies about `size`, quota bypass. | `complete` step verifies with `s3.stat` (6.4). |
| Orphaned S3 objects | Client gets a slot but never PUTs. | `status: pending` rows; a cron deletes pending rows and objects older than 24 h. |
| Presigned URL host mismatch locally | Browser cannot reach `minio:9000`. | `S3_PUBLIC_ENDPOINT` with a separate presigning client (8.2). |
| Missing CORS on bucket | Browser PUT to S3 blocked. | `mc admin config set ... cors_allow_origin` locally; bucket CORS rule in AWS (8.2). |
| Unsafe object keys | Path traversal or collisions from user filenames. | Sanitized key under `users/<id>/attachments/<uuid>/` (5.4). |
| Content type allowlist | Executable or HTML uploads served from your origin. | Zod enum of allowed MIME types; bucket is private (6.4). |
| SSE dropped by idle timeout | Long generations cut off mid-stream. | `idleTimeout: 120` on `Bun.serve`; send a heartbeat comment every 15 s for longer streams (6.2). |
| Abandoned streams waste model calls | Closed tab keeps upstream generation running. | Propagate `c.req.raw.signal` (6.5). |
| SPA deep links 404 | Refresh on `/c/123` hits Hono, not React. | `serveStatic` fallback to `index.html` after API routes (6.1). |
| Server code leaking to browser | Importing `AppType` pulls in Hono routes. | `import type` only in `api.ts`; Vite tree-shakes types (7.1). |
| Auth tables drift | Better Auth schema out of sync with Drizzle. | Regenerate with the Better Auth CLI, then `drizzle-kit generate` (5.2). |
| Session cookie cross-origin in dev | Vite on 5173, API on 3000. | Vite proxy for `/api` and `/auth` so cookies are same-origin (4.4). |
| Container runs as root | Larger blast radius on compromise. | `USER bun`, `/data` chowned (8.1). |
| Docker build cache misses | Every code change reinstalls deps. | Lockfile and workspace manifests copied before source (8.1). |
| Logs unreadable locally | JSON logs in a terminal. | `bun run dev:api | bunx pino-pretty` for local use. |
| Lint noise from generated files | shadcn and route tree churn. | Excluded in Biome and Knip (4.5, 4.6). |

---

## 12. Growth Path

When a single container stops being enough, change one layer at a time:

| Trigger | Change | Effort |
|---|---|---|
| Need horizontal scaling or zero-downtime deploys | Swap `bun:sqlite` for Postgres via `drizzle-orm/bun-sql` (Bun's native Postgres client). Schema stays; regenerate migrations. | Medium |
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
