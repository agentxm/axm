## ADDED Requirements

### Requirement: Transitive subagent visibility

Subagents provided by installed packs SHALL appear as installed subagents in user-visible subagent views. Subagents explicitly listed in settings SHALL take precedence over pack-provided entries with the same name.

#### Scenario: Pack-provided subagent visible in installed subagents

- **WHEN** pack `@acme/packs/frontend-pack` is installed with `resolvedSubagents: { "@acme/subagents/code-reviewer": "1.0.0" }`
- **AND** `@acme/subagents/code-reviewer` has no direct entry in settings.json
- **THEN** installed subagents SHALL include `@acme/subagents/code-reviewer`
- **AND** configured subagents SHALL NOT include `@acme/subagents/code-reviewer`

#### Scenario: Direct entry takes precedence over transitive

- **WHEN** pack `@acme/packs/frontend-pack` provides `@acme/subagents/code-reviewer` transitively
- **AND** settings.json contains `"code-reviewer": { "source": "@acme/subagents/code-reviewer", "enabled": false }`
- **THEN** installed subagents SHALL use the direct entry with `enabled: false`

### Requirement: Direct entry promotion on disable for subagents

When a user disables a subagent that only exists transitively (via a pack), the system SHALL create a direct settings.json entry with `enabled: false`.

#### Scenario: Disable transitive subagent creates direct entry

- **WHEN** `@acme/subagents/code-reviewer` is installed only via pack (no direct settings entry)
- **AND** user runs `axm subagents disable code-reviewer`
- **THEN** settings.json SHALL gain entry `"code-reviewer": { "source": "@acme/subagents/code-reviewer", "enabled": false }`

#### Scenario: Promoted subagent survives pack uninstall

- **WHEN** `@acme/subagents/code-reviewer` was promoted to direct (via disable)
- **AND** the pack that originally provided it is uninstalled
- **THEN** `@acme/subagents/code-reviewer` SHALL NOT be orphaned (direct entry exists)

### Requirement: Pack-resolved subagents rendered to agents

When a pack is installed and its subagents are resolved, each resolved subagent SHALL be rendered to all configured agents following the standard subagent rendering flow.

#### Scenario: Pack install triggers subagent rendering

- **WHEN** pack `@acme/packs/frontend-pack` is installed
- **AND** the pack resolves `@acme/subagents/code-reviewer` at version `1.0.0`
- **AND** the workspace has agents `["claude-code", "cursor"]`
- **THEN** `@acme/subagents/code-reviewer` SHALL be materialized and rendered to both agents' subagent directories

#### Scenario: Pack uninstall removes orphaned subagent rendered files

- **WHEN** pack `@acme/packs/frontend-pack` is uninstalled
- **AND** `@acme/subagents/code-reviewer` is orphaned (not in any other pack or direct settings)
- **THEN** the rendered subagent files SHALL be removed from all agent directories

### Requirement: Pack manifest includes subagents field

The pack manifest schema SHALL include an optional `subagents` field alongside `skills`, `commands`, and `mcp-servers`.

#### Scenario: Pack with subagents field

- **WHEN** `extension-pack.json` contains `subagents: { "@acme/subagents/code-reviewer": "^1.0.0" }`
- **THEN** pack validation SHALL succeed
- **AND** pack resolution SHALL include the subagent in the resolved set
