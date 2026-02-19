## Why

`packs uninstall` skips packs not found in the lockfile, but leaves their managed extension folder on disk. If a pack was previously installed and then removed from settings/lockfile (e.g., via a migration or manual edit), the orphaned folder at `.axm/extensions/@namespace/packs/<name>/` persists indefinitely with no way to clean it up through the CLI.

## What Changes

- When a pack name is not in the lockfile, still attempt to remove its managed extension folder from disk before reporting the no-op
- Report "removed from disk" (or similar) when the folder existed and was cleaned up, distinguishing it from a pure no-op where nothing happened

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `cli-packs-uninstall`: Add requirement for disk cleanup of managed extension folders even when the pack is not tracked in settings/lockfile

## Impact

- `packages/cli/src/extensions/packs/operations/uninstall.ts` — the early-return `no-op` path needs to attempt folder removal before returning
- Existing tests need a new case covering orphaned-folder cleanup
