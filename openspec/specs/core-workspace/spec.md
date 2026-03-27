## ADDED Requirements

### Requirement: Core workspace service interface

The `@axm.sh/core/unstable/workspace` module SHALL export a `WorkspaceContextService` interface and `Workspace` Effect service tag. The core interface SHALL NOT include `resolvePlan`. All methods on the core interface SHALL have no CLI-specific service requirements (no `CliRenderer`, `CliPrompt`, or `CliEnvironment` in `R`).

#### Scenario: Core workspace exposes domain methods

- **WHEN** a consumer imports `Workspace` from `@axm.sh/core/unstable/workspace`
- **THEN** the service SHALL provide `applyPlan`, `augmentPlan`, `getLockfileState`, `getConfiguredSources`, `getConfiguredSkills`, `getInstalledSkills`, `getConfiguredProfile`, and other domain query methods
- **AND** the service SHALL NOT provide `resolvePlan`

#### Scenario: Core workspace has no CLI service requirements

- **WHEN** a consumer constructs a `Workspace` layer
- **THEN** the layer SHALL NOT require `CliRenderer`, `CliPrompt`, or `CliEnvironment`
- **AND** the layer SHALL require only `FileSystem`, `Path`, and domain services (e.g., `CliEnvironment` for `nonInteractive` detection is removed)

### Requirement: Plan types exported from core

The `@axm.sh/core/unstable/workspace` module SHALL export all plan types: `Plan`, `ExecutedPlan`, `Job`, `ExecutedJob`, `PlannedJobStep` (union of `ReadyJobStep`, `WarnJobStep`, `ErrorJobStep`), `CompletedJobStep`, and `JobStepResult`.

#### Scenario: Plan types have no CLI imports

- **WHEN** inspecting the plan type definitions
- **THEN** they SHALL import only from `effect/*` and `@axm.sh/core/unstable/*`
- **AND** they SHALL NOT import from any CLI module

### Requirement: applyPlan as a standalone core function

The `@axm.sh/core/unstable/workspace` module SHALL export `applyPlan` as a standalone function. It SHALL accept a `Plan` and return `Effect<ExecutedPlan, never, never>` — no service requirements, no error channel. It SHALL execute step closures respecting inter-job blocking and intra-job continuation. It SHALL never fail — errors from step closures are captured as error results in `CompletedJobStep`.

#### Scenario: applyPlan executes ready steps

- **WHEN** `applyPlan` is called with a plan containing ready steps
- **THEN** each step's `run` closure SHALL be executed
- **AND** successful results SHALL be captured as `{ result: "success", message }` in `CompletedJobStep`

#### Scenario: applyPlan captures step errors as results

- **WHEN** a step's `run` closure fails with `AppError`
- **THEN** the step SHALL produce `{ result: "error", message, error }` in `CompletedJobStep`
- **AND** `applyPlan` itself SHALL NOT fail

#### Scenario: applyPlan blocks subsequent jobs on failure

- **WHEN** any step in job N produces an error result
- **THEN** all steps in jobs N+1, N+2, ... SHALL be promoted to error results without execution

#### Scenario: applyPlan continues within a job on failure

- **WHEN** a step in a job produces an error result
- **THEN** sibling steps in the same job SHALL continue executing

#### Scenario: applyPlan respects job concurrency

- **WHEN** a job has `concurrency: "unbounded"`
- **THEN** its steps SHALL be executed concurrently
- **AND** when a job has `concurrency: 1`, its steps SHALL be executed sequentially

### Requirement: augmentPlan for lockfile reconciliation

The `@axm.sh/core/unstable/workspace` module SHALL export an `augmentPlan` method on the `Workspace` service (or as a standalone function). It SHALL accept a `Plan` and return `Effect<AugmentedPlanResult, AppError>`. The `AugmentedPlanResult` SHALL contain the augmented `Plan` and metadata indicating whether reconciliation was triggered.

#### Scenario: augmentPlan returns plan unchanged when lockfile is ok

- **WHEN** `augmentPlan` is called and the lockfile state is `"ok"`
- **THEN** the returned `AugmentedPlanResult` SHALL have `reconciliationTriggered: false`
- **AND** the plan SHALL be returned unchanged

#### Scenario: augmentPlan prepends recovery steps when lockfile is missing

