# AC-UAT-11 — transcript excerpt

Driver: headless `claude -p` from `~/tmp/pm-w2v-uat/AC-UAT-11/` with `--plugin-dir $P --setting-sources project,local --strict-mcp-config --permission-mode bypassPermissions --disallowedTools Bash(gh:*) Bash(scp:*) Bash(rsync:*) Bash(aws:*) Bash(gsutil:*) Bash(curl -T:*) Bash(curl -F:*) WebFetch WebSearch PushNotification RemoteTrigger --output-format stream-json --verbose`; later turns add `--resume <session>`. Full JSONL: `~/tmp/pm-w2v-uat/AC-UAT-11/transcript-N.jsonl` (not committed). Commands are shown up to 600 characters.

## Turn 1 (session `b23a94da-51a7-4795-907a-c1aef87557ca`)

**User:** Make a captioned 20-second demo of the to-do app in `./ui-demo` for our product website.

### Tool calls

```text
[Skill] {"skill": "peak-media:web2video", "args": "Make a captioned 20-second demo of the to-do app in ./ui-demo for our product website."}
$ bash "~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/scripts/setup.sh" --check; echo "exit=$?"; ls -la ui-demo; ls web2video 2>/dev/null
[Read] ~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/skills/video-capture/references/storyboard-api.md
[Read] ~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/skills/web2video/references/presets.md
$ cd ui-demo && for f in brief.md script.md storyboard.mjs captions-alt.css index.html; do echo "=== $f"; cat "$f"; done; which playwright-cli
[Read] ~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/skills/video-spine/SKILL.md
[Read] ~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/skills/web2video/references/handoff.md
$ cd ~/tmp/pm-w2v-uat/AC-UAT-11 && (python3 -m http.server 8765 --bind 127.0.0.1 --directory ui-demo >/dev/null 2>&1 &) ; sleep 1; mkdir -p /tmp/w2v-explore && cd /tmp/w2v-explore && playwright-cli open 2>&1 | tail -5; playwright-cli goto http://127.0.0.1:8765/index.html 2>&1 | tail -5; playwright-cli resize 1280 720 2>&1 | tail -2; playwright-cli snapshot 2>&1 | tail -30
$ cd /tmp/w2v-explore && cat .playwright-cli/console-*.log | head -5; playwright-cli run-code "async page => { await page.fill('#new','Buy milk'); await page.press('#new','Enter'); await page.fill('#new','Call the plumber'); await page.press('#new','Enter'); await page.fill('#new','Book the dentist'); await page.press('#new','Enter'); await page.getByLabel('Buy milk').click(); await page.click('[data-filter=active]'); const a = await page.locator('#list li:not([hidden])').allTextContents(); await page.click('[data-filter=done]'); const d = await page.locator('#list li:not([hidden])').allTextCont …
$ cd /tmp/w2v-explore && ls -R . | head -30
[Read] /tmp/w2v-explore/mid.png
[Read] /tmp/w2v-explore/end.png
$ cd /tmp/w2v-explore && ls -la mid.png end.png; playwright-cli close 2>&1 | head -3; pkill -f "http.server 8765"; echo closed
$ mkdir -p web2video/todo-demo/{out,review} && cd web2video/todo-demo && cp ../../ui-demo/brief.md ../../ui-demo/script.md . && cat > storyboard.mjs <<'EOF'
// Captioned 20 s demo of the to-do app in ../../ui-demo (beats and captions live in script.md).
// Each beat ≈ 5 s: the action, then a hold so the viewer sees the result.
export const url = '../../ui-demo/index.html';

export default async function storyboard({ beat, click, type, wait, page }) {
  await beat('add', async () => {
    await type('#new', 'Buy milk', { enter: true });
    await wait(500);
    await type('#new', 'Call the plumbe …
```

### Final assistant message (gate question / stop / hand-off)

