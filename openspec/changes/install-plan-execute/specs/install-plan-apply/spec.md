## ADDED Requirements

### Requirement: Execute plan actions

The plan apply module SHALL execute all `"execute"` actions from the plan, copying skill files and updating the lockfile.

#### Scenario: Copy skill directory to agent skills dirs

- **WHEN** applying an `"execute"` action for an `AddSkillOperation`
- **THEN** the system SHALL copy the skill directory (from `SkillRef.path`) to each agent's skills directory
- **AND** the destination directory name SHALL be the skill name

#### Scenario: Update lockfile after copy

- **WHEN** all skill directories have been copied for an action
- **THEN** the system SHALL update the lockfile with an entry for the installed skill
- **AND** the lockfile entry SHALL preserve the full source variant (github, gitlab, local, etc.)
- **AND** `installedAt` SHALL be set to the current time

#### Scenario: Write lockfile once

- **WHEN** all `"execute"` actions have been applied
- **THEN** the system SHALL write the lockfile exactly once with all new entries
- **AND** the system SHALL NOT write the lockfile per-skill to avoid concurrent write issues

#### Scenario: Skip no-op actions

- **WHEN** an action has `action: "no-op"`
- **THEN** the system SHALL not copy files or update the lockfile for that action

#### Scenario: No execute actions

- **WHEN** every action in the plan is `"no-op"`
- **THEN** the system SHALL not write any files or update the lockfile

### Requirement: Source to lock entry conversion

The apply module SHALL convert `AddSkillOperation` data into a `SkillLockEntry` for the lockfile.

#### Scenario: Local source lock entry

- **WHEN** the operation's source is `{ source: "local", path: "/abs/path" }`
- **THEN** the lock entry SHALL have `source: "local"` and `path` set to the absolute path

#### Scenario: GitHub source lock entry

- **WHEN** the operation's source is `{ source: "github", owner, repo, ref?, path? }`
- **THEN** the lock entry SHALL preserve `owner`, `repo`, and optional `ref`/`path` fields

#### Scenario: Git tree hash preserved

- **WHEN** the operation's `SkillRef` has `gitTreeSha: Option.some(hash)`
- **THEN** the lock entry SHALL include `gitTreeHash: hash`
