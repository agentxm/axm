## MODIFIED Requirements

### Requirement: Uninstall skill operation handler

The `uninstallSkill` operation handler SHALL implement `OperationHandler<UninstallSkillOperation, R>` and orchestrate full removal of a skill from the workspace. Canonical directories SHALL be resolved via `Workspace.getSkillDir` when a lockfile entry exists, and checked across all known locations (`.axm/extensions/external/skills/` and `.axm/extensions/@*/skills/`) when no lockfile entry exists.

#### Scenario: Full uninstall — skill in lockfile

- **WHEN** the operation targets a skill present in the lockfile and no agent filter is provided
- **THEN** the handler SHALL remove agent symlinks/copies for all agents listed in the lockfile entry
- **AND** remove the canonical directory from all known locations
- **AND** remove the lockfile entry via `LockfileService.removeEntry()`
- **AND** return `{ result: "success", message: "Uninstalled <skill-name>" }`

#### Scenario: Full uninstall — skill not in lockfile but exists on disk

- **WHEN** the operation targets a skill not in the lockfile but whose canonical directory exists on disk
- **THEN** the handler SHALL remove the canonical directory from all known locations
- **AND** return `{ result: "success", message: "Uninstalled <skill-name>" }`

#### Scenario: Skill not installed anywhere

- **WHEN** the operation targets a skill not in the lockfile and no canonical directory exists on disk in any known location
- **THEN** the handler SHALL return `{ result: "no-op", message: "not installed" }`

### Requirement: Partial uninstall via agent filter

When the operation args include a non-empty `agents` array, the handler SHALL only remove symlinks for those agents.

#### Scenario: Remove from specific agents with remaining agents

- **WHEN** the operation includes an agent filter and the lockfile entry has agents beyond those being removed
- **THEN** the handler SHALL remove symlinks only for the specified agents
- **AND** update the lockfile entry's agents array to exclude the removed agents via `LockfileService.updateEntry()`
- **AND** SHALL NOT remove the canonical directory
- **AND** return `{ result: "success", message: "Uninstalled <skill-name> from <agent-list>" }`

#### Scenario: Remove from specific agents leaving no agents

- **WHEN** the operation includes an agent filter and removing those agents leaves the lockfile entry with an empty agents array
- **THEN** the handler SHALL remove symlinks for the specified agents
- **AND** remove the canonical directory from all known locations
- **AND** remove the lockfile entry via `LockfileService.removeEntry()`
- **AND** return `{ result: "success", message: "Uninstalled <skill-name>" }`

### Requirement: Sanitized name for filesystem paths

The handler SHALL use `sanitizeName()` to derive filesystem paths, consistent with the install handler.

#### Scenario: Canonical path uses sanitized name

- **WHEN** computing the canonical directory path
- **THEN** the handler SHALL use `sanitizeName(skillName)` to locate the skill in `.axm/extensions/external/skills/{sanitizedName}` and `.axm/extensions/@*/skills/{sanitizedName}`
