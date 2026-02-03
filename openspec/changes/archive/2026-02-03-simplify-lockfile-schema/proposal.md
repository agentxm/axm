## Why

The current lockfile schema uses nested discriminated unions for skill sources (with `_tag` fields and nested objects), which adds complexity to both the YAML structure and the TypeScript types. A flattened schema is easier to read, write, and parse.

## What Changes

- **BREAKING**: Replace nested `source` object with flat fields:
  - `source` becomes a simple string (`"github"`, `"git"`, `"local"`, `"registry"`)
  - Source-specific fields (`owner`, `repo`, `ref`, `path`, `url`, `scope`, `name`) move to top level
- **BREAKING**: Remove `_tag` discriminator pattern from lockfile YAML
- Remove redundant `name` field from lock entry (the map key is the name)
- Remove `version` field (registry sources can use `ref` for version constraint)

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `schema-lockfile`: Flatten source discriminated union to simple string + top-level fields

## Impact

- `packages/core/src/experimental/schemas/lockfile.ts` - Schema definitions
- `packages/core/src/experimental/skills/lockfile.ts` - Lockfile operations
- Any code reading/writing `axm-lock.yaml` files
- Existing lockfiles will need migration (or regeneration via reinstall)
