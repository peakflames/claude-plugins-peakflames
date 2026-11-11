# Autopilot PoC — P0 spike results

*Run 2026-11-11 on macOS (Darwin 27.2), Claude Code 2.1.322, Node 26.8.1, against peak-workflow
3.0.1 (this branch). Plan: `plugins/peak-workflow/docs/autopilot-poc-plan.md` §10 P0. All runs
used a throwaway directory and a minimal `ledger` seed with epic E1 (`Lg1Csv7`, 5 TORs) only. The
seed is kept in `scripts/autopilot-lab/fixtures/ledger/`, and the spike's stdio host and hook
scripts in `scripts/autopilot-lab/spike/` (`host.mjs`, `pretool.mjs`, `log.mjs`, `full.json`) as
reference for P1 and P2.*

## Verdict

**P0 exit met: S1–S4, S7 and S8 pass**, with one design change that P1 must adopt:

> **Plain `claude -p` cannot run the skills.** It has no `AskUserQuestion`, `EnterPlanMode` or
> `ExitPlanMode` tool, and `--tools` cannot add them. The driver must launch every epic session
> as a **stdio host**: `claude -p --input-format stream-json --output-format stream-json
> --verbose --permission-prompt-tool stdio`. With that, all three tools exist, the referee hooks
> answer or park them, and no skill edit is needed.

E1 then ran plan → fresh build → verify → local merge headlessly, with every gate answered by the
hook from a fixed table: **$2.19, about 5 minutes, 72 turns, 0 skill edits.**

## Results

| # | Result | What was observed |
|---|---|---|
| S1 | **Pass** | Skills run from a `-p` prompt. Result fields below |
| S2 | **Pass** | Hooks from `--settings` fire in non-bare `-p` in a new, never-trusted directory. No trust step is needed |
| S3 | **Pass (host mode only)** | Plain `-p`: no `AskUserQuestion` tool; `start-epic` silently skipped the Step 2.5 question. Host mode: the hook's `updatedInput.answers` answered "Start it"; no re-ask |
| S4a | **Pass (from the binary, not observed interactively)** | Handoff format below |
| S4b | **Pass (host mode only)** | Plain `-p`: no plan mode; the model printed the plan as text and waited. Host mode: plan captured at `ExitPlanMode`, session ended `terminal_reason: hook_stopped`, branch created, 0 commits, clean tree |
| S4c | **Pass** | A fresh session given the plan ran every opening, middle and closing step. All CHECK_BUILD checks passed when run by hand |
| S5 | **Pass** | `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` removes the `run_in_background` parameter. Without it, the hook deny works, and the `Stop` input carries `background_tasks` |
| S6 | **Pass** | Hooks fired for wrapup's Haiku docs-refresh subagent (22 events) with `agent_id` and `agent_type: general-purpose` |
| S7 | **Pass, with a change** | Deny rules and a deny hook beat a project allow rule plus an allow hook. See "Plugin loading" |
| S8 | **Pass** | Hook denies and deny rules hold under `acceptEdits` with a broad `Bash` allow |
| S9 | **Measured** | Table below |
| S10 | **Pass** | A `nohup caffeinate -i node …  &` process launched from a `claude -p` session was re-parented to pid 1 and ran to completion after the session exited |
| S11 | **Pass** | Keys below. `curl` and Node `fetch` fail, `node --test` passes, writes outside the clone fail |
| S12 | Not run | Optional |

## Host mode (replaces the invocations in plan §6.6)

```bash
claude -p --input-format stream-json --output-format stream-json --verbose \
  --permission-prompt-tool stdio --include-hook-events \
  --plugin-dir "$PLUGIN_DIR" --settings "$STEP/settings.json" \
  --permission-mode acceptEdits \
  --allowedTools Bash Read Edit Write Glob Grep Skill Agent TaskCreate TaskUpdate \
  --disallowedTools WebFetch WebSearch \
  --max-turns N --max-budget-usd N --model sonnet|opus
```

