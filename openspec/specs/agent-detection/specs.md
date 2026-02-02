# Agent Detection

Detects installed AI coding agents and their skill directories.

## Known Agents

| Agent          | Detect Path           | Skills Dir (Project) | Skills Dir (Global)          |
| -------------- | --------------------- | -------------------- | ---------------------------- |
| Claude Code    | `~/.claude`           | `.claude/skills/`    | `~/.claude/skills/`          |
| Cursor         | `~/.cursor`           | `.cursor/skills/`    | `~/.cursor/skills/`          |
| Windsurf       | `~/.codeium/windsurf` | `.windsurf/skills/`  | `~/.codeium/windsurf/skills` |
| Continue       | `~/.continue`         | `.continue/skills/`  | `~/.continue/skills/`        |
| Cline          | `~/.cline`            | `.cline/skills/`     | `~/.cline/skills/`           |
| GitHub Copilot | `~/.copilot`          | `.github/skills/`    | `~/.copilot/skills/`         |
| Codex          | `~/.codex`            | `.codex/skills/`     | `~/.codex/skills/`           |

Environment variable overrides:

- Claude Code: `CLAUDE_CONFIG_DIR`
- Codex: `CODEX_HOME`

## Detection Algorithm

1. For each known agent, check if detect path exists
2. Return list of detected agents with their configuration
3. Run checks in parallel for performance

## Agent Configuration Schema

```typescript
interface AgentConfig {
  id: string; // Identifier (kebab-case)
  name: string; // Human-readable name
  detectPath: string; // Path to check for installation
  skillsDir: string; // Project-level skills directory
  globalSkillsDir: string; // User-level skills directory
}
```

## Behavior

- Detection is opportunistic—missing agents are silently skipped
- Unknown agents can be specified via `--agent` flag with custom paths
- Agent list may be extended via configuration (future)
