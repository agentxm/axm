## Requirements

### Requirement: Rename command definition

The CLI SHALL provide a `rename` subcommand under `axm skills` with the syntax `axm skills rename <old-name> <new-name>`.

#### Scenario: Command accepts standard flags

- **WHEN** the user runs `axm skills rename <old-name> <new-name>`
- **THEN** the command SHALL accept `--yes`, `--preview`, `--global`, and `--non-interactive` options

### Requirement: Rename handler orchestration

The rename handler SHALL validate skill state, build a `RenameSkillOperation`, and resolve via the plan system.

#### Scenario: Rename a managed skill

- **WHEN** the user runs `axm skills rename <old-name> <new-name>` and the old name exists and is managed
- **THEN** the handler SHALL build a `RenameSkillOperation` with old and new names
- **AND** build a single-step plan
- **AND** resolve the plan via `ws.resolvePlan()`

#### Scenario: Old name does not exist

- **WHEN** the old name is not in settings
- **THEN** the handler SHALL fail with a `CliError` indicating the skill was not found

#### Scenario: Old name is unmanaged

- **WHEN** the old name refers to an unmanaged skill
- **THEN** the handler SHALL fail with a `CliError` indicating unmanaged skills cannot be renamed

#### Scenario: New name conflicts with existing skill

- **WHEN** the new name already exists in settings
- **THEN** the handler SHALL fail with a `CliError` indicating the name conflicts with an existing skill

### Requirement: RenameSkillOperation handler

The `renameSkill` operation handler SHALL rename canonical directories, update agent symlinks, and atomically update settings and lockfile keys.

#### Scenario: Rename files and state

- **WHEN** a `RenameSkillOperation` is executed
- **THEN** the handler SHALL read configured agents, lock entry, and settings entry by old name
- **AND** rename the canonical directory from old name to new name
- **AND** remove old agent symlinks
- **AND** create new agent symlinks under the new name via `installForAgent`
- **AND** call `ws.renameSkill(oldName, newName)` to update settings and lockfile keys
- **AND** call `ws.updateLockEntryAgents(newName, configuredAgents)` to sync lock entry agents

#### Scenario: Files renamed before state updated

- **WHEN** a `RenameSkillOperation` is executed
- **THEN** file operations (directory rename, symlink updates) SHALL complete before state updates (settings, lockfile)
- **AND** if file operations fail, settings SHALL still reference the old name

#### Scenario: Canonical path determined by source type

- **WHEN** a `RenameSkillOperation` is executed
- **THEN** the handler SHALL determine the canonical path from the lock entry's `type` field
- **AND** registry sources SHALL use `.axm/extensions/@<scope>/skills/`
- **AND** other sources SHALL use `.agents/skills/`
