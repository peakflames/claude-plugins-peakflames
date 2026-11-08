verifier-id: verifier-wp1-r2-c4e19a07

# WP1 verification — round 2

Builder: `lead-main-session` (handoff.md). Round 1: `verifier-wp1-r1-17f47534`. Both differ from this ID. Commit verified: `42652e9`. Node v26.8.1. Every `validate` run used the `evals/helpers/no-network.mjs` preload. `node --test evals` gives 5/5 pass.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-CON-01 | PASS | `evidence/WP1/AC-CON-01.log` | F0 beatgrid + plates, F1 manifest + plates, neutral manifest + plates and `brand-min` each exit 0. `--json` covers all three kinds. Each plates file prints the expected `brand` warning (the default pack lands in WP5) and still exits 0. F2 and F3 (F3 after the `live` rename) also exit 0. |
| AC-CON-02 | PASS | `evidence/WP1/AC-CON-02.log` | All six bad fixtures exit 1 and name the field: `schemaVersion` ×2, `beats[1].durationMs`, `plates[0].kind` (the allowed values now list `live`), `plates[1].beat`, `tokens`. |
| AC-CON-03 | PASS | `evidence/WP1/AC-CON-03.log` | `--from-legacy docs/reference/narration.json --out` exits 0, and the written file re-validates with exit 0. The reference file is byte-identical to the eval fixture. My own deep-equal found 7 top-level fields and 9 clips, 79 checks, 0 mismatches. The only added clip key is `beat`. |
| AC-BASE-02 | PASS | `evidence/WP1/AC-BASE-02.log` | `--help` lists all 5 flags plus `-q`, `-h`/`--help` and `--version`. `--version` prints `0.1.0`, matching plugin.json. 9 bad inputs all exit non-zero with no stack trace and no NETWORK-ATTEMPT. Stderr is one line, plus the `--help` hint on usage errors. Invalid-document results go to stdout as FAIL lines. There are no network imports on the validate path. |

## Round-1 findings status

Adversarial runs: `evidence/WP1/schema-review-adversarial-r2.log` (generator `/tmp/pm-v2-wp1/adv.mjs`, outside the repo).

- **F-01 fixed.** A clip that runs past its beat's end (s01) fails, and so does a clip that starts before its beat (s02). Both name `clips[n].startMs`.
- **F-02 fixed.** A beat whose `clipNs` omits its clip fails at `clips[1].beat` (s03). A beat that lists another beat's clip fails at `beats[0].clipNs[1]` (s04).
- **F-03 fixed.** Overlapping plates inside one beat fail (p01). A plate that runs past its beat fails (p02), and so does a plate at 999999 ms (p03). Reverse-ordered plates that don't overlap still pass (p04).
- **F-04 fixed.** A missing `plates.spine` exits 1 with `spine: file not found` (p05). A spine file that isn't JSON exits 1 (p06). A missing `plates.brand` is a warning only and exits 0 (p07). The control with a brand present prints no warning (p00).
- **F-05 fixed (DEC-23).** A beat-grid beat without `onScreenText` fails at `beats[0].onScreenText: is required` (s05). Empty text fails too (s06). A narration beat without it still passes (s08).
- **F-06 fixed.** These all fail on `tokens`: every token inside a comment (b01), an empty file (b02), every value empty (b03), whitespace-only values (b04) and one empty value (b05). A legitimate compact declaration passes (b06).
- **F-07 fixed (DEC-22).** A `live` block on a motion plate fails with `plates[0].live: is only allowed on plates of kind "live"` (p08). It fails on a slide plate too (p09). A live plate without the block fails with `plates[0].live: is required` (p10). A live plate without `url` passes (p11).
- **F-08 fixed.** `x-*` is accepted in `captions[]` (s09) and in `live` (p12). Unknown non-`x-` keys are still rejected in both (s10, p13).
- **F-09 left-by-decision** (handoff, Round 1 fixes). `totalMs` 1e9 still passes (s11).
- **F-10 fixed.** `baseline()` now filters out the hint line and asserts exactly one error line (`evals/helpers/run.mjs:30-31`). The network spy now blocks `dns.promises.lookup/resolve` (`evals/helpers/no-network.mjs:17-18`).
- **F-11 partly fixed, rest left-by-decision.** The `--nope` error now reads `Unknown option '--nope'`. The `setup.sh` pointer stays until WP2 creates the script.
- **Round-1 scope note fixed.** handoff.md now discloses the WP3a brief and `.gitignore` edits.

