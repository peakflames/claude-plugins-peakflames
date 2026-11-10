# WP1 handoff — Contracts

builder-id: lead-main-session (claude-opus-5-5, interactive Lead session, 2026-11-08)

## Done

- `schemas/spine-manifest.v1.json`, `plates.v1.json`, `brand-pack.v1.json` — JSON Schema 2020-12, `schemaVersion: 1`, `$id` `urn:peak-media:schema:<name>:v1`. Unknown fields rejected; `x-*` extension fields allowed at top level, beat, clip and plate level.
- `lib/cli.mjs` — `runCli(spec, main)`: shared `--help` / `--version` / one-line errors / exit codes (0 ok, 1 fail, 2 usage, 3 missing prereq, 70 unexpected; stack only with `PEAK_MEDIA_DEBUG=1`).
- `lib/deps.mjs` — resolves npm deps from `${CLAUDE_PLUGIN_DATA:-~/.cache/peak-media}/deps/<lockhash>/` then the plugin root (dev). Not in the WP1 owned list; added because `lib/schemas.mjs` needs ajv before WP2's `setup.sh` exists. WP2 owns it from here.
- `lib/schemas.mjs` — ajv validation + cross-reference checks (beat order/overlap, clip↔beat links, totalMs ≥ content end, plate beats exist in the spine, brand files exist, tokens.css defines the required custom props) + `fromLegacyNarration()`.
- `scripts/validate.mjs` — the `validate` entry point (`--schema --from-legacy --out --json --quiet`).
- `package.json` — `ajv@8.20.0` only. WP2 adds the pinned runtime deps and the lockfile.
- Fixtures: `docs/build/fixtures/F0..F4/` (briefs; F0–F3 also have contract instances), `evals/fixtures/{neutral-brief,brand-min,legacy-narration.json,bad/}`.
- Evals: `evals/contracts/validate.test.mjs` (AC-CON-01..03, AC-BASE-02, plus a cross-ref test); `evals/helpers/{run,no-network}.mjs` (shared baseline check + network spy for later WPs).
- `docs/build/agents/{builder,verifier,researcher}.md`; `plugin.json` + `CHANGELOG.md` at 0.1.0 UNDER DEVELOPMENT.

## Choices for the contract-freeze gate

1. `audio` (mixed narration path) is optional in the spine schema so legacy imports validate; the spine always writes it.
2. `brand.json` requires `outro` and `music` (plan §3 sketch); `fonts` may be empty (system fonts).
3. `plates[].text` is a string or an array of lines.
4. Recorder takes reuse the spine schema with optional `spine`, `videoMs`, `wallMs`, `captions[]`.
5. Clip `file` must be `<64 hex>.wav` (the D4 cache key).
6. Beat-grid manifests must have `clips: []` and a `bpm`; narration manifests need ≥1 clip plus model/voice/style/audioOffsetMs/narrate.

## Open

- `ac-run` doesn't exist until WP2, so the WP1 milestone table is assembled by hand from the verify report.

## Edits outside owned folders (disclosed after verify-1)

- `docs/build/wp/WP3a/brief.md` — the legacy-fixture copy moved into WP1 (`evals/fixtures/legacy-narration.json` already exists); WP3a no longer copies it.
- `.gitignore` — dropped the `fixtures/**/spine/` ignore so the hand-authored F0–F3 contract files commit; run output goes under `fixtures/**/run/` instead.
- `lib/deps.mjs`, `package.json`, `package-lock.json`, `evals/helpers/` — handed to WP2 (WP2 owns setup and pins; keep `evals/helpers` shared).

## Round 1 fixes (verify-1 findings)

- F-01/F-02: clips must sit inside their beat's window, and clip↔beat links are checked both ways.
- F-03/F-04: plates must sit inside their beat's window and not overlap; a missing `spine` file is an error; a missing `brand` is a warning (the default pack lands in WP5).
- F-06: CSS comments are ignored and empty token values don't count.
- F-08: `x-*` extensions allowed in `captions[]` and `record`.
- F-10: baseline helper asserts exactly one error line (plus the `--help` hint); the network spy also blocks `dns.promises`.
- F-11: unknown-flag error trimmed to `Unknown option '--x'`. The `setup.sh` pointer in the missing-dependency message stays; WP2 creates the script.
- Left for the freeze decision: F-05 (beat-grid beats without `onScreenText`), F-07 (`record` on non-recorded plates; `record.url` optional). F-09 left as is (no `totalMs` cap; brand paths may point outside the pack).

## Round 2 fixes (verify-2 nits)

- N-01: AC-REC-02/04/06 When-clauses say `capture`.
- N-02: no "only allowed on live" message when `kind` itself is missing.
- N-03: whitespace-only `onScreenText` fails in a beat grid (lib check; schema unchanged).
- N-05: invalid-JSON errors print on one line.
- N-04 left: the tokens check is a pattern match, not a CSS parser.
