## ADDED Requirements

### Requirement: Settings updated after successful full uninstall

The uninstall skill executor SHALL call `SettingsService.removeSkill()` after successful full removal (canonical directory and lockfile entry removed), keeping settings in sync with the lockfile.

#### Scenario: Skill removed from settings on full uninstall

- **WHEN** a full uninstall completes (canonical directory removed, lockfile entry removed)
- **THEN** the executor calls `SettingsService.removeSkill()` with the skill name

#### Scenario: Partial uninstall does not remove from settings

- **WHEN** a partial uninstall completes (agents removed but skill still installed for other agents)
- **THEN** the executor SHALL NOT call `SettingsService.removeSkill()`

#### Scenario: Settings write failure does not fail uninstall

- **WHEN** `SettingsService.removeSkill()` fails
- **THEN** the failure SHALL be silently swallowed
- **AND** the uninstall SHALL still be considered successful
