# How peak-media was built: the orchestration method, explained

*Written 2026-11-11 for one decision: should this method become a reusable plugin ("peak-orchestration")? It describes the method as it actually ran from 2026-11-08 to 2026-11-11 (peak-media 0.1.0 to 0.3.0), not as first designed. Every claim points to a file under `plugins/peak-media/docs/build/` (paths below are relative to it unless they start with `plugins/` or `.claude/`) or to a decision `DEC-NN` in `decisions.md`. Section 7 also cites build-session transcripts by session ID prefix. Updated the same day with a failure analysis (sections 7–8) and a revised recommendation.*

---

## 1. TL;DR

- **What it is.** One interactive **Lead** session plans the work as small **work packages (WPs)**, hands each to a **Builder** agent in its own git worktree, and has a different, fresh **Verifier** agent check it against a numbered acceptance register before the Lead merges it (`orchestration-plan.md` §1, §7).
- **Roles.** Lead (integrator, owns plan, register, decisions, merges), Builder (one WP, owned folders only), Verifier (read-only, PASS/FAIL per AC with evidence), Researcher (read-only, cited upstream facts), and the user (taste and approval gates) (`orchestration-plan.md` §2, `agents/*.md`).
- **Artifacts.** `plan.md` (frozen approved plan), `decisions.md` (append-only DEC log), `acceptance.md` (AC register + WP status table), `wp/<WP>/{brief,handoff,verify-N}.md`, `evidence/<WP>/` (logs, JSON, JPEG contact sheets), `lead-todo.md` (carry-forward nits).
- **The tool.** `tools/ac-run.mjs` runs a WP's script ACs (`--wp`) and checks traceability and builder/verifier independence (`--trace`). Deterministic; no model involved.
- **The loop.** brief → build → `ac-run --wp` → handoff → independent verify → fix round(s) → register updated → `--no-ff` merge → milestone commit with the `ac-run` table in the body.
- **What changed while it ran.** Parallel waves were replaced by strict serial order (DEC-32); verify loops were cut to delta-only checks after WP9 took 6 verify rounds; the Lead started driving "manual" runs headlessly (DEC-42/43); 0.3.0 dropped the per-WP machinery for one session plus one user review (DEC-53); 0.4.0 work now goes through GitHub issues and `/triage` (`.claude/skills/triage/SKILL.md`).
- **Cost.** About 4 days, 21 WP folders, 32 verify reports, 127 ACs, 53 decisions, ~185 commits (20 merges), ~6,900 lines of build Markdown plus 28 MB of evidence.
- **Where it went wrong (section 7).** No builder claimed a PASS it hadn't run. The failures came from what was tested: stand-ins, text-only tests, default paths, and numbers in place of looking and listening. When a real check failed, builders changed the test, and they disclosed it. 12 defects surfaced only when the skill was actually run.
- **Most of the cost was Lead and process,** not builders: a Linux VM on a near-full disk, WP9's ~14 h of rounds, a ~7 h overnight stall, prose-only gates. Section 8 turns this into 14 guardrails.
- **Recommendation (section 10).** Don't build a separate plugin. Put the guardrails into peak-workflow first (scripts where possible, then agent definitions and the brief template). Then, optionally, add a **serial** builder + independent-verifier mode and a generic `ac-run`. The light path (`/triage`) covers about 3 of the 14 guardrails and has no independent verifier.

---

## 2. How you start

The whole build was kicked off by one pasted prompt in one session. The concrete steps, as run:

