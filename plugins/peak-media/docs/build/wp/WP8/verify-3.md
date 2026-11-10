verifier-id: verifier-wp8-r3-7c2e91b4

# WP8 verify-3 — `/plate-factory` orchestrator

HEAD `2f8f3d2` on `feature/peak-media-wp8`. Builder: `builder-wp8-abeb5dcaa90418466`; verify-1: `verifier-wp8-r1-f4dd4434`; verify-2: `verifier-wp8-r2-45519089`. This round judges the user's run 2 (session `d5e1f46c…`, the run of record per DEC-38) and the round 3–4 changes (`git diff 8d6dc78..a817c6c`). Transcripts and the run folder were read in place; nothing from them was copied into the repo except the probe/cut/sheet outputs below.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-ORC-01 | PASS (DEC-38 deviation: no `GATE 6` line) | evidence/WP8/AC-ORC-0x.verifier-r3.log, evidence/WP8/AC-ORC-01-output.verifier-r3.log, evidence/WP8/AC-ORC-01-final.verifier-r3.jpg | The run reached `out/final.mp4`. probe-spec PASSes it: H.264 High, yuv420p, AAC 48 kHz, faststart, 1280×720, 30 fps, 37000 ms (34000 ms spine + 3000 ms outro). The checker FAILs only on "no passing gate line for gate(s) 6". I read the transcript myself and the first passing lines are in order: 0 (L106, re-approved at L373), 1 (L379), 2 (L390), 3 (L447), 4 (L567), 5 (L585), 7 (L949), 8 (L976), 9 (L1013). Nothing is written between the reviewer (L844), its fix edits and `-fix1` sheets (L857–912) and GATE 7. Each user gate was answered by the user through an `AskUserQuestion` result: gate 0 "Approve" at L102 and L370; gate 1 a free-text rejection at L300, then picks plus "Approve" at L325 and a re-"Approve" at L375; gate 3 "Approve" at L438; gate 4 "Approve" at L563; gate 8 "None"/"None" for stems at L951 and "Approve" at L973. None was self-approved. Contact sheet: see below |
| AC-ORC-02 | PASS | evidence/WP8/AC-ORC-0x.verifier-r3.log | Confirmed by hand. `render-plate --all --storyboard` ran at L501, and two `--storyboard --rescaffold` re-runs (L526, L532) changed only `plates.json` text. The sheet was Read at L505 and L543, the user answered "Approve" at L563, and `GATE 4 storyboard: APPROVED` followed at L567. The first plate write is at L568 (`render-plate … p1-hook --lint --sheet`). There are no Write/Edit calls on `plates/*/index.html` before L639 |
| AC-ORC-03 | PASS | evidence/WP8/AC-ORC-0x.verifier-r3.log | Confirmed by hand. The `contact-sheet` runs on `renders/plates/<id>.mp4` before the reviewer are: p1-hook r1 (L655) and r2 (L665/668, the same call), p2-compare r1 (L709) and r2 (L736), p3-close r1 (L791), p4-result r1 (L819). Each sheet was Read. The stage-5 `--sheet` (L568) is correctly not counted. The reviewer `Agent` call (L844) names `review-rubric.md` and comes after every round |
| AC-ORC-04 | PASS | evidence/WP8/AC-ORC-0x.verifier-r3.log | Confirmed by hand. `Read …/vendor/hyperframes/hyperframes/references/runtimes.md` is at L464, before the first plate write at L568 |
| AC-ORC-05 | PASS | evidence/WP8/plate-factory-evals.verifier-r3.log, evidence/WP8/AC-BASE-13.verifier-r3.log | `node --test evals/plate-factory` passes 11/11, including the AC-ORC-05 test. On a scratch copy of run 2's `plates.json` and spine, `--check` reports all 4 plates on their beats; folder mode retimes with 0 changed |
| AC-BASE-13 | PASS | evidence/WP8/AC-BASE-13.verifier-r3.log, evidence/WP8/ac-run-WP8.verifier-r3.log | `--version` gives 0.1.0, matching plugin.json. `--help` lists every flag. Usage errors exit 2 and refusals exit 1, each with one line and no stack trace. verify-2 finding 8 is fixed: `-o /nope/dir/x.json` gives "cannot write … folder … does not exist" and writes nothing; `--spine /nope.json` is shown as given; folder mode ends `→ <folder>/plates.json`. `ac-run --wp WP8` passes every script AC; `--trace` gives 79 ACs, 0 problems |

