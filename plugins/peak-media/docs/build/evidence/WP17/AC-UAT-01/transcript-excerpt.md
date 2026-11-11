# AC-UAT-01 — transcript excerpt

Driver: headless `claude -p` from `~/tmp/pm-w2v-uat/AC-UAT-01/` with `--plugin-dir $P --setting-sources project,local --strict-mcp-config --permission-mode bypassPermissions --disallowedTools Bash(gh:*) Bash(scp:*) Bash(rsync:*) Bash(aws:*) Bash(gsutil:*) Bash(curl -T:*) Bash(curl -F:*) WebFetch WebSearch PushNotification RemoteTrigger --output-format stream-json --verbose`; later turns add `--resume <session>`. Full JSONL: `~/tmp/pm-w2v-uat/AC-UAT-01/transcript-N.jsonl` (not committed). Commands are shown up to 600 characters.

## Turn 1 (session `670849fb-e95b-4ca8-982d-0b67205e9365`)

**User:** Make a captioned 20-second demo of the to-do app in `./ui-demo` for our product website.

### Tool calls

```text
[Skill] {"skill": "peak-media:web2video", "args": "Make a captioned 20-second demo of the to-do app in ./ui-demo for our product website."}
$ bash "~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/scripts/setup.sh" --check; echo "exit=$?"; ls -la ./ui-demo; ls ./web2video 2>/dev/null
[Read] ~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/skills/video-capture/references/storyboard-api.md
[Read] ~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/skills/web2video/references/presets.md
[Read] ~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/skills/web2video/references/handoff.md
$ cd ./ui-demo && for f in brief.md script.md storyboard.mjs captions-alt.css index.html; do echo "=== $f"; cat "$f"; done; which playwright-cli
[Read] ~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/skills/video-spine/SKILL.md
$ cd ~/tmp/pm-w2v-uat/AC-UAT-01 && S=$(mktemp -d) && cd "$S" && playwright-cli open >/dev/null 2>&1; playwright-cli goto "file://~/tmp/pm-w2v-uat/AC-UAT-01/ui-demo/index.html" | tail -5
playwright-cli run-code "async page => {
  await page.setViewportSize({width:1280,height:720});
  await page.locator('#new').fill('Buy milk'); await page.keyboard.press('Enter');
  await page.locator('#new').fill('Call the plumber'); await page.keyboard.press('Enter');
  await page.getByLabel('Buy milk').click();
  const a = await page.locator('#count').textContent();
  await page.loca …
$ S=$(mktemp -d); (cd ~/tmp/pm-w2v-uat/AC-UAT-01/ui-demo && python3 -m http.server 8731 --bind 127.0.0.1 >/dev/null 2>&1 &) ; sleep 1; cd "$S"
q(){ grep -v -e '╔' -e '║' -e '╚' -e '^$'; }
playwright-cli open 2>&1 | q | tail -2; playwright-cli goto "http://127.0.0.1:8731/index.html" 2>&1 | q | tail -3
playwright-cli run-code "async page => {
  await page.setViewportSize({width:1280,height:720});
  await page.locator('#new').fill('Buy milk'); await page.keyboard.press('Enter');
  await page.locator('#new').fill('Call the plumber'); await page.keyboard.press('Enter');
  await page.get …
[Read] /var/folders/2n/ccyy63_91bz46s53b7rdtshh0000gn/T/tmp.fS8UftyGMw/mid.png
$ cat /var/folders/2n/ccyy63_91bz46s53b7rdtshh0000gn/T/tmp.fS8UftyGMw/.playwright-cli/console-*.log | head
$ P=~/tmp/pm-w2v-uat/AC-UAT-01/web2video/todo-demo; mkdir -p "$P/out" "$P/review" && cp ui-demo/brief.md ui-demo/script.md "$P/" && cat > "$P/storyboard.mjs" <<'EOF'
// Captioned 20 s demo of the to-do app in ../../ui-demo (beats and captions live in script.md).
// Each beat is held to about 5 s so the viewer sees the result before the next caption.
export const url = '../../ui-demo/index.html';

export default async function storyboard({ beat, click, type, wait, page }) {
  await beat('add', async () => {
    await type('#new', 'Buy milk', { enter: true });
    await wait(500);
   …
```

### Final assistant message (gate question / stop / hand-off)

```markdown
The project is set up in `web2video/todo-demo/` and the dry run of every action worked, but nothing is recorded yet. I need your go-ahead on the plan below first.

I reused the `brief.md` and `script.md` already in `ui-demo/` word for word. The storyboard is a new copy with holds added so the take lands on 20 s.

**Script (`script.md`)**

```markdown
# To-do demo — script

