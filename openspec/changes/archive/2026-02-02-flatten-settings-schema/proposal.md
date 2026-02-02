## Why

The current settings schema nests extension types under an `extensions` wrapper object, adding unnecessary depth. Flattening to root-level properties simplifies the API and aligns with common configuration file patterns.

## What Changes

- **BREAKING**: Remove `extensions` wrapper object from settings schema
- Move `skills`, `commands`, `packs`, and `mcp-servers` to root level of settings
- Update schema validation to accept flattened structure

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `schema-settings`: Change top-level structure to flatten extension types to root

## Impact

- `packages/core/src/experimental/settings/` - Schema definition changes
- `__generated__/settings.schema.json` - Generated JSON schema updates
- Any code reading/writing settings.json files
