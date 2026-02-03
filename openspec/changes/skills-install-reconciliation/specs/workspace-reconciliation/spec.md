## ADDED Requirements

### Requirement: WorkspaceContext provides workspace access

The system SHALL provide a WorkspaceContext interface for workspace operations.

#### Scenario: Create local workspace context

- **WHEN** creating context with `{ global: false }`
- **THEN** the workspace path is `.axm/` in the current directory

#### Scenario: Create global workspace context

- **WHEN** creating context with `{ global: true }`
- **THEN** the workspace path is `~/.axm/`

### Requirement: loadCurrentState merges actual and locked state

The system SHALL load current state by merging disk state with lockfile state.

#### Scenario: Load skills from disk and lockfile

- **WHEN** loading current state for a workspace
- **THEN** the system scans `.axm/extensions/` for actual skills and reads lockfile for locked skills

#### Scenario: Skill exists in both actual and locked

- **WHEN** a skill exists on disk and in lockfile
- **THEN** the SkillState has both `actual` and `locked` as Some

#### Scenario: Skill exists only on disk

- **WHEN** a skill exists on disk but not in lockfile
- **THEN** the SkillState has `actual` as Some and `locked` as None with NotInLockfile issue

#### Scenario: Skill exists only in lockfile

- **WHEN** a skill exists in lockfile but not on disk
- **THEN** the SkillState has `actual` as None and `locked` as Some with MissingFromDisk issue

### Requirement: Issues computed during state loading

The system SHALL compute issues during state loading and attach them at appropriate levels.

#### Scenario: ActualSkill issues

- **WHEN** a skill on disk is missing SKILL.md or has invalid frontmatter
- **THEN** issues are attached to the ActualSkill.issues array

#### Scenario: SkillState issues

- **WHEN** comparing actual vs locked reveals MissingFromDisk or NotInLockfile
- **THEN** issues are attached to the SkillState.issues array

#### Scenario: WorkspaceIssue for duplicate names

- **WHEN** two skills on disk have the same name
- **THEN** a DuplicateName issue is attached to CurrentState.issues

### Requirement: buildIdealState computes desired state from command

The system SHALL compute ideal state based on command type and current state.

#### Scenario: skills-install command

- **WHEN** building ideal state for skills-install
- **THEN** the system fetches from source, discovers skills, and creates IdealSkill entries with resolved agents

#### Scenario: skills-uninstall command

- **WHEN** building ideal state for skills-uninstall
- **THEN** the system excludes specified skills from ideal state

#### Scenario: skills-update command

- **WHEN** building ideal state for skills-update
- **THEN** the system fetches latest versions for specified skills from their locked sources

### Requirement: buildPlan is a pure function

The system SHALL compute the execution plan as a pure function with no side effects.

#### Scenario: Pure diffing

- **WHEN** calling buildPlan(current, ideal)
- **THEN** no I/O occurs; result is computed from input data only

#### Scenario: New skill becomes InstallSkill step

- **WHEN** ideal contains a skill not in current
- **THEN** plan contains an InstallSkill step for that skill

#### Scenario: Missing skill becomes UninstallSkill step

- **WHEN** current contains a skill not in ideal
- **THEN** plan contains an UninstallSkill step for that skill

#### Scenario: Changed skill becomes UpdateSkill step

- **WHEN** current and ideal both contain a skill with different version or hash
- **THEN** plan contains an UpdateSkill step with from/to versions

#### Scenario: Empty plan for no changes

- **WHEN** current matches ideal exactly
- **THEN** plan.steps is an empty array

### Requirement: applyPlan executes or displays the plan

The system SHALL apply the plan based on dryRun flag.

#### Scenario: Dry run displays plan

- **WHEN** calling applyPlan with dryRun: true
- **THEN** the plan is displayed but no files are modified

#### Scenario: Apply executes steps sequentially

- **WHEN** calling applyPlan with dryRun: false
- **THEN** steps are executed in order; lockfile and settings updated only on full success

#### Scenario: Apply stops on first failure

- **WHEN** a step fails during apply
- **THEN** execution stops and partial ApplyResult is returned

#### Scenario: Progress callback invoked

- **WHEN** onProgress is provided in options
- **THEN** it is called with (step, "starting") before and (step, "completed") after each step

### Requirement: collectIssues flattens all issues

The system SHALL provide a pure function to collect all issues from current state.

#### Scenario: Collect from all levels

- **WHEN** calling collectIssues(current)
- **THEN** issues from CurrentState.issues, SkillState.issues, and ActualSkill.issues are combined into a flat array
