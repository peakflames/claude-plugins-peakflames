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
