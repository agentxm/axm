# workspace-plan Specification

## Purpose

Extension-agnostic plan types and orchestration for workspace operations.

## Requirements

### Requirement: Extension-agnostic plan types

The workspace module SHALL define generic plan types parameterized over the operation type, enabling reuse across extension types (skills, commands, mcp-servers, rules) and operation types (install, uninstall).

#### Scenario: Action type is generic

- **WHEN** defining the `Action` type
- **THEN** it SHALL be `Action<Op>` with fields: `op: Op`, `action: "execute" | "no-op" | "error"`, `reason: Option<string>`, and `label: string`

#### Scenario: Job type is generic

- **WHEN** defining the `Job` type
- **THEN** it SHALL be `Job<Op>` containing `steps: ReadonlyArray<Action<Op>>` and `concurrency: "unbounded" | 1`

#### Scenario: Plan type is generic

- **WHEN** defining the `Plan` type
- **THEN** it SHALL be `Plan<Op>` containing `name: string`, `description: Option<string>`, and `jobs: ReadonlyArray<Job<Op>>`

#### Scenario: Label enables extension-agnostic rendering

- **WHEN** display or apply modules access an action
- **THEN** they SHALL use `action.label` for human-readable output
- **AND** they SHALL NOT inspect `action.op` to derive display text

### Requirement: Display plan summary

The plan display module SHALL render a human-readable summary of any `Plan<Op>` via Clack, without knowledge of the specific operation type.

#### Scenario: Plan name as heading

- **WHEN** displaying a plan
- **THEN** the display SHALL use `plan.name` as the heading

#### Scenario: Plan description shown when present

- **WHEN** displaying a plan with `description: Option.some(text)`
- **THEN** the display SHALL show the description text below the heading

#### Scenario: Show items to execute

- **WHEN** the plan contains actions with `action: "execute"`
- **THEN** the display SHALL list each action's `label` under the heading

#### Scenario: Show skipped items

- **WHEN** a job contains actions with `action: "no-op"`
- **THEN** the display SHALL list each action's `label` with its `reason` under a "skip" heading

#### Scenario: Show summary counts

- **WHEN** displaying a plan
- **THEN** the display SHALL show a summary line with execute and skip counts

#### Scenario: All no-ops

- **WHEN** every action in the plan is `"no-op"`
- **THEN** the display SHALL show the skipped items and summary
- **AND** the summary SHALL indicate nothing to execute

### Requirement: Apply plan orchestration

The plan apply module SHALL iterate over plan jobs and their actions, using Effect concurrency based on each job's `concurrency` setting. Actions marked `"execute"` are applied; `"no-op"` actions are skipped. In this change, apply is a stub that logs results.

#### Scenario: Job concurrency respected

- **WHEN** applying a job with `concurrency: "unbounded"`
- **THEN** the system SHALL execute actions concurrently using `Effect.forEach` with `{ concurrency: "unbounded" }`

#### Scenario: Job sequential execution

- **WHEN** applying a job with `concurrency: 1`
- **THEN** the system SHALL execute actions sequentially

#### Scenario: Log executed action

- **WHEN** applying an `"execute"` action
- **THEN** the system SHALL log a success message including the action's `label`

#### Scenario: Skip no-op action

- **WHEN** an action has `action: "no-op"`
- **THEN** the system SHALL NOT log a success message for that action

#### Scenario: No execute actions

- **WHEN** every action in the plan is `"no-op"`
- **THEN** the system SHALL NOT log any success messages

#### Scenario: Stub-only — no side effects

- **WHEN** applying any plan in this change
- **THEN** the system SHALL NOT copy files, write to the lockfile, or perform any file system mutations
