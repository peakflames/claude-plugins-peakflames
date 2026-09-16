# UAT — Shiftboard (full web app, **deferred org sign-in**)

**Route under test:** `references/bun-web-app-stack.md` — Hono on Bun, Drizzle + `bun:sqlite`,
Better Auth, broadcast SSE live updates, Docker compose, Playwright E2E — with sign-in in
**deferred mode**: real email-and-password accounts now, the organization's identity provider as
its own later epic.

This is the path a real organization most often lands on: they know they need sign-in, they have
no idea what an identity provider is, and the one their IT is "getting" is weeks or months from
approval. The plugin's contract is that **authentication and ownership are built now** and only
*who vouches for the identity* is deferred.

**Persona:** *Theo*, a volunteer coordinator. Comfortable with Google Docs. Has heard the word
"Okta" in a meeting because IT is supposedly rolling it out, but has no idea what it is, whether
it's approved, or when. He is emphatically not going to get an answer this month.

**Time:** ~3–4 hours including the skeleton build. **No cloud account or OAuth client needed** —
that is the point of deferred mode.

Read [README.md](README.md) first — prerequisites, plugin loading, global criteria G1–G8, defect
template.

> **Coverage note:** deferred mode had **no adversarial dry-run coverage** in the v1.11.0
> validation cycle (the validated web scenario used a named, approved provider). Treat this run as
> the first real exercise of the deferred path, and be unusually strict about the greppable
> strings in section 3 — downstream skills key their behavior on them.

---

## 0. Prerequisites for this run

- Bun 1.2+
- **Docker running** — the web sheet's compose stack and the E2E harness need it (`docker info`)
- `bunx playwright install` (one time)
- **No Google Cloud project, no Okta tenant, no OAuth client.** If the run asks you for any of
  these, that is a finding — deferred mode must not block on an external approval.

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
/peak-workflow:new-project Our food bank runs on volunteers. I want a page where volunteers can see the open shifts for the week and claim one. When somebody claims a shift, everyone else looking at the page should see it disappear right away — otherwise two people show up for the same slot, which happens constantly today. Coordinators create the shifts and need to see who claimed what. IT keeps saying we're moving to Okta but nothing is approved and I can't wait on them.
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
| 3 | The five shape questions, as **one block** | "Yes, phones and laptops. Yes — coordinators need to see who claimed what. No files. **Yes, updates on screen — that's the whole point.**" |
| 3a | **Provider follow-up** | **"IT says we're getting Okta but it's not approved. I'd have to ask them and it'll take a month."** |
| 3b | Roles follow-up | **"Yes — coordinators create and cancel shifts; volunteers only claim and release their own."** |
| 4 | One combined confirmation | Read and accept |

Q5 should **not** be asked — Q2 was yes, so it is recorded as "yes — implied by sign-in".

There is **no audience follow-up** in deferred mode. Org-only vs mixed audience is a property of a
*named* provider; asking it here would be a finding.

### What `setup` must do with that answer

Theo's answer is the **middle row** of the provider table — *"a vendor is likely but unconfirmed"*.
That routes to **deferred mode**, and the candidate must not be discarded:

