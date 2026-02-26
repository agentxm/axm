## Why

Settings and manifest schemas currently mix key styles (`mcp-servers` alongside camelCase fields), which makes config authoring inconsistent and adds avoidable mapping logic. We want one canonical convention across user-facing schema keys: camelCase.

## What Changes

- Standardize schema-defined keys in `settings.json` and all extension manifest schemas to camelCase.
- Replace kebab-case keys such as `mcp-servers` with camelCase equivalents such as `mcpServers` in schema contracts.
- Update validation, examples, and docs/spec references so camelCase is the only accepted shape. **BREAKING**
- Align read/write flows so persisted config and manifest output use camelCase consistently.

## Capabilities

### New Capabilities

- `camel-case-config-schemas`: Define and enforce camelCase-only key contracts for settings and extension manifests.

### Modified Capabilities

- `extension-packs`: Pack manifest requirements use camelCase keys for dependency maps (including MCP server dependencies).
- `mcp-servers-install-execute`: Settings write/read requirements target `settings.json.mcpServers` (not `mcp-servers`).
- `commands-install-execute`: Settings schema references remain aligned with camelCase-only settings contract.

## Impact

- Schema modules under `packages/cli/src/settings/` and `packages/cli/src/extensions/*/manifest-schema.ts`.
- Config and manifest serialization/parsing paths that currently emit or accept kebab-case keys.
- OpenSpec capability docs and scenarios that currently reference kebab-case key names.
- Unit and e2e coverage for settings/manifest validation and install flows.
