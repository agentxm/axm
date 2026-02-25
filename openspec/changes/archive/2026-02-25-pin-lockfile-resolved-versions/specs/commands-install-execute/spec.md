## MODIFIED Requirements

### Requirement: Install command operation handler

The `installCommand` operation handler SHALL implement `OperationHandler<InstallCommandOperation, R>` and orchestrate installation of a command extension to the workspace. Commands are workspace-level extensions — no agent symlinks are needed.

The handler SHALL:

1. Fetch the command archive from the registry
2. Extract to the canonical location (`.axm/extensions/@<namespace>/commands/<name>/`)
3. Update the lockfile command entry
4. Update the settings command entry (unless `skipSettings` is true)

For registry-sourced commands, any `resolvedVersion` written to lockfile MUST be an exact semver version and MUST NOT be a semver range.

#### Scenario: Install command from registry

- **WHEN** executing an install-command operation with a registry ref
- **THEN** the command archive SHALL be fetched from the registry
- **AND** extracted to `.axm/extensions/@<namespace>/commands/<name>/`
- **AND** a command lock entry SHALL be written to the lockfile `commands` section
- **AND** a command entry SHALL be written to `settings.json` `commands` section

#### Scenario: Install command with skipSettings

- **WHEN** executing an install-command operation with `skipSettings: true`
- **THEN** only the lockfile command entry SHALL be written
- **AND** no settings entry SHALL be added

#### Scenario: Command already installed at canonical location

- **WHEN** the canonical directory already exists
- **THEN** existing files SHALL be removed before extracting the new archive

#### Scenario: Registry lockfile resolvedVersion is exact

- **WHEN** executing an install-command operation for a registry source
- **THEN** the written lockfile entry's `resolvedVersion` SHALL be an exact version (for example, `1.2.3`)
- **AND** the operation SHALL fail if a range value (for example, `^1.2.0`) would be written