| # | Check | Pass when |
|---|---|---|
| 3.1 | Question count ≤ 5 top-level (plus the two sign-in follow-ups) (G8) | counted |
| 3.2 | `**Product shape:**` block: **Q1 yes, Q2 yes, Q3 no, Q4 yes, Q5 "yes, implied by Q2"**; no Q6 | all five labels present |
| 3.3 | **`**Access rule:** owner-or-permitted-role` appears verbatim** under Q2 | `grep -c 'Access rule:\*\* owner-or-permitted-role' CLAUDE.md` → 1. Greppable foreign key — a paraphrase is **Critical** |
| 3.4 | **`**Sign-in:**` line carries the greppable string `Auth: local accounts now, org SSO deferred`** | `grep -c 'Auth: local accounts now, org SSO deferred' CLAUDE.md` → **at least 1**. Four skills match on this string verbatim |
| 3.5 | A Tech Stack **row** begins with that same exact string, followed by **the candidate (Okta) and who confirms it** | the hint must not be thrown away |
| 3.6 | `setup` handed Theo **the one question to ask IT** — something of the form *"Are we on Okta, and can we register an application?"* | printed in the session |
| 3.7 | `**Roles:**` names **coordinator** and **volunteer** and what each may read and change | in Theo's terms |
| 3.8 | **No** named-provider artifacts: no `GOOGLE_*`, no `MICROSOFT_*`, no audience mode, no domain restriction anywhere in `CLAUDE.md` | `grep -ciE 'google\|microsoft\|org-only\|mixed audience' CLAUDE.md` → 0 |
| 3.9 | **The static sheet was not offered.** Tech Stack is sourced from `bun-web-app-stack.md` | deferring the provider never restores the browser-only sheet — shared data needs a server regardless. Routing to the static sheet here is **Critical** |
| 3.10 | `setup` told Theo, in plain language, what this buys and what it does not — real security now, and that connecting Okta later is separate work of a week or more with IT, not made smaller by deferring | the script requires saying this out loud |
| 3.11 | Tech Stack otherwise matches the sheet's Section 2: Hono, Hono RPC + Zod, broadcast SSE, Better Auth, Drizzle + `bun:sqlite`, Vite 6, React 19, Tailwind v4 + shadcn/ui, Zustand + TanStack Query, TanStack Router (browser history), Pino via `hono-pino`, multi-stage `oven/bun` image | no substitutions |
| 3.12 | **Object storage** and **Local S3** rows marked `N/A — no file uploads (shape Q3)` | marked, not omitted |
| 3.13 | **Per-request streaming** marked `N/A — no streamed responses` | it has no shape question |
| 3.14 | **Live updates row kept** (Q4 yes) | not N/A |
| 3.15 | **Email delivery row kept** — deferred mode means every account is an email-and-password account, including public volunteer sign-ups, which needs verified addresses and password reset | marking it N/A is a finding: that drop applies only when Auth is N/A, the provider is org-only, or **every** account comes from a named provider — none of which is true here |
| 3.16 | Version exposure is `GET /version` + the footer, both reading `packages/core/src/app.ts` | the sheet's mechanism |
| 3.17 | Logging is **Pino, structured JSON to stdout**, `LOG_LEVEL`, configured in `apps/api/src/logger.ts`; the startup record is JSON (`{"level":30,"msg":"shiftboard v0.1.0 starting",…}`), not `[INFO]` text | check the example's form |
| 3.18 | Exit code + stdout/stderr rows `N/A — not a CLI` | marked |
| 3.19 | `## UX Baseline` present with bold line labels intact; `## Security Baseline` reflects sign-in | present |
| 3.20 | Local Environment names `bun run dev` (API `:3000`, web `:5173` proxy), `bun run test`, `bun run test:e2e` **naming Docker and `.env` copied from `.env.example`** | present. With Object storage N/A there should be **no** `docker compose up -d minio minio-init` step |
| 3.21 | Hosting recorded as chosen with the user, not picked silently | it costs money |
| 3.22 | First commit made | `git show --stat HEAD` |

### The design-notes section

`setup` Step 6 must write the decision into `docs/design-notes.md` as a **numbered section**:

```bash
grep -n 'Organization Sign-In Deferred' -A 18 docs/design-notes.md
```

| # | Check | Pass when |
|---|---|---|
| 3.23 | A `## N. Organization Sign-In Deferred` section exists | present |
| 3.24 | It states the **Decision** — real accounts from epic 1, owner on every record, one owner-or-permitted-role rule, provider added later as an additional method on the same accounts | present |
| 3.25 | **Rationale** names Theo's actual reason (pending IT approval) | not generic |
| 3.26 | **Candidate provider:** Okta — **confirmed by:** [whoever Theo named] | the hint survives |
| 3.27 | **Resolves when:** the provider is confirmed, and it says `plan-project` carries this as its own epic, scoped as callback route + session configuration + directory-group-to-role mapping + E2E sign-in helper update | **scoped honestly, not as a one-line swap** |

> **This section is load-bearing.** `plan-project` Step 1 reads `design-notes.md` for deferred
> decisions and 3A.4 turns each into an epic. A decision with no epic is precisely the failure
> mode that read exists to prevent — if the section is missing here, the epic will be missing in
> section 7, and you should expect both failures together.

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
- *Sign-in:* "People make an account with their email. Later we're supposed to move to Okta."
- *Out of scope:* "Scheduling algorithms, payroll, anything with attachments."

