## Requirements

### Requirement: Uninstall command operation handler

The `uninstallCommand` operation handler SHALL implement `OperationHandler<UninstallCommandOperation, R>` and orchestrate full removal of a command extension from the workspace.

The handler SHALL:

1. Remove the canonical directory from disk
2. Remove the lockfile command entry
3. Remove the settings command entry

#### Scenario: Full uninstall — command in lockfile

- **WHEN** the operation targets a command present in the lockfile
- **THEN** the handler SHALL remove the canonical directory from disk
- **AND** remove the command entry from the lockfile `commands` section
- **AND** remove the command entry from `settings.json` `commands` section
- **AND** return `{ result: "success", message: "Uninstalled <command-name>" }`

#### Scenario: Command not installed

- **WHEN** the operation targets a command not in the lockfile and no canonical directory exists on disk
- **THEN** the handler SHALL return `{ result: "no-op", message: "not installed" }`

### Requirement: Canonical directory lookup

When a lockfile entry exists, the canonical directory SHALL be computed from the lock entry's profile and name. When no lockfile entry exists, the handler SHALL scan `.axm/extensions/@*/commands/<name>/` for matching directories.

#### Scenario: Lockfile entry provides profile

- **WHEN** the lockfile contains a command entry with profile `@acme` and name `formatter`
- **THEN** the canonical directory SHALL be `.axm/extensions/@acme/commands/formatter/`

#### Scenario: No lockfile entry — scan for orphaned directories

- **WHEN** the command is not in the lockfile
- **AND** `.axm/extensions/@acme/commands/formatter/` exists on disk
- **THEN** the handler SHALL remove that directory

### Requirement: Graceful handling of missing files

The handler SHALL NOT fail if files or directories are already absent from disk.

#### Scenario: Canonical directory already missing

- **WHEN** the canonical directory does not exist on disk
- **THEN** the handler SHALL skip removal without error and continue

### Requirement: Settings and lockfile write failure handling

Metadata removal failures SHALL be logged as warnings but SHALL NOT fail the uninstall.

#### Scenario: Settings removal failure

- **WHEN** `removeCommand()` fails for settings
- **THEN** the failure SHALL be logged as a warning
- **AND** the uninstall SHALL still return success
