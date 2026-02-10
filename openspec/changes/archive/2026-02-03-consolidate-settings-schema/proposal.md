## Why

There are duplicate Settings schema definitions that have diverged from the canonical spec. The `skills/settings.ts` module defines its own `SettingsSchema` and imports a `Settings` interface from `skills/types.ts`, both of which conflict with the canonical `schemas/settings.ts`. This creates maintenance burden and validation inconsistencies.

## What Changes

- **BREAKING**: Remove `SettingsSchema` from `skills/settings.ts` - use canonical schema from `schemas/settings.ts`
- **BREAKING**: Remove `Settings` interface from `skills/types.ts` - use inferred type from canonical schema
- Update `skills/settings.ts` to import `Settings` type from `schemas/settings.ts`
- Adjust `readSettings`, `writeSettings`, and related functions to work with all-optional fields
- Update `createDefaultSettings()` to return valid empty object `{}`

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none - this is an implementation consolidation, the `schema-settings` spec already defines all fields as optional)

## Impact

- `packages/core/src/experimental/skills/settings.ts` - Remove local schema, import canonical
- `packages/core/src/experimental/skills/types.ts` - Remove `Settings` interface
- `packages/core/src/experimental/schemas/settings.ts` - No changes (already canonical)
- Consumers of `readSettings`/`writeSettings` may need to handle optional `agents` and `skills` fields
