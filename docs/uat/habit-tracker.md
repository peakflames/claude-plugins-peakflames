# UAT — Habit Tracker (static SPA route)

**Route under test:** `references/bun-static-spa-stack.md` — browser-only React SPA, Dexie /
IndexedDB, GitHub Pages. **This sheet had no dry-run coverage in the v2.0.0 validation cycle**,
so it is the highest-risk of the four runs.

**Persona:** *Dana*, a freelance illustrator with one laptop, no account, no server, no idea what
any of those words mean.

**Time:** ~2–3 hours including the skeleton build.

Read [README.md](README.md) first — prerequisites, how to load the plugin, the global pass/fail
criteria (G1–G10), and the defect template.

---

## 0. Prerequisites for this run

- Bun 1.2+
- `bunx playwright install` (one time — the static sheet's E2E runs Playwright against
  `vite preview`)
- No Docker, no Node, no cloud account needed

## 1. Create the UAT repo

```bash
mkdir -p ~/uat-workspace/habit-tracker && cd ~/uat-workspace/habit-tracker
git init
```

Leave it empty — no commits, no files. This run is **pure greenfield**: `setup` Step 9's
unborn-HEAD check should notice there is no `HEAD` yet and make the first commit itself.

**Check before you start:** `git log` fails with "does not have any commits yet". Good.

---

## 2. Session 1 — `/peak-workflow:new-project`

```bash
cd ~/uat-workspace/habit-tracker
claude --plugin-dir /Users/schaveyt/github/peakflames/claude-plugins-peakflames/plugins/peak-workflow
```

Then, in the session:

```
/peak-workflow:new-project I want a simple habit tracker I can open in my browser. I add a habit — like "stretch" or "read 20 pages" — and each day I mark whether I did it. It shows me how many days in a row I've kept each habit going. It's just for me; nobody else needs to see it, and I don't want to make an account or sign in to anything.
```

**Expect:** a `## Project State Detection` block with **Verdict: GREENFIELD**, the seven signal
lines all "no", then a five-step recommended path, then one question offering to run
`/peak-workflow:setup` now.

**Answer:** *"I'll run it manually"* — so you can observe `setup` in its own clean session.

**Check:**

| # | Check | Pass when |
|---|---|---|
| 1.1 | Verdict is GREENFIELD | not ASK USER, not MIGRATE |
| 1.2 | `Existing code … : no` | the empty repo is detected as empty |
| 1.3 | **Nothing was written** | `git status --porcelain` is empty and `ls -a` shows only `.git` |
| 1.4 | No branch was created | `git branch` is empty |

Exit the session (`/exit` or Ctrl-D).

---

## 3. Session 2 — `/peak-workflow:setup`

Start a fresh session with the same `--plugin-dir` command, then:

```
/peak-workflow:setup I want a simple habit tracker I can open in my browser. I add a habit and each day I mark whether I did it. It shows me how many days in a row I've kept each habit going. It's just for me and I don't want to sign in to anything.
```

### What to answer, in order

`setup` should ask **only these**, in roughly this order. Count them — G8 says 2–5 is the contract.

| Order | Question it should ask | Answer as Dana |
|---|---|---|
| 1 | Project Overview | *should not be asked* — it has your description; it should draft the overview and fold it into the confirmation |
| 2 | Project type (plain gloss first, technical label in parentheses) | **"Web app"** — "I open it in my browser" |
| 3 | Required language or platform | **"I don't know, whatever you recommend."** |
| 4 | The five shape questions, as **one block** | "No, I only use my laptop. No, it's just mine. No files. Nothing updates by itself." |
| 4a | *clarifier if it presses on sign-in* | "Nobody else uses it at all. I don't want an account." |
| 5 | One combined confirmation of everything defaulted | Read it, then accept |
| 6 | **Publish to GitHub** — asked on its own, *after* the setup commit, as one question pair (where / who can see it) | **"Not now — keep it on this computer"** |

### What to expect

- The shape questions must be asked **as one block**, in plain language, with **no** use of the
  words *client-side, backend, database, authentication, object storage*.
- Q5 should **not** be asked as its own question — with Q2 and Q3 both "no" it is answerable, and
  the sheet records it as `N/A — the bundle is public, so there is no secret to hold (shape Q5)`.
- The confirmation should be a few short plain lines (where it runs, where data lives, how it is
  checked), **not** one line per stack layer, and **not** a separate question per layer.
