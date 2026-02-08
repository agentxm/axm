## Why

Code review of the uninstall command surfaced convention violations and error handling gaps that silently mask failures, leaving the workspace in inconsistent state. Fixing these improves reliability and aligns with project conventions.

## What Changes

- **Rename arg types**: `UninstallArgs` is defined in both `command.ts` and `handler.ts`. Rename to `UninstallCommandArgs` and `UninstallHandlerArgs` per CLI naming convention.
- **Remove redundant `as const` assertions**: `build-plan.ts` uses `as const` on string literals inside objects that already use `satisfies` — unnecessary.
- **Remove redundant type annotation**: `handler.ts` explicitly annotates `ops` as `ReadonlyArray<UninstallSkillOperation>` when inference already provides the correct type.
- **Narrow executor lockfile read error handling**: `uninstall-skill.ts` catches all `getLockfile()` errors and substitutes an empty lockfile, masking corrupt lockfile errors. Should only recover from file-not-found.
- **Propagate lockfile write errors during partial uninstall**: `uninstall-skill.ts` silently swallows `updateLockEntry` failures. If the lockfile update fails after agent symlinks are already removed, the workspace is left in inconsistent state (lockfile says agents exist, but symlinks are gone).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `skills-uninstall-execute`: Tighten error handling requirements for lockfile read and write operations in the executor. Currently only specifies graceful handling of missing _files on disk_ — does not address lockfile parse errors or lockfile write failures during partial uninstall.

## Impact

- `packages/cli/src/cli-commands/skills/uninstall/command.ts` — type rename
- `packages/cli/src/cli-commands/skills/uninstall/handler.ts` — type rename, remove redundant annotation
- `packages/cli/src/cli-commands/skills/uninstall/build-plan.ts` — remove `as const` assertions
- `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.ts` — narrow error handling
- `packages/cli/src/cli-commands/skills/uninstall/handler.test.ts` — update type import name
- `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.test.ts` — add/update error handling tests
