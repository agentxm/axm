> **Note**: The current `workspace-plan` spec covers generic plan types and apply/display behavior only — it does not specify the `WorkspaceContextService` interface. The methods referenced below as MODIFIED (`getSources`, `getScope`, `addSource`) exist in the implementation but are not yet spec'd. This change both renames them and introduces them into the spec for the first time.

## MODIFIED Requirements

### Requirement: Workspace provides source queries

Existing source query methods SHALL be renamed to follow the `getConfigured*` naming convention: `getSources` → `getConfiguredSources`, `getSourceByName` → `getConfiguredSourceByName`, `getRegistrySources` → `getConfiguredRegistrySources`. Behavior is unchanged.

### Requirement: Workspace provides scope query

The existing `getScope` method SHALL be renamed to `getConfiguredScope`. Behavior is unchanged.

#### Scenario: Scope configured in project settings

- **WHEN** project settings contains `scope: "@acme"`
- **THEN** `workspace.getConfiguredScope()` returns `"@acme"`

#### Scenario: Scope configured in global settings only

- **WHEN** project settings does not contain a `scope` field but global settings contains `scope: "@corp"`
- **THEN** `workspace.getConfiguredScope()` returns `"@corp"`

#### Scenario: Scope not configured

- **WHEN** neither project nor global settings contain a `scope` field
- **THEN** `workspace.getConfiguredScope()` returns the default scope `"@community"`

### Requirement: Workspace provides addSource mutation

The existing `addSource` method SHALL be renamed to `addConfiguredSource` and serialized by the workspace's single semaphore (replacing its previous independent semaphore). Behavior is otherwise unchanged.

## ADDED Requirements

### Requirement: Workspace provides getInstalledSkills query

The workspace service SHALL provide a `getInstalledSkills` method that reads settings from disk and returns the skills map.

#### Scenario: Skills configured

- **WHEN** settings contains skills entries
- **THEN** `workspace.getInstalledSkills()` returns the skills map

#### Scenario: No skills configured

- **WHEN** settings does not contain a `skills` field
- **THEN** `workspace.getInstalledSkills()` returns an empty record

### Requirement: Workspace provides setSkill compound mutation

The workspace service SHALL provide a `setSkill` method that atomically writes to both settings and lockfile under a single semaphore acquisition. This is the only public method for writing skill state — there are no individual `setInstalledSkill` or `setLockedSkill` public methods. If the skill already exists, both entries are replaced.

#### Scenario: Install a new skill

- **WHEN** a handler invokes `workspace.setSkill("code-review", "@community/code-review@^1.0.0", lockEntry)` and the skill does not exist
- **THEN** the service adds the skill entry to settings, adds the lock entry to the lockfile (setting `updatedAt` to the current time), and writes both files to disk under a single semaphore acquisition

#### Scenario: Update an existing skill

- **WHEN** a handler invokes `workspace.setSkill("code-review", "@community/code-review@^2.0.0", lockEntry)` and the skill already exists
- **THEN** the service replaces the skill entry in settings, replaces the lock entry in the lockfile (setting `updatedAt` to the current time), and writes both files to disk under a single semaphore acquisition

#### Scenario: Concurrent setSkill and addConfiguredSource do not lose data

- **WHEN** two fibers concurrently call `workspace.setSkill()` and `workspace.addConfiguredSource()`
- **THEN** both mutations are present in the final state because the single workspace semaphore serializes all state mutations

### Requirement: Workspace provides removeSkill compound mutation

The workspace service SHALL provide a `removeSkill` method that atomically removes from both settings and lockfile under a single semaphore acquisition. This is the only public method for removing skill state — there are no individual `removeInstalledSkill` or `removeLockedSkill` public methods.

#### Scenario: Remove an existing skill

- **WHEN** a handler invokes `workspace.removeSkill("code-review")` and the skill exists
- **THEN** the service removes the skill entry from settings, removes the lock entry from the lockfile, and writes both files to disk under a single semaphore acquisition

