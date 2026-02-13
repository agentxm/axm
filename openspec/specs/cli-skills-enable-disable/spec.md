## Requirements

### Requirement: Enable command definition

The CLI SHALL provide an `enable` subcommand under `axm skills` with the syntax `axm skills enable <name>`.

#### Scenario: Command accepts standard flags

- **WHEN** the user runs `axm skills enable <name>`
- **THEN** the command SHALL accept `--yes`, `--preview`, `--global`, and `--non-interactive` options

### Requirement: Enable handler orchestration

The enable handler SHALL validate the skill state, build an `EnableSkillOperation`, and resolve via the plan system.

#### Scenario: Enable a disabled managed skill

- **WHEN** the user runs `axm skills enable <name>` for a skill that exists, is managed, and is currently disabled
- **THEN** the handler SHALL build an `EnableSkillOperation` with the skill name
- **AND** build a single-step plan
- **AND** resolve the plan via `ws.resolvePlan()`

#### Scenario: Skill does not exist

- **WHEN** the user runs `axm skills enable <name>` for a skill not in settings
- **THEN** the handler SHALL fail with a `CliError` indicating the skill was not found

#### Scenario: Skill is unmanaged

- **WHEN** the user runs `axm skills enable <name>` for an unmanaged skill
- **THEN** the handler SHALL fail with a `CliError` indicating unmanaged skills cannot be enabled

#### Scenario: Skill is already enabled

- **WHEN** the user runs `axm skills enable <name>` for a skill that is already enabled
- **THEN** the handler SHALL log that the skill is already enabled and take no action

### Requirement: EnableSkillOperation handler

The `enableSkill` operation handler SHALL re-install skill files to agent directories and update the skill entry to enabled.

#### Scenario: Re-install and enable

- **WHEN** an `EnableSkillOperation` is executed
- **THEN** the handler SHALL read configured agents, lock entry, and settings entry from the workspace
- **AND** re-resolve the source string via `SourceProviders`
- **AND** install skill files to canonical location and create agent symlinks via `installForAgent`
- **AND** call `ws.updateLockEntryAgents(name, configuredAgents)` to sync lock entry agents
- **AND** call `ws.updateSkillEntry(name, e => { ...e, enabled: true })` to mark enabled

#### Scenario: Files installed before state updated

- **WHEN** an `EnableSkillOperation` is executed
- **THEN** file operations (fetch/copy, symlink creation) SHALL complete before state updates (lock entry agents, settings entry)
- **AND** if file operations fail, the skill SHALL remain `enabled: false`

#### Scenario: Canonical path determined by source type

- **WHEN** an `EnableSkillOperation` is executed
- **THEN** the handler SHALL determine the canonical path from the lock entry's `type` field
- **AND** registry sources SHALL use `.axm/extensions/@<scope>/skills/<name>/`
- **AND** other sources SHALL use `.agents/skills/<name>/`

### Requirement: Disable command definition

The CLI SHALL provide a `disable` subcommand under `axm skills` with the syntax `axm skills disable <name>`.

#### Scenario: Command accepts standard flags

- **WHEN** the user runs `axm skills disable <name>`
- **THEN** the command SHALL accept `--yes`, `--preview`, `--global`, and `--non-interactive` options

### Requirement: Disable handler orchestration

The disable handler SHALL validate the skill state, build a `DisableSkillOperation`, and resolve via the plan system.

#### Scenario: Disable an enabled managed skill

- **WHEN** the user runs `axm skills disable <name>` for a skill that exists, is managed, and is currently enabled
- **THEN** the handler SHALL build a `DisableSkillOperation` with the skill name
- **AND** build a single-step plan
- **AND** resolve the plan via `ws.resolvePlan()`

#### Scenario: Skill does not exist

- **WHEN** the user runs `axm skills disable <name>` for a skill not in settings
- **THEN** the handler SHALL fail with a `CliError` indicating the skill was not found

#### Scenario: Skill is unmanaged

- **WHEN** the user runs `axm skills disable <name>` for an unmanaged skill
- **THEN** the handler SHALL fail with a `CliError` indicating unmanaged skills cannot be disabled

#### Scenario: Skill is already disabled

- **WHEN** the user runs `axm skills disable <name>` for a skill that is already disabled
- **THEN** the handler SHALL log that the skill is already disabled and take no action

### Requirement: DisableSkillOperation handler

The `disableSkill` operation handler SHALL remove skill files from agent directories and canonical locations, then update the skill entry to disabled.

#### Scenario: Remove files and disable

- **WHEN** a `DisableSkillOperation` is executed
- **THEN** the handler SHALL read configured agents and lock entry from the workspace
- **AND** remove agent symlinks for all configured agents
- **AND** remove canonical skill directories
- **AND** call `ws.updateLockEntryAgents(name, [])` to clear lock entry agents
- **AND** call `ws.updateSkillEntry(name, e => { ...e, enabled: false })` to mark disabled

#### Scenario: Files removed before state updated

- **WHEN** a `DisableSkillOperation` is executed
- **THEN** file removal (symlinks, canonical directory) SHALL complete before state updates (lock entry agents, settings entry)
- **AND** if file removal fails, the skill SHALL remain `enabled: true`

#### Scenario: Canonical removal required for direct-read agents

- **WHEN** a `DisableSkillOperation` is executed
- **THEN** the handler SHALL remove canonical skill directories in addition to agent symlinks
- **AND** this prevents agents whose `skills.dir` resolves to the canonical location from seeing disabled skills

### Requirement: Disabled skills preserved in settings and lockfile

Disabling a skill SHALL preserve its settings entry and lockfile entry for later re-enablement.

#### Scenario: Settings entry preserved on disable

- **WHEN** a skill is disabled
- **THEN** its settings entry SHALL remain with `enabled: false` and its source reference preserved

#### Scenario: Lockfile entry preserved on disable

- **WHEN** a skill is disabled
- **THEN** its lockfile entry SHALL remain with agents cleared to `[]`
- **AND** all other lock metadata (source type, version, resolved coordinates) SHALL be preserved
