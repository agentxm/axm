## MODIFIED Requirements

### Requirement: Extension-agnostic plan types

The workspace module SHALL define generic plan types parameterized over the operation type, enabling reuse across extension types (skills, commands, mcp-servers, rules) and operation types (install, uninstall).

#### Scenario: OperationResult type

- **WHEN** defining the `OperationResult` type
- **THEN** it SHALL have fields `result: "no-op" | "success" | "error"` and `message: string`
- **AND** it SHALL be defined in `plan.ts` (not `apply-plan.ts`)

#### Scenario: Readiness type

- **WHEN** defining the `Readiness` type
- **THEN** it SHALL be a discriminated union on `status` with four variants:
  - `{ status: "ready"; message: Option<string> }` — step will be executed
  - `{ status: "skip"; message: string }` — step won't be executed (informational no-op)
  - `{ status: "warn"; message: string }` — step will execute after user confirms warnings
  - `{ status: "error"; message: string }` — step cannot execute, blocks the entire plan
- **AND** it SHALL be exported from `plan.ts` and re-exported from `workspace/index.ts`

#### Scenario: JobStep is a discriminated union

- **WHEN** defining the `JobStep` type
- **THEN** it SHALL be `JobStep<Op> = PlannedJobStep<Op> | JobStepResult<Op>`
- **AND** the discriminant field SHALL be `_tag`

#### Scenario: PlannedJobStep carries readiness

- **WHEN** defining the `PlannedJobStep` type
- **THEN** it SHALL have fields: `_tag: "PlannedJobStep"`, `operation: Op`, `readiness: Readiness`, and `label: string`
- **AND** it SHALL NOT have an `expectedResult` field
- **AND** it SHALL NOT have an `actualResult` or `result` field

#### Scenario: JobStepResult carries result

- **WHEN** defining the `JobStepResult` type
- **THEN** it SHALL have fields: `_tag: "JobStepResult"`, `operation: Op`, `result: OperationResult`, and `label: string`
- **AND** it SHALL NOT have an `expectedResult` field
- **AND** it SHALL NOT have an `actualResult` field

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

The plan display module SHALL render a human-readable summary of any `Plan<Op>` via the Log service, without knowledge of the specific operation type. It SHALL handle both unapplied plans (containing `PlannedJobStep`) and applied plans (containing `JobStepResult`), branching display logic on `_tag`.

#### Scenario: Plan name as heading

- **WHEN** displaying a plan
- **THEN** the display SHALL use `plan.name` as the heading

#### Scenario: Plan description shown when present

- **WHEN** displaying a plan with `description: Option.some(text)`
- **THEN** the display SHALL show the description text below the heading

#### Scenario: Determine rendering source from step variant

- **WHEN** rendering a step
- **THEN** for `PlannedJobStep`, the display SHALL render based on `readiness`
- **AND** for `JobStepResult`, the display SHALL render based on `result`

#### Scenario: Show ready steps for unapplied plan

- **WHEN** the plan contains `PlannedJobStep` steps with `readiness.status === "ready"` and no message
- **THEN** the display SHALL list each step's `label` with a pending indicator (`+ label`) via `log.success`

#### Scenario: Show ready steps with message for unapplied plan

- **WHEN** the plan contains `PlannedJobStep` steps with `readiness.status === "ready"` and `message: Option.some(text)`
- **THEN** the display SHALL list each step as `+ label (text)` via `log.success`

#### Scenario: Show skip steps for unapplied plan

- **WHEN** the plan contains `PlannedJobStep` steps with `readiness.status === "skip"`
- **THEN** the display SHALL list each step as `- label (message)` via `log.warn`

#### Scenario: Show warn steps for unapplied plan

- **WHEN** the plan contains `PlannedJobStep` steps with `readiness.status === "warn"`
- **THEN** the display SHALL list each step as `⚠ label (message)` via `log.warn`

#### Scenario: Show error steps for unapplied plan

- **WHEN** the plan contains `PlannedJobStep` steps with `readiness.status === "error"`
- **THEN** the display SHALL list each step as `✗ label (message)` via `log.error`

#### Scenario: Show success items for applied plan

- **WHEN** the plan contains `JobStepResult` steps with `result.result === "success"`
- **THEN** the display SHALL list each step's `label` with a success indicator (checkmark) via `log.success`

#### Scenario: Show no-op items for applied plan

- **WHEN** the plan contains `JobStepResult` steps with `result.result === "no-op"`
- **THEN** the display SHALL list the step as `- label (message)` via `log.warn`

#### Scenario: Show error items for applied plan

- **WHEN** the plan contains `JobStepResult` steps with `result.result === "error"`
- **THEN** the display SHALL list the step as `✗ label (message)` via `log.error`

#### Scenario: Show summary counts for unapplied plan

- **WHEN** displaying an unapplied plan
- **THEN** the display SHALL show a summary line with counts by readiness status
- **AND** the summary SHALL use future tense (e.g., "N to apply, M to skip")
- **AND** zero counts SHALL be omitted from the summary
- **AND** error and warning counts SHALL be included when present

#### Scenario: Show summary counts for applied plan

- **WHEN** displaying an applied plan
- **THEN** the display SHALL show a summary line with counts by result
- **AND** the summary SHALL use past tense (e.g., "N applied, M skipped, P failed")
- **AND** zero counts SHALL be omitted from the summary