**Step 4.5 Product-Shape Re-check:** scenarios confirm Q1/Q2/Q4 are yes. Expect **no
contradictions**, and expect the deferral to survive untouched.

**At Step 6:** *"Continue planning"*.

| # | Check | Pass when |
|---|---|---|
| 4.1 | On `docs/shiftboard`; base branch untouched (G1) | verified |
| 4.2 | Vision 11 sections, ConOps 9 sections, substantive | no placeholders |
| 4.3 | ConOps Section 4 names both roles with distinct profiles | coordinator / volunteer |
| 4.4 | ConOps Section 5 has separate numbered scenarios for the coordinator and volunteer paths, naming fields and actions | present |
| 4.5 | The live-update behavior is an explicit scenario step | present |
| 4.6 | ConOps scenarios describe signing in with **an email and password**, not with a provider | the ConOps must match what gets built |
| 4.7 | Section 8 records the Okta migration as a **future constraint / assumption**, not as a current capability | present |
| 4.8 | The re-check did not quietly flip the deferral into a named provider | `grep -c 'org SSO deferred' CLAUDE.md` still ≥ 1 |
| 4.9 | Next Step recommends `/peak-workflow:mockup` first | UI project |

---

## 5. Session 4 — `/peak-workflow:mockup`

Fresh session, `/peak-workflow:mockup`. Expect screens like `S-01 Shift Board`, `S-02 New Shift`,
`S-03 Sign In`, `S-04 Sign Up`, maybe `S-05 My Shifts`.

| # | Check | Pass when |
|---|---|---|
| 5.1 | `ux/screens.md` with `S-NN` IDs + `Wireframe` column; grayscale wireframes per data-bearing screen | present |
| 5.2 | Each data-bearing screen has loading / empty / error / populated states | present |
| 5.3 | The sign-in screen shows **only the email-and-password path** — **no "Continue with Okta" button, no SSO placeholder** | a provider button drawn now is a finding: it would be dead UI with nothing behind it |
| 5.4 | Screens exist for the account lifecycle deferred mode actually ships — sign up, verify email, forgot/reset password | these are real surfaces here, not optional |
| 5.5 | ConOps Section 5 rewritten to name screens and controls | `grep -n 'S-0' docs/product-vision-planning/concept-of-operations.md` |
| 5.6 | A `# Note: reference screen` line names the skeleton-owned screen(s) | present |
| 5.7 | `frontend-design` was not invoked | not in the transcript |

---

## 6. Session 5 — `/peak-workflow:capture-requirements`

Fresh session. Approve a capability-shaped grouping (e.g. `shifts`, `claims`, `access`,
`accounts`, `app-shell`) — a layer-shaped one is a finding.

**The headline check for this session:** deferred mode forbids TORs whose Then clause depends on
the provider.

| # | Check | Pass when |
|---|---|---|
| 6.1 | Feature file + tracing sidecar pairs exist | matched |
| 6.2 | TOR IDs unique and well-formed (G3) | `grep -rhoE 'TOR-[0-9]{2}-[A-Za-z0-9]{7}' docs/requirements/ \| sort \| uniq -d` empty |
| 6.3 | `# Tool Hygiene & Operability` block: `GET /version` + footer, the JSON startup log record, Pino convention, RFC 9457 problem-details errors whose `detail` names the next action | present; exit-code/stdout rows absent |
| 6.4 | `# UX Baseline` block present | Screen states, Keyboard & focus, Forms, Destructive actions, Progress feedback, Layout floor, Contrast, Reduced motion, Navigation |
| 6.5 | **Access TORs derived from the `**Access rule:**` line**: a volunteer cannot read or change another volunteer's claim; a coordinator can; an unauthenticated request is rejected; each declared role can do exactly what `CLAUDE.md` says | these are the point of this run |
| 6.6 | **NO TORs for SSO redirects, directory-sourced role claims, account provisioning or deprovisioning, MFA, or organization password policy** | `grep -riE 'sso\|okta\|single sign\|directory group\|provision' docs/requirements/*.feature.md` should hit **only** the Coverage Gaps prose, never a Scenario title or a Then clause. A provider TOR here is **Critical** — it cannot pass until an epic that does not exist ships |
| 6.7 | Those items appear in **Coverage Gaps (explicitly deferred)**, named as waiting on the provider epic | present in the Step 7 summary and the feature file |
| 6.8 | **Each role TOR carries a line** noting the role is assigned in the product's own accounts until the provider epic maps it from the directory | the skill requires this line |
| 6.9 | TORs exist for the account lifecycle that ships now: verified-email sign-up, password reset, session expiry | real behavior, real tests |
| 6.10 | Givens/Whens name screens exactly as `screens.md` does | no paraphrases |
| 6.11 | A **live-update TOR** observes a second browser context seeing the claim disappear | present |
| 6.12 | Nothing committed | the merge is the approval gate |