#### Scenario: Remove a non-existent skill

- **WHEN** a handler invokes `workspace.removeSkill("code-review")` and the skill does not exist in either file
- **THEN** the service completes without error (no-op)

### Requirement: Workspace provides getConfiguredAgents query

The workspace service SHALL provide a `getConfiguredAgents` method that reads settings from disk and returns the configured agent IDs.

#### Scenario: Agents configured

- **WHEN** settings contains `agents: ["claude-code", "cursor"]`
- **THEN** `workspace.getConfiguredAgents()` returns `["claude-code", "cursor"]`

#### Scenario: No agents configured

- **WHEN** settings does not contain an `agents` field
- **THEN** `workspace.getConfiguredAgents()` returns an empty array

### Requirement: Workspace provides addConfiguredAgent mutation

The workspace service SHALL provide an `addConfiguredAgent` method that writes to settings on disk, serialized by the workspace's single semaphore.

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

The workspace service SHALL provide a `getLockedSkills` method that reads the lockfile from disk and returns the skills lock map.

#### Scenario: Lock entries present

- **WHEN** the lockfile contains skill entries
- **THEN** `workspace.getLockedSkills()` returns the `SkillsLockMap` with all entries

#### Scenario: No lock entries present

- **WHEN** the lockfile contains no skill entries
- **THEN** `workspace.getLockedSkills()` returns an empty record

### Requirement: Workspace provides getLockedSkill query

The workspace service SHALL provide a `getLockedSkill` method that reads the lockfile from disk and returns the lock entry for a specific skill.

#### Scenario: Skill exists in lockfile

- **WHEN** a handler invokes `workspace.getLockedSkill("code-review")` and the skill exists
- **THEN** it returns `Option.some` containing the `SkillLockEntry`

#### Scenario: Skill not in lockfile

- **WHEN** a handler invokes `workspace.getLockedSkill("code-review")` and the skill does not exist
- **THEN** it returns `Option.none()`

### Requirement: Workspace serializes all state mutations with a single semaphore

The workspace service SHALL use a single `Semaphore(1)` to serialize ALL workspace state mutations: `setSkill`, `removeSkill` (compound, both files), `addConfiguredAgent`, `addConfiguredSource` (settings only). This replaces the previous pattern where settings service, lockfile service, and workspace each had independent semaphores.

#### Scenario: Concurrent install and source add do not interleave

- **WHEN** fibers concurrently invoke `workspace.setSkill()` and `workspace.addConfiguredSource()`
- **THEN** all mutations execute in sequence with no interleaving across files

#### Scenario: Same-file serialization

- **WHEN** fibers concurrently invoke `setSkill` and `addConfiguredSource` (both targeting settings)
- **THEN** both mutations execute in sequence, preventing read-modify-write races on `settings.json`

#### Scenario: Queries do not block on semaphore

- **WHEN** a query method (`getInstalledSkills`, `getConfiguredAgents`, `getConfiguredScope`, `getConfiguredSources`, `getLockedSkills`, `getLockedSkill`) is called while a mutation holds the semaphore
- **THEN** the query proceeds without waiting for the semaphore

### Requirement: Mutation failure releases the semaphore

The workspace semaphore SHALL be released when a mutation fails, ensuring subsequent operations are not permanently blocked. This is guaranteed by Effect's `withPermits` bracket semantics — no special error handling is required.

#### Scenario: Write failure releases semaphore

- **WHEN** a mutation (e.g., `setSkill`, `addConfiguredSource`) fails during the filesystem write
- **THEN** the workspace semaphore is released and subsequent mutations can proceed

### Requirement: Workspace documents state management responsibility

The workspace service SHALL include documentation comments indicating it is the sole public gateway for all settings and lockfile read/write operations and that it manages concurrency for all workspace state mutations via a single semaphore.

#### Scenario: Service documentation

- **WHEN** reading the workspace service source file
- **THEN** the module-level or interface-level doc comment SHALL indicate that workspace manages all settings and lockfile access and mutation serialization
