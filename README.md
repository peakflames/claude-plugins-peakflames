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

## License

MIT
