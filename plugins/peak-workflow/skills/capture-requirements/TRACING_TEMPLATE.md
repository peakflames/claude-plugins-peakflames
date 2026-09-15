# Tracing Sidecar Template — Haiku Sub-Agent of `/peak-workflow:capture-requirements`

Used by the Haiku sub-agent invoked in Step 3A.5 and Step 3B.4. One sidecar per
`.feature.md` file, written to `docs/requirements/{NN}-{name}.feature.tracing.json`.

---

## Purpose and Lifecycle

The tracing sidecar captures the **static linkage** from each TOR ID to its upstream sources
at the time the requirement was written. It answers: "Why does this requirement exist?" — by
pointing back to the product vision section and ConOps scenario step it serves, or — for
baseline TORs — to the `CLAUDE.md` Tool Hygiene & Operability or UX Baseline line it implements.

**The sidecar is static after written.** It is updated only when the requirement itself changes
(a change-control event managed on a `docs/` branch), not as epics implement or verify the
requirement. Implementation status is tracked separately via the epic sidecar `requirements:`
field.

Dynamic coverage (which epics implement which TOR IDs, and in what status) is computed at
runtime by `/peak-workflow:status` from the epic sidecars — it is not stored here.

---

## Haiku Sub-Agent Instructions (to be followed verbatim)

For each TOR ID in the feature file:

1. Read the Scenario block: the ID (`TOR-NN-XXXXXXX`), title, Given, When, Then.
2. Search `docs/product-vision-planning/product-vision.md` for the most specific section
   (heading + content) that the requirement traces to. Write a 1–2 sentence paraphrase in
   your own words explaining **why this requirement serves the vision** — do not copy source
   text.
3. Search `docs/product-vision-planning/concept-of-operations.md` for the most specific
   scenario step (cite as `S{N}` for scenario number, `.{step}` for step number within the
   scenario) that the requirement traces to. Write a 1–2 sentence paraphrase explaining
   **what user intent this requirement serves**.
4. Read the `Tool Hygiene & Operability` and `UX Baseline` sections of `CLAUDE.md`. If the
   Scenario sits under the `# Tool Hygiene & Operability` banner or the `# UX Baseline`
   banner, it is a baseline TOR: trace it to `CLAUDE.md` under `claude_md` with `section`
   (`Tool Hygiene & Operability` or `UX Baseline`) and `line` (copy the bold label verbatim;
   for Desktop conventions, `Desktop conventions — <bullet>`), plus a 1–2 sentence paraphrase.
   The `vision` and `conops` arrays may be empty for these; domain TORs leave `claude_md`
   empty. Never record a baseline TOR as `orphan_requirement`.
4b. If the Scenario sits under the `# Safety` banner, trace it to the ConOps §8
   `What Must Never Happen` table under `conops` with `"scenario": "§8"`, `"step": null`, and a
   paraphrase naming the hazard. Never record a Safety TOR as `orphan_requirement`.
5. If a credible trace cannot be found for any source: record the TOR ID under
   `coverage_gaps` with `gap_type: "orphan_requirement"`.
6. After processing all TOR IDs, enumerate ConOps scenario steps and PV goals that are
   **not covered** by any TOR ID in this feature file. Record each under `coverage_gaps` with
   `gap_type: "uncovered_source"`. Place uncovered-source gaps in the feature file whose
   functional area is the closest match to the uncovered source.

**Do NOT modify any `.feature.md` file.**
**Do NOT commit any files.**

---

## JSON Format

Write the sidecar as valid JSON to `docs/requirements/{NN}-{name}.feature.tracing.json`.

```json
{
  "feature_id": "{NN}",
  "feature_file": "{NN}-{name}.feature.md",
  "generated": "{YYYY-MM-DD}",
  "generator": "haiku-sub-agent via /peak-workflow:capture-requirements",
  "requirements": [
    {
      "id": "TOR-{NN}-{XXXXXXX}",
      "title": "{Scenario title verbatim from the .feature.md Scenario line}",
      "traces_to": {
        "vision": [
          {
            "section": "§{number} — {section heading}",
            "paraphrase": "{1–2 sentences in your own words explaining why this requirement serves this vision section}"
          }
        ],
        "conops": [
          {
            "scenario": "S{N}",
            "step": {step-number-as-integer-or-null-if-scenario-level},
            "paraphrase": "{1–2 sentences in your own words explaining the user intent this requirement serves}"
          }
        ],
        "claude_md": [
          {
            "section": "{Tool Hygiene & Operability | UX Baseline}",
            "line": "{bold line label, e.g. Screen states, or Desktop conventions — single instance}",
            "paraphrase": "{1–2 sentences in your own words explaining which baseline convention this requirement implements}"
          }
        ]
      }
    }
  ],
  "coverage_gaps": [
    {
      "gap_type": "orphan_requirement",
      "tor_id": "TOR-{NN}-{XXXXXXX}",
      "note": "No credible trace to vision, ConOps, or a CLAUDE.md baseline line found for this requirement."
    },
    {
      "gap_type": "uncovered_source",
      "source_type": "conops_step",
      "source_ref": "S{N}.{step}",
      "note": "This ConOps scenario step is not covered by any TOR requirement in this feature file."
    },
    {
      "gap_type": "uncovered_source",
      "source_type": "vision_goal",
      "source_ref": "§{number} — {section heading}",
      "note": "This product vision goal is not covered by any TOR requirement in this feature file."
    }
  ]
}
```

---

## Brownfield Append

When updating an existing sidecar in brownfield mode (Step 3B.4):

- Append new TOR ID entries at the **bottom** of the `requirements` array.
- Preserve all existing entries unchanged — do not re-derive or rewrite existing paraphrases.
- Add any new gaps to the `coverage_gaps` array; remove gap entries for TOR IDs that have
  been resolved by the new requirements.
- Update `"generated"` to today's date (the sidecar reflects the state as of the most recent
  `capture-requirements` run).
