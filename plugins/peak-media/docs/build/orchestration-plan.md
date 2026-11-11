# peak-media build: multi-agent orchestration scheme

*Draft 2026-11-08. Inputs: `tmp/plate_factory_kickoff_prompt.md`, `plugins/peak-media/docs/plate-factory-workflow.md`, `plugins/peak-media/docs/web2video-plan.md` (at `0ea0ea6`), `plugins/peak-media/docs/build/references/openspec-vs-peak-workflow.md` (test-video topic).*

---

## 1. Principles

1. **Contracts are the seams.** Nothing fans out until `spine/manifest.json`, `plates.json` and the brand-pack layout are frozen at `schemaVersion: 1`. After that, parallel builders only touch their own folder; a contract change is a request to the Lead, never a local edit.
2. **Shared verification tools before features.** Contact-sheet sampler, ffprobe spec check, silent-gap (cut-in-silence) check and the AC runner are built in the walking skeleton. Every builder and verifier uses the same tools, so "pass" means one thing.
3. **Builder never verifies its own work.** Each work package (WP) ends with a fresh Verifier that sees only the acceptance register, the code and the artifacts, never the builder's summary. Same idea as peak-workflow's `/wrapup-epic`.
4. **Evidence is files, not claims.** Every AC result points to a log, JSON report or labelled contact sheet under `plugins/peak-media/docs/build/evidence/<WP>/`.
5. **Small WPs.** Each WP is sized so its builder can plan within ~25% of context. Spine and recorder are split in two for that reason.
6. **Humans own the taste gates.** Plan Q&A, storyboard approval, "listen to it", brand pack. Everything mechanical runs unattended.

## 2. Roles

| Role | Runs as | Tools | Owns |
|---|---|---|---|
| **Lead** (integrator) | The main interactive session (you + Claude) | All | Plan, decisions log, contracts, acceptance register, merges, milestone commits, user gates. Writes no WP code after WP2. |
| **Researcher** | Background subagent, read-only | Read, WebFetch, WebSearch, Bash (read-only) | Upstream facts: HyperFrames release/changelog, HF skills + licenses, OpenRouter TTS shape + ZDR field, Playwright `screencast` API. Returns a cited note. |
| **Builder** | One per WP: worktree agent (`isolation: worktree`) or a separate `claude` session in its own worktree | All, scoped to its WP folder | Code, SKILL.md, evals, `handoff.md` for its WP. |
| **Verifier** | Fresh agent/session, stronger model (Opus), no Edit/Write except its report | Read, Bash, image read | PASS/FAIL per AC ID with evidence path. Reads stills; runs scripts; never fixes. |
| **Cold reader** | Fresh agent with no repo context | Read only | Script cold-read (stage 1 gate), SKILL.md cold-start test (D18). |