---

## 7. Session 6 — `/peak-workflow:plan-project`

Fresh session, `/peak-workflow:plan-project`.

Two things are being tested here: the skeleton builds **real** auth now, and the deferral becomes
**its own epic** rather than evaporating.

### 7a — the walking skeleton

| # | Check | Pass when |
|---|---|---|
| 7.1 | v2.5.0 layout complete | present |
| 7.2 | Every TOR owned by exactly one epic (G4) | `uniq -d` on the sidecars is empty |
| 7.3 | Epics are **vertical slices** — no "backend epic" + "frontend epic" for the same behavior | a split is Critical |
| 7.4 | The skeleton owns the sheet's **auth layer, working for real**: Better Auth with email-and-password enabled, **no placeholder identity, no anonymous fallback, no header-asserted user** | the "do not build a sign-in stub" rule |
| 7.5 | **An owner column on every table** | ownership is never deferred |
| 7.6 | **One access rule every route calls** — owner-**or-permitted-role**, not owner-only | owner-only would stop coordinators seeing volunteer claims, which is the product's reason for existing |
| 7.7 | A **role field** carrying the names `CLAUDE.md` records, substituted into the sheet's **single roles constant** and nowhere else | scattered role strings are a finding |
| 7.8 | **No OAuth/provider setup checklist** in the skeleton plan | correct — there is no provider to configure. A Google/Okta console checklist here is a finding |
| 7.9 | Web-sheet specifics not dropped: `packages/core/src/app.ts` as the **one** reader of `package.json#version` feeding `GET /version`, the footer and the first log line; the **root `tsconfig.json`**; the auth **`basePath`** matching the proxy entry; Playwright **`testDir: "tests/e2e"`** | all four |
| 7.10 | **Section 2.1 Object storage drop applied**: no `packages/core/src/storage/`, no `routes/attachments.ts`, no `S3_*` env vars, no `minio`/`minio-init`/`miniodata` in compose, no MinIO line in the daily commands, and **backups use the mounted backup volume** (`sqlite3 … .backup`), not Litestream | a leftover MinIO service is a finding |
| 7.11 | **Section 2.1 Per-request streaming drop applied**: no `routes/messages.ts`, no `assistant.ts`, no `messages` table | present |
| 7.12 | **Live updates kept**: `packages/core/src/events.ts`, `apps/api/src/routes/events.ts`, `apps/web/src/queries/live-updates.ts`, SSE heartbeat under the idle timeout | present |
| 7.13 | **Email delivery kept**: `apps/api/src/mail.ts`, `EMAIL_DELIVERY=log` for dev and tests, verified sign-up and password reset. An email provider costs money, so it must be **confirmed with the user** in the start-epic plan | present |
| 7.14 | `can()` on **every mutating route**, and a **role-change route** exists | the sheet requires both |
| 7.15 | The skeleton names the **test-only fault/latency switch** (env var at startup, ignored when `NODE_ENV=production`) and the **data reset** pointing at a throwaway database file | present |
| 7.16 | The skeleton spec has a `## Screens` section listing the reference screen(s) | present |

### 7b — the deferred-decision epic (3A.4)

```bash
grep -rn 'requirements: —' docs/implementation-plan/status/
grep -rln 'Organization Sign-In\|Sign-In' docs/implementation-plan/phase-*/
```

