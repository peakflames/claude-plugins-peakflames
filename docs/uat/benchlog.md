# UAT — Benchlog (Electron desktop route)

**Route under test:** `references/bun-electron-desktop-stack.md` — offline Windows Electron app,
better-sqlite3 + Drizzle, no sign-in, CSV export. Exercises the attribution-field rule, the
`Target OS` / Auto-update drops in **Section 2.1**, and the Playwright Electron harness.

**Persona:** *Marta*, a lab supervisor. Three techs share each PC and share the one Windows login
on it. The lab PCs have no internet — a rule, not a limitation.

**Time:** ~3 hours including the skeleton build.

Read [README.md](README.md) first — prerequisites, plugin loading, global criteria G1–G10, defect
template.

---

## 0. Prerequisites for this run

- Bun 1.2+
- **Node.js 22.12 or later (LTS)** — Playwright's runner and electron-vite both run on Node, and
  without it `bun run test:e2e` can hang. Check with `node --version`.
- No Docker, no cloud account.
- `bun run package` builds installers only for the OS you run it on. If you are on macOS, you
  cannot produce the Windows NSIS installer locally — see step 9 note.

## 1. Create the UAT repo

```bash
mkdir -p ~/uat-workspace/benchlog && cd ~/uat-workspace/benchlog
git init
```

Empty repo, no commits — pure greenfield.

---

## 2. Session 1 — `/peak-workflow:new-project`

```bash
cd ~/uat-workspace/benchlog
claude --plugin-dir /Users/schaveyt/github/peakflames/claude-plugins-peakflames/plugins/peak-workflow
```

```
/peak-workflow:new-project Our lab techs need to log sample readings on the PCs in the lab. They type in a sample number, a couple of measurements, and their initials so we know who did it. At the end of the week the QA lead needs a CSV file of everything to send to the client. The lab PCs are Windows and they have no internet connection at all — that's a rule, not a limitation.
```

**Expect:** Verdict **GREENFIELD**, nothing written, no branch created.

**Answer:** *"I'll run it manually"*.

**Check:** `git status --porcelain` empty; `git branch` empty; `ls -a` shows only `.git`.

---

## 3. Session 2 — `/peak-workflow:setup`

Fresh session, then `/peak-workflow:setup <same description>`.

### What to answer

| Order | Question | Answer as Marta |
|---|---|---|
| 1 | Project type | **"Desktop app"** — "they install it on the lab PCs" |
| 2 | Required language or platform | **"No, we don't have one."** |
| 3 | Which computers, and do they have internet? | **"Windows only. No internet, ever."** |
| 4 | Shape questions **1–3** (desktop asks only these) | "No — each PC keeps its own log. The QA lead gets the CSV. No files attached." |
| 4a | **The separate-accounts clarifier** | **"They just type their initials. They all share the one Windows login on that PC."** |
| 5 | One combined confirmation | Read and accept |
| 6 | **Publish to GitHub** — asked on its own, *after* the setup commit, as one question pair (where / who can see it) | **"Not now — keep it on this computer"** |

### The trap

This project's whole point is the sign-in question. When Marta says "the QA lead needs the CSV"
and "their initials", `setup` must:

- record `Q2: no — attribution only (entered-by field)`,
- **not** write an `**Access rule:**` line,
- **not** route to `bun-web-app-stack.md`,
- **not** turn this into a Hybrid with service layers.

An exported file is not "seeing the data"; typed initials are an attribution field. If it routes
to sign-in, stop and file a **Critical** finding naming the exact question and answer.

### What to check

```bash
cd ~/uat-workspace/benchlog
git log --oneline                  # one commit: "chore: initial project setup"
git branch                         # * develop, main
grep -n 'Q[1-6] \|Access rule\|Target OS\|N/A' CLAUDE.md
```

