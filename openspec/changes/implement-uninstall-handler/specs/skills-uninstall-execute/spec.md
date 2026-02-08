## ADDED Requirements

### Requirement: Uninstall skill operation handler

The `uninstallSkill` operation handler SHALL implement `OperationHandler<UninstallSkillOperation, R>` and orchestrate full removal of a skill from the workspace.

#### Scenario: Full uninstall — skill in lockfile

- **WHEN** the operation targets a skill present in the lockfile and no agent filter is provided
- **THEN** the handler SHALL remove agent symlinks/copies for all agents listed in the lockfile entry
- **AND** remove the canonical directory at `.agents/skills/{sanitizedName}`
- **AND** remove the lockfile entry via `removeLockEntry`
- **AND** return `{ result: "success", message: "Uninstalled <skill-name>" }`

#### Scenario: Full uninstall — skill not in lockfile but exists on disk

- **WHEN** the operation targets a skill not in the lockfile but whose canonical directory exists on disk
- **THEN** the handler SHALL remove the canonical directory
- **AND** return `{ result: "success", message: "Uninstalled <skill-name>" }`

#### Scenario: Skill not installed anywhere

- **WHEN** the operation targets a skill not in the lockfile and no canonical directory exists on disk
- **THEN** the handler SHALL return `{ result: "no-op", message: "not installed" }`

### Requirement: Partial uninstall via agent filter

When the operation args include a non-empty `agents` array, the handler SHALL only remove symlinks for those agents.

#### Scenario: Remove from specific agents with remaining agents

- **WHEN** the operation includes an agent filter and the lockfile entry has agents beyond those being removed
- **THEN** the handler SHALL remove symlinks only for the specified agents
- **AND** update the lockfile entry's agents array to exclude the removed agents
- **AND** SHALL NOT remove the canonical directory
- **AND** return `{ result: "success", message: "Uninstalled <skill-name> from <agent-list>" }`

#### Scenario: Remove from specific agents leaving no agents

- **WHEN** the operation includes an agent filter and removing those agents leaves the lockfile entry with an empty agents array
- **THEN** the handler SHALL remove symlinks for the specified agents
- **AND** remove the canonical directory
- **AND** remove the lockfile entry
- **AND** return `{ result: "success", message: "Uninstalled <skill-name>" }`

### Requirement: Removal order

The handler SHALL remove agent symlinks before removing the canonical directory, since symlinks may point to the canonical location.

#### Scenario: Symlinks removed before canonical

- **WHEN** performing a full uninstall
- **THEN** all agent symlinks SHALL be removed before the canonical directory is removed

### Requirement: Graceful handling of missing files

The handler SHALL not fail if files or directories are already absent from disk.

#### Scenario: Canonical directory already missing

- **WHEN** the canonical directory does not exist on disk
- **THEN** the handler SHALL skip removal without error and continue

#### Scenario: Agent symlink already missing

- **WHEN** an agent symlink does not exist on disk
- **THEN** the handler SHALL skip removal without error and continue

### Requirement: Sanitized name for filesystem paths

The handler SHALL use `sanitizeName()` to derive filesystem paths, consistent with the install handler.

#### Scenario: Canonical path uses sanitized name

- **WHEN** computing the canonical directory path
- **THEN** the handler SHALL use `sanitizeName(skillName)` to construct `.agents/skills/{sanitizedName}`