| # | Check | Pass when |
|---|---|---|
| 7.17 | **An epic exists for the deferred decision** — named for it, e.g. `Organization Sign-In` | its absence is **Critical**: the decision would be silently dropped |
| 7.18 | Its sidecar has **`requirements: —`** | it owns no TOR IDs by design |
| 7.19 | Its Description **cites the `design-notes.md` section** as the reason it exists | traceable back to 3.23 |
| 7.20 | It is placed in the **last phase** | present |
| 7.21 | The phase index records that **no production release should precede it** | present |
| 7.22 | It is **scheduled, not blocked on other epics** — its trigger is external (Theo's IT confirming the provider) | dependencies should not gate it on unrelated epics |
| 7.23 | It is **scoped honestly**: callback route, the provider's own session configuration, mapping directory groups onto coordinator/volunteer, and updating the end-to-end sign-in helper | a one-line "swap in SSO" scope is a finding |
| 7.24 | Because it has no TOR IDs, the spec states a **done-criterion in terms of the behavior** instead of "every covered TOR has a passing test" | present |
| 7.25 | The Step 6 self-check does **not** report this epic as a coverage gap | `requirements: —` is legitimate here |

> **Watch for an honest limitation, and record it as an observation rather than a defect:** the web
> sheet's Section 6.3 demonstrates **Google and Microsoft** as social providers. Okta is neither.
> Nothing is configured now, so this does not bite during this run — but note whether the epic's
> scope acknowledges that the provider may need Better Auth's generic OIDC path rather than a
> worked example from the sheet. If the spec assumes a sheet example that does not exist, file it
> as **UX** severity against the sheet.

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
target before planning** — both cost money and must never be picked silently. Answer as Theo:
"whatever's cheapest, ask me before we pay for anything" and let it recommend. For local
development it should use `EMAIL_DELIVERY=log`, which needs no account at all.

Approve the plan, then let it run unaided.

| # | Check | Pass when |
|---|---|---|
| 9.1 | Plan mode entered before any write; placeholders substituted | verified |
| 9.2 | Money/policy values (email provider, hosting, CI) confirmed with you, with a recommended default | not silent |
| 9.3 | **Nothing asked you for an OAuth client, tenant, client ID or secret** | deferred mode must not block on an external approval |
| 9.4 | Branch `feature/epic-<id>-<short-name>` off `main` | verified |
| 9.5 | Tree matches sheet Section 3; configs match Section 4 verbatim minus the 2.1 drops | diff |
| 9.6 | `bun install` succeeded; `bunx shadcn@latest init` ran for the renderer | `components.json` exists |
| 9.7 | The auth `basePath` and the Vite proxy entry agree | a mismatch was a v1.11.0 fix — a regression is Critical |
| 9.8 | The `hc` client does not double-prefix the API path | same |
| 9.9 | `GOOGLE_*` / `MICROSOFT_*` env vars are **present but commented out / optional** in `.env.example`, and the app **boots with none of them set** | `bun run dev` must not fail an env check for a provider nobody chose |
| 9.10 | **G5** — the deferred-value grep on `CLAUDE.md` returns nothing on this branch | note: `Auth: local accounts now, org SSO deferred` is **not** one of the strings that gate grep matches — it is an open decision with an epic, not an unresolved setup value. If the skeleton deletes the auth row to satisfy the gate, that is a finding |
| 9.11 | `bun run dev` serves the app; `curl localhost:3000/version` returns `{name, version}` without signing in | version TOR |
| 9.12 | **Sign-in works for real**: register an account, receive the verification link (in the log outbox with `EMAIL_DELIVERY=log`), verify, sign in, sign out, reset the password | real hashing, real session cookies — not a stub |
| 9.13 | Grep the diff for a dev-only login, an anonymous fallback, or a user taken from a header/query/env — **none exists** | the no-stub rule |
| 9.14 | A volunteer account cannot read another volunteer's claim; a coordinator can | the access rule, by hand |
| 9.15 | Live updates work: two browser windows, claim in one, watch it disappear in the other | the product's reason for existing |
| 9.16 | The reference screen renders all four states | force with the fault switch |
| 9.17 | **G6** — you run `bun run check` and `bun run test:e2e` yourself, cold, with Docker running and `.env` copied, and both pass | first real execution of the sheet |

> **Expected failure surface:** Better Auth hook paths and edge cases were never executed, and
> deferred mode leans on them harder than the named-provider path did — verified-email sign-up,
> the reset-token branches, and session revocation on password reset are all exercised here for
> the first time. Capture the resolved `better-auth` version and the exact hook and file, and file
> as **Critical**.

---

## 10. Session 8 — `/peak-workflow:wrapup-epic <skeleton-id>`

Try it first in the implementer's session and confirm the **Session Guard refuses** (that is a
PASS). Then a fresh session.