## add
Type a task and press Enter. New tasks land at the bottom of the list.

On screen: Type a task and press Enter

## done
Tick a task when it is finished.

On screen: Tick a task when it is done

## filter
The filters show what is left, or only what is done.

On screen: Filters show what is left, or done

## clear
One click clears the finished tasks.

On screen: Clear done tasks to tidy up
```

**Beats**

| Beat | Caption | Action |
|---|---|---|
| `add` | Type a task and press Enter | Type "Buy milk" and press Enter, then "Call the plumber" and press Enter |
| `done` | Tick a task when it is done | Tick "Buy milk"; it strikes through and the count shows "1 left" |
| `filter` | Filters show what is left, or done | Click Active (only the plumber task), then Done (only the milk task) |
| `clear` | Clear done tasks to tidy up | Click "Clear done", then All; only "Call the plumber" remains |

**Settings**

- **Mode:** captions, with a visible cursor and no voice.
- **Preset:** `web` (1280×720, 30 fps), because it is for the product website, so the file stays small and plays inline.
- **Runtime:** 20 s target (18–22 s accepted), about 5 s per beat.
- **Output:** `web2video/todo-demo/out/todo-demo.mp4`
- **Sign-in:** none; the app is a static local page.
- **Private data:** none on screen; the app starts empty and shows only the two sample tasks.

Reply "record it" to capture, or tell me what to change (captions, sample tasks, pacing, caption style) and I'll apply it and record.
```

## Turn 2 (session `670849fb-e95b-4ca8-982d-0b67205e9365`)

**User:** approve

### Tool calls

```text
$ cd ~/tmp/pm-w2v-uat/AC-UAT-01/web2video/todo-demo && node "~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/skills/video-capture/scripts/capture.mjs" --storyboard storyboard.mjs --script script.md --out out/todo-demo.mp4 --preset web 2>&1 | tail -40
$ sed -i '' -e 's/await wait(1800);/await wait(2700);/' -e 's/await wait(2000);/await wait(2300);/' -e 's/await wait(500); \/\/ hold/await wait(800); \/\/ hold/' storyboard.mjs && PM=~/github/peakflames/claude-plugins-peakflames/plugins/peak-media && node "$PM/skills/video-capture/scripts/capture.mjs" --storyboard storyboard.mjs --script script.md --out out/todo-demo.mp4 --preset web 2>&1 | tail -8 && node "$PM/lib/verify/probe-spec.mjs" out/todo-demo.mp4 --preset web; echo "probe exit=$?"; node -e '
const m=JSON.parse(require("fs").readFileSync("out/todo-demo.take.json","utf8"));
 …
$ node "~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/lib/verify/contact-sheet.mjs" out/todo-demo.mp4 --at 2.46s,4.7s,7.07s,9.0s,11.69s,14.0s,16.66s,19.6s --width 1280 --cols 2 -o review/todo-demo.jpg 2>&1 | tail -3; node -e 'const m=JSON.parse(require("fs").readFileSync("out/todo-demo.take.json","utf8"));console.log(m["x-take"].pageErrorCount, JSON.stringify(m["x-take"].pageErrors))'
[Read] ~/tmp/pm-w2v-uat/AC-UAT-01/web2video/todo-demo/review/todo-demo.jpg
```

### Final assistant message (gate question / stop / hand-off)

```markdown
Your video is ready: `web2video/todo-demo/out/todo-demo.mp4`

- **Size:** 0.1 MB · 1280×720 @ 30 fps · 19.9 s · H.264 + AAC (MP4)
- **Preset:** `web` — you said it's for the product website, so it's kept small and plays inline.
- **Mode:** captions (visible cursor, silent audio track)
- **Beats:** `add` 0.0–4.9 s · `done` 4.9–9.2 s · `filter` 9.2–14.2 s · `clear` 14.2–19.1 s, then a 0.8 s hold on the final state
- **Checks:** probe-spec PASS; check-take n/a (no voice); stills reviewed (`review/todo-demo.jpg`)
- **Findings:** none — no page errors, no late beats, no private data on screen (only the sample tasks "Buy milk" and "Call the plumber").
- **Re-record:** the project folder `web2video/todo-demo/` re-runs the take (`command[]` in `out/todo-demo.take.json`)

The first take came in at 18.5 s, so I lengthened the holds and recorded again to land on 19.9 s. In the stills, each caption is readable and sits well below the app card, and each action finishes before the next caption appears.

Your files in `ui-demo/` are untouched; the project uses copies of the brief and script and its own storyboard.

For music, a branded intro/outro or motion graphics, use `/peak-media:plate-factory`.
```
