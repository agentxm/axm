## MODIFIED Requirements

### Requirement: Apply plan orchestration

The plan apply module SHALL iterate over plan jobs and their actions, dispatching each `"execute"` action to the matching executor from a typed registry keyed by operation `_tag`. Actions marked `"no-op"` are skipped.

#### Scenario: Job concurrency respected

- **WHEN** applying a job with `concurrency: "unbounded"`
- **THEN** the system SHALL execute actions concurrently using `Effect.forEach` with `{ concurrency: "unbounded" }`

#### Scenario: Job sequential execution

- **WHEN** applying a job with `concurrency: 1`
- **THEN** the system SHALL execute actions sequentially

#### Scenario: Dispatch execute action to executor registry

- **WHEN** applying an `"execute"` action with `op._tag` value `K`
- **THEN** the system SHALL call `executors[K](action.op)` from the provided executor registry

#### Scenario: Skip no-op action

- **WHEN** an action has `action: "no-op"`
- **THEN** the system SHALL NOT call any executor for that action

#### Scenario: No execute actions

- **WHEN** every action in the plan is `"no-op"`
- **THEN** no executors SHALL be called

#### Scenario: Executor registry is exhaustive

- **WHEN** calling `applyPlan` with a `Plan<Op>` where `Op` is a union type
- **THEN** the `executors` parameter SHALL require a handler for every `_tag` in the `Op` union
- **AND** TypeScript SHALL enforce this at compile time via a mapped type

#### Scenario: Op constrained to tagged type

- **WHEN** defining the `applyPlan` signature
- **THEN** `Op` SHALL be constrained to `{ _tag: string }` (i.e., `Op extends { _tag: string }`)
