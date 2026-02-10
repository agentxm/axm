## ADDED Requirements

### Requirement: Build plan from operations and lockfile

The uninstall plan builder SHALL accept `ReadonlyArray<UninstallSkillOperation>`, a `Lockfile`, a plan `name`, and a plan `description: Option<string>`, and return a `Plan<UninstallSkillOperation>` with one `PlannedJobStep` per operation.

#### Scenario: Skill present in lockfile

- **WHEN** a `UninstallSkillOperation` targets a skill name present in the lockfile
- **THEN** the step SHALL be a `PlannedJobStep` with `expectedResult: { result: "success", message: "Uninstalled <skill-name>" }`

#### Scenario: Skill not in lockfile

- **WHEN** a `UninstallSkillOperation` targets a skill name not present in the lockfile
- **THEN** the step SHALL be a `PlannedJobStep` with `expectedResult: { result: "no-op", message: "not installed" }`

#### Scenario: Single job with sequential concurrency

- **WHEN** building a plan from any set of operations
- **THEN** the plan SHALL contain exactly one job with `concurrency: 1`

#### Scenario: Empty operations produce empty plan

- **WHEN** building a plan from an empty operations array
- **THEN** the plan SHALL contain one job with an empty steps array

### Requirement: Label derivation from skill name

The plan builder SHALL derive the `label` field for each step from the skill name in the operation.

#### Scenario: Label is skill name

- **WHEN** building a step from a `UninstallSkillOperation`
- **THEN** the step's `label` SHALL be `op.args.skillName`

### Requirement: Plan name and description

The plan builder SHALL use the caller-provided `name` and `description` on the returned plan.

#### Scenario: Plan uses provided name and description

- **WHEN** building a plan
- **THEN** the plan `name` SHALL be the `name` argument and the plan `description` SHALL be the `description` argument passed by the caller