| # | Check | Pass when |
|---|---|---|
| 3.1 | Question count ≤ 5 (G8) | counted |
| 3.2 | `**Product shape:**` block has **Q1, Q2, Q3 and Q6**; **Q4 and Q5 are written `not asked (Desktop app)`** | not omitted — the labels are fixed |
| 3.3 | `Q2: no — attribution only (entered-by field)` | verbatim |
| 3.4 | **No** `**Access rule:**` line | `grep -c 'Access rule' CLAUDE.md` → 0 |
| 3.5 | `Q6 Internet on the computers it runs on: no` | present |
| 3.6 | Tech Stack has `Target OS: Windows` | present |
| 3.7 | If you are building on a Mac: `Build: CI runner for Windows` recorded, and the Release Protocol CI note names it | present |
| 3.8 | Auto-update row written `N/A — no internet on the target computers (shape Q6)` — **marked, not omitted** | present in the Stack Summary |
| 3.9 | The rest of the Tech Stack matches the sheet's Section 2: Electron, electron-vite, React 19, Tailwind v4 + shadcn/ui, Zustand + TanStack Query, TanStack Router **memory history**, Zod-validated IPC, Drizzle + better-sqlite3, `bun test`, Playwright Electron launcher, Biome 2, Knip, electron-builder | no substitutions |
| 3.10 | Version exposure is the **desktop** mechanism: Help > About (App menu > About on macOS) opening an **in-app renderer dialog** reading `app.getVersion()` over IPC, plus the startup log line | **not** a native About panel — Playwright cannot assert outside the DOM |
| 3.11 | Logging convention is **electron-log** (`electron-log/main`, `log.initialize()`), file under `app.getPath('logs')`, plain text; renderer via `electron-log/renderer` | not Pino |
| 3.12 | Exit code + stdout/stderr rows are `N/A` (no CLI entry point) | marked |
| 3.13 | `## UX Baseline` present, including the **Desktop conventions** bullets | file-dialog bullet should be **active** — the ConOps names Export |
| 3.14 | Local Environment names `bun run dev`, `bun run test`, `bun run test:e2e` (builds, then Playwright Electron against the build) and **names Node.js 22.12+ as a prerequisite** | present |
| 3.15 | Step 8 reported `frontend-design` `[MISS]` and `playwright-cli` **`[N/A]` — desktop apps verify through the Playwright Electron harness** | the N/A wording matters |
| 3.16 | First commit made | `git show --stat HEAD` |
| 3.17 | **`develop` created and checked out**; `main` holds only the setup commit | `git branch` shows `* develop` and `main`, both at the same commit |
| 3.18 | The publish question came **after** the commit, on its own — not folded into the confirmation — and "Not now" reported `[N/A] GitHub — not published` | nothing was created on GitHub |
| 3.19 | `.claude/skills/<shadcn>/` exists and is in the setup commit | `git show --stat HEAD` lists it |
| 3.20 | `.mcp.json` has a `shadcn` server entry (`bunx --bun shadcn@latest mcp`); exactly two skills added, `.claude/skills/shadcn/` and `.claude/skills/migrate-radix-to-base/`; `skills-lock.json` is committed; no root `package.json`, `package-lock.json` or `node_modules/` appeared from the install | `grep -n shadcn .mcp.json`; `git status --short` clean after setup |
| 3.21 | The shadcn skill and MCP server were **not asked about** — shown only in the one confirmation | no separate question |
| 3.22 | "Restart Claude Code before the next command, and approve the `shadcn` server when asked." was printed | restart, then approve on the next session |
| 3.23 | UX Baseline has a `**shadcn tooling:**` line | `grep -c 'shadcn tooling:' CLAUDE.md` → 1 |
| 3.24 | Setup reported `[N/A] Playwright browsers — Electron supplies its own` | no Playwright install step in Local Environment |

---

## 4. Session 3 — `/peak-workflow:discover`

Fresh session, `/peak-workflow:discover`. Accept the offered `docs/benchlog` branch.

**Answer as Marta:**

- *Problem:* "Techs write readings on a clipboard and somebody types them into a spreadsheet on
  Friday. Things get transposed, and we can't tell who wrote what."
- *Users:* "Bench techs enter readings. The QA lead reads the export. That's it."
- *Success:* "A week's readings come out as one CSV with no retyping, and every row says who
  entered it."
- *Constraints:* **"The PCs have no internet. Nothing may try to phone home."**
- *Out of scope:* "Anything web-based. Anything that syncs between PCs."

