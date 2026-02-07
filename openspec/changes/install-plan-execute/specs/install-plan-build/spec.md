## ADDED Requirements

### Requirement: Build plan from operations and lockfile

The plan builder SHALL accept `AddSkillOperation[]` and a `Lockfile`, and return a `Plan` with one action per operation.

#### Scenario: New skill not in lockfile

- **WHEN** an `AddSkillOperation` targets a skill name not present in the lockfile
- **THEN** the action SHALL be `"execute"` with `reason: Option.none()`

#### Scenario: Skill already installed from same source

- **WHEN** an `AddSkillOperation` targets a skill name present in the lockfile
- **AND** the lockfile entry's source matches the operation's source type
- **AND** `force` is `false`
- **THEN** the action SHALL be `"no-op"` with `reason: Option.some("already installed")`

#### Scenario: Skill already installed from different source

- **WHEN** an `AddSkillOperation` targets a skill name present in the lockfile
- **AND** the lockfile entry's source differs from the operation's source type
- **AND** `force` is `false`
- **THEN** the action SHALL be `"no-op"` with `reason: Option.some("already installed from different source")`

#### Scenario: Force reinstall

- **WHEN** an `AddSkillOperation` targets a skill name present in the lockfile
- **AND** `force` is `true`
- **THEN** the action SHALL be `"execute"` with `reason: Option.some("force reinstall")`

### Requirement: Plan structure

The plan builder SHALL produce a single job containing all actions.

#### Scenario: Single job with unbounded concurrency

- **WHEN** building a plan from any set of operations
- **THEN** the plan SHALL contain exactly one job with `concurrency: "unbounded"`

#### Scenario: Empty operations produce empty plan

- **WHEN** building a plan from an empty operations array
- **THEN** the plan SHALL contain one job with an empty steps array