- It should tell you it will make the first commit.

### What to check

```bash
cd ~/uat-workspace/habit-tracker
git log --oneline            # expect one commit: "chore: initial project setup"
git branch                   # expect: * develop, main
ls docs/                     # expect requirements/ architecture.md design-notes.md
grep -n '^## ' CLAUDE.md
```

| # | Check | Pass when |
|---|---|---|
| 3.1 | Question count | ≤ 5 questions asked in total (G8) |
| 3.2 | `## Project Overview` is the first section of `CLAUDE.md`, drafted from your description, 2–4 sentences | present, not a placeholder |
| 3.3 | `**Product shape:**` block present with **Q1–Q5 all recorded**, each in Dana's own words | `grep -n 'Q[1-5] ' CLAUDE.md` shows five lines |
| 3.4 | Q6 is **absent** (Desktop-only) | no `Q6` line |
| 3.5 | **No** `**Access rule:**` line (Q2 was no) | `grep -c 'Access rule' CLAUDE.md` → 0 |
| 3.6 | Tech Stack names `bun-static-spa-stack.md` as its source | the sheet name appears in the Tech Stack section |
| 3.7 | Tech Stack matches the sheet's Section 2 verbatim — Vite 6, React 19, Tailwind v4 + shadcn/ui, Zustand, `dexie-react-hooks` `useLiveQuery`, **TanStack Router with hash history**, Dexie 4, Zod, `date-fns`, `vite-plugin-pwa`, JSON export/import, `bun test`, Playwright vs `vite preview`, Biome 2, Knip, GitHub Pages | no substitutions, no "modernizing" |
| 3.8 | Version exposure is the **static-SPA** mechanism — `package.json#version` injected as `__APP_VERSION__`, rendered in the footer, plus the version-stamped first console line | **not** a `GET /version` endpoint — a browser-only app has no server |
| 3.9 | Logging convention is the **browser console** with declared levels | not Pino, not a file path |
| 3.10 | Exit code + stdout/stderr rows are `N/A — not a CLI` | present and marked N/A, not omitted |
| 3.11 | `## UX Baseline` section exists (Web app) | present, with the bold line labels intact |
| 3.12 | Local Environment names `bun run dev` (Vite on :5173), `bun run test`, `bun run test:e2e` (builds and previews first) | matches the sheet's Section 9 |
| 3.13 | The "Verification runs against the real, running project…" line is present verbatim | `grep -n 'never mock' -i CLAUDE.md` |
| 3.14 | No `TBD — set by the walking-skeleton epic` lines that a sheet could have decided | a few are acceptable; a TBD for a value the sheet supplies is a finding |
| 3.15 | Step 8 reported `frontend-design` and `playwright-cli` as `[MISS]` with install commands | printed, and recorded on a `**Recommended skills:**` line |
| 3.16 | The first commit exists and stages only setup's own files | `git show --stat HEAD` |
| 3.17 | **`develop` created and checked out**; `main` holds only the setup commit | `git branch` shows `* develop` and `main`, both at the same commit |
| 3.18 | The publish question came **after** the commit, on its own — not folded into the confirmation — and "Not now" reported `[N/A] GitHub — not published` | nothing was created on GitHub |
| 3.19 | `.claude/skills/<shadcn>/` exists and is in the setup commit | `git show --stat HEAD` lists it |
| 3.20 | `.mcp.json` has a `shadcn` server entry (`bunx --bun shadcn@latest mcp`); exactly two skills added, `.claude/skills/shadcn/` and `.claude/skills/migrate-radix-to-base/`; `skills-lock.json` is committed; no root `package.json`, `package-lock.json` or `node_modules/` appeared from the install | `grep -n shadcn .mcp.json`; `git status --short` clean after setup |
| 3.21 | The shadcn skill and MCP server were **not asked about** — shown only in the one confirmation | no separate question |
| 3.22 | "Restart Claude Code before the next command, and approve the `shadcn` server when asked." was printed | restart, then approve on the next session |
| 3.23 | UX Baseline has a `**shadcn tooling:**` line | `grep -c 'shadcn tooling:' CLAUDE.md` → 1 |
| 3.24 | Local Environment names the one-time `bunx playwright install chromium` step | present |

**Common failure to watch for:** if `setup` routes to `bun-web-app-stack.md` despite five "no"
answers, that is **Critical** — record which answer it misread.

