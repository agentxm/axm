## ADDED Requirements

### Requirement: Lockfile operation errors propagate

The handler SHALL let lockfile read and write errors propagate rather than silently swallowing them. Silent swallowing of lockfile errors leads to inconsistent workspace state.

#### Scenario: Corrupt lockfile produces error, not empty fallback

- **WHEN** the executor reads the lockfile and it exists but fails to parse (`LockfileParseError`)
- **THEN** the handler SHALL let the error propagate
- **AND** SHALL NOT substitute an empty lockfile

#### Scenario: Lockfile write failure during partial uninstall propagates

- **WHEN** the executor calls `updateLockEntry` during a partial uninstall and the write fails (`LockfileWriteError`)
- **THEN** the handler SHALL let the error propagate
- **AND** the step SHALL be reported as failed

#### Scenario: Lockfile write failure during full uninstall propagates

- **WHEN** the executor calls `removeLockEntry` during a full uninstall and the write fails (`LockfileWriteError`)
- **THEN** the handler SHALL let the error propagate
- **AND** the step SHALL be reported as failed

## MODIFIED Requirements

### Requirement: Graceful handling of missing files

The handler SHALL not fail if files or directories are already absent from disk. This applies to filesystem operations (symlink removal, canonical directory removal) only — not to lockfile operations.

#### Scenario: Canonical directory already missing

- **WHEN** the canonical directory does not exist on disk
- **THEN** the handler SHALL skip removal without error and continue

#### Scenario: Agent symlink already missing

- **WHEN** an agent symlink does not exist on disk
- **THEN** the handler SHALL skip removal without error and continue

#### Scenario: Missing lockfile treated as empty

- **WHEN** the executor reads the lockfile and the file does not exist (`LockfileNotFoundError`)
- **THEN** the handler SHALL treat it as an empty lockfile and continue
