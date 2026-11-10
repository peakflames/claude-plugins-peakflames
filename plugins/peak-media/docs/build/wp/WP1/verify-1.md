verifier-id: verifier-wp1-r1-17f47534

# WP1 verification — round 1

Builder: `lead-main-session` (from handoff.md). I am a separate agent with a different ID. Commit verified: `e831c76`. Node v26.8.1. Every `validate` run below used the `evals/helpers/no-network.mjs` preload.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-CON-01 | PASS | `evidence/WP1/AC-CON-01.log` | F0 beatgrid + plates, F1 manifest + plates, neutral manifest + plates and `brand-min` each exit 0. `--json` shows all three kinds (spine, plates, brand) were exercised. The brand schema is only tested through `evals/fixtures/brand-min`, because none of F0, F1 or neutral ships a brand pack. Their `plates.brand` points at `brand-packs/default`, which doesn't exist yet and isn't checked (see F-04). |
| AC-CON-02 | PASS | `evidence/WP1/AC-CON-02.log` | I diffed each bad fixture against its good twin, and each has exactly one defect of the named type. All six exit 1, and each prints the field: `schemaVersion` ×2, `beats[1].durationMs`, `plates[0].kind`, `plates[1].beat`, `tokens`. The test file asserts exit 1 and checks the field name with an anchored regex. "Brand missing tokens" is read as "the `tokens` field is absent". A missing required custom prop is caught too (verifier runs b1/b2, plus the builder's non-AC cross-ref test). |
| AC-CON-03 | PASS | `evidence/WP1/AC-CON-03.log` | Run on the archived `docs/reference/narration.json` (byte-identical to `evals/fixtures/legacy-narration.json`). `--from-legacy --out` exits 0, and the written manifest validates again with exit 0. I checked fields independently with deep-equal: all 7 top-level legacy fields and all 8 fields × 9 clips are kept (79 checks, 0 mismatches). Only `beat` is added to each clip. The test file also checks field by field (`validate.test.mjs:50-52`). |
| AC-BASE-02 | PASS | `evidence/WP1/AC-BASE-02.log` | `--help` lists all 5 declared flags plus `-q`, `-h`, `--help` and `--version`. `--version` prints `0.1.0`, which matches plugin.json. I tried 9 bad inputs (no args, unknown flag, missing file, bad `--schema`, misused `--out`, broken JSON, an unknown name, a non-legacy file passed to `--from-legacy`, a root array). All exit non-zero with a one-line error and no stack trace. Usage errors add a second line with a `--help` hint. Missing ajv exits 3 with a one-line message. There were 0 NETWORK-ATTEMPT lines and the validate path has no network imports. `node --test` gives 5/5 pass. |

## Findings

Adversarial runs: `evidence/WP1/schema-review-adversarial.log`. None of these violates an AC's then-clause.

- **F-01 should-fix**: clip timing isn't checked against its beat. A clip whose `startMs`/`durationMs` falls outside its beat's window still validates (a05). See `lib/schemas.mjs:78-86`.
- **F-02 should-fix**: the beat↔clip link is only checked one way. If a clip names beat X but X's `clipNs` doesn't list it, the file validates (a09). See `lib/schemas.mjs:78-86`, which checks `clip.beat` exists but not that the beat lists the clip.
- **F-03 should-fix**: plate timing isn't checked against the spine. A plate's `startMs`/`durationMs` can disagree with its beat (a06, `startMs` 999999 / `durationMs` 5), and plates can overlap (a07). Both pass. AC-PLT-01 depends on `durationMs` being correct. See `lib/schemas.mjs:92-111`.
- **F-04 should-fix**: if `plates.spine` names a missing file, the plate→beat check is silently skipped and the file passes with exit 0 (a20). `plates.brand` is never checked at all, so F0, F1 and neutral all point at a `brand-packs/default` that doesn't exist. See `lib/schemas.mjs:99-101`. A missing spine should be an error, or at least a warning.
- **F-05 should-fix**: `kind: beatgrid` doesn't require `beats[].onScreenText` (a14). A beat grid has no clips, so a beat with no text has no content. Schema description at `schemas/spine-manifest.v1.json:12`; conditional at `:46-48`.
- **F-06 nit**: the tokens.css check matches `--x:` inside CSS comments, so a file whose required props all sit inside `/* … */` passes (b3). Empty values also pass (b9). See `lib/schemas.mjs:123`.
- **F-07 nit**: `record` is accepted on `motion`/`slide` plates (a11). `record.url` is optional even for `recorded` (a12), but the plan §3 sketch lists `url` first. Decide this at the freeze gate. See `schemas/plates.v1.json:45-57`.
- **F-08 nit**: `x-*` extensions aren't allowed in `captions[]` or `record` (a17), but they are at top level and in beat, clip and plate. See `schemas/spine-manifest.v1.json:83-92` and `schemas/plates.v1.json:45-54`.
- **F-09 nit**: `totalMs` has no upper bound relative to the content (a08, `totalMs` 1e9 passes), and brand paths may point outside the pack folder (b7). See `lib/schemas.mjs:87-88` and `:117`.
- **F-10 nit**: the eval's "one-line error" check only asserts the first stderr line is non-empty, not that the error is one line (`evals/helpers/run.mjs:30-31`). The network spy doesn't cover `dns.promises` (`evals/helpers/no-network.mjs:14`). Neither matters for validate today, but later WPs will reuse these helpers.
- **F-11 nit**: the missing-dep message points at `scripts/setup.sh`, which doesn't exist until WP2 (`lib/deps.mjs:42`). The `--nope` error passes through parseArgs's long text, which has an unbalanced quote.

### Scope

- Outside the WP1 Owns list:
  - `lib/deps.mjs`, `package.json`, `package-lock.json`: disclosed. Reasonable, because ajv is needed before WP2's setup.sh exists. WP2's Owns list doesn't name them yet, so the Lead should hand them over explicitly.
  - `evals/helpers/*`, `evals/contracts/validate.test.mjs`, `evals/fixtures/{bad,brand-min,legacy-narration.json}`, `scripts/validate.mjs`, F0–F3 `plates.json` + `spine/*`: implied by the Scope paragraph ("validate entry point", "good fixtures", "six bad fixtures"). Reasonable.
  - **Not disclosed in handoff.md**:
    - `docs/build/wp/WP3a/brief.md`: one line edited, moving the legacy-fixture copy from WP3a to WP1.
    - `plugins/peak-media/.gitignore`: removed the ignores for `fixtures/**/spine/` and `review/`, and added `fixtures/**/run/`, so that the F0–F3 spine instances can be committed.
    Both are sensible, but they edit outside the owned folders without a note. **should-fix**: disclose them in handoff.md.
- No contract changes are logged, which is correct because this WP creates v1.
- No MP4/WAV/WebM/MOV under `docs/build/evidence/`, and none tracked in git under the plugin.
- `grep -ri peakflames` over `schemas lib scripts evals` returns nothing (D17 preview clean).
- The brief's finish step `docs/build/tools/ac-run.mjs --wp WP1` couldn't be run because the tool doesn't exist yet (WP2 owns it). The ACs were run by hand instead.
- plugin.json `0.1.0` matches `CHANGELOG.md` `## [0.1.0] — UNDER DEVELOPMENT`.
