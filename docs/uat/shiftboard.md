# UAT — Shiftboard (full web app route)

**Route under test:** `references/bun-web-app-stack.md` — Hono on Bun, Drizzle + `bun:sqlite`,
Better Auth with **Google in mixed-audience mode**, broadcast SSE live updates, Docker compose,
Playwright E2E. Exercises the `**Access rule:** owner-or-permitted-role` chain end to end, and
the **Section 2.1** drops for Object storage and Per-request streaming.

**Persona:** *Theo*, a volunteer coordinator. Comfortable with Google Docs. Knows his
organisation is "on Google". Does not know what OAuth is.

**Time:** ~4 hours including the skeleton build and the Google OAuth client setup.

Read [README.md](README.md) first — prerequisites, plugin loading, global criteria G1–G8, defect
template.

---

## 0. Prerequisites for this run

- Bun 1.2+
- **Docker running** — the web sheet's compose stack and the E2E harness need it (`docker info`)
- A **Google Cloud project** where you can create an OAuth 2.0 client and set the consent screen.
  You will need to publish the consent screen (an unpublished app admits only listed test users).
- A Google Workspace domain to use as the org domain. If you do not have one, substitute any
  domain and treat the org-only half as simulated — note it in your run summary.
- `bunx playwright install` (one time)

## 1. Create the UAT repo

```bash
mkdir -p ~/uat-workspace/shiftboard && cd ~/uat-workspace/shiftboard
git init
```

Empty repo, no commits.

---

## 2. Session 1 — `/peak-workflow:new-project`

```bash
cd ~/uat-workspace/shiftboard
claude --plugin-dir /Users/schaveyt/github/peakflames/claude-plugins-peakflames/plugins/peak-workflow
```

```
/peak-workflow:new-project Our food bank runs on volunteers. I want a page where volunteers can see the open shifts for the week and claim one. When somebody claims a shift, everyone else looking at the page should see it disappear right away — otherwise two people show up for the same slot, which happens constantly today. The coordinators who create the shifts all sign in with our Google Workspace accounts. The volunteers are just people from the community, they're not on our Google.
```

**Expect:** Verdict **GREENFIELD**, nothing written, no branch.

**Answer:** *"I'll run it manually"*.

---

## 3. Session 2 — `/peak-workflow:setup`

Fresh session, then `/peak-workflow:setup <same description>`.

### What to answer

| Order | Question | Answer as Theo |
|---|---|---|
| 1 | Project type | **"Web app"** — "people open it in a browser, on their phone or laptop" |
| 2 | Required language or platform | **"No."** |
| 3 | The five shape questions, as **one block** | "Yes, phones and laptops. Yes, coordinators see who claimed what. No files. **Yes — updates on screen is the whole point.**" |
| 3a | Provider follow-up | **"We're on Google Workspace."** |
| 3b | Audience follow-up | **"Coordinators are on our Google. Volunteers are community people, they're not on it."** |
| 3c | Roles follow-up | **"Yes — coordinators create and cancel shifts; volunteers only claim and release their own."** |
| 4 | One combined confirmation | Read and accept |

Q5 should **not** be asked — Q2 was yes, so it is recorded as "yes — implied by sign-in".

### What to check

```bash
cd ~/uat-workspace/shiftboard
grep -n 'Q[1-6] \|Access rule\|Roles\|Sign-in\|N/A' CLAUDE.md
git log --oneline
```

