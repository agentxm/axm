## MODIFIED Requirements

### Requirement: Actual State Loading

The system SHALL load actual skill state by scanning the `.axm/extensions/` directory.

#### Scenario: Load skill from disk

- **WHEN** loading actual state for a skill directory
- **THEN** the system reads the skill name, path, files list, frontmatter, and attaches any issues to ActualSkill.issues

#### Scenario: Registry skill location

- **WHEN** loading actual state for a registry skill
- **THEN** the system scans `.axm/extensions/@<scope>/skills/<name>`

#### Scenario: External skill location

- **WHEN** loading actual state for an external skill (GitHub, local)
- **THEN** the system scans `.axm/extensions/external/skills/<name>`

#### Scenario: No skills installed

- **WHEN** loading actual state and extension directories are empty
- **THEN** the system returns an empty skills array

### Requirement: State Merging

The system SHALL merge actual and locked state into unified skill state with computed issues.

#### Scenario: Skill exists in both actual and locked

- **WHEN** a skill exists on disk and in lockfile
- **THEN** the system creates a SkillState with both actual and locked as Some

#### Scenario: Skill exists only on disk (orphaned)

- **WHEN** a skill exists on disk but not in lockfile
- **THEN** the system creates a SkillState with NotInLockfile issue (warning severity)

#### Scenario: Skill exists only in lockfile (missing)

- **WHEN** a skill exists in lockfile but not on disk
- **THEN** the system creates a SkillState with MissingFromDisk issue (error severity)

### Requirement: Diff Computation

The system SHALL compute diff between current and ideal state as a Plan with PlanStep entries.

#### Scenario: New skill (InstallSkill)

- **WHEN** ideal contains a skill not in current
- **THEN** plan contains an InstallSkill step for that skill

#### Scenario: Removed skill (UninstallSkill)

- **WHEN** current contains a skill not in ideal (and skill has both actual and locked)
- **THEN** plan contains an UninstallSkill step for that skill

#### Scenario: Updated skill (UpdateSkill)

- **WHEN** ideal skill has different version (registry) or gitTreeHash (git) than current
- **THEN** plan contains an UpdateSkill step with from/to values

#### Scenario: Local skill always updates

- **WHEN** ideal skill source is Local
- **THEN** plan contains an UpdateSkill step (no stable identifier)

#### Scenario: Unchanged skill

- **WHEN** ideal skill matches current state version/hash
- **THEN** no step is included in the plan

### Requirement: Apply Changes

The system SHALL apply plan steps to make actual match ideal.

#### Scenario: Apply InstallSkill

- **WHEN** applying an InstallSkill step
- **THEN** the system fetches source, copies to canonical location, syncs to agents

#### Scenario: Apply UninstallSkill

- **WHEN** applying an UninstallSkill step
- **THEN** the system removes skill files from canonical location and agent directories

#### Scenario: Apply UpdateSkill

- **WHEN** applying an UpdateSkill step
- **THEN** the system removes existing files, fetches new version, copies to canonical location, syncs to agents

#### Scenario: Lockfile updated on success

- **WHEN** all plan steps succeed
- **THEN** the lockfile is updated with new state

#### Scenario: Settings updated on success

- **WHEN** all plan steps succeed
- **THEN** settings are updated (skills added/removed as appropriate)

#### Scenario: Stop on failure

- **WHEN** a step fails during apply
- **THEN** execution stops; lockfile and settings are NOT updated; partial ApplyResult returned

## REMOVED Requirements

### Requirement: Validity Computation

**Reason**: Replaced by issues-based diagnostics computed during state loading.

**Migration**: Use collectIssues(currentState) to get all issues; check issue severity.

### Requirement: Rollback on failure

**Reason**: Rollback complexity outweighs benefits; partial state is recoverable via doctor/reinstall.

**Migration**: On failure, run `axm doctor` to see orphaned files; reinstall or manually clean up.

### Requirement: Repair in Diff Computation

**Reason**: Repair concept removed; hash mismatches handled via reinstall with --force.

**Migration**: Use `axm skills install <source> --force` to reinstall skills with issues.
