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

### Requirement: Settings service provides getSources query

The system SHALL provide a `getSources` method that returns the merged source configuration list (project, global, built-in).

#### Scenario: Sources from project settings

- **WHEN** project settings has `sources: [{ "name": "local", "source": "registry", "location": "/reg" }]`
- **THEN** `getSources()` returns the project source merged with global and built-in sources

#### Scenario: No sources configured

- **WHEN** no settings have a `sources` field
- **THEN** `getSources()` returns only built-in defaults (github, gitlab, bitbucket)

#### Scenario: Result cached for workspace lifetime

- **WHEN** `getSources()` is called multiple times
- **THEN** the three-layer merge is performed once and cached

### Requirement: Settings service provides getSourceByName query

The system SHALL provide a `getSourceByName` method that looks up a source by name from the merged list.

#### Scenario: Source found

- **WHEN** `getSourceByName("local")` is called and a source named `local` exists
- **THEN** it returns `Some(sourceConfig)`

#### Scenario: Source not found

- **WHEN** `getSourceByName("nonexistent")` is called
- **THEN** it returns `None`

### Requirement: Settings service provides getRegistrySources query

The system SHALL provide a `getRegistrySources` method that returns only registry-type sources, optionally filtered by scope.

#### Scenario: All registry sources

- **WHEN** `getRegistrySources(None)` is called
- **THEN** all sources with `source: "registry"` from the merged list are returned

#### Scenario: Scope-filtered registry sources

- **WHEN** `getRegistrySources(Some("@corp"))` is called
- **THEN** only registry sources whose `scopes` includes `@corp` are returned (or catch-all sources if no scope-matched sources exist)

#### Scenario: No registry sources

- **WHEN** no registry sources are configured
- **THEN** `getRegistrySources()` returns an empty list

### Requirement: Settings service provides addSource mutation

The system SHALL provide an `addSource` method for persisting new source configurations (used by the registry guard).

#### Scenario: Add registry source

- **WHEN** `addSource({ "name": "local", "source": "registry", "location": "/path" })` is called
- **THEN** the source is appended to the project settings `sources` array and written to disk

#### Scenario: Concurrent addSource calls serialized

- **WHEN** two fibers concurrently call `addSource`
- **THEN** both sources appear in the final settings (serialized by semaphore)

### Requirement: Settings schema evolves sources field

The settings schema SHALL evolve `sources` from a per-provider-key object to an array of discriminated `SourceConfig` entries.

#### Scenario: New schema format

- **WHEN** settings contains `"sources": [{ "name": "corp", "source": "registry", "location": "/reg", "scopes": ["@corp"] }]`
- **THEN** schema validation succeeds

#### Scenario: Old schema format rejected

- **WHEN** settings contains `"sources": { "registry": [{ "path": "/reg" }] }` (old format)
- **THEN** schema validation fails

### Requirement: Settings service auto-creates settings file

The system SHALL create `settings.json` with `{}` if the file does not exist when any query or mutation method is called. File lifecycle is fully internal to the service.

#### Scenario: First access with no settings file

- **WHEN** any service method is called and `settings.json` does not exist
- **THEN** the service creates `settings.json` with `{}` and proceeds normally

#### Scenario: Subsequent access after auto-creation

- **WHEN** a method is called after auto-creation
- **THEN** the service reads the existing file normally

### Requirement: Mutations are serialized with concurrency protection

The system SHALL use an Effect `Semaphore` with 1 permit to serialize all mutation methods. Query methods do not acquire the semaphore.

#### Scenario: Concurrent mutations

- **WHEN** multiple fibers invoke mutation methods (`addSkill`, `removeSkill`, `addAgent`) concurrently
- **THEN** each mutation completes in sequence (no interleaving of read-modify-write cycles)

#### Scenario: Write failure releases semaphore

- **WHEN** a mutation fails during the filesystem write
- **THEN** the service fails with `SettingsWriteError` and the semaphore is released for subsequent operations

### Requirement: Settings service resolves paths from Workspace

The system SHALL obtain the settings file path from the `Workspace` service, not from caller-provided arguments.

#### Scenario: Path resolution

- **WHEN** `SettingsService` is constructed
- **THEN** it reads `Workspace.path` to determine the directory containing `settings.json`

### Requirement: Settings service is injectable via Effect layers

The system SHALL be provided as an Effect `Context.Tag` service with a layer constructor, enabling DI and test mocking.

#### Scenario: Production layer

- **WHEN** the CLI runtime is composed
- **THEN** `SettingsService` is provided via a layer that depends on `Workspace` and `FileSystem`

#### Scenario: Test layer

- **WHEN** a test needs to control settings behavior
- **THEN** the test provides a mock `SettingsService` via `Layer.succeed` without requiring filesystem access
