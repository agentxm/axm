## ADDED Requirements

### Requirement: Workspace provides getInstalledSkills query

The workspace service SHALL provide a `getInstalledSkills` method that delegates to the internal settings service and returns the skills map.

#### Scenario: Skills configured

- **WHEN** settings contains skills entries
- **THEN** `workspace.getInstalledSkills()` returns the skills map

#### Scenario: No skills configured

- **WHEN** settings does not contain a `skills` field
- **THEN** `workspace.getInstalledSkills()` returns an empty record

### Requirement: Workspace provides setInstalledSkill mutation

The workspace service SHALL provide a `setInstalledSkill` method that delegates to the internal settings service, serialized by the workspace's single semaphore. If the skill already exists, it is replaced.

#### Scenario: Set a new skill

- **WHEN** a handler invokes `workspace.setInstalledSkill("code-review", "@community/code-review@^1.0.0")` and the skill does not exist
- **THEN** the service adds the skill entry to settings and writes to disk

#### Scenario: Set an existing skill

- **WHEN** a handler invokes `workspace.setInstalledSkill("code-review", "@community/code-review@^2.0.0")` and the skill already exists
- **THEN** the service replaces the skill entry in settings and writes to disk

#### Scenario: Concurrent setInstalledSkill and addConfiguredSource do not lose data

- **WHEN** two fibers concurrently call `workspace.setInstalledSkill()` and `workspace.addConfiguredSource()`
- **THEN** both mutations are present in the final settings because the single workspace semaphore serializes all state mutations

### Requirement: Workspace provides removeInstalledSkill mutation

The workspace service SHALL provide a `removeInstalledSkill` method that delegates to the internal settings service, serialized by the workspace's single semaphore.

#### Scenario: Remove an existing skill

- **WHEN** a handler invokes `workspace.removeInstalledSkill("code-review")` and the skill exists
- **THEN** the service removes the skill entry and writes to disk

#### Scenario: Remove a non-existent skill

- **WHEN** a handler invokes `workspace.removeInstalledSkill("code-review")` and the skill does not exist
- **THEN** the service completes without error (no-op)

### Requirement: Workspace provides getConfiguredAgents query

The workspace service SHALL provide a `getConfiguredAgents` method that delegates to the internal settings service and returns the configured agent IDs.

#### Scenario: Agents configured

- **WHEN** settings contains `agents: ["claude-code", "cursor"]`
- **THEN** `workspace.getConfiguredAgents()` returns `["claude-code", "cursor"]`

#### Scenario: No agents configured

- **WHEN** settings does not contain an `agents` field
- **THEN** `workspace.getConfiguredAgents()` returns an empty array

### Requirement: Workspace provides addConfiguredAgent mutation

The workspace service SHALL provide an `addConfiguredAgent` method that delegates to the internal settings service, serialized by the workspace's single semaphore.

#### Scenario: Add a new agent

- **WHEN** a handler invokes `workspace.addConfiguredAgent("cursor")`
- **THEN** the service appends the agent ID to the agents array and writes to disk

#### Scenario: Agent already present

- **WHEN** a handler invokes `workspace.addConfiguredAgent("cursor")` and it is already in the agents array
- **THEN** the service completes without error (no-op)

#### Scenario: Invalid agent ID

- **WHEN** a handler invokes `workspace.addConfiguredAgent("not-a-real-agent")` with an invalid agent ID
- **THEN** the service SHALL fail with a `SettingsParseError`
- **AND** no changes SHALL be written to disk

### Requirement: Workspace provides getLockedSkills query

The workspace service SHALL provide a `getLockedSkills` method that delegates to the internal lockfile service and returns the skills lock map.

#### Scenario: Lock entries present

- **WHEN** the lockfile contains skill entries
- **THEN** `workspace.getLockedSkills()` returns the `SkillsLockMap` with all entries

#### Scenario: No lock entries present

- **WHEN** the lockfile contains no skill entries
- **THEN** `workspace.getLockedSkills()` returns an empty record

### Requirement: Workspace provides getLockedSkill query

The workspace service SHALL provide a `getLockedSkill` method that delegates to the internal lockfile service and returns the lock entry for a specific skill.

#### Scenario: Skill exists in lockfile

