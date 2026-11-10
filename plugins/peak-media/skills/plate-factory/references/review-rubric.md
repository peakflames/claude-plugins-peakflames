# Plate review rubric

Used for the storyboard (stage 4), every self-review round (stage 6) and the independent reviewer
(stage 6). You review **contact sheets**: still frames stamped with their time. You can't watch
video, so judge motion from the sequence of frames.

## A. Checklist (every frame of every plate)

**Matches the spec**
1. The plate shows its `intent` from `plates.json` — one idea, nothing that belongs to another beat.
2. The on-screen text is the plate's `text`, spelled exactly; the layout follows the approved
   storyboard still (`review/storyboard.jpg`).

**Legible**
3. No text clipped, cut off, overlapping other text, or touching the frame edge. Title-safe margin
   is 5% of the frame on every side.
4. Text the viewer must read is at least 27 px tall at 720p (40 px at 1080p); nothing below 22 px
   at 1080p.
5. Contrast: text is clearly readable on its background in every frame, including mid-transition.
6. Each line of text stays on screen long enough to read: about 3 words per second, at least 1.5 s
   once fully shown.

**Brand**
7. Colours and fonts come from the brand pack (its tokens and fonts; no fallback serif or system
   font where the pack has one). No off-palette gradients or glows ("AI slop").
8. The logo, if shown, is the pack's own and isn't stretched or recoloured.

**Motion and frames**
9. The first frame isn't blank or half-built unless the plate is meant to fade in from the
   background; the last frames hold a settled state (the cut lands on it).
10. No flash frames: no single frame of white, black or a different layout between two similar
    frames.
11. Motion has a direction and purpose: things enter, settle and hold. No idle wobble, no element
    jumping position between neighbouring frames.
12. One focal point at a time, with room around it.

**Real material**
13. Screenshots, logos and data are the brief's real assets: no invented UI, fake numbers or
    placeholder imagery.

## B. Severity

| Severity | Meaning | Action |
|---|---|---|
| `blocker` | Wrong content, unreadable text, a flash frame, a blank first frame, invented UI | Must fix before gate 6 |
| `major` | Clipping or overlap, off-brand colour or font, text too small or too brief, layout far from the storyboard | Must fix before gate 6 |
| `minor` | Spacing, alignment, easing or timing nits | Fix if cheap; otherwise list them for the user |

## C. Reviewer answer format

One line per defect, grouped by plate, then a verdict line:

```
<plate-id> @<time>s [blocker|major|minor] <checklist #>: <what is wrong> → <the fix>
…
VERDICT: <n> blocker, <n> major, <n> minor
```

Name the plate and the frame time for every defect. Report only what the sheets show; don't guess
at code. With nothing to report, write `VERDICT: 0 blocker, 0 major, 0 minor`.

(The orchestrator saves this answer to `review/plate-review.md` and marks each defect line
` — fixed` or ` — open`; `gate.mjs build` reads that file.)