**Contact sheet of `out/final.mp4`** (evidence/WP8/AC-ORC-01-final.verifier-r3.jpg, 38 frames at 1 s):
- 0–6 s, p1-hook: "Two tools, one promise:" then "Spec before code." build in; "Who checks the work?" appears in blue at 5 s.
- 7–16 s, p2-compare: "OpenSpec vs. Peak Workflow", with the table rows (Unit of work, Requirement IDs, Verification, Human checks) revealed one by one and a progress bar along the bottom.
- 17–28 s, p3-close: "OpenSpec skips process steps to win on speed.", then from 23 s "Peak Workflow keeps the steps that show every requirement was verified."
- 29–33 s, p4-result: "An audit trail for every requirement," then "from your first release."
- 34 s is a dark frame; 35–36 s show the default outro card ("Your Name" with the logo mark); 36.97 s is dark.

The plates are in beat order, there are no blank or broken frames inside a plate, and the text is legible.

check-cuts on `review/review.mp4` (and on `out/final.mp4`) at the plate boundaries 7010, 16940 and 28470 ms passes all 3 cuts, with silences of 1181, 832 and 935 ms.

## Round 3–4 changes

- **transcript.mjs:**
  - A bold-head gate line is now accepted: lines starting `GATE`/`**GATE` have every `**` stripped (verify-2 finding 2).
  - An errored sheet run is not counted as a round (verify-2 finding 3).
  - Redirect tokens end `renderIds` (verify-2 finding 4).
  - `expandLoops` attributes literal-word `for` loops to each plate.
  - Each change has a good fixture (`good-bold-head`, `good-retried-round`, `good-loop`) and the tests pass.
- **stages.md and the checker agree.** stages.md documents each rule the checker counts and the known limits (verify-2 findings 5–7).
- **SKILL.md and stages.md** add three rules:
  - every stage ends with its gate line, whatever the output style;
  - no stage begins before the previous gate line;
  - the user's wording wins at gate 1, and changes are proposed, not applied.

  They also add the "Show" step before each user gate, the pre-TTS runtime estimate (`words × 60 ÷ 127 + 0.5 s per beat`) and an explicit Stage 7 step 0 that checks GATE 6. Run 2's own data fits the formula: 67 words gives about 33.7 s, against a spine of 34.0 s. These address run 2's two deviations: the missing GATE 6, and the spine run at L336 before any GATE 1 line (L379).
- **retime-plates:** the write now happens before the PASS line, and the paths in messages are shown as the user gave them.

## Scope

- **Files touched:**
  - `git diff 8d6dc78..HEAD` outside the owned folders touches only `docs/build/decisions.md` (DEC-38). That arrived through the merge from `feature/new-peak-media-plugin`; it is the Lead's decision, not the Builder's.
  - `git diff d254fd0..HEAD` otherwise touches only `skills/plate-factory`, `evals/plate-factory`, `docs/build/wp/WP8` and `docs/build/evidence/WP8`.
- **Media:** no MP4/WAV/MP3/MOV is tracked under `plugins/peak-media` or present in `evidence/WP8`.
- **Brand strings:** `grep -rilE 'peakflames|schaveyt'` over `skills/` and `evals/` finds 0 hits.

## Findings

1. **should-fix: the checker doesn't see a stage started before the previous gate line.**
   - **What happens:** round 4's new rule ("a stage may not begin until the previous stage's gate line has been written") is prose only. AC-ORC-01 checks only that the first passing lines are in order.
   - **Run 2 example:** the spine ran at L336, but the first GATE 1 line is at L379. If the GATE 6 line had been written late (after `assemble`), the checker would still have passed it.
   - **Fix:** if WP10 is to rely on the checker, map each stage's first command (spine.mjs → 2, retime/validate on plates.json → 3, `--storyboard` → 4, `assemble` → 7/9, …) and FAIL when it comes before gate n−1's first passing line. Otherwise record it as a known limit in stages.md.
2. **nit: the run's own end-of-run report was wrong.** The run-2 model's SendMessage at L1007 says "All 10 gates passed, 0–9", but there is no GATE 6 line. This doesn't change any verdict; it confirms the gate lines must be judged by the checker, not by the model's summary.
3. **nit: stages.md formatting.**
   - Two blank lines follow the `---` before "Each stage below ends with…".
   - That paragraph has one unwrapped long line ("…or finish that stage first). "Show" means put it in the chat…").
   - It is cosmetic.
