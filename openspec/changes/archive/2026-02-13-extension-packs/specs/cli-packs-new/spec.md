## ADDED Requirements

### Requirement: Scaffold new pack

`axm packs new <name>` SHALL create a new empty pack with an `axm-pack.json` manifest in the managed extensions directory.

The pack name SHALL be scoped using the workspace's configured scope (from settings.json) unless overridden with `--namespace`.

#### Scenario: Create pack with workspace scope

- **WHEN** user runs `axm packs new frontend-tools`
- **AND** workspace scope is `@acme`
- **THEN** `axm-pack.json` is created at `.axm/extensions/@acme/packs/frontend-tools/axm-pack.json`
- **AND** manifest contains `name: "@acme/frontend-tools"`, `version: "0.0.1"`, empty `skills`, `commands`, `mcp-servers`

#### Scenario: Create pack with scope override

- **WHEN** user runs `axm packs new frontend-tools --namespace @corp`
- **THEN** `axm-pack.json` is created at `.axm/extensions/@corp/packs/frontend-tools/axm-pack.json`
- **AND** manifest contains `name: "@corp/frontend-tools"`

#### Scenario: No workspace scope and no override

- **WHEN** user runs `axm packs new frontend-tools`
- **AND** no scope is configured in settings.json
- **AND** `--namespace` is not provided
- **THEN** the command fails with an `AppError` indicating a scope is required

#### Scenario: Pack already exists

- **WHEN** user runs `axm packs new frontend-tools`
- **AND** `.axm/extensions/@acme/packs/frontend-tools/axm-pack.json` already exists
- **THEN** the command fails with an `AppError` indicating the pack already exists

### Requirement: New pack registered in settings

`axm packs new` SHALL add the new pack to the `packs` section of settings.json.

#### Scenario: Settings updated after pack creation

- **WHEN** a pack `@acme/frontend-tools` is successfully created
- **THEN** settings.json contains `"packs": { "frontend-tools": "@acme/frontend-tools" }`
