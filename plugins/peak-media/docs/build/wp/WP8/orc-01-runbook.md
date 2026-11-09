# AC-ORC-01 runbook — the user's F1 run of `/peak-media:plate-factory`

AC-ORC-01 (manual): given the F1 brief and a fresh session, `/peak-media:plate-factory` reaches
`out/final.mp4` and the transcript shows gates 0–9 in order. The same transcript then feeds the
AC-ORC-02..04 checks.

Budget:
- ~30–45 min of your time (five questions plus one listen);
- ~25 MB of renders;
- a few cents of TTS.

## 1. Before you start (once)

Set three variables in the shell you'll launch from:

- `REPO`: the repo checkout.
- `PM`: the plugin folder to load.
  - **Until WP8 is merged**, use the WP8 Builder's worktree:
    `$REPO/.claude/worktrees/agent-abeb5dcaa90418466/plugins/peak-media` (branch `feature/peak-media-wp8`).
  - **After the merge**, use `$REPO/plugins/peak-media` on `feature/new-peak-media-plugin`.
- `RUN`: the scratch video project you created, `~/tmp/peak-media-orc-01`, **outside the repo**. This way the session can't see the repo's CLAUDE.md, the finished `tmp/f1-e2e/` project, the F1 fixtures or the plugin source as project files.

The code blocks in this runbook have no `#` comments, so they paste cleanly into zsh with
`interactivecomments` off. Paste them as they are.

Until WP8 is merged, set `PM` like this:

```bash
REPO=~/github/peakflames/claude-plugins-peakflames
PM="$REPO/.claude/worktrees/agent-abeb5dcaa90418466/plugins/peak-media"
RUN=~/tmp/peak-media-orc-01
```

After the WP8 merge, use this line instead of the `PM=` line above:

```bash
PM="$REPO/plugins/peak-media"
```

Then check that the run can start:

```bash
git -C "$PM" log --oneline -1
bash "$PM/scripts/setup.sh" --check
echo ${PEAK_MEDIA_OPENROUTER_API_KEY:+key set}
df -h ~ | tail -1
```

What each check should show:
- `git log`: the WP8 head, or the merge commit after the merge.
- `setup.sh --check`: `ready`, exit 0.
- The key check: `key set`. If nothing prints, the run will make a silent beat grid.
- `df`: at least 1 GB free.

Fill the scratch project. The folder already exists, and `ls -A` should list nothing (or only
what you put there on purpose). It gets the F1 brief, minus the build notes (the "Used by" line,
the `fake/tone` aside and the closing paragraphs), with its source doc next to it.

```bash
ls -A "$RUN"
mkdir -p "$RUN/source"
cp "$PM/docs/build/references/openspec-vs-peak-workflow.md" "$RUN/source/"
sed -e '/^Script approved/,$d' -e '/^- \*\*Used by:\*\*/d' -e 's# (`fake/tone` in CI)##' -e 's#`../../references/openspec-vs-peak-workflow.md`#`source/openspec-vs-peak-workflow.md`#' "$PM/docs/build/fixtures/F1/brief.md" > "$RUN/brief.md"
cat "$RUN/brief.md"
```

The brief should show:
- Audience, Runtime 26 s, Spine, Brand;
- Source pointing to `source/…`;
- 3 beats;
- no "Used by" line and no fake/tone.

## 2. Launch a fresh session with the plugin loaded

The plugin isn't in `marketplace.json` until WP9, so `--plugin-dir` loads it for this session
only. The path is absolute, so it doesn't depend on the launch folder. Launch **in the scratch
project**, so the video project is the session's working folder:

```bash
cd "$RUN" && claude --plugin-dir "$PM"
```

- Don't use plan mode. Any permission mode works; with prompts on, allow the `node "$PM/…"`
  commands.
- Check that the plugin loaded: typing `/peak-media:` should list `plate-factory`.
- **Deps.** The scripts look for their npm deps in `$CLAUDE_PLUGIN_DATA/deps/<lockhash>/`, or in
  `~/.cache/peak-media/` when that variable is unset. If stage 0's `setup.sh --check` reports
  deps missing, this session's data folder is a new one. Let it run `setup.sh`: it asks first,
  and needs ~135 MB from npm, plus the render browser if one isn't found.

