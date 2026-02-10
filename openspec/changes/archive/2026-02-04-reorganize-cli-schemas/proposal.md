## Why

The `cli/src/schemas/` folder has grown into a flat collection of unrelated schemas (lockfile, settings, manifest types, extension sources). This makes it hard to find related code and doesn't scale as more extension types are added. Reorganizing by domain improves discoverability and co-locates related code.

## What Changes

- Move lockfile schema to dedicated `cli/src/lockfile/` folder
- Move settings schema to dedicated `cli/src/settings/` folder
- Create `cli/src/extensions/` folder to group all extension-related code
- Move `cli/src/skills/` into `cli/src/extensions/skills/`
- Move shared extension schemas (common, extension-sources) to `cli/src/extensions/`
- Move each manifest schema to its extension folder (e.g., `manifest-skill.ts` → `extensions/skills/manifest-schema.ts`)
- Create stub folders for commands, mcp-servers, packs extension types
- Co-locate generated JSON schemas with their source (`__generated__/` folder next to each schema)
- Move and update JSON schema generation script from core to cli

## Capabilities

### New Capabilities

None - this is a pure internal reorganization.

### Modified Capabilities

- `internal-refactor`: File organization changes within cli package

## Impact

- **Code**: All imports from `cli/src/schemas/` need updating
- **Files affected**:
  - `packages/cli/src/schemas/*` (deleted, contents redistributed)
  - `packages/cli/src/skills/*` (moved to `extensions/skills/`)
  - `packages/core/scripts/generate-schemas.ts` (moved to cli, updated)
  - New folders: `lockfile/`, `settings/`, `extensions/`
- **No API changes**: All exports remain the same, just from different paths
