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

The `enableSkill` operation handler SHALL verify the canonical directory exists and re-create agent symlinks without re-resolving sources or copying files.

#### Scenario: Enable with existing canonical files

- **WHEN** an `EnableSkillOperation` is executed
- **THEN** the handler SHALL read configured agents and lock entry from the workspace
- **AND** compute the canonical path via `ws.getSkillDir(name)`
- **AND** verify the canonical directory exists on disk
- **AND** create agent symlinks from `skillSrcPath` for all configured agents (concurrent, with copy fallback)
- **AND** call `ws.updateLockEntryAgents(name, configuredAgents)` to sync lock entry agents
- **AND** call `ws.updateSkillEntry(name, e => { ...e, enabled: true })` to mark enabled

#### Scenario: Canonical directory missing on enable

- **WHEN** an `EnableSkillOperation` is executed and the canonical directory does not exist
- **THEN** the handler SHALL fail with a `CliError` with code `ENABLE_SKILL_MISSING_FILES`
- **AND** the error SHALL suggest reinstalling the skill with `axm skills install`
- **AND** the skill SHALL remain `enabled: false`

#### Scenario: Symlinks created before state updated

- **WHEN** an `EnableSkillOperation` is executed
- **THEN** symlink creation SHALL complete before state updates (lock entry agents, settings entry)
- **AND** if symlink creation fails, the skill SHALL remain `enabled: false`

#### Scenario: No source resolution required

- **WHEN** an `EnableSkillOperation` is executed
- **THEN** the handler SHALL NOT resolve sources, fetch from network, or copy files to the canonical location
- **AND** enable SHALL work fully offline

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

The `disableSkill` operation handler SHALL remove agent symlinks and update state, without deleting canonical skill files.

#### Scenario: Remove symlinks and disable

- **WHEN** a `DisableSkillOperation` is executed
- **THEN** the handler SHALL read configured agents and lock entry from the workspace
- **AND** remove agent symlinks for all agents (lock agents + configured agents, deduplicated)
- **AND** call `ws.updateLockEntryAgents(name, [])` to clear lock entry agents
- **AND** call `ws.updateSkillEntry(name, e => { ...e, enabled: false })` to mark disabled

#### Scenario: Canonical files preserved on disable

- **WHEN** a `DisableSkillOperation` is executed
- **THEN** the handler SHALL NOT remove the canonical skill directory
- **AND** canonical files SHALL remain at their `.axm/extensions/` location for later re-enablement

#### Scenario: Symlinks removed before state updated

- **WHEN** a `DisableSkillOperation` is executed
- **THEN** symlink removal SHALL complete before state updates (lock entry agents, settings entry)
- **AND** if symlink removal fails, the skill SHALL remain `enabled: true`

### Requirement: Disabled skills preserved in settings and lockfile

Disabling a skill SHALL preserve its settings entry and lockfile entry for later re-enablement.

#### Scenario: Settings entry preserved on disable

- **WHEN** a skill is disabled
- **THEN** its settings entry SHALL remain with `enabled: false` and its source reference preserved

#### Scenario: Lockfile entry preserved on disable

- **WHEN** a skill is disabled
- **THEN** its lockfile entry SHALL remain with agents cleared to `[]`
- **AND** all other lock metadata (source type, version, resolved coordinates) SHALL be preserved
