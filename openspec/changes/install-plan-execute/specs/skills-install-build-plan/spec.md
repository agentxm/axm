## ADDED Requirements

### Requirement: Build plan from operations and lockfile

The skills install plan builder SHALL accept `ReadonlyArray<AddSkillOperation>`, a `Lockfile`, a plan `name`, and a plan `description: Option<string>`, and return a `Plan<AddSkillOperation>` with one action per operation.

#### Scenario: New skill not in lockfile

- **WHEN** an `AddSkillOperation` targets a skill name not present in the lockfile
- **THEN** the action SHALL be `"execute"` with `reason: Option.none()`

#### Scenario: Skill already installed in lockfile

- **WHEN** an `AddSkillOperation` targets a skill name present in the lockfile
- **THEN** the action SHALL be `"no-op"` with `reason: Option.some("already installed")`

#### Scenario: Single job with unbounded concurrency

- **WHEN** building a plan from any set of operations
- **THEN** the plan SHALL contain exactly one job with `concurrency: "unbounded"`

#### Scenario: Empty operations produce empty plan

- **WHEN** building a plan from an empty operations array
- **THEN** the plan SHALL contain one job with an empty steps array

### Requirement: Label derivation from skill name

The plan builder SHALL derive the `label` field for each action from the skill name in the operation.

#### Scenario: Label is skill name

- **WHEN** building an action from an `AddSkillOperation`
- **THEN** the action's `label` SHALL be the skill's name (from `op.skill.name`)

### Requirement: Plan name and description

The plan builder SHALL use the caller-provided `name` and `description` on the returned plan. The caller (handler) is responsible for constructing these values.

#### Scenario: Plan uses provided name

- **WHEN** building a plan
- **THEN** the plan `name` SHALL be the `name` argument passed by the caller

#### Scenario: Plan uses provided description

- **WHEN** building a plan
- **THEN** the plan `description` SHALL be the `description` argument passed by the caller
