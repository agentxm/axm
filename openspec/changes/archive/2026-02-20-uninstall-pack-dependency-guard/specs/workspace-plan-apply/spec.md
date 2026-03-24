## MODIFIED Requirements

### Requirement: Apply plan orchestration

The plan apply module SHALL iterate over plan jobs and their steps, promoting each `PlannedJobStep` to a `JobStepResult`. Steps with `readiness.status` of `"ready"` or `"warn"` are dispatched to the matching handler from a typed registry keyed by operation `name`. Steps with `readiness.status` of `"skip"` or `"error"` are promoted without dispatch. `applyPlan` SHALL return a new `Plan<Op>` with all steps promoted to `JobStepResult`.

#### Scenario: Job concurrency respected

- **WHEN** applying a job with `concurrency: "unbounded"`
- **THEN** the system SHALL execute steps concurrently using `Effect.forEach` with `{ concurrency: "unbounded" }`

#### Scenario: Job sequential execution

- **WHEN** applying a job with `concurrency: 1`
- **THEN** the system SHALL execute steps sequentially

#### Scenario: Dispatch step with ready readiness

- **WHEN** applying a step with `readiness.status === "ready"` and `operation.name` value `K`
- **THEN** the system SHALL call `handlers[K](step.operation)` from the provided handler registry
- **AND** the step SHALL be promoted to `JobStepResult` with the handler's return value as `result`

#### Scenario: Dispatch step with warn readiness

- **WHEN** applying a step with `readiness.status === "warn"` and `operation.name` value `K`
- **THEN** the system SHALL call `handlers[K](step.operation)` from the provided handler registry
- **AND** the step SHALL be promoted to `JobStepResult` with the handler's return value as `result`

#### Scenario: Skip step promoted without dispatch

- **WHEN** a step has `readiness.status === "skip"`
- **THEN** the system SHALL promote it to `JobStepResult` with `result: { result: "no-op", message: readiness.message }`
- **AND** the system SHALL NOT call any handler for that step

#### Scenario: Error step promoted without dispatch

- **WHEN** a step has `readiness.status === "error"`
- **THEN** the system SHALL promote it to `JobStepResult` with `result: { result: "error", message: readiness.message }`
- **AND** the system SHALL NOT call any handler for that step

#### Scenario: Handler registry is exhaustive

- **WHEN** calling `applyPlan` with a `Plan<Op>` where `Op` is a union type
- **THEN** the `handlers` parameter SHALL require a handler for every `name` in the `Op` union
- **AND** TypeScript SHALL enforce this at compile time via a mapped type

#### Scenario: Op constrained to named type

- **WHEN** defining the `applyPlan` signature
- **THEN** `Op` SHALL be constrained to `{ name: string }` (i.e., `Op extends { name: string }`)

#### Scenario: applyPlan returns Plan with promoted steps

- **WHEN** `applyPlan` completes
- **THEN** it SHALL return a `Plan<Op>` where every step is a `JobStepResult`
- **AND** the returned plan SHALL preserve the original `name`, `description`, and job structure

#### Scenario: Handler error caught and converted to error result

- **WHEN** a handler fails with an `AppError`
- **THEN** the step SHALL be promoted to `JobStepResult` with `result: { result: "error", message: error.what }`
- **AND** `applyPlan` SHALL NOT fail — errors are captured in results
