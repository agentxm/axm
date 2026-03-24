## MODIFIED Requirements

### Requirement: Enable handler orchestration

The enable handler SHALL validate installed skill state and resolve a single-step `EnableSkillOperation` plan for every state-changing enable path. The handler SHALL NOT mutate settings directly.

#### Scenario: Enable a disabled installed skill

- **WHEN** the user runs `axm skills enable <name>` for a skill that is installed and currently disabled
- **THEN** the handler SHALL build an `EnableSkillOperation` with the skill name
- **AND** build a single-step plan
- **AND** resolve the plan via `ws.resolvePlan()`

#### Scenario: Enable a disabled installed skill with no lock entry

- **WHEN** the user runs `axm skills enable <name>` for a disabled installed skill that has no lock entry
- **THEN** the handler SHALL still build and resolve `EnableSkillOperation` through `ws.resolvePlan()`
- **AND** the handler SHALL NOT call `ws.updateSkillEntry()` directly

#### Scenario: Skill is not installed

- **WHEN** the user runs `axm skills enable <name>` for a skill outside installed lifecycle sets
- **THEN** the handler SHALL fail with an `AppError` indicating the skill is not installed

#### Scenario: Skill is already enabled

- **WHEN** the user runs `axm skills enable <name>` for a skill that is already enabled
- **THEN** the handler SHALL log that the skill is already enabled and take no action

### Requirement: EnableSkillOperation handler

The `enableSkill` operation handler SHALL support both lock-backed enable and settings-only enable paths.

#### Scenario: Lock-backed enable with existing canonical files

- **WHEN** an `EnableSkillOperation` is executed and a lock entry exists
- **THEN** the handler SHALL read configured agents and lock entry from the workspace
- **AND** compute the canonical path via `ws.getSkillDir(name)`
- **AND** verify the canonical directory exists on disk
- **AND** create agent symlinks from `skillSrcPath` for configured agents
- **AND** call `ws.updateLockEntryAgents(name, configuredAgents)` and `ws.updateSkillEntry(name, e => { ...e, enabled: true })`

#### Scenario: Canonical directory missing on lock-backed enable

- **WHEN** an `EnableSkillOperation` is executed with lock-backed state and the canonical directory does not exist
- **THEN** the handler SHALL fail with an `AppError` with code `ENABLE_SKILL_MISSING_FILES`
- **AND** the error SHALL suggest reinstalling the skill with `axm skills install`
- **AND** the skill SHALL remain `enabled: false`

#### Scenario: Settings-only enable when lock entry is absent

- **WHEN** an `EnableSkillOperation` is executed for a configured installed skill with no lock entry
- **THEN** the handler SHALL update settings to `enabled: true`
- **AND** the handler SHALL NOT attempt lockfile agent updates or symlink work

### Requirement: Disable handler orchestration

The disable handler SHALL validate installed skill state and resolve a single-step `DisableSkillOperation` plan for every state-changing disable path. The handler SHALL NOT mutate settings directly.

#### Scenario: Disable an enabled installed skill

- **WHEN** the user runs `axm skills disable <name>` for a skill that is installed and currently enabled
- **THEN** the handler SHALL build a `DisableSkillOperation` with the skill name
- **AND** build a single-step plan
- **AND** resolve the plan via `ws.resolvePlan()`

#### Scenario: Disable implicit installed skill

- **WHEN** the user runs `axm skills disable <name>` for an implicit installed skill
- **THEN** the handler SHALL still build and resolve `DisableSkillOperation` through `ws.resolvePlan()`
- **AND** the handler SHALL NOT call `ws.setSkillEntry()` directly

#### Scenario: Skill is not installed for disable

- **WHEN** the user runs `axm skills disable <name>` for a skill outside installed lifecycle sets
- **THEN** the handler SHALL fail with an `AppError` indicating the skill is not installed

#### Scenario: Skill is already disabled

- **WHEN** the user runs `axm skills disable <name>` for a skill that is already disabled
- **THEN** the handler SHALL log that the skill is already disabled and take no action

### Requirement: DisableSkillOperation handler

The `disableSkill` operation handler SHALL remove agent symlinks and update state while preserving canonical skill files. It SHALL support lock-backed and promotion/settings-only disable paths.

#### Scenario: Remove symlinks and disable lock-backed skill

- **WHEN** a `DisableSkillOperation` is executed and a lock entry exists
- **THEN** the handler SHALL remove agent symlinks for all relevant agents
- **AND** call `ws.updateLockEntryAgents(name, [])`
- **AND** call `ws.updateSkillEntry(name, e => { ...e, enabled: false })`

#### Scenario: Disable with no lock entry uses settings-only path

- **WHEN** a `DisableSkillOperation` is executed for a configured installed skill with no lock entry
- **THEN** the handler SHALL update settings to `enabled: false`
- **AND** the handler SHALL NOT attempt lockfile agent updates or symlink removal

#### Scenario: Implicit disable promotion uses deterministic source fallback

- **WHEN** a `DisableSkillOperation` is executed for an implicit installed skill without a configured settings entry
- **THEN** the operation SHALL promote the skill to a configured entry with `enabled: false`
- **AND** source resolution SHALL use this precedence: installed entry source, then lock-derived source metadata

#### Scenario: Implicit disable promotion fails when source is unavailable

- **WHEN** an implicit installed skill cannot produce source from installed state or lock metadata
- **THEN** the operation SHALL fail with an `AppError`
- **AND** the operation SHALL NOT write a partial settings mutation

#### Scenario: Symlinks removed before state updated

- **WHEN** a lock-backed `DisableSkillOperation` is executed
- **THEN** symlink removal SHALL complete before lock/settings state updates
- **AND** if symlink removal fails, the skill SHALL remain enabled
