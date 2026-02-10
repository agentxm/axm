## MODIFIED Requirements

### Requirement: Mutations are serialized with concurrency protection

The lockfile service mutations SHALL NOT manage their own concurrency. The workspace service owns the semaphore that serializes all workspace state mutations (settings and lockfile). Lockfile mutation methods (`updateEntry`, `removeEntry`) SHALL perform their read-modify-write logic without acquiring a semaphore, relying on the caller (workspace) to ensure serialization.

#### Scenario: Concurrent mutations

- **WHEN** multiple fibers invoke mutation methods (`updateEntry`, `removeEntry`) concurrently
- **THEN** each mutation completes in sequence because the workspace service's single semaphore serializes all workspace state mutations

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
