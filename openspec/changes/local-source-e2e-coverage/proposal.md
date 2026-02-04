## Why

Local source parsing was restored (commit 6e30472), but the CLI handler still rejects local sources with "Source type not yet supported". The handler needs to be updated to actually use the local path resolver and discover skills from local directories.

Local sources are essential for:

- **Development workflows** - testing skills before publishing
- **Private skills** - using skills that aren't published to a registry
- **Iteration speed** - no git clone overhead for local directories

## What Changes

- Implement local source support in the CLI install handler
- Wire up the existing `discoverSkills()` function for local paths
- Ensure e2e tests pass for local source installation

## Capabilities

### New Capabilities

_None - local source parsing already exists, this completes the implementation_

### Modified Capabilities

- **skills install handler** - add local source branch to skill discovery

## Impact

- **Handler**: `packages/cli/src/commands/skills/install/handler.ts` - add local source handling
- **E2E tests**: Existing tests in `packages/cli/e2e/skills-install.test.ts` will start passing
- **No new dependencies** - uses existing `discoverSkills()` from core
