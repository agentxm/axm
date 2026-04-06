## ADDED Requirements

### Requirement: Defense-in-depth retention check during uninstall execution

When an extension extension pack uninstall plan step executes an uninstall operation for a dependency extension (skill, command, or mcp-server), the operation SHALL perform a retention check as a safety net. If the extension is still required by another installed extension pack at execution time, the operation SHALL retain the extension on disk and in the lockfile, removing only the settings entry.

This is a defense-in-depth guard that catches the case where a user directly uninstalls an extension extension-pack-referenced extension (bypassing pack plan expansion). The primary orphan computation in the plan builder pre-filters targets so this guard is rarely triggered during extension pack uninstall flows.

#### Scenario: Retention guard prevents removal of still-referenced dependency

- **WHEN** pack `@acme/frontend-pack` is being uninstalled
- **AND** the plan includes an uninstall step for skill `code-review`
- **AND** at execution time, `code-review` is still referenced by another installed extension pack
- **THEN** the uninstall operation SHALL retain `code-review` on disk and in the lockfile
- **AND** only the settings entry SHALL be removed

#### Scenario: Retention guard allows removal of orphaned dependency

- **WHEN** pack `@acme/frontend-pack` is being uninstalled
- **AND** the plan includes an uninstall step for skill `code-review`
- **AND** at execution time, `code-review` is not referenced by any remaining installed extension pack
- **THEN** the uninstall operation SHALL fully remove `code-review` from disk, lockfile, and settings

### Requirement: Extension pack extension ref owner

Extension pack extension refs SHALL expose a canonical `owner` field. For registry packs, the owner SHALL be populated from the registry ref details. For builtin packs, the owner SHALL be populated from the builtin manifest. This owner is required for constructing pack extension targets used in uninstall operations.

#### Scenario: Registry extension pack ref exposes owner

- **WHEN** an extension pack ref is created for registry extension pack `@acme/packs/frontend-tools`
- **THEN** the ref SHALL have `owner: "@acme"`

#### Scenario: Builtin extension pack ref exposes owner

- **WHEN** an extension pack ref is created for builtin extension pack `effect`
- **THEN** the ref SHALL have an owner from the builtin manifest (e.g., `"@axm"`)

### Requirement: Pack uninstall cascades to command and MCP server dependencies

Pack uninstall SHALL compute orphaned dependencies across all supported extension types: skills, commands, and MCP servers. The orphan computation SHALL apply the same algorithm for each type:

1. Collect all extensions from the target extension pack's resolved maps
2. Exclude extensions referenced by any remaining extension extension pack's resolved maps
3. Exclude extensions that have a direct entry in project settings
4. Remaining extensions become uninstall plan steps

#### Scenario: Orphaned command dependency removed with pack

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack`
- **AND** the extension extension pack's `resolvedCommands` contains `@acme/commands/formatter`
- **AND** `formatter` has no direct settings entry and no other extension pack references it
- **THEN** the plan includes an uninstall step for command `formatter`

#### Scenario: Orphaned MCP server dependency removed with pack

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack`
- **AND** the extension extension pack's `resolvedMcpServers` contains `@acme/mcp-servers/db-connector`
- **AND** `db-connector` has no direct settings entry and no other extension pack references it
- **THEN** the plan includes an uninstall step for mcp-server `db-connector`