| # | Check | Pass when |
|---|---|---|
| 3.1 | Question count ≤ 5 top-level (plus the three sign-in follow-ups) (G8) | counted |
| 3.2 | `**Product shape:**` block: **Q1 yes, Q2 yes, Q3 no, Q4 yes, Q5 "yes, implied by Q2"**; no Q6 (not a Desktop app) | all five labels present |
| 3.3 | **`**Access rule:** owner-or-permitted-role` appears verbatim** under Q2 | `grep -c 'Access rule:\*\* owner-or-permitted-role' CLAUDE.md` → 1. This is a greppable foreign key — a paraphrase is **Critical** |
| 3.4 | `**Sign-in:**` line records **Google, mixed audience**, naming the org domain | present |
| 3.5 | `**Roles:**` line names **coordinator** and **volunteer** and what each may read and change | in Theo's terms |
| 3.6 | **No** `Auth: local accounts now, org SSO deferred` row — the provider is named and approved | `grep -c 'org SSO deferred' CLAUDE.md` → 0 |
| 3.7 | Tech Stack sourced from `bun-web-app-stack.md` and matching its Section 2: Hono, Hono RPC + Zod, broadcast SSE, Better Auth, Drizzle + `bun:sqlite`, Vite 6, React 19, Tailwind v4 + shadcn/ui, Zustand + TanStack Query, TanStack Router (browser history), Pino via `hono-pino`, multi-stage `oven/bun` image | no substitutions |
| 3.8 | **Object storage** and **Local S3** rows marked `N/A — no file uploads (shape Q3)` — marked, not omitted | present |
| 3.9 | **Per-request streaming** marked `N/A — no streamed responses` | it has no shape question; the product streams nothing generated |
| 3.10 | **Live updates row is kept** (Q4 yes) | present, not N/A |
| 3.11 | **Email delivery row is kept** — mixed audience means public password sign-up for volunteers, which needs verified addresses and password reset | if it is marked N/A, that is a finding: N/A applies only when Auth is N/A, Google is org-only, or every account comes from the provider |
| 3.12 | Version exposure is `GET /version` returning `{name, version}` **plus** the footer, both reading `packages/core/src/app.ts` | the sheet's mechanism |
| 3.13 | Logging is **Pino, structured JSON to stdout**, level from `LOG_LEVEL`, configured in `apps/api/src/logger.ts`; the startup record is written as JSON (`{"level":30,"msg":"shiftboard v0.1.0 starting",…}`), **not** a `[INFO]` text line | check the example's form |
| 3.14 | Exit code + stdout/stderr rows `N/A — not a CLI` | marked |
| 3.15 | `## UX Baseline` section present with the bold line labels intact | present |
| 3.16 | `## Security Baseline` reflects sign-in (session handling, secrets never in the image) | present |
| 3.17 | Local Environment names `bun run dev` (API `:3000`, web `:5173` with proxy), `bun run test`, `bun run test:e2e` **naming Docker and a `.env` copied from `.env.example`** as prerequisites | present. Note: with Object storage N/A there is no `docker compose up -d minio minio-init` step — if it is listed anyway, that is a 2.1 leak |
| 3.18 | Hosting is recorded as **chosen with the user, not picked silently** | a concrete host costs money |
| 3.19 | Step 8 reported `frontend-design` and `playwright-cli` `[MISS]` with install commands | printed and recorded |
| 3.20 | First commit made | `git show --stat HEAD` |

---

## 4. Session 3 — `/peak-workflow:discover`

Fresh session, `/peak-workflow:discover`. Accept the `docs/shiftboard` branch.

**Answer as Theo:**

- *Problem:* "We post shifts in a group chat. Two people claim the same slot constantly, and
  nobody knows which shifts are still open."
- *Users:* "Coordinators (three of us) create and cancel shifts. Volunteers (about 60) claim
  them."
- *Success:* "No double-booking. A volunteer can see and claim an open shift from their phone in
  under a minute."
- *Live:* "When someone claims a shift, it has to vanish from everyone else's screen right away."
- *Out of scope:* "Scheduling algorithms, payroll, anything with attachments."

**Step 4.5 Product-Shape Re-check:** scenarios confirm Q1/Q2/Q4 are yes. Expect **no
contradictions**.

**At Step 6:** *"Continue planning"*.

| # | Check | Pass when |
|---|---|---|
| 4.1 | On `docs/shiftboard`; base branch untouched (G1) | verified |
| 4.2 | Vision 11 sections, ConOps 9 sections, substantive | no placeholders |
| 4.3 | ConOps Section 4 names both roles with distinct profiles | coordinator / volunteer |
| 4.4 | ConOps Section 5 has separate numbered scenarios for the coordinator and the volunteer paths, naming fields and actions | present |
| 4.5 | The live-update behavior appears as an explicit scenario step, not a footnote | present |
| 4.6 | Next Step recommends `/peak-workflow:mockup` first | UI project |

---

## 5. Session 4 — `/peak-workflow:mockup`

Fresh session, `/peak-workflow:mockup`. Expect screens like `S-01 Shift Board`, `S-02 New Shift`,
`S-03 Sign In`, maybe `S-04 My Shifts`.

| # | Check | Pass when |
|---|---|---|
| 5.1 | `ux/screens.md` with `S-NN` IDs + `Wireframe` column; grayscale wireframes per data-bearing screen | present |
| 5.2 | Each data-bearing screen has loading / empty / error / populated states | present |
| 5.3 | A sign-in screen exists and shows **both** paths — "Continue with Google" for coordinators and email-and-password for volunteers | mixed audience made visible |
| 5.4 | ConOps Section 5 rewritten to name screens and controls | `grep -n 'S-0' docs/product-vision-planning/concept-of-operations.md` |
| 5.5 | A `# Note: reference screen` line names the skeleton-owned screen(s) | present |
| 5.6 | `frontend-design` was not invoked | not in the transcript |

---

## 6. Session 5 — `/peak-workflow:capture-requirements`

Fresh session. Approve a capability-shaped grouping (e.g. `shifts`, `claims`, `access`,
`app-shell`) — a layer-shaped one is a finding.

