# AC-ORC-01 runbook — the user's F1 run of `/peak-media:plate-factory`

AC-ORC-01 (manual): given the F1 brief and a fresh session, `/peak-media:plate-factory` reaches
`out/final.mp4` and the transcript shows gates 0–9 in order. The same transcript then feeds the
AC-ORC-02..04 checks. Budget: ~30–45 min of your time (five questions plus one listen), ~25 MB
of renders in `tmp/`, a few cents of TTS.

## 1. Before you start (once)

Run these from the repo root, on `feature/new-peak-media-plugin` with WP8 merged.

```bash
REPO=~/github/peakflames/claude-plugins-peakflames
cd "$REPO" && git checkout feature/new-peak-media-plugin && git log --oneline -1   # WP8 merge commit
bash plugins/peak-media/scripts/setup.sh --check          # expect: ready (exit 0)
echo ${PEAK_MEDIA_OPENROUTER_API_KEY:+key set}            # expect: key set (else the run makes a silent beat grid)
df -h . | tail -1                                         # keep ≥ 1 GB free
```

Make the scratch project (gitignored `tmp/`): the F1 brief, without the build notes at the
bottom, and its source doc next to it.

```bash
rm -rf "$REPO/tmp/orc-01" && mkdir -p "$REPO/tmp/orc-01/source"
cp "$REPO/plugins/peak-media/docs/build/references/openspec-vs-peak-workflow.md" "$REPO/tmp/orc-01/source/"
sed -e '/^Script approved/,$d' \
    -e 's#`../../references/openspec-vs-peak-workflow.md`#`source/openspec-vs-peak-workflow.md`#' \
    "$REPO/plugins/peak-media/docs/build/fixtures/F1/brief.md" > "$REPO/tmp/orc-01/brief.md"
cat "$REPO/tmp/orc-01/brief.md"                           # Runtime 26 s, 3 beats, Source → source/…
```

## 2. Launch a fresh session with the plugin loaded

The plugin isn't in `marketplace.json` until WP9, so load it for this session only with
`--plugin-dir` (a relative path resolves from the folder you launch in; the absolute path below
avoids that). Start **in the scratch project**, so the session's working folder is the video
project and its transcript gets its own project folder:

```bash
cd "$REPO/tmp/orc-01" && claude --plugin-dir "$REPO/plugins/peak-media"
```

- Not in plan mode. Any permission mode works; with prompts on, allow the `node …/peak-media/…`
  commands.
- Check the plugin loaded: `/help` or typing `/peak-media:` should list `plate-factory`.
- `tmp/orc-01` is inside the repo, so the repo's `CLAUDE.md` is loaded too. It's about
  releases and git, and shouldn't affect the run; if the session tries to branch or commit, say no.
- **Deps.** The scripts find their npm deps in `$CLAUDE_PLUGIN_DATA/deps/<lockhash>/`, falling
  back to `~/.cache/peak-media/` when the variable is unset. If stage 0's `setup.sh --check`
  reports deps missing, this session's data folder is a new one: let it run `setup.sh` (it asks
  first; ~135 MB from npm, plus the render browser if that isn't found).

## 3. The prompt to type

```
/peak-media:plate-factory brief.md — make the F1 explainer, 26 s target, default brand pack, export at source size (1280×720, 30 fps).
```

## 4. What to answer at each gate

The session asks with a question box at gates 0, 1, 3, 4 and 8, and reports gates 2, 5, 6, 7 and 9
itself. Each gate ends with a line like `GATE 4 storyboard: APPROVED — review/storyboard.jpg`.

| Gate | It asks / reports | Answer |
|---|---|---|
| 0 brief | runtime 26 s, 3 beats (hook, compare, close), 1280×720 30 fps, default pack, narrated (Rasalgethi), export `source` | Yes. If it says "beat grid", stop: the key isn't set in the shell you launched from |
| 1 script | a ~50-word script with a cold-read result | Approve if every beat is CLEAR and it reads like the approved F1 script (`plugins/peak-media/docs/build/fixtures/F1/script.md`). Otherwise tell it to use that script |
| 2 spine | `PASS runtime …` within 23.4–28.6 s | (nothing to answer) |
| 3 plates | 3 plates: p1-hook (motion), p2-table (slide), p3-close (motion), times from the spine | Yes |
| 4 storyboard | `review/storyboard.jpg`, one line per plate | Open `tmp/orc-01/review/storyboard.jpg`. Approve if the text is right and readable. Known nit: the hook's first line sits alone above centre for ~1 s |
| 5 pipeline | p1 rendered, lint clean | (nothing) |
| 6 build | self-review rounds, then a reviewer agent, fixes | (nothing) |
| 7 composite | `review/review.mp4`, cuts in silence | (nothing) |
| 8 audio | asks for music and SFX | Music: `~/github/peakflames/peakflames-videos/videos/2026-10-peak-workflow-short/audio/src/groove-sauce.mp3` (your own track, used locally only; it never gets committed). SFX: none. Then listen to `tmp/orc-01/review/review-mix.mp4` and approve the levels |
| 9 export | `out/final.mp4`, final contact sheet | (nothing). Open `tmp/orc-01/out/final.mp4` if you like |

If it stops at an error it can't fix, note the stage and the message for the Lead; don't fix it
by hand (a hand fix is a finding, not a pass).

## 5. Afterwards: find the transcript and run the checker

Exit the session (`/exit`). Its transcript is the newest JSONL in the project folder named after
the launch folder (every `/` becomes `-`):

```bash
P=~/.claude/projects/$(echo "$REPO/tmp/orc-01" | sed 's#/#-#g')
ls -t "$P"/*.jsonl | head -1                              # the session JSONL
ls "$P/$(basename "$(ls -t "$P"/*.jsonl | head -1)" .jsonl)/subagents" 2>/dev/null   # cold reader + reviewer
cd "$REPO" && node plugins/peak-media/evals/plate-factory/check-transcript.mjs "$(ls -t "$P"/*.jsonl | head -1)"
```

Expect four `PASS` lines (AC-ORC-01's gate order, AC-ORC-02, -03, -04); any `FAIL` names the
JSONL line. Tell the Lead the session id (the JSONL file name) and the result; don't copy the
transcript into the repo. The Verifier runs the checker again, keeps its output and a contact
sheet of `out/final.mp4` under `evidence/WP8/` (no MP4), and asks you to confirm the
listen for AC-ORC-01.

Clean up when the Verifier is done: `rm -rf "$REPO/tmp/orc-01"`.
