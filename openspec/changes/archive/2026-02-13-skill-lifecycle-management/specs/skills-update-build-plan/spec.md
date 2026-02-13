## MODIFIED Requirements

### Requirement: Build update plan from operations and lockfile

The update plan builder SHALL accept `ReadonlyArray<InstallSkillOperation | UninstallSkillOperation>`, a `Lockfile`, a plan `name`, and a plan `description: Option<string>`, and return a `Plan<InstallSkillOperation | UninstallSkillOperation>` with one `PlannedJobStep` per operation. Each step SHALL include `_tag: "PlannedJobStep"` and a full `expectedResult: OperationResult` with a human-readable message.

#### Scenario: Skill with version change (git hosting source)

- **WHEN** an `InstallSkillOperation` targets a skill present in the lockfile
- **AND** the operation's `gitTreeSha` differs from the lockfile entry's `gitTreeHash`
- **THEN** the step SHALL have `expectedResult: { result: "success", message: "Updated <skill-name>" }`

#### Scenario: Skill with no version change (git hosting source)

- **WHEN** an `InstallSkillOperation` targets a skill present in the lockfile
- **AND** the operation's `gitTreeSha` equals the lockfile entry's `gitTreeHash`
- **AND** `force` is `false`
- **THEN** the step SHALL have `expectedResult: { result: "no-op", message: "already up to date" }`

#### Scenario: Skill with version change (registry source)

- **WHEN** an `InstallSkillOperation` targets a skill present in the lockfile
- **AND** the lockfile entry has `type: "registry"`
- **AND** the operation's `version` differs from the lockfile entry's `resolvedVersion`
- **THEN** the step SHALL have `expectedResult: { result: "success", message: "Updated <skill-name>" }`

#### Scenario: Skill with no version change (registry source)

- **WHEN** an `InstallSkillOperation` targets a skill present in the lockfile
- **AND** the lockfile entry has `type: "registry"`
- **AND** the operation's `version` equals the lockfile entry's `resolvedVersion`
- **AND** `force` is `false`
- **THEN** the step SHALL have `expectedResult: { result: "no-op", message: "already up to date" }`

#### Scenario: Local source always treated as update

- **WHEN** an `InstallSkillOperation` targets a skill present in the lockfile
- **AND** the lockfile entry has `type: "local"`
- **THEN** the step SHALL have `expectedResult: { result: "success", message: "Updated <skill-name>" }`

#### Scenario: Git source without tree hash available

- **WHEN** an `InstallSkillOperation` targets a skill present in the lockfile
- **AND** the operation's `gitTreeSha` is `Option.none()` or the lockfile entry has no `gitTreeHash`
- **THEN** the step SHALL have `expectedResult: { result: "success", message: "Updated <skill-name>" }`
- **AND** the handler SHALL treat missing hash as "unknown version, update to be safe"

#### Scenario: Force flag bypasses version comparison

- **WHEN** `force` is `true` on the operation
- **THEN** the step SHALL have `expectedResult: { result: "success", message: "Updated <skill-name>" }` regardless of version comparison

#### Scenario: Single job with unbounded concurrency

- **WHEN** building a plan from any set of operations
- **THEN** the plan SHALL contain exactly one job with `concurrency: "unbounded"`

#### Scenario: Empty operations produce empty plan

- **WHEN** building a plan from an empty operations array
- **THEN** the plan SHALL contain one job with an empty steps array

#### Scenario: UninstallSkillOperation step for rename cleanup

- **WHEN** an `UninstallSkillOperation` is included in the operations (from rename detection)
- **THEN** the step SHALL have `expectedResult: { result: "success", message: "Removed <skill-name> (renamed)" }`
- **AND** the step's `label` SHALL be the old skill name

### Requirement: Label derivation from skill name

The update plan builder SHALL derive the `label` field for each step from the skill name in the operation.

#### Scenario: Label from InstallSkillOperation

- **WHEN** building a step from an `InstallSkillOperation`
- **THEN** the step's `label` SHALL be the skill's name (from `op.args.skill.name`)

#### Scenario: Label from UninstallSkillOperation

- **WHEN** building a step from an `UninstallSkillOperation`
- **THEN** the step's `label` SHALL be the skill's name (from `op.args.skillName`)

### Requirement: Plan name and description

The update plan builder SHALL use the caller-provided `name` and `description` on the returned plan.

#### Scenario: Plan uses provided name

- **WHEN** building a plan
- **THEN** the plan `name` SHALL be the `name` argument passed by the caller

#### Scenario: Plan uses provided description

- **WHEN** building a plan
- **THEN** the plan `description` SHALL be the `description` argument passed by the caller

### Requirement: Version comparison logic

The plan builder SHALL determine whether an update is available by comparing the operation's resolved metadata against the lockfile entry, using source-type-specific comparison.

#### Scenario: Git hosting sources compared by gitTreeHash

- **WHEN** the lockfile entry type is `"github"`, `"gitlab"`, `"bitbucket"`, `"azurerepos"`, or `"git"`
- **THEN** comparison SHALL use `gitTreeHash` (lockfile) vs `gitTreeSha` (operation)

#### Scenario: Registry sources compared by resolvedVersion

- **WHEN** the lockfile entry type is `"registry"`
- **THEN** comparison SHALL use `resolvedVersion` (lockfile) vs `version` (operation)

#### Scenario: Local sources skip comparison

- **WHEN** the lockfile entry type is `"local"`
- **THEN** no version comparison SHALL occur and the skill SHALL always be treated as needing update