---

## 4. Session 3 — `/peak-workflow:discover`

Fresh session, then `/peak-workflow:discover`.

**Expect first:** the Branch Guard. You are on `main` (or `master`), so it must offer a
`docs/{derived}` branch — something like `docs/habit-tracker`. Accept the derived name.

**Then:** an adaptive interview. Answer as Dana, briefly and non-technically. Keep it short — the
point is the artifacts, not the interview depth. Some answers to have ready:

- *Problem:* "I keep losing track of whether I actually did the thing. Paper streaks work but I
  lose the paper."
- *Users:* "Just me. People like me — one person, one device."
- *Success:* "I can see at a glance how many days in a row I've kept a habit."
- *Out of scope:* "Sharing, reminders, anything social."
- *Data:* "It should keep working with no internet. I'd like to be able to save a backup file."

**Then Step 4.5:** the Product-Shape Re-check. It reads back the `Q1:`–`Q5:` lines and asks before
changing anything. Your scenarios stayed single-device, so it should report **no contradictions**.

**At Step 6** choose *"Continue planning"* — do **not** merge yet.

**Check:**

```bash
git branch --show-current                                   # docs/habit-tracker
wc -w docs/product-vision-planning/*.md
grep -n '^## ' docs/product-vision-planning/product-vision.md
grep -n '^## ' docs/product-vision-planning/concept-of-operations.md
```

| # | Check | Pass when |
|---|---|---|
| 4.1 | A `docs/` branch was created and you are on it | G1 depends on this |
| 4.2 | `product-vision.md` has all 11 numbered sections with substantive content | no placeholders |
| 4.3 | `concept-of-operations.md` has all 9 sections | same |
| 4.4 | ConOps Section 5 scenarios have **numbered steps naming specific UI elements and data fields** | not "the user tracks a habit" |
| 4.5 | Product Shape Re-check reported no contradictions | and did not silently rewrite the block |
| 4.6 | Next Step recommends `/peak-workflow:mockup` **before** capture-requirements (UI project) | present |
| 4.7 | **Nothing was committed on the base branch** | `git log --oneline develop` still shows one commit |
| 4.8 | No ConOps §8 `What Must Never Happen` table | correct — this product switches no equipment |

---

## 5. Session 4 — `/peak-workflow:mockup`

Fresh session, then `/peak-workflow:mockup`.

**Expect:** it continues on the existing `docs/` branch (no new branch) and **drafts
autonomously — there is no inline interview**. It prints one short line per screen, writes
`ux/screens.md` (inventory, states, mermaid flows), writes every wireframe **in parallel**, writes
`wireframes/index.html`, then **opens that index in your default browser** and gates once. Only
after that does it rewrite ConOps Section 5.

**Answer as Dana:** click through the index, open a screen, use its state buttons. Approve unless
something is actually wrong. Feedback here may be **structural** — a missing screen, two that
should be one — not just cosmetic; up to 3 adjustment rounds. Expect screens like `S-01 Habit
List`, `S-02 Add Habit`, maybe `S-03 Habit Detail / Streak`.

**Check:**

```bash
ls docs/product-vision-planning/ux/
ls docs/product-vision-planning/ux/wireframes/
grep -rn 'S-0' docs/product-vision-planning/concept-of-operations.md | head
grep -riE 'color|#[0-9a-f]{6}|font-family' docs/product-vision-planning/ux/wireframes/ | head
```

| # | Check | Pass when |
|---|---|---|
| 5.1 | `ux/screens.md` exists with `S-NN` IDs and a `Wireframe` column | present |
| 5.2 | One `wireframes/S-NN-*.html` per data-bearing screen | present |
| 5.3 | Wireframes are **grayscale** — no colors, no typefaces | the grep above finds nothing meaningful |
| 5.4 | Each data-bearing screen has a `## States` block covering loading / empty / error / populated | present |
| 5.5 | ConOps Section 5 steps now name screens (`the Habit List (S-01)`) and controls (`the "Add habit" button`) | the grep finds `S-0` hits in the ConOps |
| 5.6 | A `# Note: reference screen` line names the screen(s) the skeleton will own | present in `screens.md` or carried to capture-requirements |
| 5.7 | `frontend-design` was **not** invoked | it is not in the transcript |
| 5.8 | **`wireframes/index.html` exists**, links every `S-NN`, and has no dead links | it is not itself a screen — no `S-NN` ID, no row in `screens.md` |
| 5.9 | The index **opened in your browser by itself**; the absolute paths were printed as a fallback | a bare path you have to click is the old behavior |
| 5.10 | **No inventory table or mermaid block was dumped to the terminal** — just one short line per screen | tables and mermaid are unreadable there; the gate is the wireframes |
| 5.11 | The wireframes were written **in parallel**, in one turn | visible as batched writes in the transcript |