| # | Check | Pass when |
|---|---|---|
| 10.1 | Session Guard fired | refusal printed |
| 10.2 | Feature branch checked out before reading sidecar/spec; `CLAUDE.md` re-read from it | verified |
| 10.3 | Deferred-value gate run and reported | skeleton-only gate |
| 10.4 | **The access-control check ran** — it triggers on **either** the `**Access rule:**` line **or** the `Auth: local accounts now, org SSO deferred` string, so deferred mode does not exempt it | if wrapup skips this gate because no provider is configured, that is **Critical** — it is the headline check of this run |
| 10.5 | All four of its lines recorded PASS/FAIL with evidence: **no sign-in bypass** (no dev login, no anonymous fallback, no user from header/query/env), **owner column on every new table**, **every new read and write through the access rule**, **role checks server-side** | a FAIL is Fix-now or Stop — **never** a Known Issue |
| 10.6 | UX Baseline check ran through `playwright-cli` against the running app with real data | web app, so `playwright-cli` is correct |
| 10.7 | Each of the four screen states forced via the fault/latency switch | evidence recorded |
| 10.8 | **No provider round-trip was verified or demanded** | there is no provider yet; asking for one is a finding |
| 10.9 | Any verifier fix recorded `FIXED DURING WRAPUP` | disclosed |
| 10.10 | Sidecar → `status: Complete`; handoff written | verified |
| 10.11 | Ship mode asked neutrally | choose **Solo** (or **Team** to exercise `gh pr create --base develop`) |

---

## 11. Session 9 — `/peak-workflow:status`

| # | Check | Pass when |
|---|---|---|
| 11.1 | Dashboard renders; Requirements Coverage 100% planned (G7) | no errors |
| 11.2 | The `Organization Sign-In` epic appears with **no TOR IDs**, and does **not** distort the coverage percentage into looking incomplete | `requirements: —` handled cleanly |
| 11.3 | Read-only | `git status --porcelain` empty |

---

## 12. Optional — the claim slice

The claim-a-shift epic is the best second slice: it exercises the access rule on a new route with
real accounts, the live-update SSE path on real domain data, and the UX Baseline gate on a second
screen. It also re-runs wrapup's access-control gate on a non-skeleton epic, which is where that
gate does most of its work in practice.

---

## 13. Run summary

```
Project: Shiftboard (web app, deferred org sign-in — Okta pending IT)
Plugin ref: <git rev-parse --short HEAD in the plugin repo>
Date: 
Bun version: ____   Docker: ____
Global criteria:  G1 __  G2 __  G3 __  G4 __  G5 __  G6 __  G7 __  G8 __
Questions asked by setup: __

Deferred-mode contract:
  `Auth: local accounts now, org SSO deferred` written verbatim?      YES / NO
  `**Access rule:** owner-or-permitted-role` written verbatim?        YES / NO
  Candidate (Okta) + who-confirms recorded, not discarded?            YES / NO
  design-notes.md "Organization Sign-In Deferred" section written?    YES / NO
  Provider-dependent TORs kept OUT of the feature files?              YES / NO
  Deferred-decision epic created, last phase, `requirements: —`?      YES / NO
  Real email+password auth shipped — NO stub, NO bypass?              YES / NO
  Owner column + one access rule shipped in epic 0?                   YES / NO
  Run completed with NO external approval or OAuth client?            YES / NO

2.1 drops applied cleanly (Object storage, Per-request streaming)?    YES / NO
Live updates observed in two browsers?                                YES / NO
Access-control gate result: PASS / FAIL
Skeleton build: PASS / FAIL
Findings filed: F-__ … F-__
Overall: PASS / PASS WITH FINDINGS / FAIL
```
