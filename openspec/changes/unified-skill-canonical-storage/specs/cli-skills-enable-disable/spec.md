## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Canonical removal required for direct-read agents

**Reason**: With canonical files moved to `.axm/extensions/external/`, no agent reads directly from canonical locations. Symlink removal is sufficient to deactivate a skill.
**Migration**: Disable only removes symlinks. Canonical file deletion is handled exclusively by uninstall.