**Step 4.5 Product-Shape Re-check:** your scenarios stayed single-PC with an exported file, so it
should report **no contradictions**. If the QA-lead scenario makes it propose flipping Q2 to yes,
read its reasoning — it must **ask** before changing anything, and taking "reads the CSV" as
sign-in is a finding.

**At Step 6:** choose *"Continue planning"*.

| # | Check | Pass when |
|---|---|---|
| 4.1 | On `docs/benchlog`, base branch untouched (G1) | `git log --oneline develop` still one commit |
| 4.2 | Vision has all 11 sections, ConOps all 9, both substantive | no placeholders |
| 4.3 | ConOps Section 5 steps are numbered and name specific fields (sample number, measurement, initials) and the export action | present |
| 4.4 | ConOps Section 8 records the **no-internet constraint** as an operational constraint | present |
| 4.5 | The Product-Shape Re-check did not silently flip Q2 | it asked, or reported no contradiction |
| 4.6 | Next Step recommends `/peak-workflow:mockup` first | UI project |

---

## 5. Session 4 — `/peak-workflow:mockup`

Fresh session, `/peak-workflow:mockup`.

**Expect:** screens such as `S-01 Reading Log`, `S-02 New Reading`, plus — for a desktop app — an
**Application menu** row and a **Window** row. Those two carry `—` in the Wireframe column;
`mockup` draws no wireframe for them and their contract is the `screens.md` row plus the Desktop
conventions TORs.

| # | Check | Pass when |
|---|---|---|
| 5.1 | `ux/screens.md` + `ux/wireframes/S-NN-*.html` exist | present |
| 5.2 | Application menu and Window rows present with `—` wireframes | present, no stray HTML for them |
| 5.3 | Wireframes are grayscale, no typefaces | grep finds no colors/fonts |
| 5.4 | Each data-bearing screen has loading / empty / error / populated states | present |
| 5.5 | ConOps Section 5 rewritten to name screens and controls | `grep -n 'S-0' docs/product-vision-planning/concept-of-operations.md` |
| 5.6 | A `# Note: reference screen` line names the screen(s) the skeleton owns | present |
| 5.7 | **`wireframes/index.html` exists**, links every `S-NN`, and **opened in your browser by itself**. The Application menu and Window rows appear as **plain text, not links** | they have no wireframe |
| 5.8 | **No inventory table or mermaid block was dumped to the terminal**, and the wireframes were written in parallel | `mockup` drafts autonomously and gates once, on the wireframes |

---

## 6. Session 5 — `/peak-workflow:capture-requirements`

Fresh session. Approve the grouping if it is capability-shaped (e.g. `readings`, `export`,
`app-shell`) rather than layer-shaped.

| # | Check | Pass when |
|---|---|---|
| 6.1 | Feature file + tracing sidecar pairs exist | matched |
| 6.2 | TOR IDs unique and well-formed (G3) | `grep -rhoE 'TOR-[0-9]{2}-[A-Za-z0-9]{7}' docs/requirements/ \| sort \| uniq -d` empty |
| 6.3 | `# Tool Hygiene & Operability` block present with the **About-dialog** version TOR, the main-process startup log line, electron-log convention, and the error-message standard | exit code / stdout-stderr TORs absent (N/A) |
| 6.4 | `# UX Baseline` block present, including **Desktop conventions** — native application menu, window state, About dialog, and the **file dialog** TOR for the CSV export | file dialog must be there — the ConOps names Export |
| 6.5 | An **attribution TOR** exists for the initials field (who entered a reading), and **no access-control TORs** | correct for a no-sign-in project |
| 6.6 | A TOR covers the CSV export content and the file-dialog round trip | present |
| 6.7 | Nothing committed | the merge is the approval gate |

---

## 7. Session 6 — `/peak-workflow:plan-project`

Fresh session, `/peak-workflow:plan-project`.