- **WHEN** `augmentPlan` is called and the lockfile state is `"missing"`
- **THEN** the returned `AugmentedPlanResult` SHALL have `reconciliationTriggered: true` and `reason: "missing"`
- **AND** the plan SHALL have recovery steps prepended as a new first job

#### Scenario: augmentPlan prepends recovery steps when lockfile is invalid

- **WHEN** `augmentPlan` is called and the lockfile state is `"invalid"`
- **THEN** the returned `AugmentedPlanResult` SHALL have `reconciliationTriggered: true` and `reason: "invalid"`
- **AND** the plan SHALL have recovery steps prepended as a new first job

#### Scenario: augmentPlan does not call any renderer

- **WHEN** `augmentPlan` executes
- **THEN** it SHALL NOT depend on or call any rendering service
- **AND** the caller SHALL be responsible for logging reconciliation warnings based on the returned metadata

### Requirement: scanPlanReadiness as a pure function

The `@axm.sh/core/unstable/workspace` module SHALL export a `scanPlanReadiness` pure function. It SHALL accept a `Plan` and return a `PlanReadinessReport` containing error count, warn count, error messages, and warn messages. It SHALL perform no I/O and have no Effect wrapper.

#### Scenario: scanPlanReadiness reports errors

- **WHEN** `scanPlanReadiness` is called with a plan containing 2 error steps
- **THEN** the report SHALL have `errorCount: 2`, `hasErrors: true`
- **AND** `errorMessages` SHALL contain the label and error message of each error step

#### Scenario: scanPlanReadiness reports warnings

- **WHEN** `scanPlanReadiness` is called with a plan containing 1 warn step
- **THEN** the report SHALL have `warnCount: 1`, `hasWarns: true`
- **AND** `warnMessages` SHALL contain the label and warn message of the warn step

#### Scenario: scanPlanReadiness reports clean plan

- **WHEN** `scanPlanReadiness` is called with a plan containing only ready steps
- **THEN** the report SHALL have `errorCount: 0`, `warnCount: 0`, `hasErrors: false`, `hasWarns: false`

### Requirement: resolvePlan as a CLI free function

The CLI SHALL provide `resolvePlan` as a standalone effectful function (not a method on any service). It SHALL compose core's `augmentPlan`, `scanPlanReadiness`, and `applyPlan` with CLI-specific display and confirmation logic. It SHALL yield `Workspace`, `CliRenderer`, `CliPrompt`, and `CliEnvironment` from the Effect environment.

#### Scenario: resolvePlan orchestrates the full plan lifecycle

- **WHEN** `resolvePlan(plan, { yes: false, force: false, preview: false })` is called
- **THEN** it SHALL augment the plan via `augmentPlan`
- **AND** scan readiness via `scanPlanReadiness`
- **AND** apply the plan via `applyPlan`
- **AND** display the executed plan via `displayPlan`

#### Scenario: resolvePlan logs reconciliation warnings

- **WHEN** `augmentPlan` returns `reconciliationTriggered: true`
- **THEN** `resolvePlan` SHALL log a warning via the renderer indicating the lockfile reason

#### Scenario: resolvePlan blocks on errors without force

- **WHEN** `scanPlanReadiness` reports errors and `force` is `false`
- **THEN** `resolvePlan` SHALL display the plan and fail with `PLAN_BLOCKED_BY_ERRORS`

#### Scenario: resolvePlan downgrades errors with force

- **WHEN** `scanPlanReadiness` reports errors and `force` is `true`
- **THEN** `resolvePlan` SHALL log warnings for each error and proceed to apply

#### Scenario: resolvePlan prompts on preview

- **WHEN** `preview` is `true` and `yes` is `false` and the environment is interactive
- **THEN** `resolvePlan` SHALL display the plan and prompt for confirmation before applying

#### Scenario: resolvePlan dry-runs in non-interactive preview without yes

- **WHEN** `preview` is `true` and `yes` is `false` and the environment is non-interactive
- **THEN** `resolvePlan` SHALL display the plan and return an empty `ExecutedPlan` without applying

#### Scenario: resolvePlan call site ergonomics

- **WHEN** a CLI handler calls `resolvePlan`
- **THEN** the call SHALL be `yield* resolvePlan(plan, flags)` — a direct function call, not a method on a yielded service
