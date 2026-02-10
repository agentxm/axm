## Why

The `axm skills remove` command is a placeholder that only prints "Hello Alex" - it was never implemented. Meanwhile, `axm skills uninstall` is the fully functional command for removing skills. Having both commands confuses users and clutters the CLI interface.

## What Changes

- **BREAKING**: Remove the `axm skills remove` command entirely
- Remove the `cli-skills-remove` spec (placeholder spec with no real requirements)

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `cli-skills-remove` spec will be deleted, not modified - it has no real requirements to preserve.

## Impact

- **CLI**: `axm skills remove` will no longer be a valid command
- **Code**: Delete `packages/cli/src/commands/skills/remove/` directory (command.ts, handler.ts, handler.test.ts)
- **Specs**: Delete `openspec/specs/cli-skills-remove/` directory
- **Users**: Anyone using `axm skills remove` (unlikely given it does nothing) must switch to `axm skills uninstall`
