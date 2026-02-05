## Why

The codebase has accumulated structural debt that violates the code organization principles in CLAUDE.md. Constants are defined in multiple places, schemas are duplicated between feature modules and workspace/, and re-exports create unclear module boundaries.

## What Changes

- **Remove duplicate constants**: Delete `LOCKFILE_NAME` and `SETTINGS_FILENAME` from `workspace/paths.ts`; canonical source is the feature module
- **Remove duplicate schemas**: Delete `workspace/lockfile-schema.ts` and `workspace/settings-schema.ts`; import from `lockfile/schema.ts` and `settings/schema.ts`
- **Remove duplicate implementations**: Delete `workspace/lockfile.ts` and `workspace/settings.ts`; import from feature modules
- **Fix re-export chains**: Update `extensions/skills/index.ts` to import from canonical feature modules, not workspace duplicates
- **Add missing barrel files**: Create `index.ts` for `extensions/`, `extensions/commands/`, `extensions/mcp-servers/`, `extensions/packs/`, and `utils/`
- **Simplify workspace/paths.ts**: Keep only path computation functions (`getGlobalDir`, `getProjectDir`, `getAxmDir`), remove all re-exports

## Capabilities

### New Capabilities

None—this is internal refactoring with no user-facing behavior changes.

### Modified Capabilities

None—no spec-level behavior changes.

## Impact

- **lockfile/**: Canonical source for `LOCKFILE_NAME`, schema, and I/O
- **settings/**: Canonical source for `SETTINGS_FILENAME`, schema, and I/O
- **workspace/**: Simplified to path utilities and workspace orchestration; depends on lockfile/ and settings/
- **extensions/skills/**: Imports from canonical feature modules
- **All consumers**: Import from feature modules directly, not through workspace re-exports
