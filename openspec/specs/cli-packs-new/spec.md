# cli-packs-new Specification

## Purpose

The `axm packs new` command scaffolds a new empty pack with a manifest and registers it in workspace settings.

## Requirements

### Requirement: Scaffold new pack

`axm packs new <name>` SHALL create a new empty pack with a `pack.json` manifest in the managed extensions directory.

The pack name SHALL resolve its owner from the workspace's configured profile (from settings.json) unless overridden with `--profile`.

#### Scenario: Create pack with workspace profile

- **WHEN** user runs `axm packs new frontend-tools`
- **AND** workspace profile is `@acme`
- **THEN** `pack.json` is created at `.axm/extensions/@acme/packs/frontend-tools/pack.json`
- **AND** manifest contains `owner: "@acme"`, `name: "frontend-tools"`, `version: "0.0.1"`, and empty `skills`, `commands`, `mcp-servers`

#### Scenario: Create pack with profile override

- **WHEN** user runs `axm packs new frontend-tools --profile @corp`
- **THEN** `pack.json` is created at `.axm/extensions/@corp/packs/frontend-tools/pack.json`
- **AND** manifest contains `owner: "@corp"` and `name: "frontend-tools"`

#### Scenario: No workspace profile and no override

- **WHEN** user runs `axm packs new frontend-tools`
- **AND** no profile is configured in settings.json
- **AND** `--profile` is not provided
- **THEN** the command fails with an `AppError` indicating a profile is required

#### Scenario: Pack already exists

- **WHEN** user runs `axm packs new frontend-tools`
- **AND** `.axm/extensions/@acme/packs/frontend-tools/pack.json` already exists
- **THEN** the command fails with a `AppError` indicating the pack already exists

### Requirement: New pack registered in settings

`axm packs new` SHALL add the new pack to the `packs` section of settings.json.

#### Scenario: Settings updated after pack creation

- **WHEN** a pack `@acme/frontend-tools` is successfully created
- **THEN** settings.json contains `"packs": { "frontend-tools": "@acme/frontend-tools" }`

### Requirement: Packs new handler uses plan execution

The `axm packs new` handler SHALL model pack scaffolding mutations as an operation plan and execute them through `ws.resolvePlan()`.

#### Scenario: Build and resolve create-pack plan

- **WHEN** the user runs `axm packs new <name>` with valid input
- **THEN** the handler SHALL build a single-step plan for pack scaffolding
- **AND** the handler SHALL execute that plan via `ws.resolvePlan()`
- **AND** the handler SHALL NOT perform direct mutation writes outside operation handlers

#### Scenario: Apply mode executes operation side-effects

- **WHEN** the user runs `axm packs new <name>` without preview and confirms apply (or passes `--yes`)
- **THEN** the operation handler SHALL create the pack directory and manifest
- **AND** the operation handler SHALL update workspace settings/lockfile metadata for the new pack

### Requirement: Packs new supports preview mode

The `axm packs new` command SHALL accept `--preview` and route it through workspace plan resolution.

#### Scenario: Preview mode for packs new

- **WHEN** the user runs `axm packs new <name> --preview`
- **THEN** the CLI SHALL display planned pack scaffolding actions
- **AND** no files, settings, or lockfile entries SHALL be modified
