## Why

The `skills install` command currently contains workspace initialization logic that should be factored out into a dedicated `init` command. This gives users explicit control over workspace setup, supports dry-run preview, and enables re-initialization when needed.

## What Changes

- Add `axm init` command for explicit workspace initialization
- Factor out initialization logic from `skills install` into reusable core module
- Support `--force` flag to re-initialize an already initialized workspace
- Support `--yes` flag for non-interactive mode with sensible defaults
- Support `--dry-run` flag using state-based architecture (actual → ideal → diff)
- Detect installed agents and pre-select them in interactive mode
- Create `.axm/settings.json` with selected agents and `@community` scope

## Capabilities

### New Capabilities

- `cli-init`: Workspace initialization command with agent detection, dry-run support, and force re-initialization

### Modified Capabilities

- `cli-skills-install`: Remove inline initialization logic, delegate to shared init module (implementation detail only, no spec change)

## Impact

- **New files**: `packages/cli/src/commands/init/` (command, handler), `packages/core/src/experimental/workspace-init/` (state types, diff, apply)
- **Modified files**: `packages/cli/src/commands/skills/install/handler.ts` (use shared init logic)
- **Dependencies**: Uses existing agent detection from `@agentxm/core`
- **User-facing**: New `axm init` command available