---

## 6. Session 5 — `/peak-workflow:capture-requirements`

Fresh session, then `/peak-workflow:capture-requirements`.

**Expect:** it continues on the `docs/` branch, proposes a feature-file grouping, and asks you to
approve it (the **only** chance to adjust grouping). Then it authors the feature files
autonomously — there is no line-by-line interview — and spawns a Haiku sub-agent to write the
`.feature.tracing.json` sidecars.

**Answer:** approve the grouping unless a file is obviously layer-shaped ("database", "UI") rather
than capability-shaped ("habits", "streaks", "backup"). A layer-shaped proposal is a finding.

**Check:**

```bash
ls docs/requirements/
grep -c '^  Scenario:' docs/requirements/*.feature.md
grep -rhoE 'TOR-[0-9]{2}-[A-Za-z0-9]{7}' docs/requirements/ | sort | uniq -d   # expect empty
grep -n 'Tool Hygiene & Operability\|# UX Baseline' docs/requirements/01-*.feature.md
```

| # | Check | Pass when |
|---|---|---|
| 6.1 | One `.feature.md` + one `.feature.tracing.json` per functional area | pairs match |
| 6.2 | Every TOR ID matches `TOR-[0-9]{2}-[A-Za-z0-9]{7}` and is unique (G3) | the `uniq -d` above is empty |
| 6.3 | The Scenario **title** carries the full "The {subject} shall …" statement | not a separate "Requirement:" field |
| 6.4 | A leading `# Tool Hygiene & Operability` block exists in `01-*.feature.md` | version exposure, startup console line, logging convention, error message standard — and **no** exit-code or stdout/stderr TORs (marked N/A) |
| 6.5 | A `# UX Baseline` block follows it | Screen states, Keyboard & focus, Forms, Destructive actions, Progress feedback, Layout floor, Contrast, Reduced motion, Navigation |
| 6.6 | Givens/Whens name screens exactly as `screens.md` does — `the Habit List (S-01)` | no paraphrases |
| 6.7 | Each data-bearing screen's empty and error states are their own negative-path TORs | present |
| 6.8 | The Step 7 summary shows ConOps steps covered `X of Y` with X = Y, or explicit deferrals | no silent gaps |
| 6.9 | **Nothing committed** | `capture-requirements` must not commit — the merge is the approval gate |

---

## 7. Session 6 — `/peak-workflow:plan-project`

Fresh session, then `/peak-workflow:plan-project`.

**Expect:** phases and epics derived from the TOR baseline, a negotiation step where it presents
the breakdown, then the plan written to disk. **Epic 0 is the walking skeleton** and owns every
tool-hygiene and UX-baseline TOR.

**Answer:** accept the breakdown unless an epic is layer-shaped (a "backend epic" and a "frontend
epic" for the same behavior is a Critical finding — a TOR must be observable end to end by its
owning epic).

**Check:**

```bash
ls docs/implementation-plan/
ls docs/implementation-plan/phase-*/
cat docs/implementation-plan/status/epic-*.md
grep -rhoE 'TOR-[0-9]{2}-[A-Za-z0-9]{7}' docs/implementation-plan/status/ | sort | uniq -d
```