- The driver writes one line to stdin:
  `{"type":"user","message":{"role":"user","content":[{"type":"text","text":"<prompt>"}]}}`,
  and closes stdin when it reads the `type: "result"` line. The process then exits 0.
- A permission prompt would arrive on stdout as `{"type":"control_request","request_id":…,
  "request":{"subtype":"can_use_tool","tool_name":…,"input":…}}`. The driver answers on stdin with
  `{"type":"control_response","response":{"subtype":"success","request_id":…,"response":
  {"behavior":"deny","message":"…"}}}`. **None arrived in any run** — hooks and `acceptEdits`
  decided everything. The driver should deny and log any that do; it never allows.
- `EnterPlanMode` and `ExitPlanMode` are deferred tools; the model loads them with `ToolSearch`.
  Do not block `ToolSearch`.
- The model's `ExitPlanMode` call has an empty input. The hook still receives the full plan in
  `tool_input.plan` (the harness fills it from the plan file).
- Plan mode writes the plan file to `~/.claude/plans/<name>.md`. Rule R2 must allow that write.
- A hook returning `continue: false` ends the session with `subtype: success`,
  `terminal_reason: hook_stopped`. The driver tells "plan captured" from "parked" by the files
  the hook wrote, not by the result.
- With plain `-p`, pass `< /dev/null`; otherwise the CLI waits 3 s for stdin and warns.

## Facts recorded

**Result fields (S1), identical in `json` and the last `stream-json` line:** `type`, `subtype`,
`is_error`, `result`, `session_id`, `num_turns`, `total_cost_usd`, `duration_ms`,
`duration_api_ms`, `stop_reason`, `terminal_reason`, `usage`, `modelUsage` (per model, with
`costUSD`; includes subagents), `permission_denials` (`tool_name`, `tool_use_id`, `tool_input`),
`subagent_stats`, `api_error_status`, `safety_stops`, `uuid`. Hook denials appear in
`permission_denials` too.

**Init message (S7):** `plugins` (name, path, source, version), `permissionMode`, `tools`,
`skills`, `slash_commands`, `memory_paths`, `model`, `claude_code_version`. Enough for
`effective-setup.json`.

**Hook inputs:** `Stop` carries `background_tasks` (`id`, `type`, `status`, `description`,
`command`), `stop_hook_active`, `last_assistant_message`, `permission_mode`, `transcript_path`.

**Clear-context handoff format (S4a)**, from the CLI's own template:

```
Implement the following plan:
<plan text>

If you need specific details from before exiting plan mode (like exact code snippets, error
messages, or content you generated), read the full transcript at: <transcript path>
```

`prompt.md` uses the first two parts and drops the transcript pointer (R2 denies that path, and
the plan must stand alone).

**Sandbox keys (S11):**

```json
{ "sandbox": { "enabled": true, "allowUnsandboxedCommands": false, "failIfUnavailable": true,
    "network": { "allowedDomains": [], "strictAllowlist": true } } }
```

- Writes are limited to the session's working directory and the sandbox temp directory by
  default; no `allowWrite` entry was needed.
- The sandbox sets `TMPDIR` to `/tmp/claude-<uid>` for Bash, overriding the driver's per-step
  `TMPDIR`. Drop the per-step `TMPDIR` from §6.6, or add it through `filesystem.allowWrite`.
- `git commit` works inside the sandbox, but writes to `.git/config` are blocked. Wrapup's
  `git branch -d` still deleted the branch and left a stale `[branch "feature/…"]` entry.
  Harmless; the driver can clean it after the step.

## Plugin loading (S7) — differs from the plan

This machine loads `peak-workflow@synced` **1.10.0** from claude.ai, and the marketplace install
(1.5.0) is disabled. Neither is the branch copy. `--plugin-dir <checkout>/plugins/peak-workflow`
replaced the synced copy cleanly: the init message listed one `peak-workflow`, source
`peak-workflow@inline`, version 3.0.1. No double load, and no change to the user's install.

**Recommendation:** the driver always passes `--plugin-dir "$PLUGIN_DIR"` (the copy it runs
from). This also guarantees the skills and the referee come from the same version. It replaces
"install the branch copy from a local marketplace" in §6.6. Everything else is still inherited.