| # | Check | Pass when |
|---|---|---|
| 6.1 | Feature file + tracing sidecar pairs exist | matched |
| 6.2 | TOR IDs unique and well-formed (G3) | `uniq -d` empty |
| 6.3 | `# Tool Hygiene & Operability` block: `GET /version` + footer, the **JSON** startup log record, Pino convention, RFC 9457 problem-details error bodies whose `detail` names the next action | present; exit-code/stdout rows absent |
| 6.4 | `# UX Baseline` block present | Screen states, Keyboard & focus, Forms, Destructive actions, Progress feedback, Layout floor, Contrast, Reduced motion, Navigation |
| 6.5 | **Access TORs derived from the `**Access rule:**` line**: a volunteer cannot read or change another volunteer's claim; a coordinator can; an unauthenticated caller is refused | these are the point of this run |
| 6.6 | A **live-update TOR** with a Given/When/Then that observes a second browser context seeing the claim disappear | present |
| 6.7 | The **Google round-trip TOR is routed to Coverage Gaps or marked operator-observed** against the real tenant — automated tests sign in through the email-and-password helper | a provider round-trip asserted by an automated test is a finding |
| 6.8 | Givens/Whens name screens exactly as `screens.md` does | no paraphrases |
| 6.9 | Nothing committed | merge is the approval gate |

---

## 7. Session 6 — `/peak-workflow:plan-project`

Fresh session, `/peak-workflow:plan-project`.

| # | Check | Pass when |
|---|---|---|
| 7.1 | v2.5.0 layout complete | present |
| 7.2 | Every TOR owned by exactly one epic (G4) | `uniq -d` on the sidecars is empty |
| 7.3 | Epics are **vertical slices** — no "backend epic" + "frontend epic" for the same behavior | a split is Critical: the backend half can never satisfy the Then clause |
| 7.4 | The skeleton owns the **auth layer configured for real**: Better Auth with email-and-password enabled, Google enabled in **mixed-audience** mode, an **owner column on every table**, **one access rule every route calls**, and a **role field** carrying the names `CLAUDE.md` records | all five |
| 7.5 | The role names are substituted into the sheet's **single roles constant** and nowhere else | scattered role strings are a finding |
| 7.6 | The skeleton plan includes a **plain checklist for whoever administers the Google tenant**: create the OAuth client, register the local and production callback URLs, set the consent screen audience and **publish it**, paste the client ID and secret into `.env` | present — an unpublished app admits only listed test users |
| 7.7 | Web-sheet specifics not dropped: `packages/core/src/app.ts` as the **one** reader of `package.json#version` feeding `GET /version`, the footer and the first log line from `apps/api/src/logger.ts`; the **root `tsconfig.json`**; the auth **`basePath`** matching the proxy entry; Playwright **`testDir: "tests/e2e"`** | all four |
| 7.8 | **Section 2.1 Object storage drop applied**: no `packages/core/src/storage/`, no `apps/api/src/routes/attachments.ts`, no `S3_*` env vars, no `minio`/`minio-init` services or `miniodata` volume in compose, no `docker compose up -d minio minio-init` in the daily commands, and **backups use the mounted backup volume** (`sqlite3 … .backup`), not Litestream | check each — a leftover MinIO service is a finding |
| 7.9 | **Section 2.1 Per-request streaming drop applied**: no `apps/api/src/routes/messages.ts`, no `assistant.ts`, no `messages` table | present |
| 7.10 | **Live updates kept**: `packages/core/src/events.ts`, `apps/api/src/routes/events.ts`, `apps/web/src/queries/live-updates.ts`, the SSE heartbeat under the idle timeout | present |
| 7.11 | **Email delivery kept**: `apps/api/src/mail.ts`, `EMAIL_DELIVERY=log` for dev and tests, verified sign-up and password reset | present; an email provider costs money, so it must be **confirmed with the user** in the start-epic plan, not picked silently |
| 7.12 | `can()` is called on **every mutating route**, and a **role-change route** exists | the sheet requires both |
| 7.13 | The skeleton names the **test-only fault/latency switch** (env var at startup, ignored when `NODE_ENV=production`) and the **data reset** pointing at a throwaway database file | present |
| 7.14 | The skeleton spec has a `## Screens` section listing the reference screen(s) | present |

---

## 8. Merge the `docs/` branch

```bash
git status --short
git checkout main
git merge docs/shiftboard --no-ff
ls docs/requirements/*.feature.md
```

---

## 9. Session 7 — `/peak-workflow:start-epic <skeleton-id>`

Fresh session. **Expect it to ask you to confirm the email delivery provider and the hosting
target before planning** — those cost money and must never be picked silently. Answer as Theo:
"whatever's cheapest, but ask me before we pay for anything" and let it recommend.

