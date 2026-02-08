## Requirements

### Requirement: Extension-agnostic plan types

The workspace module SHALL define generic plan types parameterized over the operation type, enabling reuse across extension types (skills, commands, mcp-servers, rules) and operation types (install, uninstall).

#### Scenario: OperationResult type

- **WHEN** defining the `OperationResult` type
- **THEN** it SHALL have fields `result: "no-op" | "success" | "error"` and `message: string`
- **AND** it SHALL be defined in `plan.ts` (not `apply-plan.ts`)

#### Scenario: JobStep is a discriminated union

- **WHEN** defining the `JobStep` type
- **THEN** it SHALL be `JobStep<Op> = PlannedJobStep<Op> | JobStepResult<Op>`
- **AND** the discriminant field SHALL be `_tag`

#### Scenario: PlannedJobStep carries expected result

- **WHEN** defining the `PlannedJobStep` type
- **THEN** it SHALL have fields: `_tag: "PlannedJobStep"`, `operation: Op`, `expectedResult: OperationResult`, and `label: string`
- **AND** it SHALL NOT have a `reason` field (reason is part of `expectedResult.message`)
- **AND** it SHALL NOT have an `actualResult` field

#### Scenario: JobStepResult carries both expected and actual result

- **WHEN** defining the `JobStepResult` type
- **THEN** it SHALL have fields: `_tag: "JobStepResult"`, `operation: Op`, `expectedResult: OperationResult`, `actualResult: OperationResult`, and `label: string`

#### Scenario: Job type is generic

- **WHEN** defining the `Job` type
- **THEN** it SHALL be `Job<Op>` containing `steps: ReadonlyArray<JobStep<Op>>` and `concurrency: "unbounded" | 1`

#### Scenario: Plan type is generic

- **WHEN** defining the `Plan` type
- **THEN** it SHALL be `Plan<Op>` containing `name: string`, `description: Option<string>`, and `jobs: ReadonlyArray<Job<Op>>`

#### Scenario: Label enables extension-agnostic rendering

- **WHEN** display or apply modules access a step
- **THEN** they SHALL use `step.label` for human-readable identification
- **AND** they SHALL NOT inspect `step.operation` to derive display text

### Requirement: Display plan summary

The plan display module SHALL render a human-readable summary of any `Plan<Op>` via Clack, without knowledge of the specific operation type. It SHALL handle both unapplied plans (containing `PlannedJobStep`) and applied plans (containing `JobStepResult`).

#### Scenario: Plan name as heading

- **WHEN** displaying a plan
- **THEN** the display SHALL use `plan.name` as the heading

#### Scenario: Plan description shown when present

- **WHEN** displaying a plan with `description: Option.some(text)`
- **THEN** the display SHALL show the description text below the heading

#### Scenario: Determine result from step variant

- **WHEN** rendering a step
- **THEN** for `PlannedJobStep`, the display SHALL use `expectedResult`
- **AND** for `JobStepResult`, the display SHALL use `actualResult`

#### Scenario: Show success items for unapplied plan

- **WHEN** the plan contains `PlannedJobStep` steps with `expectedResult.result === "success"`
- **THEN** the display SHALL list each step's `label` with a pending indicator (e.g., `+ label`)

#### Scenario: Show success items for applied plan

- **WHEN** the plan contains `JobStepResult` steps with `actualResult.result === "success"`
- **THEN** the display SHALL list each step's `label` with a success indicator (e.g., checkmark)

#### Scenario: Show no-op items with message

- **WHEN** a step has result `"no-op"`
- **THEN** the display SHALL list the step's `label` with the result's `message` as the reason

#### Scenario: Show error items with message

- **WHEN** a step has result `"error"`
- **THEN** the display SHALL list the step's `label` with the result's `message` as the reason

#### Scenario: Show summary counts

- **WHEN** displaying a plan
- **THEN** the display SHALL show a summary line with success and skip counts
- **AND** for unapplied plans, the summary SHALL use future tense (e.g., "N to install, M to skip")
- **AND** for applied plans, the summary SHALL use past tense (e.g., "N installed, M skipped")

#### Scenario: All no-ops

- **WHEN** every step in the plan has result `"no-op"`
- **THEN** the display SHALL show the skipped items and summary
- **AND** the summary SHALL indicate nothing to execute

### Requirement: Apply plan orchestration

The plan apply module SHALL iterate over plan jobs and their steps, promoting each `PlannedJobStep` to a `JobStepResult`. Steps with `expectedResult.result === "success"` are dispatched to handlers; all other steps set `actualResult` to their `expectedResult` directly. `applyPlan` SHALL return a new `Plan<Op>` with all steps promoted to `JobStepResult`.

#### Scenario: Job concurrency respected

- **WHEN** applying a job with `concurrency: "unbounded"`
- **THEN** the system SHALL execute steps concurrently using `Effect.forEach` with `{ concurrency: "unbounded" }`

#### Scenario: Job sequential execution

- **WHEN** applying a job with `concurrency: 1`
- **THEN** the system SHALL execute steps sequentially

#### Scenario: Dispatch step expected to succeed

- **WHEN** applying a step with `expectedResult.result === "success"`
- **THEN** the system SHALL dispatch it to the matching handler
- **AND** the handler SHALL return an `OperationResult`
- **AND** the step SHALL be promoted to `JobStepResult` with the handler's return value as `actualResult`

#### Scenario: Non-success step promoted with expectedResult as actualResult

- **WHEN** a step has `expectedResult.result` that is not `"success"`
- **THEN** the system SHALL promote it to `JobStepResult` with `actualResult` set to `expectedResult`
- **AND** the system SHALL NOT dispatch any handler for that step

#### Scenario: applyPlan returns Plan with promoted steps

- **WHEN** `applyPlan` completes
- **THEN** it SHALL return a `Plan<Op>` where every step is a `JobStepResult`
- **AND** the returned plan SHALL preserve the original `name`, `description`, and job structure

#### Scenario: No steps expected to succeed

- **WHEN** every step in the plan has `expectedResult.result !== "success"`
- **THEN** the system SHALL NOT dispatch any handlers
- **AND** each step SHALL be promoted to `JobStepResult` with `actualResult` equal to `expectedResult`