- **WHEN** a handler invokes `workspace.getLockedSkill("code-review")` and the skill exists
- **THEN** it returns `Option.some` containing the `SkillLockEntry`

#### Scenario: Skill not in lockfile

- **WHEN** a handler invokes `workspace.getLockedSkill("code-review")` and the skill does not exist
- **THEN** it returns `Option.none()`

### Requirement: Workspace provides setLockedSkill mutation

The workspace service SHALL provide a `setLockedSkill` method that delegates to the internal lockfile service, serialized by the workspace's single semaphore. If the lock entry already exists, it is replaced.

#### Scenario: Set a new lock entry

- **WHEN** a handler invokes `workspace.setLockedSkill("code-review", entry)` and the skill does not exist in the lockfile
- **THEN** the service adds the entry, sets `updatedAt` to the current time, and writes to disk

#### Scenario: Set an existing lock entry

- **WHEN** a handler invokes `workspace.setLockedSkill("code-review", entry)` and the skill already exists
- **THEN** the service replaces the entry, sets `updatedAt` to the current time, and writes to disk

### Requirement: Workspace provides removeLockedSkill mutation

The workspace service SHALL provide a `removeLockedSkill` method that delegates to the internal lockfile service, serialized by the workspace's single semaphore.

#### Scenario: Remove an existing lock entry

- **WHEN** a handler invokes `workspace.removeLockedSkill("code-review")` and the skill exists
- **THEN** the service removes the entry and writes to disk

#### Scenario: Remove a non-existent lock entry

- **WHEN** a handler invokes `workspace.removeLockedSkill("code-review")` and the skill does not exist
- **THEN** the service completes without error (no-op)

### Requirement: Workspace serializes all state mutations with a single semaphore

The workspace service SHALL use a single `Semaphore(1)` to serialize ALL workspace state mutations across both files: `setInstalledSkill`, `removeInstalledSkill`, `addConfiguredAgent`, `addConfiguredSource` (settings), and `setLockedSkill`, `removeLockedSkill` (lockfile). This replaces the previous pattern where settings service, lockfile service, and workspace each had independent semaphores.

#### Scenario: Install operation spans both files atomically

- **WHEN** an install handler invokes `workspace.setInstalledSkill("code-review", "@community/code-review@^1.0.0")` followed by `workspace.setLockedSkill("code-review", entry)` within the same operation
- **AND** another fiber concurrently invokes a mutation (e.g., `workspace.setInstalledSkill()` or `workspace.removeLockedSkill()`)
- **THEN** the entire install sequence (settings write + lockfile write) completes before the concurrent mutation begins, because the workspace semaphore serializes at the operation level

#### Scenario: Cross-file serialization

- **WHEN** fibers concurrently invoke mutations that span different files (e.g., `setInstalledSkill` targeting settings and `setLockedSkill` targeting lockfile)
- **THEN** all mutations execute in sequence with no interleaving

#### Scenario: Same-file serialization

- **WHEN** fibers concurrently invoke `setInstalledSkill` and `addConfiguredSource` (both targeting settings)
- **THEN** both mutations execute in sequence, preventing read-modify-write races on `settings.json`

#### Scenario: Queries do not block on semaphore

- **WHEN** a query method (`getInstalledSkills`, `getConfiguredAgents`, `getConfiguredScope`, `getConfiguredSources`, `getLockedSkills`, `getLockedSkill`) is called while a mutation holds the semaphore
- **THEN** the query proceeds without waiting for the semaphore

### Requirement: Mutation failure releases the semaphore

The workspace semaphore SHALL be released when a mutation fails, ensuring subsequent operations are not permanently blocked. This is guaranteed by Effect's `withPermits` bracket semantics — no special error handling is required.

#### Scenario: Write failure releases semaphore

- **WHEN** a mutation (e.g., `setInstalledSkill`, `setLockedSkill`) fails during the filesystem write
- **THEN** the workspace semaphore is released and subsequent mutations can proceed

### Requirement: Workspace documents state management responsibility

The workspace service SHALL include documentation comments indicating it is the sole public gateway for all settings and lockfile read/write operations and that it manages concurrency for all workspace state mutations via a single semaphore.

#### Scenario: Service documentation

- **WHEN** reading the workspace service source file
- **THEN** the module-level or interface-level doc comment SHALL indicate that workspace manages all settings and lockfile access and mutation serialization
