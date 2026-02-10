## Requirements

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

The lockfile service mutations SHALL NOT manage their own concurrency. The workspace service owns the semaphore that serializes all workspace state mutations (settings and lockfile). Lockfile mutation methods (`updateEntry`, `removeEntry`) SHALL perform their read-modify-write logic without acquiring a semaphore, relying on the caller (workspace) to ensure serialization.

#### Scenario: Concurrent mutations

- **WHEN** multiple fibers invoke mutation methods (`updateEntry`, `removeEntry`) concurrently
- **THEN** each mutation completes in sequence because the workspace service's single semaphore serializes all workspace state mutations

### Requirement: Lockfile service resolves paths from Workspace

The system SHALL obtain the lockfile path from the `Workspace` service, not from caller-provided arguments.

#### Scenario: Path resolution

- **WHEN** `LockfileService` is constructed
- **THEN** it reads `Workspace.path` to determine the directory containing `axm-lock.yaml`

### Requirement: Lockfile service is not provided in production layers

The lockfile service SHALL NOT be provided in the shared runtime layer or exported from the lockfile barrel file. Workspace uses lockfile I/O functions directly — there is no `LockfileService` instance in production.

#### Scenario: Production layer

- **WHEN** the CLI runtime is composed
- **THEN** `LockfileService` is NOT included in the shared runtime layer
- **AND** workspace calls lockfile I/O functions (`readLockfile`, `writeLockfile`) directly

#### Scenario: Test layer

- **WHEN** a test needs to control lockfile behavior
- **THEN** the test provides a mock `Workspace` via `Layer.succeed` which handles all lockfile operations
- **OR** the test imports `LockfileService` directly from the lockfile module file (not barrel) for unit-testing the service in isolation

### Requirement: Lockfile service is not exported from barrel

The lockfile service SHALL NOT be exported from the lockfile barrel file (`lockfile/index.ts`). It is no longer used in production — workspace calls I/O functions directly.

#### Scenario: Barrel file exports

- **WHEN** a consumer imports from the lockfile barrel (`@/lockfile` or `lockfile/index.ts`)
- **THEN** `LockfileService`, `LockfileServiceLive`, and `LockfileServiceInterface` SHALL NOT be available
- **AND** schemas, types, error classes, and I/O functions (`readLockfile`, `writeLockfile`, etc.) SHALL remain available

#### Scenario: Service documentation

- **WHEN** reading the lockfile service source file
- **THEN** a doc comment SHALL indicate the service is not used in production and workspace calls I/O functions directly