## 3. The prompt to type

```
/peak-media:plate-factory brief.md — make the F1 explainer, 26 s target, default brand pack, export at source size (1280×720, 30 fps).
```

## 4. What to answer at each gate

The session asks you with a question box at gates 0, 1, 3, 4 and 8. It reports gates 2, 5, 6, 7
and 9 itself. Each gate ends with a line like `GATE 4 storyboard: APPROVED — review/storyboard.jpg`.

| Gate | It asks / reports | Answer |
|---|---|---|
| 0 brief | runtime 26 s, 3 beats (hook, compare, close), 1280×720 30 fps, default pack, narrated (Rasalgethi), export `source` | Yes. If it says "beat grid", stop: the key isn't set in the shell you launched from |
| 1 script | a ~50-word script with a cold-read result | Approve if every beat is CLEAR and it reads like the approved F1 script (`$PM/docs/build/fixtures/F1/script.md`). Otherwise paste that script's three paragraphs and tell it to use them |
| 2 spine | `PASS runtime …` within 23.4–28.6 s | (nothing to answer) |
| 3 plates | 3 plates: p1-hook (motion), p2-table (slide), p3-close (motion), times from the spine | Yes |
| 4 storyboard | `review/storyboard.jpg`, one line per plate | Open `$RUN/review/storyboard.jpg`. Approve if the text is right and readable. Known nit: the hook's first line sits alone above centre for ~1 s |
| 5 pipeline | p1 rendered, lint clean | (nothing) |
| 6 build | self-review rounds, then a reviewer agent, fixes | (nothing) |
| 7 composite | `review/review.mp4`, cuts in silence | (nothing) |
| 8 audio | asks for music and SFX | See below |
| 9 export | `out/final.mp4`, final contact sheet | (nothing). Open `$RUN/out/final.mp4` if you like |

**Gate 8.**
- **Music:** `~/github/peakflames/peakflames-videos/videos/2026-10-peak-workflow-short/audio/src/groove-sauce.mp3`. It's your own track and is used locally only; nothing is committed.
- **SFX:** none.

With music only, the session makes one pass, `remux-audio … --music … -o review/review-mix.mp4 --levels review/levels.json`. **Listen to `$RUN/review/review-mix.mp4`** and approve the levels. The file you listen to for each choice:

| Your answer | Listen to |
|---|---|
| no music, no SFX | `$RUN/review/review.mp4` (narration only) |
| music only (this run) | `$RUN/review/review-mix.mp4` |
| SFX only | `$RUN/review/review-mix.mp4` |
| music + SFX | `$RUN/review/review-mix.mp4`. `review-music.mp4` is the intermediate music-only pass |

If the session stops at an error it can't fix, note the stage and the message for the Lead. Don't
fix it by hand: a hand fix is a finding, not a pass.

## 5. Afterwards: find the transcript and run the checker

Exit the session (`/exit`). Its transcript is the newest JSONL in the Claude Code project folder
named after the launch folder (each `/` and other non-alphanumeric character becomes `-`, so
`~/tmp/peak-media-orc-01` → `-Users-<you>-tmp-peak-media-orc-01`):

```bash
P=~/.claude/projects/$(echo "$RUN" | sed 's#[^A-Za-z0-9]#-#g')
S=$(ls -t "$P"/*.jsonl | head -1)
echo "$S"
ls "${S%.jsonl}/subagents"
node "$PM/evals/plate-factory/check-transcript.mjs" "$S"
```

The block prints, in order:
- the session JSONL path;
- the subagent transcripts (the cold reader and the reviewer);
- the checker's report.

Expect four `PASS` lines: AC-ORC-01's gate order, AC-ORC-02, AC-ORC-03 and AC-ORC-04. Any `FAIL`
names the JSONL line. Tell the Lead the session id (the JSONL file name) and the result. Don't
copy the transcript into the repo.

The Verifier then:
- runs the checker again;
- keeps its output and a contact sheet of `out/final.mp4` under `evidence/WP8/` (no MP4);
- asks you to confirm the listen for AC-ORC-01.

Clean up when the Verifier is done: empty the folder with `rm -rf "$RUN"/*`, or remove it with
`rm -rf "$RUN"`.
