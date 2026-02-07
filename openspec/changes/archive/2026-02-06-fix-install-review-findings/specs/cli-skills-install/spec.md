## MODIFIED Requirements

### Requirement: Workspace Pipeline Integration

The install handler SHALL use WorkspaceContext for initialization and workspace access.

#### Scenario: WorkspaceContext provides initialization

- **WHEN** starting installation in uninitialized workspace
- **THEN** yielding WorkspaceContext SHALL trigger automatic initialization
- **AND** the handler SHALL NOT contain separate initialization logic

#### Scenario: No OperationContext dependency

- **WHEN** install handler executes
- **THEN** it SHALL NOT yield or depend on OperationContext
- **AND** interactive behavior SHALL be controlled via WorkspaceContext options

#### Scenario: Load current state via workspace

- **WHEN** starting installation
- **THEN** the CLI SHALL call `loadCurrentState(ws)` from `workspace/load-state.ts`
- **AND** the CLI SHALL NOT call legacy `loadSkillsState()` from `skills/state/load.ts`

#### Scenario: Build ideal state via workspace

- **WHEN** processing install request
- **THEN** the CLI SHALL call `buildIdealState()` from `workspace/ideal-state.ts`
- **AND** the CLI SHALL NOT call legacy `buildIdealForInstall()` from `skills/state/ideal.ts`

#### Scenario: Apply plan via workspace

- **WHEN** changes are confirmed
- **THEN** the CLI SHALL call `applyPlan(ws, plan, opts)` from `workspace/apply.ts`
- **AND** the CLI SHALL NOT call legacy `applyDiff()` from `skills/state/apply.ts`

#### Scenario: Non-interactive flag available in CLI

- **WHEN** a user invokes `axm skills install <source> --non-interactive`
- **THEN** the yargs builder SHALL accept the flag as a boolean option
- **AND** the parsed value SHALL be passed to the handler as `nonInteractive: Option.some(true)`

#### Scenario: Non-interactive flag omitted

- **WHEN** a user invokes `axm skills install <source>` without `--non-interactive`
- **THEN** the parsed value SHALL be `undefined` (no yargs default)
- **AND** the handler SHALL receive `nonInteractive: Option.none()`

#### Scenario: Dry-run flag omitted

- **WHEN** a user invokes `axm skills install <source>` without `--dry-run`
- **THEN** the parsed value SHALL be `undefined` (no yargs default)
- **AND** the handler SHALL receive `dryRun: Option.none()`

#### Scenario: Dry-run flag specified

- **WHEN** a user invokes `axm skills install <source> --dry-run`
- **THEN** the handler SHALL receive `dryRun: Option.some(true)`

## ADDED Requirements

### Requirement: Option-Mapped Flag Boundary Convention

Flags that map to `Option<boolean>` in handler args SHALL NOT have yargs defaults. The yargs builder SHALL omit `default` for these flags so that `undefined` maps to `Option.none()` via `Option.fromNullable`. Flags that map to plain `boolean` in handler args SHALL retain their yargs defaults.

#### Scenario: Boolean flag with default

- **WHEN** a handler arg is typed as `boolean` (e.g., `yes`, `global`, `all`, `force`, `list`)
- **THEN** the yargs builder SHALL specify `default: false`

#### Scenario: Option boolean flag without default

- **WHEN** a handler arg is typed as `Option<boolean>` (e.g., `dryRun`, `nonInteractive`)
- **THEN** the yargs builder SHALL NOT specify a `default` value
- **AND** `Option.fromNullable` at the boundary SHALL produce `Option.none()` when the flag is omitted