| # | Check | Pass when |
|---|---|---|
| 7.1 | `phase-*/index.md`, `phase-*/epic-*.md`, `status/epic-*.md`, `session-handoffs/`, `README.md`, stub `index.md` all exist | v2.5.0 layout |
| 7.2 | Epic IDs are 7-char alphanumeric | not integers |
| 7.3 | Every sidecar has `status: Not Started` and a `requirements:` line | present |
| 7.4 | The union of `requirements:` across sidecars equals the TOR set from 6.2, with **no duplicates** (G4) | the `uniq -d` above is empty |
| 7.5 | The **skeleton epic** owns the tool-hygiene + UX baseline TORs | check its Requirements Anchors table |
| 7.6 | The skeleton spec names the static-sheet specifics: **hash history**, `base` from `BASE_PATH`, `__APP_VERSION__` injection, the Dexie `version().stores()` block, `fake-indexeddb` preloaded for tests, the JSON export/import pair, and the GitHub Pages deploy workflow | **all seven** — a missing one is a Critical finding |
| 7.7 | The skeleton spec names the **test-only fault/latency switch** as a build-time `import.meta.env` flag (a static SPA has no process environment) and a **data reset** that deletes and recreates the IndexedDB database per test | present in Key Components |
| 7.8 | The skeleton spec has a `## Screens` section listing the reference screen(s) with wireframe paths | present |
| 7.9 | Scenario titles in Requirements Anchors are **verbatim** from the feature files | spot-check three |
| 7.10 | The Step 6 self-check traces every TOR to exactly one epic | reported |

---

## 8. Merge the `docs/` branch

The planning sequence is approved as a unit. TOR files only become visible to `start-epic` after
this merge.

```bash
cd ~/uat-workspace/habit-tracker
git status --short                      # commit anything outstanding first
git checkout develop
git merge docs/habit-tracker --no-ff
git log --oneline
```

**Check:** `ls docs/requirements/*.feature.md` succeeds on `main`.

---

## 9. Session 7 — `/peak-workflow:start-epic <skeleton-id>`

Fresh session. Get the skeleton's ID from `docs/implementation-plan/phase-1-*/index.md`, then:

```
/peak-workflow:start-epic <id>
```

**Expect, in order:**

1. Context load, Requirements Anchors verified TOR by TOR.
2. A feature branch `feature/epic-<id>-<short-name>` created from `main`.
3. **Plan mode** — mandatory. It must not write code before you approve.
4. The plan follows `PLAN_TEMPLATE.md`: Opening steps, Middle steps authored from the TOR
   Given/When/Then, a **Deferral gate** paragraph, and Closing steps — all with placeholders
   substituted (no literal `<id>` or `<TOR-list>` left in the text).

**Answer:** review the plan, then approve it. Then **let it run unaided**.

**Check during/after:**

| # | Check | Pass when |
|---|---|---|
| 9.1 | Plan mode was entered before any file write | no edits precede plan approval |
| 9.2 | No unsubstituted placeholders in the plan | no `<id>`, `<short-name>`, `<test-directories>` literals |
| 9.3 | Branch is `feature/epic-<id>-<short-name>` off `main` | `git branch --show-current` |
| 9.4 | The tree matches the sheet's **Section 3 Repository Layout** | compare against `bun-static-spa-stack.md` §3 |
| 9.5 | The config files match **Section 4** verbatim, with only the project name substituted | diff them |
| 9.6 | `bun install` succeeded | `ls node_modules` |
| 9.6a | `bunx playwright install chromium` ran **right after** `bun install` | visible in the transcript |
| 9.7 | **`bunx shadcn@latest init` was NOT run** — the sheet ships `components.json`, `src/lib/utils.ts` and the token stylesheet itself (4.8, 4.11); only `bunx shadcn@latest add <name>` is valid | a stray `init` is a finding |
| 9.7a | The `cn` path alias resolves in both `tsconfig.json` and `vite.config.ts`, and **no npm package literally named `cn`** was installed | `grep '"cn"' package.json` returns nothing |
| 9.7b | `radix-ui` (unified) is declared; **no** per-primitive `@radix-ui/react-*` entries | `grep '@radix-ui' package.json` returns nothing |
| 9.7c | `bun run check` is green on the **scaffold alone**, before domain code — Biome `preset`, the CSS parser, and knip's config hints are all exit-code-bearing | a red check on an empty repo is a Critical finding |
| 9.7d | Contrast: `--ring`, `--muted-foreground` and `--input` carry the **retuned** values from 4.8, not the stock ones | `grep -E '\-\-(ring|input|muted-foreground):' src/index.css` |
| 9.8 | **G5** — `grep -nE 'TBD — set by the walking-skeleton epic\|— unconfirmed\|\*\*Not decided yet:\*\*' CLAUDE.md` on this branch returns nothing | the skeleton resolved them all |
| 9.9 | The reference screen renders loading / empty / error / populated | open it with `bun run dev` |
| 9.10 | **G6** — you run `bun run check` and `bun run test:e2e` yourself, cold, and both pass | this is the first real execution of the sheet |
| 9.11 | The cold `bun run test:e2e` shows no "Executable doesn't exist" error | Chromium was installed by the skeleton |
| 9.12 | The plan has a numbered **Design pass** step before screen work, naming the shadcn skill (and `frontend-design` if installed) | present in the plan |
| 9.13 | `Skill(...)` calls for those design skills appear in the transcript **before** any screen code | visible in order |
| 9.14 | `mcp__shadcn__*` tools were used | visible in the transcript |
| 9.15 | The handoff's Key Decisions has a `Design skills used:` line | `grep -n 'Design skills used:' docs/implementation-plan/session-handoffs/*` |