```markdown
The plan is ready and nothing has been recorded yet — I need your go-ahead before the take.

I found a brief, script and storyboard already in `ui-demo/`, so I used your wording unchanged and only added holds to the storyboard to reach 20 s. The app loads and every action dry-runs cleanly, with no private data on screen.

**Script (`script.md`, copied verbatim from `ui-demo/script.md`)**

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

**Beats (about 5 s each)**

| Beat | Caption | Action |
|---|---|---|
| `add` | Type a task and press Enter | Type "Buy milk" and Enter, then "Call the plumber" and Enter; hold |
| `done` | Tick a task when it is done | Tick "Buy milk" (it strikes through, count goes to "1 left"); hold |
| `filter` | Filters show what is left, or done | Click **Active**, hold, click **Done**, hold |
| `clear` | Clear done tasks to tidy up | Click **Clear done**, hold, click **All**; hold on the tidy list |

**Settings**

- **Mode:** captions, in the default style (dark bar, bottom centre). Your `captions-alt.css` (amber card, serif) is not used unless you ask for it.
- **Preset:** `web` (1280×720, 30 fps), because it is for the product website: small and plays inline.
- **Runtime target:** 20 s (18–22 s accepted).
- **Sign-in:** none needed.
- **Output:** `web2video/todo-demo/out/todo-demo.mp4`

Reply **"Record it"** to proceed, or tell me what to change (for example the caption wording, the task names, or the amber caption style).
```

## Turn 2 (session `b23a94da-51a7-4795-907a-c1aef87557ca`)

**User:** Change the second caption to 'Tick it off when done'.

### Tool calls

```text
$ cd ~/tmp/pm-w2v-uat/AC-UAT-11/web2video/todo-demo && sed -i '' 's/^On screen: Tick a task when it is done$/On screen: Tick it off when done/' script.md && grep -n "On screen" script.md && node "~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/skills/video-capture/scripts/capture.mjs" --storyboard storyboard.mjs --script script.md --out out/todo-demo.mp4 --preset web 2>&1 | tail -40
$ L=~/github/peakflames/claude-plugins-peakflames/plugins/peak-media/lib/verify; node $L/probe-spec.mjs out/todo-demo.mp4 --preset web 2>&1 | tail -8; node $L/contact-sheet.mjs out/todo-demo.mp4 --at 2.2s,4.2s,6.7s,9.0s,11.6s,14.0s,16.5s,19.2s --width 1280 --cols 2 -o review/todo-demo.jpg 2>&1 | tail -3; grep -E '"videoMs"|pageErrors|lateMs' out/todo-demo.take.json; ls -la out
[Read] ~/tmp/pm-w2v-uat/AC-UAT-11/web2video/todo-demo/review/todo-demo.jpg
```

### Final assistant message (gate question / stop / hand-off)

```markdown
Your video is ready: `web2video/todo-demo/out/todo-demo.mp4`

- **Size:** 0.1 MB · 1280×720 @ 30 fps · 19.4 s · H.264 + AAC (MP4)
- **Preset:** `web` — it is for the product website, so it is kept small and plays inline.
- **Mode:** captions (silent audio track)
- **Caption change:** "Tick a task when it is done" → "Tick it off when done", applied as you asked.
- **Beats:** `add` 0.0–4.3 s · `done` 4.3–9.1 s · `filter` 9.1–14.1 s · `clear` 14.1–18.9 s, then a 0.5 s hold on the final list
- **Checks:** probe-spec PASS; check-take n/a (no voice); stills reviewed (`review/todo-demo.jpg`)
- **Findings:** none — no page errors, no late beats, no private data on screen.
- **Re-record:** the project folder `web2video/todo-demo/` re-runs the take (`command[]` in `out/todo-demo.take.json`).

In the `clear` beat, the list briefly reads "Nothing here." after **Clear done** is clicked, because the Done filter is still selected; it then switches to **All** and shows the one remaining task. That follows the storyboard in `ui-demo/`; if you would rather skip the empty state, I can switch to **All** before clearing and re-record.

For music, a branded intro/outro or motion graphics, use `/peak-media:plate-factory`.
```
