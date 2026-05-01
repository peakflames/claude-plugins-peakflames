# Feature File Template — `/peak-workflow:capture-requirements`

Used by `capture-requirements` Step 3A.4 (greenfield) and Step 3B.3 (brownfield append).
Write the populated template to `docs/requirements/{NN}-{kebab-case-name}.feature.md`
where `{NN}` is the 2-digit zero-padded feature number (e.g., `01`, `02`, `15`) and
`{kebab-case-name}` is the functional area in kebab case.

Examples:
- `docs/requirements/01-cli.feature.md`
- `docs/requirements/02-auth.feature.md`
- `docs/requirements/03-parts-management.feature.md`

---

## Placeholder Reference

| Placeholder | Meaning |
|---|---|
| `{NN}` | Feature number, 2-digit zero-padded (e.g., `01`) |
| `{N}` | Feature number without padding for the `Feature:` heading (e.g., `1`) |
| `{Feature Title}` | Human-readable title for the functional area |
| `{Persona}` | The primary user role or actor this feature serves |
| `{Want}` | The goal in user terms — functional intent plus emotional/contextual nuance |
| `{So-That}` | The underlying motivation or business outcome |
| `{TOR-NN-XXXXXXX}` | A fresh TOR ID generated per 3A.3 rules |
| `{Requirement title}` | Concise "the system shall …" statement in the present tense |

---

## PM Persona Writing Principles

Apply throughout when authoring Scenarios:

- Capture the **emotional contract** with the user — not just functional behavior, but what
  the user expects to feel (confidence, clarity, speed, control).
- Each Scenario is **independently verifiable** — one Given/When/Then per requirement, testable
  without reading source code (black-box, observable).
- Cover **all paths** — positive paths, negative paths (invalid input, unauthorized access,
  unavailable resource), edge cases (boundary values, empty states), and error feedback
  (what the system communicates when something goes wrong).
- Name **specific, observable outcomes** in the Then clause — not "the system behaves
  correctly" but "the standard output contains the string 'Version:'" or "the UI displays an
  error message 'Invalid credentials'".

---

## File Format

```gherkin
Feature: {N}.0 {Feature Title}
    As a {Persona}
    I want {Want}
    So that {So-That}


# --------------------------------------------------------------------------------------------------
# {Feature Title}
# --------------------------------------------------------------------------------------------------

Scenario: [{TOR-NN-XXXXXXX}] {Requirement title}
    Given {concrete precondition — state of the system or user context before the action}
    When {concrete action taken by the user or an external agent}
    Then {observable outcome — what can be inspected or measured from the outside}

Scenario: [{TOR-NN-XXXXXXX}] {Requirement title}
    Given {precondition}
    When {action}
    Then {expected observable outcome}
    And {additional observable outcome on the same action}

Scenario: [{TOR-NN-XXXXXXX}] {Requirement title — negative path or error case}
    Given {precondition that sets up the error condition}
    When {action that triggers the error}
    Then {observable error signal — message text, status code, log entry, UI state}
```

---

## Brownfield Append Note

When adding new scenarios to an existing feature file in brownfield mode, append at the
**bottom** of the file, after an explicit horizontal rule separator:

```gherkin

# --------------------------------------------------------------------------------------------------
# {Sub-area or delta description — e.g., "CSV Export (added YYYY-MM-DD)"}
# --------------------------------------------------------------------------------------------------

Scenario: [{TOR-NN-XXXXXXX}] {New requirement title}
    Given ...
    When ...
    Then ...
```

**Never reorder, modify, or delete existing Scenarios or TOR IDs.** Existing TOR IDs are
immutable once the feature file has been merged to develop — they are foreign keys referenced
by epic specs, handoffs, and test code.