> **If the build fails:** that is the expected highest-value outcome of this run. Capture the
> exact file, the exact error, and the resolved dependency versions (`bun pm ls`), and file it as
> **Critical** per the README template. Then decide whether to hand-fix and continue, or stop.

---

## 10. Session 8 — `/peak-workflow:wrapup-epic <skeleton-id>`

**Must be a brand-new session** — wrapup has a Session Guard that refuses to run in a session
that implemented the epic. Verify that guard by trying it in the *same* session first:

```
/peak-workflow:wrapup-epic <id>
```

**Expect:** a refusal telling you to open a new session. **That refusal is a PASS** — record it.

Now close the session, start a fresh one, and run it for real.

**Expect:** it checks out the feature branch, re-reads `CLAUDE.md` from that branch, verifies each
TOR's Given/When/Then independently, runs the quality gates, presents a verification report, and
asks for a ship mode.

**Check:**

| # | Check | Pass when |
|---|---|---|
| 10.1 | The Session Guard fired in the implementer's session | refusal printed, nothing done |
| 10.2 | It checked out the feature branch **before** reading the sidecar/spec | visible in the transcript |
| 10.3 | It ran the **deferred-value gate** (the G5 grep) and reported PASS | walking-skeleton-only gate |
| 10.4 | It ran the **UX Baseline check** as a quality gate on the reference screen, forcing each of the four states with the fault/latency switch | each active line recorded PASS/FAIL with evidence |
| 10.5 | It did **not** run an access-control check | correct — no `**Access rule:**` line on this project |
| 10.6 | Any fix the verifier applied is recorded `FIXED DURING WRAPUP` in the Deferrals table | the one place self-review is disclosed |
| 10.7 | The sidecar is updated to `status: Complete` with `completed:` and `handoff:` filled | `cat docs/implementation-plan/status/epic-<id>.md` |
| 10.8 | A handoff file exists under `session-handoffs/` | present |
| 10.9 | Ship mode was **asked**, with both options presented neutrally and no recommendation | pick **Solo** |
| 10.10 | Solo mode merged with `--no-ff`, deleted the branch, and told you it did not push | `git log --oneline -5` |
| 10.11 | The report shows the `Design skills used:` line under a `## Design` heading | matches the handoff |

---

## 11. Session 9 — `/peak-workflow:status`

Fresh session, `/peak-workflow:status`.

| # | Check | Pass when |
|---|---|---|
| 11.1 | The dashboard renders without errors | no missing-file crashes |
| 11.2 | **Requirements Coverage** shows 100% of TOR IDs planned, and the skeleton's TORs as Complete | G7 |
| 11.3 | Ready-to-start epics are listed (the skeleton's dependents) | present |
| 11.4 | **Nothing was modified** | `git status --porcelain` is empty |

---

## 12. Optional — one more slice

If the skeleton built cleanly and you have time, run one domain epic
(`start-epic` → `wrapup-epic`) to exercise a non-skeleton path: TOR-driven tests, the
`## Screens` layout contract against a wireframe, and the UX Baseline gate on a second screen.
This is where "does a later screen actually copy the reference screen's pattern" gets tested.

---

## 13. Run summary

Fill this in and file it with your findings.

```
Project: Habit Tracker (static SPA)
Plugin ref: <git rev-parse --short HEAD in the plugin repo>
Date: 
Sessions completed: new-project / setup / discover / mockup / capture-requirements /
                    plan-project / start-epic / wrapup-epic / status
Global criteria:  G1 __  G2 __  G3 __  G4 __  G5 __  G6 __  G7 __  G8 __  G9 __  G10 __
Questions asked by setup: __
Skeleton build: PASS / FAIL (if FAIL, see F-__)
Findings filed: F-__ … F-__
Overall: PASS / PASS WITH FINDINGS / FAIL
```
