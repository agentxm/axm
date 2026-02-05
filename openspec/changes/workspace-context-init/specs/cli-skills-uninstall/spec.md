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

#### Scenario: Apply plan via applyPlan

- **WHEN** changes are confirmed
- **THEN** the CLI calls `applyPlan(ws, plan, opts)` to remove skill files, update lockfile, and update settings
- **AND** the handler does NOT call legacy `applyDiff()` from `skills/state/apply.ts`
- **AND** the handler does NOT directly call `removeSkillFromAgents`, `updateSettings`, `removeLockEntry`, or `updateLockEntry`
