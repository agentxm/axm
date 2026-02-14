## MODIFIED Requirements

### Requirement: Add extension to pack manifest

`axm packs add <pack> <extension>` SHALL add a managed, registry-sourced extension to the specified pack's `axm-pack.json` manifest.

This is a manifest edit only — it SHALL NOT install or uninstall any extensions in the workspace.

The default version specifier SHALL be `*` (stay current). Authors SHALL specify constraints inline using the `@version` syntax (e.g., `@acme/tool@^1.0.0`).

#### Scenario: Add specific extension by name

- **WHEN** user runs `axm packs add frontend-tools @acme/code-review`
- **AND** `@acme/code-review` is a managed, registry-sourced skill installed in the workspace
- **THEN** `axm-pack.json` gains entry `skills: { "@acme/code-review": "*" }`

#### Scenario: Add extension with explicit version constraint

- **WHEN** user runs `axm packs add frontend-tools @acme/code-review@^1.0.0`
- **THEN** `axm-pack.json` gains entry `skills: { "@acme/code-review": "^1.0.0" }`

#### Scenario: Add extension with exact pin

- **WHEN** user runs `axm packs add frontend-tools @acme/code-review@1.2.3`
- **THEN** `axm-pack.json` gains entry `skills: { "@acme/code-review": "1.2.3" }`

#### Scenario: Add command extension

- **WHEN** user runs `axm packs add frontend-tools @acme/formatter`
- **AND** `@acme/formatter` is a managed, registry-sourced command
- **THEN** `axm-pack.json` gains entry `commands: { "@acme/formatter": "*" }`

#### Scenario: Add MCP server extension

- **WHEN** user runs `axm packs add frontend-tools @acme/db-browser`
- **AND** `@acme/db-browser` is a managed, registry-sourced MCP server
- **THEN** `axm-pack.json` gains entry `mcp-servers: { "@acme/db-browser": "*" }`

#### Scenario: Extension already in pack

- **WHEN** user runs `axm packs add frontend-tools @acme/code-review`
- **AND** `@acme/code-review` is already in the pack manifest
- **THEN** the command reports no-op (extension already present)
