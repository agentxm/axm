## ADDED Requirements

### Requirement: Lockfile service provides getSkills query

The system SHALL provide a `getSkills` method that reads the lockfile from disk and returns the skills lock map.

#### Scenario: Skills present

- **WHEN** the lockfile contains skill entries
- **THEN** `getSkills()` returns the `SkillsLockMap` with all entries

#### Scenario: No skills present

- **WHEN** the lockfile contains no skill entries
- **THEN** `getSkills()` returns an empty record

### Requirement: Lockfile service provides getEntry query

The system SHALL provide a `getEntry` method that reads the lockfile from disk and returns the lock entry for a specific skill.

#### Scenario: Skill exists in lockfile

- **WHEN** a caller invokes `getEntry("code-review")` and the skill exists in the lockfile
- **THEN** `getEntry()` returns `Option.some` containing the `SkillLockEntry`

#### Scenario: Skill not in lockfile

- **WHEN** a caller invokes `getEntry("code-review")` and the skill does not exist in the lockfile
- **THEN** `getEntry()` returns `Option.none()`

### Requirement: Lockfile service provides updateEntry mutation

The system SHALL provide an `updateEntry` method that adds or updates a skill lock entry, serialized by semaphore.

#### Scenario: Add a new skill entry

- **WHEN** a caller invokes `updateEntry("code-review", entry)` and the skill does not exist in the lockfile
- **THEN** the service adds the entry to the skills map, sets `updatedAt` to the current time, and writes to disk

#### Scenario: Update an existing skill entry

- **WHEN** a caller invokes `updateEntry("code-review", entry)` and the skill already exists in the lockfile
- **THEN** the service replaces the entry, sets `updatedAt` to the current time, and writes to disk

#### Scenario: Concurrent updateEntry calls do not lose data

- **WHEN** two fibers concurrently call `updateEntry()` with different skill names
- **THEN** both entries are present in the final lockfile because the semaphore serializes the read-modify-write cycles

### Requirement: Lockfile service provides removeEntry mutation

The system SHALL provide a `removeEntry` method that removes a skill lock entry, serialized by semaphore.

#### Scenario: Remove an existing entry

- **WHEN** a caller invokes `removeEntry("code-review")` and the skill exists in the lockfile
- **THEN** the service removes the entry and writes to disk

#### Scenario: Remove a non-existent entry

- **WHEN** a caller invokes `removeEntry("code-review")` and the skill does not exist in the lockfile
- **THEN** the service completes without error (no-op, no write)

### Requirement: Lockfile service auto-creates lockfile

The system SHALL create `axm-lock.yaml` with `{ lockfileVersion: 1, skills: {} }` if the file does not exist when any query or mutation method is called. File lifecycle is fully internal to the service.

#### Scenario: First access with no lockfile

- **WHEN** any service method is called and `axm-lock.yaml` does not exist
- **THEN** the service returns the empty lockfile state (version 1, empty skills) without error

#### Scenario: Subsequent access after auto-creation

- **WHEN** a method is called after auto-creation
- **THEN** the service reads the existing file normally

### Requirement: Mutations are serialized with concurrency protection

The system SHALL use an Effect `Semaphore` with 1 permit to serialize all mutation methods. Query methods do not acquire the semaphore.

#### Scenario: Concurrent mutations

- **WHEN** multiple fibers invoke mutation methods (`updateEntry`, `removeEntry`) concurrently
- **THEN** each mutation completes in sequence (no interleaving of read-modify-write cycles)

#### Scenario: Write failure releases semaphore

- **WHEN** a mutation fails during the filesystem write
- **THEN** the service fails with `LockfileWriteError` and the semaphore is released for subsequent operations

### Requirement: Lockfile service resolves paths from Workspace

The system SHALL obtain the lockfile path from the `Workspace` service, not from caller-provided arguments.

#### Scenario: Path resolution

- **WHEN** `LockfileService` is constructed
- **THEN** it reads `Workspace.path` to determine the directory containing `axm-lock.yaml`

### Requirement: Lockfile service is injectable via Effect layers

The system SHALL be provided as an Effect `Context.Tag` service with a layer constructor, enabling DI and test mocking.

#### Scenario: Production layer

- **WHEN** the CLI runtime is composed
- **THEN** `LockfileService` is provided via a layer that depends on `Workspace` and `FileSystem`

#### Scenario: Test layer

- **WHEN** a test needs to control lockfile behavior
- **THEN** the test provides a mock `LockfileService` via `Layer.succeed` without requiring filesystem access