| # | Check | Pass when |
|---|---|---|
| 7.1 | v2.5.0 layout complete (phase indexes, epic specs, `status/` sidecars, `session-handoffs/`, README, stub index) | present |
| 7.2 | Every TOR owned by exactly one epic, no duplicates (G4) | `grep -rhoE 'TOR-[0-9]{2}-[A-Za-z0-9]{7}' docs/implementation-plan/status/ \| sort \| uniq -d` empty |
| 7.3 | The skeleton spec names the desktop specifics the sheet supplies: `trustedDependencies` (`electron`), better-sqlite3 **N-API prebuilds with `npmRebuild: false`** (no native rebuild), `asarUnpack` for `better-sqlite3`, `contextIsolation` + `sandbox` + `nodeIntegration: false`, **Zod-validated IPC**, and `migrate()` at startup resolving the SQL folder from `process.resourcesPath` when packaged | **all six** — a missing one is Critical |
| 7.4 | The skeleton also owns the root `tsconfig.json`, `components.json`, the native `menu.ts`, window-state persistence, and the About dialog | present in Key Components |
| 7.5 | **Section 2.1 drops applied** for Auto-update: no `src/main/updater.ts`, no `electron-updater` dependency, `publish: null` in 4.8, no `zip` in `mac.target`, no `startUpdater` call in `src/main/index.ts` | check each — `publish: null` matters, otherwise electron-builder infers GitHub from the git remote |
| 7.6 | **Section 2.1 `Target OS` drops applied** — `Target OS: Windows` means the `mac` and `linux` blocks in 4.8 are omitted, and no script names were removed | check `electron-builder` config |
| 7.7 | The **offline rule** is honored in the plan: no CDN scripts or stylesheets, no web fonts fetched at launch (system stack or a bundled `@fontsource/*`), icons from bundled `lucide-react` only, no telemetry | stated in the skeleton spec |
| 7.8 | The skeleton names the **test-only fault/latency switch** (env var read at startup, ignored when `app.isPackaged`) and the **data reset** that redirects `app.getPath('userData')` to a fresh temp dir per test | present in Key Components |
| 7.9 | The E2E harness is self-contained: `test:e2e` builds first (`bun run build`), and the launcher uses **`args: ["."]`** so Electron reads `package.json` — not a path to `out/main/index.js` | this exact bug was fixed in v1.11.0; a regression is Critical |
| 7.10 | Playwright is scoped to the E2E directory only | `testDir` set |
| 7.11 | The skeleton spec has a `## Screens` section; the Application menu and Window rows carry `—` | present |

---

## 8. Merge the `docs/` branch

```bash
git status --short
git checkout develop
git merge docs/benchlog --no-ff
ls docs/requirements/*.feature.md    # must succeed on main
```

---

## 9. Session 7 — `/peak-workflow:start-epic <skeleton-id>`

Fresh session. Approve the plan, then let it run unaided.

| # | Check | Pass when |
|---|---|---|
| 9.1 | Plan mode entered before any write; no unsubstituted placeholders | verified |
| 9.2 | Branch `feature/epic-<id>-<short-name>` off `main` | `git branch --show-current` |
| 9.3 | Tree matches sheet Section 3; config files match Section 4 verbatim minus the 2.1 drops | diff against the sheet |
| 9.4 | `bun install` succeeded and downloaded the Electron binary via `trustedDependencies` | `ls node_modules/electron/dist` |
| 9.5 | **`bunx shadcn@latest init` was NOT run** — the desktop sheet ships `components.json`, `lib/utils.ts` and the token stylesheet itself; only `bunx shadcn@latest add <name>` is valid here | a stray `init` is a finding |
| 9.5a | `radix-ui` (unified) is declared; **no** per-primitive `@radix-ui/react-*` entries | `grep '@radix-ui' package.json` returns nothing |
| 9.5b | `bun run check` is green on the **scaffold alone**, before domain code | Biome `preset` and knip's config hints are exit-code-bearing; red on an empty repo is Critical |
| 9.5c | Contrast: `--ring`, `--muted-foreground` and `--input` carry the **retuned** values from 4.10, not the stock ones | `grep -E '\-\-(ring|input|muted-foreground):' src/renderer/src/index.css` |
| 9.6 | **G5** — the deferred-value grep on `CLAUDE.md` returns nothing on this branch | skeleton resolved every TBD |
| 9.7 | `bun run dev` launches an Electron window with the app shell, navigation, theme wiring, native menu, window-state persistence and the About dialog | observe it |
| 9.8 | Help > About shows `benchlog v0.1.0` from `app.getVersion()` over IPC, rendered **in the DOM** | assertable by Playwright |
| 9.9 | The reference screen renders all four states | force them with the fault switch |
| 9.10 | **G6** — you run `bun run check` and `bun run test:e2e` yourself, cold, and both pass | first real execution of the sheet |
| 9.11 | `bun run package` produces an installer for the OS you are on | on Windows: an NSIS installer in `dist/`. On macOS, expect it to fail or produce nothing for Windows — that is correct behavior, and `Build: CI runner for Windows` should already be recorded |
| 9.12 | The plan has a numbered **Design pass** step before screen work, naming the shadcn skill (and `frontend-design` if installed) | present in the plan |
| 9.13 | `Skill(...)` calls for those design skills appear in the transcript **before** any screen code | visible in order |
| 9.14 | `mcp__shadcn__*` tools were used | visible in the transcript |
| 9.15 | The handoff's Key Decisions has a `Design skills used:` line | `grep -n 'Design skills used:' docs/implementation-plan/session-handoffs/*` |

