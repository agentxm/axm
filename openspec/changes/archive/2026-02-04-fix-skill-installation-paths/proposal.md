## Why

Skills install to agent-specific directories that don't match the Agent Skills specification. The `SUPPORTED_AGENTS` configuration uses paths like `.claude/commands` and `.cursor/rules`, but the [agentskills.io](https://agentskills.io) standard and [vercel-labs/skills](https://github.com/vercel-labs/skills) reference implementation use `/skills` subdirectories consistently.

## What Changes

- **BREAKING**: Update skills paths in `SUPPORTED_AGENTS` to match Agent Skills specification
- **BREAKING**: Restructure `AgentConfig` with new `skills: AgentSkillsConfig` property
- **BREAKING**: Move agent configuration to new top-level `agents/` module
- Add missing agents from reference (40+ agents vs current ~30)
- **Complete workspace migration**: Migrate CLI handlers from `skills/state/*` to `workspace/*`
- **Delete legacy state modules**: Remove `skills/state/` files superseded by `workspace/`

**Deferred** (not in scope for this change):

- Canonical storage location (`.agents/skills/`) with symlink installation

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
- `skills-uninstall`: Installation paths change to match Agent Skills specification
- Agent detection: Moves from `skills/` to shared `agents/` module

## Impact

**New files:**

- `packages/core/src/experimental/agents/` - New module for agent configuration
  - `types.ts` - `AgentConfig`, `AgentSkillsConfig`, `AgentRegistry`
  - `registry.ts` - `AGENTS` Record with corrected paths
  - `detection.ts` - `detectAgent`, `detectAgents` (effectful)
  - `index.ts` - Barrel file

**Deleted files**:

- `packages/core/src/experimental/skills/installer.ts` - Dead code, never imported
- `packages/core/src/experimental/skills/installer.test.ts` - Tests deleted code
- `packages/core/src/experimental/skills/agent-detection.ts` - Moved to `agents/`
- `packages/core/src/experimental/skills/agent-detection.test.ts` - Tests moved code
- `packages/core/src/experimental/skills/state/apply.ts` - Superseded by `workspace/apply.ts`
- `packages/core/src/experimental/skills/state/apply.test.ts` - Tests deleted code
- `packages/core/src/experimental/skills/state/load.ts` - Superseded by `workspace/load-state.ts`
- `packages/core/src/experimental/skills/state/load.test.ts` - Tests deleted code
- `packages/core/src/experimental/skills/state/ideal.ts` - Superseded by `workspace/ideal-state.ts`
- `packages/core/src/experimental/skills/state/ideal.test.ts` - Tests deleted code
- `packages/core/src/experimental/skills/state/diff.ts` - Logic moves to workspace buildPlan
- `packages/core/src/experimental/skills/state/diff.test.ts` - Tests deleted code

**Modified files**:

- `packages/core/src/experimental/skills/types.ts` - Remove `AgentConfig` (moved to agents/)
- `packages/core/src/experimental/skills/state/types.ts` - Keep V2 types, remove legacy types
- `packages/core/src/experimental/skills/index.ts` - Remove agent, installer, and legacy state exports
- `packages/core/src/experimental/workspace/apply.ts` - Add lockfile/settings updates, use `agent.skills.projectDir`
- `packages/cli/src/commands/skills/install/handler.ts` - Migrate to workspace pipeline
- `packages/cli/src/commands/skills/uninstall/handler.ts` - Migrate to workspace pipeline

**User impact:**

- Existing skill installations in non-standard paths will not be recognized
- Users must move skills from old paths to new paths manually