Approve the plan, then let it run unaided. You will need to do the Google console steps yourself
from the checklist it produces.

| # | Check | Pass when |
|---|---|---|
| 9.1 | Plan mode entered before any write; placeholders substituted | verified |
| 9.2 | Money/policy values (email provider, hosting, CI) confirmed with you, with a recommended default | not picked silently |
| 9.3 | Branch `feature/epic-<id>-<short-name>` off `main` | verified |
| 9.4 | Tree matches sheet Section 3; configs match Section 4 verbatim minus the 2.1 drops | diff |
| 9.5 | `bun install` succeeded; `bunx shadcn@latest init` ran for the renderer | `components.json` exists |
| 9.6 | The auth `basePath` and the Vite proxy entry agree | a mismatch was a v1.11.0 fix — a regression is Critical |
| 9.7 | The `hc` client does not double-prefix the API path | same |
| 9.8 | **G5** — the deferred-value grep on `CLAUDE.md` returns nothing | skeleton resolved every TBD |
| 9.9 | `bun run dev` serves the app; `curl localhost:3000/version` returns `{name, version}` without signing in | version TOR |
| 9.10 | Sign-in works for real: email-and-password, **and** Google via the OAuth client you registered | no placeholder identity, no anonymous fallback |
| 9.11 | A volunteer account cannot read another volunteer's claim; a coordinator can | the access rule, by hand |
| 9.12 | Live updates work: open two browser windows, claim a shift in one, watch it disappear in the other | the product's reason for existing |
| 9.13 | The reference screen renders all four states | force with the fault switch |
| 9.14 | **G6** — you run `bun run check` and `bun run test:e2e` yourself, cold, with Docker running and `.env` copied, and both pass | first real execution of the sheet |

> **Expected failure surface:** Better Auth hook paths and edge cases were never executed — the
> sub-agents flagged them specifically. If verified-email sign-up, password reset, or the provider
> callback misbehaves, capture the resolved `better-auth` version and the exact hook and file, and
> file it as **Critical**.

---

## 10. Session 8 — `/peak-workflow:wrapup-epic <skeleton-id>`

Try it first in the implementer's session and confirm the **Session Guard refuses** (that is a
PASS). Then a fresh session.

| # | Check | Pass when |
|---|---|---|
| 10.1 | Session Guard fired | refusal printed |
| 10.2 | Feature branch checked out before reading sidecar/spec; `CLAUDE.md` re-read from it | verified |
| 10.3 | Deferred-value gate run and reported | skeleton-only gate |
| 10.4 | **Access-control check ran**, with PASS/FAIL and evidence on each of its four lines: no sign-in bypass (no dev login, no anonymous fallback, no user from a header/query/env), owner column on every new table, every new read and write through the access rule, role checks server-side | this is the headline gate for this run. A FAIL must be treated as Fix-now or Stop — **never** filed as a Known Issue |
| 10.5 | UX Baseline check ran through `playwright-cli` against the running app with real data | web app, so `playwright-cli` is correct here |
| 10.6 | Each of the four screen states forced via the fault/latency switch | evidence recorded |
| 10.7 | The Google round-trip is reported as **operator-observed**, not asserted by an automated test | correct |
| 10.8 | Any verifier fix recorded `FIXED DURING WRAPUP` | disclosed |
| 10.9 | Sidecar → `status: Complete`; handoff written | verified |
| 10.10 | Ship mode asked neutrally | choose **Solo** (or **Team** if you want to exercise `gh pr create --base develop`) |

---

## 11. Session 9 — `/peak-workflow:status`

| # | Check | Pass when |
|---|---|---|
| 11.1 | Dashboard renders; Requirements Coverage 100% planned (G7) | no errors |
| 11.2 | Read-only | `git status --porcelain` empty |

---

## 12. Optional — the claim slice

The claim-a-shift epic is the best second slice: it exercises the access rule on a new route,
the live-update SSE path on real domain data, and the UX Baseline gate on a second screen.

---

## 13. Run summary

```
Project: Shiftboard (web app, Google mixed audience)
Plugin ref: <git rev-parse --short HEAD in the plugin repo>
Date: 
Bun version: ____   Docker: ____   Google tenant: real / simulated
Global criteria:  G1 __  G2 __  G3 __  G4 __  G5 __  G6 __  G7 __  G8 __
Questions asked by setup: __
`**Access rule:** owner-or-permitted-role` written verbatim?  YES / NO
2.1 drops applied cleanly (Object storage, Per-request streaming)?  YES / NO
Live updates observed in two browsers?  YES / NO
Access-control gate result: PASS / FAIL
Skeleton build: PASS / FAIL
Findings filed: F-__ … F-__
Overall: PASS / PASS WITH FINDINGS / FAIL
```
