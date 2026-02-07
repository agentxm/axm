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

#### Scenario: Build ideal state with operations

- **WHEN** processing install request
- **THEN** the CLI SHALL call `buildIdealState(currentState, operations)` from `workspace/ideal-state.ts`
- **AND** operations SHALL be `AddSkillOperation[]` built from selected skills

#### Scenario: Resolve plan via workspace

- **WHEN** the plan is built
- **THEN** the handler SHALL call `ws.resolvePlan(plan)` from `WorkspaceContextService`
- **AND** the handler SHALL NOT contain inline plan display, confirm, or apply logic
- **AND** the handler SHALL NOT directly call `applyPlan` or `displayPlan`

#### Scenario: Non-interactive flag available in CLI

- **WHEN** a user invokes `axm skills install <source> --non-interactive`
- **THEN** the yargs builder SHALL accept the flag as a boolean option
- **AND** the parsed value SHALL be passed to the handler as `nonInteractive: Option.some(true)`

#### Scenario: Non-interactive flag omitted

- **WHEN** a user invokes `axm skills install <source>` without `--non-interactive`
- **THEN** the parsed value SHALL be `undefined` (no yargs default)
- **AND** the handler SHALL receive `nonInteractive: Option.none()`

#### Scenario: Preview flag available in CLI

- **WHEN** a user invokes `axm skills install <source> --preview`
- **THEN** the yargs builder SHALL accept the flag as a boolean option with `default: false`
- **AND** the parsed value SHALL be passed to workspace options as `preview: true`

#### Scenario: Preview flag omitted

- **WHEN** a user invokes `axm skills install <source>` without `--preview`
- **THEN** the parsed value SHALL default to `false`
- **AND** workspace options SHALL receive `preview: false`

## REMOVED Requirements

### Requirement: Dry-run flag omitted

**Reason**: Replaced by `--preview` flag. The `--dry-run` flag was never fully implemented in the install handler.
**Migration**: Use `--preview` instead of `--dry-run`.

### Requirement: Dry-run flag specified

**Reason**: Replaced by `--preview` flag.
**Migration**: Use `--preview` instead of `--dry-run`.

## MODIFIED Requirements

### Requirement: Option-Mapped Flag Boundary Convention

Flags that map to `Option<boolean>` in handler args SHALL NOT have yargs defaults. The yargs builder SHALL omit `default` for these flags so that `undefined` maps to `Option.none()` via `Option.fromNullable`. Flags that map to plain `boolean` in handler args SHALL retain their yargs defaults.

#### Scenario: Boolean flag with default

- **WHEN** a handler arg is typed as `boolean` (e.g., `yes`, `global`, `all`, `force`, `list`, `preview`)
- **THEN** the yargs builder SHALL specify `default: false`

#### Scenario: Option boolean flag without default

- **WHEN** a handler arg is typed as `Option<boolean>` (e.g., `nonInteractive`)
- **THEN** the yargs builder SHALL NOT specify a `default` value
- **AND** `Option.fromNullable` at the boundary SHALL produce `Option.none()` when the flag is omitted
