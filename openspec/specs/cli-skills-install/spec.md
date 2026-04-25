## ADDED Requirements

### Requirement: Rendered-file tracking for copy-mode installs

When a skill is installed in copy mode (symlink fallback), the lockfile entry SHALL include `renderedFiles` and `sourceHash` fields. `renderedFiles` SHALL be a map keyed by agent ID, where each value is an array of `{ path }` objects tracking copied file locations. `sourceHash` SHALL be a hash of the canonical skill source.

When installed via symlink, `renderedFiles` and `sourceHash` SHALL be omitted from the lockfile entry.

#### Scenario: Copy-mode install tracks rendered files

- **WHEN** a skill is installed and symlinks are not supported
- **AND** the skill falls back to copy mode
- **THEN** the lockfile entry SHALL include `renderedFiles` with an entry per agent containing the copied path
- **AND** SHALL include `sourceHash` with the hash of the canonical source

#### Scenario: Symlink install omits rendered-file tracking

- **WHEN** a skill is installed via symlink (default)
- **THEN** the lockfile entry SHALL NOT include `renderedFiles` or `sourceHash`

#### Scenario: Copy-mode uninstall uses tracked paths

- **WHEN** a copy-mode skill is uninstalled
- **THEN** the uninstall SHALL use `renderedFiles` paths from the lockfile for reliable deletion

#### Scenario: Copy-mode disable uses tracked paths

- **WHEN** a copy-mode skill is disabled
- **THEN** the disable SHALL use `renderedFiles` paths from the lockfile for reliable deletion
