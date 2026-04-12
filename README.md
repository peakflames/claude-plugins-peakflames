# PeakFlames Claude Code Plugins

A plugin marketplace for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by PeakFlames.

## Plugins

| Plugin | Description |
|--------|-------------|
| [epic-workflow](plugins/epic-workflow/) | Structured epic-based project lifecycle — discovery, planning, implementation, verification, and documentation refresh |

## Installation

1. Start Claude Code CLI
2. Run the following command

```bash
/plugin marketplace add https://github.com/peakflames/claude-plugins-peakflames.git
```
3. 
# Install a plugin
/plugin install epic-workflow
```

## Epic Workflow Skills

| Command | Purpose |
|---------|---------|
| `/epic-workflow:discover` | Adaptive interview producing product vision and ConOps docs |
| `/epic-workflow:plan-project` | Derive implementation plan with phases, epics, and specs |
| `/epic-workflow:setup` | Audit CLAUDE.md, stub architecture and design docs |
| `/epic-workflow:add` | Add new epic(s) from natural language |
| `/epic-workflow:start N` | Implement epic N with full planning and verification |
| `/epic-workflow:wrapup N` | Independent review, close out, orient to next |
| `/epic-workflow:pause` | Save progress mid-epic for later resumption |
| `/epic-workflow:status` | Read-only project dashboard |
| `/epic-workflow:refresh-docs` | Sync architecture and design docs to as-built state |

See [epic-workflow/README.md](plugins/epic-workflow/README.md) for full documentation.

## License

MIT
