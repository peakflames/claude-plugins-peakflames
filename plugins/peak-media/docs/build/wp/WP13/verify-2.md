verifier-id: wp13-verifier-2

# WP13 verify-2 — presets and output (fix round 1)

Builder: `wp13-builder`. Branch `feature/peak-media-wp13` at `866597c`. Delta-only (user rule,
2026-11-10): I checked `git diff 9a8343e..HEAD` and did not run the full suite. The diff touches
`lib/presets.mjs`, `check-take.mjs`, `evals/video-capture/presets.test.mjs`, the handoff and
`evidence/WP13/`. `evals/verify/**` is not touched.

Runs, each alone: `ac-run --wp WP13`, then my own deck captures (fake/tone spine, `--lead-ms 950`,
captions on) at youtube, youtube `--fps 60`, hifi and web, then `node --test
evals/video-capture/presets.test.mjs`, then the check-take consumers in `captions-mux.test.mjs`
(AC-BASE-10, AC-REC-07, AC-REC-10), because check-take's behaviour changed. Two small ffmpeg-only
probes (a 2 s synthetic encode) overlapped a run; no browser was involved. No evidence files were
rewritten, and no headless browsers are left running.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-W2V-10 | PASS | `evidence/WP13/ac-run.verifier-2.log`, `presets-test.verifier-2.log` | Unchanged code path. Re-run passes. |
| AC-W2V-11 | PASS | `evidence/WP13/M2-onsets.verifier-2.log`, `presets-test.verifier-2.log` | My sample-level onsets: web, youtube, youtube@60 and hifi are each +0.02 ms at 950, 7605 and 16078 ms. The test now covers web, youtube and youtube@60 at ±2 ms. |
| AC-W2V-12 | PASS | `evidence/WP13/ac-run.verifier-2.log`, `M2-onsets.verifier-2.log` | `probe-spec --preset` passes on my youtube, youtube@60 and hifi deck takes: 0 elst, closed GOP 15 (30 at 60 fps), max B run 2. |
| AC-W2V-13 | PASS | `evidence/WP13/ac-run.verifier-2.log` | Unchanged code path. Re-run passes. |
| AC-W2V-14 | PASS | `evidence/WP13/M1-1080p-check-take.verifier-2.log`, `presets-test.verifier-2.log` | My takes: `--expect-cuts 2` passes on youtube (cuts 6.700 and 15.167), youtube@60 and hifi (6.733 and 15.167, the second over 2 frames). Each cut is in 1200 ms of silence. Control `--caption-band 0`: 8 cuts, 6 over sound, fail. The new 1080p test passes. |

| Prior finding | fixed | evidence | notes |
|---|---|---|---|
| M1 1080p misses slide changes | yes | `M1-1080p-check-take.verifier-2.log` | See "M1 soundness" below. |
| M2 youtube narration 21.4 ms late | yes | `M2-onsets.verifier-2.log` | 0.02 ms on youtube and youtube@60. Clipping at 0 ms: see below. |
| m1 unbounded merge | yes | `presets-test.verifier-2.log` | Each group is now bounded at 150 ms from its first detection (`g[0]`). The unit and end-to-end tests pass. Synthetic cuts at 2.0 and 2.2 s count as 2. |
| m2 wrong timecode | yes | `presets-test.verifier-2.log` | `cutMs`/`timecode` now come from the failing frame, and the span is in `startMs`/`endMs`/`frames`. The test passes. |
| n1 keyint_min | yes | `M2-onsets.verifier-2.log` (n1 section) | The SEI now shows `keyint=15 keyint_min=1 scenecut=0` (30/3 at 60 fps). The GOP is still fixed: probe-spec's packet check passes. |
| n2 field_order default | not addressed | — | Left as is, by choice. It is still harmless. |

## M1 soundness

- **Web takes cannot get looser.** At 1280x720 the area factor is `min(1, …)` = 1, and at 30 fps or
  less no `fps` filter is added, so the threshold is 0.02 on the same frames as before. The other
  two changes only push toward more failures:
  - Merge window 250 → 150 ms, bounded from `g[0]`: groups are smaller, so there are more counted
    cuts, and a group still passes only if every frame passes.
  - The reported time is the failing frame: this changes only the report.
- **Takes smaller than 720p** keep 0.02, because of the `min(1, …)` clamp. The threshold is never
  raised above 0.02.
- **Area scaling is sound for this content.** The score is a per-pixel average, and pages are
  laid out in CSS px at DPR 1. My raw scores above the band, at 30 fps or less:
  - web peaks 0.034 / 0.044 against 0.02 (1.7–2.2×).
  - youtube peaks 0.0172 / 0.0197 against 0.00889 (1.9–2.2×).
  - hifi peaks 0.0204 / 0.0123 against 0.00889 (1.4–2.3×).
  - Fade-tail frames sit at about 0.7× the threshold at both sizes.

  For content that scales with the viewport (vw layouts), 1080p is only more sensitive, which is
  the strict direction.
- **Sampling at 30 fps** can only skip a change that lasts one 60 fps frame (about 17 ms). A hard
  cut persists, so it is always seen, and the time is quantised to 33 ms, well inside `edgeMs` 100.
  I accept this.

## M2: dropping 1024 samples

`atrim=start_sample=1024` is applied only when `editList === false`, which is youtube only.
Decoders without an edit list play 1024 samples of priming, then input sample 1024 onward.

I encoded a 1 kHz sine that starts at sample 0 with `presetArgs`:
- web: sound from sample 1.
- youtube: sound from sample 1018 (21.2 ms), with phase shift 0. Decoded sample n equals input
  sample n.

So alignment is exact, but **a clip that starts at 0 ms loses its first 21.3 ms**. The priming
plays in its place, as near-silence. See n3.

## New findings

- **m3 — minor — the 150 ms merge window is shorter than the deck's own 200 ms fade.** If a fade
  scores above the threshold on its first frame and again 150 ms or more later, it counts as two
  scene changes, and `--expect-cuts` fails falsely. That is the strict direction, not a false
  pass. Today the tail frames score about 0.7× the threshold (`M1-1080p-check-take.verifier-2.log`:
  web 0.0138 at +100 ms, hifi 0.0091 at +33 ms), so this is not seen, but the margin is not large.
  m1 asked for a bound, not a shorter window. A bound between 200 and 250 ms would keep the
  200 ms-apart test meaningful only if that test moves to, for example, 300 ms. Lead's call.
- **n3 — nit — youtube drops the first 21.3 ms of the mix.** Sound in the first 1024 samples of a
  youtube take is lost. A narrated take normally has a lead (950 ms here), so this only matters
  for a spine with `--lead-ms 0`. The code comment says "lines up", which is true, but it doesn't
  mention the loss. Without an edit list the loss can't be avoided: the priming always occupies
  the first 21.3 ms. Document it, for example "youtube: sound in the first 21 ms is not kept".
- **n4 — nit — the handoff is stale in two places.** "Deviations" still says the merge window is
  250 ms and that youtube's AAC priming is not trimmed. Both changed in fix round 1. The fix-round
  section is correct.
- **n5 — nit — the check-take text summary says "at threshold 0.02" on 1080p takes.** It does not
  show the effective 0.00889. The JSON and `--help` do show it. The `--expect-cuts` error line has
  the same wording.

## Scope

The diff touches only WP13-owned files. There are no MP4/WAV/WebM/MKV files in it, and 0
`peakflames` hits.