Also seen: the user's `permissions.defaultMode` is `bypassPermissions`. `--permission-mode
acceptEdits` overrides it (init shows `acceptEdits`), so the driver must always pass the flag.

## Baseline cost and time (S9) — epic E1, 5 TORs, 10 tests

| Step | Model | Cost | Wall clock | Turns |
|---|---|---|---|---|
| Plan | Sonnet | $0.46 | 70 s | 27 |
| Build | Sonnet | $0.39 | 68 s | 22 |
| Verify | Opus (+ Haiku docs refresh, $0.01) | $1.35 | 157 s | 23 |
| **Total** | | **$2.19** | **4 min 55 s** | 72 |

E1 is small. The §6.11 caps are 10–20× this and can stay as ceilings; revisit after Run A.

## Corrections for P1 and P2

1. **Launcher:** host mode for plan, build and verify sessions (above). The auditor needs no
   gate tools and can stay on plain `-p`.
2. **`--plugin-dir`:** always passed (above).
3. **CHECK_VERIFY "second parent" is wrong as written.** Wrapup added three commits to the
   branch before merging (complete, docs refresh, a docs follow-up). The merge's second parent
   must be a **descendant of** `preVerify.branchTip`, and the commits between them must touch
   only `docs/` and the sidecar.
4. **"No waivers" check must not grep bare words.** A clean handoff contains
   `Count: 0 (undisclosed: 0, waived: 0, fixed at wrapup: 0, amended: 0, pending: 0)`. Parse
   that line and require every count to be 0.
5. **Gate matching is by fragment.** The model appended the card details to the Step 2.5
   question (`Start Epic Lg1Csv7 (csv-import) — CSV import? Phase 1 — Core, planned by …`).
   The answers key returned to the tool must be the question text exactly as asked.
6. **Deny `git remote` writes only.** `Bash(git remote *)` also blocked the bare `git remote`
   that both skills' Freshness Guard runs, and a compound command containing it. Deny
   `git remote add|set-url|rename|remove` and allow the listing.
7. **Plan lint keys on headings, not full template text.** The captured plan kept every
   opening and closing heading and the gate rules, but condensed some template paragraphs.
8. **R2 allow-list additions:** `~/.claude/plans/` (write), the sandbox temp directory.
9. **Build rules:** no post-approval step was missing from the plan. `build-rules.md` needs only
   Step 5's rule, "do not enter plan mode", and "ask with `AskUserQuestion` as the plan words it".

## Owner decisions (2026-11-11)

| Topic | Decision |
|---|---|
| Plugin loading | Epic sessions always load the same peak-workflow copy that launched autopilot: the driver passes `--plugin-dir` with its own plugin root. Cloud sessions are verified later; the PoC is local-only |
| Merge gate | The merge's second parent must descend from `preVerify.branchTip`, and the commits between them may touch only `docs/` and the epic's sidecar. Otherwise roll back and park |
| No-waivers check | Parse the handoff's Deferrals `Count:` line and require every count to be 0, plus no `waived:` line in the sidecar |
| `git remote` | Deny `git remote add`, `set-url`, `rename` and `remove`; allow the read-only listing |
| Gate matching | Match a stable fragment of the skill's question plus the queued epic ID, and require the answer label to be among the offered options. Anything unmatched parks |

**Open, decided by the PoC runs:** the owner is open to a Claude inference call for gate
matching if deterministic matching proves too brittle. The PoC stays deterministic. The report
counts **needless parks** (a gate parked only because its wording missed the table, where a
pre-approved row clearly applied) so Runs A–C give the number. If inference is added, it only
classifies a question to a table row; it never chooses an answer, and anything uncertain parks.

## Not yet exercised

- A parked gate in a real skill run (deferral, amendment). Only the mechanism was tested, with a
  synthetic question.
- A verify FAIL and the fix round.
- The `ConfigChange` hook, and managed settings that disable hooks.
- A long session: the three runs were 1–3 minutes each.
