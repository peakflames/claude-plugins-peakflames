# PeakFlames Claude Code Plugins

A plugin marketplace for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by PeakFlames.

## Plugins

> **Recommended:** `peak-workflow` is the preferred plugin for new projects. It introduces a
> formal requirements baseline (Gherkin-style TOR requirements) that makes acceptance criteria
> explicit, immutable, and independently verifiable — eliminating the ambiguity of prose
> checklists. Existing `epic-workflow` projects can migrate using
> `/peak-workflow:migrate-from-epic-workflow`.

| Plugin | Description |
|--------|-------------|
| [peak-workflow](plugins/peak-workflow/) ⭐ | Requirements-driven development lifecycle — formal Gherkin TOR requirements serve as the single source of truth for acceptance criteria, test derivation, and verification |
| [epic-workflow](plugins/epic-workflow/) | Structured epic-based project lifecycle — discovery, planning, implementation, and verification using prose acceptance criteria |

## Installation

1. Start Claude Code CLI
2. Add the marketplace:
   ```bash
   /plugin marketplace add https://github.com/peakflames/claude-plugins-peakflames.git
   ```
3. Install your plugin:
   ```bash
   /plugin install peak-workflow
   ```
4. Restart Claude Code

For full documentation, see each plugin's README:
- [peak-workflow/README.md](plugins/peak-workflow/README.md)
- [epic-workflow/README.md](plugins/epic-workflow/README.md)

## Scripts

- [scripts/claude-code-setup](scripts/claude-code-setup/) — one-line installer for standardized Claude Code usage

## Built with Peak-Workflow

[Summit](https://github.com/peakflames/summit) is the public reference example for
`peak-workflow`, built end-to-end using the plugin's requirements-driven lifecycle. The token
spend below covers more than application code — it includes generating and maintaining the full
set of SLCD (Software Life Cycle Data) artifacts and requirements-to-code traceability, produced
to a rigor sufficient for a DO-330 TQL-5 engineering tool. Below is a one-day snapshot of Claude
Code usage while building Summit v0.3.0 with peak-workflow v1.5.0:

| Model | Cost | Tokens |
|-------|------|--------|
| claude-sonnet-5 | $48.88 | 642K tok |
| claude-opus-5 | $12.26 | 99K tok |
| claude-haiku-4-5-20251001 | $1.43 | 56K tok |

## License

MIT
