## MODIFIED Requirements

### Requirement: Settings service provides addSkill mutation

The system SHALL provide an `addSkill` method that adds or updates a single skill entry, serialized by semaphore. The mutation SHALL use format-preserving JSON edits targeting the `["skills", name]` path, preserving all existing file formatting outside the edit region.

#### Scenario: Add a new skill

- **WHEN** a caller invokes `addSkill("code-review", "@community/code-review@^1.0.0")`
- **THEN** the service adds `"code-review": "@community/code-review@^1.0.0"` to the skills map and writes to disk
- **AND** existing file formatting outside the edit region is preserved

#### Scenario: Update an existing skill

- **WHEN** a caller invokes `addSkill("code-review", "@community/code-review@^2.0.0")` and `"code-review"` already exists
- **THEN** the service updates the source to `"@community/code-review@^2.0.0"` and writes to disk
- **AND** existing file formatting outside the edit region is preserved

#### Scenario: Concurrent addSkill calls do not lose data

- **WHEN** two fibers concurrently call `addSkill()` with different skill names
- **THEN** both skills are present in the final settings because the semaphore serializes the read-modify-write cycles

### Requirement: Settings service provides removeSkill mutation

The system SHALL provide a `removeSkill` method that removes a skill entry, serialized by semaphore. The mutation SHALL use format-preserving JSON edits targeting the `["skills", name]` path.

#### Scenario: Remove an existing skill

- **WHEN** a caller invokes `removeSkill("code-review")` and the skill exists
- **THEN** the service removes the skill entry and writes to disk
- **AND** existing file formatting outside the edit region is preserved

#### Scenario: Remove a non-existent skill

- **WHEN** a caller invokes `removeSkill("code-review")` and the skill does not exist
- **THEN** the service completes without error (no-op, no write)

### Requirement: Settings service provides addAgent mutation

The system SHALL provide an `addAgent` method that validates the agent ID against `AgentIdSchema` and appends it if not already present, serialized by semaphore. The mutation SHALL use format-preserving JSON edits targeting the `["agents"]` path.

#### Scenario: Add a new agent

- **WHEN** a caller invokes `addAgent("cursor")`
- **THEN** the service appends `"cursor"` to the agents array and writes to disk
- **AND** existing file formatting outside the agents array is preserved

#### Scenario: Agent already present

- **WHEN** a caller invokes `addAgent("cursor")` and `"cursor"` is already in the agents array
- **THEN** the service completes without error (no-op, no write)

#### Scenario: Invalid agent ID

- **WHEN** a caller invokes `addAgent("not-a-real-agent")` with a string that is not a valid `AgentId`
- **THEN** the service SHALL fail with a `SettingsParseError` indicating the agent ID is invalid
- **AND** no changes SHALL be written to disk

### Requirement: Settings service auto-creates settings file

The system SHALL create `settings.json` with `{}\n` (empty object with trailing newline) if the file does not exist when any query or mutation method is called. File lifecycle is fully internal to the service.

#### Scenario: First access with no settings file

- **WHEN** any service method is called and `settings.json` does not exist
- **THEN** the service creates `settings.json` with `{}\n` and proceeds normally

#### Scenario: Subsequent access after auto-creation

- **WHEN** a method is called after auto-creation
- **THEN** the service reads the existing file normally
