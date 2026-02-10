## MODIFIED Requirements

### Requirement: Build plan from operations and lockfile

The skills install plan builder SHALL accept `ReadonlyArray<AddSkillOperation>`, a `Lockfile`, a plan `name`, and a plan `description: Option<string>`, and return a `Plan<AddSkillOperation>` with one `PlannedJobStep` per operation. Each step SHALL include `_tag: "PlannedJobStep"` and a full `expectedResult: OperationResult` with a human-readable message.

Object literals returned from the plan builder SHALL rely on the `Plan<AddSkillOperation>` return type for literal type narrowing. Explicit `as const` assertions on string literal values (`_tag`, `result`) SHALL NOT be used when the containing type already constrains the value.

#### Scenario: New skill not in lockfile

- **WHEN** an `AddSkillOperation` targets a skill name not present in the lockfile
- **THEN** the step SHALL be a `PlannedJobStep` with `expectedResult: { result: "success", message: "Installed <skill-name>" }`

#### Scenario: Skill already installed in lockfile

- **WHEN** an `AddSkillOperation` targets a skill name present in the lockfile
- **THEN** the step SHALL be a `PlannedJobStep` with `expectedResult: { result: "no-op", message: "already installed" }`

#### Scenario: Single job with unbounded concurrency

- **WHEN** building a plan from any set of operations
- **THEN** the plan SHALL contain exactly one job with `concurrency: "unbounded"`

#### Scenario: Empty operations produce empty plan

- **WHEN** building a plan from an empty operations array
- **THEN** the plan SHALL contain one job with an empty steps array

#### Scenario: No as-const assertions on literal values

- **WHEN** constructing `PlannedJobStep` objects
- **THEN** string literal fields (`_tag`, `result`) SHALL NOT use `as const` assertions
- **AND** type narrowing SHALL be provided by the return type annotation or `satisfies` operator
