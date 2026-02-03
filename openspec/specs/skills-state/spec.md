# skills-state Specification

## Purpose

State model for skills enabling dry-run, validation, and diff-based operations.

## Requirements

### Requirement: Actual State Loading

The system SHALL load actual skill state by scanning the `.axm/skills/` directory.

#### Scenario: Load skill from disk

- **WHEN** loading actual state for a skill directory
- **THEN** the system reads the skill name, path, content, files list, frontmatter, and computes the git tree folder hash

#### Scenario: No skills installed

- **WHEN** loading actual state and `.axm/skills/` is empty
- **THEN** the system returns an empty skills record

### Requirement: Locked State Loading

The system SHALL load locked skill state from the lockfile.

#### Scenario: Load skill from lockfile

- **WHEN** loading locked state for a skill entry in `axm.lock`
- **THEN** the system reads the source, origin, path, ref, version, folder hash, and timestamps

#### Scenario: No lockfile exists

- **WHEN** loading locked state and no lockfile exists
- **THEN** the system returns an empty skills record

#### Scenario: Corrupted lockfile

- **WHEN** loading locked state and the lockfile fails to parse
- **THEN** the system treats it as empty with a warning

### Requirement: State Merging

The system SHALL merge actual and locked state into unified skill state with computed validity.

#### Scenario: Skill exists in both actual and locked

- **WHEN** a skill exists on disk and in lockfile
- **THEN** the system creates a SkillState with both actual and locked as Some

#### Scenario: Skill exists only on disk (orphaned)

- **WHEN** a skill exists on disk but not in lockfile
- **THEN** the system creates a SkillState with Orphaned validity

#### Scenario: Skill exists only in lockfile (missing)

- **WHEN** a skill exists in lockfile but not on disk
- **THEN** the system creates a SkillState with Missing validity

### Requirement: Validity Computation

The system SHALL compute validity by comparing actual vs locked state.

#### Scenario: Valid skill

- **WHEN** actual and locked exist and hashes match
- **THEN** validity is Valid

#### Scenario: Hash mismatch

- **WHEN** actual and locked exist but folder hashes differ
- **THEN** validity is HashMismatch with expected and actual hashes

#### Scenario: Missing SKILL.md

- **WHEN** actual exists but SKILL.md content is empty
- **THEN** validity is MissingSkillMd

#### Scenario: Invalid frontmatter

- **WHEN** actual exists with content but frontmatter fails to parse
- **THEN** validity is InvalidFrontmatter with error messages

#### Scenario: Name mismatch

- **WHEN** frontmatter name differs from directory name
- **THEN** validity is NameMismatch with both names

#### Scenario: Multiple issues

- **WHEN** multiple validity issues are detected
- **THEN** validity is Multiple containing all issues

### Requirement: Ideal State Building for Install

The system SHALL build ideal state for install operations.

#### Scenario: Build ideal from source

- **WHEN** building ideal state for install from a resolved source
- **THEN** the system discovers skills from the source and creates IdealSkill entries

#### Scenario: Filter by skill names

- **WHEN** building ideal with specific skill names
- **THEN** only matching skills are included in ideal state

#### Scenario: Skip existing unless force

- **WHEN** building ideal and a skill already exists
- **THEN** the skill is skipped unless force flag is set

### Requirement: Diff Computation

The system SHALL compute diff between current and ideal state.

#### Scenario: New skill (Add)

- **WHEN** ideal contains a skill not in current
- **THEN** diff contains an Add change for that skill

#### Scenario: Removed skill (Remove)

- **WHEN** ideal removals list contains a skill name
- **THEN** diff contains a Remove change for that skill

#### Scenario: Updated skill (Update)

- **WHEN** ideal skill has different hash than current
- **THEN** diff contains an Update change with from and to states

#### Scenario: Unchanged skill

- **WHEN** ideal skill matches current state
- **THEN** diff contains an Unchanged change

#### Scenario: Invalid skill needing repair (Repair)

- **WHEN** current skill has validity issues requiring repair
- **THEN** diff contains a Repair change with target ideal state

#### Scenario: Diff summary

- **WHEN** computing diff
- **THEN** summary includes counts for add, update, remove, unchanged, and repair

### Requirement: Apply Changes

The system SHALL apply diff changes to make actual match ideal.

#### Scenario: Apply Add change

- **WHEN** applying an Add change
- **THEN** the system fetches source, copies to canonical location, syncs to agents, updates settings and lockfile

#### Scenario: Apply Remove change

- **WHEN** applying a Remove change
- **THEN** the system removes skill files, removes agent symlinks, updates settings and lockfile

#### Scenario: Apply Update change

- **WHEN** applying an Update change
- **THEN** the system fetches new version, replaces files, re-syncs agents, updates lockfile

#### Scenario: Progress events

- **WHEN** applying changes
- **THEN** the system emits progress events for each skill action

#### Scenario: Rollback on failure

- **WHEN** apply fails partway through
- **THEN** the system restores from checkpoint created before apply started
