## ADDED Requirements

### Requirement: Symlink lifecycle management

The `createSymlink` function SHALL handle the full lifecycle of creating a relative symlink from a link path to a target path, including edge case recovery.

#### Scenario: Create new symlink

- **WHEN** no file or symlink exists at the link path
- **THEN** a relative symlink SHALL be created pointing from the link path to the target path
- **AND** parent directories SHALL be created if they do not exist

#### Scenario: Existing correct symlink is a no-op

- **WHEN** a symlink already exists at the link path pointing to the correct target
- **THEN** no action SHALL be taken
- **AND** the function SHALL return success

#### Scenario: Existing wrong symlink is replaced

- **WHEN** a symlink exists at the link path pointing to a different target
- **THEN** the existing symlink SHALL be removed
- **AND** a new symlink SHALL be created pointing to the correct target

#### Scenario: Existing directory is replaced with symlink

- **WHEN** a directory (not a symlink) exists at the link path
- **THEN** the directory SHALL be removed
- **AND** a symlink SHALL be created in its place

#### Scenario: Circular symlink (ELOOP) recovery

- **WHEN** reading the existing symlink target fails with ELOOP
- **THEN** the broken symlink SHALL be force-removed
- **AND** symlink creation SHALL proceed

#### Scenario: Relative path computation uses resolved parents

- **WHEN** computing the relative path for the symlink
- **THEN** the parent directories of both link and target SHALL be resolved through symlinks via `resolveParentSymlinks`
- **AND** the relative path SHALL be computed from the resolved parent paths

#### Scenario: Self-reference detection

- **WHEN** the resolved link path and resolved target path refer to the same location
- **THEN** symlink creation SHALL be skipped
- **AND** the function SHALL return success

### Requirement: Symlink failure fallback

Symlink creation failures SHALL be recoverable — callers can fall back to copy mode.

#### Scenario: Failure returns typed error

- **WHEN** symlink creation fails for any reason other than self-reference
- **THEN** the function SHALL return a typed error
- **AND** the caller SHALL be able to catch the error and fall back to copy