## Rename (DEC-21)

There is no `recorded` plate kind and no `record` plates.json block left in `schemas/`, `evals/`, `docs/build/fixtures/`, `docs/build/acceptance.md` or `docs/build/wp/*/brief.md`. The old kind fails the enum (p14). An old `record` block is rejected as an unknown field (p15). The remaining hits are prose or legacy data and are fine: legacy `record.mjs` in `evals/fixtures/legacy-narration.json:8`, "recorded" in a narration line and in the `videoMs` description, "record" as an English verb in AC-TTS-07 and WP3b, and the `REC` AC-ID prefix (kept by design).

## New findings

None block an AC.

- **N-01 nit**: some text still names the old verb, not the new `capture` entry point. The When-clauses of AC-REC-02/04/06 say "W record" (`docs/build/acceptance.md:68,70,72`, `docs/build/wp/WP7a/brief.md:26,28`, `docs/build/wp/WP7b/brief.md:27`). "Recorder" also survives as a noun in `acceptance.md:71`, the WP7a/WP7b brief titles (`:1`), `fixtures/F3/brief.md:3` and the spine schema descriptions (`schemas/spine-manifest.v1.json:23,37`). DEC-24 itself says "recorder takes", so the noun may be intended, but "W record" should read "W capture" so WP7a doesn't build a `record` command. The schema descriptions are frozen text only, so leave them.
- **N-02 nit**: a plate with no `kind` but with a `live` block also gets `plates[0].live: is only allowed on plates of kind "live"`, next to the real `plates[0].kind: is required` (p17). The cause is that the `if` requires `kind`, so the `else`/`not` branch fires. The message is misleading but harmless. See `schemas/plates.v1.json:56-58` and `lib/schemas.mjs:58`.
- **N-03 nit**: a beat-grid `onScreenText` of only whitespace (`"   "`) passes (s07). DEC-23 says "non-empty", and `minLength: 1` counts the spaces (`schemas/spine-manifest.v1.json:48`). A `pattern: "\\S"` would close this, but the schema is frozen, so it would need a Contract change entry or a semantic check in `lib/schemas.mjs`.
- **N-04 nit**: the tokens check is a regex heuristic, not a CSS parser. Tokens that appear only inside a CSS string (b07) or after an unclosed `/*` (b08) still count as defined (`lib/schemas.mjs:140-141`). Low risk, since packs are hand-authored. Record it as known.
- **N-05 nit**: for a file with broken JSON, the FAIL message embeds the parser's text, which can contain a raw newline, so the stdout error spans two lines (`lib/schemas.mjs:190`). This is not AC-BASE-02's stderr one-liner, but it's untidy for `--quiet`/log parsing.

## Scope

- 42652e9 edits the WP7a, WP7b and WP9 briefs, `acceptance.md`, `decisions.md` and the F3/F4 briefs. These are Lead edits covered by DEC-21..24, and the contract changes are logged as decisions at the freeze.
- No MP4/WAV/WebM/MOV files are under `docs/build/evidence/` or tracked under the plugin.
- `grep -ril peakflames schemas lib scripts evals` finds nothing.
- plugin.json `0.1.0` matches `CHANGELOG.md` `## [0.1.0] — UNDER DEVELOPMENT`.
- `ac-run.mjs` still doesn't exist (WP2), so I ran the ACs by hand.
