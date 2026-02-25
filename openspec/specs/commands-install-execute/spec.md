## Requirements

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

### Requirement: Command canonical path

Command extensions SHALL be stored at `.axm/extensions/@<namespace>/commands/<name>/`.

#### Scenario: Canonical path structure

- **WHEN** installing command `formatter` from namespace `@acme`
- **THEN** the canonical path SHALL be `.axm/extensions/@acme/commands/formatter/`

### Requirement: Empty integrity skips validation

When a command ref has empty integrity (pack dependency), the handler SHALL skip integrity validation.

#### Scenario: Empty integrity with existing canonical

- **WHEN** installing a command ref with empty integrity
- **AND** the canonical path already exists on disk
- **THEN** the handler SHALL skip fetching and use existing files

#### Scenario: Empty integrity without existing canonical

- **WHEN** installing a command ref with empty integrity
- **AND** the canonical path does not exist on disk
- **THEN** the handler SHALL fetch from the registry without integrity validation

#### Scenario: Non-empty integrity validated

- **WHEN** installing a command ref with non-empty integrity
- **THEN** the computed integrity of the fetched archive SHALL be compared to the ref integrity
- **AND** a mismatch SHALL fail with an integrity error

### Requirement: Lockfile and settings write failure handling

Metadata write failures SHALL be logged as warnings but SHALL NOT fail the installation.

#### Scenario: Lockfile write failure

- **WHEN** the lockfile write fails
- **THEN** the failure SHALL be logged as a warning
- **AND** the installation SHALL still return success

#### Scenario: Settings write failure

- **WHEN** the settings write fails
- **THEN** the failure SHALL be logged as a warning
- **AND** the installation SHALL still return success
