# workspace-context-init Specification

## Purpose

WorkspaceContext initialization behavior - auto-creates workspace files and handles agent selection when workspace is missing.

## Requirements

### Requirement: WorkspaceContext Initialization Options

The WorkspaceContext factory SHALL accept initialization control options.

#### Scenario: Options interface

- **WHEN** creating WorkspaceContext via `make(options)`
- **THEN** options SHALL include `global: boolean`, `yes: boolean`, and `nonInteractive: boolean`

#### Scenario: Yes flag semantics

- **WHEN** `yes=true` during project initialization
- **THEN** all detected agents SHALL be selected without prompting

#### Scenario: Non-interactive flag semantics

- **WHEN** `nonInteractive=true` and user input would be required
- **THEN** initialization SHALL fail with a descriptive error

### Requirement: Global Workspace Auto-Initialization

The WorkspaceContext factory SHALL auto-initialize global workspaces with minimal defaults.

#### Scenario: Missing global settings

- **WHEN** `global=true` and `~/.axm/settings.json` does not exist
- **THEN** the factory SHALL create `~/.axm/settings.json` with empty object `{}`
- **AND** no agent selection prompt SHALL be shown

#### Scenario: Missing global lockfile

- **WHEN** `global=true` and `~/.axm/axm-lock.yaml` does not exist
- **THEN** the factory SHALL create `~/.axm/axm-lock.yaml` with `version: 1` and empty skills array

#### Scenario: Existing global workspace

- **WHEN** `global=true` and both files exist
- **THEN** the factory SHALL read existing files without modification

### Requirement: Project Workspace Initialization

The WorkspaceContext factory SHALL run full initialization for project workspaces when files are missing.

#### Scenario: Missing project settings triggers init

- **WHEN** `global=false` and `.axm/settings.json` does not exist
- **THEN** the factory SHALL run agent detection and selection flow

#### Scenario: Agent detection during project init

- **WHEN** project initialization runs
- **THEN** installed agents SHALL be detected using `detectAgents()`

#### Scenario: Interactive agent selection

- **WHEN** project initialization runs with `yes=false` and `nonInteractive=false`
- **THEN** the user SHALL be prompted to select from detected agents

#### Scenario: Auto-accept with yes flag

- **WHEN** project initialization runs with `yes=true`
- **THEN** all detected agents SHALL be selected without prompting

#### Scenario: Non-interactive failure

- **WHEN** project initialization runs with `nonInteractive=true` and no agents specified
- **THEN** initialization SHALL fail with error indicating interactive mode required

#### Scenario: Missing project lockfile

- **WHEN** `global=false` and `.axm/axm-lock.yaml` does not exist
- **THEN** the factory SHALL create empty lockfile after settings are created

### Requirement: InteractionContext Dependency

The WorkspaceContext factory SHALL use InteractionContext for prompts when available.

#### Scenario: Interactive mode requires InteractionContext

- **WHEN** initialization needs user prompts and `nonInteractive=false`
- **THEN** InteractionContext SHALL be yielded from the Effect context

#### Scenario: Non-interactive mode skips InteractionContext

- **WHEN** `nonInteractive=true` or `yes=true` or `global=true`
- **THEN** InteractionContext SHALL NOT be required as a dependency

### Requirement: Settings File Creation

The WorkspaceContext factory SHALL create properly formatted settings during initialization.

#### Scenario: Project settings structure

- **WHEN** project initialization completes
- **THEN** `.axm/settings.json` SHALL contain `agents` array with selected agent IDs

#### Scenario: Settings file is valid JSON

- **WHEN** settings file is created
- **THEN** it SHALL be valid JSON parseable by `JSON.parse()`
