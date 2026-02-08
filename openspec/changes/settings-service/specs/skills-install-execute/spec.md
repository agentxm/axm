## ADDED Requirements

### Requirement: Settings updated after successful installation

The install skill executor SHALL call `SettingsService.addSkill()` after successful file installation and lockfile update, keeping settings in sync with the lockfile.

#### Scenario: Skill added to settings on success

- **WHEN** skill files are copied, symlinks created, and lockfile updated successfully
- **THEN** the executor calls `SettingsService.addSkill()` with the skill name and source string

#### Scenario: Settings write failure does not fail installation

- **WHEN** `SettingsService.addSkill()` fails
- **THEN** the failure SHALL be silently swallowed (consistent with lockfile write failure handling)
- **AND** the installation SHALL still be considered successful
