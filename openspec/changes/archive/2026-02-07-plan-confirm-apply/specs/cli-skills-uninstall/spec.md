## MODIFIED Requirements

### Requirement: State-Based Uninstall

The CLI SHALL use WorkspaceContext for initialization and the workspace reconciliation pattern for uninstallation.

#### Scenario: WorkspaceContext provides initialization

- **WHEN** starting uninstallation in uninitialized workspace
- **THEN** yielding WorkspaceContext SHALL trigger automatic initialization
- **AND** the handler SHALL NOT contain separate initialization logic

#### Scenario: No OperationContext dependency

- **WHEN** uninstall handler executes
- **THEN** it SHALL NOT yield or depend on OperationContext
- **AND** interactive behavior SHALL be controlled via WorkspaceContext options

#### Scenario: Load current state

- **WHEN** starting uninstallation
- **THEN** the CLI calls `loadCurrentState(ws)` from `workspace/load-state.ts`

#### Scenario: Build ideal state

- **WHEN** processing uninstall request
- **THEN** the CLI calls `buildIdealState()` from `workspace/ideal-state.ts` with target skill removed (from specified agents or all)

#### Scenario: Compute plan

- **WHEN** current and ideal states are ready
- **THEN** the CLI calls `buildPlan()` from `workspace/` to compute the plan

#### Scenario: Resolve plan via workspace

- **WHEN** the plan is built
- **THEN** the handler SHALL call `ws.resolvePlan(plan)` from `WorkspaceContextService`
- **AND** the handler SHALL NOT contain inline plan display, confirm, or apply logic
- **AND** the handler SHALL NOT directly call `applyPlan` or `displayPlan`

## ADDED Requirements

### Requirement: Preview flag in uninstall CLI

The uninstall command SHALL support `--preview` to display the plan without applying.

#### Scenario: Preview flag available

- **WHEN** a user invokes `axm skills uninstall <skill> --preview`
- **THEN** the yargs builder SHALL accept the flag as a boolean option with `default: false`
- **AND** the parsed value SHALL be passed to workspace options as `preview: true`

#### Scenario: Preview flag omitted

- **WHEN** a user invokes `axm skills uninstall <skill>` without `--preview`
- **THEN** workspace options SHALL receive `preview: false`

### Requirement: Non-interactive flag in uninstall CLI

The uninstall command SHALL support `--non-interactive` to disable prompts.

#### Scenario: Non-interactive flag available

- **WHEN** a user invokes `axm skills uninstall <skill> --non-interactive`
- **THEN** the yargs builder SHALL accept the flag as a boolean option (no default)
- **AND** the parsed value SHALL be passed to workspace options as `nonInteractive: true`

#### Scenario: Non-interactive flag omitted

- **WHEN** a user invokes `axm skills uninstall <skill>` without `--non-interactive`
- **THEN** workspace options SHALL receive `nonInteractive: false`

## REMOVED Requirements

### Requirement: dry-run flag in uninstall CLI

**Reason**: Replaced by `--preview` flag with clearer semantics. The `--dry-run` flag is removed from the uninstall command.
**Migration**: Use `--preview` instead of `--dry-run`.
