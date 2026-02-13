## ADDED Requirements

### Requirement: Detect renames for single-skill sources during update

When the update handler re-resolves a source and the expected skill name is not found, it SHALL check whether the source provides exactly one skill and treat it as a rename.

#### Scenario: Single-skill source rename detected

- **WHEN** re-resolving a skill's source during update
- **AND** the expected skill name is not found in the discovered skills
- **AND** the source provides exactly one skill with a different name
- **THEN** the handler SHALL add an `InstallSkillOperation` for the new name (fresh content, full install) and an `UninstallSkillOperation` for the old name (settings/lock cleanup and file removal) to the plan
- **AND** the plan display SHALL show `old-name -> new-name (install + cleanup)`

#### Scenario: Single-skill source rename plan execution order

- **WHEN** a rename is detected for a single-skill source
- **THEN** the `InstallSkillOperation` for the new name SHALL precede the `UninstallSkillOperation` for the old name in the plan
- **AND** this ensures the new content is installed before old entries are cleaned up

### Requirement: Report missing skills for multi-skill sources

When the expected skill name is not found in a source that provides multiple skills, the handler SHALL report the issue without inferring a rename.

#### Scenario: Multi-skill source with missing name

- **WHEN** re-resolving a skill's source during update
- **AND** the expected skill name is not found
- **AND** the source provides more than one skill
- **THEN** the handler SHALL log a warning listing available skills from the source
- **AND** suggest using `axm skills rename <old-name> <new-name>` to update the mapping
- **AND** the skill SHALL be skipped in the update plan

### Requirement: Resolution failure handling unchanged

Source resolution failures during rename detection SHALL follow existing error handling.

#### Scenario: Source resolution fails entirely

- **WHEN** re-resolving a skill's source fails during update (e.g., network error, repo deleted)
- **THEN** existing error handling SHALL apply (log warning, continue with other skills)
- **AND** the failed skill SHALL NOT appear in the plan
