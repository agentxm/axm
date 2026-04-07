## ADDED Requirements

### Requirement: Transitive command visibility

Commands provided by installed packs SHALL appear as installed commands in user-visible command views. Commands explicitly listed in settings SHALL take precedence over pack-provided entries with the same name.

#### Scenario: Pack-provided command visible in installed commands

- **WHEN** pack `@acme/packs/frontend-pack` is installed with `resolvedCommands: { "@acme/commands/review": "1.0.0" }`
- **AND** `@acme/commands/review` has no direct entry in settings.json
- **THEN** installed commands SHALL include `@acme/commands/review`
- **AND** configured commands SHALL NOT include `@acme/commands/review`

#### Scenario: Direct entry takes precedence over transitive

- **WHEN** pack `@acme/packs/frontend-pack` provides `@acme/commands/review` transitively
- **AND** settings.json contains `"review": { "source": "@acme/commands/review", "enabled": false }`
- **THEN** installed commands SHALL use the direct entry with `enabled: false`

### Requirement: Direct entry promotion on disable for commands

When a user disables a command that only exists transitively (via a pack), the system SHALL create a direct settings.json entry with `enabled: false`.

#### Scenario: Disable transitive command creates direct entry

- **WHEN** `@acme/commands/review` is installed only via pack (no direct settings entry)
- **AND** user runs `axm commands disable @acme/commands/review`
- **THEN** settings.json SHALL gain entry `"review": { "source": "@acme/commands/review", "enabled": false }`

#### Scenario: Promoted command survives pack uninstall

- **WHEN** `@acme/commands/review` was promoted to direct (via disable)
- **AND** the pack that originally provided it is uninstalled
- **THEN** `@acme/commands/review` SHALL NOT be orphaned (direct entry exists)
- **AND** the command SHALL remain installed

### Requirement: Pack-resolved commands rendered to agents

When a pack is installed and its commands are resolved, each resolved command SHALL be rendered to all configured agents following the standard command rendering flow.

#### Scenario: Pack install triggers command rendering

- **WHEN** pack `@acme/packs/frontend-pack` is installed
- **AND** the pack resolves `@acme/commands/review` at version `1.0.0`
- **AND** the workspace has agents `["claude-code", "cursor"]`
- **THEN** `@acme/commands/review` SHALL be materialized and rendered to both agents' command directories

#### Scenario: Pack uninstall removes orphaned command rendered files

- **WHEN** pack `@acme/packs/frontend-pack` is uninstalled
- **AND** `@acme/commands/review` is orphaned (not in any other pack or direct settings)
- **THEN** the rendered command files SHALL be removed from all agent directories
