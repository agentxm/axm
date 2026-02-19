## Why

Core reusable business logic — operation type definitions, operation executors, shared helpers, and extension constants — currently lives in `cli-commands/`, making it structurally coupled to CLI command directories. This logic is already shared across command boundaries (e.g., packs imports skill operations, packs publish calls skill publish) and will increasingly need to be reused. Moving it to the appropriate general-purpose modules aligns the code organization with its actual usage and makes the reuse explicit rather than accidental.

## What Changes

**Operations** (type definitions + executors, merged into cohesive per-operation files):

- **BREAKING** Move all skill operations to `extensions/skills/operations/` (install, uninstall, publish, copy, enable, disable, rename)
- **BREAKING** Move all pack operations to `extensions/packs/operations/` (install, uninstall, publish, publish-extension, unpack)
- Delete duplicate `Skill` interface from skills `operations.ts` (already exists in `extensions/skills/types.ts`)

**Shared helpers**:

- **BREAKING** Move `cli-commands/skills/fs-helpers.ts` → `utils/fs-helpers.ts`
- **BREAKING** Move `cli-commands/skills/source-to-lock-entry.ts` → `sources/source-to-lock-entry.ts`
- **BREAKING** Move `cli-commands/skills/skill-paths.ts` → `extensions/skills/paths.ts`
- **BREAKING** Move `cli-commands/skills/install/skill-utils.ts` → `extensions/skills/utils.ts`
- Move operation-specific helpers (`copy-directory`, `install-result`) with their operations

**Extension constants and helpers** (co-located with relevant modules, no standalone constants files):

- **BREAKING** Move `MANIFEST_FILENAME` → `extensions/skills/manifest-schema.ts`
- **BREAKING** Move `PACK_MANIFEST_FILENAME`, `RawPackManifest` → `extensions/packs/manifest-schema.ts`
- **BREAKING** Move `cli-commands/packs/pack-paths.ts` → `extensions/packs/paths.ts` (`computePackPaths`, `PackDirPath`)
- Delete `cli-commands/skills/constants.ts` and `cli-commands/packs/constants.ts`

**All moves are internal** — no changes to user-facing behavior, CLI flags, or command output. Existing imports in CLI command handlers will be updated to point to new locations.

## Capabilities

### New Capabilities

None. This is a pure internal refactoring — no new user-facing behavior.

### Modified Capabilities

None. All existing specs describe user-facing behavior which is unchanged. Only internal code organization changes.

## Impact

- **Internal imports**: Every file that imports from the moved modules needs updated import paths. Primary consumers are CLI command handlers (`install/handler.ts`, `publish/handler.ts`, `uninstall/handler.ts`, etc.).
- **Test files**: Co-located test files for moved modules move with them. Tests for importing handlers update their import paths.
- **Barrel exports**: `extensions/index.ts` and feature-level barrels gain new exports for relocated modules.
- **No external API changes**: The CLI binary, command behavior, and user-visible output are unchanged.
- **No dependency changes**: All moved code already depends on the same services (FileSystem, Path, Workspace, registry client, etc.).
