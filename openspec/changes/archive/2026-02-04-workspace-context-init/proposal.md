## Why

Workspace initialization logic is scattered across `init`, `install`, and `uninstall` handlers with duplicated agent detection/selection code. The `WorkspaceContext` service currently only reads existing workspace state but doesn't initialize workspaces. Moving initialization into the `WorkspaceContext` factory centralizes this logic, making it automatic and consistent across all commands that need a workspace.

## What Changes

- **BREAKING**: `WorkspaceContext.make()` gains initialization responsibility—creates workspace files if missing
- **BREAKING**: Remove `OperationContext` service entirely; move `nonInteractive` and `yes` (auto-accept) into `WorkspaceContext` options
- **BREAKING**: Global workspace auto-initializes with blank `settings.json` and `axm-lock.yaml` (no agent selection)
- **BREAKING**: Project workspace runs full initialization (agent detection/selection) when files missing
- **BREAKING**: `init` command becomes thin wrapper that just provides WorkspaceContext layer
- Move agent selection logic (currently in handlers) into WorkspaceContext initialization
- Add `yes` option to auto-accept detected agents without prompting
- Add `nonInteractive` option to disable all prompts (fails if input needed)

## Capabilities

### New Capabilities

- `workspace-context-init`: Workspace initialization behavior within WorkspaceContext service factory

### Modified Capabilities

- `cli-init`: Changes from orchestrating initialization to simply providing WorkspaceContext layer
- `cli-skills-install`: Remove OperationContext dependency, rely on WorkspaceContext for initialization
- `cli-skills-uninstall`: Remove OperationContext dependency, rely on WorkspaceContext for initialization

## Impact

- `packages/cli/src/services/workspace-context/service.ts` - Major changes to `make()` function
- `packages/cli/src/services/operation-context.ts` - Deleted
- `packages/cli/src/commands/init/handler.ts` - Simplify to thin WorkspaceContext wrapper
- `packages/cli/src/commands/skills/install/handler.ts` - Remove OperationContext, agent selection
- `packages/cli/src/commands/skills/uninstall/handler.ts` - Remove OperationContext
- `packages/core/` - May need to expose agent detection utilities