> **Expected failure surface here:** the desktop sheet's npm-verified pins (Electron ^44,
> better-sqlite3 ^13 N-API) have never been installed. If `bun install` or the native module load
> fails, capture the exact versions resolved (`bun pm ls | grep -E 'electron|better-sqlite3'`) and
> file it as **Critical**.

---

## 10. Session 8 — `/peak-workflow:wrapup-epic <skeleton-id>`

First, in the **implementer's** session, run `/peak-workflow:wrapup-epic <id>` and confirm the
**Session Guard refuses**. That refusal is a PASS. Then close it and start a fresh session.

| # | Check | Pass when |
|---|---|---|
| 10.1 | Session Guard fired in the implementer's session | refusal printed |
| 10.2 | It checked out the feature branch before reading the sidecar/spec, then re-read `CLAUDE.md` from that branch | the skeleton edited `CLAUDE.md`, so this matters |
| 10.3 | Deferred-value gate (G5 grep) run and reported | walking-skeleton gate |
| 10.4 | **UX Baseline check ran through the Playwright Electron harness**, not `playwright-cli` | `playwright-cli` cannot attach to an Electron window — using it is a finding |
| 10.5 | Desktop conventions verified: native menu, window state, About dialog, and the **file dialog** on the export action | each PASS/FAIL with evidence |
| 10.6 | **No access-control check** ran | correct — no `**Access rule:**` line |
| 10.7 | Any verifier fix recorded `FIXED DURING WRAPUP` in the Deferrals table | disclosed |
| 10.8 | Sidecar → `status: Complete`, `completed:` and `handoff:` filled; handoff file written | `cat docs/implementation-plan/status/epic-<id>.md` |
| 10.9 | Ship mode asked neutrally | choose **Solo** |
| 10.10 | Solo merged `--no-ff`, deleted the branch, said it did not push | `git log --oneline -5` |
| 10.11 | The report shows the `Design skills used:` line under a `## Design` heading | matches the handoff |

---

## 11. Session 9 — `/peak-workflow:status`

| # | Check | Pass when |
|---|---|---|
| 11.1 | Dashboard renders, Requirements Coverage 100% planned (G7) | no errors |
| 11.2 | Read-only — nothing modified | `git status --porcelain` empty |

---

## 12. Optional — the export slice

If time allows, run the CSV-export epic through `start-epic` → `wrapup-epic`. It is the best
second slice here: it exercises the file-dialog TOR, the attribution field end to end, and a
second screen inheriting the skeleton's design system and app shell.

---

## 13. Run summary

```
Project: Benchlog (Electron desktop)
Plugin ref: <git rev-parse --short HEAD in the plugin repo>
Date: 
Node version: ____   Bun version: ____   Build OS: ____
Global criteria:  G1 __  G2 __  G3 __  G4 __  G5 __  G6 __  G7 __  G8 __  G9 __  G10 __
Questions asked by setup: __
Sign-in trap: did setup correctly record "attribution only"?  YES / NO
Skeleton build: PASS / FAIL
`bun run package`: PASS / FAIL / N/A (cross-OS)
Findings filed: F-__ … F-__
Overall: PASS / PASS WITH FINDINGS / FAIL
```