Optional: commit these as project agents in `.claude/agents/pm-builder.md`, `pm-verifier.md`, `pm-researcher.md` (outside `plugins/`, so they don't ship) to pin tool lists and models.

## 3. Shared state (survives sessions and compaction)

```
plugins/peak-media/docs/build/      # ships with the plugin (DEC-18); evidence limited to JPEG/JSON/log
  orchestration-plan.md             # this file
  plan.md                           # approved plan from the kickoff Q&A
  decisions.md                      # D-log: skill names, TTS default, HF pin, vendoring
  acceptance.md                     # AC register (§5): id, WP, method, status, evidence
  wp/<WP>/brief.md                  # the builder's kickoff prompt
  wp/<WP>/handoff.md                # builder: what was done, what's open
  wp/<WP>/verify-<round>.md         # verifier report
  evidence/<WP>/...                 # logs, JSON, contact sheets
  fixtures/                         # OpenSpec-vs-peak-workflow briefs (§6)
```

Any session (or agent) starts by reading `plan.md`, `decisions.md`, `acceptance.md` and its own `wp/<WP>/brief.md`. Nothing goes in `tmp/` because `tmp/` is never committed.

## 4. Work packages and waves

```
Wave 0  WP0 Plan ──────────────► (user Q&A gates)
Wave 1  WP1 Contracts ─► WP2 Walking skeleton + shared verify tools        [serial, Lead]
Wave 2  WP3a Spine-TTS │ WP3b Spine-script │ WP4 Motion+Slide │ WP5 Brand pack │ WP6 Assembly
Wave 3  WP7a Recorder-engine │ WP7b Recorder-captions/mux  ║  WP8 Orchestrator
Wave 4  WP9 Packaging (manifest, marketplace, README, VENDORED.md, evals, D16–D19)
Wave 5  WP10 Real video (OpenSpec vs peak-workflow) + manual-steps log
```

| WP | Scope | Depends on | Milestone check (kickoff) |
|---|---|---|---|
| **WP0** | Survey, Q&A one at a time, plan mode. 4 parallel Researchers feed it. | — | User approves `plan.md` |
| **WP1** | JSON schemas (manifest, plates, brand pack) + `schemaVersion`, validator script, tiny fixture brief | WP0 | Fixtures validate; bad fixtures fail |
| **WP2** | 3 s one-plate run: spine (beat grid) → motion plate → composite → `out/final.mp4`. Vendored fonts, pinned HF CLI. Builds `contact-sheet`, `probe-spec`, `check-cuts` (silent-gap), `ac-run` | WP1 | ffprobe passes; contact sheet read by Lead |
| **WP3a** | TTS layer ported from web2video: providers (fake, Gemini, MAI), voices, cache + legacy cache, `sample-voice`, wpm table | WP1 | D2(voice/key), D4, D5, D12, D13, D15 |
| **WP3b** | Brief → script → clips → `spine/manifest.json`; beat-grid fallback with no key | WP1, (WP3a lib API stub) | Runtime ±10%; D3 (spine side); D11 |
| **WP4** | `motion` + `slide` renderer; one HF composition per plate; imports brand tokens; vendored HF skills | WP2 | Duration matches plan; contact sheet per plate |
| **WP5** | Neutral default brand pack (tokens.css, fonts, logo placeholder, outro, music rules — no music) | WP1 | Validates against schema; WP4 plate renders with it and with a 2nd pack (rebrand = re-render) |
| **WP6** | Assembly: composite onto spine, music/SFX stems remuxed without re-render, outro, export | WP1, WP2 (uses fixture plate MP4s + fixture manifest) | Every cut in a silent gap; remux leaves video stream hash unchanged |
| **WP7a** | Recorder engine, storyboard API, pre-flight, timed to spine manifest (no TTS of its own) | WP3a, WP3b | D1 (revised flags), D2, D6 |
| **WP7b** | Captions, mix/mux, `check-take`, manifest of take | WP7a | D7, D8, D9, D10 |
| **WP8** | `/plate-factory` orchestrator: gated stages 0–9, storyboard stills before animation, self-review ×3 + reviewer agent | WP3b, WP4, WP5, WP6 | Runs end to end on fixture brief; every gate observed in transcript |
| **WP9** | Packaging: plugin.json + CHANGELOG in sync, marketplace entry, README install, `VENDORED.md`, evals per skill | all | D16, D17, D18, D19 |
| **WP10** | Real video with real brand pack; log every manual step | WP9 | Final contact sheet + user listens; manual-steps list → next-version backlog |

**Parallelism limit:** run at most two render-heavy builders at once on the Mac. **WP7 sync tests (D8) must run alone**: real-time capture drifts under CPU load from concurrent HyperFrames renders. Verifiers for render WPs run serially for the same reason.

## 5. Acceptance register (`acceptance.md`)

One row per check: `AC-<area>-<nn> | source | WP | given/when/then | method | status | evidence`. Methods: `script` (deterministic, in `plugins/peak-media/evals/`, so it doubles as the shipped eval), `still` (verifier reads a labelled contact sheet), `manual` (user).

The **given/when/then** is one line each, e.g. *Given* the F1 brief and no TTS key · *When* the spine runs · *Then* `beatgrid.json` validates and total runtime is 20 s ±10%. It is the verifier's procedure, so it must be runnable as written. IDs are stable: once assigned, an ID is never reused or renumbered.

**Baseline ACs (apply to every script the plugin ships):** `--help` lists every flag · non-zero exit with a one-line actionable error on bad input · no stack traces on expected failures · version printed by `--version` matches `plugin.json` · no network call unless the feature needs it. One `script` check per entry point covers all five.

**Traceability check:** `ac-run --trace` fails if any AC has no WP, any WP brief lists an AC that doesn't exist, or any `PASS` has no evidence file. Deterministic, no model involved.

Sources folded in:

- **Kickoff milestone checks** → one AC each (runtime ±10%, cache-key test, duration match, contact sheet, cuts in silence, orchestrator end to end, packaging items).
- **Design §7 publishing rules** → schemaVersion on all three contracts, every external dependency optional (no-key run, no-music run, headless/cloud run), evals per skill.
- **web2video D-items (plan at `0ea0ea6`, DEC-44), re-homed:**

| D | Still applies? | New home / change |
|---|---|---|
| D1 flags | Partly | Recorder keeps `--storyboard --out --mp4 --viewport --no-captions --caption-css --url --debug-requests --audio-offset-ms`; narration flags move to spine; recorder adds `--spine <manifest>` |
| D2 pre-flight | Yes | Voice/key checks → spine; ffmpeg/Chromium → recorder |
| D3 no key | Yes | Spine beat grid + recorder captions-only; zero OpenRouter calls |
| D4 cache key | Yes, verbatim | Spine; against `plugins/peak-media/docs/reference/narration.json` |
| D5 legacy cache | Yes | Spine reads `~/.cache/record-website-interaction/tts/` and `~/.cache/web2video/tts/` |
| D6 storyboard API | Yes | `say()` now plays the spine's clip/timing instead of synthesizing |
| D7 MP4 spec | Yes | Recorder output **and** assembly `out/final.mp4` |
| D8 sync | Yes | Recorder, run in isolation |
| D9 cuts in silence | Yes | Recorder + assembly (same `check-cuts` tool) |
| D10 captions | Yes | Recorder |
| D11 manifest shape | Yes | Spine manifest schema (superset of `narration.json`) |
| D12 reproducibility | Yes | Spine |
| D13 wpm warning | Yes | Spine |
| D14 live TTS | Yes, manual | Spine; needs your key; ZDR field in redacted debug log |
| D15 sample-voice | Yes | Spine |
| D16 fresh machine | Yes | Whole plugin; clean Linux container + one macOS pass |
| D17 brand neutrality | Yes | Whole plugin: grep finds no brand strings outside author metadata |
| D18 cold start | Yes | Fresh session asked for a 20 s explainer and a recorded demo using only SKILL.md files |
| D19 conventions | Yes | `/plugin marketplace add …#<branch>` exposes the peak-media skills (not `/web2video`) |

A WP is **Done** only when every AC it owns is `PASS` in a verifier report. `ac-run --wp <WP>` prints the table; the Lead pastes it into the milestone commit body.

## 6. Test videos (topic: OpenSpec vs. peak-workflow)

Shipped fixtures must pass D17, so the plugin's own eval fixture stays topic-neutral. The OpenSpec content is used for the dev fixtures and the real video, kept in `plugins/peak-media/docs/build/fixtures/`.

| Fixture | Used by | Shape |
|---|---|---|
| **F0 skeleton** | WP2 | 3 s, 1 `motion` plate, beat grid: kinetic type "spec-aware vs. spec-accountable" |
| **F1 explainer-short** | WP3–WP6, WP8 | ~20 s, 3 plates, fake TTS in CI / real TTS optional: (1) hook "Two tools, same promise…" (motion), (2) head-to-head table, 4 rows (slide), (3) "OpenSpec wins on speed; peak-workflow wins on proof" (motion) |
| **F2 deck** | WP4 slide kind | 5-slide animated deck from doc §4 table + §5 "when to pick" |
| **F3 recorded** | WP7 | ~20 s: live page tour of a TOR-tagged `.feature.md` on GitHub and the OpenSpec docs "workflow" page, timed to a 3-clip spine |
| **F4 real video** | WP10 | ~75–90 s, ~9 plates, following doc §7 talking points: hook (motion) → shared problem (motion) → OpenSpec loop propose→apply→archive (slide + recorded docs page) → delta merging into living spec (motion diagram) → peak-workflow: TOR ID → Requirements Anchors → `/wrapup-epic` refusing same-session (recorded GitHub page + motion terminal replay) → head-to-head (slide) → honest close (motion) → brand outro |

Note: a live terminal session can't be seeked, but a *scripted terminal replay* can — render the `/wrapup-epic` refusal as a `motion` plate unless you want it truly recorded.

## 7. The loop for each WP

```
Lead writes wp/<WP>/brief.md  (scope, owned folders, AC IDs, contracts version, fixtures)
   │
   ▼
Builder (worktree branch feature/peak-media-<wp>)
   implement → run ac-run --wp <WP> → write handoff.md + evidence/
   │
   ▼
Verifier (fresh, Opus, read-only)        ◄── gets acceptance.md + paths only
   runs scripts, reads contact sheets → verify-<n>.md (PASS/FAIL per AC)
   │
   ├─ all PASS → Lead merges --no-ff into feature/new-peak-media-plugin, milestone commit
   └─ any FAIL → findings to Builder (SendMessage / resume session), max 3 rounds → escalate to user
```

**Independence guard:** `handoff.md` records the builder's session/agent ID; `verify-<n>.md` records the verifier's. `ac-run` rejects a verify report whose ID matches the builder's.

**WP status** lives in one table at the top of `acceptance.md`: `not-started → in-progress → implemented → verified` (or `blocked: <reason>`). Only a verifier report moves a WP to `verified`.

Contract-change requests from a builder stop that WP. The request goes in `decisions.md` as ADDED / MODIFIED / REMOVED fields with a reason, so reviewers see the intent, not just a schema diff; the Lead decides, bumps `schemaVersion` if breaking, and notifies the other active builders.

## 8. Running it: two modes

- **In-session (recommended for Waves 1–4):** the Lead session spawns Builders with `Agent(isolation: "worktree")` in the background and Verifiers as fresh agents. You stay in one conversation, see only summaries, and answer gates. Shared state files make compaction safe.
- **Multi-session (fallback, or for WP7/WP10):** each WP gets `claude` in its own `git worktree` with the prompt "Read `plugins/peak-media/docs/build/wp/<WP>/brief.md` and execute it." Use this when a WP needs your hands (live TTS key, listening, D16 container, real brand pack) or when it's long enough to deserve its own context.

## 9. Gates that need you

| When | What you decide |
|---|---|
| WP0 | Skill names/layout, default TTS provider, HF CLI pin, which HF skills to vendor (one question at a time) |
| WP1 end | Contracts v1 freeze |
| WP3b | Cold-read script for F1 |
| WP8 / WP10 storyboard | Approve stills before animation |
| WP6 / WP10 audio | Listen to music + SFX pass |
| WP3a D14 | Provide `TTS_OPENROUTER_API_KEY` for one live run |
| WP10 | Real brand pack path |
| Each milestone | Nothing to do unless a verifier escalates; commits land on the feature branch, no merge to `develop` |

## 10. Housekeeping found during survey

- `peak-media-docs.zip` at repo root is untracked; keep it out of commits.
- `docs/` under `plugins/peak-media/` ships to users. Per DEC-18 build state stays there anyway; WP9 checks it holds no media heavier than JPEGs.

## 11. What this borrows from peak-workflow (and what it skips)

| Borrowed | Cost here |
|---|---|
| Stable requirement IDs + Given/When/Then | One extra column in `acceptance.md` |
| Requirements Anchors per epic | AC ID list in each `wp/<WP>/brief.md` |
| Fresh-session verifier on a stronger model; refuses to verify its own build | Verifier role + ID guard in `ac-run` |
| Baseline tool-hygiene requirements | Five baseline ACs per entry point |
| Tracing sidecar check | `ac-run --trace` (script, not a Haiku agent) |
| Status sidecars | One status table |
| Delta-style requirement changes | ADDED/MODIFIED/REMOVED in `decisions.md` for contract changes |
| `/pause` handoff | `handoff.md` per WP |

Skipped: `/discover` + ConOps (the design doc already is one), `/mockup`, phases, `docs/` branch approval gates, feature-file format, `/refresh-docs`, `/triage`.

## 12. Kickoff

**Plan mode is used in WP0 only.** WP0 is read-only survey + one-at-a-time questions + an approved plan, which is exactly what plan mode enforces. After approval, copy the plan into `plugins/peak-media/docs/build/plan.md` (plan mode stores its own copy outside the repo).

Builders do not use plan mode. They run unattended in worktrees, plan mode would stall them waiting for an approval nobody is watching, and their plan was already approved as the WP brief. Exception: a WP you run yourself as an interactive session (WP10, or anything that needs your key or ears) can start in plan mode for a quick check of the approach.

**Start the Lead session in plan mode** (`claude --permission-mode plan`, or Shift+Tab until "plan mode"), on `feature/new-peak-media-plugin`, and paste:

> Read `tmp/plate_factory_kickoff_prompt.md` (the task), `plugins/peak-media/docs/build/orchestration-plan.md` (how we'll run it), and `plugins/peak-media/docs/plate-factory-workflow.md` + `web2video-plan.md` (as of commit `0ea0ea6`, see DEC-44) in full. You are the Lead in the orchestration plan. Test-video topic: `plugins/peak-media/docs/build/references/openspec-vs-peak-workflow.md`; use the fixtures in plan §6 for the kickoff's "first real video".
>
> This session is WP0. Spawn the four Researchers from plan §2 in parallel (HyperFrames current release + changelog; HyperFrames skills and their licenses; OpenRouter TTS request shape + ZDR field; Playwright screencast API), then ask me your clarifying questions one at a time. Then write the plan: skill names and folder layout, decisions with reasons, the full `acceptance.md` register with given/when/then and baseline ACs, and a brief for each WP. Don't write code until I approve the plan.
>
> After approval: save the plan into `plugins/peak-media/docs/build/`, do WP1 and WP2 yourself, then run waves 2–5 per plan §7–8. Commit at each milestone with the `ac-run` table in the commit body. Never merge to `develop`; ask before any push.
