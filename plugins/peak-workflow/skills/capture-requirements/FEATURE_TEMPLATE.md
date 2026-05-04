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

## Core Principle: One Artifact, Two Roles

Each `Scenario:` block is a **TOR requirement and its verification procedure in a single
artifact**:

- **The Scenario title is the formal "shall" statement** — the requirement itself, in
  normative language. This is what the team is bound to deliver.
- **The Given / When / Then is the verification procedure** — the test case that demonstrates
  the requirement is satisfied, expressed in observable behavior.

This is the BDD discipline applied to TQL-5: the same artifact that defines what shall be built
also defines how its satisfaction is demonstrated. There are no separate "acceptance criteria"
or "verification" fields — the Scenario title and its Given/When/Then together are the
requirement.

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
| `{TOR-NN-XXXXXXX}` | A fresh TOR ID generated per Step 3A.3 rules |
| `{shall statement}` | A complete normative sentence: `The {subject} shall {observable behavior}` |

---

## PM Persona Writing Principles

Apply throughout when authoring Scenarios:

- **The Scenario title is a full sentence in shall form.** Use `"The tool shall …"`,
  `"The system shall …"`, or `"The {component} shall …"` — never a fragment, never a bare
  noun phrase. The title alone, read out of context, must read as a complete requirement.
- Use **shall** for normative requirements. Avoid *should*, *will*, *may*, *must*, or *can*
  in the title — those carry different connotations in requirements engineering and create
  review ambiguity.
- Capture the **emotional contract** with the user — not just functional behavior, but what
  the user expects to feel (confidence, clarity, speed, control).
- Each Scenario is **independently verifiable** — one Given/When/Then per requirement,
  testable without reading source code (black-box, observable).
- Cover **all paths** — positive paths, negative paths (invalid input, unauthorized access,
  unavailable resource), edge cases (boundary values, empty states), and error feedback (what
  the system communicates when something goes wrong).
- Name **specific, observable outcomes** in the Then clause — not "the system behaves
  correctly" but "the standard output contains the string 'Version:'", "the standard error
  matches /^unknown option:/", or "the log contains an Error with Id 6". Numbers, regex
  matches, exit codes, and named log entries beat prose.
- **One requirement per Scenario.** Do not split a single requirement across multiple
  Scenarios; do not bundle multiple requirements into one Scenario.

---

## Gherkin Subset Used

The template uses a deliberately small slice of Gherkin. The features below are encouraged
where they add clarity:

| Feature | When to use |
|---|---|
| `Feature:` heading + `As a / I want / So that` | Always — even one line each is enough on a small feature |
| Section banner comments (`# ---`) | Group Scenarios by sub-area when the file has more than ~5 of them |
| `Scenario:` block | One per TOR requirement |
| Inline `# Note:` blocks inside a Scenario | When the requirement carries non-obvious context (file format expectations, parsing rules, edge-case rationale) — keep next to the Scenario, not in design docs |
| Data Tables (`\| col \| col \|`) under a step | Tabular expected outputs and structured given inputs (records to import, key/value pairs to verify) |
| Doc Strings (`"""`) under a step | Multi-line literal content — file bodies, JSON / YAML payloads, log excerpts, expected stdout/stderr blocks |

The following Gherkin features are **not** used in this template:

| Feature | Why not |
|---|---|
| Tags (`@tag`) | One requirement per Scenario keeps the artifact simple; categorization comes from section banner comments |
| `Background:` | Repeating Givens makes each Scenario independently readable as a complete requirement-and-test pair |
| `Rule:` | Adds a layer of structure without earning its complexity for typical projects |
| `Scenario Outline` / `Examples:` | Each TOR ID names exactly one requirement; parameterization splits one ID across rows and breaks the "one Scenario = one requirement" rule |

**Step vocabulary is generic plain English.** Application-specific step phrasing (e.g.,
`the Log should contain an Error with Id 6`, `the HLR Document should contain the following
records`) emerges over time as the project's test step library matures — especially when a
structured logger is part of the application, which is itself a beneficial design choice for
testability. Start generic; let domain dialect grow.

---

## File Format

