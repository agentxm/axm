## Purpose

The SettingsService provides an Effect-based interface for reading and writing workspace settings, with concurrency-safe mutations and automatic file lifecycle management.

## Requirements

### Requirement: Settings service provides getScope query

The system SHALL provide a `getScope` method that reads settings from disk and returns the effective scope.

#### Scenario: Scope configured

- **WHEN** settings contains `scope: "@acme"`
- **THEN** `getScope()` returns `"@acme"`

#### Scenario: Scope not configured

- **WHEN** settings does not contain a `scope` field
- **THEN** `getScope()` returns the default scope `"@community"`

### Requirement: Settings service provides getAgents query

The system SHALL provide a `getAgents` method that reads settings from disk and returns the configured agent IDs.

#### Scenario: Agents configured

- **WHEN** settings contains `agents: ["claude-code", "cursor"]`
- **THEN** `getAgents()` returns `["claude-code", "cursor"]`

#### Scenario: No agents configured

- **WHEN** settings does not contain an `agents` field
- **THEN** `getAgents()` returns an empty array

### Requirement: Settings service provides getSkills query

The system SHALL provide a `getSkills` method that reads settings from disk and returns the skills map.

#### Scenario: Skills configured

- **WHEN** settings contains skills entries
- **THEN** `getSkills()` returns the skills map

#### Scenario: No skills configured

- **WHEN** settings does not contain a `skills` field
- **THEN** `getSkills()` returns an empty record

### Requirement: Settings service provides addSkill mutation

The system SHALL provide an `addSkill` method that adds or updates a single skill entry, serialized by semaphore.

#### Scenario: Add a new skill

- **WHEN** a caller invokes `addSkill("code-review", "@community/code-review@^1.0.0")`
- **THEN** the service adds `"code-review": "@community/code-review@^1.0.0"` to the skills map (preserving existing skills) and writes to disk

#### Scenario: Update an existing skill

- **WHEN** a caller invokes `addSkill("code-review", "@community/code-review@^2.0.0")` and `"code-review"` already exists
- **THEN** the service updates the source to `"@community/code-review@^2.0.0"` and writes to disk

#### Scenario: Concurrent addSkill calls do not lose data

- **WHEN** two fibers concurrently call `addSkill()` with different skill names
- **THEN** both skills are present in the final settings because the semaphore serializes the read-modify-write cycles

### Requirement: Settings service provides removeSkill mutation

The system SHALL provide a `removeSkill` method that removes a skill entry, serialized by semaphore.

#### Scenario: Remove an existing skill

- **WHEN** a caller invokes `removeSkill("code-review")` and the skill exists
- **THEN** the service removes the skill entry and writes to disk

#### Scenario: Remove a non-existent skill

- **WHEN** a caller invokes `removeSkill("code-review")` and the skill does not exist
- **THEN** the service completes without error (no-op, no write)

### Requirement: Settings service provides addAgent mutation

The system SHALL provide an `addAgent` method that validates the agent ID against `AgentIdSchema` and appends it if not already present, serialized by semaphore.

#### Scenario: Add a new agent

- **WHEN** a caller invokes `addAgent("cursor")`
- **THEN** the service appends `"cursor"` to the agents array and writes to disk

#### Scenario: Agent already present

- **WHEN** a caller invokes `addAgent("cursor")` and `"cursor"` is already in the agents array
- **THEN** the service completes without error (no-op, no write)

#### Scenario: Invalid agent ID

- **WHEN** a caller invokes `addAgent("not-a-real-agent")` with a string that is not a valid `AgentId`
- **THEN** the service SHALL fail with a `SettingsParseError` indicating the agent ID is invalid
- **AND** no changes SHALL be written to disk

### Requirement: Settings service auto-creates settings file

The system SHALL create `settings.json` with `{}` if the file does not exist when any query or mutation method is called. File lifecycle is fully internal to the service.

#### Scenario: First access with no settings file

- **WHEN** any service method is called and `settings.json` does not exist
- **THEN** the service creates `settings.json` with `{}` and proceeds normally

#### Scenario: Subsequent access after auto-creation

- **WHEN** a method is called after auto-creation
- **THEN** the service reads the existing file normally

### Requirement: Mutations are serialized with concurrency protection

The settings service mutations SHALL NOT manage their own concurrency. The workspace service owns the semaphore that serializes all settings mutations. Settings service mutation methods (`addSkill`, `removeSkill`, `addAgent`) SHALL perform their read-modify-write logic without acquiring a semaphore, relying on the caller (workspace) to ensure serialization.

#### Scenario: Concurrent mutations

- **WHEN** multiple fibers invoke mutation methods (`addSkill`, `removeSkill`, `addAgent`) concurrently
- **THEN** each mutation completes in sequence because the workspace service's single semaphore serializes all workspace state mutations (settings and lockfile)

### Requirement: Settings service resolves paths from Workspace

The system SHALL obtain the settings file path from the `Workspace` service, not from caller-provided arguments.

#### Scenario: Path resolution

- **WHEN** `SettingsService` is constructed
- **THEN** it reads `Workspace.path` to determine the directory containing `settings.json`

### Requirement: Settings service is not provided in production layers

The settings service SHALL NOT be provided in the shared runtime layer or exported from the settings barrel file. Workspace uses settings I/O functions directly — there is no `SettingsService` instance in production.

#### Scenario: Production layer

- **WHEN** the CLI runtime is composed
- **THEN** `SettingsService` is NOT included in the shared runtime layer
- **AND** workspace calls settings I/O functions (`readSettings`, `writeSettings`, `modifyJsonFile`) directly

#### Scenario: Test layer

- **WHEN** a test needs to control settings behavior
- **THEN** the test provides a mock `Workspace` via `Layer.succeed` which handles all settings operations
- **OR** the test imports `SettingsService` directly from the settings module file (not barrel) for unit-testing the service in isolation

### Requirement: Settings service is not exported from barrel

The settings service SHALL NOT be exported from the settings barrel file (`settings/index.ts`). It is no longer used in production — workspace calls I/O functions directly.

#### Scenario: Barrel file exports

- **WHEN** a consumer imports from the settings barrel (`@/settings` or `settings/index.ts`)
- **THEN** `SettingsService`, `SettingsServiceLive`, and `SettingsServiceInterface` SHALL NOT be available
- **AND** schemas, types, error classes, and I/O functions (`readSettings`, `writeSettings`, `modifyJsonFile`, etc.) SHALL remain available

#### Scenario: Service documentation

- **WHEN** reading the settings service source file
- **THEN** a doc comment SHALL indicate the service is not used in production and workspace calls I/O functions directly
