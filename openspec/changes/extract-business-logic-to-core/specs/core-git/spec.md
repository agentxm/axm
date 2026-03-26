## ADDED Requirements

### Requirement: Git operations available from core

The `@axm.sh/core/unstable/git` module SHALL export `shallowClone` and `getTreeSha` functions.

#### Scenario: shallowClone importable from core

- **WHEN** a consumer imports `shallowClone` from `@axm.sh/core/unstable/git`
- **THEN** it SHALL accept a clone URL, target directory, and optional branch/subpath
- **AND** return an Effect that performs a shallow git clone

#### Scenario: getTreeSha importable from core

- **WHEN** a consumer imports `getTreeSha` from `@axm.sh/core/unstable/git`
- **THEN** it SHALL accept a directory path and optional subpath
- **AND** return an Effect producing the git tree SHA for content-addressable identity

### Requirement: Git module has no CLI imports

The `@axm.sh/core/unstable/git` module SHALL only import from `effect/*` and `@axm.sh/core/unstable/*`.

#### Scenario: No CLI module imports

- **WHEN** inspecting all imports in the git module source files
- **THEN** no import paths SHALL reference `@axm.sh/cli` or relative paths outside core

### Requirement: Git operations use Effect platform services

Git operations SHALL use `@effect/platform-node` for child process spawning (via `Command` from `effect/CommandExecutor`). They SHALL NOT use `node:child_process` directly.

#### Scenario: shallowClone uses Effect command execution

- **WHEN** `shallowClone` executes a git clone
- **THEN** it SHALL use Effect's `Command` API for subprocess execution
- **AND** failures SHALL be mapped to `AppError` with descriptive error codes
