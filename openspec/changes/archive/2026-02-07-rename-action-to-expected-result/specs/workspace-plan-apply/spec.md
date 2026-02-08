## MODIFIED Requirements

### Requirement: Apply plan orchestration

The plan apply module SHALL iterate over plan jobs and their steps, promoting each `PlannedJobStep` to a `JobStepResult`. Steps with `expectedResult.result === "success"` are dispatched to the matching handler from a typed registry keyed by operation `name`. All other steps set `actualResult` to their `expectedResult` directly. `applyPlan` SHALL return a new `Plan<Op>` with all steps promoted to `JobStepResult`.

#### Scenario: Job concurrency respected

- **WHEN** applying a job with `concurrency: "unbounded"`
- **THEN** the system SHALL execute steps concurrently using `Effect.forEach` with `{ concurrency: "unbounded" }`

#### Scenario: Job sequential execution

- **WHEN** applying a job with `concurrency: 1`
- **THEN** the system SHALL execute steps sequentially

#### Scenario: Dispatch step expected to succeed

- **WHEN** applying a step with `expectedResult.result === "success"` and `operation.name` value `K`
- **THEN** the system SHALL call `handlers[K](step.operation)` from the provided handler registry
- **AND** the step SHALL be promoted to `JobStepResult` with the handler's return value as `actualResult`

#### Scenario: Non-success step promoted without dispatch

- **WHEN** a step has `expectedResult.result` that is not `"success"`
- **THEN** the system SHALL promote it to `JobStepResult` with `actualResult` set to `expectedResult`
- **AND** the system SHALL NOT call any handler for that step

#### Scenario: No steps expected to succeed

- **WHEN** every step in the plan has `expectedResult.result !== "success"`
- **THEN** no handlers SHALL be called

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
