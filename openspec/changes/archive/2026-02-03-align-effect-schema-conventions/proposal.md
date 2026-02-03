## Why

Schema definitions in `packages/core/src/experimental/schemas/` don't follow the effect-schema skill conventions. Schema constants share names with their inferred types (e.g., `const Author` and `type Author`), requiring awkward workarounds throughout the codebase:

- `schemas/index.ts` exports types with `Type` suffix aliases (`AgentIdType`, `AuthorType`)
- `skills/settings.ts` manually aliases: `import { type Settings, Settings as SettingsSchema }`
- Inconsistent with `skills/state/types.ts` which correctly uses `<Name>Schema` convention

## What Changes

- Rename schema constants in `packages/core/src/experimental/schemas/` to use `<TypeName>Schema` suffix
- Update type derivations to reference renamed schema constants
- Remove workaround aliases in `schemas/index.ts`
- Update all import sites across the codebase
- **BREAKING**: All public schema constant names change

**Schema files to update:**
| File | Current | New |
|------|---------|-----|
| `common.ts` | `Author`, `FullyQualifiedName`, `ExtensionType`, `SourceType`, `AgentId` | Add `Schema` suffix |
| `settings.ts` | `UrlSource`, `PathSource`, `RegistrySource`, `EmptySource`, `SourcesConfig`, `ExtensionMap`, `Settings` | Add `Schema` suffix |
| `lockfile.ts` | `LockEntry`, `ExtensionLockMap`, `ExtensionsByType`, `Lockfile` | Add `Schema` suffix |
| `manifest-*.ts` | `SkillManifest`, `CommandManifest`, `PackManifest`, `McpServerManifest` | Add `Schema` suffix |

**Import sites to update:**

- `schemas/index.ts` - Remove `*Type` alias workarounds, export schemas with new names
- `skills/settings.ts` - Remove alias workaround, import `SettingsSchema` directly
- `skills/types.ts` - Update re-export
- `skills/index.ts` - Update re-export
- `scripts/generate-schemas.ts` - Update imports for JSON Schema generation

## Capabilities

### New Capabilities

None - this is a refactoring change.

### Modified Capabilities

None - no spec-level behavior changes, only internal naming conventions.

## Impact

- **Code**: All files importing schema constants from `@agentxm/core/experimental/schemas/*`
- **Tests**: Schema test files (`*.test.ts`) will need import updates
- **Scripts**: `generate-schemas.ts` imports schemas for JSON Schema generation
- **No runtime changes**: Type-only refactoring, same runtime behavior
- **Barrel exports**: `schemas/index.ts` can be simplified (remove `*Type` aliases)
