## ADDED Requirements

### Requirement: Workspace provides getSkills query

The workspace service SHALL provide a `getSkills` method that delegates to the internal settings service and returns the skills map.

#### Scenario: Skills configured

- **WHEN** settings contains skills entries
- **THEN** `workspace.getSkills()` returns the skills map

#### Scenario: No skills configured

- **WHEN** settings does not contain a `skills` field
- **THEN** `workspace.getSkills()` returns an empty record

### Requirement: Workspace provides addSkill mutation

The workspace service SHALL provide an `addSkill` method that delegates to the internal settings service, serialized by the workspace's single semaphore.

#### Scenario: Add a new skill

- **WHEN** a handler invokes `workspace.addSkill("code-review", "@community/code-review@^1.0.0")`
- **THEN** the service adds the skill entry to settings and writes to disk

#### Scenario: Concurrent addSkill and addSource do not lose data

- **WHEN** two fibers concurrently call `workspace.addSkill()` and `workspace.addSource()`
- **THEN** both mutations are present in the final settings because the single workspace semaphore serializes all state mutations

### Requirement: Workspace provides removeSkill mutation

The workspace service SHALL provide a `removeSkill` method that delegates to the internal settings service, serialized by the workspace's single semaphore.

#### Scenario: Remove an existing skill

- **WHEN** a handler invokes `workspace.removeSkill("code-review")` and the skill exists
- **THEN** the service removes the skill entry and writes to disk

#### Scenario: Remove a non-existent skill

- **WHEN** a handler invokes `workspace.removeSkill("code-review")` and the skill does not exist
- **THEN** the service completes without error (no-op)

### Requirement: Workspace provides getAgents query

The workspace service SHALL provide a `getAgents` method that delegates to the internal settings service and returns the configured agent IDs.

#### Scenario: Agents configured

- **WHEN** settings contains `agents: ["claude-code", "cursor"]`
- **THEN** `workspace.getAgents()` returns `["claude-code", "cursor"]`

#### Scenario: No agents configured

- **WHEN** settings does not contain an `agents` field
- **THEN** `workspace.getAgents()` returns an empty array

### Requirement: Workspace provides addAgent mutation

The workspace service SHALL provide an `addAgent` method that delegates to the internal settings service, serialized by the workspace's single semaphore.

#### Scenario: Add a new agent

- **WHEN** a handler invokes `workspace.addAgent("cursor")`
- **THEN** the service appends the agent ID to the agents array and writes to disk

#### Scenario: Agent already present

- **WHEN** a handler invokes `workspace.addAgent("cursor")` and it is already in the agents array
- **THEN** the service completes without error (no-op)

#### Scenario: Invalid agent ID

- **WHEN** a handler invokes `workspace.addAgent("not-a-real-agent")` with an invalid agent ID
- **THEN** the service SHALL fail with a `SettingsParseError`
- **AND** no changes SHALL be written to disk

### Requirement: Workspace provides getLockEntries query

The workspace service SHALL provide a `getLockEntries` method that delegates to the internal lockfile service and returns the skills lock map.

#### Scenario: Lock entries present

- **WHEN** the lockfile contains skill entries
- **THEN** `workspace.getLockEntries()` returns the `SkillsLockMap` with all entries

#### Scenario: No lock entries present

- **WHEN** the lockfile contains no skill entries
- **THEN** `workspace.getLockEntries()` returns an empty record

### Requirement: Workspace provides getLockEntry query

The workspace service SHALL provide a `getLockEntry` method that delegates to the internal lockfile service and returns the lock entry for a specific skill.

#### Scenario: Skill exists in lockfile

- **WHEN** a handler invokes `workspace.getLockEntry("code-review")` and the skill exists
- **THEN** it returns `Option.some` containing the `SkillLockEntry`

#### Scenario: Skill not in lockfile

- **WHEN** a handler invokes `workspace.getLockEntry("code-review")` and the skill does not exist
- **THEN** it returns `Option.none()`

### Requirement: Workspace provides updateLockEntry mutation

The workspace service SHALL provide an `updateLockEntry` method that delegates to the internal lockfile service, serialized by the workspace's single semaphore.

#### Scenario: Add a new lock entry

- **WHEN** a handler invokes `workspace.updateLockEntry("code-review", entry)` and the skill does not exist in the lockfile
- **THEN** the service adds the entry, sets `updatedAt` to the current time, and writes to disk

#### Scenario: Update an existing lock entry

- **WHEN** a handler invokes `workspace.updateLockEntry("code-review", entry)` and the skill already exists
- **THEN** the service replaces the entry, sets `updatedAt` to the current time, and writes to disk

### Requirement: Workspace provides removeLockEntry mutation

The workspace service SHALL provide a `removeLockEntry` method that delegates to the internal lockfile service, serialized by the workspace's single semaphore.

#### Scenario: Remove an existing lock entry

- **WHEN** a handler invokes `workspace.removeLockEntry("code-review")` and the skill exists
- **THEN** the service removes the entry and writes to disk

#### Scenario: Remove a non-existent lock entry

- **WHEN** a handler invokes `workspace.removeLockEntry("code-review")` and the skill does not exist
- **THEN** the service completes without error (no-op)

### Requirement: Workspace serializes all state mutations with a single semaphore

The workspace service SHALL use a single `Semaphore(1)` to serialize ALL workspace state mutations across both files: `addSkill`, `removeSkill`, `addAgent`, `addSource` (settings), and `updateLockEntry`, `removeLockEntry` (lockfile). This replaces the previous pattern where settings service, lockfile service, and workspace each had independent semaphores.

#### Scenario: Cross-file serialization

- **WHEN** fibers concurrently invoke mutations that span different files (e.g., `addSkill` targeting settings and `updateLockEntry` targeting lockfile)
- **THEN** all mutations execute in sequence with no interleaving

#### Scenario: Same-file serialization

- **WHEN** fibers concurrently invoke `addSkill` and `addSource` (both targeting settings)
- **THEN** both mutations execute in sequence, preventing read-modify-write races on `settings.json`

#### Scenario: Queries do not block on semaphore

- **WHEN** a query method (`getSkills`, `getAgents`, `getScope`, `getSources`, `getLockEntries`, `getLockEntry`) is called while a mutation holds the semaphore
- **THEN** the query proceeds without waiting for the semaphore

### Requirement: Workspace documents state management responsibility

The workspace service SHALL include documentation comments indicating it is the sole public gateway for all settings and lockfile read/write operations and that it manages concurrency for all workspace state mutations via a single semaphore.

#### Scenario: Service documentation

- **WHEN** reading the workspace service source file
- **THEN** the module-level or interface-level doc comment SHALL indicate that workspace manages all settings and lockfile access and mutation serialization