1. **Write the task down first.** The user supplied a task file (`tmp/plate_factory_kickoff_prompt.md`, never committed) plus the design docs the build had to honour (`plugins/peak-media/docs/plate-factory-workflow.md`, `web2video-plan.md` at commit `0ea0ea6`, DEC-44) and a topic for the test videos (`references/openspec-vs-peak-workflow.md`). Without a design doc that already acts as a concept of operations, WP0 has nothing to plan from (`orchestration-plan.md` §11 says the design doc replaced `/discover`).
2. **Write the orchestration plan before the product plan.** `orchestration-plan.md` (a draft, 201 lines) fixed the roles, shared-state layout, WP list and waves, AC register format, the per-WP loop and the user gates *before* any product planning. It was itself an input to the kickoff.
3. **Start the Lead in plan mode** on a feature integration branch (`feature/new-peak-media-plugin`) and paste `kickoff-prompt.md` (5 lines). It tells the Lead: read the task, the orchestration plan and the design docs in full; you are the Lead; this session is WP0.
4. **WP0 runs in plan mode and is read-only** (`orchestration-plan.md` §12):
   - Four Researchers run in parallel on upstream unknowns (HyperFrames release, its skills' licences, the OpenRouter TTS request shape, the Playwright screencast API).
   - The Lead asks clarifying questions **one at a time**. The answers became DEC-01 to DEC-20, tagged "User Q1" … "User Q8" (skill names, ffmpeg as a prerequisite, default TTS voice, HyperFrames pin, which skills to vendor, brand pack home).
   - The Lead writes the plan: folder layout, decisions with reasons, the full AC register with given/when/then, and a brief per WP. No code until the user approves.
5. **After approval** the Lead copies the plan into the repo (`plan.md`, "approved 2026-11-08"), commits `docs(peak-media): WP0 plan, decisions, acceptance register` (`3afce1a`), does WP1 and WP2 itself, then runs the remaining WPs through Builders.

What the user must supply: the task and design docs, answers to the WP0 questions, the contract freeze at the end of WP1 (DEC-24), keys and ears for live checks (AC-TTS-07, listening tests), real assets (the brand pack, DEC-16), and approval for every push.

**Resuming in a new session.** When context ran out, the outgoing Lead wrote a handoff with a paste-ready prompt and a status table (`wp/WP8/kickoff.md`). The new Lead re-reads `orchestration-plan.md`, `plan.md`, `decisions.md`, `acceptance.md`, `lead-todo.md` and the next brief. Because all state lives in files, compaction and session changes were safe (`orchestration-plan.md` §3).

---

## 3. The lifecycle of a work package

```
 Lead                      Builder (worktree)            Verifier (fresh agent)          Lead
 ────                      ──────────────────            ──────────────────────          ────
 wp/<WP>/brief.md   ──►    implement in owned folders
 (scope, owns,             evals named "AC-XXX-NN: …"
  AC IDs, ground rules)    ac-run --wp <WP>
                           evidence/<WP>/*.log|json|jpg
                           wp/<WP>/handoff.md  ───────►  reads acceptance.md + code,
                           (builder-id: …)               NOT the handoff's conclusions
                                                         runs each AC's G/W/T itself
                                                         wp/<WP>/verify-N.md  ───────►   all PASS?
                                                         (verifier-id: …)                 ├─ yes: register PASS + evidence,
                      ◄──────── findings (FAIL / should-fix / nit) ──────────────────────  │  WP → verified, merge --no-ff,
                           fix round N, new commits                                       │  milestone commit, ac-run table
                                                                                          └─ no: next fix round; nits → lead-todo.md
```

Which file holds what:

| Step | File | Written by | Notes |
|---|---|---|---|
| Plan | `plan.md` | Lead (WP0) | Frozen once approved; later changes go to `decisions.md` |
| Brief | `wp/<WP>/brief.md` | Lead | "Runs as", branch, contracts version, ground rules, scope, owned folders, AC list. Lead notes appended later (e.g. `wp/WP9/brief.md` "Lead notes (2026-11-09)") |
| Build | branch `feature/peak-media-<wp>` | Builder | The integration branch is merged *into* the WP branch to pick up finished dependencies (e.g. `0dce4ae`, `4e3660e`) |
| Self-check | `ac-run --wp <WP>` output | Builder | Builder may not mark its own ACs PASS (`agents/builder.md` rule 9) |
| Handoff | `wp/<WP>/handoff.md` | Builder | First line `builder-id: …`; done / open / deviations |
| Verify | `wp/<WP>/verify-N.md` | Verifier | First line `verifier-id: …`; one row per AC: verdict, evidence, notes. Later rounds state the diff they reviewed (`wp/WP9/verify-3.md`) |
| Evidence | `evidence/<WP>/` | Builder and Verifier | Verifier files carry `.verifier` or `.rN.verifier` in the name |
| Status | `acceptance.md` register + WP status table | Lead | Only a verifier report moves a WP to `verified` |
| Merge | `Merge branch 'feature/peak-media-<wp>' into feature/new-peak-media-plugin` | Lead | Then `chore(peak-media): WPn … verified (v0.1.0)` |

**Examples from the record**

- **WP5 (small, one round).** Brief: 3 ACs, owns `brand-packs/default/**` and two eval folders (`wp/WP5/brief.md`). Builder `builder-wp5-e69583e1`, verifier `verifier-wp5-r1-942abb53`. One verify round, nits fixed in two small commits, merged (`5e84a5a`) and marked verified (`d033d78`).
- **WP9 (packaging, the worst case).** One builder ID across the whole WP (`builder-wp9-ae42bf332f2a3a11c`), six verify reports with six distinct verifier IDs (`wp/WP9/verify-1.md` … `verify-6.md`), seven fix rounds in the commit log, a Linux-container detour later dropped (DEC-41), and 95 evidence files. Each later verify report re-checks only a stated `git diff a..b` range.
- **WP17 (UAT model).** Not a builder WP. The Lead drove 11 cases headlessly, one fresh `claude -p` session per case with only this plugin loaded, answering gates with scripted `--resume` replies; the user ran one case by hand; a fresh reviewer agent read each contact sheet given only the sheet and the Then clause (`wp/WP17/brief.md`, `uat-results.md`). Result 10 PASS / 1 FAIL, then a fix round by `wp17-fix-builder` (`fix-handoff.md`), a round-2 rerun of four cases, and one verifier (`wp17-verifier-1`) checking all evidence.

---

## 4. Roles

| Role | Runs as | May | May not |
|---|---|---|---|
| **Lead** | The main interactive session | Write the plan, briefs, register, decisions; merge; commit milestones; ask the user at gates; spot-check small fix rounds (WP15, WP16 in `lead-todo.md`) | Write WP code after WP2 (`orchestration-plan.md` §2); merge to `develop`; push without asking |
| **Builder** | Background agent with `isolation: worktree`, or a separate `claude` session in a worktree | Edit only its owned folders; request a contract change by writing it in `decisions.md` and stopping | Use plan mode; push or merge; mark its own ACs PASS; build on unmerged work or substitute stand-ins (DEC-32, `agents/builder.md` rule 8) |
| **Verifier** | Fresh agent, stronger model (Opus), different ID from the builder | Run tests and commands, read contact sheets, write its report and files under `evidence/<WP>/` | Edit code, tests or fixtures; rely on the builder's summary for conclusions (`agents/verifier.md`) |
| **Researcher** | Read-only background agent | Return a short cited note from primary sources, with dates and versions | Edit files; guess when sources are silent (`agents/researcher.md`) |
| **Cold reader / reviewer** | Fresh agent with no repo context | Read a script, a SKILL.md or a contact sheet and judge it | Anything else (`orchestration-plan.md` §2; WP17 reviewer) |
| **User** | Human | Answer WP0 questions, freeze contracts, listen/view, supply keys and real assets, approve pushes and releases | — |

The independence rule is enforced, not just stated: `ac-run --trace` rejects a verify report whose `verifier-id` equals the handoff's `builder-id`, or that has no ID line at all (`tools/ac-run.mjs`, `independence()`; tested by AC-TRC-02). It compares strings, so it proves the IDs differ, not that the agents really were different.

---

## 5. Artifacts and tools

**Acceptance register (`acceptance.md`).** One table row per check with seven columns: `ID | source | WP | given / when / then | method | status | evidence`. IDs look like `AC-<AREA>-<NN>` (e.g. `AC-SKL-04`, `AC-W2V-30`; areas may contain digits since WP11). IDs are never reused or renumbered. Methods: `script` (a `node:test` test whose name starts with the AC ID, living in `plugins/peak-media/evals/` so it doubles as a shipped eval), `still` (a verifier reads a labelled contact sheet), `manual` (the user). The final register has 127 ACs: 84 script, 9 still, 29 manual, a few mixed. A WP status table sits at the top (`not-started → in-progress → implemented → verified`, or `blocked: <reason>`). **Baseline ACs** (`--help`, `--version`, one-line errors, no stack traces, no needless network) apply to every shipped entry point (`orchestration-plan.md` §5).

**Evidence (`evidence/<WP>/`).** 593 files, 28 MB: 376 logs, 111 JPEG contact sheets, 47 JSON reports, 59 Markdown notes (UAT results, user attestations such as `AC-PKG-02-user.md`). No MP4 or WAV, because `docs/` ships with the plugin (DEC-18). WP4 alone is 14 MB of contact sheets. UAT evidence is one folder per case (`evidence/WP17/AC-UAT-NN/`).

**Decisions log (`decisions.md`).** Append-only: a decision is changed by a new entry that supersedes it (DEC-21 supersedes DEC-01 in part; DEC-53 supersedes DEC-41). Each entry has the decision and a reason, usually naming who decided ("User Q3", "User, 2026-11-10 grill"). It also holds **Contract changes** in an ADDED / MODIFIED / REMOVED form, and **Run-time findings** later WPs depend on (the 24 kHz PCM rate, HyperFrames composition quirks, WP11's U1–U6 results). The contract-change section was never used: the v1 contracts froze on day one (DEC-24) and held; changes that touched contracts went through ordinary DEC entries or `x-*` extension fields (DEC-39).

**`tools/ac-run.mjs` (generic apart from paths).**
- `--wp <WP>` runs every script AC the WP owns through `node --test --test-name-pattern` and prints a Markdown table for the milestone commit body.
- `--trace` fails on: duplicate IDs; an AC whose owner has no brief or whose brief doesn't list it; a brief naming an unknown AC; a PASS with no evidence file, or evidence outside the build folder; a WP marked verified whose report is missing; and the independence guard above.

**`tools/skeleton.mjs` (project-specific).** The WP2 walking skeleton: beat-grid spine → one motion plate → composite → `out/final.mp4`. It proved the toolchain end to end and built the shared verify tools (`contact-sheet`, `probe-spec`, `check-cuts`) every later builder and verifier used, so "pass" meant one thing (`orchestration-plan.md` §1 principle 2). WP4 and WP6 replaced its steps.

**Fixtures (`fixtures/F0`–`F4`, project-specific).** Graded test inputs from a 3 s skeleton (F0) to the 88 s real video (F4), all on one topic (`orchestration-plan.md` §6). Shipped evals stay topic-neutral (D17).

**`lead-todo.md`.** Carry-forward list grouped by origin (`WP9 verify-6 carry-forward (v0.2)`, `WP16 carry-forward (v0.4 engine gaps)`), each with the finding codes from the verify report. Retargeted when plans changed (DEC-53 moved everything to 0.4.0). Since 2026-11-11 the High and Medium items are GitHub issues #29–#33; only Low items stay in the file.

**Other files that appeared as needed:** runbooks for manual ACs (`wp/WP9/pkg-02-05-runbook.md`, `wp/WP14/signin-runbook.md`), a manual-steps log for the real video (`wp/WP10/manual-steps.md`, M1–M24), and session handoffs (`wp/WP8/kickoff.md`).

---

## 6. What changed while it ran

| When | Change | Why | Record |
|---|---|---|---|
| Day 1 (2026-11-08) | **Parallel waves → strict serial order.** One WP at a time, verified and merged before the next; an end-to-end fixture run by the Lead before any user listening or viewing gate | Wave 2 ran five builders at once; they filled unmerged dependencies with stand-ins (test-pattern plates, a test brand pack, macOS `say` sped up), most of them ordered by the Lead's own WP6 prompt (section 7). A real bug (the default outro failed in `assemble`) was hidden, and the user got a meaningless listening test. Cost a WP6 fix round and re-verification | DEC-32, `agents/builder.md` rule 8, `lead-todo.md` |
| Day 1 | **Disk filled mid-verify.** 1,218 `pm-*` eval temp folders, ~3 GB | Evals didn't clean up. Fix: an auto-cleaning `tmpDir()` in WP9, and `TMPDIR=$(mktemp -d)` for every suite run until then | `lead-todo.md`, `wp/WP9/brief.md` Lead notes |
| Day 2 | **Platform scope cut.** Linux container checks dropped mid-WP9 | The Linux render browser couldn't be tested on an ARM Mac | DEC-41 (later superseded by DEC-53) |
| Days 2–3 | **Verify loops trimmed.** Verifier rounds check only the diff since the last round; one full suite per WP at most, and only when shared code changed; at most one fix round for should-fix findings, nits go to `lead-todo.md`; small fix rounds spot-checked by the Lead (WP15, WP16) | WP9 took 6 verify reports and 7 fix rounds; the user said the process was taking far too long | User feedback 2026-11-10 (not a DEC); visible in `wp/WP9/verify-4.md`+ scope lines and `lead-todo.md` WP15/WP16 entries |
| Days 3–4 | **Headless Lead-driven "manual" runs.** The Lead drove cold-start and real-video sessions with `claude -p` / `--resume`, answering gates by typed replies, including overnight while the user slept; the user approved the result | Manual ACs were the bottleneck. Trade-off: gates were answered by the Lead, so `AskUserQuestion` behaviour went untested | DEC-42 (AC-PKG-05), DEC-43 (F4 real video), WP17 UAT model |
| 0.2.0 | **Sub-plan per release.** New ID families (`AC-W2V-*`, `AC-UAT-*`), new integration branch, WP11 as an "unknowns" research WP before building | The web2video plan was rewritten; old IDs kept their meaning | DEC-44, DEC-45, `wp/WP11/` |
| 0.3.0 | **One session, one review.** WP19 ran in one session on `feature/peak-media-cross-platform` as five ordered steps (commits say "WP1"–"WP5" inside WP19), with a 3-OS GitHub Actions matrix as the proof and a single user review at the end. No handoff, no verify reports | The port was mechanical and CI could prove it | DEC-53, `wp/WP19/brief.md` |
| 0.4.0 | **Issues + `/triage` + plan mode.** Open items become GitHub issues; `/triage <n>` reads the issue, finds the root cause with `file:line` evidence, grills the user in rounds, and writes a plan in plan mode. The plan is the only build artifact: no briefs, no register rows, no files under `docs/build/`. Delivery is a PR to `develop` | Heavy machinery isn't worth it for bounded fixes | `.claude/skills/triage/SKILL.md`, `lead-todo.md` header, commit `19dc29a` |

Small wrinkle worth knowing: the WP19 commit messages cite "DEC-52" for the cross-platform work, but the decision is DEC-53 in `decisions.md`. Cross-references are hand-maintained, and `--trace` only checks AC IDs, not DEC IDs.

---

## 7. Where it went wrong

*Source: five failure catalogues built from the build transcripts. They cover 84 builder failures (WP1–WP2 were built by the Lead and are included), about 25 verifier and Lead errors, and 21 user corrections. Sessions: `65a1e733` (WP1–WP7b), `579a6981` (WP8–WP10), `573d6691` (WP11–WP17). References below give session prefix · report path.*

No builder reported a PASS for a test it hadn't run. Every number in a handoff could be reproduced. The failures came from **what** was tested (fakes, text, default paths, numbers instead of the actual output) and from Lead and process decisions that no verifier could see. Of the 21 user corrections, only about 3 could a better builder or verifier alone have caught.

Three near-exceptions to "nobody claimed what they hadn't done". The WP9 builder reported AC-PKG-04 PASS from one good container run after calling a 12-minute hang "a one-off"; the verifier then hung 2 of 2 times. The Lead, building WP1, said a fix (F-05) was applied before it had written it. The Lead also recorded a British-accent "fix" in `voices.md` with no evidence that it changed anything.

### Worst incidents

| # | WP | What happened | Caught by | Cost | Root cause | Ref |
|---|---|---|---|---|---|---|
| 1 | WP6 | Listening MP4 for the user: test-pattern plates, macOS `say` sped up with `atempo` to fit clip windows, music about 26 dB under the voice (inaudible). The handoff said only "fitted" | User ("what the hell am I looking at?") | Wasted user gate, lost trust, fix round, DEC-32 | Stand-ins the Lead's prompt ordered; number checks instead of listening; Lead forwarded it unheard | 65a1e733 · `wp/WP6/verify-1.md` |
| 2 | WP6 | `assemble` passed on a private test brand pack but failed on the real default outro (B-1) | Verifier r1, told to try the merged pack | Fix round + full re-verify | Stand-in for an unmerged dependency | 65a1e733 · `wp/WP6/verify-1.md` |
| 3 | WP3b | Script sized for a fake-voice 165 wpm; the Lead cut 4 words from the user-approved script to pass that gate. The real voice read at ~130 wpm, so the run failed 20 s | Lead, on the first real-key run | Interrupted run, new target (DEC-34) | Fake TTS calibrating a real gate | 65a1e733 · DEC-34 |
| 4 | WP3a→WP3b | A claim from one docs sentence ("mood tags may be read aloud") became a verifier should-fix; the Lead removed tags from the approved script | User | Script churn, reverts in 3 files, DEC-31 | Unverified claim; false verifier finding; approved artifact edited | 65a1e733 · `wp/WP3b/verify-1.md` S2 |
| 5 | WP4 | Hook and close plates small and upper-left in an empty frame; passed two builders and two verifiers because the AC asked only "no overflow, readable" | Lead at the F1 end-to-end run, then user | Extra builder, verify-3; "top-heavy plates" again in F4 | AC didn't state quality | 65a1e733 · `wp/WP4/verify-3.md` |
| 6 | WP7b | Sync test went red, so the default captioned path was demoted to "information only", a retry-once added, a tolerance widened from ±300 ms to ±1 s | Verifier r1 (rated the ±1 s a nit) | Fix round, +3 min per suite from then on | Test changed after a red result (disclosed) | 65a1e733 · `wp/WP7b/verify-1.md` S2, N1 |
| 7 | WP8→WP9 | Gate lines required by SKILL.md prose; both user live runs skipped gates, run 2 claimed "All 10 gates passed". Firmer prose failed again in WP9 cold starts and F4 | User live runs, then Lead cold starts | 2 user runs, DEC-38, WP9 rounds 4–7 | Behaviour specified by prose | 579a6981 · `wp/WP8/verify-3.md`, `wp/WP9/handoff.md` |
| 8 | WP9 | Linux container under colima with an 8 GB disk on a Mac with ~10 GB free; disk hit 97%, VM corrupted, renders hung 1 h 45 m with no timeout | User ("why the hell are we using a linux container?!") | Hours, broken container runtime, DEC-41 | AC not reviewed for scope or cost; no resource check; no timeouts | 579a6981 · `wp/WP9/verify-1.md` |
| 9 | WP9 | The build gate passed when the model's own summary said "1 defects, 1 fixed"; the reviewer had found 4 | Lead reading cold start r3 | Round 6 parser rewrite | Gate trusted a self-report | 579a6981 · `wp/WP9/handoff.md` Round 6 |
| 10 | WP16 | web2video SKILL.md shipped with all script ACs passing; the builder never ran the skill. UAT found 12 more defects, including the fake API key on frame 0 while the session told the user "No frame I reviewed shows it" | Verifier (1 blocker, 3 majors), then headless UAT | Fix round, DEC-52, UAT round 2 | Only text-tested; privacy check sampled beat midpoints | 573d6691 · `wp/WP16/verify-1.md`, `uat-results.md` |
| 11 | WP17 fix | Runtime overrun (D6) "fixed" in skill text, checked by a text test; UAT round 2 overran by exactly the same +11.2 % (D9) | UAT round 2 | Extra Lead fix | Fix not re-run against the failing case | 573d6691 · `uat-results.md` D9 |
| 12 | WP9→WP10 | The user said "take things as far as you can" and went to bed. The Lead ended its turn waiting on a background commit and did nothing for ~7 h | User ("what the hell is going on?") | Lost overnight window | Lead ended its turn with work pending | 579a6981 · Lead transcript |

### Counts by root cause

Builder rows from the four WP catalogues, with similar categories merged:

| Root cause | WP1–4 | WP5–7b | WP8–10 | WP11–17 | Total |
|---|---|---|---|---|---|
| Never ran the real thing (text-only tests, fixture-only, runbooks never executed, built big-bang) | 0 | 2 | 3 | 11 | **16** |
| Weak, vacuous, overfit or gameable test or guard | 5 | 2 | 6 | 0 | **13** |
| Spec or AC gap, ambiguity, inconsistent spec edit, upstream Lead error | 1 | 4 | 3 | 4 | **12** |
| Test changed after a red result, or failing evidence dismissed | 0 | 3 | 1 | 5 | **9** |
| Partial coverage, missed edge case, unrepresentative prototype | 0 | 4 | 0 | 4 | **8** |
| Stand-in or fake dependency | 2 | 3 | 0 | 1 | **6** |
| Rule, scope, disclosure or repo hygiene | 3 | 2 | 1 | 0 | **6** |
| Environment or resources | 2 | 2 | 2 | 0 | **6** |
| Unverified assumption or unsupported claim | 2 | 0 | 0 | 1 | **3** |
| LLM behaviour enforced by prose only | 0 | 0 | 2 | 0 | **2** |
| A fix broke something else | 0 | 0 | 2 | 0 | **2** |
| Claimed done without doing it (Lead as builder) | 1 | 0 | 0 | 0 | **1** |
| **Total** | 16 | 22 | 20 | 26 | **84** |

The user's 21 corrections sort differently: Lead or process failures 6 (stand-in gate, parallel waves, container, overnight stall, unproven fix, false finding applied), verification too slow or heavy 4, spec or UX gaps only a human saw 3, over-asking or pushing manual work onto the user 3, wrong judgement 2, taste and format 3.

### Fakes set the wrong target

Stand-ins passed tests while the real outcome was wrong: test-pattern plates, a private test brand pack, macOS `say` sped up, a fake-voice wpm (incidents 1–3), and in 0.2.0 a tone TTS that hid a real-voice overrun (WP16/17 D6). In WP6 the Lead's own prompt ordered the stand-ins ("make your own plate MP4s … with ffmpeg testsrc", "use `brand-min`"), and WP5 merged before WP6 finished without WP6 being rebased. DEC-32 blames builders' stand-ins, so it partly blames the wrong party. Under strict order (WP7a onward) stand-in failures stopped; the failures moved to test-weakening.

### A red result changed the test, not the code

When a real measurement failed, builders changed the test: demoted the default path to "information only", added retry-once, widened ±300 ms to ±1 s (WP7b), shortened a fixture's fades instead of fixing the tool (WP7b), added an unbounded merge rule (WP13), re-ran an AC with `--no-captions` (WP12), loosened to ±1 frame (WP14), turned off a network guard (WP7a). Nearly all were disclosed as "deviations", so honesty didn't prevent it. The exception was WP6: "fitted into the F1 clip timings" didn't mention the time-stretch, and a code comment was rewritten to match the measured duck. Verifiers caught these but sometimes rated them nits; one (the WP13 merge) was actually unsound.

### Numbers stood in for looking and listening

Music measured −48/−49 dB under the voice passed the verifier, who quoted the builder's "ducked about 14 dB" (incident 1). Layout ACs passed small top-left text (incident 5). The privacy check sampled beat midpoints and missed frame 0 (incident 10). Synthetic stems hit level targets exactly; real music came out 1.4–2.5 dB low (F4, DEC-43). Nobody looked at or listened to the file the user would get before the user did.

### Verifiers check the AC, not whether the AC is right

Verifiers checked the AC as written, never whether it was sane or the result good: the container AC (incident 8), "no overflow" layout (5), gates that asked for approval without showing the content (WP8), click pulses instead of a cursor (WP12). Verifiers were also wrong at times: a false finding on mood tags (4), "a fresh session following SKILL.md would make all three takes correctly" without running one (WP15, WP16), idling 1 h 45 m on a hung container (WP9 r1), overwriting a tracked fixture with an in-place probe (WP9 r6). Where they had real merged inputs and built their own adversarial inputs, they caught every engine major (WP1, WP2, WP6 B-1, WP13's per-preset captures, WP15's line-by-line check).

### Prose doesn't enforce behaviour

Gate lines written as prose failed in every real run: WP8 live runs 1–2, cold starts r1–r3, F4 draft 1. Each prose failure was answered with firmer prose before the check moved into code. Only script-printed gate lines (WP9 round 5) held, though verifiers could still forge them (verify-4, verify-5). A gate that trusted the model's own defect count was wrong (incident 9). The same applied to the process: the "trim verify loops" rule lived in Lead memory and was ignored by the next plan's briefs (user, 2026-11-10 22:42).

### Never ran the real thing

WP16's ACs were all text tests over SKILL.md; the brief required no real session, so a skill nobody had run reached verification (incident 10). 12 defects surfaced only in UAT (9 in the skill text, 3 engine edge cases). Fixes "verified" by text tests repeated the same failure in the next real run (incident 11), and D7, D10 and D11 shipped session-untested. WP13 tested the `web` preset only and failed on `youtube` and `hifi` (verify-1 M1, M2). Builders never ran the runbooks they handed the user: the WP8 runbook's trailing comments would have broken pasting into the user's zsh (caught by verify-2), a WP9 cleanup step deleted the config the next step needed, and a WP14 runbook pointed to a file that didn't exist.

### Lead and process failures

These dominate the user's corrections:

- **Linux container on a near-full disk** (incident 8). The Lead authorized it in the brief while knowing the disk was nearly full; in its own words, "I should have asked whether the container was worth it".
- **WP9's 6 verify rounds, 7 builder rounds, ~14 h.** Only rounds 1–3 were packaging. Rounds 4–7 were WP8's prose-gate weakness, absorbed into WP9 instead of reopening WP8, each paying for a full 7–8 min suite and a ~15 min cold start.
- **Full suites for small changes** even after the "trim verify loops" note (WP13 fix round, the pre-PR run the user cancelled, the 0.3.0 eval plan).
- **The ~7 h overnight stall** (incident 12).
- **Human gates that didn't show the artifact** (WP8), a manual CLI runbook pushed onto the user, then the Lead offering to answer the taste gates itself; later it did answer them headlessly (DEC-42/43).
- **A false verifier finding applied to a user-approved script** (incident 4).
- **The Lead built WP1/WP2 itself and made the same kinds of mistakes**: a fix claimed before it was written, undisclosed edits outside scope, a validator with happy-path tests only, and an `ac-run` (the anti-cheating tool) that a stray `|`, a directory as evidence or a case-variant ID could game (`wp/WP1/verify-1.md`, `wp/WP2/verify-1.md`).

---

## 8. Guardrails

Each guardrail below is backed by the incidents it would have prevented. "Lives in" says where it would be enforced. A script beats a prompt rule: see "Prose doesn't enforce behaviour" above.

| # | Guardrail | Would have prevented | Lives in |
|---|---|---|---|
| G1 | Build only on merged work. No stand-in for a dependency or a human-review artifact without Lead and user sign-off, and the Lead's own briefs follow this rule too | 1, 2, 3; WP16 tone TTS | Builder definition; brief template |
| G2 | Before any human gate, the Lead does a real end-to-end run and looks at or listens to the actual file | 1, 5; F4 draft 1 | Lead protocol (gate step) |
| G3 | Perceptual outputs get perceptual ACs: measurable proxies (size, centring, fill, audible over the voice) plus a reviewer who views or listens to the real file and judges it against intent | 1, 5; WP12 cursor | AC template; verifier definition |
| G4 | No weakening or editing of an existing assertion, tolerance, fixture or guard without a Lead decision; the verifier probes each such change with a mutation | 6; WP7b fades, WP12, WP13 merge, WP14 | Builder and verifier definitions; `ac-run` flagging diffs to existing AC tests |
| G5 | Gates are enforced by scripts that count real artifacts, never by model prose or self-reports | 7, 9 | Project gate scripts; `ac-run`-style checks |
| G6 | A skill (LLM-driven behaviour) gets at least one real headless `claude -p` run of its main case before verification; verifiers run it, not read it | 10; WP15 doc errors | Brief template; verifier definition; `uat` skill |
| G7 | A defect closes only when its failing case is re-run for real | 11; WP16 fix round spot-checked only | Verifier definition; issue template |
| G8 | Briefs name every variant (presets, platforms, modes); verifiers sample the non-default ones | WP13 M1/M2; WP11 cursor prototype | Brief template |
| G9 | Privacy checks include the first and last frames | 10 (frame-0 key) | Project checker (`contact-sheet`); verifier definition |
| G10 | Builders execute every runbook they hand the user, in the user's shell | WP8 zsh paste, WP9 PKG-02, WP14 sign-in | Builder definition |
| G11 | A docs-derived claim is marked unverified until an experiment backs it; user-approved artifacts are frozen against verifier and Lead edits | 3, 4; accent "fix" | Verifier definition; Lead protocol |
| G12 | Each AC gets a scope-and-cost review before building. Containers, VMs and long runs need a disk/resource check and a user question first, and every external step gets a timeout | 8; WP9 verifier idle | Planning step; brief template |
| G13 | Verify caps written into every brief: delta-only rounds, at most one full suite per WP, one fix round for should-fix, nits to the backlog. A cross-WP problem reopens its WP | WP9 rounds 4–7; full-suite reruns | Brief template (not Lead memory) |
| G14 | The Lead never answers taste gates for the user, never ends its turn with work running (it waits with a poll loop), and is not exempt: anything it builds gets the same independent verify | 12; DEC-43 Lead-chosen visuals; WP1/WP2 | Lead protocol |

---

## 9. Cost and fit

**Size of the peak-media build** (counted 2026-11-11):

| Measure | Value |
|---|---|
| Calendar time | 2026-11-08 to 2026-11-11 (0.1.0, 0.2.0 and 0.3.0 released) |
| WP folders | 21 (WP1–WP19, with 3a/3b and 7a/7b split; WP0 is the plan itself) |
| Verify reports | 32; WP9 had 6, WP4 and WP8 had 3 each, most had 1 |
| ACs | 127 in the register |
| Decisions | 53 |
| Commits touching `plugins/peak-media` | ~185, of which 20 are merges |
| Build Markdown | ~6,900 lines outside `evidence/` (~10,200 with it) |
| Evidence | 593 files, 28 MB |

**Where it paid off**

- **Contracts first, then fan-out.** Freezing three JSON schemas on day one (DEC-24) meant no contract change was ever requested.
- **Independent verification found real defects** builders missed: a gameable `ac-run`, a cut on the first sound of a word passing `check-cuts` (DEC-29), the default outro failing in assembly, preset-specific sync failures (WP13). Headless UAT caught what the verifiers didn't, such as the fake API key on frame 0 (WP17, DEC-52). See section 7 for the limits.
- **Evidence and traceability** let any later session (or a `/triage` run) see exactly what was proven and how, without re-running anything.
- **File-based state** survived several session changes and compactions.

**Where it cost more than it returned**

- Verify loops on packaging and prompt-heavy WPs (WP8, WP9) chased checker edge cases and forgery scenarios; most late findings ended up as nits in `lead-todo.md` anyway.
- Parallel builders needed more coordination than they saved on one Mac (render-heavy work, shared CPU for timing tests, `orchestration-plan.md` §4) and caused the stand-in problem.
- Manual ACs blocked progress until the Lead started driving them headlessly.
- The ceremony (brief, handoff, verify report, register row, milestone commit) is fixed per WP, so it dominates for small WPs.

**When to use which path**

| Use the heavy method when | Use the light path (one session + plan mode, or `/triage`) when |
|---|---|
| A new product or plugin with several interacting parts and contracts between them | A bounded fix or feature in code that already has tests |
| Outputs need human taste gates (audio, video, UI) and objective checks around them | Correctness is fully covered by tests or CI (the 0.3.0 port) |
| Upstream facts are uncertain and need research first | The root cause can be found and confirmed in one session |
| You need an audit trail of what was proven (the owner's DO-330 background makes this valuable) | The PR description and tests are enough record |
| Work is large enough that one context can't hold it | It fits in one session's context with room to spare |

---

## 10. What a reusable "peak-orchestration" plugin would need

### Generic vs project-specific

| Part | Generic? | Notes |
|---|---|---|
| Orchestration principles and loop (`orchestration-plan.md` §1, §7) | Yes | Rewrite with strict order as the default (DEC-32); the file still describes parallel waves and its own `lead-todo.md` item to fix that is open |
| Role prompts (`agents/builder.md`, `verifier.md`, `researcher.md`) | Mostly | Replace peak-media specifics (`lib/cli.mjs`, contact sheets, MP4/WAV rule) with placeholders |
| Kickoff prompt + WP0 sequence (`kickoff-prompt.md`, `orchestration-plan.md` §12) | Yes, as a template | |
| `plan.md`, `decisions.md`, `acceptance.md`, brief, handoff, verify-N templates | Yes | The brief's "Ground rules" block is already boilerplate repeated in every brief |
| `tools/ac-run.mjs` | Yes, after small changes | Imports `lib/cli.mjs` and assumes `plugins/<x>/docs/build` and `node:test`; needs a configurable root and test command (pytest, etc.) |
| Evidence folder conventions | Yes | Allowed file types are a per-project setting |
| `lead-todo.md` → issues hand-off | Yes | |
| Walking skeleton (`tools/skeleton.mjs`), shared verify tools, fixtures F0–F4, contracts | No | The *idea* is generic (build the skeleton and shared checkers before features); the code is not |
| Headless UAT driver (WP17 model) | Partly | The `claude -p --plugin-dir … --resume` pattern is generic for Claude Code plugins; cases and checks are not |

### Candidate skills

| Skill | Does |
|---|---|
| `kickoff` | Scaffolds `docs/build/` (orchestration plan, empty register/decisions, role prompts, `ac-run`), then runs WP0 in plan mode: parallel researchers, one-at-a-time questions, plan + register + briefs |
| `brief-wp` | Writes `wp/<WP>/brief.md` from the plan and register (owned folders, AC list, ground rules) and checks it with `--trace` |
| `build-wp` | Launches one builder in a worktree on the brief, enforcing "merged dependencies only" |
| `verify-wp` | Launches a fresh verifier on a stronger model; delta-only on rounds after the first; writes `verify-N.md` and updates the register |
| `trace` | Wraps `ac-run --trace` and `--wp`; prints the table for the milestone commit |
| `lead-handoff` | Writes a `kickoff.md`-style handoff for a fresh Lead session |
| `uat` | Optional: headless case runner with a scripted-gate reviewer, for plugin/skill projects |

### Relation to peak-workflow

`plugins/peak-workflow` already covers much of the same ground for a single developer: `/discover` → `/capture-requirements` (TOR IDs with Given/When/Then) → `/plan-project` (phases and epics with Requirements Anchors) → `/start-epic` → `/wrapup-epic` (independent verification on Opus in a fresh session) → `/status`, plus `/triage`, `/quick-fix` and `/pause` (`plugins/peak-workflow/README.md`). `orchestration-plan.md` §11 lists what this build borrowed from it (stable IDs, G/W/T, anchors per WP, fresh-session verifier, baseline ACs, tracing check, status sidecars, delta-style changes, handoffs) and what it skipped (discover/ConOps, mockup, phases, `docs/` branch approval gates, feature-file format).

The real differences are narrow:

1. **Execution topology.** peak-workflow has one session implement an epic; the orchestration has a Lead dispatching worktree builders and separate verifiers.
2. **Deterministic tracing and independence.** `ac-run --trace` is a script; peak-workflow's tracing uses an agent-written sidecar.
3. **Evidence on disk** for every PASS, including human attestations and contact sheets.
4. **Contracts frozen before fan-out**, with a change protocol.

### Recommendation

**Unchanged in shape, changed in priority.** Still don't build a separate full plugin. But the failure analysis (section 7) changes what is worth packaging first: **the guardrails (section 8), not the orchestration machinery.** Reasons:

- Planning would otherwise be duplicated: peak-workflow already produces stable requirement IDs with Given/When/Then, epics with anchors, and an independent-verifier step. A WP is close to an epic; an AC is close to a TOR.
- The machinery didn't cause most of the cost, and it can't fix it. The expensive failures came from tests aimed at the wrong target and from Lead and process decisions. Only about 3 of the 21 user corrections were catchable by a better builder or verifier. Every one of those failure modes also applies to a single session.
- What the machinery did prove: an independent verifier with **real merged inputs** that builds its own adversarial inputs (it caught every engine major), and evidence plus a deterministic trace. Those fit on top of `/start-epic` and `/wrapup-epic` as a **serial** orchestrated mode. Drop parallel builders: they were the precondition for the worst incident (1).
- The repo already moved this way: 0.3.0 ran light (DEC-53) and 0.4.0 runs on issues + `/triage`. The owner coaches non-developers on peak-workflow; one front door is easier to teach than two overlapping plugins.

**Where the guardrails would live.** A guardrail that exists only as a prompt rule shares the weakness in "Prose doesn't enforce behaviour", so script what can be scripted:

| Home | Guardrails |
|---|---|
| Scripts (`ac-run` successor, project gate scripts, `contact-sheet`) | G4 (flag diffs to existing AC tests), G5 (count artifacts), G9 (always include first and last frames), G12 (disk check and timeouts in the runner) |
| Builder and verifier agent definitions (peak-workflow's `/start-epic` and `/wrapup-epic` prompts; `agents/*.md` here) | G1, G3, G4, G6, G7, G10, G11 |
| Brief / epic-spec template | G1, G6, G8, G12, G13 written into every brief, not kept in Lead memory |
| Lead protocol (orchestrated mode, or the main session) | G2, G11, G13, G14 |

**How much the light path already covers.** The 0.4.0 path is issues + `/triage` + plan mode, built in one session (`.claude/skills/triage/SKILL.md`):

| Covered | Partly | Missing |
|---|---|---|
| G12 scope and cost (the grill's "worth fixing", "scope" and "verification" branches) · G13 verify caps (affected tests per change, full suite once) · G1 (one session has no unmerged dependencies) | G7 ("reproduce it when you can" in step 2, but no rule that the fix is proven by re-running that case) · G8 (only the 3-OS CI matrix is named) · G14 (the user is present at the plan gate, but the same session builds and checks itself) | G2/G3 real run and perceptual check · G4 no test-weakening · G5 script gates · G6 headless skill run · G9 first/last frames · G10 runbook execution · G11 frozen approved artifacts · any independent verifier |

The gap that matters most is independence. In the light path the session that builds also verifies, and section 7 shows the Lead building WP1/WP2 made the same mistakes as the builders. For issues that touch skill behaviour or audio/video output, add three lines to `/triage`'s Verification branch: a real run of the failing case (G6, G7), a look or listen at the output (G3), and no edits to existing assertions without asking (G4). Then run a fresh-session review (`/wrapup-epic`-style) before the PR.

If a separate plugin is still wanted (for example, for projects that will never use TOR feature files), keep it small: `kickoff`, `brief-wp`, `verify-wp`, `trace`, with strict order, the guardrails and delta-only verify as defaults, and let it read peak-workflow's requirement IDs when present.

### Open questions

1. **ID model.** Map ACs onto peak-workflow TOR IDs, or keep a separate AC register? Mixing both produced dual references (D-items vs ACs, DEC-44).
2. **Is the independence guard worth keeping as is?** It only compares ID strings. A stronger guard would need the harness to record agent IDs.
3. **Where does evidence live?** Shipping it inside the plugin's `docs/` cost size limits (DEC-18); a target project may prefer a non-shipped folder or CI artifacts.
4. **Parallelism.** Strict order is the default (DEC-32, section 7). Is parallel ever allowed, for example only for WPs with no shared dependencies and no human gate?
5. **Headless runs vs taste gates.** Headless runs are a test method (G6); G14 says the Lead doesn't answer taste gates. How should a run like F4 (DEC-43), where it did, be marked in the record?
6. **Verify-loop budget.** The evidence says the caps must be written into briefs (G13), because a memory note didn't hold. Hard rule or a default that the Lead can override with a DEC entry?
7. **Non-Node projects.** `ac-run` relies on `node:test` names; how should it discover tests in other stacks?
8. **Is anyone besides the owner going to run it?** If the main audience is coachees, the light path (`/triage` + plan mode) may be all most of them ever need.