```gherkin
Feature: {N}.0 {Feature Title}
    As a {Persona}
    I want {Want}
    So that {So-That}


# --------------------------------------------------------------------------------------------------
# {Sub-area heading — e.g., "Version and Help" or "Configuration Loading"}
# --------------------------------------------------------------------------------------------------

Scenario: [{TOR-NN-XXXXXXX}] The {subject} shall {observable behavior, full sentence}
    Given {concrete precondition — state of the system or user context before the action}
    When {concrete action taken by the user or an external agent}
    Then {observable outcome — what can be inspected or measured from the outside}

Scenario: [{TOR-NN-XXXXXXX}] The {subject} shall {a different observable behavior}
    Given {precondition}
    When {action}
    Then {expected observable outcome}
    And {additional observable outcome on the same action}


# --------------------------------------------------------------------------------------------------
# {Another sub-area}
# --------------------------------------------------------------------------------------------------

Scenario: [{TOR-NN-XXXXXXX}] The {subject} shall {requirement involving structured input or output}
    #
    # Note:
    #   1. {Non-obvious context for a future reader — parsing rule, edge case rationale, ...}
    #   2. {Reference to architecture.md or design-notes.md when the contract is documented elsewhere.}
    #
    Given a file at '{relative/path}' with content:
        """
        {literal multi-line content goes here — exactly as the system will see it}
        """
    And the user passes the commandline args '{args}'
    When the Tool is Run
    Then the standard output should be valid JSON containing the following keys and values:
        | key        | value   |
        | {key-name} | {value} |
        | {key-name} | {value} |
    And the exit code should be 0


Scenario: [{TOR-NN-XXXXXXX}] The {subject} shall {negative-path or error-handling requirement}
    Given {precondition that sets up the error condition}
    When {action that triggers the error}
    Then {observable error signal — message text, exit code, named log entry, UI state}
    And {additional observable outcome}
```

---

## Worked Example

```gherkin
Feature: 1.0 Command-line Interface
    As a developer
    I want to execute the tool from the commandline
    So that the tool can be used by automated build and test environments


# --------------------------------------------------------------------------------------------------
# Version and Help
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-01-Afs657G] The tool shall report its part number and semantic version to standard output when invoked with --version
    Given the user passes the commandline args '--version'
    When the Tool is Run
    Then the standard output should contain a line matching /^myapp v\d+\.\d+\.\d+$/
    And the exit code should be 0

Scenario: [TOR-01-Bcd2345] The tool shall accept -v as a short alias for --version, producing identical output to --version
    Given the user passes the commandline args '-v'
    When the Tool is Run
    Then the standard output should contain a line matching /^myapp v\d+\.\d+\.\d+$/
    And the exit code should be 0


# --------------------------------------------------------------------------------------------------
# Configuration Loading
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-01-Def4567] The tool shall load configuration from a YAML file specified by --config and apply each declared key
    #
    # Note:
    #   1. The YAML file is parsed in strict mode — unknown top-level keys log a Warning with Id 12.
    #   2. Type-checking of values is documented in docs/architecture.md §3.2.
    #
    Given a file at 'config.yaml' with content:
        """
        verbosity: 2
        output: json
        timeout_ms: 500
        """
    And the user passes the commandline args '--config config.yaml status'
    When the Tool is Run
    Then the standard output should be valid JSON containing the following keys and values:
        | key        | value |
        | verbosity  | 2     |
        | output     | json  |
        | timeout_ms | 500   |
    And the exit code should be 0


# --------------------------------------------------------------------------------------------------
# Invalid Input Handling
# --------------------------------------------------------------------------------------------------

Scenario: [TOR-01-Cde3456] The tool shall reject unknown commandline flags with exit code 2 and a usage hint pointing to --help
    Given the user passes the commandline args '--bogus'
    When the Tool is Run
    Then the standard error should contain the string "unknown option: --bogus"
    And the standard error should contain the string "Try 'myapp --help' for usage."
    And the exit code should be 2
```

---

## Brownfield Append Note

When adding new scenarios to an existing feature file in brownfield mode, append at the
**bottom** of the file under a new section banner that names the sub-area and date of the
addition:

```gherkin

# --------------------------------------------------------------------------------------------------
# {Sub-area or delta description — e.g., "CSV Export (added YYYY-MM-DD)"}
# --------------------------------------------------------------------------------------------------

Scenario: [{TOR-NN-XXXXXXX}] The {subject} shall {new requirement in shall form}
    Given ...
    When ...
    Then ...
```

**Never reorder, modify, or delete existing Scenarios or TOR IDs.** Existing TOR IDs are
immutable once the feature file has been merged to develop — they are foreign keys referenced
by epic specs, handoffs, and test code.
