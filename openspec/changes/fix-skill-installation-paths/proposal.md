## Why

Skills install to agent-specific directories that don't match the Agent Skills specification. The `SUPPORTED_AGENTS` configuration uses paths like `.claude/commands` and `.cursor/rules`, but the [agentskills.io](https://agentskills.io) standard and [vercel-labs/skills](https://github.com/vercel-labs/skills) reference implementation use `/skills` subdirectories consistently.

## What Changes

- **BREAKING**: Update skills paths in `SUPPORTED_AGENTS` to match Agent Skills specification
- **BREAKING**: Restructure `AgentConfig` with new `skills: AgentSkillsConfig` property
- Add missing agents from reference (40+ agents vs current ~30)
- Add canonical storage location (`.agents/skills/`) with symlink installation

### Path Corrections

| Agent       | Current (wrong)       | Correct (per spec) |
| ----------- | --------------------- | ------------------ |
| Claude Code | `.claude/commands`    | `.claude/skills`   |
| Cursor      | `.cursor/rules`       | `.cursor/skills`   |
| Codex       | `.codex/instructions` | `.codex/skills`    |
| Windsurf    | `.windsurf/rules`     | `.windsurf/skills` |
| Continue    | `.continue/rules`     | `.continue/skills` |

### Reference Agent List (from vercel-labs/skills)

| Agent          | Project Path        | Global Path                   |
| -------------- | ------------------- | ----------------------------- |
| Claude Code    | `.claude/skills/`   | `~/.claude/skills/`           |
| Cursor         | `.cursor/skills/`   | `~/.cursor/skills/`           |
| Codex          | `.codex/skills/`    | `~/.codex/skills/`            |
| Windsurf       | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| Continue       | `.continue/skills/` | `~/.continue/skills/`         |
| OpenCode       | `.opencode/skills/` | `~/.config/opencode/skills/`  |
| Cline          | `.cline/skills/`    | `~/.cline/skills/`            |
| Goose          | `.goose/skills/`    | `~/.config/goose/skills/`     |
| Amp            | `.agents/skills/`   | `~/.config/agents/skills/`    |
| Roo Code       | `.roo/skills/`      | `~/.roo/skills/`              |
| Gemini CLI     | `.gemini/skills/`   | `~/.gemini/skills/`           |
| GitHub Copilot | `.github/skills/`   | `~/.copilot/skills/`          |

See [vercel-labs/skills README](https://github.com/vercel-labs/skills) for complete list of 40+ agents.

## Capabilities

### New Capabilities

None - this is a bug fix to existing behavior.

### Modified Capabilities

- `skills-install`: Installation paths change to match Agent Skills specification

## Impact

- `packages/core/src/experimental/skills/agent-detection.ts` - Complete rewrite of `SUPPORTED_AGENTS`
- `packages/core/src/experimental/skills/types.ts` - Update `AgentConfig` interface
- Existing skill installations in non-standard paths will not be recognized
- Users must move skills from old paths to new paths manually
