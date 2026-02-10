## MODIFIED Requirements

### Requirement: Mutations are serialized with concurrency protection

The lockfile service mutations SHALL NOT manage their own concurrency. The workspace service owns the semaphore that serializes all workspace state mutations (settings and lockfile). Lockfile mutation methods (`updateEntry`, `removeEntry`) SHALL perform their read-modify-write logic without acquiring a semaphore, relying on the caller (workspace) to ensure serialization.

#### Scenario: Concurrent mutations

- **WHEN** multiple fibers invoke mutation methods (`updateEntry`, `removeEntry`) concurrently
- **THEN** each mutation completes in sequence because the workspace service's single semaphore serializes all workspace state mutations

### Requirement: Lockfile service is injectable via Effect layers

The lockfile service SHALL be provided internally by the workspace module's layer. It SHALL NOT be provided in the shared runtime layer or exported from the lockfile barrel file.

#### Scenario: Production layer

- **WHEN** the CLI runtime is composed
- **THEN** `LockfileService` is NOT included in the shared runtime layer
- **AND** `LockfileService` is provided internally within the workspace layer

#### Scenario: Test layer

- **WHEN** a test needs to control lockfile behavior
- **THEN** the test provides a mock `Workspace` via `Layer.succeed` which handles all lockfile operations
- **OR** the test imports `LockfileService` directly from the lockfile module file (not barrel) for unit-testing the internal implementation

### Requirement: Lockfile service is internal to workspace module

The lockfile service SHALL be documented as an internal implementation detail of the workspace module. It SHALL NOT be exported from the lockfile barrel file (`lockfile/index.ts`).

#### Scenario: Barrel file exports

- **WHEN** a consumer imports from the lockfile barrel (`@/lockfile` or `lockfile/index.ts`)
- **THEN** `LockfileService`, `LockfileServiceLive`, and `LockfileServiceInterface` SHALL NOT be available
- **AND** schemas, types, error classes, and I/O functions (`readLockfile`, `writeLockfile`, etc.) SHALL remain available

#### Scenario: Internal documentation

- **WHEN** reading the lockfile service source file
- **THEN** a doc comment SHALL indicate the service is internal to the workspace module and must not be accessed directly by command handlers
