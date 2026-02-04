## Why

When installing skills from a local source with `--skill`, the lock file and settings record `"*"` instead of the actual local path. This breaks the ability to track where skills came from and update them correctly.

Both install and uninstall handlers directly manipulate settings/lockfile instead of using the existing ideal state → apply pattern. This bypasses the correct source formatting logic.

## What Changes

- **Install handler**: Remove direct lockfile/settings updates from `installSkillsFromFileSystem()`, use `applyDiff()` instead
- **Uninstall handler**: Replace direct file/settings/lockfile manipulation with `loadSkillsState` → `buildIdealForUninstall` → `computeDiff` → `applyDiff` pattern
- **apply.ts**: Change `sourceToSettingsValue()` to return plain path for local sources (no `local:` prefix)

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-skills-install`: Local source installation must record the source path in settings/lockfile instead of `"*"`
- `cli-skills-uninstall`: Use state-based reconciliation pattern instead of direct manipulation

## Impact

- `packages/cli/src/commands/skills/install/handler.ts` — remove direct updates, wire to `applyDiff()`
- `packages/cli/src/commands/skills/uninstall/handler.ts` — rewrite to use state-based pattern
- `packages/core/src/experimental/skills/state/apply.ts` — fix local source format
- Existing tests may need adjustment
